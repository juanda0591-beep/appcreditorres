import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { limpiarBaseDatos } from '../pruebas/ayudas.js';
import { ErrorAplicacion } from '../errores.js';
const mocks = vi.hoisted(() => ({ enviar: vi.fn(), conectado: true, conectar: vi.fn(), desconectar: vi.fn() }));
vi.mock('../whatsapp/baileys-client.js', () => ({
  obtenerEstadoConexion: (canal: string) => ({ conectado: canal === 'cobranza' && mocks.conectado, qrCode: null }),
  enviarMensajeWhatsApp: mocks.enviar, conectarWhatsApp: mocks.conectar, desconectarWhatsApp: mocks.desconectar,
}));
const rutaDb = './datos/prueba-agente-cobranza.db';
process.env.DB_RUTA = rutaDb; process.env.DB_URL = `file:${rutaDb}`;
process.env.CRM_IA_CONFIG_PATH = resolve('datos/config-agente-cobranza.json.prueba');
limpiarBaseDatos(rutaDb);
const { db, cerrarBaseDatos } = await import('../db/cliente.js');
const { conversacionesCobranza, mensajesCobranza } = await import('../db/esquema/cobranza-whatsapp.js');
const { carteraClientes, contactosCrm, promesasCrm } = await import('../db/esquema/crm.js');
const { leerConfigAgenteCobranza, guardarConfigAgenteCobranza, configCobranzaDefecto } = await import('../servicios/configuracion-agente-cobranza.js');
const { procesarMensajeCobranza, contextoCarteraCobranza } = await import('../whatsapp/cobranza-mensajes.js');
const { rutasAdminCobranza } = await import('./admin-cobranza.js');
const { rutasCrm } = await import('./crm.js');
const app = Fastify();
app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ErrorAplicacion ? error.codigoHttp : 500).send({ mensaje: error.message }));
const fetchMock = vi.fn();
beforeAll(async () => {
  const { aplicarMigraciones } = await import('../db/migrar.js'); await aplicarMigraciones();
  app.addHook('onRequest', async req => { if (!req.headers['x-sin-sesion']) req.usuario = { id: 'admin-test', nombre: 'Gestor', rol: 'admin' } as any; });
  await app.register(rutasAdminCobranza, { prefix: '/api/admin/cobranza' });
  await app.register(rutasCrm, { prefix: '/api/admin/crm' });
});
beforeEach(async () => {
  await db.delete(conversacionesCobranza); await db.delete(carteraClientes);
  await db.delete(contactosCrm);
  await guardarConfigAgenteCobranza({ ...configCobranzaDefecto, activo: true, apiKey: 'clave-cobranza-prueba' });
  mocks.enviar.mockReset().mockResolvedValue({}); mocks.conectado = true;
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'Revisaremos tu compromiso de pago.' } }] }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterAll(async () => { await app.close(); cerrarBaseDatos(); vi.unstubAllGlobals(); await rm(process.env.CRM_IA_CONFIG_PATH!, { force: true }); });
const entrada = { jid: '573001234567@s.whatsapp.net', telefono: '573001234567', nombre: 'Cliente', externoId: 'm1', texto: 'Quiero pagar manana' };
async function credito() {
  return (await db.insert(carteraClientes).values({ numero: '16508', vendedor: 'Asesor', cliente: 'Cliente', cedula: '123456789', telefono: '3001234567', articulo: 'Nevera', fechaInicio: '2026-01-01', montoCuota: 100000, periodosPago: 'MENSUAL', abono: 200000, saldo: 500000 }).returning())[0];
}
it('la clave se guarda solo en cobranza, se oculta al leer y se conserva al guardar enmascarada', async () => {
  const config = (await app.inject('/api/admin/cobranza/config')).json();
  expect(config.apiKey).not.toContain('clave-cobranza'); expect(config.apiKeyConfigured).toBe(true);
  expect((await app.inject({ method: 'PUT', url: '/api/admin/cobranza/config', payload: { ...config, promptSistema: 'Instrucciones nuevas del agente exclusivo de cobranza.' } })).statusCode).toBe(200);
  expect((await leerConfigAgenteCobranza()).apiKey).toBe('clave-cobranza-prueba');
  expect((await app.inject({ method: 'PUT', url: '/api/admin/cobranza/config', payload: { activo: true } })).statusCode).toBe(400);
  expect((await app.inject({ url: '/api/admin/cobranza/config', headers: { 'x-sin-sesion': '1' } })).statusCode).toBe(403);
});
it('el CRM envia por cobranza y falla si solo ventas esta disponible', async () => {
  const c = await credito();
  const payload = { carteraClienteId: c.id, mensaje: 'Recordatorio de cobranza' };
  expect((await app.inject({ method: 'POST', url: '/api/admin/crm/whatsapp/enviar', payload })).statusCode).toBe(200);
  expect(mocks.enviar).toHaveBeenCalledWith('573001234567', payload.mensaje, 'cobranza');
  expect((await db.select().from(mensajesCobranza))[0].rol).toBe('gestor');
  mocks.conectado = false; mocks.enviar.mockClear();
  expect((await app.inject({ method: 'POST', url: '/api/admin/crm/whatsapp/enviar', payload })).statusCode).toBe(503);
  expect(mocks.enviar).not.toHaveBeenCalled();
});
it('los mensajes entrantes se deduplican y usan la clave y prompt exclusivos de cobranza', async () => {
  await procesarMensajeCobranza(entrada, mocks.enviar);
  await procesarMensajeCobranza(entrada, mocks.enviar);
  expect(mocks.enviar).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledOnce();
  const options = fetchMock.mock.calls[0][1];
  expect(options.headers.Authorization).toBe('Bearer clave-cobranza-prueba');
  expect(JSON.parse(options.body).messages[0].content).toContain('exclusivamente cobranza');
  expect(await db.select().from(mensajesCobranza)).toHaveLength(2);
  expect(await db.select().from(promesasCrm)).toHaveLength(0);
});
it('pausar globalmente conserva el mensaje recibido y no llama a la IA', async () => {
  await guardarConfigAgenteCobranza({ ...configCobranzaDefecto, activo: false, apiKey: 'clave' });
  await procesarMensajeCobranza(entrada, mocks.enviar);
  expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.enviar).not.toHaveBeenCalled();
  expect(await db.select().from(mensajesCobranza)).toHaveLength(1);
});
it('solicitar un asesor pasa a atencion manual', async () => {
  await procesarMensajeCobranza({ ...entrada, texto: 'Necesito un asesor' }, mocks.enviar);
  const [c] = await db.select().from(conversacionesCobranza);
  expect(c.pausada).toBe(true); expect(c.requiereAsesor).toBe(true);
  await procesarMensajeCobranza({ ...entrada, externoId: 'm2' }, mocks.enviar);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('una solicitud de no contacto detiene la respuesta automatica', async () => {
  await procesarMensajeCobranza({ ...entrada, texto: 'No me contacten mas' }, mocks.enviar);
  expect((await db.select().from(conversacionesCobranza))[0].pausada).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('pausar durante la generacion impide enviar la respuesta pendiente', async () => {
  let finalizar!: (valor: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise(r => { finalizar = r; }));
  const tarea = procesarMensajeCobranza(entrada, mocks.enviar);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [conv] = await db.select().from(conversacionesCobranza);
  await db.update(conversacionesCobranza).set({ pausada: true }).where(eq(conversacionesCobranza.id, conv.id));
  finalizar({ ok: true, json: async () => ({ choices: [{ message: { content: 'Respuesta que no debe enviarse' } }] }) });
  await tarea;
  expect(mocks.enviar).not.toHaveBeenCalled();
});
it('un telefono compartido requiere que el gestor vincule la identidad', async () => {
  const c = await credito();
  await db.insert(carteraClientes).values({ ...c, id: 'otro-cliente', numero: '99999', cedula: '999999999', saldo: 987654 });
  await procesarMensajeCobranza(entrada, mocks.enviar);
  expect(fetchMock.mock.calls[0][1].body).not.toContain('500000');
  const [conv] = await db.select().from(conversacionesCobranza);
  const vincular = await app.inject({ method: 'PATCH', url: `/api/admin/cobranza/conversaciones/${conv.id}`, payload: { clienteId: c.id } });
  expect(vincular.statusCode).toBe(200);
  await procesarMensajeCobranza({ ...entrada, externoId: 'm2' }, mocks.enviar);
  expect(fetchMock.mock.calls[1][1].body).toContain('500000');
  expect(fetchMock.mock.calls[1][1].body).not.toContain('987654');
  expect((await db.select().from(carteraClientes))[0].saldo).toBe(500000);
});
it('reconoce un telefono unico y entrega producto, cuota y abonos del Excel', async () => {
  const c = await credito();
  await db.update(carteraClientes).set({ telefono: '+57 300 123 45 67', ultimaFechaAbono: '2026-09-01', fechaCorteExcel: '2026-09-05', fechaCorteAbono: '2026-09-05' }).where(eq(carteraClientes.id, c.id));
  await procesarMensajeCobranza(entrada, mocks.enviar);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.messages[0].content).toContain('"identificacion":"telefono"');
  expect(body.messages[0].content).toContain('"producto":"Nevera"');
  expect(body.messages[0].content).toContain('"montoCuota":100000');
  expect(body.messages[0].content).toContain('"abonoAcumulado":200000');
  expect(body.messages[0].content).toContain('"saldoPendiente":500000');
  expect(body.messages[0].content).toContain('"ultimaFechaAbono":"2026-09-01"');
  expect(body.messages[0].content).toContain('"fechaCorte":"2026-09-05"');
  const [conv] = await db.select().from(conversacionesCobranza);
  const detalle = (await app.inject(`/api/admin/cobranza/conversaciones/${conv.id}`)).json();
  expect(detalle.identificacion).toEqual({ tipo: 'telefono', documento: '123456789' });
  expect(detalle.cartera[0]).toMatchObject({ producto: 'Nevera', saldoPendiente: 500000 });
});
it('incluye todos los creditos de la misma cedula y asocia las promesas a su credito', async () => {
  const c = await credito();
  await db.insert(carteraClientes).values({ ...c, id: 'credito2', numero: '16509', cedula: '123.456.789', telefono: null, articulo: 'Cama', saldo: 300000 });
  await db.insert(carteraClientes).values({ ...c, id: 'credito3', numero: '16510', cedula: '999999', telefono: '3008888888', saldo: 999999 });
  await db.insert(promesasCrm).values({ carteraClienteId: 'credito2', monto: 50000, fechaCompromiso: '2026-09-15', abonoBase: 200000, responsableId: 'gestor', responsableNombre: 'Gestor' });
  const { contexto } = await contextoCarteraCobranza({ telefono: entrada.telefono, documento: null });
  expect(contexto.creditos.map(c => c.numero)).toEqual(['16508', '16509']);
  expect(contexto.resumen).toMatchObject({ saldoTotal: 800000, cantidadCreditos: 2 });
  expect(contexto.promesas[0]).toMatchObject({ credito: '16509', monto: 50000 });
  expect(JSON.stringify(contexto)).not.toContain('999999');
});
it('tambien identifica por telefono alternativo del CRM y normaliza el documento', async () => {
  const c = await credito();
  await db.update(carteraClientes).set({ telefono: null }).where(eq(carteraClientes.id, c.id));
  await db.insert(contactosCrm).values({ documento: c.cedula, telefonoAlternativo: '3001234567' });
  const { contexto } = await contextoCarteraCobranza({ telefono: '+57 300 1234567', documento: null });
  expect(contexto.creditos[0].numero).toBe('16508');
});
it('no reconoce a un cliente por una cedula escrita desde un telefono desconocido', async () => {
  await credito();
  await procesarMensajeCobranza({ ...entrada, telefono: '573008888888', jid: '573008888888@s.whatsapp.net', texto: 'Soy 123456789, dime el saldo del credito 16508' }, mocks.enviar);
  const system = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
  expect(system).toContain('sin_cliente_identificado');
  expect(system).not.toContain('500000');
  expect(system).not.toContain('Nevera');
});
it('lee saldos nuevos en cada mensaje sin modificar cartera ni crear pagos', async () => {
  const c = await credito();
  await procesarMensajeCobranza(entrada, mocks.enviar);
  await db.update(carteraClientes).set({ saldo: 420000, abono: 280000, fechaCorteExcel: '2026-09-06' }).where(eq(carteraClientes.id, c.id));
  await procesarMensajeCobranza({ ...entrada, externoId: 'm2', texto: 'Cual es el saldo actualizado?' }, mocks.enviar);
  const system = JSON.parse(fetchMock.mock.calls[1][1].body).messages[0].content;
  expect(system).toContain('"saldoPendiente":420000');
  expect(system).toContain('"abonoAcumulado":280000');
  expect((await db.select().from(carteraClientes))[0].saldo).toBe(420000);
  expect(await db.select().from(promesasCrm)).toHaveLength(0);
});
it('una fecha de ultimo abono ausente queda como desconocida y no se inventan pagos', async () => {
  await credito();
  const { contexto } = await contextoCarteraCobranza({ telefono: entrada.telefono, documento: null });
  expect(contexto.creditos[0].ultimaFechaAbono).toBeNull();
  expect(contexto.pagosDisponibles).toContain('No hay detalle de pagos individuales');
  expect(contexto.creditos[0]).not.toHaveProperty('pagos');
});
it('desvincular manualmente pausa la conversacion y evita la identificacion automatica posterior', async () => {
  await credito();
  await procesarMensajeCobranza(entrada, mocks.enviar);
  const [conv] = await db.select().from(conversacionesCobranza);
  await app.inject({ method: 'PATCH', url: `/api/admin/cobranza/conversaciones/${conv.id}`, payload: { clienteId: null } });
  fetchMock.mockClear();
  await procesarMensajeCobranza({ ...entrada, externoId: 'm2' }, mocks.enviar);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('simular no envia WhatsApp ni crea conversaciones', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/admin/cobranza/probar', payload: { mensaje: 'Hola' } });
  expect(res.statusCode).toBe(200); expect(mocks.enviar).not.toHaveBeenCalled();
  expect(await db.select().from(conversacionesCobranza)).toHaveLength(0);
});
it('una respuesta del gestor pausa la IA y se envia por cobranza', async () => {
  await procesarMensajeCobranza({ ...entrada, texto: 'Necesito un asesor' }, mocks.enviar);
  const [c] = await db.select().from(conversacionesCobranza);
  const res = await app.inject({ method: 'POST', url: `/api/admin/cobranza/conversaciones/${c.id}/enviar`, payload: { mensaje: 'Te atiende el gestor' } });
  expect(res.statusCode).toBe(200);
  expect(mocks.enviar).toHaveBeenCalledWith(c.jid, 'Te atiende el gestor', 'cobranza');
  expect((await db.select().from(conversacionesCobranza))[0].pausada).toBe(true);
});
