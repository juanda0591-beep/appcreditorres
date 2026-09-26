import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import XLSX from 'xlsx';
import { clienteAutenticado, limpiarBaseDatos, type ClientePrueba } from '../pruebas/ayudas.js';

/** Pruebas del catalogo publico y la administracion de productos. */

const RUTA_PRUEBA = './datos/prueba-catalogo.db';
process.env.DB_RUTA = RUTA_PRUEBA;
process.env.DB_URL = `file:${RUTA_PRUEBA}`;
process.env.CARPETA_IMAGENES = './datos/imagenes-prueba';
process.env.URL_PUBLICA = 'https://midominio.com';
limpiarBaseDatos(RUTA_PRUEBA);

let app: FastifyInstance;
let api: ClientePrueba;

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { db } = await import('../db/cliente.js');
  await migrate(db, { migrationsFolder: './migraciones' });

  const { construirApp } = await import('../app.js');
  app = await construirApp();
  await app.ready();

  // Administrar el catalogo exige sesion; verlo NO (se prueba aparte).
  api = await clienteAutenticado(app);

  await api.patch('/api/configuracion', {
      nombreNegocio: 'Distribuciones JD',
      whatsappNumero: '300 123 4567',
      tituloCatalogo: 'Catalogo agosto',
      descripcionCatalogo: 'Productos disponibles',
      notaPie: 'Envios a todo el oriente',
    });
});

afterAll(async () => {
  await app.close();
  const { cerrarBaseDatos } = await import('../db/cliente.js');
  cerrarBaseDatos();
});

describe('configuracion administrable', () => {
  it('normaliza el numero de WhatsApp al guardarlo', async () => {
    const res = await api.get('/api/configuracion');
    expect(res.json().whatsappNumero).toBe('573001234567');
  });

  it('rechaza un numero que no sirve, en vez de dejar un boton roto', async () => {
    const res = await api.patch('/api/configuracion', { whatsappNumero: '123' });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('no parece valido');
  });

  it('permite probar las plantillas sin guardar', async () => {
    const res = await api.post('/api/configuracion/previsualizar-mensaje', { plantillaConsulta: 'Quiero {{producto}} a {{precio}}' });

    // Intl usa espacio duro (U+00A0) entre el signo y el numero, no un
    // espacio normal, asi que la comparacion se hace sin depender de eso.
    const mensaje = res.json().consultaProducto.replace(/ /g, ' ');
    expect(mensaje).toBe('Quiero Camiseta azul a $ 45.000');
  });
});

describe('catalogo publico', () => {
  let visible: string;

  beforeAll(async () => {
    const res = await api.post('/api/productos', { nombre: 'Camiseta azul', precio: 45_000, categoria: 'Ropa', orden: 1 });
    visible = res.json().id;

    await api.post('/api/productos', { nombre: 'Producto oculto', precio: 10_000, visible: false, orden: 2 });

    await api.post('/api/productos', { nombre: 'Producto agotado', precio: 20_000, disponible: false, orden: 3 });
  });

  it('solo muestra los productos visibles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogo' });
    const nombres = res.json().productos.map((p: { nombre: string }) => p.nombre);

    expect(nombres).toContain('Camiseta azul');
    expect(nombres).not.toContain('Producto oculto');
  });

  it('incluye el enlace de WhatsApp por producto', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogo' });
    const camiseta = res.json().productos.find((p: { id: string }) => p.id === visible);

    expect(camiseta.enlaceWhatsapp).toContain('wa.me/573001234567');
    expect(decodeURIComponent(camiseta.enlaceWhatsapp)).toContain('Camiseta azul');
  });

  it('entrega el enlace para compartir el catalogo', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogo/compartir' });

    expect(res.json().link).toBe('https://midominio.com/catalogo');
    expect(res.json().enlaceWhatsapp).toContain('https://wa.me/?text=');
  });
});

describe('importacion de productos desde Excel', () => {
  function archivoExcel(filas: Array<Record<string, string | number>>) {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Productos');
    const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const limite = '----excel-productos-prueba';
    return {
      headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
      payload: Buffer.concat([
        Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="productos.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
        datos,
        Buffer.from(`\r\n--${limite}--\r\n`),
      ]),
    };
  }

  it('crea productos, conserva sus precios y omite nombres existentes', async () => {
    const carga = archivoExcel([
      { NombreProducto: 'Camiseta azul', 'Precio contados': 45_000, PrecioCredito: 60_000 },
      { NombreProducto: 'Mesa auxiliar', Descripcion: 'Para la sala', 'Precio contados': 90_000, PrecioCredito: 130_000, PrecioCrediContado: 110_000, 'Precio Inicial': 20_000, Categoria: 'Hogar' },
    ]);
    const res = await api.crudo({ method: 'POST', url: '/api/productos/importar-excel', ...carga });

    expect(res.statusCode).toBe(200);
    expect(res.json().creados).toBe(1);
    expect(res.json().omitidos).toEqual([{ fila: 2, nombre: 'Camiseta azul', motivo: 'Ya existe' }]);
    const productos = (await api.get('/api/productos')).json();
    const mesa = productos.find((producto: { nombre: string }) => producto.nombre === 'Mesa auxiliar');
    expect(mesa.precios).toMatchObject({ contado: 90_000, credito: 130_000, credicontado: 110_000, inicial: 20_000, pagoSemanal: 0 });
    expect(mesa.imagenes).toEqual([]);
  });

  it('rechaza un precio invalido sin importar ninguna fila', async () => {
    const carga = archivoExcel([
      { NombreProducto: 'Lampara prueba', 'Precio contados': 50_000 },
      { NombreProducto: 'Silla prueba', 'Precio contados': 'precio pendiente' },
    ]);
    const res = await api.crudo({ method: 'POST', url: '/api/productos/importar-excel', ...carga });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('Fila 3');
    const productos = (await api.get('/api/productos')).json();
    expect(productos.some((producto: { nombre: string }) => producto.nombre === 'Lampara prueba')).toBe(false);
  });
});

describe('pagina HTML del catalogo', () => {
  it('trae las etiquetas que WhatsApp lee para la vista previa', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalogo' });
    const html = res.body;

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(html).toContain('<meta property="og:title" content="Catalogo agosto">');
    expect(html).toContain('og:description');
    expect(html).toContain('<meta property="og:url" content="https://midominio.com/catalogo">');
    expect(html).toContain('og:site_name');
  });

  it('renderiza los productos en el HTML, sin depender de JavaScript', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalogo' });

    // El robot de WhatsApp no ejecuta JS: el contenido debe venir ya en el HTML.
    expect(res.body).toContain('Camiseta azul');
    expect(res.body).toContain('45.000');
    expect(res.body).not.toContain('Producto oculto');
  });

  it('marca los agotados y no les pone boton de compra', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalogo' });

    expect(res.body).toContain('Agotado');
    expect(res.body).toContain('class="producto agotado"');
  });

  it('muestra la nota del pie', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalogo' });
    expect(res.body).toContain('Envios a todo el oriente');
  });
});

describe('escape de HTML: proteccion contra inyeccion', () => {
  it('neutraliza el codigo puesto en el nombre de un producto', async () => {
    await api.post('/api/productos', {
        nombre: '<script>alert("hola")</script>',
        descripcion: '<img src=x onerror="alert(1)">',
        precio: 1000,
        orden: 99,
      });

    const res = await app.inject({ method: 'GET', url: '/catalogo' });

    // El texto debe aparecer escapado, nunca como etiqueta ejecutable.
    expect(res.body).not.toContain('<script>alert');
    expect(res.body).not.toContain('<img src=x');
    expect(res.body).toContain('&lt;script&gt;');
  });

  it('escapa las comillas de la configuracion en los atributos meta', async () => {
    await api.patch('/api/configuracion', { descripcionCatalogo: 'Dice "hola" y <b>chao</b>' });

    const res = await app.inject({ method: 'GET', url: '/catalogo' });

    // Una comilla sin escapar cerraria el atributo content y romperia la meta.
    expect(res.body).toContain('&quot;hola&quot;');
    expect(res.body).not.toContain('content="Dice "hola""');
  });
});

describe('interruptor del catalogo', () => {
  it('lo apaga sin borrar nada y lo vuelve a prender', async () => {
    await api.patch('/api/configuracion', { catalogoActivo: false });

    const apagado = await app.inject({ method: 'GET', url: '/catalogo' });
    expect(apagado.statusCode).toBe(404);

    const json = await app.inject({ method: 'GET', url: '/api/catalogo' });
    expect(json.statusCode).toBe(404);

    await api.patch('/api/configuracion', { catalogoActivo: true });

    const prendido = await app.inject({ method: 'GET', url: '/catalogo' });
    expect(prendido.statusCode).toBe(200);
  });

  it('oculta los precios cuando se apagan', async () => {
    await api.patch('/api/configuracion', { mostrarPrecios: false });

    const res = await app.inject({ method: 'GET', url: '/api/catalogo' });
    const items = res.json().productos;

    // El precio no se manda al navegador, no solo se oculta con CSS.
    expect(items.every((p: { precio: number | null }) => p.precio === null)).toBe(true);

    await api.patch('/api/configuracion', { mostrarPrecios: true });
  });
});
