import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Zonas de venta con su vendedor asignado.
 *
 * Cuando un cliente confirma intencion de compra por WhatsApp y dice en que
 * municipio o zona esta, el aviso se envia al numero de esta tabla en vez del
 * vendedor general de `configuracion.whatsappVendedor`. Si no hay match, se
 * usa ese vendedor general como respaldo.
 */
export const zonasVenta = sqliteTable(
  'zonas_venta',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    nombre: text('nombre').notNull().unique(),

    /** Numero de WhatsApp del vendedor de esta zona, con indicativo. */
    whatsappVendedor: text('whatsapp_vendedor').notNull(),

    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [index('idx_zonas_venta_activo').on(tabla.activo)],
);

export type ZonaVentaFila = typeof zonasVenta.$inferSelect;
export type ZonaVentaInsert = typeof zonasVenta.$inferInsert;
