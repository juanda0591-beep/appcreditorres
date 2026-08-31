import { describe, it, expect } from 'vitest';
import { normalizarFechaExcel } from './crm.js';

/**
 * Pruebas del reconocimiento de encabezados del Excel de cartera.
 *
 * Los archivos reales traen los nombres abreviados y con puntos
 * ("Ulti.Fecha Abono"), asi que la comparacion ignora tildes, mayusculas,
 * espacios, puntos y guiones bajos.
 */

/** Misma normalizacion que usa el handler de subida. */
const normalizarEncabezado = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

describe('normalizarEncabezado', () => {
  it('reconoce "Ulti.Fecha Abono", el encabezado real del archivo', () => {
    // Este es el nombre exacto de la columna K en la cartera del cliente.
    expect(normalizarEncabezado('Ulti.Fecha Abono')).toBe('ultifechaabono');
  });

  it('iguala las variantes de un mismo encabezado', () => {
    const esperado = normalizarEncabezado('Última Fecha Abono');
    expect(normalizarEncabezado('ULTIMA_FECHA_ABONO')).toBe(esperado);
    expect(normalizarEncabezado('ultima fecha abono')).toBe(esperado);
    expect(normalizarEncabezado('UltimaFechaAbono')).toBe(esperado);
  });

  it('distingue encabezados que de verdad son distintos', () => {
    expect(normalizarEncabezado('Fecha Inicio')).not.toBe(normalizarEncabezado('Ulti.Fecha Abono'));
    expect(normalizarEncabezado('Abono')).not.toBe(normalizarEncabezado('Ulti.Fecha Abono'));
  });
});

describe('fechas del archivo real', () => {
  it('lee las fechas de la columna Ulti.Fecha Abono como dia/mes/anio', () => {
    // Valores tal como se ven en la hoja del cliente.
    expect(normalizarFechaExcel('13/07/2026')).toBe('2026-07-13T00:00:00.000Z');
    expect(normalizarFechaExcel('10/05/2026')).toBe('2026-05-10T00:00:00.000Z');
    expect(normalizarFechaExcel('15/06/2026')).toBe('2026-06-15T00:00:00.000Z');
    expect(normalizarFechaExcel('27/07/2026')).toBe('2026-07-27T00:00:00.000Z');
    expect(normalizarFechaExcel('31/03/2026')).toBe('2026-03-31T00:00:00.000Z');
  });
});
