/**
 * Verificacion de punta a punta: logo -> PDF, y forma de los datos del
 * historial que consume la tabla en pantalla.
 *
 * Corre contra una base desechable, sin tocar la real.
 */
import sharp from 'sharp';
import { rm, writeFile } from 'node:fs/promises';

const RUTA = './datos/verificar-e2e.db';
const CARPETA = './datos/imagenes-verificar-e2e';
process.env.DB_RUTA = RUTA;
process.env.DB_URL = `file:${RUTA}`;
process.env.CARPETA_IMAGENES = CARPETA;
process.env.SECRETO_COOKIES = 'secreto-de-verificacion-con-mas-de-32-caracteres';

await rm(RUTA, { force: true });
await rm(`${RUTA}-wal`, { force: true });
await rm(`${RUTA}-shm`, { force: true });
await rm(CARPETA, { recursive: true, force: true });

const { migrate } = await import('drizzle-orm/libsql/migrator');
const { db, cerrarBaseDatos } = await import('./dist/db/cliente.js');
await migrate(db, { migrationsFolder: './migraciones' });

const { construirApp } = await import('./dist/app.js');
const app = await construirApp();
await app.ready();

const instalacion = await app.inject({
  method: 'POST',
  url: '/api/sesion/instalar',
  payload: { usuario: 'verificador', contrasena: 'contrasena-de-prueba-123', nombre: 'Verificador' },
});
const cookie = `sesion=${instalacion.cookies.find((c) => c.name === 'sesion').value}`;
const pedir = (opciones) => app.inject({ ...opciones, headers: { ...opciones.headers, cookie } });

// --- Logo ---
const logo = await sharp({
  create: { width: 800, height: 800, channels: 4, background: { r: 5, g: 150, b: 105, alpha: 1 } },
})
  .png()
  .toBuffer();

const frontera = '----verificacion';
const cuerpo = Buffer.concat([
  Buffer.from(
    `--${frontera}\r\nContent-Disposition: form-data; name="logo"; filename="logo.png"\r\n` +
      'Content-Type: image/png\r\n\r\n',
  ),
  logo,
  Buffer.from(`\r\n--${frontera}--\r\n`),
]);

const subida = await pedir({
  method: 'POST',
  url: '/api/configuracion/logo',
  payload: cuerpo,
  headers: { 'content-type': `multipart/form-data; boundary=${frontera}` },
});

console.log('LOGO subido:', subida.statusCode, subida.json().configuracion.logoUrl);
console.log('  se ve en la web:', (await app.inject({ method: 'GET', url: subida.json().configuracion.logoUrl })).statusCode);

await pedir({ method: 'PATCH', url: '/api/configuracion', payload: { nombreNegocio: 'Muebles JD' } });

// --- Datos de un pago realista ---
const municipio = await pedir({
  method: 'POST',
  url: '/api/municipios',
  payload: { nombre: 'Granada', metaRecaudo: 7_000_000, porcentajeExcedente: 4, baseBono: 'excedente' },
});

const empleado = await pedir({
  method: 'POST',
  url: '/api/empleados',
  payload: {
    nombre: 'Kevin Esneider Vega Guevara',
    documento: '1036402215',
    tarifaVenta: 6000,
    tarifaLiquidacion: 5000,
    porcentajeCobro: 10,
  },
});
const empleadoId = empleado.json().id;
const municipioId = municipio.json().id;

await pedir({
  method: 'POST',
  url: '/api/ventas',
  payload: { empleadoId, municipioId, fecha: '2026-08-20', cantidad: 5 },
});
await pedir({
  method: 'POST',
  url: '/api/cobros',
  payload: { empleadoId, municipioId, fecha: '2026-08-22', montoRecaudado: 9_000_000 },
});
await pedir({
  method: 'POST',
  url: '/api/gastos',
  payload: { empleadoId, fecha: '2026-08-23', monto: 30_000, concepto: 'Combustible', deducible: true },
});

const liquidacion = await pedir({
  method: 'POST',
  url: '/api/nomina/confirmar',
  payload: { empleadoId, periodo: { desde: '2026-08-16', hasta: '2026-08-31' }, incluirBonos: true },
});
console.log('LIQUIDACION:', liquidacion.statusCode);

// --- Historial: lo que renderiza la tabla ---
const historial = await pedir({ method: 'GET', url: '/api/nomina' });
const item = historial.json()[0];

console.log('\nHISTORIAL (lo que dibuja la tabla)');
console.log('  empleado:', item.empleadoNombre, '| CC', item.empleadoDocumento);
console.log('  numero:', item.numero, '| estado:', item.estado);
console.log('  CONCEPTO                DETALLE                                        CANT    VALOR   SUBTOTAL');
for (const c of item.conceptos) {
  console.log(
    '  ' +
      c.concepto.padEnd(22) +
      String(c.detalle).slice(0, 44).padEnd(46) +
      String(c.cantidad ?? '-').padStart(4) +
      String(c.valorUnitario ?? '-').padStart(9) +
      String(c.subtotal).padStart(11),
  );
}
console.log('  subtotal:', item.totalBruto, '| descuentos:', item.deduccionesTotal, '| TOTAL:', item.netoAPagar);
console.log('  ahorro:', item.ahorroRetenido);

const sumaConceptos = item.conceptos.reduce((t, c) => t + c.subtotal, 0);
console.log('  suma de conceptos == neto:', sumaConceptos === item.netoAPagar, `(${sumaConceptos})`);

// --- PDF con logo ---
const pdf = await pedir({ method: 'GET', url: `/api/nomina/${item.id}/comprobante.pdf` });
console.log('\nPDF:', pdf.statusCode, pdf.headers['content-type'], pdf.rawPayload.length, 'bytes');
console.log('  trae imagen incrustada (el logo):', pdf.rawPayload.includes(Buffer.from('/Image')));
console.log('  nombre del negocio en el PDF:', pdf.rawPayload.includes(Buffer.from('Muebles')) || 'comprimido');
await writeFile('./datos/comprobante-verificacion.pdf', pdf.rawPayload);
console.log('  guardado en apps/api/datos/comprobante-verificacion.pdf');

await app.close();
cerrarBaseDatos();
