import { leerConfigIA } from '../rutas/admin-ia.js';
import { db, esquema } from '../db/cliente.js';
import { eq, like, desc, sql, and, ne } from 'drizzle-orm';
import { estadoAtencionVentas, registrarMensajeVentas, enColaVentas } from './atencion-ventas.js';
import { avanzarPedidoVentas } from './flujo-pedido-ventas.js';
import { aProducto } from '../db/mapeo.js';
import { enviarImagenWhatsApp } from './baileys-client.js';
import { config } from '../config.js';
import {
  obtenerZonasVentaActivas,
  detectarZonaEnMensaje
} from './gestor-pedidos.js';
import { obtenerConfiguracion } from '../servicios/configuracion.js';
import { enviarMensajeWhatsApp } from './baileys-client.js';
import { enviarNotificacionPedido } from '../servicios/notificaciones-push.js';

const { productos, conversacionesWhatsapp, mensajesWhatsapp } = esquema;

// Almacenar historial de conversaciones en memoria (cache temporal)
// Estructura: { numeroTelefono: [{ role: 'user'|'assistant', content: string }] }
const historialConversaciones = new Map<string, Array<{ role: 'user' | 'assistant', content: string, productos?: string[] }>>();

/**
 * Obtener o crear conversación en la base de datos
 */
async function obtenerOCrearConversacion(telefono: string, nombreCliente?: string, jid?: string, transporte = 'baileys'): Promise<string> {
  // Buscar conversación existente activa
  const conversacionesExistentes = await db
    .select()
    .from(conversacionesWhatsapp)
    .where(eq(conversacionesWhatsapp.telefono, telefono))
    .limit(1);

  const ahora = new Date().toISOString();

  if (conversacionesExistentes.length > 0) {
    const conversacion = conversacionesExistentes[0];

    // Actualizar timestamp y nombre si viene disponible
    await db
      .update(conversacionesWhatsapp)
      .set({
        actualizadoEn: ahora,
        jid,
        transporte,
        ...(nombreCliente && !conversacion.nombreCliente && { nombreCliente })
      })
      .where(eq(conversacionesWhatsapp.id, conversacion.id));

    return conversacion.id;
  }

  // Crear nueva conversación
  const conversacionId = `conv_${telefono.replace(/\D/g, '')}_${Date.now()}`;
  await db.insert(conversacionesWhatsapp).values({
    id: conversacionId,
    telefono,
    jid,
    transporte,
    nombreCliente: nombreCliente || null,
    estado: 'activa',
    ultimoMensaje: null,
    creadoEn: ahora,
    actualizadoEn: ahora
  });

  return conversacionId;
}

/**
 * Guardar mensaje en la base de datos
 */
async function guardarMensaje(
  conversacionId: string,
  rol: 'user' | 'assistant',
  contenido: string,
  metadata?: { productos?: string[] }
): Promise<void> {
  const mensajeId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(mensajesWhatsapp).values({
    id: mensajeId,
    conversacionId,
    rol,
    contenido,
    metadata: metadata ? JSON.stringify(metadata) : null,
    creadoEn: new Date().toISOString()
  });

  // Actualizar último mensaje en la conversación
  await db
    .update(conversacionesWhatsapp)
    .set({
      ultimoMensaje: contenido.substring(0, 100),
      actualizadoEn: new Date().toISOString()
    })
    .where(eq(conversacionesWhatsapp.id, conversacionId));
}

/**
 * Cargar historial desde la base de datos (últimos N mensajes)
 */
async function cargarHistorialDesdeDB(conversacionId: string, limite: number = 10, excluirId?: string): Promise<Array<{ role: 'user' | 'assistant', content: string, productos?: string[] }>> {
  const mensajes = await db
    .select()
    .from(mensajesWhatsapp)
    .where(and(eq(mensajesWhatsapp.conversacionId, conversacionId), excluirId ? ne(mensajesWhatsapp.id, excluirId) : undefined))
    .orderBy(desc(mensajesWhatsapp.creadoEn))
    .limit(limite);

  return mensajes.reverse().map(m => ({
    role: m.rol as 'user' | 'assistant',
    content: m.contenido,
    productos: m.metadata ? JSON.parse(m.metadata).productos : undefined
  }));
}



// Almacenar imágenes ya enviadas por cliente
// Estructura: { numeroTelefono: Set<nombreProducto> }
const imagenesEnviadas = new Map<string, Set<string>>();

/**
 * Obtener historial de conversaciones para el admin
 */
export function obtenerHistorialConversaciones() {
  const conversaciones = Array.from(historialConversaciones.entries()).map(([telefono, mensajes]) => ({
    telefono,
    mensajes,
    ultimoMensaje: mensajes.length > 0 ? mensajes[mensajes.length - 1].content : '',
    cantidadMensajes: mensajes.length
  }));

  // Ordenar por cantidad de mensajes (más activos primero)
  conversaciones.sort((a, b) => b.cantidadMensajes - a.cantidadMensajes);

  return conversaciones.slice(0, 20); // Retornar máximo 20 conversaciones
}

// Almacenar logs de actividad de mensajes procesados
interface LogMensaje {
  id: string;
  telefono: string;
  nombreContacto?: string;
  mensaje: string;
  respuesta: string;
  timestamp: number;
  exitoso: boolean;
}

const logsActividad: LogMensaje[] = [];
const MAX_LOGS = 100; // Mantener solo los últimos 100 logs

// Estadísticas diarias
interface Estadisticas {
  mensajesRecibidos: number;
  mensajesEnviados: number;
  mensajesExitosos: number;
  mensajesError: number;
  fecha: string; // YYYY-MM-DD
}

let estadisticasHoy: Estadisticas = {
  mensajesRecibidos: 0,
  mensajesEnviados: 0,
  mensajesExitosos: 0,
  mensajesError: 0,
  fecha: new Date().toISOString().split('T')[0]
};

// Resetear estadísticas a medianoche
setInterval(() => {
  const fechaActual = new Date().toISOString().split('T')[0];
  if (estadisticasHoy.fecha !== fechaActual) {
    estadisticasHoy = {
      mensajesRecibidos: 0,
      mensajesEnviados: 0,
      mensajesExitosos: 0,
      mensajesError: 0,
      fecha: fechaActual
    };
  }
}, 60000); // Verificar cada minuto

// Contador de productos mencionados
interface ProductoEstadistica {
  nombre: string;
  menciones: number;
}

const productosConsultados = new Map<string, number>();

/**
 * Registrar mención de productos
 */
function registrarMencionProductos(productos: string[]) {
  for (const producto of productos) {
    const count = productosConsultados.get(producto) || 0;
    productosConsultados.set(producto, count + 1);
  }
}

/**
 * Obtener productos más consultados
 */
export function obtenerProductosMasConsultados(limit: number = 10): ProductoEstadistica[] {
  const productos = Array.from(productosConsultados.entries()).map(([nombre, menciones]) => ({
    nombre,
    menciones
  }));

  // Ordenar por menciones descendente
  productos.sort((a, b) => b.menciones - a.menciones);

  return productos.slice(0, limit);
}

/**
 * Agregar log de actividad
 */
function agregarLog(telefono: string, mensaje: string, respuesta: string, exitoso: boolean) {
  const log: LogMensaje = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    telefono,
    mensaje: mensaje.substring(0, 100), // Limitar tamaño
    respuesta: respuesta.substring(0, 200),
    timestamp: Date.now(),
    exitoso
  };

  logsActividad.unshift(log); // Agregar al inicio

  // Mantener solo los últimos MAX_LOGS
  if (logsActividad.length > MAX_LOGS) {
    logsActividad.pop();
  }

  // Actualizar estadísticas
  estadisticasHoy.mensajesRecibidos++;
  estadisticasHoy.mensajesEnviados++;
  if (exitoso) {
    estadisticasHoy.mensajesExitosos++;
  } else {
    estadisticasHoy.mensajesError++;
  }
}

/**
 * Obtener logs de actividad
 */
export function obtenerLogsActividad(limit: number = 50): LogMensaje[] {
  return logsActividad.slice(0, limit);
}

/**
 * Obtener estadísticas del día
 */
export function obtenerEstadisticas(): Estadisticas {
  return { ...estadisticasHoy };
}

// Limpiar conversaciones antiguas cada hora
setInterval(() => {
  const ahora = Date.now();
  // Limpiar conversaciones con más de 2 horas de inactividad
  // Por ahora solo mantenemos el historial en memoria
}, 3600000);

/**
 * Obtiene el catálogo de productos visible (optimizado para reducir tokens)
 */
async function obtenerCatalogo(): Promise<string> {
  try {
    const productosVisibles = await db
      .select()
      .from(productos)
      .where(eq(productos.visible, true));

    console.log(`📦 Productos encontrados: ${productosVisibles.length}`);

    if (productosVisibles.length === 0) {
      return 'No hay productos disponibles en este momento.';
    }

    // Formatear productos de forma compacta (reducir tokens)
    const listadoProductos = productosVisibles.map((p, index) => {
      const prod = aProducto(p);
      console.log(`Producto ${index + 1}: ${prod.nombre} - Contado: $${prod.precios.contado} - Crédito: $${prod.precios.credito}`);

      // Formato ultra-compacto: solo info esencial
      return `${index + 1}. ${prod.nombre} | ${prod.categoria || 'General'} | Contado: $${prod.precios.contado.toLocaleString()} | Crédito: $${prod.precios.credito.toLocaleString()} | Inicial: $${prod.precios.inicial.toLocaleString()} | Semanal: $${prod.precios.pagoSemanal.toLocaleString()}${prod.esNuevo ? ' 🆕' : ''}${prod.enPromocion ? ' 🔥' : ''}`;
    }).join('\n');

    const catalogoCompleto = `PRODUCTOS:\n${listadoProductos}`;
    console.log('📋 Catálogo generado, caracteres:', catalogoCompleto.length);

    return catalogoCompleto;
  } catch (error) {
    console.error('Error al obtener catálogo:', error);
    return 'Error al cargar el catálogo de productos.';
  }
}

/**
 * Filtra productos relevantes según el mensaje del cliente (optimización de tokens)
 */
async function obtenerProductosRelevantes(mensaje: string): Promise<string> {
  try {
    const mensajeLower = mensaje.toLowerCase();

    // Palabras clave comunes por categoría
    const categorias: Record<string, string[]> = {
      'cocina': ['nevera', 'estufa', 'cocina', 'refrigerador', 'horno', 'microondas'],
      'sala': ['sofa', 'sofá', 'mueble', 'sala', 'poltron', 'sillon'],
      'comedor': ['comedor', 'mesa', 'silla', 'sillas'],
      'habitacion': ['cama', 'colchon', 'colchón', 'closet', 'nochero', 'habitacion', 'dormitorio'],
      'lavanderia': ['lavadora', 'secadora', 'lavanderia'],
      'electrodomestico': ['televisor', 'tv', 'ventilador', 'aire', 'licuadora', 'plancha']
    };

    // Detectar categoría mencionada
    let categoriaDetectada = '';
    for (const [categoria, palabras] of Object.entries(categorias)) {
      if (palabras.some(palabra => mensajeLower.includes(palabra))) {
        categoriaDetectada = categoria;
        break;
      }
    }

    const productosVisibles = await db
      .select()
      .from(productos)
      .where(eq(productos.visible, true));

    // Si detectamos categoría, filtrar; sino, enviar todos
    let productosFiltrados = productosVisibles;
    if (categoriaDetectada) {
      productosFiltrados = productosVisibles.filter(p => {
        const prod = aProducto(p);
        const categoriaProducto = (prod.categoria || '').toLowerCase();
        const nombreProducto = prod.nombre.toLowerCase();

        // Buscar por categoría o por palabras clave en el nombre
        return categoriaProducto.includes(categoriaDetectada) ||
               categorias[categoriaDetectada]?.some(palabra => nombreProducto.includes(palabra));
      });

      console.log(`🎯 Productos filtrados por "${categoriaDetectada}": ${productosFiltrados.length}/${productosVisibles.length}`);
    }

    // Si el filtro dejó menos de 3 productos, enviar todos
    if (productosFiltrados.length < 3) {
      productosFiltrados = productosVisibles;
    }

    // Formatear de forma compacta
    const listadoProductos = productosFiltrados.map((p, index) => {
      const prod = aProducto(p);
      return `${index + 1}. ${prod.nombre} | ${prod.categoria || 'General'} | Contado: $${prod.precios.contado.toLocaleString()} | Crédito: $${prod.precios.credito.toLocaleString()} | Inicial: $${prod.precios.inicial.toLocaleString()} | Semanal: $${prod.precios.pagoSemanal.toLocaleString()}${prod.esNuevo ? ' 🆕' : ''}${prod.enPromocion ? ' 🔥' : ''}`;
    }).join('\n');

    return `PRODUCTOS:\n${listadoProductos}`;
  } catch (error) {
    console.error('Error al filtrar productos:', error);
    return await obtenerCatalogo(); // Fallback al catálogo completo
  }
}

async function avisarPedidoRegistrado(pedido: { id: string; telefono: string; nombreCliente: string; zona: string | null; productos: string }) {
  const lista = JSON.parse(pedido.productos) as Array<{ nombre: string }>;
  try {
    const zonas = await obtenerZonasVentaActivas();
    const zona = detectarZonaEnMensaje(pedido.zona ?? '', zonas);
    const ajustes = await obtenerConfiguracion();
    const destino = zona?.whatsappVendedor || ajustes.whatsappVendedor;
    if (destino) await enviarMensajeWhatsApp(destino, `Nuevo pedido #${pedido.id}\nCliente: ${pedido.nombreCliente}\nTelefono: ${pedido.telefono}\nZona: ${pedido.zona ?? ''}\nProductos: ${lista.map(p => p.nombre).join(', ')}`, 'ventas');
  } catch { console.error('Pedido registrado, pero no se pudo avisar al vendedor'); }
  try { await enviarNotificacionPedido({ titulo: 'Nuevo pedido', mensaje: `Pedido de ${pedido.nombreCliente}`, telefono: pedido.telefono, producto: lista.map(p => p.nombre).join(', ') }); }
  catch { console.error('Pedido registrado, pero no se pudo enviar la notificacion'); }
}

/**
 * Procesa un mensaje de WhatsApp y genera una respuesta usando IA
 */
export async function procesarMensajeWhatsApp(
  remitente: string,
  mensaje: string,
  nombreContacto?: string,
  numeroTelefono?: string,
  opciones: { externoId?: string; transporte?: 'baileys' | 'cloud' } = {},
): Promise<string> {
  return enColaVentas(numeroTelefono || remitente, () => procesarMensajeVenta(remitente, mensaje, nombreContacto, numeroTelefono, opciones));
}

async function procesarMensajeVenta(
  remitente: string, mensaje: string, nombreContacto: string | undefined, numeroTelefono: string | undefined,
  opciones: { externoId?: string; transporte?: 'baileys' | 'cloud' },
): Promise<string> {
  try {
    // Obtener o crear conversación en BD (usar numeroTelefono si está disponible, sino remitente)
    const telefonoParaDB = numeroTelefono || remitente.split('@')[0];
    const conversacionId = await obtenerOCrearConversacion(telefonoParaDB, nombreContacto, remitente, opciones.transporte);

    const recibido = await registrarMensajeVentas(conversacionId, 'user', mensaje, undefined, opciones.externoId);
    if (!recibido) return '';
    const control = await estadoAtencionVentas(conversacionId);
    if (!control.automatico) return '';
    if (/\b(quiero hablar con|necesito|pasame con|comunicarme con) (un |una |el |la )?(asesor|persona|humano|vendedor)\b/i.test(mensaje)) {
      await db.update(conversacionesWhatsapp).set({ modoAtencion: 'manual', revisionAtencion: sql`${conversacionesWhatsapp.revisionAtencion} + 1` }).where(eq(conversacionesWhatsapp.id, conversacionId));
      return '';
    }
    const flujo = await avanzarPedidoVentas(conversacionId, mensaje, control.version);
    if (flujo) {
      if (flujo.pedido) await avisarPedidoRegistrado(flujo.pedido);
      if (flujo.respuesta) await guardarMensaje(conversacionId, 'assistant', flujo.respuesta);
      historialConversaciones.delete(remitente);
      return flujo.respuesta;
    }

    // PRIORIDAD 2: Procesamiento normal con IA
    // Aquí la IA maneja todo, incluyendo cuando el cliente muestra interés inicial
    // El agente ampliará información y actuará como vendedor profesional
    // Obtener configuración de IA
    const configIA = await leerConfigIA();

    // Si no hay API key configurada, usar respuestas básicas
    if (!configIA.apiKey) {
      console.warn('API key de IA no configurada, usando respuestas básicas');
      const respuesta = respuestaBasica(mensaje);
      const actual = await estadoAtencionVentas(conversacionId);
      if (!actual.automatico || actual.version !== control.version) return '';
      await guardarMensaje(conversacionId, 'assistant', respuesta);
      return respuesta;
    }

    // Obtener o crear historial de conversación para este usuario
    {
      // Cargar desde BD si no está en memoria
      const historialDB = await cargarHistorialDesdeDB(conversacionId, 10, recibido.id);
      historialConversaciones.set(remitente, historialDB);
    }
    const historial = historialConversaciones.get(remitente)!;

    // Llamar a la IA (OpenAI)
    try {
      // Usar catálogo filtrado para reducir tokens
      const catalogo = await obtenerProductosRelevantes(mensaje);

      const respuesta = await consultarIA(mensaje, configIA, catalogo, historial);
      const actual = await estadoAtencionVentas(conversacionId);
      if (!actual.automatico || actual.version !== control.version) return '';

      // Detectar productos mencionados en esta conversación
      const productosMencionados = await detectarProductosMencionados(mensaje, respuesta);

      // Registrar productos mencionados para estadísticas
      if (productosMencionados.length > 0) {
        registrarMencionProductos(productosMencionados);
      }

      // Agregar mensaje del usuario y respuesta al historial EN MEMORIA
      historial.push({
        role: 'user',
        content: mensaje
      });
      historial.push({
        role: 'assistant',
        content: respuesta,
        productos: productosMencionados
      });

      // Mantener solo los últimos 10 mensajes en memoria (5 intercambios)
      if (historial.length > 10) {
        historial.splice(0, historial.length - 10);
      }

      // Guardar mensaje del usuario y respuesta EN BASE DE DATOS
      await guardarMensaje(conversacionId, 'assistant', respuesta, { productos: productosMencionados });

      // Enviar imágenes de productos mencionados
      if (opciones.transporte !== 'cloud') {
        try { await enviarImagenesProductos(remitente, productosMencionados, async () => {
          const vigente = await estadoAtencionVentas(conversacionId);
          return vigente.automatico && vigente.version === control.version;
        }); }
        catch { console.error('No se pudieron enviar las imagenes del catalogo'); }
      }

      // Guardar log de actividad exitoso
      agregarLog(remitente, mensaje, respuesta, true);

      return respuesta;
    } catch (error) {
      console.error('Error al consultar IA:', error);
      const respuestaError = 'Lo siento, hubo un error al procesar tu mensaje. Un asesor te contactará pronto.';

      // Guardar en BD aunque haya error
      const actual = await estadoAtencionVentas(conversacionId);
      if (!actual.automatico || actual.version !== control.version) return '';
      await guardarMensaje(conversacionId, 'assistant', respuestaError);

      // Guardar log de actividad con error
      agregarLog(remitente, mensaje, respuestaError, false);

      return respuestaError;
    }
  } catch (error) {
    console.error('Error al procesar mensaje:', error);
    const respuestaError = 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta nuevamente.';

    // Guardar log de actividad con error
    agregarLog(remitente, mensaje, respuestaError, false);

    return respuestaError;
  }
}

/**
 * Detecta qué productos se mencionaron en el mensaje o respuesta
 */
async function detectarProductosMencionados(mensajeCliente: string, respuestaIA: string): Promise<string[]> {
  const productosVisibles = await db
    .select()
    .from(productos)
    .where(eq(productos.visible, true));

  const productosMencionados: string[] = [];
  const textoCompleto = `${mensajeCliente} ${respuestaIA}`.toLowerCase();

  for (const p of productosVisibles) {
    const prod = aProducto(p);
    const nombreProducto = prod.nombre.toLowerCase();

    if (textoCompleto.includes(nombreProducto)) {
      productosMencionados.push(prod.nombre);
    }
  }

  return productosMencionados;
}

/**
 * Detecta productos mencionados y envía sus imágenes
 */
async function enviarImagenesProductos(remitente: string, productosMencionados: string[], permitir: () => Promise<boolean>): Promise<void> {
  try {
    if (productosMencionados.length === 0) {
      return;
    }

    // Inicializar Set de imágenes enviadas para este cliente si no existe
    if (!imagenesEnviadas.has(remitente)) {
      imagenesEnviadas.set(remitente, new Set());
    }
    const imagenesYaEnviadas = imagenesEnviadas.get(remitente)!;

    // Obtener todos los productos visibles
    const productosVisibles = await db
      .select()
      .from(productos)
      .where(eq(productos.visible, true));

    for (const nombreProducto of productosMencionados) {
      // Verificar si ya se envió la imagen de este producto a este cliente
      if (imagenesYaEnviadas.has(nombreProducto)) {
        console.log(`📸 Imagen ya enviada anteriormente: ${nombreProducto}`);
        continue; // Saltar este producto
      }

      // Buscar el producto por nombre
      const p = productosVisibles.find(prod =>
        aProducto(prod).nombre.toLowerCase() === nombreProducto.toLowerCase()
      );

      if (!p) continue;

      const prod = aProducto(p);

      // Si tiene imagen, enviarla
      if (prod.imagenes.length > 0) {
        const primeraImagen = prod.imagenes[0];

        // Construir URL completa de la imagen
        const urlImagen = primeraImagen.imagenUrl.startsWith('http')
          ? primeraImagen.imagenUrl
          : `http://localhost:${config.puerto}${primeraImagen.imagenUrl}`;

        // Caption con información del producto
        const caption = `*${prod.nombre}* 🏠\n💰 Contado: *$${prod.precios.contado.toLocaleString()}*\n💳 Crédito: *$${prod.precios.credito.toLocaleString()}*\n📦 Inicial: *$${prod.precios.inicial.toLocaleString()}*\n⏰ Semanal: *$${prod.precios.pagoSemanal.toLocaleString()}*`;

        // Enviar imagen
        if (!await permitir()) return;
        if (await enviarImagenWhatsApp(remitente, urlImagen, caption, permitir) === false) return;
        console.log(`📸 Imagen enviada de: ${prod.nombre}`);

        // Marcar como enviada
        imagenesYaEnviadas.add(nombreProducto);

        // Pequeña pausa entre imágenes para no saturar
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Error al enviar imágenes de productos:', error);
    // No lanzar error, solo loguearlo
  }
}

/**
 * Respuestas básicas cuando no hay IA configurada
 */
function respuestaBasica(mensaje: string): string {
  const textoLower = mensaje.toLowerCase();

  if (textoLower.includes('hola')) {
    return '¡Hola! Soy tu asistente de crédito. ¿En qué puedo ayudarte?';
  }

  if (textoLower.includes('credito') || textoLower.includes('crédito')) {
    return 'Puedo ayudarte con información sobre créditos. ¿Qué necesitas saber?';
  }

  if (textoLower.includes('pago')) {
    return 'Para consultar sobre pagos, por favor indícame tu número de cliente.';
  }

  return 'Gracias por tu mensaje. Un asesor te contactará pronto.';
}

/**
 * Consulta a la IA (OpenAI)
 */
async function consultarIA(
  mensaje: string,
  config: any,
  catalogo: string,
  historial: Array<{ role: 'user' | 'assistant', content: string, productos?: string[] }>
): Promise<string> {
  // Obtener hora actual de Colombia
  const horaActual = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    hour12: false
  });
  const hora = parseInt(horaActual);

  let saludoSegunHora = '';
  if (hora >= 5 && hora < 12) {
    saludoSegunHora = 'Buenos días';
  } else if (hora >= 12 && hora < 18) {
    saludoSegunHora = 'Buenas tardes';
  } else {
    saludoSegunHora = 'Buenas noches';
  }

  const promptSistemaBase = config.promptSistema || `Eres María, asesora de ventas amable de una tienda de artículos para el hogar. Hablas natural como vendedor colombiano por WhatsApp.

HORA: ${saludoSegunHora}

ESTILO:
- Cálida, amigable, empática
- Lenguaje natural y coloquial
- Haz preguntas para entender necesidades
- Usa *negritas* para productos/precios
- Emojis con moderación: 💰 contado | 💳 crédito | 📦 inicial | ⏰ pagos
- Mensajes cortos (2-4 líneas)

CONTEXTO:
- Lee el historial completo
- Si ya enviaste producto y cliente pregunta "cuánto", se refiere al último
- NO repitas info ya dada
- Mantén coherencia

FORMAS DE PAGO:
- Además de contado y crédito, manejamos Addi (compra ahora paga después) y transferencia bancaria
- Si el cliente duda por el precio o la inicial, ofrece Addi o transferencia como alternativa cómoda
- No inventes datos de cuenta ni pasos exactos de Addi: eso lo confirma un asesor

EJEMPLOS:
Cliente: "Hola"
Tú: "¡Hola! ¿Cómo estás? 😊 Soy María. ¿En qué te ayudo?"

Cliente: "Busco nevera"
Tú: "¡Perfecto! ¿Buscas algo grande familiar o compacto? 🤔"

Cliente: "Cuánto cuesta"
Tú: "El *Comedor Moderno* está:
💰 Contado: *$850.000*
💳 Crédito: *$1.200.000*
📦 Inicial *$400.000* y pagas ⏰*$30.000* semanales
¿Qué te parece? 😊"

Suena como persona real, no bot. Sé conversacional pero eficiente.`;

  // Obtener el último producto mencionado del historial
  let ultimoProductoMencionado = '';
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].productos && historial[i].productos!.length > 0) {
      ultimoProductoMencionado = historial[i].productos![historial[i].productos!.length - 1];
      break;
    }
  }

  // Combinar el prompt del sistema con el catálogo actual
  let promptCompleto = `${promptSistemaBase}

---
${catalogo}
---

Usa SOLO la info del catálogo para responder sobre productos/precios. USA formato WhatsApp con *negritas* y emojis.
No afirmes que registraste un pedido o avisaste a un vendedor. Los pedidos se registran unicamente en el flujo de confirmacion del sistema. Cuando quiera comprar, invita al cliente a escribir "quiero comprar" seguido del nombre del producto. No inventes aprobacion de credito, descuentos o entrega garantizada.`;

  // Si hay un último producto mencionado, agregarlo al contexto
  if (ultimoProductoMencionado) {
    promptCompleto += `\n\nÚltimo producto mostrado: "${ultimoProductoMencionado}". Si dice "este", "ese", "me gusta", se refiere a este.`;
  }

  // Construir mensajes con historial
  const mensajes: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
    {
      role: 'system',
      content: promptCompleto
    }
  ];

  // Agregar historial de conversación (últimos 3 intercambios = 6 mensajes)
  const historialLimitado = historial.slice(-6);
  for (const item of historialLimitado) {
    mensajes.push({
      role: item.role,
      content: item.content
    });
  }

  // Agregar mensaje actual del usuario
  mensajes.push({
    role: 'user',
    content: mensaje
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.modelo || 'gpt-4o-mini',
      messages: mensajes,
      temperature: config.temperatura || 0.7,
      max_tokens: config.maxTokens || 250
    })
  });

  if (!response.ok) {
    throw new Error(`Error de OpenAI: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
}
