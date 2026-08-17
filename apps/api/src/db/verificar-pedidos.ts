import { db } from './cliente.js';
import { sql } from 'drizzle-orm';

/**
 * Verificar y crear tabla de pedidos si no existe
 */
async function verificarTablaPedidos() {
  try {
    console.log('🔍 Verificando tabla pedidos_whatsapp...');

    // Intentar crear la tabla si no existe
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS pedidos_whatsapp (
        id TEXT PRIMARY KEY NOT NULL,
        conversacion_id TEXT NOT NULL,
        telefono TEXT NOT NULL,
        nombre_cliente TEXT NOT NULL,
        direccion TEXT,
        productos TEXT NOT NULL,
        total INTEGER NOT NULL,
        estado TEXT DEFAULT 'pendiente' NOT NULL,
        notas TEXT,
        creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      )
    `);

    console.log('✅ Tabla pedidos_whatsapp verificada/creada');

    // Verificar si hay registros
    const result = await db.run(sql`SELECT COUNT(*) as count FROM pedidos_whatsapp`);
    console.log(`📊 Pedidos en la base de datos: ${result.rows[0]?.count || 0}`);

  } catch (error) {
    console.error('❌ Error verificando tabla:', error);
  }
}

verificarTablaPedidos();
