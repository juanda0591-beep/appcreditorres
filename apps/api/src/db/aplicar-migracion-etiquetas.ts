import { createClient } from '@libsql/client';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const client = createClient({
  url: `file:${resolve(process.cwd(), 'datos', 'credito.db')}`,
});

async function aplicarMigracion() {
  console.log('📦 Aplicando migración de etiquetas y grupos...\n');

  try {
    // Leer el archivo SQL de migración
    const sqlPath = resolve(process.cwd(), 'migraciones', '0007_etiquetas_grupos.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // Ejecutar todo el SQL de una vez
    await client.executeMultiple(sql);
    console.log('✓ Migración ejecutada')

    console.log('\n✅ Migración aplicada exitosamente\n');

    // Verificar que las etiquetas predefinidas se insertaron
    const etiquetas = await client.execute('SELECT COUNT(*) as total FROM etiquetas_cartera');
    console.log(`📊 Etiquetas predefinidas: ${etiquetas.rows[0].total}`);

    // Mostrar las etiquetas
    const lista = await client.execute(`
      SELECT nombre, color, icono, descripcion
      FROM etiquetas_cartera
      WHERE sistema = 1
      ORDER BY orden
    `);

    console.log('\n🏷️  Etiquetas del sistema:\n');
    lista.rows.forEach((row) => {
      console.log(`  ${row.icono} ${row.nombre}`);
      console.log(`     Color: ${row.color}`);
      console.log(`     ${row.descripcion}\n`);
    });

    console.log('✅ Sistema de etiquetas y grupos listo para usar');
  } catch (error) {
    console.error('❌ Error al aplicar migración:', error);
    throw error;
  }
}

aplicarMigracion().catch(console.error);
