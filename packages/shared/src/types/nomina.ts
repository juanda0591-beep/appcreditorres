import type { Id, Periodo } from './base.js';
import type { Money, Percent } from '../money.js';
import type { BaseBono } from './municipio.js';

/** Bloque de ventas de la liquidacion. */
export interface ResumenVentas {
  /** Total de ventas del periodo. */
  cantidad: number;
  /** cantidad x tarifaVenta. Lo que genero en total. */
  devengado: Money;
  /** cantidad x tarifaLiquidacion. Lo que se le entrega ahora. */
  liquidado: Money;
  /** La diferencia, que se va al ahorro. */
  ahorroRetenido: Money;
}

/** Bloque de cobros de la liquidacion. */
export interface ResumenCobros {
  /** Numero de registros de cobro incluidos. */
  registros: number;
  /** Suma de todo lo recaudado. */
  totalRecaudado: Money;
  /** Comision ganada sobre el recaudo. */
  comision: Money;
}

/** Detalle del bono de un municipio donde el empleado supero la meta. */
export interface DetalleBono {
  municipioId: Id;
  municipioNombre: string;
  totalRecaudado: Money;
  metaRecaudo: Money;
  /** Cuanto paso de la meta. Siempre mayor a cero si hay bono. */
  excedente: Money;
  porcentajeAplicado: Percent;
  baseBono: BaseBono;
  bono: Money;
}

/** Bloque de bonos por superar metas de municipio. Se liquida mensual. */
export interface ResumenBonos {
  detalles: DetalleBono[];
  total: Money;
}

/** Bloque de descuentos por gastos personales del empleado. */
export interface ResumenDeducciones {
  /** Gastos marcados como deducibles: se le restan al empleado. */
  registros: number;
  total: Money;
  /** Gastos que asume el negocio. No afectan el pago, van aqui para reporte. */
  asumidosPorNegocio: Money;
}

/** Bloque de préstamo cuando el empleado tiene deuda pendiente. */
export interface ResumenPrestamo {
  /** Deuda total antes de esta liquidación. */
  saldoPendiente: Money;
  /** Lo que se descuenta en esta liquidación (0 si no se abona). */
  abonoRealizado: Money;
  /** Deuda restante después del abono. */
  saldoDespuesAbono: Money;
}

/**
 * Reporte de nomina: cuanto se le debe a cada empleado en un rango de fechas.
 *
 * A diferencia de una liquidacion real, no incluye bonos ni abonos a
 * prestamo: esos se evaluan mensualmente o al momento de pagar, y mezclarlos
 * con un rango de fechas arbitrario daria numeros que no corresponden a un
 * pago real. Sirve para ver de un vistazo cuanto se acumula por pagar.
 */
export interface ReporteNomina {
  periodo: Periodo;
  empleados: LiquidacionNomina[];
}

/**
 * Resultado completo de liquidar a un empleado en un periodo.
 * Es un objeto de solo lectura: lo produce el motor de calculo y la UI
 * o la base de datos solo lo consumen.
 */
export interface LiquidacionNomina {
  empleadoId: Id;
  empleadoNombre: string;
  periodo: Periodo;

  ventas: ResumenVentas;
  cobros: ResumenCobros;
  bonos: ResumenBonos;
  deducciones: ResumenDeducciones;

  /** Información del préstamo si el empleado tiene deuda pendiente. */
  prestamo?: ResumenPrestamo;

  /** ventas.liquidado + cobros.comision + bonos.total */
  totalBruto: Money;

  /** totalBruto - deducciones.total - (prestamo?.abonoRealizado ?? 0). Puede ser negativo. */
  netoAPagar: Money;

  /**
   * Plata que NO se le entrega ahora: se acumula en su ahorro.
   * Es igual a ventas.ahorroRetenido y no forma parte del neto.
   */
  ahorroRetenido: Money;

  /** True si las deducciones superaron el bruto y el empleado queda debiendo. */
  quedaSaldoEnContra: boolean;

  /** Avisos para mostrar en pantalla (datos faltantes, saldos negativos, etc). */
  advertencias: string[];
}
