import type { Id, FechaISO, FechaHoraISO } from './base.js';
import type { Money } from '../money.js';

/**
 * Tipo de movimiento del ahorro del empleado.
 * - 'retencion': entra plata al ahorro (los $1.000 por venta)
 * - 'pago':      sale plata porque se le entrego (cada 3 meses)
 * - 'ajuste':    correccion manual, siempre con nota explicando
 */
export type TipoMovimientoAhorro = 'retencion' | 'pago' | 'ajuste';

/**
 * Libro de movimientos del ahorro. Nunca guardamos solo el saldo:
 * el saldo se calcula sumando los movimientos, asi queda la trazabilidad
 * de por que un empleado tiene la plata que tiene.
 */
export interface MovimientoAhorro {
  id: Id;
  empleadoId: Id;
  fecha: FechaISO;
  tipo: TipoMovimientoAhorro;

  /** Positivo suma al ahorro, negativo lo descuenta. Un 'pago' es negativo. */
  monto: Money;

  /** Referencia al origen: id de la liquidacion o del registro de venta. */
  referenciaId: Id | null;

  nota: string | null;
  creadoEn: FechaHoraISO;
}

/** Estado del ahorro de un empleado a una fecha de corte. */
export interface SaldoAhorro {
  empleadoId: Id;
  saldo: Money;

  /** Ultima vez que se le entrego el ahorro. Sirve para saber si ya van 3 meses. */
  ultimoPago: FechaISO | null;

  /** True cuando ya paso el ciclo de 3 meses desde el ultimo pago. */
  cicloCumplido: boolean;
}

/** El ahorro se entrega cada 3 meses. */
export const MESES_CICLO_AHORRO = 3;
