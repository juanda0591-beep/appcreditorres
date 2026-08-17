/** Tipos primitivos compartidos por todo el dominio. */

export type Id = string;

/** Fecha en formato ISO corto: "2026-08-09". Sin hora, sin zona horaria. */
export type FechaISO = string;

/** Marca de tiempo ISO completa: "2026-08-09T14:30:00.000Z". */
export type FechaHoraISO = string;

/** Rango de fechas inclusivo en ambos extremos. */
export interface Periodo {
  desde: FechaISO;
  hasta: FechaISO;
}

export const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaISO(valor: unknown): valor is FechaISO {
  if (typeof valor !== 'string' || !REGEX_FECHA_ISO.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
}

/**
 * Indica si una fecha cae dentro del periodo (limites incluidos).
 * Compara como texto, que para ISO corto equivale a comparar cronologicamente.
 */
export function estaEnPeriodo(fecha: FechaISO, periodo: Periodo): boolean {
  return fecha >= periodo.desde && fecha <= periodo.hasta;
}

/**
 * Periodo del mes completo al que pertenece una fecha.
 * Se usa para evaluar las metas de municipio, que son mensuales
 * aunque la liquidacion se pague cada quincena.
 */
export function periodoDelMes(fecha: FechaISO): Periodo {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  // Dia 0 del mes siguiente = ultimo dia de este mes.
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${ultimoDia}` };
}

/** Quincena a la que pertenece una fecha: del 1 al 15, o del 16 al fin de mes. */
export function periodoQuincena(fecha: FechaISO): Periodo {
  const mes = periodoDelMes(fecha);
  const dia = Number(fecha.slice(8, 10));
  return dia <= 15
    ? { desde: mes.desde, hasta: `${fecha.slice(0, 7)}-15` }
    : { desde: `${fecha.slice(0, 7)}-16`, hasta: mes.hasta };
}

/** True si el periodo cierra el mes (su ultimo dia es el ultimo del mes). */
export function cierraElMes(periodo: Periodo): boolean {
  return periodo.hasta === periodoDelMes(periodo.hasta).hasta;
}
