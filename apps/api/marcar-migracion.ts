import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';

const client = createClient({
  url: `file:${process.env.DB_RUTA ?? './datos/credito.db'}`,
});

async function marcarMigracion() {
  try {
    // Insertar la migración como aplicada
    await client.execute({
      sql: `INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
      args: [
        (Date.now() * Math.random()).toString(36), // hash único
        Date.now(),
      ],
    });

    console.log('Migración marcada como aplicada');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.close();
  }
}

marcarMigracion();
