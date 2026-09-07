import { construirApp } from './app.js';
import { config } from './config.js';
import { cerrarBaseDatos } from './db/cliente.js';
import { aplicarMigraciones } from './db/migrar.js';
import { conectarWhatsApp, desconectarWhatsApp } from './whatsapp/baileys-client.js';

/** Arranque del servidor con apagado ordenado. */
async function iniciar(): Promise<void> {
  const app = await construirApp();

  // Las migraciones se aplican al arrancar. Sin esto, una base recien creada
  // (o borrada) deja el servidor respondiendo 500 en todo, y desde la pantalla
  // parece un problema de usuario y contrasena cuando en realidad no hay tablas.
  try {
    await aplicarMigraciones();
  } catch (error) {
    app.log.error({ err: error }, 'No se pudieron aplicar las migraciones');
    process.exit(1);
  }

  // Conectar a WhatsApp con Baileys
  try {
    app.log.info('Conectando a WhatsApp...');
    await conectarWhatsApp('ventas');
  } catch (error) {
    app.log.error({ err: error }, 'Error al conectar a WhatsApp');
  }

  const { existsSync } = await import('node:fs');
  if (existsSync('./datos/auth_info_baileys_cobranza/creds.json')) {
    try { await conectarWhatsApp('cobranza'); }
    catch (error) { app.log.error({ err: error }, 'No se pudo conectar WhatsApp de cobranza'); }
  }

  // Al recibir la senal de apagado se cierran las conexiones antes de salir,
  // para no dejar la base de datos a medias.
  for (const senal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(senal, async () => {
      app.log.info(`Senal ${senal} recibida, cerrando`);
      await Promise.allSettled([desconectarWhatsApp('ventas', false), desconectarWhatsApp('cobranza', false)]);
      await app.close();
      cerrarBaseDatos();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: config.puerto, host: config.host });

    // Notificar a PM2 que el servidor está listo (para zero-downtime deployments)
    if (process.send) {
      process.send('ready');
    }
  } catch (error) {
    app.log.error({ err: error }, 'No se pudo iniciar el servidor');
    process.exit(1);
  }
}

void iniciar();
