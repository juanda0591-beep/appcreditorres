import type { Id, FechaISO, FechaHoraISO } from './base.js';
import type { Money, Percent } from '../money.js';
import { aplicarPorcentaje } from '../money.js';

/**
 * Recaudo hecho por un empleado en un municipio.
 * El empleado gana un porcentaje de lo recaudado (tipico 10%).
 *
 * El porcentaje se copia al registrar, igual que las tarifas de venta,
 * para que cambios futuros no reescriban la historia de pagos.
 */
export interface RegistroCobro {
  id: Id;
  empleadoId: Id;
  municipioId: Id;
  fecha: FechaISO;

  /** Plata recaudada. Ejemplo: 2000000 */
  montoRecaudado: Money;

  /** Comision vigente al registrar. Copia de Empleado.porcentajeCobro. */
  porcentajeAplicado: Percent;

  nota: string | null;
  creadoEn: FechaHoraISO;
}

export interface NuevoRegistroCobro {
  empleadoId: Id;
  municipioId: Id;
  fecha: FechaISO;
  montoRecaudado: Money;
  nota?: string | null;
}

/** Comision ganada: monto recaudado x porcentaje. Ej: 2.000.000 al 10% = 200.000 */
export function comisionDeCobro(registro: RegistroCobro): Money {
  return aplicarPorcentaje(registro.montoRecaudado, registro.porcentajeAplicado);
}
