import { db } from './cliente.js';
import { plantillasCobranza } from './esquema/crm.js';
import { eq } from 'drizzle-orm';

/**
 * Seed de plantillas de cobranza predeterminadas.
 * Idempotente: solo inserta si la plantilla no existe.
 */

const plantillasPredeterminadas = [
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

Por favorconfírmanos tu nueva ubicación para actualizar nuestros registros y coordinar el cobro de tu crédito #{{numero}} (saldo: {{saldo}}).

Es importante que mantengamos el contacto. Gracias.`,
    orden: 6,
  },
];

export async function seedPlantillas() {
  console.log('🌱 Verificando plantillas de cobranza...');

  for (const plantilla of plantillasPredeterminadas) {
    const existe = await db
      .select()
      .from(plantillasCobranza)
      .where(eq(plantillasCobranza.nombre, plantilla.nombre))
      .limit(1);

    if (existe.length === 0) {
      await db.insert(plantillasCobranza).values({
        ...plantilla,
        activa: true,
      });
      console.log(`  ✓ Plantilla creada: ${plantilla.nombre}`);
    } else {
      console.log(`  - Ya existe: ${plantilla.nombre}`);
    }
  }

  console.log('✅ Seed de plantillas completado');
}

// Ejecutar si se invoca directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPlantillas()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error en seed:', error);
      process.exit(1);
    });
}
