import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import type { Configuracion } from '@credito/shared';
import { paginaCatalogo, type ProductoCatalogo } from './catalogo.js';

const ajustes: Configuracion = {
  nombreNegocio: 'Tienda',
  whatsappNumero: null,
  whatsappVendedor: null,
  tituloCatalogo: 'Catalogo',
  descripcionCatalogo: null,
  plantillaMensaje: '',
  plantillaConsulta: '',
  notaPie: null,
  catalogoActivo: true,
  mostrarPrecios: true,
  logoUrl: null,
  actualizadoEn: '',
};

function producto(id: string, categoria: string, esNuevo = false): ProductoCatalogo {
  return {
    id,
    nombre: id,
    descripcion: null,
    precio: 100_000,
    precioContado: 100_000,
    precioCredicontado: 0,
    precioCredito: 0,
    inicial: 0,
    pagoSemanal: 0,
    categoria,
    imagenes: null,
    imagenUrl: null,
    miniaturaUrl: null,
    disponible: true,
    esNuevo,
    enPromocion: false,
  };
}

function montar(items: ProductoCatalogo[]) {
  return new JSDOM(paginaCatalogo({ ajustes, productos: items, urlPublica: 'https://tienda.test' }), {
    runScripts: 'dangerously',
    url: 'https://tienda.test/catalogo',
  });
}

function visibles(documento: Document) {
  return [...documento.querySelectorAll<HTMLElement>('.producto:not(.oculto)')]
    .map((item) => item.querySelector('h2')?.textContent);
}

describe('navegacion del catalogo', () => {
  it('inicia solo con nuevos y filtra por las categorias superiores', () => {
    const dom = montar([
      producto('Armario nuevo', 'ARMARIOS', true),
      producto('Armario clasico', 'ARMARIOS'),
      producto('Sabana', 'HOGAR'),
      producto('Nevera', 'ELECTRODOMESTICOS'),
      producto('Sala', 'MUBLES'),
    ]);
    const { document } = dom.window;

    expect(visibles(document)).toEqual(['Armario nuevo']);
    expect([...document.querySelectorAll('.categoria-tab')].map((tab) => tab.textContent)).toEqual([
      'Nuevos', 'ARMARIOS', 'COLCHONES', 'HOGAR', 'ELECTRODOMESTICOS', 'CAMAS', 'Todos',
    ]);

    (document.querySelector('[data-seccion="ARMARIOS"]') as HTMLElement).click();
    expect(visibles(document)).toEqual(['Armario nuevo', 'Armario clasico']);

    (document.querySelector('[data-seccion="HOGAR"]') as HTMLElement).click();
    expect(visibles(document)).toEqual(['Sabana']);
    expect(document.querySelector('[data-categoria="HOGAR"] .categoria-producto')?.textContent).toBe('HOGAR');

    (document.querySelector('[data-seccion="TODOS"]') as HTMLElement).click();
    expect(visibles(document)).toHaveLength(5);
    dom.window.close();
  });

  it('muestra un estado vacio si no hay nuevos y busca en todas las categorias', () => {
    const dom = montar([producto('Sabana', 'HOGAR'), producto('Sala', 'MUBLES')]);
    const { document, Event } = dom.window;

    expect(visibles(document)).toEqual([]);
    expect(document.getElementById('sin-resultados')?.hidden).toBe(false);
    expect(document.getElementById('sin-resultados-titulo')?.textContent).toContain('no hay productos nuevos');

    const busqueda = document.getElementById('busqueda') as HTMLInputElement;
    busqueda.value = 'sala';
    busqueda.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibles(document)).toEqual(['Sala']);
    expect(document.querySelector('.categoria-tab.activo')).toBeNull();
    dom.window.close();
  });
});
