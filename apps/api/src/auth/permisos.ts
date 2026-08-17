import type { Permisos, Rol } from '../db/esquema/usuarios.js';

/**
 * Permisos predefinidos por rol.
 * Los roles 'admin', 'vendedor' y 'catalogo' tienen permisos fijos.
 * El rol 'custom' usa los permisos almacenados en la base de datos.
 */

export const PERMISOS_POR_ROL: Record<Exclude<Rol, 'custom'>, Permisos> = {
  admin: {
    dashboard: true,
    empleados: true,
    municipios: true,
    ventas: true,
    cobros: true,
    gastos: true,
    liquidaciones: true,
    caja: true,
    prestamos: true,
    catalogo: true,
    configuracion: true,
    usuarios: true,
  },
  vendedor: {
    dashboard: false,
    empleados: false,
    municipios: false,
    ventas: true,
    cobros: true,
    gastos: true,
    liquidaciones: false,
    caja: false,
    prestamos: false,
    catalogo: false,
    configuracion: false,
    usuarios: false,
  },
  catalogo: {
    dashboard: false,
    empleados: false,
    municipios: false,
    ventas: false,
    cobros: false,
    gastos: false,
    liquidaciones: false,
    caja: false,
    prestamos: false,
    catalogo: true,
    configuracion: true,
    usuarios: false,
  },
};

/**
 * Permisos por defecto para nuevos usuarios con rol 'custom'.
 * Por defecto no tienen acceso a nada.
 */
export const PERMISOS_DEFECTO: Permisos = {
  dashboard: false,
  empleados: false,
  municipios: false,
  ventas: false,
  cobros: false,
  gastos: false,
  liquidaciones: false,
  caja: false,
  prestamos: false,
  catalogo: false,
  configuracion: false,
  usuarios: false,
};

/**
 * Obtiene los permisos efectivos de un usuario según su rol.
 * Si el rol es 'custom', usa los permisos almacenados en la base de datos.
 * Si no, usa los permisos predefinidos del rol.
 */
export function obtenerPermisos(rol: Rol, permisosJson: string | null): Permisos {
  if (rol === 'custom') {
    if (!permisosJson) return PERMISOS_DEFECTO;
    try {
      return JSON.parse(permisosJson) as Permisos;
    } catch {
      return PERMISOS_DEFECTO;
    }
  }
  return PERMISOS_POR_ROL[rol];
}

/**
 * Verifica si un usuario tiene permiso para acceder a un módulo.
 */
export function tienePermiso(
  rol: Rol,
  permisosJson: string | null,
  modulo: keyof Permisos,
): boolean {
  const permisos = obtenerPermisos(rol, permisosJson);
  return permisos[modulo] === true;
}

/**
 * Valida que un objeto de permisos tenga la estructura correcta.
 */
export function validarPermisos(permisos: unknown): permisos is Permisos {
  if (typeof permisos !== 'object' || permisos === null) return false;

  const keys: (keyof Permisos)[] = [
    'dashboard',
    'empleados',
    'municipios',
    'ventas',
    'cobros',
    'gastos',
    'liquidaciones',
    'caja',
    'prestamos',
    'catalogo',
    'configuracion',
    'usuarios',
  ];

  return keys.every((key) => typeof (permisos as Record<string, unknown>)[key] === 'boolean');
}
