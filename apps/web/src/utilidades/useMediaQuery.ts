import { useState, useEffect } from 'react';

/**
 * Responde si una media query se cumple, y se actualiza al cambiar el tamano
 * de la ventana o al girar el celular.
 *
 * Hace falta cuando el comportamiento (no solo el estilo) cambia entre celular
 * y escritorio: Tailwind resuelve la apariencia con clases, pero atributos como
 * aria-hidden o el bloqueo del scroll se deciden en JavaScript y necesitan
 * saber el ancho real.
 */
export function useMediaQuery(consulta: string): boolean {
  const [coincide, setCoincide] = useState(() =>
    // Se inicializa leyendo el valor real para no renderizar una vez con el
    // dato equivocado y provocar un salto visible.
    typeof window === 'undefined' ? false : window.matchMedia(consulta).matches,
  );

  useEffect(() => {
    const lista = window.matchMedia(consulta);
    const alCambiar = (evento: MediaQueryListEvent) => setCoincide(evento.matches);

    setCoincide(lista.matches);
    lista.addEventListener('change', alCambiar);
    return () => lista.removeEventListener('change', alCambiar);
  }, [consulta]);

  return coincide;
}
