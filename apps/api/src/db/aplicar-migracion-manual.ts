import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = createClient({
  url: `file:${join(process.cwd(), 'datos', 'credito.db')}`,
});

async function aplicarMigracion() {
  const sql = readFileSync(join(process.cwd(), 'migraciones', '0014_cooing_jubilee.sql'), 'utf-8');

  try {
    await client.execute(sql);
    console.log('✅ Migración 0014 aplicada correctamente');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  La tabla ya existe');
    } else {
      console.error('Error:', error.message);
      throw error;
    }
  }
}

aplicarMigracion()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
