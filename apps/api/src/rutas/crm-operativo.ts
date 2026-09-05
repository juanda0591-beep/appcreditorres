import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/cliente.js';
import { carteraClientes, cambiosContactoCrm, contactosCrm, gestionesCobro, importacionesCrm, promesasCrm } from '../db/esquema/crm.js';
import { usuarios } from '../db/esquema/usuarios.js';
import { ErrorConflicto, ErrorDatosInvalidos, ErrorNoEncontrado } from '../errores.js';

export const hoyCrm = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
export const documentoCrm = (valor: string) => valor.trim().replace(/[ .-]/g, '').toUpperCase();
const columnaDocumento = sql<string>`upper(replace(replace(replace(trim(${carteraClientes.cedula}), '.', ''), ' ', ''), '-', ''))`;
const abierta = (estado: string) => estado === 'pendiente' || estado === 'parcial';
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(valor => {
  const date = new Date(`${valor}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === valor;
}, 'Fecha invalida');
function validar<T>(schema: z.ZodType<T>, datos: unknown): T {
  const result = schema.safeParse(datos);
  if (!result.success) throw new ErrorDatosInvalidos(result.error.issues[0]?.message ?? 'Datos invalidos');
  return result.data;
}

export function evidenciaPromesa(promesa: typeof promesasCrm.$inferSelect, credito: typeof carteraClientes.$inferSelect) {
  const incrementoAbono = credito.abono - promesa.abonoBase;
  const avanceDetectado = Math.max(0, incrementoAbono);
  return {
    ...promesa, numero: credito.numero, abonoActual: credito.abono,
    avanceDetectado, fechaCorteAbono: credito.fechaCorteAbono,
    vencida: abierta(promesa.estado) && promesa.fechaCompromiso < hoyCrm(),
    revision: !abierta(promesa.estado) ? null : incrementoAbono < 0 ? 'ajuste_abono'
      : avanceDetectado >= promesa.monto ? 'posible_cumplimiento' : avanceDetectado > 0 ? 'posible_abono_parcial' : null,
  };
}

const responsables = () => db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios)
  .where(and(eq(usuarios.activo, true), eq(usuarios.rol, 'admin')));

type TransaccionCrm = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function crearPromesaCrm(tx: TransaccionCrm, id: string, entrada: unknown, usuario: { id: string; nombre: string }) {
  const validada = validar(z.object({ monto: z.number().positive(), fechaCompromiso: fecha,
    notas: z.string().trim().max(2000).default(''), responsableId: z.string().uuid().optional(),
    canal: z.enum(['telefono', 'whatsapp', 'presencial', 'email', 'no_especificado']).default('no_especificado') }), entrada);
  const datos = { ...validada, responsableId: validada.responsableId ?? usuario.id };
  if (datos.fechaCompromiso < hoyCrm()) throw new ErrorDatosInvalidos('La fecha de una nueva promesa no puede estar vencida');
  const [cliente] = await tx.select().from(carteraClientes).where(eq(carteraClientes.id, id));
  if (!cliente) throw new ErrorNoEncontrado('Credito no encontrado');
  if (datos.monto > cliente.saldo) throw new ErrorDatosInvalidos('La promesa supera el saldo del ultimo Excel');
  const [existente] = await tx.select().from(promesasCrm).where(and(eq(promesasCrm.carteraClienteId, id), inArray(promesasCrm.estado, ['pendiente', 'parcial'])));
  if (existente) throw new ErrorConflicto('Este credito ya tiene una promesa abierta');
  const [responsable] = await tx.select().from(usuarios).where(and(eq(usuarios.id, datos.responsableId), eq(usuarios.activo, true), eq(usuarios.rol, 'admin')));
  if (!responsable) throw new ErrorDatosInvalidos('Responsable no disponible');
  const [gestion] = await tx.insert(gestionesCobro).values({ carteraClienteId: id, tipoGestion: 'promesa_pago', canal: datos.canal,
    resultado: 'promesa_pago', notas: datos.notas, proximaAccion: `Revisar promesa por ${datos.monto} COP`, fechaProximaAccion: datos.fechaCompromiso,
    usuarioId: usuario.id, nombreUsuario: usuario.nombre }).returning();
  const { canal, ...campos } = datos;
  const [promesa] = await tx.insert(promesasCrm).values({ ...campos, carteraClienteId: id, gestionId: gestion.id,
    abonoBase: cliente.abono, responsableNombre: responsable.nombre }).returning();
  return { promesa: evidenciaPromesa(promesa, cliente) };
}

export const rutasCrmOperativo: FastifyPluginAsync = async fastify => {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') return reply.code(403).send({ error: 'No autorizado' });
  });

  fastify.get('/cartera/:id/seguimiento', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    const [cliente] = await db.select().from(carteraClientes).where(eq(carteraClientes.id, id));
    if (!cliente) throw new ErrorNoEncontrado('Cliente no encontrado');
    const documento = documentoCrm(cliente.cedula);
    const creditos = await db.select().from(carteraClientes).where(eq(columnaDocumento, documento));
    const ids = creditos.map(c => c.id);
    const [contacto] = await db.select().from(contactosCrm).where(eq(contactosCrm.documento, documento));
    const promesas = await db.select().from(promesasCrm).where(inArray(promesasCrm.carteraClienteId, ids)).orderBy(desc(promesasCrm.creadoEn));
    const historial = await db.select({ gestion: gestionesCobro, numero: carteraClientes.numero })
      .from(gestionesCobro).innerJoin(carteraClientes, eq(carteraClientes.id, gestionesCobro.carteraClienteId))
      .where(inArray(gestionesCobro.carteraClienteId, ids)).orderBy(desc(gestionesCobro.fechaGestion)).limit(100);
    const cambiosContacto = await db.select().from(cambiosContactoCrm).where(eq(cambiosContactoCrm.documento, documento))
      .orderBy(desc(cambiosContactoCrm.creadoEn)).limit(20);
    return {
      documento, contacto: contacto ?? null, creditos, responsables: await responsables(), usuarioActualId: request.usuario!.id,
      promesas: promesas.map(p => evidenciaPromesa(p, creditos.find(c => c.id === p.carteraClienteId)!)),
      historial, cambiosContacto: cambiosContacto.map(c => ({ ...c, anterior: c.anterior ? JSON.parse(c.anterior) : null, nuevo: JSON.parse(c.nuevo) })),
    };
  });

  fastify.put('/cartera/:id/contacto', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    const datos = validar(z.object({
      responsableId: z.string().uuid().nullable(),
      estadoUbicacion: z.enum(['por_confirmar', 'cambio_vivienda', 'no_localizado', 'localizado']),
      direccionAnterior: z.string().trim().max(300), direccionActual: z.string().trim().max(300),
      barrio: z.string().trim().max(120), municipio: z.string().trim().max(120),
      referencias: z.string().trim().max(2000), telefonoAlternativo: z.string().trim().max(40),
      version: z.number().int().positive().nullable(),
    }), request.body);
    if (datos.estadoUbicacion === 'localizado' && (!datos.direccionActual || !datos.municipio)) {
      throw new ErrorDatosInvalidos('Registra direccion y municipio antes de marcar como localizado');
    }
    return db.transaction(async tx => {
      const [cliente] = await tx.select().from(carteraClientes).where(eq(carteraClientes.id, id));
      if (!cliente) throw new ErrorNoEncontrado('Cliente no encontrado');
      const documento = documentoCrm(cliente.cedula);
      const [anterior] = await tx.select().from(contactosCrm).where(eq(contactosCrm.documento, documento));
      if ((anterior?.version ?? null) !== datos.version) throw new ErrorConflicto('Otro gestor modifico la ficha. Actualiza antes de guardar');
      if (datos.responsableId) {
        const [responsable] = await tx.select().from(usuarios).where(and(eq(usuarios.id, datos.responsableId), eq(usuarios.activo, true), eq(usuarios.rol, 'admin')));
        if (!responsable) throw new ErrorDatosInvalidos('Responsable no disponible');
      }
      const { version, ...campos } = datos;
      const nuevaVersion = (anterior?.version ?? 0) + 1;
      const ahora = new Date().toISOString();
      const mismaUbicacion = anterior?.estadoUbicacion === 'localizado' && anterior.direccionActual === datos.direccionActual && anterior.municipio === datos.municipio;
      const verificadoEn = datos.estadoUbicacion === 'localizado' ? (mismaUbicacion ? anterior.verificadoEn : ahora) : null;
      const [contacto] = await tx.insert(contactosCrm).values({ documento, ...campos, version: nuevaVersion, verificadoEn, actualizadoEn: ahora })
        .onConflictDoUpdate({ target: contactosCrm.documento, set: { ...campos, version: nuevaVersion, verificadoEn, actualizadoEn: ahora } }).returning();
      await tx.insert(cambiosContactoCrm).values({ documento, anterior: anterior ? JSON.stringify(anterior) : null,
        nuevo: JSON.stringify(contacto), usuarioId: request.usuario!.id, nombreUsuario: request.usuario!.nombre });
      await tx.insert(gestionesCobro).values({ carteraClienteId: id, tipoGestion: 'actualizacion_contacto', canal: 'no_especificado',
        resultado: datos.estadoUbicacion, notas: [datos.direccionActual, datos.barrio, datos.municipio, datos.referencias].filter(Boolean).join(' | '),
        usuarioId: request.usuario!.id, nombreUsuario: request.usuario!.nombre });
      return { contacto };
    });
  });

  fastify.post('/cartera/:id/promesas', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    return db.transaction(tx => crearPromesaCrm(tx, id, request.body, request.usuario!));
  });

  fastify.patch('/promesas/:id', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    const datos = validar(z.object({ estado: z.enum(['pendiente', 'parcial', 'cumplida', 'incumplida', 'cancelada']), resolucion: z.string().trim().min(3).max(2000), fechaCompromiso: fecha.optional() }), request.body);
    if (datos.fechaCompromiso && (datos.fechaCompromiso < hoyCrm() || !abierta(datos.estado))) throw new ErrorDatosInvalidos('La reprogramacion requiere una promesa abierta y una fecha no vencida');
    if (datos.estado === 'pendiente' && !datos.fechaCompromiso) throw new ErrorDatosInvalidos('Indica la nueva fecha de compromiso');
    return db.transaction(async tx => {
      const [anterior] = await tx.select().from(promesasCrm).where(eq(promesasCrm.id, id));
      if (!anterior) throw new ErrorNoEncontrado('Promesa no encontrada');
      if (anterior.estado === datos.estado && anterior.resolucion === datos.resolucion && (!datos.fechaCompromiso || datos.fechaCompromiso === anterior.fechaCompromiso)) return { promesa: anterior };
      if (!abierta(anterior.estado)) {
        if (anterior.estado === datos.estado && anterior.resolucion === datos.resolucion) return { promesa: anterior };
        throw new ErrorConflicto('La promesa ya fue cerrada');
      }
      const ahora = new Date().toISOString();
      const cerrada = !abierta(datos.estado);
      const [promesa] = await tx.update(promesasCrm).set({ ...datos, actualizadoEn: ahora, resueltaEn: cerrada ? ahora : null }).where(eq(promesasCrm.id, id)).returning();
      if (cerrada && anterior.gestionId) await tx.update(gestionesCobro).set({ seguimientoCerradoEn: ahora, seguimientoCerradoPor: request.usuario!.id }).where(eq(gestionesCobro.id, anterior.gestionId));
      if (datos.fechaCompromiso && anterior.gestionId) await tx.update(gestionesCobro).set({ fechaProximaAccion: datos.fechaCompromiso, seguimientoCerradoEn: null, seguimientoCerradoPor: null }).where(eq(gestionesCobro.id, anterior.gestionId));
      await tx.insert(gestionesCobro).values({ carteraClienteId: anterior.carteraClienteId, tipoGestion: 'promesa_actualizada', canal: 'no_especificado',
        resultado: datos.fechaCompromiso ? 'promesa_reprogramada' : `promesa_${datos.estado}`, notas: datos.fechaCompromiso ? `${anterior.fechaCompromiso} -> ${datos.fechaCompromiso}: ${datos.resolucion}` : datos.resolucion, usuarioId: request.usuario!.id, nombreUsuario: request.usuario!.nombre });
      return { promesa };
    });
  });

  fastify.get('/agenda', async request => {
    const filtros = validar(z.object({ categoria: z.enum(['todos', 'sin_contacto', 'seguimientos', 'promesas_hoy', 'promesas_vencidas', 'localizar', 'revisar_abonos', 'proximos']).default('todos'),
      responsableId: z.string().optional(), busqueda: z.string().max(120).default(''), pagina: z.coerce.number().int().min(0).default(0) }), request.query);
    const hoy = hoyCrm();
    const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const [creditos, contactos, promesas, gestiones, listaResponsables, importaciones] = await Promise.all([
      db.select().from(carteraClientes), db.select().from(contactosCrm), db.select().from(promesasCrm),
      db.select({ id: gestionesCobro.id, carteraClienteId: gestionesCobro.carteraClienteId, fechaGestion: gestionesCobro.fechaGestion,
        tipoGestion: gestionesCobro.tipoGestion, fechaProximaAccion: gestionesCobro.fechaProximaAccion,
        seguimientoCerradoEn: gestionesCobro.seguimientoCerradoEn, usuarioId: gestionesCobro.usuarioId }).from(gestionesCobro),
      responsables(), db.select().from(importacionesCrm).orderBy(desc(importacionesCrm.creadoEn)).limit(10),
    ]);
    const contactoPorDocumento = new Map(contactos.map(c => [c.documento, c]));
    const creditoPorId = new Map(creditos.map(c => [c.id, c]));
    const porCredito = new Map<string, typeof gestiones>();
    for (const gestion of gestiones) {
      const lista = porCredito.get(gestion.carteraClienteId) ?? [];
      lista.push(gestion); porCredito.set(gestion.carteraClienteId, lista);
    }
    const promesasPorCredito = new Map<string, ReturnType<typeof evidenciaPromesa>[]>();
    for (const promesa of promesas) {
      const credito = creditoPorId.get(promesa.carteraClienteId);
      if (!credito || !abierta(promesa.estado)) continue;
      const lista = promesasPorCredito.get(credito.id) ?? [];
      lista.push(evidenciaPromesa(promesa, credito)); promesasPorCredito.set(credito.id, lista);
    }
    const porPersona = new Map<string, typeof creditos>();
    for (const credito of creditos) {
      const doc = documentoCrm(credito.cedula);
      const lista = porPersona.get(doc) ?? [];
      lista.push(credito); porPersona.set(doc, lista);
    }
    const filas = [...porPersona.entries()].map(([documento, prestamos]) => {
      const ordenados = prestamos.slice().sort((a, b) => (b.diasMora ?? 0) - (a.diasMora ?? 0) || b.saldo - a.saldo);
      const principal = ordenados.find(c => c.saldo > 0) ?? ordenados[0]!;
      const contacto = contactoPorDocumento.get(documento);
      const movimientos = prestamos.flatMap(c => porCredito.get(c.id) ?? []);
      const contactosReales = movimientos.filter(g => !['actualizacion_contacto', 'promesa_actualizada'].includes(g.tipoGestion));
      const ultimaGestion = contactosReales.map(g => g.fechaGestion).sort().at(-1) ?? null;
      const pendientes = movimientos.filter(g => g.fechaProximaAccion && g.fechaProximaAccion.slice(0, 10) <= hoy && !g.seguimientoCerradoEn);
      const compromisos = prestamos.flatMap(c => promesasPorCredito.get(c.id) ?? []);
      const saldo = prestamos.reduce((s, c) => s + c.saldo, 0);
      const categorias: string[] = [];
      if (principal.saldo > 0 && (principal.diasMora ?? 0) > 0 && (!ultimaGestion || ultimaGestion < hace7)) categorias.push('sin_contacto');
      if (pendientes.length) categorias.push('seguimientos');
      if (compromisos.some(p => p.fechaCompromiso === hoy)) categorias.push('promesas_hoy');
      if (compromisos.some(p => p.vencida)) categorias.push('promesas_vencidas');
      if (principal.saldo > 0 && contacto && contacto.estadoUbicacion !== 'localizado') categorias.push('localizar');
      if (compromisos.some(p => p.revision)) categorias.push('revisar_abonos');
      if (compromisos.some(p => p.fechaCompromiso > hoy) || movimientos.some(g => !g.seguimientoCerradoEn && g.fechaProximaAccion && g.fechaProximaAccion.slice(0, 10) > hoy)) categorias.push('proximos');
      return { documento, cliente: principal.cliente, creditoPrincipal: { ...principal, telefono: contacto?.telefonoAlternativo || principal.telefono },
        creditos: prestamos.map(c => ({ id: c.id, numero: c.numero })), saldo, diasMora: principal.diasMora ?? 0,
        ultimaGestion, pendientes: pendientes.length, promesas: compromisos.length, categorias,
        estadoUbicacion: contacto?.estadoUbicacion ?? 'sin_datos', responsableId: contacto?.responsableId ?? null,
        responsablesIds: [...new Set([contacto?.responsableId, ...compromisos.map(p => p.responsableId)].filter((id): id is string => Boolean(id)))],
        responsableNombre: [...new Set([listaResponsables.find(r => r.id === contacto?.responsableId)?.nombre, ...compromisos.map(p => p.responsableNombre)].filter(Boolean))].join(', ') || null,
        fechaProxima: [...pendientes.map(p => p.fechaProximaAccion!), ...compromisos.map(p => p.fechaCompromiso)].sort()[0] ?? null };
    });
    const relevantes = filas.filter(f => f.categorias.length > 0);
    const busqueda = filtros.busqueda.toLocaleLowerCase('es-CO');
    const seleccion = relevantes.filter(f => (filtros.categoria === 'todos' || f.categorias.includes(filtros.categoria)) &&
      (!filtros.responsableId || (filtros.responsableId === 'sin_asignar' ? f.responsablesIds.length === 0 : f.responsablesIds.includes(filtros.responsableId))) &&
      `${f.cliente} ${f.documento} ${f.creditos.map(c => c.numero).join(' ')} ${f.creditoPrincipal.telefono ?? ''}`.toLocaleLowerCase('es-CO').includes(busqueda))
      .sort((a, b) => Number(b.categorias.includes('promesas_vencidas')) - Number(a.categorias.includes('promesas_vencidas')) ||
        Number(b.categorias.includes('revisar_abonos')) - Number(a.categorias.includes('revisar_abonos')) ||
        (a.fechaProxima ?? '9999').localeCompare(b.fechaProxima ?? '9999') || b.diasMora - a.diasMora || b.saldo - a.saldo);
    const mes = hoy.slice(0, 7);
    const formatoMes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
    const mesLocal = (instante: string) => formatoMes.format(new Date(instante)).slice(0, 7);
    const promesasDelMes = promesas.filter(p => mesLocal(p.creadoEn) === mes);
    const tramos = [{ nombre: 'Al dia', min: -Infinity, max: 0 }, { nombre: '1-30 dias', min: 1, max: 30 }, { nombre: '31-60 dias', min: 31, max: 60 },
      { nombre: '61-90 dias', min: 61, max: 90 }, { nombre: 'Mas de 90 dias', min: 91, max: Infinity }].map(t => {
        const incluidos = creditos.filter(c => c.saldo > 0 && (c.diasMora ?? 0) >= t.min && (c.diasMora ?? 0) <= t.max);
        return { nombre: t.nombre, creditos: incluidos.length, saldo: incluidos.reduce((s, c) => s + c.saldo, 0) };
      });
    const porGestor = listaResponsables.map(r => ({ nombre: r.nombre,
      gestionesMes: gestiones.filter(g => g.usuarioId === r.id && mesLocal(g.fechaGestion) === mes && !['actualizacion_contacto', 'promesa_actualizada'].includes(g.tipoGestion)).length,
      promesas: promesasDelMes.filter(p => p.responsableId === r.id).length,
      cumplidas: promesasDelMes.filter(p => p.responsableId === r.id && p.estado === 'cumplida').length,
      clientesAsignados: contactos.filter(c => c.responsableId === r.id).length }));
    return { hoy, filas: seleccion.slice(filtros.pagina * 30, (filtros.pagina + 1) * 30), total: seleccion.length, pagina: filtros.pagina,
      responsables: listaResponsables, contadores: Object.fromEntries(['todos', 'sin_contacto', 'seguimientos', 'promesas_hoy', 'promesas_vencidas', 'localizar', 'revisar_abonos', 'proximos'].map(c => [c, c === 'todos' ? relevantes.length : relevantes.filter(f => f.categorias.includes(c)).length])),
      indicadores: { personas: filas.length, saldo: creditos.reduce((s, c) => s + c.saldo, 0), tramos, porGestor,
        promesasMes: promesasDelMes.length, cumplidasMes: promesasDelMes.filter(p => p.estado === 'cumplida').length,
        localizados: contactos.filter(c => c.estadoUbicacion === 'localizado').length }, importaciones };
  });
};
