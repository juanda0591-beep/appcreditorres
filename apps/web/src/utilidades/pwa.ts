/**
 * Registro del service worker.
 *
 * Se registra despues de que la pagina cargue: hacerlo antes compite por el
 * ancho de banda con el JS y el CSS que la app necesita para pintarse.
 *
 * Solo en produccion. En desarrollo un service worker sirviendo archivos de su
 * cache pelea con el recambio en caliente de Vite y termina mostrando codigo
 * viejo despues de guardar, que es de los errores mas confusos de perseguir.
 */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // No se le avisa a la persona: la app funciona igual sin el service
      // worker, solo pierde el arranque instantaneo y el modo sin conexion.
      console.warn('No se pudo registrar el service worker', error);
    });
  });
}
