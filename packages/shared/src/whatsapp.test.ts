import { describe, it, expect } from 'vitest';
import {
  normalizarNumero,
  aplicarPlantilla,
  enlaceConsultaProducto,
  enlaceCompartirCatalogo,
} from './whatsapp.js';

describe('normalizarNumero', () => {
  it('acepta los formatos que la gente escribe de verdad', () => {
    expect(normalizarNumero('3001234567')).toBe('573001234567');
    expect(normalizarNumero('300 123 4567')).toBe('573001234567');
    expect(normalizarNumero('+57 300-123-4567')).toBe('573001234567');
    expect(normalizarNumero('(300) 1234567')).toBe('573001234567');
    expect(normalizarNumero('573001234567')).toBe('573001234567');
  });

  it('descarta el prefijo internacional 00', () => {
    expect(normalizarNumero('0057 3001234567')).toBe('573001234567');
  });

  it('devuelve null en vez de generar un enlace roto', () => {
    expect(normalizarNumero(null)).toBeNull();
    expect(normalizarNumero('')).toBeNull();
    expect(normalizarNumero('abc')).toBeNull();
    expect(normalizarNumero('123')).toBeNull();
  });
});

describe('aplicarPlantilla', () => {
  it('reemplaza los marcadores', () => {
    expect(aplicarPlantilla('Hola {{nombre}}, van {{cantidad}}', { nombre: 'Ana', cantidad: '3' }))
      .toBe('Hola Ana, van 3');
  });

  it('deja el marcador visible si no hay valor, para que el error se note', () => {
    expect(aplicarPlantilla('Hola {{falta}}', {})).toBe('Hola {{falta}}');
  });

  it('acepta valores vacios a proposito', () => {
    expect(aplicarPlantilla('Precio: {{precio}}', { precio: '' })).toBe('Precio: ');
  });
});

describe('enlaceConsultaProducto', () => {
  it('arma el enlace con el precio formateado', () => {
    const enlace = enlaceConsultaProducto({
      numeroNegocio: '3001234567',
      plantilla: 'Me interesa {{producto}} ({{precio}})',
      producto: 'Camiseta azul',
      precio: 45_000,
    });

    expect(enlace).toContain('https://wa.me/573001234567?text=');
    expect(decodeURIComponent(enlace!)).toContain('Camiseta azul');
    expect(decodeURIComponent(enlace!)).toContain('45.000');
  });

  it('omite el precio cuando esta apagado en la configuracion', () => {
    const enlace = enlaceConsultaProducto({
      numeroNegocio: '3001234567',
      plantilla: 'Me interesa {{producto}} {{precio}}',
      producto: 'Camiseta',
      precio: 45_000,
      mostrarPrecio: false,
    });

    expect(decodeURIComponent(enlace!)).not.toContain('45.000');
  });

  it('devuelve null si el negocio no tiene numero configurado', () => {
    expect(
      enlaceConsultaProducto({
        numeroNegocio: null,
        plantilla: 'Hola',
        producto: 'X',
        precio: 1000,
      }),
    ).toBeNull();
  });

  it('codifica los caracteres especiales del mensaje', () => {
    const enlace = enlaceConsultaProducto({
      numeroNegocio: '3001234567',
      plantilla: 'Quiero {{producto}} & mas',
      producto: 'Pan #1',
      precio: 2000,
    });

    // Sin codificar, el & partiria la URL y el # cortaria el mensaje.
    expect(enlace).not.toContain('& mas');
    expect(enlace).not.toContain('#1');
    expect(decodeURIComponent(enlace!)).toContain('Pan #1');
  });
});

describe('enlaceCompartirCatalogo', () => {
  it('no lleva numero de destino: WhatsApp deja elegir a quien enviarlo', () => {
    const enlace = enlaceCompartirCatalogo({
      plantilla: 'Mira nuestro catalogo: {{titulo}} {{link}}',
      titulo: 'Productos',
      link: 'https://midominio.com/catalogo',
    });

    expect(enlace.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(enlace)).toContain('https://midominio.com/catalogo');
  });
});
