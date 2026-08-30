import { createClient } from '@libsql/client';
import { resolve } from 'path';

const client = createClient({
  url: `file:${resolve(process.cwd(), 'datos', 'credito.db')}`,
});

const plantillas = [
  {
    nombre: 'Recordatorio amable',
    categoria: 'recordatorio',
    cuerpo: `Hola {{cliente}}, somos de Créditos Torres. 👋

Te recordamos que tienes una cuota pendiente de {{cuota}} para tu {{articulo}} (Crédito #{{numero}}).

¿Cuándo podrías realizar el abono? Estamos para ayudarte. 😊`,
    orden: 1,
  },
  {
    nombre: 'Mora temprana - hasta 15 días',
    categoria: 'mora_temprana',
    cuerpo: `Hola {{cliente}}, te escribimos de Créditos Torres.

Vemos que tu crédito #{{numero}} tiene {{diasMora}} días de mora. Tu saldo actual es de {{saldo}}.

¿Hay alguna dificultad para el pago? Podemos buscar una solución juntos. 💬`,
    orden: 2,
  },
  {
    nombre: 'Mora alta - más de 30 días',
    categoria: 'mora_alta',
    cuerpo: `{{cliente}}, te contactamos de Créditos Torres sobre tu crédito #{{numero}}.

Llevas {{diasMora}} días de mora con un saldo de {{saldo}}. Es importante que te pongas al día para evitar inconvenientes mayores.

Comunícate con nosotros lo antes posible para buscar una solución. Tu vendedor es {{vendedor}}.`,
    orden: 3,
  },
  {
    nombre: 'Confirmación de promesa de pago',
    categoria: 'promesa',
    cuerpo: `Perfecto {{cliente}}, quedamos entonces que el próximo pago lo realizas en la fecha acordada. 📅

Tu saldo actual es de {{saldo}}. Cualquier inquietud, escríbenos.

¡Gracias por tu compromiso! 🙏`,
    orden: 4,
  },
  {
    nombre: 'Agradecimiento por pago',
    categoria: 'agradecimiento',
    cuerpo: `¡Gracias {{cliente}} por tu pago! ✅

Hemos registrado tu abono. Tu nuevo saldo es de {{saldo}}.

Te esperamos en el próximo pago. ¡Que tengas un excelente día! 😊`,
    orden: 5,
  },
  {
    nombre: 'Seguimiento cambio de ubicación',
    categoria: 'mora_alta',
    cuerpo: `{{cliente}}, nos informaron que cambiaste de dirección.

Por favor confírmanos tu nueva ubicación para actualizar nuestros registros y coordinar el cobro de tu crédito #{{numero}} (saldo: {{saldo}}).

Es importante que mantengamos el contacto. Gracias.`,
    orden: 6,
  },
];

async function insertarPlantillas() {
  console.log('🌱 Insertando plantillas de cobranza...');

  for (const plantilla of plantillas) {
    const id = Math.random().toString(36).substring(2, 15);
    const ahora = new Date().toISOString();

    try {
      // Verificar si ya existe
      const existe = await client.execute({
        sql: 'SELECT id FROM plantillas_cobranza WHERE nombre = ?',
        args: [plantilla.nombre],
      });

      if (existe.rows.length > 0) {
        console.log(`  - Ya existe: ${plantilla.nombre}`);
        continue;
      }

      // Insertar
      await client.execute({
        sql: `INSERT INTO plantillas_cobranza (id, nombre, categoria, cuerpo, activa, orden, creado_en, actualizado_en)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, plantilla.nombre, plantilla.categoria, plantilla.cuerpo, 1, plantilla.orden, ahora, ahora],
      });

      console.log(`  ✓ Plantilla creada: ${plantilla.nombre}`);
    } catch (error: any) {
      console.error(`  ✗ Error con ${plantilla.nombre}:`, error.message);
    }
  }

  // Verificar cuántas hay
  const result = await client.execute('SELECT COUNT(*) as total FROM plantillas_cobranza');
  console.log(`\n✅ Total de plantillas en BD: ${result.rows[0].total}`);
}

insertarPlantillas()
  .then(() => {
    client.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    client.close();
    process.exit(1);
  });
