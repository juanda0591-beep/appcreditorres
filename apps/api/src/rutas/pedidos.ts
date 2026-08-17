import type { FastifyInstance } from 'fastify';
import { obtenerTodosPedidos, actualizarEstadoPedido } from '../whatsapp/gestor-pedidos.js';

export async function rutasPedidos(app: FastifyInstance) {
  // Obtener todos los pedidos
  app.get('/admin/pedidos', async (request, reply) => {
    try {
      const pedidos = await obtenerTodosPedidos();
      return { pedidos };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Error al obtener pedidos' };
    }
  });

  // Actualizar estado de un pedido
  app.patch<{
    Params: { id: string };
    Body: { estado: string };
  }>('/admin/pedidos/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const { estado } = request.body;

      await actualizarEstadoPedido(id, estado);

      return { success: true, message: 'Estado actualizado' };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Error al actualizar pedido' };
    }
  });
}
