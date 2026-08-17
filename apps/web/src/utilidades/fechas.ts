import { periodoQuincena, periodoDelMes, type Periodo } from '@credito/shared';

/** Fecha de hoy en ISO corto, en la zona local (no UTC). */
export function hoy(): string {
  const ahora = new Date();
  // toISOString() usa UTC y en Colombia (UTC-5) eso da el dia anterior
  // durante toda la manana. Se arma a mano con los valores locales.
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Quincena actual, que es el periodo por defecto de la nomina. */
export function quincenaActual(): Periodo {
  return periodoQuincena(hoy());
}

export function mesActual(): Periodo {
  return periodoDelMes(hoy());
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "2026-08-09" -> "9 de agosto" */
export function fechaCorta(iso: string): string {
  const dia = Number(iso.slice(8, 10));
  const mes = MESES[Number(iso.slice(5, 7)) - 1] ?? '';
  return `${dia} de ${mes}`;
}

/** Describe un periodo en lenguaje natural. */
export function describirPeriodo(periodo: Periodo): string {
  const mesDesde = periodo.desde.slice(0, 7);
  const mesHasta = periodo.hasta.slice(0, 7);

  if (mesDesde === mesHasta) {
    const nombreMes = MESES[Number(mesDesde.slice(5, 7)) - 1] ?? '';
    const diaDesde = Number(periodo.desde.slice(8, 10));
    const diaHasta = Number(periodo.hasta.slice(8, 10));
    return `${diaDesde} al ${diaHasta} de ${nombreMes}`;
  }

  return `${fechaCorta(periodo.desde)} al ${fechaCorta(periodo.hasta)}`;
}

/** Las dos quincenas de un mes, para el selector de periodo. */
export function quincenasDelMes(mesISO: string): Periodo[] {
  const mes = periodoDelMes(`${mesISO}-01`);
  return [
    { desde: mes.desde, hasta: `${mesISO}-15` },
    { desde: `${mesISO}-16`, hasta: mes.hasta },
  ];
}
