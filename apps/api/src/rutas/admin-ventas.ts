import type { FastifyPluginAsync } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/cliente.js';
import { ajustesVentas, conversacionesWhatsapp, pedidosWhatsapp } from '../db/esquema/whatsapp.js';
import { productos } from '../db/esquema/productos.js';
import { registrarMensajeVentas } from '../whatsapp/atencion-ventas.js';
import { enviarMensajeWhatsApp } from '../whatsapp/baileys-client.js';
import { registrarPedidoSimple } from '../whatsapp/gestor-pedidos.js';
import { telefonoPedido } from '../whatsapp/flujo-pedido-ventas.js';
import { ErrorDatosInvalidos, ErrorNoEncontrado } from '../errores.js';
function validar<T>(schema: z.ZodType<T>, valor: unknown) {
  const result = schema.safeParse(valor);
  if (!result.success) throw new ErrorDatosInvalidos(result.error.issues[0]?.message ?? 'Datos invalidos');
  return result.data;
}
export const rutasAdminVentas: FastifyPluginAsync = async app => {
  app.addHook('onRequest', async (req, reply) => { if (req.usuario?.rol !== 'admin') return reply.code(403).send({ mensaje: 'No autorizado' }); });
  app.get('/modo', async () => (await db.select().from(ajustesVentas).where(eq(ajustesVentas.id, 'principal')))[0] ?? { modo: 'automatico', revision: 0 });
  app.put('/modo', async request => {
    const { modo } = validar(z.object({ modo: z.enum(['automatico', 'manual']) }), request.body);
    const [config] = await db.insert(ajustesVentas).values({ id: 'principal', modo, revision: 1 })
      .onConflictDoUpdate({ target: ajustesVentas.id, set: { modo, revision: sql`${ajustesVentas.revision} + 1` } }).returning();
    return config;
  });
  app.patch('/conversaciones/:id/modo', async request => {
    const { id } = validar(z.object({ id: z.string().min(1) }), request.params);
    const { modo } = validar(z.object({ modo: z.enum(['automatico', 'manual']) }), request.body);
    const [conversacion] = await db.update(conversacionesWhatsapp).set({ modoAtencion: modo, revisionAtencion: sql`${conversacionesWhatsapp.revisionAtencion} + 1` })
      .where(eq(conversacionesWhatsapp.id, id)).returning();
    if (!conversacion) throw new ErrorNoEncontrado('Conversacion no encontrada');
    return { conversacion };
  });
  app.post('/conversaciones/:id/enviar', async request => {
    const { id } = validar(z.object({ id: z.string().min(1) }), request.params);
    const { mensaje } = validar(z.object({ mensaje: z.string().trim().min(1).max(8000) }), request.body);
    const [conv] = await db.update(conversacionesWhatsapp).set({ modoAtencion: 'manual', revisionAtencion: sql`${conversacionesWhatsapp.revisionAtencion} + 1` }).where(eq(conversacionesWhatsapp.id, id)).returning();
    if (!conv) throw new ErrorNoEncontrado('Conversacion no encontrada');
    if (conv.transporte === 'cloud') {
      const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneId) throw new ErrorDatosInvalidos('WhatsApp Business API no esta configurado');
      const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, { method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.telefono, type: 'text', text: { body: mensaje } }) });
      if (!res.ok) throw new ErrorDatosInvalidos('WhatsApp no acepto el mensaje');
    } else {
      const destino = conv.jid ?? telefonoPedido(conv.telefono);
      if (!destino) throw new ErrorDatosInvalidos('La conversacion no tiene un destino de WhatsApp valido');
      await enviarMensajeWhatsApp(destino, mensaje, 'ventas');
    }
    await registrarMensajeVentas(id, 'assistant', mensaje, { origen: 'gestor', nombreUsuario: request.usuario!.nombre });
    return { success: true };
  });
  app.get('/catalogo', async () => ({ productos: await db.select({ id: productos.id, nombre: productos.nombre, contado: productos.precioContado, credito: productos.precioCredito, credicontado: productos.precioCredicontado })
    .from(productos).where(and(eq(productos.visible, true), eq(productos.disponible, true))).orderBy(productos.nombre) }));
  app.post('/pedidos', async request => {
    const datos = validar(z.object({ id: z.string().uuid(), conversacionId: z.string().min(1), productoId: z.string().min(1), cantidad: z.number().int().min(1).max(20),
      pago: z.enum(['contado', 'credito', 'credicontado']), nombre: z.string().trim().min(3).max(150), direccion: z.string().trim().min(8).max(500),
      zona: z.string().trim().min(3).max(100), telefono: z.string().trim(), notas: z.string().max(2000).default('') }), request.body);
    const telefono = telefonoPedido(datos.telefono);
    if (!telefono) throw new ErrorDatosInvalidos('Celular de contacto invalido');
    return db.transaction(async tx => {
      const [existente] = await tx.select().from(pedidosWhatsapp).where(eq(pedidosWhatsapp.id, datos.id));
      if (existente) {
        if (existente.conversacionId !== datos.conversacionId) throw new ErrorDatosInvalidos('El pedido pertenece a otra conversacion');
        return { pedido: existente };
      }
      const [conv] = await tx.select().from(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.id, datos.conversacionId));
      if (!conv) throw new ErrorNoEncontrado('Conversacion no encontrada');
      const [producto] = await tx.select().from(productos).where(and(eq(productos.id, datos.productoId), eq(productos.visible, true), eq(productos.disponible, true)));
      if (!producto) throw new ErrorDatosInvalidos('Producto no disponible');
      const precio = datos.pago === 'contado' ? producto.precioContado : datos.pago === 'credito' ? producto.precioCredito : producto.precioCredicontado;
      if (precio <= 0) throw new ErrorDatosInvalidos('La modalidad no tiene precio configurado');
      const pedido = await registrarPedidoSimple({ id: datos.id, conversacionId: conv.id, telefono, nombreContacto: datos.nombre, direccion: datos.direccion, zona: datos.zona,
        producto: { nombre: producto.nombre, precio, cantidad: datos.cantidad }, resumenConversacion: `Forma de pago: ${datos.pago}. Registrado por ${request.usuario!.nombre}. ${datos.notas}` }, tx);
      await tx.update(conversacionesWhatsapp).set({ borradorPedido: null, modoAtencion: 'manual', revisionAtencion: sql`${conversacionesWhatsapp.revisionAtencion} + 1` }).where(eq(conversacionesWhatsapp.id, conv.id));
      return { pedido };
    });
  });
};
