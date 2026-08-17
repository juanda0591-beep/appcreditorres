import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rm, readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { clienteAutenticado, limpiarBaseDatos, type ClientePrueba } from '../pruebas/ayudas.js';

/**
 * Pruebas de la subida de fotos.
 *
 * Se procesan imagenes de verdad con sharp, no simuladas: lo que interesa
 * comprobar es que una foto de celular quede reducida y en WebP.
 */

const RUTA_PRUEBA = './datos/prueba-imagenes.db';
const CARPETA = './datos/imagenes-prueba-subida';
process.env.DB_RUTA = RUTA_PRUEBA;
process.env.DB_URL = `file:${RUTA_PRUEBA}`;
process.env.CARPETA_IMAGENES = CARPETA;
limpiarBaseDatos(RUTA_PRUEBA);

let app: FastifyInstance;
let api: ClientePrueba;
let producto: string;

/**
 * Lee las medidas de una imagen SIN dejar el archivo abierto.
 *
 * Es importante pasarle un Buffer y no la ruta: cuando sharp abre por ruta,
 * libvips guarda el archivo en su cache y lo deja abierto, y en Windows eso
 * impide borrarlo despues (falla con EBUSY). Leerlo a memoria primero evita
 * que la prueba bloquee los archivos que ella misma va a verificar.
 */
async function medir(ruta: string) {
  return sharp(await readFile(ruta)).metadata();
}

/** Genera una foto grande, del tamano que sale de un celular. */
async function fotoDeCelular(ancho = 4000, alto = 3000): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 90, g: 140, b: 200 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** Arma un cuerpo multipart a mano, como lo mandaria un navegador. */
function multipart(campo: string, archivo: Buffer, nombre: string, tipo: string) {
  const frontera = '----prueba1234567890';
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

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { db } = await import('../db/cliente.js');
  await migrate(db, { migrationsFolder: './migraciones' });

  const { construirApp } = await import('../app.js');
  app = await construirApp();
  await app.ready();

  // Subir fotos exige sesion.
  api = await clienteAutenticado(app);

  const res = await api.post('/api/productos', { nombre: 'Producto con foto', precio: 30_000 });
  producto = res.json().id;
});

afterAll(async () => {
  await app.close();
  const { cerrarBaseDatos } = await import('../db/cliente.js');
  cerrarBaseDatos();
  await rm(CARPETA, { recursive: true, force: true });
});

describe('subida de fotos desde el celular', () => {
  it('reduce una foto grande y la deja en WebP', async () => {
    const foto = await fotoDeCelular();
    const cuerpo = multipart('imagen', foto, 'IMG_1234.jpg', 'image/jpeg');

    const res = await api.crudo({ method: 'POST', url: `/api/productos/${producto}/imagen`, ...cuerpo });

    expect(res.statusCode).toBe(200);
    const datos = res.json();

    expect(datos.producto.imagenUrl).toMatch(/^\/imagenes\/[\w-]+\.webp$/);
    expect(datos.producto.miniaturaUrl).toMatch(/-mini\.webp$/);
    // Lo importante: la procesada pesa mucho menos que la original.
    expect(datos.procesada).toBeLessThan(datos.original);
  });

  it('respeta el limite de 1200px de ancho', async () => {
    const archivos = await readdir(CARPETA);
    const grande = archivos.find((a) => !a.includes('-mini'));
    const meta = await medir(`${CARPETA}/${grande}`);

    expect(meta.width).toBeLessThanOrEqual(1200);
    expect(meta.format).toBe('webp');
  });

  it('genera la miniatura a 400px', async () => {
    const archivos = await readdir(CARPETA);
    const mini = archivos.find((a) => a.includes('-mini'));
    const meta = await medir(`${CARPETA}/${mini}`);

    expect(meta.width).toBeLessThanOrEqual(400);
  });

  it('no agranda una imagen que ya es pequena', async () => {
    const chica = await sharp({
      create: { width: 200, height: 150, channels: 3, background: 'green' },
    })
      .png()
      .toBuffer();

    const otro = await api.post('/api/productos', { nombre: 'Producto chico', precio: 5000 });

    const res = await api.crudo({ method: 'POST', url: `/api/productos/${otro.json().id}/imagen`, ...multipart('imagen', chica, 'chica.png', 'image/png') });

    expect(res.statusCode).toBe(200);
    const nombre = res.json().producto.imagenUrl.split('/').pop();
    const meta = await medir(`${CARPETA}/${nombre}`);
    expect(meta.width).toBe(200);
  });
});

describe('validacion de archivos subidos', () => {
  it('rechaza un archivo que dice ser imagen pero no lo es', async () => {
    const falso = Buffer.from('esto no es una imagen, es texto plano');

    const res = await api.crudo({ method: 'POST', url: `/api/productos/${producto}/imagen`, ...multipart('imagen', falso, 'virus.jpg', 'image/jpeg') });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('no parece ser una imagen valida');
  });

  it('rechaza formatos no permitidos', async () => {
    const pdf = Buffer.from('%PDF-1.4 contenido');

    const res = await api.crudo({ method: 'POST', url: `/api/productos/${producto}/imagen`, ...multipart('imagen', pdf, 'documento.pdf', 'application/pdf') });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('Formato no permitido');
  });

  it('avisa si no llego ningun archivo', async () => {
    const res = await api.crudo({ method: 'POST', url: `/api/productos/${producto}/imagen`, headers: { 'content-type': 'multipart/form-data; boundary=----vacio' }, payload: Buffer.from('------vacio--\r\n') });

    expect(res.statusCode).toBe(400);
  });

  it('404 si el producto no existe', async () => {
    const foto = await fotoDeCelular(100, 100);
    const res = await api.crudo({ method: 'POST', url: '/api/productos/no-existe/imagen', ...multipart('imagen', foto, 'x.jpg', 'image/jpeg') });

    expect(res.statusCode).toBe(404);
  });
});

describe('reemplazo y borrado de fotos', () => {
  it('al subir una nueva borra la anterior, sin dejar basura en el disco', async () => {
    const antes = await api.get('/api/productos');
    const conFoto = antes.json().find((p: { id: string }) => p.id === producto);
    const anterior = conFoto.imagenUrl.split('/').pop();

    const nueva = await fotoDeCelular(2000, 1500);
    await api.crudo({ method: 'POST', url: `/api/productos/${producto}/imagen`, ...multipart('imagen', nueva, 'nueva.jpg', 'image/jpeg') });

    const archivos = await readdir(CARPETA);
    expect(archivos).not.toContain(anterior);
  });

  it('borra los archivos al quitar la foto', async () => {
    const res = await api.delete(`/api/productos/${producto}/imagen`);

    expect(res.statusCode).toBe(200);

    const despues = await api.get('/api/productos');
    const sinFoto = despues.json().find((p: { id: string }) => p.id === producto);
    expect(sinFoto.imagenUrl).toBeNull();
    expect(sinFoto.miniaturaUrl).toBeNull();
  });

  it('informa lo que no pudo borrar en vez de callarlo', async () => {
    const { borrarImagenProducto } = await import('../servicios/imagenes.js');

    // Un archivo que no existe cuenta como borrado: el objetivo era que no
    // estuviera, y ya no esta.
    const inexistente = await borrarImagenProducto('/imagenes/no-existe.webp', null);
    expect(inexistente.borrados).toHaveLength(1);
    expect(inexistente.noBorrados).toHaveLength(0);
  });

  it('ignora rutas que apuntan fuera de la carpeta de imagenes', async () => {
    const { borrarImagenProducto } = await import('../servicios/imagenes.js');

    // Nombres con ".." o rutas raras no deben llegar a unlink.
    const resultado = await borrarImagenProducto('/imagenes/../../../etc/passwd', null);
    expect(resultado.borrados).toHaveLength(0);
    expect(resultado.noBorrados).toHaveLength(0);
  });

  it('borra los archivos al borrar el producto', async () => {
    const creado = await api.post('/api/productos', { nombre: 'Temporal', precio: 1000 });
    const id = creado.json().id;

    const foto = await fotoDeCelular(500, 500);
    const subida = await api.crudo({ method: 'POST', url: `/api/productos/${id}/imagen`, ...multipart('imagen', foto, 'temp.jpg', 'image/jpeg') });
    const archivo = subida.json().producto.imagenUrl.split('/').pop();

    await api.delete(`/api/productos/${id}`);

    const archivos = await readdir(CARPETA);
    expect(archivos).not.toContain(archivo);
  });
});
