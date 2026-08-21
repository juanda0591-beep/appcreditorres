import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  guardarSuscripcion,
  eliminarSuscripcion,
  obtenerClavePublicaVAPID
} from '../servicios/notificaciones-push.js';

const esquemaSuscripcion = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string()
  })
});

export const rutasNotificaciones: FastifyPluginAsyncZod = async (app) => {
  /**
   * Obtener la clave pública VAPID
   */
  app.get('/api/notificaciones/vapid-public-key', async (_request, reply) => {
    const clavePublica = obtenerClavePublicaVAPID();
    return reply.send({ publicKey: clavePublica });
  });

  /**
   * Suscribirse a notificaciones push
   */
  app.post(
    '/api/notificaciones/suscribir',
    {
      schema: {
        body: esquemaSuscripcion
      }
    },
    async (request, reply) => {
      const usuarioId = (request as any).session?.usuarioId;

      if (!usuarioId) {
        return reply.code(401).send({ error: 'No autenticado' });
      }

      const suscripcion = request.body;

      try {
        await guardarSuscripcion(usuarioId, suscripcion);
        return reply.send({ success: true, message: 'Suscripción guardada correctamente' });
      } catch (error) {
        console.error('Error al guardar suscripción:', error);
        return reply.code(500).send({ error: 'Error al guardar suscripción' });
      }
    }
  );

  /**
   * Desuscribirse de notificaciones push
   */
  app.post(
    '/api/notificaciones/desuscribir',
    {
      schema: {
        body: z.object({
          endpoint: z.string()
        })
      }
    },
    async (request, reply) => {
      const { endpoint } = request.body;

      try {
        await eliminarSuscripcion(endpoint);
        return reply.send({ success: true, message: 'Desuscripción exitosa' });
      } catch (error) {
        console.error('Error al desuscribir:', error);
        return reply.code(500).send({ error: 'Error al desuscribir' });
      }
    }
  );
};
