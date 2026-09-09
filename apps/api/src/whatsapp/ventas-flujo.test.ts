import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { limpiarBaseDatos } from '../pruebas/ayudas.js';
import { ErrorAplicacion } from '../errores.js';
const mocks = vi.hoisted(() => ({ config: vi.fn(), enviar: vi.fn(), imagen: vi.fn(), push: vi.fn() }));
vi.mock('../rutas/admin-ia.js', () => ({ leerConfigIA: mocks.config }));
vi.mock('./baileys-client.js', () => ({ enviarMensajeWhatsApp: mocks.enviar, enviarImagenWhatsApp: mocks.imagen }));
vi.mock('../servicios/notificaciones-push.js', () => ({ enviarNotificacionPedido: mocks.push }));
const ruta = './datos/prueba-ventas-flujo.db';
process.env.DB_RUTA = ruta; process.env.DB_URL = `file:${ruta}`; limpiarBaseDatos(ruta);
const { db, cerrarBaseDatos } = await import('../db/cliente.js');
const { conversacionesWhatsapp, mensajesWhatsapp, pedidosWhatsapp, ajustesVentas } = await import('../db/esquema/whatsapp.js');
const { productos } = await import('../db/esquema/productos.js');
const { procesarMensajeWhatsApp } = await import('./procesar-mensaje.js');
const { detectarIntencionCompra } = await import('./gestor-pedidos.js');
const { rutasAdminVentas } = await import('../rutas/admin-ventas.js');
const { rutasPedidos } = await import('../rutas/pedidos.js');
const { rutasConversaciones } = await import('../rutas/conversaciones.js');
const { rutasWhatsapp } = await import('../rutas/whatsapp.js');
const app = Fastify();
app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ErrorAplicacion ? error.codigoHttp : 500).send({ mensaje: error.message }));
let productoId: string;
const telefono = '573001234567';
let indice = 0;
beforeAll(async () => {
  const { aplicarMigraciones } = await import('../db/migrar.js'); await aplicarMigraciones();
  app.addHook('onRequest', async req => { if (!req.headers['x-anonimo']) req.usuario = { id: 'admin', rol: 'admin', nombre: 'Gestor Prueba' } as any; });
  await app.register(rutasAdminVentas, { prefix: '/api/admin/ventas' });
  await app.register(rutasPedidos, { prefix: '/api' });
  await app.register(rutasConversaciones, { prefix: '/api' });
  await app.register(rutasWhatsapp, { prefix: '/api/whatsapp' });
});
beforeEach(async () => {
  await db.delete(pedidosWhatsapp); await db.delete(mensajesWhatsapp); await db.delete(conversacionesWhatsapp); await db.delete(productos);
  await db.update(ajustesVentas).set({ modo: 'automatico', revision: 0 });
  productoId = randomUUID(); indice = 0;
  await db.insert(productos).values({ id: productoId, nombre: 'Nevera Polar', precioContado: 1000000, precioCredito: 1500000, precioCredicontado: 1200000 });
  mocks.config.mockReset().mockResolvedValue({ apiKey: '' }); mocks.enviar.mockReset().mockResolvedValue({}); mocks.push.mockReset().mockResolvedValue(undefined); mocks.imagen.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await app.close(); cerrarBaseDatos(); });
const decir = (mensaje: string, externoId = `m${++indice}`) => procesarMensajeWhatsApp(`${telefono}@s.whatsapp.net`, mensaje, 'Cliente', telefono, { externoId });
const conversacion = async () => (await db.select().from(conversacionesWhatsapp))[0];
async function hastaResumen() {
  expect(await decir('Quiero comprar Nevera Polar')).toContain('Cuantas unidades');
  await decir('2'); await decir('contado'); await decir('Ana Torres'); await decir('Calle 15 numero 10 barrio Centro');
  return decir('Granada');
}

it('guarda un pedido completo solo despues de la confirmacion y lo muestra en pedidos y conversacion', async () => {
  expect(await hastaResumen()).toMatch(/Total: \$\s*2\.000\.000/);
  expect(await db.select().from(pedidosWhatsapp)).toHaveLength(0);
  const respuesta = await decir('CONFIRMAR');
  const [pedido] = await db.select().from(pedidosWhatsapp);
  expect(respuesta).toContain(pedido.id);
  expect(pedido).toMatchObject({ conversacionId: (await conversacion()).id, nombreCliente: 'Ana Torres', direccion: 'Calle 15 numero 10 barrio Centro', zona: 'Granada', total: 200000000, estado: 'pendiente' });
  const lista = (await app.inject('/api/admin/pedidos')).json();
  expect(lista.pedidos[0].total).toBe(2000000);
  const detalle = (await app.inject(`/api/admin/conversaciones/${pedido.conversacionId}`)).json();
  expect(detalle.pedidos[0].total).toBe(2000000);
  expect(detalle.conversacion.tienePedidos).toBe(true);
  const listado = (await app.inject('/api/admin/conversaciones')).json();
  expect(listado.conversaciones[0].tienePedidos).toBe(true);
  expect(listado.conversaciones[0].pedidos[0].id).toBe(pedido.id);
  expect(listado.conversaciones[0].cantidadMensajes).toBeGreaterThan(0);
  expect(mocks.push).toHaveBeenCalledOnce();
});
it('no atribuye a otra conversacion pedidos ni mensajes ajenos', async () => {
  await hastaResumen(); await decir('CONFIRMAR');
  await db.insert(conversacionesWhatsapp).values({ id: 'sin-pedidos', telefono: '573009999999', creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString() });
  const lista = (await app.inject('/api/admin/conversaciones')).json().conversaciones;
  const sinPedidos = lista.find((c: any) => c.id === 'sin-pedidos');
  expect(sinPedidos).toMatchObject({ cantidadMensajes: 0, tienePedidos: false, pedidos: [] });
});
it('no duplica pedidos por reenviar CONFIRMAR o por mensajes con el mismo id', async () => {
  await hastaResumen(); await decir('CONFIRMAR', 'confirmacion'); await decir('CONFIRMAR', 'confirmacion'); await decir('CONFIRMAR');
  expect(await db.select().from(pedidosWhatsapp)).toHaveLength(1);
  expect(mocks.push).toHaveBeenCalledOnce();
});
it('el borrador queda en base de datos y puede continuar sin historial de productos en memoria', async () => {
  await decir('Quiero comprar Nevera Polar');
  const c = await conversacion();
  expect(JSON.parse(c.borradorPedido!).paso).toBe('cantidad');
  const { avanzarPedidoVentas } = await import('./flujo-pedido-ventas.js');
  const { estadoAtencionVentas } = await import('./atencion-ventas.js');
  const control = await estadoAtencionVentas(c.id);
  expect((await avanzarPedidoVentas(c.id, '3', control.version))?.respuesta).toContain('Como deseas pagarlo');
});
it('cancelar y corregir no crean un pedido', async () => {
  await hastaResumen(); await decir('CAMBIAR');
  expect(JSON.parse((await conversacion()).borradorPedido!).paso).toBe('producto');
  expect(await decir('CANCELAR')).toContain('No se registro');
  expect((await conversacion()).borradorPedido).toBeNull();
  expect(await db.select().from(pedidosWhatsapp)).toHaveLength(0);
});
it.each(['No lo quiero', 'No quiero comprar', 'lo quiero despues', 'Me puedes llevar a Granada?', 'precio', 'quiero solicitar informacion'])('no considera compra la frase %s', mensaje => {
  expect(detectarIntencionCompra(mensaje)).toBe(false);
});
it('si se mostraron varios productos exige elegir en vez de tomar el ultimo', async () => {
  await db.insert(productos).values({ nombre: 'Nevera Compacta', precioContado: 500000, precioCredito: 800000 });
  await decir('Hola');
  const c = await conversacion();
  await db.insert(mensajesWhatsapp).values({ id: randomUUID(), conversacionId: c.id, rol: 'assistant', contenido: 'Dos opciones', metadata: JSON.stringify({ productos: ['Nevera Polar', 'Nevera Compacta'] }), creadoEn: new Date().toISOString() });
  const respuesta = await decir('Lo quiero');
  expect(respuesta).toContain('Cual producto');
  expect(JSON.parse((await conversacion()).borradorPedido!).paso).toBe('producto');
});
it('revalida precio y disponibilidad antes de confirmar', async () => {
  await hastaResumen(); await db.update(productos).set({ precioContado: 1100000 }).where(eq(productos.id, productoId));
  expect(await decir('CONFIRMAR')).toContain('El catalogo cambio');
  expect(await db.select().from(pedidosWhatsapp)).toHaveLength(0);
  await db.update(productos).set({ disponible: false }).where(eq(productos.id, productoId));
  expect(await decir('CONFIRMAR')).toContain('ya no esta disponible');
  expect(await db.select().from(pedidosWhatsapp)).toHaveLength(0);
});
it('si falla la insercion no anuncia exito ni pierde el borrador', async () => {
  await hastaResumen();
  await db.run(sql.raw("CREATE TRIGGER error_pedido BEFORE INSERT ON pedidos_whatsapp BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END"));
  try {
    expect(await decir('CONFIRMAR')).not.toContain('registrado por');
    expect(await db.select().from(pedidosWhatsapp)).toHaveLength(0);
    expect(JSON.parse((await conversacion()).borradorPedido!).paso).toBe('confirmar');
    expect(mocks.push).not.toHaveBeenCalled();
  } finally { await db.run(sql`DROP TRIGGER error_pedido`); }
  expect(await decir('CONFIRMAR')).toContain('registrado por');
});
it('si falla la notificacion el pedido sigue registrado y no afirma haber avisado', async () => {
  mocks.push.mockRejectedValueOnce(new Error('Sin red'));
  await hastaResumen(); const respuesta = await decir('CONFIRMAR');
  expect(respuesta).toContain('registrado por'); expect(respuesta).not.toContain('Ya avise');
  expect(await db.select().from(pedidosWhatsapp)).toHaveLength(1);
});
it('modo manual general guarda mensajes pero no consulta IA ni inicia pedidos', async () => {
  expect((await app.inject({ method: 'PUT', url: '/api/admin/ventas/modo', payload: { modo: 'manual' } })).statusCode).toBe(200);
  expect(await decir('Quiero comprar Nevera Polar')).toBe('');
  expect(mocks.config).not.toHaveBeenCalled();
  expect((await conversacion()).borradorPedido).toBeNull();
  expect(await db.select().from(mensajesWhatsapp)).toHaveLength(1);
});
it('modo manual por conversacion pausa el flujo y la respuesta del gestor usa ventas', async () => {
  await decir('Hola'); const c = await conversacion();
  const pausa = await app.inject({ method: 'PATCH', url: `/api/admin/ventas/conversaciones/${c.id}/modo`, payload: { modo: 'manual' } });
  expect(pausa.statusCode).toBe(200);
  expect(await decir('Quiero comprar Nevera Polar')).toBe('');
  expect((await app.inject({ method: 'POST', url: `/api/admin/ventas/conversaciones/${c.id}/enviar`, payload: { mensaje: 'Soy el asesor' } })).statusCode).toBe(200);
  expect(mocks.enviar).toHaveBeenCalledWith(`${telefono}@s.whatsapp.net`, 'Soy el asesor', 'ventas');
  const mensajes = await db.select().from(mensajesWhatsapp);
  expect(mensajes.some(m => m.metadata?.includes('Gestor Prueba'))).toBe(true);
});
it('solicitar atencion humana detiene el agente', async () => {
  expect(await decir('Necesito un asesor')).toBe('');
  expect((await conversacion()).modoAtencion).toBe('manual');
});
it('pausar durante la generacion descarta la respuesta aunque se vuelva a activar', async () => {
  mocks.config.mockResolvedValue({ apiKey: 'clave-prueba' });
  let resolver!: (value: unknown) => void;
  const fetchMock = vi.fn(() => new Promise(r => { resolver = r; })); vi.stubGlobal('fetch', fetchMock);
  const tarea = decir('Hola'); await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await app.inject({ method: 'PUT', url: '/api/admin/ventas/modo', payload: { modo: 'manual' } });
  await app.inject({ method: 'PUT', url: '/api/admin/ventas/modo', payload: { modo: 'automatico' } });
  resolver({ ok: true, json: async () => ({ choices: [{ message: { content: 'Respuesta tardia' } }] }) });
  expect(await tarea).toBe('');
  expect(mocks.imagen).not.toHaveBeenCalled();
});
it('la IA recibe los mensajes recientes, excluyendo el actual y el historial antiguo', async () => {
  await decir('Hola'); const c = await conversacion();
  await db.delete(mensajesWhatsapp);
  for (let i = 0; i < 15; i++) await db.insert(mensajesWhatsapp).values({ id: `historico-${i}`, conversacionId: c.id, rol: i % 2 ? 'assistant' : 'user', contenido: `Mensaje historico ${i}`, creadoEn: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z` });
  mocks.config.mockResolvedValue({ apiKey: 'clave-prueba' });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'Respuesta' } }] }) });
  vi.stubGlobal('fetch', fetchMock);
  await decir('Consulta actual');
  const messages = JSON.parse(fetchMock.mock.calls[0][1].body).messages;
  expect(messages.some((m: any) => m.content === 'Mensaje historico 14')).toBe(true);
  expect(messages.some((m: any) => m.content === 'Mensaje historico 0')).toBe(false);
  expect(messages.filter((m: any) => m.content === 'Consulta actual')).toHaveLength(1);
});
it('el modo manual tambien se respeta en el webhook de Meta', async () => {
  await app.inject({ method: 'PUT', url: '/api/admin/ventas/modo', payload: { modo: 'manual' } });
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const res = await app.inject({ method: 'POST', url: '/api/whatsapp/webhook', payload: { entry: [{ changes: [{ value: { messages: [{ id: 'meta1', from: telefono, text: { body: 'Quiero comprar Nevera Polar' } }] } }] }] } });
  expect(res.statusCode).toBe(200); expect(fetchMock).not.toHaveBeenCalled();
  expect((await conversacion()).transporte).toBe('cloud');
  expect(await db.select().from(mensajesWhatsapp)).toHaveLength(1);
});
it('el pedido manual usa precios del catalogo y no se duplica al reintentar', async () => {
  await decir('Hola'); const c = await conversacion();
  const payload = { id: randomUUID(), conversacionId: c.id, productoId, cantidad: 2, pago: 'contado', nombre: 'Ana Torres', telefono, direccion: 'Calle 20 numero 10', zona: 'Granada', precio: 1 };
  expect((await app.inject({ method: 'POST', url: '/api/admin/ventas/pedidos', payload })).statusCode).toBe(200);
  await app.inject({ method: 'POST', url: '/api/admin/ventas/pedidos', payload });
  const pedidos = await db.select().from(pedidosWhatsapp); expect(pedidos).toHaveLength(1); expect(pedidos[0].total).toBe(200000000);
  expect((await conversacion()).modoAtencion).toBe('manual');
  expect(mocks.enviar).not.toHaveBeenCalled();
});
it('valida estados y permisos sin inventar pedidos', async () => {
  expect((await app.inject({ method: 'PUT', url: '/api/admin/ventas/modo', payload: { modo: 'otro' } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'PUT', url: '/api/admin/ventas/modo', payload: { modo: 'manual' }, headers: { 'x-anonimo': '1' } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'PATCH', url: '/api/admin/pedidos/inexistente', payload: { estado: 'entregado' } })).statusCode).toBe(404);
});
