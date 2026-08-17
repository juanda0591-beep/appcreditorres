import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';
import { empleados } from './personas.js';
import { liquidaciones } from './nomina.js';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Saldo actual del préstamo por empleado.
 * Un solo registro por empleado con el total acumulado.
 */
export const prestamosEmpleado = sqliteTable('prestamos_empleado', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  empleadoId: text('empleado_id')
    .notNull()
    .unique()
    .references(() => empleados.id, { onDelete: 'restrict' }),

  /** Deuda total pendiente. Puede ser 0 si no debe nada. */
  saldoActual: integer('saldo_actual').notNull().default(0),

  actualizadoEn: text('actualizado_en').notNull().$defaultFn(ahora),
});

export type PrestamoEmpleadoFila = typeof prestamosEmpleado.$inferSelect;
export type PrestamoEmpleadoInsert = typeof prestamosEmpleado.$inferInsert;

/**
 * Historial de movimientos de préstamo.
 * Cada fila es un préstamo otorgado o un abono realizado.
 */
export const movimientosPrestamo = sqliteTable(
  'movimientos_prestamo',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    empleadoId: text('empleado_id')
      .notNull()
      .references(() => empleados.id, { onDelete: 'restrict' }),
    fecha: text('fecha').notNull(),

    /** 'prestamo' = se le prestó dinero. 'abono' = descontó de su nómina. */
    tipo: text('tipo', { enum: ['prestamo', 'abono'] }).notNull(),

    /** Monto del movimiento. Siempre positivo. */
    monto: integer('monto').notNull(),

    /** Saldo antes de este movimiento. */
    saldoAnterior: integer('saldo_anterior').notNull(),

    /** Saldo después de este movimiento. */
    saldoNuevo: integer('saldo_nuevo').notNull(),

    concepto: text('concepto'),

    /** La liquidación donde se realizó el abono (null si es un préstamo). */
    liquidacionId: text('liquidacion_id').references(() => liquidaciones.id, {
      onDelete: 'set null',
    }),

    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_movimientos_prestamo_empleado_fecha').on(tabla.empleadoId, tabla.fecha),
    index('idx_movimientos_prestamo_liquidacion').on(tabla.liquidacionId),
  ],
);

export type MovimientoPrestamoFila = typeof movimientosPrestamo.$inferSelect;
export type MovimientoPrestamoInsert = typeof movimientosPrestamo.$inferInsert;
