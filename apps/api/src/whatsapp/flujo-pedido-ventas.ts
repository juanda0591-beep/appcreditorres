import { randomUUID } from 'node:crypto';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/cliente.js';
import { productos } from '../db/esquema/productos.js';
import { conversacionesWhatsapp, mensajesWhatsapp, pedidosWhatsapp } from '../db/esquema/whatsapp.js';
import { detectarIntencionCompra, registrarPedidoSimple } from './gestor-pedidos.js';
import { estadoAtencionVentas } from './atencion-ventas.js';

const borradorSchema = z.object({
  id: z.string(), paso: z.enum(['producto', 'cantidad', 'pago', 'nombre', 'direccion', 'zona', 'telefono', 'confirmar']),
  opciones: z.array(z.string()).default([]), productoId: z.string().optional(), nombreProducto: z.string().optional(),
  cantidad: z.number().int().positive().optional(), pago: z.enum(['contado', 'credito', 'credicontado']).optional(),
  precio: z.number().optional(), nombre: z.string().optional(), direccion: z.string().optional(), zona: z.string().optional(), telefono: z.string().optional(),
});
type Borrador = z.infer<typeof borradorSchema>;
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const pesos = (valor: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

interface SolicitudCatalogo {
  producto: string;
  nombre?: string;
  direccion?: string;
  municipio?: string;
  pago?: 'contado' | 'credito' | 'credicontado';
}

function lineaSolicitud(texto: string, etiqueta: string): string | undefined {
  const etiquetaMinuscula = etiqueta.toLocaleLowerCase('es');
  const linea = texto.split(/\r?\n/).find((actual) => {
    const minuscula = actual.toLocaleLowerCase('es');
    const inicio = minuscula.indexOf(etiquetaMinuscula);
    return inicio >= 0 && /^\s*\*?\s*:/.test(actual.slice(inicio + etiqueta.length));
  });
  if (!linea) return undefined;
  const inicio = linea.toLocaleLowerCase('es').indexOf(etiquetaMinuscula) + etiqueta.length;
  return linea.slice(inicio).replace(/^[\s:*_•·-]+/, '').trim() || undefined;
}

function extraerSolicitudCatalogo(mensaje: string): SolicitudCatalogo | null {
  if (!/solicitud de producto/i.test(mensaje)) return null;
  const producto = lineaSolicitud(mensaje, 'Producto');
  if (!producto) return null;

  const formaPago = mensaje.match(/FORMA DE PAGO PREFERIDA[\s\S]{0,120}?\b(contado|credicontado|credito|quincenal|semanal|mensual)\b/i)?.[1]?.toLowerCase();
  const pago = formaPago === 'contado' ? 'contado' : formaPago === 'credicontado' ? 'credicontado' : formaPago ? 'credito' : undefined;
  return {
    producto: producto.replace(/[🛒📦*_]/g, '').trim(),
    nombre: lineaSolicitud(mensaje, 'Nombre'),
    direccion: lineaSolicitud(mensaje, 'Dirección') ?? lineaSolicitud(mensaje, 'Direccion'),
    municipio: lineaSolicitud(mensaje, 'Municipio'),
    pago,
  };
}
export function telefonoPedido(valor: string) {
  const numero = valor.replace(/\D/g, '');
  return /^3\d{9}$/.test(numero) ? `57${numero}` : /^573\d{9}$/.test(numero) ? numero : null;
}
const preguntas: Record<Borrador['paso'], string> = {
  producto: 'Escribe el nombre del producto que deseas pedir.',
  cantidad: 'Cuantas unidades deseas? Escribe un numero entre 1 y 20.',
  pago: 'Como deseas pagarlo: contado, credito o credicontado?',
  nombre: 'Cual es tu nombre completo para el pedido?',
  direccion: 'Cual es la direccion de entrega? Incluye barrio o referencias.',
  zona: 'En que municipio se entrega el pedido?',
  telefono: 'Cual es tu celular de contacto? Escribe los 10 digitos.',
  confirmar: 'Responde CONFIRMAR para registrar el pedido, CAMBIAR para corregirlo o CANCELAR para descartarlo.',
};
function resumen(b: Borrador) {
  return `Resumen del pedido:\n${b.nombreProducto} x${b.cantidad}\nForma de pago: ${b.pago}\nPrecio unitario: ${pesos(b.precio!)}\nTotal: ${pesos(b.precio! * b.cantidad!)}\nCliente: ${b.nombre}\nEntrega: ${b.direccion}, ${b.zona}\nCelular: ${b.telefono}\n${preguntas.confirmar}\nLa disponibilidad de entrega y aprobacion del credito las confirma un asesor.`;
}

export async function avanzarPedidoVentas(conversacionId: string, mensaje: string, version: string) {
  return db.transaction(async tx => {
    const control = await estadoAtencionVentas(conversacionId, tx);
    if (!control.automatico || control.version !== version) return { respuesta: '', pedido: null };
    const [conversacion] = await tx.select().from(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.id, conversacionId));
    const texto = normalizar(mensaje);
    const solicitudCatalogo = extraerSolicitudCatalogo(mensaje);
    const confirmado = /^(si[, ]+)?(confirmar|confirmo|confirmado)( (el )?pedido)?[.!]*$/.test(texto);
    if (!conversacion.borradorPedido && confirmado) {
      const [ultimo] = await tx.select().from(pedidosWhatsapp).where(eq(pedidosWhatsapp.conversacionId, conversacionId)).orderBy(desc(pedidosWhatsapp.creadoEn)).limit(1);
      if (ultimo && Date.now() - new Date(ultimo.creadoEn).getTime() < 24 * 60 * 60 * 1000) {
        return { respuesta: `Tu pedido #${ultimo.id} ya esta registrado (${ultimo.estado}).`, pedido: null };
      }
    }
    if (!conversacion.borradorPedido && !detectarIntencionCompra(mensaje) && !solicitudCatalogo) return null;
    let borrador: Borrador = conversacion.borradorPedido ? borradorSchema.parse(JSON.parse(conversacion.borradorPedido))
      : { id: randomUUID(), paso: 'producto', opciones: [] };
    if (/^(cancelar|cancela|cancelar pedido|no quiero|no lo quiero)[.!]*$/.test(texto)) {
      await tx.update(conversacionesWhatsapp).set({ borradorPedido: null }).where(eq(conversacionesWhatsapp.id, conversacionId));
      return { respuesta: 'Solicitud descartada. No se registro ningun pedido.', pedido: null };
    }
    if (/^(cambiar|corregir|empezar de nuevo)[.!]*$/.test(texto)) borrador = { id: randomUUID(), paso: 'producto', opciones: [] };
    const catalogo = await tx.select().from(productos).where(and(eq(productos.visible, true), eq(productos.disponible, true))).orderBy(productos.orden, productos.nombre);
    const guardar = async (respuesta: string) => {
      await tx.update(conversacionesWhatsapp).set({ borradorPedido: JSON.stringify(borrador) }).where(eq(conversacionesWhatsapp.id, conversacionId));
      return { respuesta, pedido: null };
    };
    if (borrador.paso === 'producto') {
      const opcion = /^\d+$/.test(texto) ? borrador.opciones[Number(texto) - 1] : undefined;
      let coincidencias = solicitudCatalogo
        ? catalogo.filter(p => normalizar(p.nombre) === normalizar(solicitudCatalogo.producto))
        : opcion
          ? catalogo.filter(p => p.id === opcion)
          : catalogo.filter(p => texto.includes(normalizar(p.nombre)));
      // Si "ARMARIO" también tiene variantes como "ARMARIO JUMBO", no
      // seleccionar el nombre corto sin pedir confirmación al cliente.
      if (!solicitudCatalogo && coincidencias.length === 1) {
        const base = normalizar(coincidencias[0].nombre);
        const variantes = catalogo.filter(p => p.id !== coincidencias[0].id && normalizar(p.nombre).startsWith(`${base} `));
        if (variantes.length > 0) coincidencias = [...coincidencias, ...variantes];
      }
      if (coincidencias.length === 0 && !conversacion.borradorPedido && /\b(ese|este|lo|comprarlo|pedirlo)\b/.test(texto)) {
        const ultimos = await tx.select().from(mensajesWhatsapp).where(and(eq(mensajesWhatsapp.conversacionId, conversacionId), eq(mensajesWhatsapp.rol, 'assistant'))).orderBy(desc(mensajesWhatsapp.creadoEn)).limit(10);
        for (const m of ultimos) {
          const metadata = m.metadata ? JSON.parse(m.metadata) : null;
          if (metadata?.productos?.length) { coincidencias = catalogo.filter(p => metadata.productos.includes(p.nombre)); break; }
        }
      }
      if (coincidencias.length !== 1) {
        const palabras = texto.split(/\W+/).filter(p => p.length > 3 && !['quiero', 'comprar', 'pedido', 'hacer', 'comprarlo', 'confirmar'].includes(p));
        const sugeridos = coincidencias.length ? coincidencias : catalogo.filter(p => palabras.some(w => normalizar(p.nombre).includes(w)));
        const opciones = (sugeridos.length ? sugeridos : catalogo).slice(0, 8);
        borrador.opciones = opciones.map(p => p.id);
        return guardar(opciones.length ? `Cual producto deseas? Responde con el numero o nombre:\n${opciones.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n')}` : 'No hay productos disponibles para pedidos. Un asesor puede ayudarte.');
      }
      borrador.productoId = coincidencias[0].id; borrador.nombreProducto = coincidencias[0].nombre;
      borrador.opciones = [];

      if (solicitudCatalogo) {
        borrador.cantidad = 1;
        borrador.nombre = solicitudCatalogo.nombre;
        borrador.direccion = solicitudCatalogo.direccion;
        borrador.zona = solicitudCatalogo.municipio;
        borrador.telefono = telefonoPedido(conversacion.telefono) ?? undefined;
        if (solicitudCatalogo.pago) {
          borrador.pago = solicitudCatalogo.pago;
          borrador.precio = solicitudCatalogo.pago === 'contado' ? coincidencias[0].precioContado
            : solicitudCatalogo.pago === 'credito' ? coincidencias[0].precioCredito
              : coincidencias[0].precioCredicontado;
        }
        if (!borrador.pago || !borrador.precio || borrador.precio <= 0) {
          borrador.paso = 'pago';
          return guardar(`${borrador.nombreProducto}. ${preguntas.pago}\nContado: ${pesos(coincidencias[0].precioContado)}\nCredito: ${pesos(coincidencias[0].precioCredito)}\nCredicontado: ${pesos(coincidencias[0].precioCredicontado)}`);
        }
        if (!borrador.nombre || !borrador.direccion || !borrador.zona) {
          borrador.paso = !borrador.nombre ? 'nombre' : !borrador.direccion ? 'direccion' : 'zona';
          return guardar(preguntas[borrador.paso]);
        }
        if (!borrador.telefono) {
          borrador.paso = 'telefono';
          return guardar(preguntas.telefono);
        }
        borrador.paso = 'confirmar';
        return guardar(resumen(borrador));
      }

      borrador.paso = 'cantidad';
      return guardar(`${borrador.nombreProducto}. ${preguntas.cantidad}`);
    }
    const producto = catalogo.find(p => p.id === borrador.productoId);
    if (!producto) {
      borrador = { id: randomUUID(), paso: 'producto', opciones: [] };
      return guardar(`El producto ya no esta disponible. ${preguntas.producto}`);
    }
    if (borrador.paso === 'cantidad') {
      const cantidad = /^(\d+)(\s+(unidad|unidades))?$/.exec(texto)?.[1];
      if (!cantidad || Number(cantidad) < 1 || Number(cantidad) > 20) return guardar(preguntas.cantidad);
      borrador.cantidad = Number(cantidad); borrador.paso = 'pago';
      return guardar(`${preguntas.pago}\nContado: ${pesos(producto.precioContado)}\nCredito: ${pesos(producto.precioCredito)}\nCredicontado: ${pesos(producto.precioCredicontado)}`);
    }
    if (borrador.paso === 'pago') {
      if (['contado', 'credito', 'credicontado'].filter(pago => new RegExp(`\\b${pago}\\b`).test(texto)).length !== 1) return guardar(preguntas.pago);
      const pago = /\bcredicontado\b/.test(texto) ? 'credicontado' : /\bcredito\b/.test(texto) ? 'credito' : /\bcontado\b/.test(texto) ? 'contado' : null;
      if (!pago) return guardar(preguntas.pago);
      const precio = pago === 'contado' ? producto.precioContado : pago === 'credito' ? producto.precioCredito : producto.precioCredicontado;
      if (precio <= 0) return guardar('Esa modalidad no tiene precio configurado. Elige otra modalidad o pide un asesor.');
      borrador.pago = pago; borrador.precio = precio; borrador.paso = 'nombre';
      return guardar(preguntas.nombre);
    }
    if (borrador.paso === 'nombre') {
      if (mensaje.trim().split(/\s+/).length < 2 || mensaje.length > 150) return guardar(preguntas.nombre);
      borrador.nombre = mensaje.trim(); borrador.paso = 'direccion'; return guardar(preguntas.direccion);
    }
    if (borrador.paso === 'direccion') {
      if (mensaje.trim().length < 8 || mensaje.length > 500) return guardar(preguntas.direccion);
      borrador.direccion = mensaje.trim(); borrador.paso = 'zona'; return guardar(preguntas.zona);
    }
    if (borrador.paso === 'zona') {
      if (mensaje.trim().length < 3 || mensaje.length > 100) return guardar(preguntas.zona);
      borrador.zona = mensaje.trim(); borrador.telefono = telefonoPedido(conversacion.telefono) ?? undefined;
      borrador.paso = borrador.telefono ? 'confirmar' : 'telefono';
      return guardar(borrador.telefono ? resumen(borrador) : preguntas.telefono);
    }
    if (borrador.paso === 'telefono') {
      const telefono = telefonoPedido(mensaje);
      if (!telefono) return guardar(preguntas.telefono);
      borrador.telefono = telefono; borrador.paso = 'confirmar'; return guardar(resumen(borrador));
    }
    const precioActual = borrador.pago === 'contado' ? producto.precioContado : borrador.pago === 'credito' ? producto.precioCredito : producto.precioCredicontado;
    if (precioActual !== borrador.precio || producto.nombre !== borrador.nombreProducto) {
      borrador.precio = precioActual; borrador.nombreProducto = producto.nombre;
      if (precioActual <= 0) { borrador.paso = 'pago'; return guardar(preguntas.pago); }
      return guardar(`El catalogo cambio. Revisa y confirma nuevamente:\n${resumen(borrador)}`);
    }
    if (!confirmado) return guardar(resumen(borrador));
    const pedido = await registrarPedidoSimple({ id: borrador.id, conversacionId, telefono: borrador.telefono!, nombreContacto: borrador.nombre,
      direccion: borrador.direccion, zona: borrador.zona, producto: { nombre: producto.nombre, precio: borrador.precio!, cantidad: borrador.cantidad! },
      resumenConversacion: `Forma de pago: ${borrador.pago}. Confirmado por el cliente. Pendiente de revision comercial.` }, tx);
    await tx.update(conversacionesWhatsapp).set({ borradorPedido: null, nombreCliente: borrador.nombre }).where(eq(conversacionesWhatsapp.id, conversacionId));
    return { respuesta: `Pedido #${pedido.id} registrado por ${pesos(pedido.total / 100)}. Un asesor revisara la entrega y las condiciones de pago.`, pedido };
  });
}
