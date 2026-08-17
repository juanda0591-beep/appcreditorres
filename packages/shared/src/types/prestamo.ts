import type { Id, FechaISO, FechaHoraISO } from './base.js';
import type { Money } from '../money.js';

/**
 * Saldo actual del préstamo de un empleado.
 * Hay un solo registro por empleado con el total acumulado de todos sus préstamos.
 */
export interface Prestamo {
  id: Id;
  empleadoId: Id;
  /** Deuda total pendiente. Puede ser 0 si no debe nada. */
  saldoActual: Money;
  actualizadoEn: FechaHoraISO;
}

/**
 * Cada movimiento de préstamo: cuando se otorga dinero o cuando se abona.
 */
export interface MovimientoPrestamo {
  id: Id;
  empleadoId: Id;
  fecha: FechaISO;
  /** 'prestamo' = se le prestó dinero. 'abono' = descontó de su nómina. */
  tipo: 'prestamo' | 'abono';
  /** Positivo para préstamos, negativo para abonos. */
  monto: Money;
  saldoAnterior: Money;
  saldoNuevo: Money;
  concepto: string | null;
  /** La liquidación donde se realizó el abono (null si es un préstamo). */
  liquidacionId: Id | null;
  creadoEn: FechaHoraISO;
}

export interface NuevoPrestamo {
  empleadoId: Id;
  monto: Money;
  fecha: FechaISO;
  concepto?: string | null;
}

export interface NuevoAbono {
  empleadoId: Id;
  monto: Money;
  liquidacionId: Id;
}
