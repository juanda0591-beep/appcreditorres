import { db } from './cliente.js';
import { plantillasCobranza } from './esquema/crm.js';

async function verificarPlantillas() {
  const plantillas = await db.select().from(plantillasCobranza);
  console.log(`Total de plantillas: ${plantillas.length}`);
  plantillas.forEach(p => {
    console.log(`- ${p.nombre} (${p.categoria})`);
  });
}

verificarPlantillas()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
