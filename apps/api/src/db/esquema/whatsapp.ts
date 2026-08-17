import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Conversaciones de WhatsApp
 */
export const conversacionesWhatsapp = sqliteTable('conversaciones_whatsapp', {
  id: text('id').primaryKey(),
  telefono: text('telefono').notNull(), // Número de WhatsApp del cliente
  nombreCliente: text('nombre_cliente'),
  estado: text('estado').notNull().default('activa'), // activa, cerrada, esperando
  ultimoMensaje: text('ultimo_mensaje'),
  creadoEn: text('creado_en').notNull(),
  actualizadoEn: text('actualizado_en').notNull(),
});

/**
 * Mensajes de WhatsApp (historial)
 */
export const mensajesWhatsapp = sqliteTable('mensajes_whatsapp', {
  id: text('id').primaryKey(),
  conversacionId: text('conversacion_id')
    .notNull()
    .references(() => conversacionesWhatsapp.id),
  rol: text('rol').notNull(), // user, assistant, system
  contenido: text('contenido').notNull(),
  metadata: text('metadata'), // JSON con info adicional (productos mencionados, etc)
  creadoEn: text('creado_en').notNull(),
});

/**
 * Pedidos desde WhatsApp
 */
export const pedidosWhatsapp = sqliteTable('pedidos_whatsapp', {
  id: text('id').primaryKey(),
  conversacionId: text('conversacion_id')
    .notNull()
    .references(() => conversacionesWhatsapp.id),
  telefono: text('telefono').notNull(),
  nombreCliente: text('nombre_cliente').notNull(),
  direccion: text('direccion'),
  productos: text('productos').notNull(), // JSON array de productos
  total: integer('total').notNull(), // En centavos
  estado: text('estado').notNull().default('pendiente'), // pendiente, confirmado, enviado, entregado, cancelado
  notas: text('notas'),
  creadoEn: text('creado_en').notNull(),
  actualizadoEn: text('actualizado_en').notNull(),
});

/**
 * Campañas de WhatsApp
 */
export const campanasWhatsapp = sqliteTable('campanas_whatsapp', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  mensaje: text('mensaje').notNull(),
  estado: text('estado').notNull().default('borrador'), // borrador, programada, enviando, completada, cancelada
  destinatarios: text('destinatarios').notNull(), // JSON array de teléfonos
  productosRelacionados: text('productos_relacionados'), // JSON array de IDs de productos
  enviadosCount: integer('enviados_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  programadaPara: text('programada_para'),
  creadoEn: text('creado_en').notNull(),
  actualizadoEn: text('actualizado_en').notNull(),
});
