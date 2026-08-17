import type { Id, FechaHoraISO } from './base.js';
import type { Money, Percent } from '../money.js';

/**
 * Empleado con sus tarifas propias.
 *
 * Las tarifas viven en el empleado (no como constante global) porque cambian
 * con el tiempo y pueden diferir entre personas. Al liquidar se copian al
 * registro de nomina para que un cambio futuro no altere pagos ya hechos.
 */
export interface Empleado {
  id: Id;
  nombre: string;
  documento: string | null;
  telefono: string | null;

  /** Lo que vale cada venta para el empleado. Valor tipico: 6000 */
  tarifaVenta: Money;

  /** Lo que se le entrega por venta. Valor tipico: 5000 */
  tarifaLiquidacion: Money;

  /** Comision sobre lo recaudado en cobros. Valor tipico: 10 (=10%) */
  porcentajeCobro: Percent;

  activo: boolean;
  creadoEn: FechaHoraISO;
}

/** Datos necesarios para crear un empleado. Las tarifas tienen valores por defecto. */
export interface NuevoEmpleado {
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
  tarifaVenta?: Money;
  tarifaLiquidacion?: Money;
  porcentajeCobro?: Percent;
}

export const TARIFA_VENTA_DEFECTO: Money = 6000;
export const TARIFA_LIQUIDACION_DEFECTO: Money = 5000;
export const PORCENTAJE_COBRO_DEFECTO: Percent = 10;
