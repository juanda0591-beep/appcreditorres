import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

export const conversacionesCobranza = sqliteTable('conversaciones_cobranza', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  jid: text('jid').notNull().unique(),
  telefono: text('telefono'),
  nombre: text('nombre'),
  documento: text('documento'),
  pausada: integer('pausada', { mode: 'boolean' }).notNull().default(false),
  requiereAsesor: integer('requiere_asesor', { mode: 'boolean' }).notNull().default(false),
  ultimoMensaje: text('ultimo_mensaje').notNull().default(''),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});
export const mensajesCobranza = sqliteTable('mensajes_cobranza', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  conversacionId: text('conversacion_id').notNull().references(() => conversacionesCobranza.id, { onDelete: 'cascade' }),
  externoId: text('externo_id'),
  rol: text('rol').notNull(),
  contenido: text('contenido').notNull(),
  estado: text('estado').notNull().default('recibido'),
  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
}, tabla => [index('idx_mensajes_cobranza_conversacion').on(tabla.conversacionId, tabla.creadoEn),
  uniqueIndex('uq_mensajes_cobranza_externo').on(tabla.conversacionId, tabla.externoId)]);
