import { db, esquema } from '../db/cliente.js';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ErrorDatosInvalidos, ErrorNoEncontrado } from '../errores.js';
import type { TxVentas } from './atencion-ventas.js';

const { pedidosWhatsapp, zonasVenta } = esquema;

interface ProductoPedido {
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface ZonaVentaActiva {
  nombre: string;
  whatsappVendedor: string;
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
  const texto = normalizarTexto(mensaje).trim();
  if (/\b(no|cancelar|cancela|todavia|aun|despues|luego)\b/.test(texto)) return false;
  return /\b(quiero (comprar|pedir|este|ese|el|la|un|una)|lo quiero|me lo llevo|lo compro|hacer (un )?pedido|hacer (una )?compra|realizar (un )?pedido|confirmo|separalo|apartalo|comprarlo|pedirlo)\b/.test(texto);
}

/** Quita tildes y pasa a minusculas, para comparar nombres de zona sin depender de como los escriba el cliente. */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Obtiene las zonas de venta activas configuradas desde el sistema.
 */
export async function obtenerZonasVentaActivas(): Promise<ZonaVentaActiva[]> {
  const filas = await db
    .select({ nombre: zonasVenta.nombre, whatsappVendedor: zonasVenta.whatsappVendedor })
    .from(zonasVenta)
    .where(eq(zonasVenta.activo, true));

  return filas;
}

/**
 * Busca si el mensaje del cliente menciona el nombre de alguna zona
 * configurada. Compara sin tildes ni mayusculas, y acepta que el cliente
 * escriba una frase completa ("estoy en lejanias") en vez del nombre exacto.
 */
export function detectarZonaEnMensaje(
  mensaje: string,
  zonas: ZonaVentaActiva[],
): ZonaVentaActiva | null {
  const mensajeNormalizado = normalizarTexto(mensaje);

  for (const zona of zonas) {
    if (mensajeNormalizado.includes(normalizarTexto(zona.nombre))) {
      return zona;
    }
  }

  return null;
}

/**
 * Generar ID único para pedido
 */
function generarIdPedido(): string { return randomUUID(); }

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
 * Guarda la solicitud con su conversacion real. El flujo automatico o el
 * gestor recopilan y confirman los datos antes de llamar esta funcion.
 */
export async function registrarPedidoSimple(datos: {
  conversacionId: string;
  telefono: string;
  nombreContacto?: string;
  producto: ProductoPedido;
  resumenConversacion: string;
  zona?: string | null;
  direccion?: string;
  id?: string;
}, consulta: typeof db | TxVentas = db) {
  const { telefono, nombreContacto, producto, resumenConversacion, zona } = datos;

  const pedidoData = {
    id: datos.id ?? generarIdPedido(),
    conversacionId: datos.conversacionId,
    telefono,
    nombreCliente: nombreContacto || 'Sin nombre',
    direccion: datos.direccion ?? null,
    zona: zona ?? null,
    productos: JSON.stringify([producto]),
    total: Math.round(producto.precio * producto.cantidad * 100), // En centavos
    estado: 'pendiente',
    notas: resumenConversacion,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  };

  try {
    const [pedido] = await consulta.insert(pedidosWhatsapp).values(pedidoData).returning();
    console.log('✅ Pedido guardado exitosamente:', pedidoData.id);
    return pedido;
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
    throw error;
  }
}

/**
 * Actualizar estado de un pedido
 */
export async function actualizarEstadoPedido(pedidoId: string, nuevoEstado: string) {
  if (!['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'].includes(nuevoEstado)) throw new ErrorDatosInvalidos('Estado de pedido invalido');
  const [pedido] = await db
    .update(pedidosWhatsapp)
    .set({
      estado: nuevoEstado,
      actualizadoEn: new Date().toISOString()
    })
    .where(eq(pedidosWhatsapp.id, pedidoId)).returning();
  if (!pedido) throw new ErrorNoEncontrado('Pedido no encontrado');
  return pedido;
}
