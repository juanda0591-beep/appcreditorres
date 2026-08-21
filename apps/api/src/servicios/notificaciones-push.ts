import webpush from 'web-push';
import { db, esquema } from '../db/cliente.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const { suscripcionesPush } = esquema;

// Configurar VAPID (estas claves deben estar en variables de entorno en producción)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLj3CZhcEmRdw9NTMVLbhVLvzGt5Fk7Jrm-U7RDto0giz3auw8DqmlF-gcrn9EXwqLkO33w-pesF28TS9jOK68Q';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '6IGnrwTPlXUD77y7RJd60j_kO22Ebop7xjhdBLSmMg8';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@creditostorres.com';

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export interface SuscripcionPush {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Guardar una nueva suscripción push
 */
export async function guardarSuscripcion(usuarioId: string, suscripcion: SuscripcionPush) {
  const ahora = new Date().toISOString();

  // Verificar si ya existe una suscripción con este endpoint
  const existente = await db
    .select()
    .from(suscripcionesPush)
    .where(eq(suscripcionesPush.endpoint, suscripcion.endpoint))
    .limit(1);

  if (existente.length > 0) {
    // Actualizar suscripción existente
    await db
      .update(suscripcionesPush)
      .set({
        usuarioId,
        p256dh: suscripcion.keys.p256dh,
        auth: suscripcion.keys.auth,
        activo: true,
        actualizadoEn: ahora
      })
      .where(eq(suscripcionesPush.endpoint, suscripcion.endpoint));

    return existente[0];
  }

  // Crear nueva suscripción
  const [nueva] = await db
    .insert(suscripcionesPush)
    .values({
      id: nanoid(),
      usuarioId,
      endpoint: suscripcion.endpoint,
      p256dh: suscripcion.keys.p256dh,
      auth: suscripcion.keys.auth,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora
    })
    .returning();

  return nueva;
}

/**
 * Enviar notificación push a todos los usuarios suscritos
 */
export async function enviarNotificacionPedido(datos: {
  titulo: string;
  mensaje: string;
  telefono: string;
  producto?: string;
}) {
  // Obtener todas las suscripciones activas
  const suscripciones = await db
    .select()
    .from(suscripcionesPush)
    .where(eq(suscripcionesPush.activo, true));

  if (suscripciones.length === 0) {
    console.log('No hay suscripciones push activas');
    return;
  }

  const payload = JSON.stringify({
    title: datos.titulo,
    body: datos.mensaje,
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    tag: 'pedido-nuevo',
    data: {
      telefono: datos.telefono,
      producto: datos.producto,
      url: '/admin' // URL a abrir cuando se hace clic en la notificación
    }
  });

  // Enviar notificación a cada suscripción
  const promesas = suscripciones.map(async (suscripcion) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: suscripcion.endpoint,
          keys: {
            p256dh: suscripcion.p256dh,
            auth: suscripcion.auth
          }
        },
        payload
      );
      console.log('Notificación push enviada exitosamente');
    } catch (error: any) {
      console.error('Error al enviar notificación push:', error);

      // Si la suscripción expiró o es inválida, desactivarla
      if (error.statusCode === 410 || error.statusCode === 404) {
        await db
          .update(suscripcionesPush)
          .set({ activo: false, actualizadoEn: new Date().toISOString() })
          .where(eq(suscripcionesPush.id, suscripcion.id));

        console.log('Suscripción desactivada:', suscripcion.endpoint);
      }
    }
  });

  await Promise.allSettled(promesas);
}

/**
 * Obtener la clave pública VAPID para el cliente
 */
export function obtenerClavePublicaVAPID(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Eliminar una suscripción
 */
export async function eliminarSuscripcion(endpoint: string) {
  await db
    .delete(suscripcionesPush)
    .where(eq(suscripcionesPush.endpoint, endpoint));
}
