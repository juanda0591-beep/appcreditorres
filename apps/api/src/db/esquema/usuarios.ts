import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Roles del sistema.
 * - 'admin':     ve y edita todo
 * - 'vendedor':  solo sus propias operaciones
 * - 'catalogo':  solo productos y configuracion del catalogo
 * - 'custom':    permisos personalizados por pantalla
 */
export type Rol = 'admin' | 'vendedor' | 'catalogo' | 'custom';

/**
 * Permisos granulares por módulo del sistema.
 * Se almacenan como JSON en la base de datos.
 */
export interface Permisos {
  /** Dashboard y reportes generales */
  dashboard: boolean;
  /** Ver y gestionar empleados */
  empleados: boolean;
  /** Ver y gestionar municipios */
  municipios: boolean;
  /** Registrar ventas */
  ventas: boolean;
  /** Registrar cobros */
  cobros: boolean;
  /** Ver y gestionar gastos */
  gastos: boolean;
  /** Ver y gestionar liquidaciones */
  liquidaciones: boolean;
  /** Ver y gestionar caja */
  caja: boolean;
  /** Ver y gestionar préstamos */
  prestamos: boolean;
  /** Ver y gestionar catálogo de productos */
  catalogo: boolean;
  /** Configuración del sistema */
  configuracion: boolean;
  /** Gestionar usuarios y permisos */
  usuarios: boolean;
}

export const usuarios = sqliteTable(
  'usuarios',
  {
    id: text('id').primaryKey().$defaultFn(idPorDefecto),

    /** Nombre de acceso, en minusculas y sin espacios. */
    usuario: text('usuario').notNull().unique(),

    /**
     * Hash de la contrasena en formato "scrypt$sal$hash".
     * NUNCA se guarda la contrasena en texto plano.
     */
    contrasenaHash: text('contrasena_hash').notNull(),

    nombre: text('nombre').notNull(),
    rol: text('rol', { enum: ['admin', 'vendedor', 'catalogo', 'custom'] }).notNull().default('custom'),

    /**
     * Permisos personalizados (JSON).
     * Solo se usa cuando rol='custom'. Los otros roles tienen permisos predefinidos.
     */
    permisos: text('permisos'),

    /** Si está vinculado a un empleado, aquí va su ID */
    empleadoId: text('empleado_id'),

    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),

    /** Ultimo ingreso, para notar accesos raros. */
    ultimoAcceso: text('ultimo_acceso'),

    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_usuarios_activo').on(tabla.activo),
    index('idx_usuarios_empleado').on(tabla.empleadoId),
  ],
);

export type UsuarioFila = typeof usuarios.$inferSelect;
export type UsuarioInsert = typeof usuarios.$inferInsert;

/**
 * Sesiones abiertas.
 *
 * Se guardan en la base y no solo en un token firmado (JWT) para poder
 * CERRARLAS. Con un JWT puro, si alguien se roba el token no hay forma de
 * invalidarlo hasta que expire. Aqui basta borrar la fila.
 *
 * En un sistema que maneja salarios, poder cortar el acceso de inmediato
 * vale mas que ahorrarse la consulta a la base.
 */
export const sesiones = sqliteTable(
  'sesiones',
  {
    /** Token aleatorio que viaja en la cookie. */
    id: text('id').primaryKey(),

    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),

    /** Cuando deja de servir. Se compara contra la fecha actual al validar. */
    expiraEn: text('expira_en').notNull(),

    /** Datos del acceso, para revisar si algo se ve raro. */
    ip: text('ip'),
    navegador: text('navegador'),

    creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  },
  (tabla) => [
    index('idx_sesiones_usuario').on(tabla.usuarioId),
    index('idx_sesiones_expira').on(tabla.expiraEn),
  ],
);

export type SesionFila = typeof sesiones.$inferSelect;

/** Duracion de la sesion: 7 dias sin tener que volver a entrar. */
export const DIAS_SESION = 7;
