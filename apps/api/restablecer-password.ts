import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { usuarios } from './src/db/esquema/usuarios.js';
import { hashearContrasena } from './src/servicios/contrasenas.js';

const sqlite = new Database('./datos/credito.db');
const db = drizzle(sqlite);

const USUARIO = 'juanda07';
const NUEVA_CONTRASENA = 'admin123'; // Cambia esta contraseña después de entrar

async function main() {
  console.log(`Restableciendo contraseña para usuario: ${USUARIO}`);

  const hash = await hashearContrasena(NUEVA_CONTRASENA);

  await db
    .update(usuarios)
    .set({ contrasenaHash: hash })
    .where(eq(usuarios.usuario, USUARIO));

  console.log('✓ Contraseña restablecida exitosamente');
  console.log(`Usuario: ${USUARIO}`);
  console.log(`Nueva contraseña: ${NUEVA_CONTRASENA}`);
  console.log('\n⚠️  IMPORTANTE: Cambia esta contraseña después de iniciar sesión');

  sqlite.close();
}

main().catch(console.error);
