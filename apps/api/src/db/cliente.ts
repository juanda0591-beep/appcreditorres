import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/libsql';
import * as esquema from './esquema/index.js';
import { config } from '../config.js';

/**
 * Conexion a la base de datos (libSQL, compatible con SQLite).
 *
 * Se usa libSQL y no better-sqlite3 porque los binarios nativos de
 * better-sqlite3 fallan con el ABI de Node 22 en Windows (segfault al abrir
 * la conexion). libSQL trae binarios que si funcionan aqui.
 *
 * Ventaja adicional: el mismo codigo sirve para un archivo local y para una
 * base remota en Turso, cambiando solo la URL. Util si mas adelante quieres
 * que varias personas usen el sistema desde distintos equipos.
 */

// La carpeta debe existir antes de abrir el archivo.
mkdirSync(dirname(config.rutaBaseDatos), { recursive: true });

const cliente = createClient({ url: config.urlBaseDatos });

export const db = drizzle(cliente, { schema: esquema, casing: 'snake_case' });

export { esquema };

/** Cierra la conexion. Se usa al apagar el servidor y en los tests. */
export function cerrarBaseDatos(): void {
  cliente.close();
}
