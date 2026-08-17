import type { Id, FechaHoraISO } from './base.js';

/**
 * Roles del sistema.
 */
export type Rol = 'admin' | 'vendedor' | 'catalogo' | 'custom';

/**
 * Permisos granulares por módulo del sistema.
 */
export interface Permisos {
  dashboard: boolean;
  empleados: boolean;
  municipios: boolean;
  ventas: boolean;
  cobros: boolean;
  gastos: boolean;
  liquidaciones: boolean;
  caja: boolean;
  prestamos: boolean;
  catalogo: boolean;
  configuracion: boolean;
  usuarios: boolean;
}

/**
 * Fila de usuario de la base de datos (con permisos como JSON string).
 */
export interface UsuarioFila {
  id: Id;
  usuario: string;
  contrasenaHash: string;
  nombre: string;
  rol: Rol;
  permisos: string | null;
  empleadoId: string | null;
  activo: boolean;
  ultimoAcceso: FechaHoraISO | null;
  creadoEn: FechaHoraISO;
}

/**
 * Usuario del sistema.
 */
export interface Usuario {
  id: Id;
  usuario: string;
  nombre: string;
  rol: Rol;
  permisos: Permisos;
  empleadoId: string | null;
  activo: boolean;
  ultimoAcceso: FechaHoraISO | null;
  creadoEn: FechaHoraISO;
}

/**
 * Datos para crear un nuevo usuario.
 */
export interface NuevoUsuario {
  usuario: string;
  contrasena: string;
  nombre: string;
  rol: Rol;
  permisos?: Permisos;
  empleadoId?: string | null;
  activo?: boolean;
}

/**
 * Datos para actualizar un usuario (sin cambiar contraseña).
 */
export interface ActualizarUsuario {
  nombre?: string;
  rol?: Rol;
  permisos?: Permisos;
  empleadoId?: string | null;
  activo?: boolean;
}

/**
 * Datos para cambiar la contraseña de un usuario.
 */
export interface CambiarContrasena {
  contrasenaActual: string;
  contrasenaNueva: string;
}
