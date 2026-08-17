import type { Id, FechaISO, FechaHoraISO } from './base.js';
import type { Money } from '../money.js';

/**
 * Gasto personal del empleado durante su trabajo (transporte, alimentacion, etc).
 *
 * `deducible` decide como afecta el pago:
 * - true  -> se RESTA de lo que se le paga (comportamiento por defecto)
 * - false -> lo asume el negocio, no se le descuenta al empleado
 */
export interface GastoEmpleado {
  id: Id;
  empleadoId: Id;
  municipioId: Id | null;
  fecha: FechaISO;

  monto: Money;
  concepto: string;

  /** Si es true se descuenta del pago del empleado. */
  deducible: boolean;

  creadoEn: FechaHoraISO;
}

export interface NuevoGastoEmpleado {
  empleadoId: Id;
  municipioId?: Id | null;
  fecha: FechaISO;
  monto: Money;
  concepto: string;
  deducible?: boolean;
}

export const GASTO_DEDUCIBLE_DEFECTO = true;
