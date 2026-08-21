/**
 * Service worker de la app.
 *
 * REGLA QUE MANDA SOBRE TODAS: nada de /api se guarda en cache. Son datos de
 * plata. Un saldo de caja o una liquidacion viejos mostrados como si fueran de
 * ahora llevan a decidir sobre numeros que no existen, y ademas las respuestas
 * salen de una sesion: guardarlas dejaria datos de un usuario en un cache que
 * otro podria leer en el mismo dispositivo.
 *
 * Lo que si se guarda es el "armazon": el HTML, el JS, el CSS y las imagenes.
 * Con eso la app abre al instante y sobrevive un tunel o un ascensor, aunque
 * los datos solo lleguen con red.
 */

const VERSION = 'v1';
const CACHE_ARMAZON = `armazon-${VERSION}`;
const CACHE_IMAGENES = `imagenes-${VERSION}`;

/**
 * Lo unico que se precachea: existe siempre y nunca cambia de nombre.
 *
 * index.html NO va aqui a proposito. Apunta a archivos JS con hash en el
 * nombre; si se congelara en la instalacion, tras el siguiente despliegue
 * pediria archivos que ya no existen y la app abriria en blanco. Se guarda
 * sobre la marcha en cada visita, mas abajo.
 */
const PRECARGA = [
  '/manifest.webmanifest',
  '/icono-192.png',
  '/icono-512.png',
  '/icono-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ARMAZON);
      // Uno por uno: si un icono falta, el resto se guarda igual. Con addAll
      // un solo 404 aborta toda la instalacion del service worker.
      await Promise.all(
        PRECARGA.map((ruta) => cache.add(ruta).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_ARMAZON && nombre !== CACHE_IMAGENES)
          .map((nombre) => caches.delete(nombre)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'activar-ahora') self.skipWaiting();
});

// Manejar notificaciones push
self.addEventListener('push', (evento) => {
  if (!evento.data) return;

  try {
    const datos = evento.data.json();
    const opciones = {
      body: datos.body,
      icon: datos.icon || '/icono-192.png',
      badge: datos.badge || '/icono-192.png',
      tag: datos.tag || 'notificacion',
      requireInteraction: true, // La notificación permanece hasta que el usuario interactúe
      data: datos.data || {},
      vibrate: [200, 100, 200], // Patrón de vibración
      actions: [
        { action: 'abrir', title: 'Ver pedido' },
        { action: 'cerrar', title: 'Cerrar' }
      ]
    };

    evento.waitUntil(
      self.registration.showNotification(datos.title, opciones)
    );
  } catch (error) {
    console.error('Error al mostrar notificación:', error);
  }
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();

  if (evento.action === 'cerrar') {
    return;
  }

  // Abrir la URL especificada en la notificación o la página de admin
  const urlDestino = evento.notification.data?.url || '/admin';

  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta con la app, enfocarla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => client.navigate(urlDestino));
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(urlDestino);
      }
    })
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Solo GET. Un POST guardado y reenviado desde cache duplicaria una venta.
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  // Otro dominio (por ejemplo wa.me): pasa derecho, sin tocarlo.
  if (url.origin !== self.location.origin) return;

  // Datos y catalogo publico: siempre a la red.
  //
  // /catalogo lo arma el servidor con los productos del momento, asi que
  // tampoco se cachea ni se le responde con el armazon de la app.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/catalogo')) return;

  if (url.pathname.startsWith('/imagenes/')) {
    evento.respondWith(cacheYRefresco(peticion));
    return;
  }

  // Navegacion: red primero, cache como respaldo.
  //
  // Al reves no sirve: el HTML nombra los archivos JS con hash, y uno viejo
  // pediria archivos que el despliegue nuevo ya borro.
  if (peticion.mode === 'navigate') {
    evento.respondWith(redPrimeroConRespaldo(peticion));
    return;
  }

  // Archivos con hash en el nombre (assets de Vite) e iconos: cache primero.
  // Si el contenido cambia, cambia el nombre, asi que no hay como servir uno
  // viejo por error.
  evento.respondWith(cachePrimero(peticion));
});

/**
 * Se puede guardar en cache?
 *
 * Solo un 200 limpio. Un 206 (respuesta parcial) o una respuesta que venga de
 * un redireccion hacen que cache.put lance, y esa excepcion dejaria la peticion
 * sin responder: la pantalla se queda en blanco por intentar cachear.
 */
function sePuedeGuardar(respuesta) {
  return respuesta.status === 200 && !respuesta.redirected && respuesta.type === 'basic';
}

/** Cache si esta; si no, red y se guarda. */
async function cachePrimero(peticion) {
  const cache = await caches.open(CACHE_ARMAZON);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;

  const respuesta = await fetch(peticion);
  if (sePuedeGuardar(respuesta)) cache.put(peticion, respuesta.clone());
  return respuesta;
}

/** Red primero; si falla, lo ultimo que se vio. */
async function redPrimeroConRespaldo(peticion) {
  const cache = await caches.open(CACHE_ARMAZON);

  try {
    const respuesta = await fetch(peticion);
    if (sePuedeGuardar(respuesta)) cache.put('/index.html', respuesta.clone());
    return respuesta;
  } catch (error) {
    // Sin red: se devuelve el armazon guardado. Los datos van a fallar aparte
    // y la pantalla mostrara su propio aviso, que es mejor que el dinosaurio
    // del navegador.
    const respaldo = (await cache.match('/index.html')) ?? (await cache.match(peticion));
    if (respaldo) return respaldo;
    throw error;
  }
}

/** Responde de cache al instante y actualiza por detras para la proxima. */
async function cacheYRefresco(peticion) {
  const cache = await caches.open(CACHE_IMAGENES);
  const guardada = await cache.match(peticion);

  const refresco = fetch(peticion)
    .then((respuesta) => {
      if (sePuedeGuardar(respuesta)) cache.put(peticion, respuesta.clone());
      return respuesta;
    })
    .catch(() => undefined);

  if (guardada) return guardada;

  const respuesta = await refresco;
  if (respuesta) return respuesta;
  return new Response('', { status: 504, statusText: 'Sin conexion' });
}
