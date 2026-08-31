import { describe, it, expect } from 'vitest';
import { normalizarFechaExcel } from './crm.js';

/**
 * Pruebas de la conversion de fechas del Excel de cartera.
 *
 * El Excel llega con las fechas en tres formas distintas segun como se haya
 * escrito la celda: numero serial, Date ya parseado por la libreria, o texto.
 * Todas deben terminar en medianoche UTC del mismo dia que ve el usuario en la
 * hoja, sin correrse por la zona horaria (Colombia es UTC-5).
 */

describe('normalizarFechaExcel', () => {
  it('convierte el numero serial de Excel al dia correcto', () => {
    // 46101 y 46152 son los seriales de 20/03/2026 y 10/05/2026.
    expect(normalizarFechaExcel(46101)).toBe('2026-03-20T00:00:00.000Z');
    expect(normalizarFechaExcel(46152)).toBe('2026-05-10T00:00:00.000Z');
  });

  it('ignora la parte fraccionaria del serial, que es la hora', () => {
    expect(normalizarFechaExcel(46101.75)).toBe('2026-03-20T00:00:00.000Z');
  });

  it('no pierde un dia cuando el serial llega con error de coma flotante', () => {
    // Un serial que deberia ser 46152 exacto puede llegar como 46151.99999;
    // truncarlo daria el 9 de mayo en lugar del 10.
    expect(normalizarFechaExcel(46151.999999)).toBe('2026-05-10T00:00:00.000Z');
    expect(normalizarFechaExcel(46152.000001)).toBe('2026-05-10T00:00:00.000Z');
  });

  it('lee el texto en formato colombiano dia/mes/anio', () => {
    expect(normalizarFechaExcel('20/03/2026')).toBe('2026-03-20T00:00:00.000Z');
    expect(normalizarFechaExcel('10/05/2026')).toBe('2026-05-10T00:00:00.000Z');
    // El dia 20 no existe como mes, asi que confirma que no se leyo como mes/dia.
    expect(normalizarFechaExcel('20-3-26')).toBe('2026-03-20T00:00:00.000Z');
    expect(normalizarFechaExcel('20.03.2026')).toBe('2026-03-20T00:00:00.000Z');
  });

  it('acepta texto en formato ISO', () => {
    expect(normalizarFechaExcel('2026-03-20')).toBe('2026-03-20T00:00:00.000Z');
    expect(normalizarFechaExcel('2026-03-20T14:30:00.000Z')).toBe('2026-03-20T00:00:00.000Z');
  });

  it('no corre el dia cuando el valor ya es un Date en hora local', () => {
    // Asi lo entrega xlsx cuando la celda tiene formato de fecha.
    expect(normalizarFechaExcel(new Date(2026, 2, 20))).toBe('2026-03-20T00:00:00.000Z');
    expect(normalizarFechaExcel(new Date(2026, 4, 10))).toBe('2026-05-10T00:00:00.000Z');
  });

  it('devuelve null para celdas vacias', () => {
    expect(normalizarFechaExcel(null)).toBeNull();
    expect(normalizarFechaExcel(undefined)).toBeNull();
    expect(normalizarFechaExcel('')).toBeNull();
    expect(normalizarFechaExcel('   ')).toBeNull();
  });

  it('devuelve null para valores que no son fechas', () => {
    expect(normalizarFechaExcel('PENDIENTE')).toBeNull();
    expect(normalizarFechaExcel('31/02/2026')).toBeNull();
    expect(normalizarFechaExcel(0)).toBeNull();
    expect(normalizarFechaExcel(-5)).toBeNull();
    expect(normalizarFechaExcel(new Date('invalido'))).toBeNull();
  });
});
