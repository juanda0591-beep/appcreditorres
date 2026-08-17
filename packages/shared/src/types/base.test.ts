import { describe, it, expect } from 'vitest';
import { periodoDelMes, periodoQuincena, cierraElMes, estaEnPeriodo, esFechaISO } from './base.js';

describe('periodoDelMes', () => {
  it('resuelve el ultimo dia de meses de 31, 30 y 28 dias', () => {
    expect(periodoDelMes('2026-08-09')).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' });
    expect(periodoDelMes('2026-04-15')).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' });
    expect(periodoDelMes('2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('maneja febrero en anio bisiesto', () => {
    expect(periodoDelMes('2028-02-10').hasta).toBe('2028-02-29');
  });
});

describe('periodoQuincena', () => {
  it('primera quincena: del 1 al 15', () => {
    expect(periodoQuincena('2026-08-09')).toEqual({ desde: '2026-08-01', hasta: '2026-08-15' });
  });

  it('segunda quincena: del 16 al fin de mes', () => {
    expect(periodoQuincena('2026-08-20')).toEqual({ desde: '2026-08-16', hasta: '2026-08-31' });
  });

  it('el dia 15 pertenece a la primera quincena', () => {
    expect(periodoQuincena('2026-08-15').hasta).toBe('2026-08-15');
  });
});

describe('cierraElMes', () => {
  it('detecta la quincena que cierra el mes', () => {
    expect(cierraElMes({ desde: '2026-08-16', hasta: '2026-08-31' })).toBe(true);
    expect(cierraElMes({ desde: '2026-08-01', hasta: '2026-08-15' })).toBe(false);
  });
});

describe('validaciones de fecha', () => {
  it('rechaza fechas que no existen', () => {
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('09/08/2026')).toBe(false);
    expect(esFechaISO('2026-8-9')).toBe(false);
  });

  it('incluye los limites del periodo', () => {
    const periodo = { desde: '2026-08-01', hasta: '2026-08-15' };
    expect(estaEnPeriodo('2026-08-01', periodo)).toBe(true);
    expect(estaEnPeriodo('2026-08-15', periodo)).toBe(true);
    expect(estaEnPeriodo('2026-08-16', periodo)).toBe(false);
  });
});
