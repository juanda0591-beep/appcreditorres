import { db, esquema } from '../db/cliente.js';
import { eq, desc } from 'drizzle-orm';

const { pedidosWhatsapp } = esquema;

interface DatosCliente {
  nombre?: string;
  cedula?: string;
  direccion?: string;
  municipio?: string;
  telefono: string;
}

interface ProductoPedido {
  nombre: string;
  precio: number;
  cantidad: number;
}

interface EstadoPedido {
  enProceso: boolean;
  datosRecopilados: DatosCliente;
  productosSeleccionados: ProductoPedido[];
  pasoActual: 'producto' | 'nombre' | 'cedula' | 'direccion' | 'municipio' | 'confirmacion' | 'completado';
}

// Almacenar estado de pedidos en proceso por cliente
const pedidosEnProceso = new Map<string, EstadoPedido>();

/**
 * Validar nombre completo
 */
function validarNombre(nombre: string): { valido: boolean; error?: string } {
  const nombreLimpio = nombre.trim();

  if (nombreLimpio.length < 3) {
    return { valido: false, error: 'El nombre es muy corto. Por favor escribe tu nombre completo 😊' };
  }

  if (nombreLimpio.length > 100) {
    return { valido: false, error: 'El nombre es muy largo. Por favor escribe solo tu nombre completo 😊' };
  }

  // Verificar que tenga al menos dos palabras (nombre y apellido)
  const palabras = nombreLimpio.split(' ').filter(p => p.length > 0);
  if (palabras.length < 2) {
    return { valido: false, error: 'Por favor escribe tu nombre completo (nombre y apellido) 😊' };
  }

  return { valido: true };
}

/**
 * Validar número de cédula
 */
function validarCedula(cedula: string): { valido: boolean; error?: string } {
  const cedulaLimpia = cedula.trim().replace(/\D/g, ''); // Remover todo excepto números

  if (cedulaLimpia.length < 6) {
    return { valido: false, error: 'La cédula parece incompleta. Por favor verifica el número 😊' };
  }

  if (cedulaLimpia.length > 15) {
    return { valido: false, error: 'La cédula parece muy larga. Por favor verifica el número 😊' };
  }

  return { valido: true };
}

/**
 * Validar dirección
 */
function validarDireccion(direccion: string): { valido: boolean; error?: string } {
  const direccionLimpia = direccion.trim();

  if (direccionLimpia.length < 10) {
    return { valido: false, error: 'La dirección está incompleta. Por favor incluye calle, número, barrio y referencias 😊' };
  }

  if (direccionLimpia.length > 200) {
    return { valido: false, error: 'La dirección es muy larga. Por favor escribe una dirección más concisa 😊' };
  }

  return { valido: true };
}

/**
 * Validar municipio/ciudad
 */
function validarMunicipio(municipio: string): { valido: boolean; error?: string } {
  const municipioLimpio = municipio.trim();

  if (municipioLimpio.length < 3) {
    return { valido: false, error: 'El nombre del municipio o ciudad parece incompleto. Por favor escríbelo completo 😊' };
  }

  if (municipioLimpio.length > 50) {
    return { valido: false, error: 'El nombre es muy largo. Por favor escribe solo el nombre del municipio o ciudad 😊' };
  }

  return { valido: true };
}

/**
 * Validar número de teléfono
 */
function validarTelefono(telefono: string): { valido: boolean; error?: string } {
  const telefonoLimpio = telefono.trim().replace(/\D/g, ''); // Remover todo excepto números

  if (telefonoLimpio.length !== 10) {
    return { valido: false, error: 'El número de teléfono debe tener 10 dígitos. Por favor verifica el número 😊' };
  }

  // Verificar que empiece con un dígito válido para Colombia (3 para celular)
  if (!telefonoLimpio.startsWith('3')) {
    return { valido: false, error: 'El número parece incorrecto. Los números de celular en Colombia empiezan con 3 😊' };
  }

  return { valido: true };
}

/**
 * Detectar si el cliente muestra interés en un producto (no compra confirmada aún)
 */
export function detectarInteres(mensaje: string): boolean {
  const palabrasInteres = [
    'me gusta ese',
    'me gusta este',
    'me gusta',
    'ese me gusta',
    'este me gusta',
    'me interesa',
    'interesante',
    'cuánto cuesta',
    'cuanto cuesta',
    'precio',
    'valor',
    'qué precio',
    'que precio',
    'cuánto vale',
    'cuanto vale',
    'cómo es el pago',
    'como es el pago',
    'formas de pago',
    'cuota inicial',
    'inicial'
  ];

  const mensajeLower = mensaje.toLowerCase().trim();
  return palabrasInteres.some(palabra => mensajeLower.includes(palabra));
}

/**
 * Detectar confirmación de compra (intención clara de adquirir)
 */
export function detectarIntencionCompra(mensaje: string): boolean {
  const palabrasClave = [
    'quiero este',
    'quiero ese',
    'lo quiero',
    'me lo llevo',
    'lo compro',
    'comprarlo',
    'separar',
    'apartarlo',
    'hacer pedido',
    'solicitar',
    'sí lo quiero',
    'si lo quiero',
    'sí ese',
    'si ese',
    'ese mismo',
    'este mismo',
    'lo llevo',
    'me lo llevaré',
    'quiero comprarlo',
    'cómo hago para comprarlo',
    'como lo compro',
    'puedo comprarlo',
    'me lo das',
    'dámelo',
    'confirmo',
    'sepáralo',
    'separalo',
    'apártalo',
    'apartalo'
  ];

  const mensajeLower = mensaje.toLowerCase().trim();
  return palabrasClave.some(palabra => mensajeLower.includes(palabra));
}

/**
 * Iniciar proceso de pedido
 */
export function iniciarPedido(telefono: string, productos: ProductoPedido[]): string {
  pedidosEnProceso.set(telefono, {
    enProceso: true,
    datosRecopilados: { telefono },
    productosSeleccionados: productos,
    pasoActual: 'nombre'
  });

  return `¡Perfecto! 🎉 Vamos a separarte el pedido.

Para procesarlo necesito algunos datos:

📝 *¿Cuál es tu nombre completo?*`;
}

/**
 * Procesar respuesta del cliente durante el pedido
 */
export function procesarRespuestaPedido(telefono: string, mensaje: string): { mensaje: string; finalizado: boolean } {
  const pedido = pedidosEnProceso.get(telefono);

  if (!pedido || !pedido.enProceso) {
    return { mensaje: '', finalizado: false };
  }

  switch (pedido.pasoActual) {
    case 'nombre':
      const validacionNombre = validarNombre(mensaje);
      if (!validacionNombre.valido) {
        return {
          mensaje: validacionNombre.error!,
          finalizado: false
        };
      }

      pedido.datosRecopilados.nombre = mensaje.trim();
      pedido.pasoActual = 'cedula';
      return {
        mensaje: `Gracias *${pedido.datosRecopilados.nombre}* 😊

📝 *¿Cuál es tu número de cédula?*`,
        finalizado: false
      };

    case 'cedula':
      const validacionCedula = validarCedula(mensaje);
      if (!validacionCedula.valido) {
        return {
          mensaje: validacionCedula.error!,
          finalizado: false
        };
      }

      pedido.datosRecopilados.cedula = mensaje.trim();
      pedido.pasoActual = 'direccion';
      return {
        mensaje: `Perfecto! 👍

📍 *¿Cuál es tu dirección completa para la entrega?*
(Incluye calle, número, barrio y referencias)`,
        finalizado: false
      };

    case 'direccion':
      const validacionDireccion = validarDireccion(mensaje);
      if (!validacionDireccion.valido) {
        return {
          mensaje: validacionDireccion.error!,
          finalizado: false
        };
      }

      pedido.datosRecopilados.direccion = mensaje.trim();
      pedido.pasoActual = 'municipio';
      return {
        mensaje: `Perfecto! 📍

🏙️ *¿De qué municipio o ciudad eres?*`,
        finalizado: false
      };

    case 'municipio':
      const validacionMunicipio = validarMunicipio(mensaje);
      if (!validacionMunicipio.valido) {
        return {
          mensaje: validacionMunicipio.error!,
          finalizado: false
        };
      }

      pedido.datosRecopilados.municipio = mensaje.trim();
      pedido.pasoActual = 'confirmacion';

      // Generar resumen del pedido
      const resumen = generarResumenPedido(pedido);
      return {
        mensaje: `Excelente! Aquí está el resumen de tu pedido:

${resumen}

¿Todo está correcto? Responde *SÍ* para confirmar o *NO* para cancelar.`,
        finalizado: false
      };

    case 'confirmacion':
      const respuestaLower = mensaje.toLowerCase().trim();

      if (respuestaLower === 'si' || respuestaLower === 'sí') {
        // Guardar pedido en la base de datos
        guardarPedido(pedido).then(() => {
          console.log('✅ Pedido guardado en base de datos');
        }).catch(err => {
          console.error('❌ Error guardando pedido:', err);
        });

        pedido.pasoActual = 'completado';
        pedidosEnProceso.delete(telefono);

        return {
          mensaje: `¡Pedido confirmado! 🎉✅

Tu pedido ha sido registrado exitosamente. *Un asesor te contactará pronto* para coordinar el pago y la entrega.

Número de pedido: *${generarNumeroPedido()}*

¡Gracias por tu compra! 😊`,
          finalizado: true
        };
      } else if (respuestaLower === 'no') {
        pedidosEnProceso.delete(telefono);
        return {
          mensaje: `Pedido cancelado. Si cambias de opinión, con gusto te ayudo 😊`,
          finalizado: true
        };
      } else {
        return {
          mensaje: `Por favor responde *SÍ* para confirmar o *NO* para cancelar.`,
          finalizado: false
        };
      }

    default:
      return { mensaje: '', finalizado: false };
  }
}

/**
 * Verificar si hay un pedido en proceso
 */
export function tienePedidoEnProceso(telefono: string): boolean {
  return pedidosEnProceso.has(telefono) && pedidosEnProceso.get(telefono)!.enProceso;
}

/**
 * Cancelar pedido en proceso
 */
export function cancelarPedido(telefono: string): void {
  pedidosEnProceso.delete(telefono);
}

/**
 * Generar resumen del pedido
 */
function generarResumenPedido(pedido: EstadoPedido): string {
  const { datosRecopilados, productosSeleccionados } = pedido;

  let resumen = `👤 *Cliente:* ${datosRecopilados.nombre}\n`;
  resumen += `🆔 *Cédula:* ${datosRecopilados.cedula}\n`;
  resumen += `📍 *Dirección:* ${datosRecopilados.direccion}\n`;
  resumen += `🏙️ *Municipio:* ${datosRecopilados.municipio}\n`;
  resumen += `📱 *Teléfono:* ${datosRecopilados.telefono}\n\n`;
  resumen += `🛒 *Productos:*\n`;

  let total = 0;
  for (const prod of productosSeleccionados) {
    resumen += `- ${prod.nombre} x${prod.cantidad}: *$${prod.precio.toLocaleString()}*\n`;
    total += prod.precio * prod.cantidad;
  }

  resumen += `\n💰 *TOTAL: $${total.toLocaleString()}*`;

  return resumen;
}

/**
 * Guardar pedido en la base de datos
 */
async function guardarPedido(pedido: EstadoPedido): Promise<void> {
  const { datosRecopilados, productosSeleccionados } = pedido;

  const total = productosSeleccionados.reduce((sum, prod) => sum + (prod.precio * prod.cantidad), 0);

  const pedidoData = {
    id: generarIdPedido(),
    conversacionId: `conv_${datosRecopilados.telefono}_${Date.now()}`,
    telefono: datosRecopilados.telefono,
    nombreCliente: datosRecopilados.nombre || 'Sin nombre',
    direccion: datosRecopilados.direccion || '',
    productos: JSON.stringify(productosSeleccionados),
    total: total * 100, // En centavos
    estado: 'pendiente',
    notas: `Cédula: ${datosRecopilados.cedula || 'No proporcionada'}\nMunicipio: ${datosRecopilados.municipio || 'No proporcionado'}`,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  };

  console.log('💾 Guardando pedido en base de datos:', pedidoData);

  try {
    await db.insert(pedidosWhatsapp).values(pedidoData);
    console.log('✅ Pedido guardado exitosamente:', pedidoData.id);
  } catch (error) {
    console.error('❌ Error guardando pedido en base de datos:', error);
    throw error;
  }
}

/**
 * Generar ID único para pedido
 */
function generarIdPedido(): string {
  return `pedido_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generar número de pedido legible
 */
function generarNumeroPedido(): string {
  const fecha = new Date();
  const año = fecha.getFullYear().toString().substr(2);
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const dia = fecha.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');

  return `WA${año}${mes}${dia}-${random}`;
}

/**
 * Obtener todos los pedidos
 */
export async function obtenerTodosPedidos() {
  try {
    console.log('📦 Consultando pedidos desde la base de datos...');
    const pedidos = await db
      .select()
      .from(pedidosWhatsapp)
      .orderBy(desc(pedidosWhatsapp.creadoEn));

    console.log(`📦 Pedidos encontrados: ${pedidos.length}`);

    const pedidosMapeados = pedidos.map(pedido => ({
      ...pedido,
      productos: JSON.parse(pedido.productos),
      total: pedido.total / 100 // Convertir de centavos a pesos
    }));

    return pedidosMapeados;
  } catch (error) {
    console.error('❌ Error obteniendo pedidos:', error);
    return [];
  }
}

/**
 * Actualizar estado de un pedido
 */
export async function actualizarEstadoPedido(pedidoId: string, nuevoEstado: string) {
  await db
    .update(pedidosWhatsapp)
    .set({
      estado: nuevoEstado,
      actualizadoEn: new Date().toISOString()
    })
    .where(eq(pedidosWhatsapp.id, pedidoId));
}
