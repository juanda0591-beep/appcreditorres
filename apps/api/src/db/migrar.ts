import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { config } from '../config.js';
import { db, cerrarBaseDatos } from './cliente.js';

/**
 * Carpeta de migraciones resuelta desde este archivo, no desde el directorio
 * donde se ejecuto el comando: asi funciona igual con `npm run dev` desde la
 * raiz, desde apps/api, o con el codigo compilado en dist/.
 */
function carpetaMigraciones(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  // src/db/ -> apps/api/migraciones  |  dist/db/ -> apps/api/migraciones
  return join(aqui, '..', '..', 'migraciones');
}

/**
 * Aplica las migraciones pendientes. Es idempotente: drizzle lleva su propia
 * tabla de control, asi que correrlo dos veces no duplica nada.
 */
export async function aplicarMigraciones(): Promise<void> {
  await migrate(db, { migrationsFolder: carpetaMigraciones() });
}

/** Punto de entrada del comando: npm run db:migrate */
async function principal(): Promise<void> {
  console.log(`Aplicando migraciones en ${config.rutaBaseDatos}`);
  await aplicarMigraciones();
  console.log('Migraciones aplicadas');
  cerrarBaseDatos();
}

// Solo corre como script si se invoco directamente este archivo.
// Cuando el servidor lo importa, unicamente toma la funcion.
const invocadoDirectamente =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invocadoDirectamente) {
  principal().catch((error: unknown) => {
    console.error('Fallaron las migraciones:', error);
    process.exit(1);
  });
}
