import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';
import { empleados } from './personas.js';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Control de dinero del negocio: ingresos y egresos con su balance.
 * Aqui caen los recaudos que entran y los pagos de nomina que salen.
 */
export const movimientosCaja = sqliteTable(
  'movimientos_caja',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    fecha: text('fecha').notNull(),

    tipo: text('tipo', { enum: ['ingreso', 'egreso'] }).notNull(),
    monto: integer('monto').notNull(),
    categoria: text('categoria').notNull(),
    concepto: text('concepto').notNull(),

    empleadoId: text('empleado_id').references(() => empleados.id, {
      onDelete: 'set null',
    }),

    /** Que genero el movimiento: 'nomina', 'cobro', 'manual'. */
    origen: text('origen'),
    referenciaId: text('referencia_id'),

    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_caja_fecha').on(tabla.fecha),
    index('idx_caja_tipo_fecha').on(tabla.tipo, tabla.fecha),
    index('idx_caja_categoria').on(tabla.categoria),
  ],
);

export type MovimientoCajaFila = typeof movimientosCaja.$inferSelect;
export type MovimientoCajaInsert = typeof movimientosCaja.$inferInsert;
