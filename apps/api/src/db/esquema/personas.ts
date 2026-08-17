import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

/**
 * CONVENCIONES DE ESTE ESQUEMA
 *
 * - Dinero: INTEGER de pesos colombianos. Nunca REAL (los flotantes
 *   pierden precision y la nomina termina descuadrada por centavos).
 * - Fechas: TEXT en ISO corto "2026-08-09". Ordenan bien como texto.
 * - Porcentajes: REAL, porque un 2.5% es valido.
 * - Booleanos: INTEGER 0/1, que es como SQLite los guarda.
 */

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

export const empleados = sqliteTable(
  'empleados',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    nombre: text('nombre').notNull(),
    documento: text('documento'),
    telefono: text('telefono'),

    /** Lo que vale cada venta. Tipico: 6000 */
    tarifaVenta: integer('tarifa_venta').notNull().default(6000),

    /** Lo que se le entrega por venta. Tipico: 5000 */
    tarifaLiquidacion: integer('tarifa_liquidacion').notNull().default(5000),

    /** Comision sobre recaudo. Tipico: 10 (=10%) */
    porcentajeCobro: real('porcentaje_cobro').notNull().default(10),

    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [index('idx_empleados_activo').on(tabla.activo)],
);

export type EmpleadoFila = typeof empleados.$inferSelect;
export type EmpleadoInsert = typeof empleados.$inferInsert;

/**
 * Municipios donde se cobra. Cada uno con SU PROPIA meta y SU PROPIO
 * porcentaje de bono: Granada puede tener meta 7M al 4% y Sonson 5M al 3%.
 */
export const municipios = sqliteTable(
  'municipios',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    nombre: text('nombre').notNull().unique(),

    /** Meta MENSUAL de recaudo. Si la supera, se genera bono. */
    metaRecaudo: integer('meta_recaudo').notNull(),

    /** Porcentaje extra por superar la meta. Granada: 4 */
    porcentajeExcedente: real('porcentaje_excedente').notNull().default(0),

    /** 'excedente' aplica el % solo a lo que paso de la meta. 'total' a todo. */
    baseBono: text('base_bono', { enum: ['excedente', 'total'] })
      .notNull()
      .default('excedente'),

    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [index('idx_municipios_activo').on(tabla.activo)],
);

export type MunicipioFila = typeof municipios.$inferSelect;
export type MunicipioInsert = typeof municipios.$inferInsert;
