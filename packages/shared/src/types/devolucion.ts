import type { Id, FechaISO, FechaHoraISO } from './base.js';
import type { Money } from '../money.js';

/**
 * Devolución de ventas: productos que regresaron y se descuentan de la
 * liquidación del empleado. Afecta el pago igual que un gasto deducible.
 */
export interface DevolucionVenta {
  id: Id;
  empleadoId: Id;
  municipioId: Id | null;
  fecha: FechaISO;

  /** Número de ventas devueltas. */
  cantidad: number;

  /** Tarifa vigente al registrar la devolución. Copia de Empleado.tarifaVenta. */
  tarifaVenta: Money;

  motivo: string | null;
  creadoEn: FechaHoraISO;
}

export interface NuevaDevolucionVenta {
  empleadoId: Id;
  municipioId?: Id | null;
  fecha: FechaISO;
  cantidad: number;
  motivo?: string | null;
}

/** Total a descontar: cantidad x tarifa de venta. */
export function montoDevolucion(devolucion: DevolucionVenta): Money {
  return devolucion.cantidad * devolucion.tarifaVenta;
}
