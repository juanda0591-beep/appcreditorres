import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/cliente.js';
import { conversacionesCobranza, mensajesCobranza } from '../db/esquema/cobranza-whatsapp.js';
import { carteraClientes, contactosCrm, gestionesCobro, promesasCrm } from '../db/esquema/crm.js';
import { documentoCrm } from '../rutas/crm-operativo.js';
import { generarRespuestaCobranza } from '../servicios/agente-cobranza.js';
import { leerConfigAgenteCobranza } from '../servicios/configuracion-agente-cobranza.js';

export function telefonoCobranza(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  return null;
}

export async function conversacionCobranza(jid: string, telefono?: string, nombre?: string) {
  // La direccion PN permite reunir mensajes @lid con el envio manual por telefono.
  const destino = telefono ? `${telefono}@s.whatsapp.net` : jid;
  await db.insert(conversacionesCobranza).values({ jid: destino, telefono, nombre })
    .onConflictDoNothing({ target: conversacionesCobranza.jid });
  const [conversacion] = await db.select().from(conversacionesCobranza).where(eq(conversacionesCobranza.jid, destino));
  return conversacion;
}

export async function enviarYGuardarCobranza(conversacionId: string, texto: string, rol: 'assistant' | 'gestor', enviar: (texto: string) => Promise<unknown>) {
  const [mensaje] = await db.insert(mensajesCobranza).values({ conversacionId, rol, contenido: texto, estado: 'pendiente' }).returning();
  try {
    await enviar(texto);
    await db.update(mensajesCobranza).set({ estado: 'enviado' }).where(eq(mensajesCobranza.id, mensaje.id));
    await db.update(conversacionesCobranza).set({ ultimoMensaje: texto, actualizadoEn: new Date().toISOString() }).where(eq(conversacionesCobranza.id, conversacionId));
  } catch (error) {
    await db.update(mensajesCobranza).set({ estado: 'error' }).where(eq(mensajesCobranza.id, mensaje.id));
    await db.update(conversacionesCobranza).set({ requiereAsesor: true }).where(eq(conversacionesCobranza.id, conversacionId));
    throw error;
  }
}

export async function procesarMensajeCobranza(entrada: { jid: string; telefono?: string; nombre?: string; externoId: string; texto: string },
  enviar: (texto: string) => Promise<unknown>, vigente: () => boolean = () => true) {
  const conversacion = await conversacionCobranza(entrada.jid, entrada.telefono, entrada.nombre);
  const [guardado] = await db.insert(mensajesCobranza).values({ conversacionId: conversacion.id, externoId: entrada.externoId,
    rol: 'user', contenido: entrada.texto.slice(0, 12000) }).onConflictDoNothing().returning();
  if (!guardado) return;
  await db.update(conversacionesCobranza).set({ ultimoMensaje: entrada.texto.slice(0, 500), actualizadoEn: new Date().toISOString(), requiereAsesor: true })
    .where(eq(conversacionesCobranza.id, conversacion.id));
  if (conversacion.pausada || !vigente() || entrada.texto.startsWith('[Audio recibido:') || entrada.texto.startsWith('[Adjunto recibido:')) return;
  if (/\b(asesor|humano|no me escrib\w*|no me contact\w*|deje de escrib\w*|numero equivocado|n[uú]mero errado)\b/i.test(entrada.texto)) {
    await db.update(conversacionesCobranza).set({ pausada: true }).where(eq(conversacionesCobranza.id, conversacion.id));
    return;
  }
  const config = await leerConfigAgenteCobranza();
  if (!config.activo || !config.apiKey) return;
  const { contexto, creditos, identificacion } = await contextoCarteraCobranza(conversacion);
  const historial = await db.select().from(mensajesCobranza).where(and(eq(mensajesCobranza.conversacionId, conversacion.id),
    inArray(mensajesCobranza.estado, ['recibido', 'enviado']))).orderBy(desc(mensajesCobranza.creadoEn), desc(mensajesCobranza.id)).limit(16);
  try {
    const respuesta = await generarRespuestaCobranza(entrada.texto.slice(0, 12000), JSON.stringify(contexto), config,
      identificacion.documento ? historial.filter(m => m.id !== guardado.id).reverse().map(m => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.contenido })) : []);
    const [actual] = await db.select().from(conversacionesCobranza).where(eq(conversacionesCobranza.id, conversacion.id));
    if (!vigente() || actual.pausada || actual.documento !== conversacion.documento || !(await leerConfigAgenteCobranza()).activo) return;
    // Una importacion o correccion de telefono durante la respuesta puede cambiar la coincidencia.
    const identidadActual = await identificarClienteCobranza(actual);
    if (identidadActual.documento !== identificacion.documento) return;
    await enviarYGuardarCobranza(conversacion.id, respuesta, 'assistant', enviar);
    if (creditos.length === 1) await db.insert(gestionesCobro).values({ carteraClienteId: creditos[0].id, tipoGestion: 'whatsapp', canal: 'whatsapp',
      resultado: 'respuesta_cliente', notas: entrada.texto.slice(0, 12000), usuarioId: 'agente-cobranza', nombreUsuario: 'Agente de cobranza' });
  } catch {
    await db.update(conversacionesCobranza).set({ requiereAsesor: true }).where(eq(conversacionesCobranza.id, conversacion.id));
    // El operador ve los mensajes recibidos, incluso si la IA no pudo responder.
    console.error('No se pudo completar la respuesta del agente de cobranza');
  }
}

export async function candidatosCobranza(telefono: string | null) {
  const normalizado = telefono ? telefonoCobranza(telefono) : null;
  if (!normalizado) return [];
  const [cartera, contactos] = await Promise.all([db.select().from(carteraClientes), db.select().from(contactosCrm)]);
  const documentos = new Set(contactos.filter(c => telefonoCobranza(c.telefonoAlternativo) === normalizado).map(c => c.documento));
  return cartera.filter(c => telefonoCobranza(c.telefono ?? '') === normalizado || documentos.has(documentoCrm(c.cedula)))
    .map(c => ({ id: c.id, cliente: c.cliente, numero: c.numero, documento: documentoCrm(c.cedula) }));
}

type IdentidadConversacion = Pick<typeof conversacionesCobranza.$inferSelect, 'documento' | 'telefono'>;
export async function identificarClienteCobranza(conversacion: IdentidadConversacion) {
  if (conversacion.documento) return { tipo: 'manual' as const, documento: documentoCrm(conversacion.documento) };
  const candidatos = await candidatosCobranza(conversacion.telefono);
  const documentos = [...new Set(candidatos.map(c => c.documento).filter(Boolean))];
  return documentos.length === 1
    ? { tipo: 'telefono' as const, documento: documentos[0]! }
    : { tipo: documentos.length > 1 ? 'ambiguo' as const : 'sin_coincidencia' as const, documento: null };
}

export async function contextoCarteraCobranza(conversacion: IdentidadConversacion) {
  const identificacion = await identificarClienteCobranza(conversacion);
  const creditos = identificacion.documento ? await db.select().from(carteraClientes)
    .where(sql`upper(replace(replace(replace(trim(${carteraClientes.cedula}), '.', ''), ' ', ''), '-', '')) = ${identificacion.documento}`)
    .orderBy(carteraClientes.numero) : [];
  const promesas = creditos.length ? await db.select().from(promesasCrm)
    .where(inArray(promesasCrm.carteraClienteId, creditos.map(c => c.id))).orderBy(desc(promesasCrm.creadoEn)).limit(30) : [];
  const contexto = {
    identificacion: creditos.length ? identificacion.tipo : identificacion.tipo === 'ambiguo' ? 'telefono_compartido_requiere_gestor' : 'sin_cliente_identificado',
    fechaHoy: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()),
    moneda: 'COP', fuente: 'Cartera importada del sistema de ventas y cobranza mediante Excel',
    pagosDisponibles: 'Solo abono acumulado y ultima fecha de abono. No hay detalle de pagos individuales ni calendario de cuotas en el Excel.',
    creditos: creditos.map(c => ({
      numero: c.numero, cliente: c.cliente, producto: c.articulo, fechaInicio: c.fechaInicio,
      montoCuota: c.montoCuota, periodicidad: c.periodosPago, abonoAcumulado: c.abono,
      saldoPendiente: c.saldo, ultimaFechaAbono: c.ultimaFechaAbono,
      estado: c.estado, diasMora: c.diasMora, fechaCorte: c.fechaCorteExcel,
      fechaCorteAbonos: c.fechaCorteAbono, ultimaImportacion: c.ultimaImportacionEn,
    })),
    resumen: creditos.length ? {
      cantidadCreditos: creditos.length, saldoTotal: creditos.reduce((total, c) => total + c.saldo, 0),
      abonoAcumuladoTotal: creditos.reduce((total, c) => total + c.abono, 0),
    } : null,
    promesas: promesas.map(p => ({ credito: creditos.find(c => c.id === p.carteraClienteId)!.numero,
      monto: p.monto, fechaCompromiso: p.fechaCompromiso, estado: p.estado })),
  };
  return { identificacion, creditos, contexto };
}
