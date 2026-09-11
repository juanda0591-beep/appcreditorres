import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, esquema } from '../db/cliente.js';
import { eq, desc } from 'drizzle-orm';

const {
  conversacionesWhatsapp,
  mensajesWhatsapp,
  pedidosWhatsapp,
} = esquema;

/**
 * Rutas para el webhook de WhatsApp Business API
 */
export async function rutasWhatsapp(app: FastifyInstance) {
  /**
   * Verificación del webhook (requerido por Meta)
   * Meta envía este request para verificar que tu servidor es válido
   */
  app.get<{ Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string } }>(
    '/webhook',
    async (request, reply) => {
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'];

      // Token de verificación - debe coincidir con el que configuras en Meta
      const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'mi_token_secreto';

      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verificado');
        return reply.send(challenge);
      }

      return reply.code(403).send('Forbidden');
    },
  );

  /**
   * Recibir mensajes de WhatsApp
   * Meta envía los mensajes aquí cuando un cliente escribe
   */
  app.post('/webhook', async (request, reply) => {
    try {
      const body = request.body as any;

      // Validar que es un mensaje válido
      if (!body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        return reply.send({ success: true });
      }

      const mensaje = body.entry[0].changes[0].value.messages[0];
      const telefono = mensaje.from; // Número del cliente

      // Manejar mensajes de audio
      if (mensaje.type === 'audio' && mensaje.audio?.id) {
        console.log(`Audio recibido de ${telefono}, ID: ${mensaje.audio.id}`);

        const { procesarAudioWhatsApp } = await import('../whatsapp/procesar-audio.js');
        const { respuestaVentasPermitida } = await import('../whatsapp/atencion-ventas.js');

        await procesarAudioWhatsApp(telefono, mensaje.audio.id, mensaje.id);

        return reply.send({ success: true });
      }

      // Manejar mensajes de texto
      const textoMensaje = mensaje.text?.body || '';

      if (!textoMensaje) {
        return reply.send({ success: true });
      }

      console.log(`Mensaje recibido de ${telefono}: ${textoMensaje}`);

      const { procesarMensajeWhatsApp } = await import('../whatsapp/procesar-mensaje.js');
      const { respuestaVentasPermitida } = await import('../whatsapp/atencion-ventas.js');
      const respuesta = await procesarMensajeWhatsApp(telefono, textoMensaje, undefined, telefono, { externoId: mensaje.id, transporte: 'cloud' });
      if (respuesta && await respuestaVentasPermitida(telefono)) await enviarMensajeWhatsApp(telefono, respuesta);

      return reply.send({ success: true });
    } catch (error) {
      console.error('Error procesando mensaje de WhatsApp:', error);
      return reply.code(500).send({ error: 'Error interno del servidor' });
    }
  });

  /**
   * Obtener conversaciones activas
   */
  app.get('/conversaciones', async (request, reply) => {
    const conversaciones = await db
      .select()
      .from(conversacionesWhatsapp)
      .orderBy(desc(conversacionesWhatsapp.actualizadoEn))
      .limit(50);

    return conversaciones;
  });

  /**
   * Obtener historial de una conversación
   */
  app.get<{ Params: { id: string } }>(
    '/conversaciones/:id/mensajes',
    async (request, reply) => {
      const mensajes = await db
        .select()
        .from(mensajesWhatsapp)
        .where(eq(mensajesWhatsapp.conversacionId, request.params.id))
        .orderBy(mensajesWhatsapp.creadoEn);

      return mensajes;
    },
  );

  /**
   * Crear pedido desde conversación
   */
  app.post<{
    Body: {
      conversacionId: string;
      nombreCliente: string;
      direccion?: string;
      productos: Array<{ nombre: string; precio: number; cantidad: number }>;
      notas?: string;
    };
  }>('/pedidos', async (request, reply) => {
    const { conversacionId, nombreCliente, direccion, productos, notas } =
      request.body;

    const total = productos.reduce(
      (sum: number, p: any) => sum + p.precio * p.cantidad,
      0,
    );

    const [conversacion] = await db
      .select()
      .from(conversacionesWhatsapp)
      .where(eq(conversacionesWhatsapp.id, conversacionId))
      .limit(1);

    if (!conversacion) {
      return reply.code(404).send({ error: 'Conversación no encontrada' });
    }

    const ahora = new Date().toISOString();
    const [pedido] = await db
      .insert(pedidosWhatsapp)
      .values({
        id: nanoid(),
        conversacionId,
        telefono: conversacion.telefono,
        nombreCliente,
        direccion,
        productos: JSON.stringify(productos),
        total: Math.round(total * 100), // Convertir a centavos
        estado: 'pendiente',
        notas,
        creadoEn: ahora,
        actualizadoEn: ahora,
      })
      .returning();

    // Enviar confirmación por WhatsApp
    const mensaje = `✅ Pedido confirmado!\n\n*Resumen:*\n${productos
      .map((p: any) => `${p.cantidad}x ${p.nombre} - $${p.precio}`)
      .join('\n')}\n\n*Total: $${total}*\n\nTe contactaremos pronto para confirmar la entrega.`;

    await enviarMensajeWhatsApp(conversacion.telefono, mensaje);

    return pedido;
  });
}

/**
 * Enviar mensaje de texto a WhatsApp
 */
async function enviarMensajeWhatsApp(
  telefono: string,
  mensaje: string,
): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado - mensaje no enviado');
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefono,
          type: 'text',
          text: { body: mensaje },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Error enviando mensaje WhatsApp:', error);
    }
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
  }
}

/**
 * Enviar imagen con caption a WhatsApp
 */
async function enviarImagenWhatsApp(
  telefono: string,
  imagenUrl: string,
  caption: string,
): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado - imagen no enviada');
    return;
  }

  try {
    // La URL de la imagen debe ser accesible públicamente
    const imagenUrlCompleta = imagenUrl.startsWith('http')
      ? imagenUrl
      : `${process.env.PUBLIC_URL || 'http://localhost:3000'}${imagenUrl}`;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefono,
          type: 'image',
          image: {
            link: imagenUrlCompleta,
            caption: caption,
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Error enviando imagen WhatsApp:', error);
    }
  } catch (error) {
    console.error('Error al enviar imagen:', error);
  }
}
