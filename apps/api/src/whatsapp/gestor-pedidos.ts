import { db, esquema } from '../db/cliente.js';
import { eq, desc } from 'drizzle-orm';

const { pedidosWhatsapp } = esquema;

interface ProductoPedido {
  nombre: string;
  precio: number;
  cantidad: number;
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
    'hacer pedido',
    'quiero este',
    'quiero ese',
    'lo quiero',
    'me lo llevo',
    'lo compro',
    'comprarlo',
    'separar',
    'apartarlo',
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
    'apartalo',
    'pedirlo',
    'llevar',
    'llevarlo'
  ];

  const mensajeLower = mensaje.toLowerCase().trim();
  return palabrasClave.some(palabra => mensajeLower.includes(palabra));
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
export function generarNumeroPedido(): string {
  const fecha = new Date();
  const año = fecha.getFullYear().toString().substr(2);
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const dia = fecha.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');

  return `WA${año}${mes}${dia}-${random}`;
}

/**
 * Guarda un registro simple de pedido: no recopila cedula/direccion/municipio
 * paso a paso, solo deja constancia de que un cliente mostro intencion de
 * compra, para que quede historial en el panel admin mientras el vendedor
 * humano hace el seguimiento real por WhatsApp.
 */
export async function registrarPedidoSimple(datos: {
  telefono: string;
  nombreContacto?: string;
  producto: ProductoPedido;
  resumenConversacion: string;
}): Promise<void> {
  const { telefono, nombreContacto, producto, resumenConversacion } = datos;

  const pedidoData = {
    id: generarIdPedido(),
    conversacionId: `conv_${telefono}_${Date.now()}`,
    telefono,
    nombreCliente: nombreContacto || 'Sin nombre',
    direccion: null,
    productos: JSON.stringify([producto]),
    total: producto.precio * producto.cantidad * 100, // En centavos
    estado: 'pendiente',
    notas: resumenConversacion,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  };

  console.log('💾 Guardando pedido simple en base de datos:', pedidoData);

  try {
    await db.insert(pedidosWhatsapp).values(pedidoData);
    console.log('✅ Pedido guardado exitosamente:', pedidoData.id);
  } catch (error) {
    console.error('❌ Error guardando pedido en base de datos:', error);
    throw error;
  }
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
