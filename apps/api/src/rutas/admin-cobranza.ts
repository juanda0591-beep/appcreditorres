import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/cliente.js';
import { conversacionesCobranza, mensajesCobranza } from '../db/esquema/cobranza-whatsapp.js';
import { candidatosCobranza, enviarYGuardarCobranza, contextoCarteraCobranza } from '../whatsapp/cobranza-mensajes.js';
import { esquemaConfigCobranza, leerConfigAgenteCobranza, guardarConfigAgenteCobranza } from '../servicios/configuracion-agente-cobranza.js';
import { generarRespuestaCobranza } from '../servicios/agente-cobranza.js';
import { conectarWhatsApp, desconectarWhatsApp, obtenerEstadoConexion, enviarMensajeWhatsApp } from '../whatsapp/baileys-client.js';
import { ErrorDatosInvalidos, ErrorNoEncontrado } from '../errores.js';

function validar<T>(schema: z.ZodType<T>, valor: unknown) {
  const resultado = schema.safeParse(valor);
  if (!resultado.success) throw new ErrorDatosInvalidos(resultado.error.issues[0]?.message ?? 'Datos invalidos');
  return resultado.data;
}
export const rutasAdminCobranza: FastifyPluginAsync = async app => {
  app.addHook('onRequest', async (request, reply) => {
    if (request.usuario?.rol !== 'admin') return reply.code(403).send({ error: 'No autorizado' });
  });
  app.get('/estado', () => obtenerEstadoConexion('cobranza'));
  app.get('/config', async () => {
    const config = await leerConfigAgenteCobranza();
    return { ...config, apiKey: config.apiKey ? `***${config.apiKey.slice(-4)}` : '', apiKeyConfigured: Boolean(config.apiKey) };
  });
  app.put('/config', async request => {
    await guardarConfigAgenteCobranza(validar(esquemaConfigCobranza, request.body));
    return { success: true };
  });
  app.post('/conectar', async () => { await conectarWhatsApp('cobranza'); return obtenerEstadoConexion('cobranza'); });
  app.post('/desconectar', async () => { await desconectarWhatsApp('cobranza'); return obtenerEstadoConexion('cobranza'); });
  app.post('/probar', async request => {
    const datos = validar(z.object({ mensaje: z.string().trim().min(1).max(2000) }), request.body);
    const respuesta = await generarRespuestaCobranza(datos.mensaje, 'SIMULACION sin datos de clientes. No hay identidad vinculada.', await leerConfigAgenteCobranza());
    return { respuesta };
  });
  app.get('/conversaciones', async () => ({ conversaciones: await db.select().from(conversacionesCobranza).orderBy(desc(conversacionesCobranza.actualizadoEn)).limit(100) }));
  app.get('/conversaciones/:id', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    const [conversacion] = await db.select().from(conversacionesCobranza).where(eq(conversacionesCobranza.id, id));
    if (!conversacion) throw new ErrorNoEncontrado('Conversacion no encontrada');
    const mensajes = await db.select().from(mensajesCobranza).where(eq(mensajesCobranza.conversacionId, id)).orderBy(desc(mensajesCobranza.creadoEn), desc(mensajesCobranza.id)).limit(100);
    const { identificacion, contexto } = await contextoCarteraCobranza(conversacion);
    return { conversacion, mensajes: mensajes.reverse(), candidatos: await candidatosCobranza(conversacion.telefono),
      identificacion, cartera: contexto.creditos };
  });
  app.patch('/conversaciones/:id', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    const datos = validar(z.object({ pausada: z.boolean().optional(), requiereAsesor: z.boolean().optional(), clienteId: z.string().uuid().nullable().optional() }), request.body);
    const [anterior] = await db.select().from(conversacionesCobranza).where(eq(conversacionesCobranza.id, id));
    if (!anterior) throw new ErrorNoEncontrado('Conversacion no encontrada');
    let documento = anterior.documento;
    if (datos.clienteId === null) documento = null;
    else if (datos.clienteId) {
      const candidatos = await candidatosCobranza(anterior.telefono);
      const candidato = candidatos.find(c => c.id === datos.clienteId);
      if (!candidato) throw new ErrorDatosInvalidos('El telefono no coincide con el cliente seleccionado');
      documento = candidato.documento;
    }
    const [conversacion] = await db.update(conversacionesCobranza).set({ documento,
      ...(datos.pausada === undefined ? {} : { pausada: datos.pausada }),
      ...(datos.clienteId === null ? { pausada: true } : {}),
      ...(datos.requiereAsesor === undefined ? {} : { requiereAsesor: datos.requiereAsesor }),
    }).where(eq(conversacionesCobranza.id, id)).returning();
    return { conversacion };
  });
  app.post('/conversaciones/:id/enviar', async request => {
    const { id } = validar(z.object({ id: z.string().uuid() }), request.params);
    const { mensaje } = validar(z.object({ mensaje: z.string().trim().min(1).max(8000) }), request.body);
    const [conversacion] = await db.select().from(conversacionesCobranza).where(eq(conversacionesCobranza.id, id));
    if (!conversacion) throw new ErrorNoEncontrado('Conversacion no encontrada');
    await db.update(conversacionesCobranza).set({ pausada: true }).where(eq(conversacionesCobranza.id, id));
    await enviarYGuardarCobranza(id, mensaje, 'gestor', texto => enviarMensajeWhatsApp(conversacion.jid, texto, 'cobranza'));
    return { success: true };
  });
};
