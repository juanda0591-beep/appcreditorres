import type { FastifyInstance } from 'fastify';
import { obtenerEstadoConexion, desconectarWhatsApp, conectarWhatsApp, limpiarSesionWhatsApp, enviarMensajeWhatsApp } from '../whatsapp/baileys-client.js';
import { obtenerLogsActividad, obtenerEstadisticas, obtenerHistorialConversaciones, obtenerProductosMasConsultados } from '../whatsapp/procesar-mensaje.js';

export async function rutasAdminWhatsApp(app: FastifyInstance) {
  // Obtener estado de conexión y QR
  app.get('/admin/whatsapp/estado', async (request, reply) => {
    const estado = obtenerEstadoConexion();
    return estado;
  });

  // Obtener logs de actividad
  app.get('/admin/whatsapp/logs', async (request, reply) => {
    const logs = obtenerLogsActividad(50);
    return { logs };
  });

  // Obtener estadísticas del día
  app.get('/admin/whatsapp/estadisticas', async (request, reply) => {
    const estadisticas = obtenerEstadisticas();
    return estadisticas;
  });

  // Obtener historial de conversaciones
  app.get('/admin/whatsapp/conversaciones', async (request, reply) => {
    const conversaciones = obtenerHistorialConversaciones();
    return { conversaciones };
  });

  // Obtener productos más consultados
  app.get('/admin/whatsapp/productos-consultados', async (request, reply) => {
    const productos = obtenerProductosMasConsultados(10);
    return { productos };
  });

  // Enviar mensaje de prueba
  app.post<{ Body: { telefono: string; mensaje: string } }>('/admin/whatsapp/prueba', async (request, reply) => {
    try {
      const { telefono, mensaje } = request.body;

      if (!telefono || !mensaje) {
        reply.status(400);
        return { success: false, error: 'Teléfono y mensaje son requeridos' };
      }

      await enviarMensajeWhatsApp(telefono, mensaje);
      return { success: true, message: 'Mensaje enviado correctamente' };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Error al enviar mensaje de prueba' };
    }
  });

  // Reconectar WhatsApp
  app.post('/admin/whatsapp/reconectar', async (request, reply) => {
    try {
      request.log.info('Iniciando reconexión de WhatsApp');

      // Limpiar sesión anterior para generar nuevo QR
      await limpiarSesionWhatsApp();
      request.log.info('Sesión limpiada');

      // Esperar un momento antes de reconectar
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Intentar conectar
      request.log.info('Iniciando nueva conexión');
      await conectarWhatsApp();

      return { success: true, message: 'Reconectando WhatsApp. Escanea el código QR.' };
    } catch (error) {
      request.log.error({ err: error }, 'Error al reconectar WhatsApp');
      reply.status(500);
      return {
        success: false,
        error: 'Error al reconectar',
        detalles: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  });

  // Desconectar WhatsApp
  app.post('/admin/whatsapp/desconectar', async (request, reply) => {
    try {
      await desconectarWhatsApp();
      return { success: true, message: 'WhatsApp desconectado' };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Error al desconectar' };
    }
  });
}
