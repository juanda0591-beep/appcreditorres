import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MenuLateral } from './MenuLateral.js';
import type { UsuarioSesion } from '../api/hooks.js';

/**
 * Pruebas del menu lateral.
 *
 * Desde que el panel es azul oscuro con letra blanca, lo que se puede romper en
 * silencio es la LEGIBILIDAD: subirle el fondo al item activo o atenuar mas el
 * texto deja la navegacion por debajo del minimo de contraste y nadie se entera
 * hasta que alguien no la puede leer. Aqui se fija lo que sostiene esa decision.
 */

const ADMIN: UsuarioSesion = {
  id: 'u-1',
  usuario: 'juand',
  nombre: 'Juan D',
  rol: 'admin',
};

function montar(opciones: { ruta?: string; expandido?: boolean; usuario?: UsuarioSesion } = {}) {
  const onCerrar = vi.fn();
  const onSalir = vi.fn();
  const onToggleExpandir = vi.fn();

  render(
    <MemoryRouter initialEntries={[opciones.ruta ?? '/nomina']}>
      <MenuLateral
        abierto
        onCerrar={onCerrar}
        usuario={opciones.usuario ?? ADMIN}
        onSalir={onSalir}
        expandido={opciones.expandido ?? true}
        onToggleExpandir={onToggleExpandir}
      />
    </MemoryRouter>,
  );

  return { onCerrar, onSalir, onToggleExpandir };
}

/** El enlace de una seccion, por su texto visible. */
const enlace = (texto: string) => screen.getByRole('link', { name: texto });

describe('el panel es metalizado y la letra blanca', () => {
  it('el panel usa la superficie metalizada, no un fondo blanco', () => {
    montar();
    const panel = screen.getByRole('navigation', { hidden: true }).closest('aside')!;

    expect(panel.className).toContain('panel-metal');
    // Un bg-white opaco volveria el panel claro y dejaria la letra blanca
    // invisible. Los blancos translucidos (bg-white/10) si estan permitidos.
    expect(panel.className).not.toMatch(/bg-white(?!\/)/);
  });

  it('todos los enlaces llevan texto blanco', () => {
    montar();

    for (const texto of ['Resumen', 'Nomina', 'Empleados', 'Catalogo']) {
      expect(enlace(texto).className).toMatch(/text-white/);
    }
  });

  it('el boton de salir tambien va en blanco, no en rojo permanente', () => {
    montar();
    const salir = screen.getByRole('button', { name: 'Cerrar sesion' });

    expect(salir.className).toMatch(/text-white/);
    // El rojo aparece solo al pasar por encima: en rojo fijo competiria con la
    // navegacion, y es la accion que menos se usa.
    expect(salir.className).toContain('hover:bg-red-500/25');
  });
});

describe('la seccion activa se distingue sin depender del color de la letra', () => {
  it('marca la activa con fondo, barra y peso, no con otro color de texto', () => {
    montar({ ruta: '/nomina' });
    const activo = enlace('Nomina');

    expect(activo.getAttribute('aria-current')).toBe('page');
    expect(activo.className).toContain('font-semibold');
    // La barra es un elemento aparte: es lo que hace visible el estado cuando el
    // fondo translucido casi no se nota.
    expect(activo.querySelector('span[aria-hidden]')).not.toBeNull();
  });

  it('el fondo del item activo no pasa de blanco 10%', () => {
    // Este es el limite calculado: con blanco 12% o mas, el texto blanco encima
    // cae por debajo de 4.5:1 contra la parte clara del degradado. Si alguien lo
    // sube para que "resalte mas", esta prueba lo detiene.
    montar({ ruta: '/nomina' });

    expect(enlace('Nomina').className).toContain('bg-white/10');
    expect(enlace('Nomina').className).not.toMatch(/bg-white\/(1[2-9]|[2-9]\d)/);
  });

  it('las secciones inactivas no traen la barra ni el fondo', () => {
    montar({ ruta: '/nomina' });
    const inactivo = enlace('Empleados');

    expect(inactivo.getAttribute('aria-current')).toBeNull();
    expect(inactivo.querySelector('span[aria-hidden]')).toBeNull();
    expect(inactivo.className).not.toContain('bg-white/10');
  });
});

describe('el foco se ve sobre el panel oscuro', () => {
  it('los elementos interactivos usan el contorno claro', () => {
    montar();

    // El contorno global es azul metalizado y sobre este panel no se distingue:
    // quien navega con teclado perderia de vista donde esta.
    expect(enlace('Nomina').className).toContain('foco-claro');
    expect(screen.getByRole('button', { name: 'Cerrar sesion' }).className).toContain('foco-claro');
    expect(screen.getByRole('button', { name: 'Cerrar menu' }).className).toContain('foco-claro');
  });
});

describe('contraido deja solo los iconos', () => {
  it('esconde el texto pero lo conserva como nombre accesible', () => {
    montar({ expandido: false });

    // El enlace sigue existiendo con su nombre: si el texto se quitara sin mas,
    // un lector de pantalla anunciaria un enlace sin nombre.
    expect(screen.getByRole('link', { name: 'Nomina' })).toBeDefined();
    expect(screen.queryByText('Dinero y nomina')).toBeNull();
  });

  it('el rol catalogo no ve las secciones de plata', () => {
    montar({ usuario: { ...ADMIN, rol: 'catalogo' }, ruta: '/productos' });

    expect(screen.queryByRole('link', { name: 'Nomina' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Empleados' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Catalogo' })).toBeDefined();
  });
});
