import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { db, esquema } from '../db/cliente.js';
import { eq, desc } from 'drizzle-orm';
import { generarRespuestaIA, buscarProductosRelevantes } from '../servicios/agente-ia.js';

const {
  conversacionesWhatsapp,
  mensajesWhatsapp,
  pedidosWhatsapp,
  productos,
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
      const textoMensaje = mensaje.text?.body || '';

      if (!textoMensaje) {
        return reply.send({ success: true });
      }

      console.log(`Mensaje recibido de ${telefono}: ${textoMensaje}`);

      // 1. Buscar o crear conversación
      let [conversacion] = await db
        .select()
        .from(conversacionesWhatsapp)
        .where(eq(conversacionesWhatsapp.telefono, telefono))
        .limit(1);

      if (!conversacion) {
        const ahora = new Date().toISOString();
        [conversacion] = await db
          .insert(conversacionesWhatsapp)
          .values({
            id: nanoid(),
            telefono,
            estado: 'activa',
            ultimoMensaje: textoMensaje,
            creadoEn: ahora,
            actualizadoEn: ahora,
          })
          .returning();
      }

      // 2. Guardar mensaje del usuario
      await db.insert(mensajesWhatsapp).values({
        id: nanoid(),
        conversacionId: conversacion!.id,
        rol: 'user',
        contenido: textoMensaje,
        creadoEn: new Date().toISOString(),
      });

      // 3. Obtener historial de conversación (últimos 10 mensajes)
      const historialDB = await db
        .select()
        .from(mensajesWhatsapp)
        .where(eq(mensajesWhatsapp.conversacionId, conversacion!.id))
        .orderBy(desc(mensajesWhatsapp.creadoEn))
        .limit(10);

      const historial = historialDB.reverse().map((msg) => ({
        role: msg.rol as 'user' | 'assistant' | 'system',
        content: msg.contenido,
      }));

      // 4. Obtener productos disponibles
      const todosProductos = await db.select().from(productos);

      const productosContexto = todosProductos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        precio: p.precioContado,
        precioPromocion: p.enPromocion ? p.precioContado * 0.9 : undefined,
        enPromocion: p.enPromocion,
        imagenUrl: p.imagenes ? `/uploads/${JSON.parse(p.imagenes)[0]}` : undefined,
      }));

      // 5. Buscar productos relevantes
      const productosRelevantes = buscarProductosRelevantes(
        textoMensaje,
        productosContexto,
      );

      // 6. Generar respuesta con OpenAI
      const respuestaIA = await generarRespuestaIA(
        textoMensaje,
        productosRelevantes,
        historial,
      );

      // 7. Guardar respuesta del asistente
      await db.insert(mensajesWhatsapp).values({
        id: nanoid(),
        conversacionId: conversacion!.id,
        rol: 'assistant',
        contenido: respuestaIA,
        metadata: JSON.stringify({
          productosRelevantes: productosRelevantes.map((p) => p.id),
        }),
        creadoEn: new Date().toISOString(),
      });

      // 8. Actualizar conversación
      await db
        .update(conversacionesWhatsapp)
        .set({
          ultimoMensaje: respuestaIA,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(conversacionesWhatsapp.id, conversacion!.id));

      // 9. Enviar respuesta a WhatsApp
      await enviarMensajeWhatsApp(telefono, respuestaIA);

      // 10. Si hay productos relevantes con imagen, enviarlas
      if (productosRelevantes.length > 0) {
        for (const producto of productosRelevantes.slice(0, 3)) {
          // Máximo 3 productos
          if (producto.imagenUrl) {
            await enviarImagenWhatsApp(
              telefono,
              producto.imagenUrl,
              `${producto.nombre} - $${producto.enPromocion ? producto.precioPromocion : producto.precio}`,
            );
          }
        }
      }

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
