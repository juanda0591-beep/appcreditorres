import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';
import { carteraClientes } from './crm.js';

const idPorDefecto = () => randomUUID();

/**
 * Etiquetas para clasificar clientes de cartera
 */
export const etiquetasCartera = sqliteTable('etiquetas_cartera', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  nombre: text('nombre').notNull(), // Moroso, Acuerdo de pago, Cambió ubicación, etc.
  color: text('color').notNull(), // Código de color hex para visualización
  icono: text('icono'), // Emoji o nombre de icono
  descripcion: text('descripcion'),

  // Orden de visualización
  orden: integer('orden').notNull().default(0),

  // Si es una etiqueta del sistema (no se puede eliminar) o creada por usuario
  sistema: integer('sistema', { mode: 'boolean' }).notNull().default(false),

  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Relación muchos a muchos: un cliente puede tener múltiples etiquetas
 */
export const clienteEtiquetas = sqliteTable('cliente_etiquetas', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  carteraClienteId: text('cartera_cliente_id').notNull()
    .references(() => carteraClientes.id, { onDelete: 'cascade' }),

  etiquetaId: text('etiqueta_id').notNull()
    .references(() => etiquetasCartera.id, { onDelete: 'cascade' }),

  // Quién asignó la etiqueta
  usuarioId: text('usuario_id').notNull(),
  nombreUsuario: text('nombre_usuario').notNull(),

  // Notas opcionales al asignar la etiqueta
  notas: text('notas'),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Grupos/Listas de gestión para organizar campañas de cobranza
 */
export const gruposGestion = sqliteTable('grupos_gestion', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  nombre: text('nombre').notNull(), // "Morosos Agosto", "Lista pendientes", etc.
  descripcion: text('descripcion'),
  color: text('color').notNull(), // Color para identificar visualmente

  // Estado del grupo
  estado: text('estado').notNull().default('activo'), // activo, en_progreso, completado, archivado

  // Metadata de progreso
  totalClientes: integer('total_clientes').notNull().default(0),
  clientesGestionados: integer('clientes_gestionados').notNull().default(0),

  // Fechas importantes
  fechaInicio: text('fecha_inicio'),
  fechaObjetivo: text('fecha_objetivo'), // Meta para completar la gestión
  fechaCompletado: text('fecha_completado'),

  // Quién creó el grupo
  creadoPorId: text('creado_por_id').notNull(),
  creadoPorNombre: text('creado_por_nombre').notNull(),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Clientes asignados a grupos de gestión
 */
export const clientesGrupo = sqliteTable('clientes_grupo', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  grupoId: text('grupo_id').notNull()
    .references(() => gruposGestion.id, { onDelete: 'cascade' }),

  carteraClienteId: text('cartera_cliente_id').notNull()
    .references(() => carteraClientes.id, { onDelete: 'cascade' }),

  // Estado de gestión dentro de este grupo
  gestionado: integer('gestionado', { mode: 'boolean' }).notNull().default(false),
  fechaGestion: text('fecha_gestion'), // Cuándo se gestionó dentro de este grupo

  // Resultado específico de la gestión en este grupo
  resultado: text('resultado'), // contactado, promesa_pago, no_contactado, etc.
  notas: text('notas'),

  // Orden dentro del grupo (para priorización)
  orden: integer('orden').notNull().default(0),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});
