import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/cliente.js';
import { ajustesVentas, conversacionesWhatsapp, mensajesWhatsapp } from '../db/esquema/whatsapp.js';

export type TxVentas = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function estadoAtencionVentas(conversacionId: string, consulta: typeof db | TxVentas = db) {
  const [ajustes] = await consulta.select().from(ajustesVentas).where(eq(ajustesVentas.id, 'principal'));
  const [conversacion] = await consulta.select().from(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.id, conversacionId));
  return { automatico: Boolean(conversacion && conversacion.modoAtencion === 'automatico' && (ajustes?.modo ?? 'automatico') === 'automatico'),
    version: `${ajustes?.revision ?? 0}:${conversacion?.revisionAtencion ?? 0}` };
}
export async function respuestaVentasPermitida(telefono: string) {
  const [conversacion] = await db.select({ id: conversacionesWhatsapp.id }).from(conversacionesWhatsapp).where(eq(conversacionesWhatsapp.telefono, telefono)).limit(1);
  return conversacion ? (await estadoAtencionVentas(conversacion.id)).automatico : false;
}
export async function registrarMensajeVentas(conversacionId: string, rol: 'user' | 'assistant', contenido: string,
  metadata?: Record<string, unknown>, externoId?: string) {
  const id = externoId ? `wa_${createHash('sha256').update(`${conversacionId}:${externoId}`).digest('hex')}` : randomUUID();
  const [mensaje] = await db.insert(mensajesWhatsapp).values({ id, conversacionId, rol, contenido,
    metadata: metadata ? JSON.stringify(metadata) : null, creadoEn: new Date().toISOString() }).onConflictDoNothing().returning();
  if (mensaje) await db.update(conversacionesWhatsapp).set({ ultimoMensaje: contenido.slice(0, 500), actualizadoEn: new Date().toISOString() })
    .where(eq(conversacionesWhatsapp.id, conversacionId));
  return mensaje;
}

const colas = new Map<string, Promise<unknown>>();
export async function enColaVentas<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const actual = (colas.get(clave) ?? Promise.resolve()).catch(() => {}).then(tarea);
  colas.set(clave, actual);
  try { return await actual; }
  finally { if (colas.get(clave) === actual) colas.delete(clave); }
}
