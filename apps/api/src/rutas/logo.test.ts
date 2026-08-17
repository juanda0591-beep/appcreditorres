import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rm, readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { clienteAutenticado, limpiarBaseDatos, type ClientePrueba } from '../pruebas/ayudas.js';

/**
 * Pruebas del logo del negocio.
 *
 * Lo que importa comprobar aqui es que el logo quede en PNG: el generador de
 * PDF solo lee JPEG y PNG, asi que si algun dia alguien "unifica" esto con el
 * pipeline de fotos de productos (que devuelve WebP), el comprobante saldria
 * sin logo y nadie se enteraria hasta que un empleado reclame su papel.
 */

const RUTA_PRUEBA = './datos/prueba-logo.db';
const CARPETA = './datos/imagenes-prueba-logo';
process.env.DB_RUTA = RUTA_PRUEBA;
process.env.DB_URL = `file:${RUTA_PRUEBA}`;
process.env.CARPETA_IMAGENES = CARPETA;
limpiarBaseDatos(RUTA_PRUEBA);

let app: FastifyInstance;
let api: ClientePrueba;

/** Lee las medidas sin dejar el archivo abierto (en Windows bloquea el borrado). */
async function medir(ruta: string) {
  return sharp(await readFile(ruta)).metadata();
}

/** Un logo con fondo transparente, como los que manda un disenador. */
async function logoConTransparencia(lado = 900): Promise<Buffer> {
  return sharp({
    create: {
      width: lado,
      height: lado,
      channels: 4,
      background: { r: 5, g: 150, b: 105, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
}

function multipart(campo: string, archivo: Buffer, nombre: string, tipo: string) {
  const frontera = '----pruebalogo1234567890';
  const cabeza = Buffer.from(
    `--${frontera}\r\n` +
      `Content-Disposition: form-data; name="${campo}"; filename="${nombre}"\r\n` +
      `Content-Type: ${tipo}\r\n\r\n`,
  );
  const cola = Buffer.from(`\r\n--${frontera}--\r\n`);

  return {
    payload: Buffer.concat([cabeza, archivo, cola]),
    headers: { 'content-type': `multipart/form-data; boundary=${frontera}` },
  };
}

async function subirLogo(archivo: Buffer, nombre = 'logo.png', tipo = 'image/png') {
  return api.crudo({
    method: 'POST',
    url: '/api/configuracion/logo',
    ...multipart('logo', archivo, nombre, tipo),
  });
}

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { db } = await import('../db/cliente.js');
  await migrate(db, { migrationsFolder: './migraciones' });

  const { construirApp } = await import('../app.js');
  app = await construirApp();
  await app.ready();

  api = await clienteAutenticado(app);
});

afterAll(async () => {
  await app.close();
  const { cerrarBaseDatos } = await import('../db/cliente.js');
  cerrarBaseDatos();
  await rm(CARPETA, { recursive: true, force: true });
});

describe('logo del negocio', () => {
  it('guarda el logo en PNG, que es lo que el PDF sabe leer', async () => {
    const respuesta = await subirLogo(await logoConTransparencia());

    expect(respuesta.statusCode).toBe(200);
    const { configuracion } = respuesta.json();
    expect(configuracion.logoUrl).toMatch(/^\/imagenes\/logo-[\w-]+\.png$/);

    const archivo = configuracion.logoUrl.split('/').pop();
    const datos = await medir(`${CARPETA}/${archivo}`);

    expect(datos.format).toBe('png');
    // Se conserva el canal alfa: aplanar el fondo contra blanco dejaria un
    // recuadro visible sobre el papel del comprobante.
    expect(datos.hasAlpha).toBe(true);
  });

  it('reduce un logo grande', async () => {
    const respuesta = await subirLogo(await logoConTransparencia(2000));
    const archivo = respuesta.json().configuracion.logoUrl.split('/').pop();

    const datos = await medir(`${CARPETA}/${archivo}`);

    expect(datos.width).toBeLessThanOrEqual(400);
    expect(datos.height).toBeLessThanOrEqual(400);
  });

  it('acepta un JPG y lo convierte a PNG', async () => {
    const jpg = await sharp({
      create: { width: 500, height: 500, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();

    const respuesta = await subirLogo(jpg, 'logo.jpg', 'image/jpeg');
    const archivo = respuesta.json().configuracion.logoUrl.split('/').pop();

    expect(archivo.endsWith('.png')).toBe(true);
    expect((await medir(`${CARPETA}/${archivo}`)).format).toBe('png');
  });

  it('borra el logo anterior al reemplazarlo, para no llenar el disco', async () => {
    const primera = await subirLogo(await logoConTransparencia());
    const viejo = primera.json().configuracion.logoUrl.split('/').pop();

    const segunda = await subirLogo(await logoConTransparencia());
    const nuevo = segunda.json().configuracion.logoUrl.split('/').pop();

    const archivos = await readdir(CARPETA);

    expect(archivos).toContain(nuevo);
    expect(archivos).not.toContain(viejo);
  });

  it('quitar el logo lo saca de la configuracion y borra el archivo', async () => {
    const subida = await subirLogo(await logoConTransparencia());
    const archivo = subida.json().configuracion.logoUrl.split('/').pop();

    const respuesta = await api.delete('/api/configuracion/logo');

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json().configuracion.logoUrl).toBeNull();
    expect(await readdir(CARPETA)).not.toContain(archivo);
  });

  it('rechaza un archivo que dice ser imagen pero no lo es', async () => {
    const respuesta = await subirLogo(Buffer.from('no soy una imagen, soy un script'));

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().mensaje).toMatch(/no parece ser una imagen/i);
  });

  it('rechaza un formato que el PDF no podria incrustar', async () => {
    const respuesta = await subirLogo(await logoConTransparencia(), 'logo.gif', 'image/gif');

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().mensaje).toMatch(/Formato no permitido/i);
  });

  it('exige sesion: el logo lo cambia quien administra, no cualquiera', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/configuracion/logo',
      ...multipart('logo', await logoConTransparencia(), 'logo.png', 'image/png'),
    });

    expect(respuesta.statusCode).toBe(401);
  });
});

describe('el logo llega al comprobante en PDF', () => {
  it('genera el PDF con el logo puesto', async () => {
    await subirLogo(await logoConTransparencia());

    const empleado = await api.post('/api/empleados', {
      nombre: 'Empleada con comprobante',
      tarifaVenta: 6000,
      tarifaLiquidacion: 5000,
      porcentajeCobro: 10,
    });
    const empleadoId = empleado.json().id;

    await api.post('/api/ventas', {
      empleadoId,
      fecha: '2026-08-20',
      cantidad: 4,
    });

    const liquidacion = await api.post('/api/nomina/confirmar', {
      empleadoId,
      periodo: { desde: '2026-08-16', hasta: '2026-08-31' },
    });

    expect(liquidacion.statusCode).toBe(201);
    const id = liquidacion.json().id;

    const pdf = await api.get(`/api/nomina/${id}/comprobante.pdf`);

    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    // El PDF trae un objeto de imagen: sin logo no habria ninguno. Es la unica
    // forma barata de comprobar que la imagen se incrusto de verdad, en vez de
    // confiar en que la funcion no lanzo.
    expect(pdf.rawPayload.includes(Buffer.from('/Image'))).toBe(true);
  });
});
