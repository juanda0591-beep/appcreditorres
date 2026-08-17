import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { limpiarBaseDatos } from '../pruebas/ayudas.js';

/**
 * Verifica el bloqueo por intentos fallidos.
 *
 * Va en su propio archivo con el limite bajado a 5 porque el limitador cuenta
 * por IP: si compartiera la app con los demas tests, agotaria el cupo y los
 * haria fallar. Cada archivo corre en su propio proceso, asi que aqui el
 * limite bajo no afecta a nadie.
 */

const RUTA_PRUEBA = './datos/prueba-fuerzabruta.db';
process.env.DB_RUTA = RUTA_PRUEBA;
process.env.DB_URL = `file:${RUTA_PRUEBA}`;
process.env.CARPETA_IMAGENES = './datos/imagenes-prueba-fb';
process.env.SECRETO_COOKIES = 'secreto-de-prueba-con-mas-de-32-caracteres-largo';
process.env.MAX_INTENTOS_ENTRAR = '5';
limpiarBaseDatos(RUTA_PRUEBA);

let app: FastifyInstance;

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { db } = await import('../db/cliente.js');
  await migrate(db, { migrationsFolder: './migraciones' });

  const { construirApp } = await import('../app.js');
  app = await construirApp();
  await app.ready();

  await app.inject({
    method: 'POST',
    url: '/api/sesion/instalar',
    payload: { usuario: 'duena', contrasena: 'clave-buena-123', nombre: 'Duena' },
  });
});

afterAll(async () => {
  await app.close();
  const { cerrarBaseDatos } = await import('../db/cliente.js');
  cerrarBaseDatos();
});

describe('proteccion contra prueba de contrasenas en bucle', () => {
  it('bloquea con 429 y explica que hay que esperar', async () => {
    let bloqueado = false;
    let respuestaBloqueo: { mensaje?: string; error?: string } = {};

    // El limite es 5: con 10 intentos se alcanza de sobra.
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sesion/entrar',
        payload: { usuario: 'duena', contrasena: `intento-numero-${i}` },
      });

      if (res.statusCode === 429) {
        bloqueado = true;
        respuestaBloqueo = res.json();
        break;
      }
    }

    expect(bloqueado).toBe(true);
    expect(respuestaBloqueo.error).toBe('DEMASIADOS_INTENTOS');
    // Sin este manejo el limitador respondia 500 y parecia que el servidor
    // se habia roto, en vez de indicar que hay que esperar.
    expect(respuestaBloqueo.mensaje).toContain('Espera');
  });

  it('el bloqueo tambien aplica con la contrasena correcta: no hay puerta de salida', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'duena', contrasena: 'clave-buena-123' },
    });

    // Ya se agoto el cupo en el test anterior.
    expect(res.statusCode).toBe(429);
  });
});
