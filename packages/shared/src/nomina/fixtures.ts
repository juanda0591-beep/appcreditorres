// Ayudas para construir datos de prueba sin repetir campos en cada test.

import type { Empleado } from '../types/empleado.js';
import type { Municipio } from '../types/municipio.js';
import type { RegistroVenta } from '../types/venta.js';
import type { RegistroCobro } from '../types/cobro.js';
import type { GastoEmpleado } from '../types/gasto.js';

const AHORA = '2026-08-09T12:00:00.000Z';

export function crearEmpleado(cambios: Partial<Empleado> = {}): Empleado {
  return {
    id: 'emp-1',
    nombre: 'Adriana',
    documento: null,
    telefono: null,
    tarifaVenta: 6000,
    tarifaLiquidacion: 5000,
    porcentajeCobro: 10,
    activo: true,
    creadoEn: AHORA,
    ...cambios,
  };
}

export function crearMunicipio(cambios: Partial<Municipio> = {}): Municipio {
  return {
    id: 'mun-1',
    nombre: 'La Ceja',
    metaRecaudo: 1_500_000,
    porcentajeExcedente: 2,
    baseBono: 'excedente',
    activo: true,
    creadoEn: AHORA,
    ...cambios,
  };
}

export function crearVenta(cambios: Partial<RegistroVenta> = {}): RegistroVenta {
  return {
    id: 'venta-1',
    empleadoId: 'emp-1',
    municipioId: 'mun-1',
    fecha: '2026-08-09',
    cantidad: 12,
    tarifaVenta: 6000,
    tarifaLiquidacion: 5000,
    nota: null,
    creadoEn: AHORA,
    ...cambios,
  };
}

export function crearCobro(cambios: Partial<RegistroCobro> = {}): RegistroCobro {
  return {
    id: 'cobro-1',
    empleadoId: 'emp-1',
    municipioId: 'mun-1',
    fecha: '2026-08-09',
    montoRecaudado: 2_000_000,
    porcentajeAplicado: 10,
    nota: null,
    creadoEn: AHORA,
    ...cambios,
  };
}

export function crearGasto(cambios: Partial<GastoEmpleado> = {}): GastoEmpleado {
  return {
    id: 'gasto-1',
    empleadoId: 'emp-1',
    municipioId: 'mun-1',
    fecha: '2026-08-09',
    monto: 30_000,
    concepto: 'Transporte',
    deducible: true,
    creadoEn: AHORA,
    ...cambios,
  };
}

/** Construye el mapa de municipios que espera el motor. */
export function mapaMunicipios(...municipios: Municipio[]): Map<string, Municipio> {
  return new Map(municipios.map((municipio) => [municipio.id, municipio]));
}
