import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Suscripciones push de usuarios para notificaciones de pedidos
 */
export const suscripcionesPush = sqliteTable('suscripciones_push', {
  id: text('id').primaryKey(),
  usuarioId: text('usuario_id').notNull(), // ID del usuario admin que recibe notificaciones
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(), // Clave pública del cliente
  auth: text('auth').notNull(), // Secreto de autenticación
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull(),
  actualizadoEn: text('actualizado_en').notNull(),
});
