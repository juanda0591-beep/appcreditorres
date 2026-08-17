/**
 * Preparacion del entorno de pruebas del navegador.
 *
 * jsdom no trae window.matchMedia. No es un hueco de la app: es una API que
 * jsdom decidio no implementar. SweetAlert2 la consulta para saber si hay que
 * reducir las animaciones, y sin ella cualquier dialogo revienta al montarse.
 *
 * Se declara aqui, una sola vez, en vez de en cada archivo de prueba: si cada
 * uno trajera su propia version, dos pruebas podrian estar corriendo contra
 * comportamientos distintos de la misma API.
 */
if (!window.matchMedia) {
  window.matchMedia = (consulta: string): MediaQueryList =>
    ({
      media: consulta,
      // Se responde que NO en todo. Para `prefers-reduced-motion` significa
      // "no reducir", que es el camino normal de la app; y para los anchos, que
      // la prueba corre en pantalla angosta salvo que la propia prueba lo cambie.
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
