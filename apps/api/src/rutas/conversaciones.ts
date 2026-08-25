import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/cliente.js';
import {
  conversacionesWhatsapp,
  mensajesWhatsapp,
  pedidosWhatsapp
} from '../db/esquema/whatsapp.js';
import { eq, desc, sql, and } from 'drizzle-orm';

export const rutasConversaciones: FastifyPluginAsync = async (app) => {

  /**
   * Listar todas las conversaciones con resumen de mensajes y pedidos
   */
  app.get('/admin/conversaciones', async (req, res) => {
    const usuario = req.usuario;
    if (!usuario || usuario.rol !== 'admin') {
      return res.status(401).send({ error: 'No autorizado' });
    }

    try {
      // Obtener todas las conversaciones con información agregada
      const conversaciones = await db
        .select({
          id: conversacionesWhatsapp.id,
          telefono: conversacionesWhatsapp.telefono,
          nombreCliente: conversacionesWhatsapp.nombreCliente,
          estado: conversacionesWhatsapp.estado,
          ultimoMensaje: conversacionesWhatsapp.ultimoMensaje,
          creadoEn: conversacionesWhatsapp.creadoEn,
          actualizadoEn: conversacionesWhatsapp.actualizadoEn,
          cantidadMensajes: sql<number>`(
            SELECT COUNT(*)
            FROM ${mensajesWhatsapp}
            WHERE ${mensajesWhatsapp.conversacionId} = ${conversacionesWhatsapp.id}
          )`,
          tienePedidos: sql<boolean>`(
            SELECT COUNT(*) > 0
            FROM ${pedidosWhatsapp}
            WHERE ${pedidosWhatsapp.conversacionId} = ${conversacionesWhatsapp.id}
          )`,
          pedidos: sql<Array<{ id: string; estado: string }>>`(
            SELECT json_group_array(
              json_object('id', id, 'estado', estado)
            )
            FROM ${pedidosWhatsapp}
            WHERE ${pedidosWhatsapp.conversacionId} = ${conversacionesWhatsapp.id}
          )`
        })
        .from(conversacionesWhatsapp)
        .orderBy(desc(conversacionesWhatsapp.actualizadoEn));

      // Parsear el JSON de pedidos
      const conversacionesProcesadas = conversaciones.map(conv => ({
        ...conv,
        pedidos: typeof conv.pedidos === 'string' && conv.pedidos !== '[]'
          ? JSON.parse(conv.pedidos)
          : [],
        tienePedidos: Boolean(conv.tienePedidos)
      }));

      return res.send({ conversaciones: conversacionesProcesadas });
    } catch (error) {
      console.error('Error al obtener conversaciones:', error);
      return res.status(500).send({ error: 'Error al obtener conversaciones' });
    }
  });

  /**
   * Obtener detalle de una conversación con todos sus mensajes y pedidos
   */
  app.get<{ Params: { id: string } }>('/admin/conversaciones/:id', async (req, res) => {
    const usuario = req.usuario;
    if (!usuario || usuario.rol !== 'admin') {
      return res.status(401).send({ error: 'No autorizado' });
    }

    const { id } = req.params;

    try {
      // Obtener la conversación
      const [conversacion] = await db
        .select()
        .from(conversacionesWhatsapp)
        .where(eq(conversacionesWhatsapp.id, id))
        .limit(1);

      if (!conversacion) {
        return res.status(404).send({ error: 'Conversación no encontrada' });
      }

      // Obtener mensajes ordenados cronológicamente
      const mensajes = await db
        .select({
          id: mensajesWhatsapp.id,
          conversacionId: mensajesWhatsapp.conversacionId,
          rol: mensajesWhatsapp.rol,
          contenido: mensajesWhatsapp.contenido,
          metadata: mensajesWhatsapp.metadata,
          creadoEn: mensajesWhatsapp.creadoEn
        })
        .from(mensajesWhatsapp)
        .where(eq(mensajesWhatsapp.conversacionId, id))
        .orderBy(mensajesWhatsapp.creadoEn);

      // Parsear metadata de mensajes
      const mensajesProcesados = mensajes.map(msg => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null
      }));

      // Obtener pedidos asociados
      const pedidos = await db
        .select()
        .from(pedidosWhatsapp)
        .where(eq(pedidosWhatsapp.conversacionId, id))
        .orderBy(desc(pedidosWhatsapp.creadoEn));

      // Parsear productos de cada pedido
      const pedidosProcesados = pedidos.map(p => ({
        ...p,
        productos: JSON.parse(p.productos)
      }));

      return res.send({
        conversacion: {
          ...conversacion,
          cantidadMensajes: mensajes.length,
          tienePedidos: pedidos.length > 0,
          pedidos: pedidos.map(p => ({ id: p.id, estado: p.estado }))
        },
        mensajes: mensajesProcesados,
        pedidos: pedidosProcesados
      });
    } catch (error) {
      console.error('Error al obtener detalle de conversación:', error);
      return res.status(500).send({ error: 'Error al obtener detalle de conversación' });
    }
  });
};
