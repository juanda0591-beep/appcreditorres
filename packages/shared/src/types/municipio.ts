import type { Id, FechaHoraISO } from './base.js';
import type { Money, Percent } from '../money.js';

/**
 * Sobre que monto se calcula el bono cuando el empleado supera la meta.
 * - 'excedente': solo sobre lo que paso de la meta (comportamiento por defecto)
 * - 'total':     sobre todo lo recaudado en el municipio
 */
export type BaseBono = 'excedente' | 'total';

/**
 * Municipio donde se cobra, con la meta acordada y el premio por superarla.
 * El bono se liquida mensual, aparte de la comision normal de cobro.
 */
export interface Municipio {
  id: Id;
  nombre: string;

  /** Monto acordado de recaudo para el mes. Si se supera, se genera bono. */
  metaRecaudo: Money;

  /** Porcentaje extra por superar la meta. Ejemplo: 2 (=2%) */
  porcentajeExcedente: Percent;

  /** Define si el porcentaje extra aplica al excedente o al total recaudado. */
  baseBono: BaseBono;

  activo: boolean;
  creadoEn: FechaHoraISO;
}

export interface NuevoMunicipio {
  nombre: string;
  metaRecaudo: Money;
  porcentajeExcedente: Percent;
  baseBono?: BaseBono;
}

export const BASE_BONO_DEFECTO: BaseBono = 'excedente';
