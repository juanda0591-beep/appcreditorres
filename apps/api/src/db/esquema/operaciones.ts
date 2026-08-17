import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';
import { empleados, municipios } from './personas.js';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Ventas de un empleado en un dia, agrupadas por cantidad.
 *
 * Las tarifas se COPIAN aqui al registrar. Si manana cambias la tarifa del
 * empleado, este registro conserva lo que se acordo ese dia y los pagos
 * viejos no se reescriben solos.
 */
export const registrosVenta = sqliteTable(
  'registros_venta',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    empleadoId: text('empleado_id')
      .notNull()
      .references(() => empleados.id, { onDelete: 'restrict' }),
    municipioId: text('municipio_id').references(() => municipios.id, {
      onDelete: 'set null',
    }),
    fecha: text('fecha').notNull(),
    cantidad: integer('cantidad').notNull(),

    tarifaVenta: integer('tarifa_venta').notNull(),
    tarifaLiquidacion: integer('tarifa_liquidacion').notNull(),

    nota: text('nota'),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    // Indice compuesto: casi toda consulta filtra por empleado y rango de fechas.
    index('idx_ventas_empleado_fecha').on(tabla.empleadoId, tabla.fecha),
    index('idx_ventas_fecha').on(tabla.fecha),
  ],
);

export type RegistroVentaFila = typeof registrosVenta.$inferSelect;
export type RegistroVentaInsert = typeof registrosVenta.$inferInsert;

/** Recaudo hecho en un municipio. El municipio es obligatorio: define la meta. */
export const registrosCobro = sqliteTable(
  'registros_cobro',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    empleadoId: text('empleado_id')
      .notNull()
      .references(() => empleados.id, { onDelete: 'restrict' }),
    municipioId: text('municipio_id')
      .notNull()
      .references(() => municipios.id, { onDelete: 'restrict' }),
    fecha: text('fecha').notNull(),

    montoRecaudado: integer('monto_recaudado').notNull(),

    /** Comision vigente al registrar. Copia de empleados.porcentaje_cobro. */
    porcentajeAplicado: real('porcentaje_aplicado').notNull(),

    nota: text('nota'),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_cobros_empleado_fecha').on(tabla.empleadoId, tabla.fecha),
    // Para evaluar metas mensuales por municipio.
    index('idx_cobros_municipio_fecha').on(tabla.municipioId, tabla.fecha),
  ],
);

export type RegistroCobroFila = typeof registrosCobro.$inferSelect;
export type RegistroCobroInsert = typeof registrosCobro.$inferInsert;

/** Gasto personal del empleado. Si es deducible, se le resta del pago. */
export const gastosEmpleado = sqliteTable(
  'gastos_empleado',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    empleadoId: text('empleado_id')
      .notNull()
      .references(() => empleados.id, { onDelete: 'restrict' }),
    municipioId: text('municipio_id').references(() => municipios.id, {
      onDelete: 'set null',
    }),
    fecha: text('fecha').notNull(),

    monto: integer('monto').notNull(),
    concepto: text('concepto').notNull(),

    /** true: se descuenta al empleado. false: lo asume el negocio. */
    deducible: integer('deducible', { mode: 'boolean' }).notNull().default(true),

    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [index('idx_gastos_empleado_fecha').on(tabla.empleadoId, tabla.fecha)],
);

export type GastoEmpleadoFila = typeof gastosEmpleado.$inferSelect;
export type GastoEmpleadoInsert = typeof gastosEmpleado.$inferInsert;
