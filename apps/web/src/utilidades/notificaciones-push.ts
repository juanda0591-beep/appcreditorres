/**
 * Utilidades para manejar notificaciones push
 */

/**
 * Convertir una clave pública VAPID de base64 a Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Verificar si el navegador soporta notificaciones push
 */
export function soportaNotificacionesPush(): boolean {
  return 'serviceWorker' in navigator &&
         'PushManager' in window &&
         'Notification' in window;
}

/**
 * Obtener el estado actual de los permisos de notificación
 */
export function obtenerEstadoPermisos(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Solicitar permiso para notificaciones
 */
export async function solicitarPermisoNotificaciones(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Este navegador no soporta notificaciones');
  }

  const permiso = await Notification.requestPermission();
  return permiso;
}

/**
 * Suscribirse a notificaciones push
 */
export async function suscribirseANotificaciones(): Promise<boolean> {
  try {
    // Verificar soporte
    if (!soportaNotificacionesPush()) {
      console.warn('El navegador no soporta notificaciones push');
      return false;
    }

    // Solicitar permiso si no se ha otorgado
    if (Notification.permission === 'default') {
      const permiso = await solicitarPermisoNotificaciones();
      if (permiso !== 'granted') {
        console.warn('Permiso de notificaciones denegado');
        return false;
      }
    }

    if (Notification.permission !== 'granted') {
      console.warn('No hay permiso para notificaciones');
      return false;
    }

    // Obtener el service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Obtener la clave pública VAPID del servidor
    const response = await fetch('/api/notificaciones/vapid-public-key', {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('No se pudo obtener la clave pública VAPID');
    }

    const { publicKey } = await response.json();

    // Suscribirse a push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
    });

    // Enviar la suscripción al servidor
    const suscripcionResponse = await fetch('/api/notificaciones/suscribir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(subscription.toJSON())
    });

    if (!suscripcionResponse.ok) {
      throw new Error('No se pudo guardar la suscripción en el servidor');
    }

    console.log('Suscripción a notificaciones push exitosa');
    return true;

  } catch (error) {
    console.error('Error al suscribirse a notificaciones:', error);
    return false;
  }
}

/**
 * Desuscribirse de notificaciones push
 */
export async function desuscribirseDeNotificaciones(): Promise<boolean> {
  try {
    if (!soportaNotificacionesPush()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.warn('No hay suscripción activa');
      return true;
    }

    // Desuscribirse localmente
    await subscription.unsubscribe();

    // Notificar al servidor
    await fetch('/api/notificaciones/desuscribir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        endpoint: subscription.endpoint
      })
    });

    console.log('Desuscripción exitosa');
    return true;

  } catch (error) {
    console.error('Error al desuscribirse:', error);
    return false;
  }
}

/**
 * Verificar si ya está suscrito a notificaciones
 */
export async function estaSuscrito(): Promise<boolean> {
  try {
    if (!soportaNotificacionesPush()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return subscription !== null;

  } catch (error) {
    console.error('Error al verificar suscripción:', error);
    return false;
  }
}
