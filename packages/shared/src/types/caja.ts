import type { Id, FechaISO, FechaHoraISO, Periodo } from './base.js';
import type { Money } from '../money.js';

/** Un movimiento entra plata ('ingreso') o la saca ('egreso'). */
export type TipoMovimiento = 'ingreso' | 'egreso';

/**
 * Movimiento de caja del negocio: el control de dinero general.
 * Aqui entran los recaudos y salen los pagos de nomina, arriendos, etc.
 */
export interface MovimientoCaja {
  id: Id;
  fecha: FechaISO;
  tipo: TipoMovimiento;
  monto: Money;
  categoria: string;
  concepto: string;

  /** Empleado relacionado, si aplica (pago de nomina, gasto de ruta). */
  empleadoId: Id | null;

  /**
   * Origen del movimiento cuando lo genero el sistema y no una persona.
   * Ejemplo: 'nomina' con el id de la liquidacion que lo creo.
   */
  origen: string | null;
  referenciaId: Id | null;

  creadoEn: FechaHoraISO;
}

export interface NuevoMovimientoCaja {
  fecha: FechaISO;
  tipo: TipoMovimiento;
  monto: Money;
  categoria: string;
  concepto: string;
  empleadoId?: Id | null;
}

/** Balance del negocio en un periodo. */
export interface BalanceCaja {
  periodo: Periodo;
  ingresos: Money;
  egresos: Money;
  /** ingresos - egresos. Negativo significa que se gasto mas de lo que entro. */
  balance: Money;
  porCategoria: Array<{ categoria: string; tipo: TipoMovimiento; total: Money }>;
}
