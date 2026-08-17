import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';
import { empleados } from './personas.js';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Liquidacion guardada de un empleado en un periodo.
 *
 * Guardamos el resultado ya calculado y no solo los insumos, porque un pago
 * hecho es un hecho historico: si manana cambias una tarifa o corriges un
 * gasto viejo, el comprobante de lo que ya pagaste no debe cambiar.
 */
export const liquidaciones = sqliteTable(
  'liquidaciones',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    empleadoId: text('empleado_id')
      .notNull()
      .references(() => empleados.id, { onDelete: 'restrict' }),

    periodoDesde: text('periodo_desde').notNull(),
    periodoHasta: text('periodo_hasta').notNull(),

    // --- Ventas ---
    ventasCantidad: integer('ventas_cantidad').notNull().default(0),
    ventasDevengado: integer('ventas_devengado').notNull().default(0),
    ventasLiquidado: integer('ventas_liquidado').notNull().default(0),

    // --- Cobros ---
    cobrosRecaudado: integer('cobros_recaudado').notNull().default(0),
    cobrosComision: integer('cobros_comision').notNull().default(0),

    // --- Bonos y descuentos ---
    bonosTotal: integer('bonos_total').notNull().default(0),
    deduccionesTotal: integer('deducciones_total').notNull().default(0),

    // --- Totales ---
    totalBruto: integer('total_bruto').notNull(),
    netoAPagar: integer('neto_a_pagar').notNull(),
    ahorroRetenido: integer('ahorro_retenido').notNull().default(0),

    /** true si incluyo el bono mensual de municipios. */
    incluyoBonos: integer('incluyo_bonos', { mode: 'boolean' }).notNull().default(false),

    /** Detalle de bonos por municipio, en JSON, para el comprobante. */
    detalleBonos: text('detalle_bonos'),

    estado: text('estado', { enum: ['borrador', 'pagada', 'anulada'] })
      .notNull()
      .default('borrador'),
    pagadaEn: text('pagada_en'),
    nota: text('nota'),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_liquidaciones_empleado').on(tabla.empleadoId, tabla.periodoDesde),
    index('idx_liquidaciones_estado').on(tabla.estado),
  ],
);

export type LiquidacionFila = typeof liquidaciones.$inferSelect;
export type LiquidacionInsert = typeof liquidaciones.$inferInsert;

/**
 * Libro de movimientos del ahorro (los $1.000 retenidos por venta).
 *
 * No guardamos un campo "saldo": el saldo se calcula sumando los movimientos.
 * Asi, cuando un empleado pregunte por su plata, hay respuesta con fechas
 * y no un numero sin explicacion.
 *
 * Signo del monto: positivo entra al ahorro, negativo sale.
 */
export const movimientosAhorro = sqliteTable(
  'movimientos_ahorro',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    empleadoId: text('empleado_id')
      .notNull()
      .references(() => empleados.id, { onDelete: 'restrict' }),
    fecha: text('fecha').notNull(),

    tipo: text('tipo', { enum: ['retencion', 'pago', 'ajuste'] }).notNull(),

    /** Positivo suma, negativo descuenta. Un 'pago' siempre es negativo. */
    monto: integer('monto').notNull(),

    /** Id de la liquidacion o registro que lo origino. */
    referenciaId: text('referencia_id'),

    nota: text('nota'),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_ahorro_empleado_fecha').on(tabla.empleadoId, tabla.fecha),
    // Evita que una misma liquidacion genere dos veces su retencion de ahorro.
    unique('uq_ahorro_referencia').on(tabla.referenciaId, tabla.tipo),
  ],
);

export type MovimientoAhorroFila = typeof movimientosAhorro.$inferSelect;
export type MovimientoAhorroInsert = typeof movimientosAhorro.$inferInsert;
