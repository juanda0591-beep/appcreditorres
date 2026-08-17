import { and, gte, lte, sql, desc } from 'drizzle-orm';
import type { BalanceCaja, Periodo } from '@credito/shared';
import { db, esquema } from '../db/cliente.js';

const { movimientosCaja } = esquema;

/**
 * Balance del negocio en un periodo: cuanto entro, cuanto salio y la diferencia.
 *
 * Las sumas se hacen en SQL y no en JavaScript para no traer miles de filas
 * a memoria solo para sumarlas.
 */
export async function obtenerBalance(periodo: Periodo): Promise<BalanceCaja> {
  const enPeriodo = and(
    gte(movimientosCaja.fecha, periodo.desde),
    lte(movimientosCaja.fecha, periodo.hasta),
  );

  const [totales] = await db
    .select({
      ingresos: sql<number>`coalesce(sum(case when ${movimientosCaja.tipo} = 'ingreso' then ${movimientosCaja.monto} else 0 end), 0)`,
      egresos: sql<number>`coalesce(sum(case when ${movimientosCaja.tipo} = 'egreso' then ${movimientosCaja.monto} else 0 end), 0)`,
    })
    .from(movimientosCaja)
    .where(enPeriodo);

  const porCategoria = await db
    .select({
      categoria: movimientosCaja.categoria,
      tipo: movimientosCaja.tipo,
      total: sql<number>`sum(${movimientosCaja.monto})`,
    })
    .from(movimientosCaja)
    .where(enPeriodo)
    .groupBy(movimientosCaja.categoria, movimientosCaja.tipo)
    .orderBy(desc(sql`sum(${movimientosCaja.monto})`));

  const ingresos = totales?.ingresos ?? 0;
  const egresos = totales?.egresos ?? 0;

  return { periodo, ingresos, egresos, balance: ingresos - egresos, porCategoria };
}
