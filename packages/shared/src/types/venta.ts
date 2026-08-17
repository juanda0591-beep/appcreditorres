import type { Id, FechaISO, FechaHoraISO } from './base.js';
import type { Money } from '../money.js';

/**
 * Ventas de un empleado en un dia. Se guarda agrupado (cantidad) y no una fila
 * por venta, porque asi se registra en la practica: "hoy Adriana hizo 12 ventas".
 *
 * Las tarifas se copian aqui al momento de registrar. Si manana cambias la
 * tarifa del empleado, este registro sigue reflejando lo que se acordo ese dia.
 */
export interface RegistroVenta {
  id: Id;
  empleadoId: Id;
  municipioId: Id | null;
  fecha: FechaISO;

  /** Numero de ventas hechas ese dia. */
  cantidad: number;

  /** Tarifa vigente al registrar. Copia de Empleado.tarifaVenta. */
  tarifaVenta: Money;

  /** Tarifa vigente al registrar. Copia de Empleado.tarifaLiquidacion. */
  tarifaLiquidacion: Money;

  nota: string | null;
  creadoEn: FechaHoraISO;
}

export interface NuevoRegistroVenta {
  empleadoId: Id;
  municipioId?: Id | null;
  fecha: FechaISO;
  cantidad: number;
  nota?: string | null;
}

/** Total devengado: cantidad x tarifa de venta. */
export function devengadoDeVenta(registro: RegistroVenta): Money {
  return registro.cantidad * registro.tarifaVenta;
}

/** Total a entregar: cantidad x tarifa de liquidacion. */
export function liquidadoDeVenta(registro: RegistroVenta): Money {
  return registro.cantidad * registro.tarifaLiquidacion;
}

/** Retencion al ahorro: la diferencia entre lo devengado y lo liquidado. */
export function ahorroDeVenta(registro: RegistroVenta): Money {
  return registro.cantidad * (registro.tarifaVenta - registro.tarifaLiquidacion);
}
