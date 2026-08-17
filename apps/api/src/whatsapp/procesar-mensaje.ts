import { leerConfigIA } from '../rutas/admin-ia.js';
import { db, esquema } from '../db/cliente.js';
import { eq, like } from 'drizzle-orm';
import { aProducto } from '../db/mapeo.js';
import { enviarImagenWhatsApp } from './baileys-client.js';
import { config } from '../config.js';
import {
  detectarIntencionCompra,
  detectarInteres,
  iniciarPedido,
  procesarRespuestaPedido,
  tienePedidoEnProceso
} from './gestor-pedidos.js';

const { productos } = esquema;

// Almacenar historial de conversaciones en memoria
// Estructura: { numeroTelefono: [{ role: 'user'|'assistant', content: string }] }
const historialConversaciones = new Map<string, Array<{ role: 'user' | 'assistant', content: string, productos?: string[] }>>();

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
 * Obtiene el catálogo de productos visible
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

    // Formatear productos para el contexto de la IA
    const listadoProductos = productosVisibles.map((p, index) => {
      const prod = aProducto(p);
      console.log(`Producto ${index + 1}: ${prod.nombre} - Contado: $${prod.precios.contado} - Crédito: $${prod.precios.credito}`);

      return `${index + 1}. ${prod.nombre}
   - Categoría: ${prod.categoria || 'Sin categoría'}
   - Precio contado: $${prod.precios.contado.toLocaleString()}
   - Precio credicontado: $${prod.precios.credicontado.toLocaleString()}
   - Precio crédito: $${prod.precios.credito.toLocaleString()}
   - Cuota inicial: $${prod.precios.inicial.toLocaleString()}
   - Pago semanal: $${prod.precios.pagoSemanal.toLocaleString()}
   - Pago quincenal: $${prod.precios.pagoQuincenal.toLocaleString()}
   - Pago mensual: $${prod.precios.pagoMensual.toLocaleString()}
   ${prod.descripcion ? `- Descripción: ${prod.descripcion}` : ''}
   ${prod.disponible ? '✓ Disponible' : '✗ No disponible'}
   ${prod.esNuevo ? '🆕 NUEVO' : ''}
   ${prod.enPromocion ? '🔥 EN PROMOCIÓN' : ''}`;
    }).join('\n\n');

    const catalogoCompleto = `CATÁLOGO DE PRODUCTOS DISPONIBLES:\n\n${listadoProductos}`;
    console.log('📋 Catálogo generado, caracteres:', catalogoCompleto.length);

    return catalogoCompleto;
  } catch (error) {
    console.error('Error al obtener catálogo:', error);
    return 'Error al cargar el catálogo de productos.';
  }
}

/**
 * Procesa un mensaje de WhatsApp y genera una respuesta usando IA
 */
export async function procesarMensajeWhatsApp(
  remitente: string,
  mensaje: string
): Promise<string> {
  try {
    console.log(`Procesando mensaje de ${remitente}: ${mensaje}`);

    // PRIORIDAD 1: Verificar si hay un pedido en proceso
    if (tienePedidoEnProceso(remitente)) {
      const resultado = procesarRespuestaPedido(remitente, mensaje);

      // Guardar log
      agregarLog(remitente, mensaje, resultado.mensaje, true);

      return resultado.mensaje;
    }

    // PRIORIDAD 2: Detectar CONFIRMACIÓN de compra (no solo interés)
    // Solo iniciamos recopilación cuando el cliente confirma claramente que quiere comprar
    if (detectarIntencionCompra(mensaje)) {
      // Obtener el último producto mencionado del historial
      const historial = historialConversaciones.get(remitente) || [];
      let ultimoProducto = null;

      for (let i = historial.length - 1; i >= 0; i--) {
        if (historial[i].productos && historial[i].productos!.length > 0) {
          const nombreProducto = historial[i].productos![historial[i].productos!.length - 1];

          // Buscar el producto para obtener el precio
          const productosVisibles = await db
            .select()
            .from(productos)
            .where(eq(productos.visible, true));

          const p = productosVisibles.find(prod =>
            aProducto(prod).nombre.toLowerCase() === nombreProducto.toLowerCase()
          );

          if (p) {
            const prod = aProducto(p);
            ultimoProducto = {
              nombre: prod.nombre,
              precio: prod.precios.credito, // Usar precio a crédito por defecto
              cantidad: 1
            };
          }
          break;
        }
      }

      if (ultimoProducto) {
        const respuestaInicio = iniciarPedido(remitente, [ultimoProducto]);
        agregarLog(remitente, mensaje, respuestaInicio, true);
        return respuestaInicio;
      } else {
        const respuesta = 'Para hacer un pedido, primero déjame mostrarte nuestros productos. ¿Qué estás buscando? 😊';
        agregarLog(remitente, mensaje, respuesta, true);
        return respuesta;
      }
    }

    // PRIORIDAD 3: Procesamiento normal con IA
    // Aquí la IA maneja todo, incluyendo cuando el cliente muestra interés inicial
    // El agente ampliará información y actuará como vendedor profesional
    // Obtener configuración de IA
    const configIA = await leerConfigIA();

    // Si no hay API key configurada, usar respuestas básicas
    if (!configIA.apiKey) {
      console.warn('API key de IA no configurada, usando respuestas básicas');
      return respuestaBasica(mensaje);
    }

    // Obtener o crear historial de conversación para este usuario
    if (!historialConversaciones.has(remitente)) {
      historialConversaciones.set(remitente, []);
    }
    const historial = historialConversaciones.get(remitente)!;

    // Llamar a la IA (OpenAI)
    try {
      const catalogo = await obtenerCatalogo();
      const respuesta = await consultarIA(mensaje, configIA, catalogo, historial);

      // Detectar productos mencionados en esta conversación
      const productosMencionados = await detectarProductosMencionados(mensaje, respuesta);

      // Registrar productos mencionados para estadísticas
      if (productosMencionados.length > 0) {
        registrarMencionProductos(productosMencionados);
      }

      // Agregar mensaje del usuario y respuesta al historial
      historial.push({
        role: 'user',
        content: mensaje
      });
      historial.push({
        role: 'assistant',
        content: respuesta,
        productos: productosMencionados
      });

      // Mantener solo los últimos 10 mensajes (5 intercambios)
      if (historial.length > 10) {
        historial.splice(0, historial.length - 10);
      }

      // Enviar imágenes de productos mencionados
      await enviarImagenesProductos(remitente, productosMencionados);

      // Guardar log de actividad exitoso
      agregarLog(remitente, mensaje, respuesta, true);

      return respuesta;
    } catch (error) {
      console.error('Error al consultar IA:', error);
      const respuestaError = 'Lo siento, hubo un error al procesar tu mensaje. Un asesor te contactará pronto.';

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
async function enviarImagenesProductos(remitente: string, productosMencionados: string[]): Promise<void> {
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
        await enviarImagenWhatsApp(remitente, urlImagen, caption);
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

  const promptSistemaBase = config.promptSistema || `Eres María, una asesora de ventas amable y cercana de una tienda de artículos para el hogar. Hablas de manera natural como lo haría un vendedor colombiano real por WhatsApp.

HORA ACTUAL EN COLOMBIA: ${saludoSegunHora} (usa este saludo cuando el cliente te escriba por primera vez o diga "hola")

PERSONALIDAD Y TONO:
- Eres cálida, amigable y genuinamente servicial
- Usas un lenguaje natural y coloquial (pero profesional)
- Muestras entusiasmo real por ayudar al cliente
- Eres empática con la situación económica del cliente
- Haces preguntas para entender mejor lo que necesitan
- Compartes detalles como si estuvieras conversando cara a cara
- Usas expresiones naturales: "¡qué bueno!", "perfecto", "claro que sí", "con mucho gusto"

ESTILO DE CONVERSACIÓN:
- Escribe como hablas en WhatsApp: natural, directo, sin ser robótico
- Saluda según la hora: ${saludoSegunHora}
- Haz preguntas de seguimiento: "¿para qué habitación lo necesitas?", "¿tienes un presupuesto en mente?"
- Comparte tips o consejos: "este se vende mucho", "es el favorito de los clientes"
- Reconoce lo que el cliente dice antes de responder
- Si el cliente parece indeciso, ofrece alternativas o sugiere algo

FORMATO WHATSAPP - USA PERO CON NATURALIDAD:
- Usa *negritas* para productos y precios importantes
- Emojis con moderación (no sobrecargues):
  💰 contado | 💳 crédito | 📦 inicial | ⏰ pagos | ✨ promoción
- Respuestas cortas (2-4 líneas), como mensajes reales de WhatsApp
- Evita listas largas, mejor ofrece 2-3 opciones y pregunta

CONTEXTO CONVERSACIONAL:
- Lee TODO el historial antes de responder
- Si ya enviaste productos con imagen y el cliente pregunta "cuánto cuesta", "me gusta", se refiere al ÚLTIMO producto
- NO repitas información que ya diste
- Mantén coherencia: si ya presentaste opciones, no las vuelvas a listar
- Recuerda detalles mencionados por el cliente

EJEMPLOS DE RESPUESTAS NATURALES:

Cliente: "Hola"
Tú: "¡Hola! ¿Cómo estás? 😊 Soy María. ¿En qué te puedo ayudar hoy?"

Cliente: "Busco una nevera"
Tú: "¡Perfecto! Tenemos varias opciones. ¿Buscas algo grande tipo familiar o algo más compacto? 🤔"

Cliente: "Cuánto cuesta"
Tú (si ya enviaste producto): "El *Comedor Moderno* que te mostré está así:
💰 Contado: *$850.000*
💳 Crédito: *$1.200.000*
📦 Das inicial de *$400.000* y pagas ⏰*$30.000* semanales
¿Qué te parece? 😊"

Cliente: "Es mucho"
Tú: "Te entiendo perfectamente 😊 Mira, tenemos uno más económico que también está lindo. ¿Quieres que te lo muestre?"

IMPORTANTE:
- Suena como una persona real, no como un bot
- Sé conversacional pero eficiente
- Muestra interés genuino en ayudar
- Adapta tu tono según la conversación`;

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

Usa SOLO la información del catálogo anterior para responder sobre productos, precios y disponibilidad.
RECUERDA: USA SIEMPRE formato WhatsApp con *negritas* y emojis en CADA respuesta. NO uses listas con guiones (-), usa emojis al inicio de cada línea.`;

  // Si hay un último producto mencionado, agregarlo al contexto
  if (ultimoProductoMencionado) {
    promptCompleto += `\n\nCONTEXTO ACTUAL: El último producto que mostraste al cliente fue "${ultimoProductoMencionado}". Si el cliente dice "este", "ese", "me gusta", etc., se refiere a este producto específicamente.`;
  }

  // Construir mensajes con historial
  const mensajes: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
    {
      role: 'system',
      content: promptCompleto
    }
  ];

  // Agregar historial de conversación (últimos 5 intercambios)
  for (const item of historial) {
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
      model: config.modelo || 'gpt-4',
      messages: mensajes,
      temperature: config.temperatura || 0.7,
      max_tokens: config.maxTokens || 500
    })
  });

  if (!response.ok) {
    throw new Error(`Error de OpenAI: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
}
