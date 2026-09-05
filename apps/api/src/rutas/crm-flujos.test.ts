import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { utils, write } from 'xlsx';
import { limpiarBaseDatos } from '../pruebas/ayudas.js';
import { ErrorAplicacion } from '../errores.js';

const rutaPrueba = './datos/prueba-crm-flujos.db';
process.env.DB_URL = `file:${rutaPrueba}`;
process.env.DB_RUTA = rutaPrueba;
limpiarBaseDatos(rutaPrueba);

const { db, cerrarBaseDatos } = await import('../db/cliente.js');
const { carteraClientes, carteraCambios, gestionesCobro, contactosCrm, cambiosContactoCrm, promesasCrm, importacionesCrm } = await import('../db/esquema/crm.js');
const { gruposGestion, clientesGrupo, clienteEtiquetas } = await import('../db/esquema/crm-etiquetas.js');
const { usuarios } = await import('../db/esquema/usuarios.js');
const { rutasCrm } = await import('./crm.js');
const app = Fastify();
app.setErrorHandler((error, _request, reply) => error instanceof ErrorAplicacion
  ? reply.code(error.codigoHttp).send({ error: error.codigo, mensaje: error.message }) : reply.code(500).send({ error: 'ERROR_INTERNO' }));
const usuarioId = randomUUID();
const filaCompleta = {
  Numero: '16508', Cliente: 'Cliente Prueba', Cedula: '123456789', Vendedor: 'Asesor',
  Articulo: 'Nevera', Saldo: 500000, Abono: 200000, 'Monto Cuota': 100000,
  'Fecha Inicio': '01/01/2026', 'Ultima Fecha Abono': '01/08/2026',
  'Dias Mora': 45, Estado: 'mora', Telefono: '3001234567', Municipio: 'Granada',
};

beforeAll(async () => {
  const { aplicarMigraciones } = await import('../db/migrar.js');
  await aplicarMigraciones();
  // Esta migracion historica se aplica manualmente en las instalaciones existentes.
  await db.$client.executeMultiple(readFileSync('./migraciones/0007_etiquetas_grupos.sql', 'utf8'));
  await db.run(sql`PRAGMA foreign_keys = ON`);
  await db.insert(usuarios).values({ id: usuarioId, usuario: 'crm-prueba', nombre: 'Gestor Prueba', contrasenaHash: 'hash-prueba', rol: 'admin' });
  await app.register(multipart);
  app.addHook('onRequest', async request => {
    if (request.headers['x-sin-sesion']) return;
    request.usuario = { id: usuarioId, nombre: 'Gestor Prueba', rol: 'admin' } as typeof request.usuario;
  });
  await app.register(rutasCrm);
  await app.ready();
});

beforeEach(async () => {
  await db.delete(promesasCrm);
  await db.delete(contactosCrm);
  await db.delete(cambiosContactoCrm);
  await db.delete(importacionesCrm);
  await db.delete(gestionesCobro);
  await db.delete(carteraCambios);
  await db.delete(clientesGrupo);
  await db.delete(clienteEtiquetas);
  await db.delete(gruposGestion);
  await db.delete(carteraClientes);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-06T02:00:00.000Z')); // 5 de septiembre, 9 p. m. en Colombia.
});

afterEach(() => vi.useRealTimers());
afterAll(async () => { await app.close(); cerrarBaseDatos(); });

async function subir(filas: Record<string, unknown>[], query = '') {
  const libro = utils.book_new();
  utils.book_append_sheet(libro, utils.json_to_sheet(filas), 'Cartera');
  const archivo = write(libro, { type: 'buffer', bookType: 'xlsx' });
  const limite = 'crm-test-boundary';
  return app.inject({
    method: 'POST', url: `/cartera/upload${query}`,
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
    payload: Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="file"; filename="cartera.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      archivo, Buffer.from(`\r\n--${limite}--\r\n`),
    ]),
  });
}

async function crearCliente() {
  const res = await subir([filaCompleta]);
  expect(res.json().procesamiento).toMatchObject({ nuevos: 1, errores: 0 });
  return (await db.select().from(carteraClientes))[0];
}

async function crearGestion(clienteId: string, fechaProximaAccion: string | null) {
  return (await db.insert(gestionesCobro).values({
    carteraClienteId: clienteId, tipoGestion: 'llamada', canal: 'telefono', resultado: 'promesa_pago',
    notas: 'Prometio pagar', proximaAccion: 'Verificar abono', fechaProximaAccion,
    usuarioId, nombreUsuario: 'Gestor Prueba',
  }).returning())[0];
}

describe('importacion de cartera', () => {
  it('vincula el alta al identificador interno y permite repetir el Excel sin cambios', async () => {
    const cliente = await crearCliente();
    expect((await db.select().from(carteraCambios))[0].carteraClienteId).toBe(cliente.id);
    expect((await subir([filaCompleta])).json().procesamiento).toMatchObject({ nuevos: 0, sinCambios: 1, errores: 0 });
  });

  it('conserva columnas ausentes, celdas vacias y seguimiento al actualizar solo el saldo', async () => {
    const cliente = await crearCliente();
    const gestion = await crearGestion(cliente.id, '2026-09-01');
    await db.update(carteraClientes).set({ metadata: '{"ubicacion":"verificada"}' });
    const res = await subir([{ Numero: filaCompleta.Numero, Saldo: 400000, Abono: '', Telefono: ' ', 'Fecha Inicio': '' }]);
    expect(res.json().procesamiento).toMatchObject({ actualizados: 1, errores: 0 });
    expect((await db.select().from(carteraClientes))[0]).toMatchObject({
      saldo: 400000, abono: 200000, telefono: cliente.telefono, fechaInicio: cliente.fechaInicio,
      ultimaFechaAbono: cliente.ultimaFechaAbono, diasMora: 45, estado: 'mora',
      metadata: '{"ubicacion":"verificada"}',
    });
    expect(await db.select().from(gestionesCobro)).toEqual([gestion]);
  });

  it('aplica ceros explicitos sin crear pagos locales', async () => {
    await crearCliente();
    expect((await subir([{ Numero: filaCompleta.Numero, Saldo: 0, Abono: 700000, 'Dias Mora': 0, Estado: 'cancelado' }])).json().procesamiento.errores).toBe(0);
    expect((await db.select().from(carteraClientes))[0]).toMatchObject({ saldo: 0, abono: 700000, diasMora: 0, estado: 'cancelado' });
    expect(await db.all(sql`SELECT * FROM pagos_cartera`)).toEqual([]);
  });

  it.each([{ Saldo: 'invalido' }, { 'Ultima Fecha Abono': '31/02/2026' }, { 'Dias Mora': 1.5 }])('rechaza valores invalidos sin modificar la fila: %j', async cambio => {
    const cliente = await crearCliente();
    const res = await subir([{ Numero: filaCompleta.Numero, Saldo: 300000, ...cambio }]);
    expect(res.json().procesamiento).toMatchObject({ actualizados: 0, errores: 1 });
    expect((await db.select().from(carteraClientes))[0]).toEqual(cliente);
  });

  it('rechaza altas incompletas sin inventar saldo o fecha', async () => {
    const { Saldo, ...incompleta } = filaCompleta;
    expect((await subir([incompleta])).json().procesamiento).toMatchObject({ nuevos: 0, errores: 1 });
    expect(await db.select().from(carteraClientes)).toEqual([]);
  });

  it('revierte la insercion si falla la auditoria', async () => {
    await db.run(sql.raw("CREATE TRIGGER fallo_auditoria BEFORE INSERT ON cartera_cambios BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END"));
    try {
      expect((await subir([filaCompleta])).json().procesamiento).toMatchObject({ nuevos: 0, errores: 1 });
      expect(await db.select().from(carteraClientes)).toEqual([]);
    } finally { await db.run(sql`DROP TRIGGER fallo_auditoria`); }
  });
});

describe('seguimientos pendientes', () => {
  it('incluye vencidos y hoy en Colombia, excluyendo futuros y sin fecha', async () => {
    const cliente = await crearCliente();
    const vencida = await crearGestion(cliente.id, '2026-09-01');
    const hoy = await crearGestion(cliente.id, '2026-09-05');
    await crearGestion(cliente.id, '2026-09-06');
    await crearGestion(cliente.id, null);
    const res = await app.inject('/gestiones/pendientes');
    expect(res.json().gestiones.map((g: any) => g.gestion.id)).toEqual([vencida.id, hoy.id]);
  });

  it('cierra y reabre un seguimiento conservando su fecha, notas y auditoria', async () => {
    const cliente = await crearCliente();
    const gestion = await crearGestion(cliente.id, '2026-09-01');
    const url = `/gestiones/${gestion.id}/seguimiento`;
    const res = await app.inject({ method: 'PATCH', url, payload: { cerrado: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().gestion).toMatchObject({ fechaProximaAccion: '2026-09-01', notas: gestion.notas, seguimientoCerradoPor: usuarioId });
    expect((await app.inject('/gestiones/pendientes')).json().gestiones).toEqual([]);
    vi.setSystemTime(new Date('2026-09-07T02:00:00Z'));
    const repetido = await app.inject({ method: 'PATCH', url, payload: { cerrado: true } });
    expect(repetido.json().gestion.seguimientoCerradoEn).toBe(res.json().gestion.seguimientoCerradoEn);
    await app.inject({ method: 'PATCH', url, payload: { cerrado: false } });
    expect((await app.inject('/gestiones/pendientes')).json().gestiones).toHaveLength(1);
  });

  it('no cierra seguimientos por registrar otro contacto', async () => {
    const cliente = await crearCliente();
    await crearGestion(cliente.id, '2026-09-01');
    await crearGestion(cliente.id, null);
    expect((await app.inject('/gestiones/pendientes')).json().gestiones).toHaveLength(1);
  });

  it('las gestiones de hoy usan el dia colombiano', async () => {
    const cliente = await crearCliente();
    const gestion = await crearGestion(cliente.id, null);
    expect((await app.inject('/gestiones/recientes')).json().gestiones.map((g: any) => g.gestion.id)).toEqual([gestion.id]);
  });

  it('rechaza el cierre sin sesion o con identificador invalido', async () => {
    expect((await app.inject({ method: 'PATCH', url: `/gestiones/${randomUUID()}/seguimiento`, headers: { 'x-sin-sesion': '1' }, payload: { cerrado: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/gestiones/invalido/seguimiento', payload: { cerrado: true } })).statusCode).toBe(400);
  });
});

async function crearGrupo(clienteId: string) {
  const [grupo] = await db.insert(gruposGestion).values({ nombre: 'Localizacion', color: '#008800', creadoPorId: usuarioId, creadoPorNombre: 'Gestor Prueba', totalClientes: 1 }).returning();
  const [miembro] = await db.insert(clientesGrupo).values({ grupoId: grupo.id, carteraClienteId: clienteId }).returning();
  return { grupo, miembro, url: `/grupos/${grupo.id}/clientes/${miembro.id}` };
}

describe('gestion desde grupos', () => {
  it('aparece una sola vez en historial y ultima gestion; desmarcar conserva el contacto', async () => {
    const cliente = await crearCliente();
    const { grupo, url } = await crearGrupo(cliente.id);
    const payload = { gestionado: true, resultado: 'contactado', notas: 'Nueva vivienda verificada' };
    expect((await app.inject({ method: 'PATCH', url, payload })).statusCode).toBe(200);
    await app.inject({ method: 'PATCH', url, payload });
    const historial = (await app.inject(`/cartera/${cliente.id}/historial`)).json();
    expect(historial.gestiones).toHaveLength(1);
    expect(historial.gestiones[0]).toMatchObject({ resultado: 'contactado', usuarioId, nombreUsuario: 'Gestor Prueba' });
    expect(historial.gestiones[0].notas).toContain('Nueva vivienda verificada');
    expect(historial.gestiones[0].notas).toContain(grupo.nombre);
    expect((await app.inject('/cartera')).json().cartera[0].ultimaGestion).toBe(historial.gestiones[0].fechaGestion);
    expect((await db.select().from(gruposGestion))[0].clientesGestionados).toBe(1);
    await app.inject({ method: 'PATCH', url, payload: { gestionado: false } });
    expect(await db.select().from(gestionesCobro)).toHaveLength(1);
    expect((await db.select().from(gruposGestion))[0].clientesGestionados).toBe(0);
  });

  it('rechaza un cliente de otro grupo sin modificarlo', async () => {
    const cliente = await crearCliente();
    const { miembro } = await crearGrupo(cliente.id);
    const { grupo } = await crearGrupo(cliente.id);
    const res = await app.inject({ method: 'PATCH', url: `/grupos/${grupo.id}/clientes/${miembro.id}`, payload: { gestionado: true, resultado: 'contactado' } });
    expect(res.statusCode).toBe(404);
    expect(await db.select().from(gestionesCobro)).toEqual([]);
    expect((await db.select().from(clientesGrupo).where(eq(clientesGrupo.id, miembro.id)))[0].gestionado).toBe(false);
  });

  it('revierte estado y contador si falla el historial', async () => {
    const cliente = await crearCliente();
    const { url } = await crearGrupo(cliente.id);
    await db.run(sql.raw("CREATE TRIGGER fallo_gestion BEFORE INSERT ON gestiones_cobro BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END"));
    try {
      expect((await app.inject({ method: 'PATCH', url, payload: { gestionado: true, resultado: 'contactado' } })).statusCode).toBe(500);
      expect((await db.select().from(clientesGrupo))[0].gestionado).toBe(false);
      expect((await db.select().from(gruposGestion))[0].clientesGestionados).toBe(0);
    } finally { await db.run(sql`DROP TRIGGER fallo_gestion`); }
  });
});

const fichaContacto = { responsableId: null, estadoUbicacion: 'cambio_vivienda', direccionAnterior: 'Calle anterior 10',
  direccionActual: 'Calle nueva 20', barrio: 'Centro', municipio: 'Granada', referencias: 'Puerta verde', telefonoAlternativo: '3009876543', version: null };
async function prometer(clienteId: string, datos = {}) {
  const respuesta = await app.inject({ method: 'POST', url: `/cartera/${clienteId}/promesas`,
    payload: { monto: 100000, fechaCompromiso: '2026-09-05', notas: 'Compromiso confirmado por telefono', responsableId: usuarioId, ...datos } });
  expect(respuesta.statusCode, respuesta.body).toBe(200);
  return respuesta.json().promesa;
}

describe('ficha de la persona y localizacion', () => {
  it('agrupa por cedula normalizada y comparte la ubicacion sin cambiar los datos del Excel', async () => {
    await subir([filaCompleta, { ...filaCompleta, Numero: '16509', Cedula: '123.456.789', Saldo: 300000 }]);
    const [primero, segundo] = await db.select().from(carteraClientes);
    const guardado = await app.inject({ method: 'PUT', url: `/cartera/${primero.id}/contacto`, payload: { ...fichaContacto, responsableId: usuarioId } });
    expect(guardado.statusCode, guardado.body).toBe(200);
    const ficha = (await app.inject(`/cartera/${segundo.id}/seguimiento`)).json();
    expect(ficha.creditos).toHaveLength(2);
    expect(ficha.contacto).toMatchObject({ direccionActual: 'Calle nueva 20', responsableId: usuarioId, version: 1 });
    expect(ficha.historial).toHaveLength(1);
    const agenda = (await app.inject('/agenda')).json();
    expect(agenda.filas).toHaveLength(1);
    expect(agenda.filas[0]).toMatchObject({ saldo: 800000, categorias: expect.arrayContaining(['sin_contacto', 'localizar']) });
    expect((await db.select().from(carteraClientes))[0].telefono).toBe(filaCompleta.Telefono);
    await subir([{ Numero: filaCompleta.Numero, Saldo: 400000, Telefono: '3001111111' }]);
    expect((await db.select().from(contactosCrm))[0].telefonoAlternativo).toBe('3009876543');
    expect((await db.select().from(cambiosContactoCrm))).toHaveLength(1);
  });

  it('exige ubicacion completa al verificar y rechaza ediciones de una version antigua', async () => {
    const cliente = await crearCliente();
    const url = `/cartera/${cliente.id}/contacto`;
    expect((await app.inject({ method: 'PUT', url, payload: { ...fichaContacto, estadoUbicacion: 'localizado', direccionActual: '' } })).statusCode).toBe(400);
    await app.inject({ method: 'PUT', url, payload: fichaContacto });
    const localizado = await app.inject({ method: 'PUT', url, payload: { ...fichaContacto, estadoUbicacion: 'localizado', version: 1 } });
    expect(localizado.statusCode).toBe(200);
    expect(localizado.json().contacto.verificadoEn).toBeTruthy();
    expect((await app.inject({ method: 'PUT', url, payload: { ...fichaContacto, version: 1 } })).statusCode).toBe(409);
    expect((await app.inject('/agenda?categoria=localizar')).json().total).toBe(0);
  });

  it('omite de sin contacto a la persona contactada por cualquiera de sus creditos', async () => {
    await subir([filaCompleta, { ...filaCompleta, Numero: '16509' }]);
    const [primero] = await db.select().from(carteraClientes);
    expect((await app.inject('/agenda?categoria=sin_contacto')).json().total).toBe(1);
    await crearGestion(primero.id, null);
    expect((await app.inject('/agenda?categoria=sin_contacto')).json().total).toBe(0);
  });
});

describe('promesas y evidencia del Excel', () => {
  it('crea seguimiento, impide promesas abiertas duplicadas y no confirma por importar abonos', async () => {
    const cliente = await crearCliente();
    const promesa = await prometer(cliente.id);
    expect(promesa).toMatchObject({ estado: 'pendiente', abonoBase: 200000, avanceDetectado: 0 });
    expect((await app.inject('/gestiones/pendientes')).json().gestiones).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: `/cartera/${cliente.id}/promesas`, payload: { monto: 50000, fechaCompromiso: '2026-09-05' } })).statusCode).toBe(409);
    await subir([{ Numero: filaCompleta.Numero, Abono: 300000, Saldo: 400000 }]);
    const ficha = (await app.inject(`/cartera/${cliente.id}/seguimiento`)).json();
    expect(ficha.promesas[0]).toMatchObject({ estado: 'pendiente', revision: 'posible_cumplimiento', avanceDetectado: 100000, fechaCorteAbono: '2026-09-05' });
    const agenda = (await app.inject(`/agenda?categoria=revisar_abonos&responsableId=${usuarioId}`)).json();
    expect(agenda.total).toBe(1);
    expect(await db.all(sql`SELECT * FROM pagos_cartera`)).toEqual([]);
    const carteraAntes = (await db.select().from(carteraClientes))[0];
    const resolucion = { estado: 'cumplida', resolucion: 'Abono corroborado en sistema de origen' };
    await app.inject({ method: 'PATCH', url: `/promesas/${promesa.id}`, payload: resolucion });
    await app.inject({ method: 'PATCH', url: `/promesas/${promesa.id}`, payload: resolucion });
    expect((await app.inject('/gestiones/pendientes')).json().gestiones).toEqual([]);
    expect((await db.select().from(carteraClientes))[0]).toEqual(carteraAntes);
    expect(await db.select().from(gestionesCobro)).toHaveLength(2);
    const siguiente = await prometer(cliente.id, { fechaCompromiso: '2026-09-06' });
    expect(siguiente.avanceDetectado).toBe(0);
    expect((await app.inject('/agenda?categoria=proximos')).json().total).toBe(1);
  });

  it('mantiene las promesas parciales y vencidas para revision sin duplicar resoluciones', async () => {
    const cliente = await crearCliente();
    const promesa = await prometer(cliente.id);
    await subir([{ Numero: filaCompleta.Numero, Abono: 250000 }]);
    const payload = { estado: 'parcial', resolucion: 'Se confirmo un abono parcial' };
    await app.inject({ method: 'PATCH', url: `/promesas/${promesa.id}`, payload });
    await app.inject({ method: 'PATCH', url: `/promesas/${promesa.id}`, payload });
    vi.setSystemTime(new Date('2026-09-07T02:00:00Z'));
    expect((await app.inject('/agenda?categoria=promesas_vencidas')).json().total).toBe(1);
    const p = (await app.inject(`/cartera/${cliente.id}/seguimiento`)).json().promesas[0];
    expect(p).toMatchObject({ estado: 'parcial', revision: 'posible_abono_parcial', avanceDetectado: 50000, vencida: true });
    expect(await db.select().from(gestionesCobro)).toHaveLength(2);
  });

  it('crea promesa y gestion de grupo en una sola operacion', async () => {
    const cliente = await crearCliente();
    const { url } = await crearGrupo(cliente.id);
    expect((await app.inject({ method: 'PATCH', url, payload: { gestionado: true, resultado: 'promesa_pago' } })).statusCode).toBe(400);
    expect((await db.select().from(clientesGrupo))[0].gestionado).toBe(false);
    const payload = { gestionado: true, resultado: 'promesa_pago', montoPromesa: 100000, fechaPromesa: '2026-09-05' };
    expect((await app.inject({ method: 'PATCH', url, payload })).statusCode).toBe(200);
    await app.inject({ method: 'PATCH', url, payload });
    expect(await db.select().from(promesasCrm)).toHaveLength(1);
    expect(await db.select().from(gestionesCobro)).toHaveLength(1);
  });

  it('reprograma sin borrar el avance ni dejar el seguimiento vencido', async () => {
    const cliente = await crearCliente();
    const promesa = await prometer(cliente.id);
    await subir([{ Numero: filaCompleta.Numero, Abono: 250000 }]);
    const payload = { estado: 'parcial', fechaCompromiso: '2026-09-10', resolucion: 'Cliente solicita nueva fecha' };
    expect((await app.inject({ method: 'PATCH', url: `/promesas/${promesa.id}`, payload })).statusCode).toBe(200);
    expect((await app.inject('/gestiones/pendientes')).json().gestiones).toEqual([]);
    expect((await app.inject('/agenda?categoria=proximos')).json().total).toBe(1);
    const p = (await app.inject(`/cartera/${cliente.id}/seguimiento`)).json().promesas[0];
    expect(p).toMatchObject({ avanceDetectado: 50000, fechaCompromiso: '2026-09-10', abonoBase: 200000 });
  });
});

describe('conciliacion e indicadores', () => {
  it('bloquea cortes anteriores y disminuciones de abono no autorizadas', async () => {
    const cliente = await crearCliente();
    const anterior = await subir([{ Numero: filaCompleta.Numero, Saldo: 900000 }], '?fechaCorte=2026-09-04');
    expect(anterior.json().procesamiento.errores).toBe(1);
    const ajuste = await subir([{ Numero: filaCompleta.Numero, Abono: 0 }]);
    expect(ajuste.json().procesamiento.errores).toBe(1);
    expect((await db.select().from(carteraClientes))[0]).toEqual(cliente);
    const permitido = await subir([{ Numero: filaCompleta.Numero, Abono: 0 }], '?aceptarAjustes=true');
    expect(permitido.json().procesamiento.errores).toBe(0);
    expect((await db.select().from(carteraClientes))[0].abono).toBe(0);
  });

  it('compara la misma cohorte y no cuenta nuevos creditos como recaudo', async () => {
    await crearCliente();
    const res = await subir([{ Numero: filaCompleta.Numero, Saldo: 400000, Abono: 300000 }, { ...filaCompleta, Numero: '16509', Cedula: '999999', Saldo: 900000 }]);
    expect(res.json().importacion).toMatchObject({ comparados: 1, nuevos: 1, saldoAnterior: 500000, saldoNuevo: 400000, abonoAnterior: 200000, abonoNuevo: 300000 });
    const agenda = (await app.inject('/agenda')).json();
    expect(agenda.indicadores).toMatchObject({ personas: 2, saldo: 1300000 });
    expect(agenda.indicadores.tramos.find((t: any) => t.nombre === '31-60 dias')).toMatchObject({ creditos: 2, saldo: 1300000 });
  });

  it('los endpoints operativos exigen sesion de administrador', async () => {
    expect((await app.inject({ url: '/agenda', headers: { 'x-sin-sesion': '1' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: `/cartera/${randomUUID()}/contacto`, payload: fichaContacto, headers: { 'x-sin-sesion': '1' } })).statusCode).toBe(403);
  });
});
