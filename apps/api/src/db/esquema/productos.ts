import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Catalogo de productos. Es la UNICA tabla con lectura publica:
 * el catalogo se comparte por WhatsApp y lo abre gente sin cuenta.
 *
 * OJO: no agregar aqui costo de compra, proveedor ni margen. Si se necesita
 * esa informacion va en otra tabla privada, porque lo que este en esta tabla
 * queda expuesto a cualquiera que abra el link del catalogo.
 */
export const productos = sqliteTable(
  'productos',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),

    /** Precio de contado (al instante) */
    precioContado: integer('precio_contado').notNull().default(0),
    /** Precio credicontado (mezcla de crédito con inicial) */
    precioCredicontado: integer('precio_credicontado').notNull().default(0),
    /** Precio a crédito puro */
    precioCredito: integer('precio_credito').notNull().default(0),
    /** Inicial requerida para crédito */
    inicial: integer('inicial').notNull().default(0),
    /** Pago semanal (se calcula quincenal = x2, mensual = x4) */
    pagoSemanal: integer('pago_semanal').notNull().default(0),

    /** Precio legacy - se mantiene para compatibilidad */
    precio: integer('precio').notNull().default(0),

    categoria: text('categoria'),

    /**
     * Múltiples imágenes guardadas como JSON array de objetos.
     * Cada objeto tiene: {imagenUrl, miniaturaUrl}
     */
    imagenes: text('imagenes'),

    /**
     * Imagen principal (legacy, para compatibilidad).
     */
    imagenUrl: text('imagen_url'),
    miniaturaUrl: text('miniatura_url'),

    /** Solo los visibles salen en el catalogo publico. */
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    disponible: integer('disponible', { mode: 'boolean' }).notNull().default(true),

    /** Marcar producto como nuevo (muestra badge) */
    esNuevo: integer('es_nuevo', { mode: 'boolean' }).notNull().default(false),
    /** Marcar producto en promoción (muestra badge) */
    enPromocion: integer('en_promocion', { mode: 'boolean' }).notNull().default(false),

    /** Orden manual del catalogo. Menor primero. */
    orden: integer('orden').notNull().default(0),

    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
    actualizadoEn: text('actualizado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    // El catalogo publico filtra por visible y ordena por orden.
    index('idx_productos_visible_orden').on(tabla.visible, tabla.orden),
    index('idx_productos_categoria').on(tabla.categoria),
  ],
);

export type ProductoFila = typeof productos.$inferSelect;
export type ProductoInsert = typeof productos.$inferInsert;
