import makeWASocket, { DisconnectReason, useMultiFileAuthState, isPnUser, jidDecode } from '@whiskeysockets/baileys';
import type { WAMessage, WAMessageKey } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { procesarMensajeWhatsApp } from './procesar-mensaje.js';
import { procesarMensajeCobranza } from './cobranza-mensajes.js';
import { respuestaVentasPermitida } from './atencion-ventas.js';

export type CanalWhatsApp = 'ventas' | 'cobranza';
type Socket = ReturnType<typeof makeWASocket>;
type Sesion = { socket: Socket | null; qr: string | null; conectado: boolean; generacion: number;
  iniciando: Promise<Socket | null> | null; detener: boolean; timer?: ReturnType<typeof setTimeout>; error: string | null;
  colas: Map<string, Promise<void>>; vistos: Set<string>; guardando: Promise<void>;
  esperaQR?: ReturnType<typeof setTimeout>; fallos: number };
const nuevaSesion = (): Sesion => ({ socket: null, qr: null, conectado: false, generacion: 0, iniciando: null, detener: false, error: null, colas: new Map(), vistos: new Set(), guardando: Promise.resolve(), fallos: 0 });
const sesiones = { ventas: nuevaSesion(), cobranza: nuevaSesion() };
export const rutaSesionWhatsApp = (canal: CanalWhatsApp) => resolve('datos', canal === 'ventas' ? 'auth_info_baileys' : 'auth_info_baileys_cobranza');

export function conectarWhatsApp(canal: CanalWhatsApp = 'ventas', reintento = false): Promise<Socket | null> {
  const sesion = sesiones[canal];
  if (sesion.iniciando) return sesion.iniciando;
  if (sesion.socket) return Promise.resolve(sesion.socket);
  clearTimeout(sesion.timer);
  if (!reintento) sesion.fallos = 0;
  sesion.detener = false;
  sesion.error = null;
  const generacion = ++sesion.generacion;
  const tarea = iniciar().catch(error => {
    if (generacion === sesion.generacion) {
      sesion.error = 'No se pudo iniciar WhatsApp. Revisa el acceso a la red y vuelve a intentar.';
      sesion.detener = true;
    }
    throw error;
  });
  sesion.iniciando = tarea;
  void tarea.finally(() => { if (sesion.iniciando === tarea) sesion.iniciando = null; }).catch(() => {});
  return tarea;

  async function iniciar() {
    const { state, saveCreds } = await useMultiFileAuthState(rutaSesionWhatsApp(canal));
    if (generacion !== sesion.generacion || sesion.detener) return null;
    const socket = makeWASocket({ auth: state, printQRInTerminal: false });
    sesion.socket = socket;
    const vigente = () => !sesion.detener && sesion.socket === socket && generacion === sesion.generacion;
    // Una conexion que nunca entrega QR ni abre no debe bloquear la interfaz.
    sesion.esperaQR = setTimeout(() => {
      if (!vigente() || sesion.conectado || sesion.qr) return;
      sesion.error = 'WhatsApp no respondio a tiempo. Revisa la conexion a Internet y vuelve a intentar.';
      sesion.detener = true; sesion.socket = null;
      socket.end(undefined);
    }, 45000);
    sesion.esperaQR.unref();
    socket.ev.on('creds.update', () => {
      if (vigente()) sesion.guardando = sesion.guardando.then(() => saveCreds()).catch(() => { sesion.error = 'No se pudieron guardar las credenciales'; });
    });
    socket.ev.on('connection.update', update => { void (async () => {
      if (!vigente()) return;
      if (update.qr) {
        const qr = await QRCode.toDataURL(update.qr);
        if (vigente()) {
          clearTimeout(sesion.esperaQR);
          sesion.qr = qr; sesion.conectado = false; sesion.error = null; sesion.fallos = 0;
        }
      }
      if (update.connection === 'open') {
        const otro = sesiones[canal === 'ventas' ? 'cobranza' : 'ventas'];
        const numero = jidDecode(socket.user?.id)?.user;
        if (numero && numero === jidDecode(otro.socket?.user?.id)?.user) {
          sesion.error = 'Ventas y cobranza deben usar numeros diferentes';
          void desconectarWhatsApp(canal, false);
          return;
        }
        clearTimeout(sesion.esperaQR);
        sesion.conectado = true; sesion.qr = null; sesion.error = null; sesion.fallos = 0;
      }
      if (update.connection === 'close') {
        clearTimeout(sesion.esperaQR);
        sesion.conectado = false; sesion.qr = null; sesion.socket = null;
        const error = update.lastDisconnect?.error as { message?: string; data?: { code?: string }; code?: string } | undefined;
        const redBloqueada = ['EACCES', 'EPERM'].includes(error?.data?.code ?? error?.code ?? '') || /\b(EACCES|EPERM)\b/.test(error?.message ?? '');
        if (redBloqueada) {
          sesion.detener = true;
          sesion.error = 'El servidor no tiene permiso para conectarse a WhatsApp. No se pudo generar el QR.';
          return;
        }
        const codigo = (update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        if ([DisconnectReason.loggedOut, DisconnectReason.connectionReplaced, DisconnectReason.badSession, DisconnectReason.multideviceMismatch].includes(codigo as number)) {
          sesion.detener = true; sesion.error = 'La sesion fue cerrada. Vincula nuevamente este numero';
          return;
        }
        if (!sesion.detener) {
          sesion.fallos++;
          if (sesion.fallos >= 3) {
            sesion.detener = true; sesion.error = 'No se pudo conectar con WhatsApp tras varios intentos. Vuelve a intentar.';
            return;
          }
          sesion.error = 'La conexion con WhatsApp fallo. Reintentando...';
          sesion.timer = setTimeout(() => { void conectarWhatsApp(canal, true).catch(() => { sesion.error = 'No se pudo reconectar'; }); }, 2500);
          sesion.timer.unref();
        }
      }
    })().catch(() => { sesion.error = 'Error actualizando la conexion'; }); });
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || !vigente()) return;
      for (const mensaje of messages) {
        const jid = mensaje.key.remoteJid;
        if (!jid || mensaje.key.fromMe || !(jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')) || !mensaje.key.id) continue;
        const clave = `${jid}:${mensaje.key.id}`;
        if (sesion.vistos.has(clave)) continue;
        sesion.vistos.add(clave);
        if (sesion.vistos.size > 2000) sesion.vistos.delete(sesion.vistos.values().next().value!);
        const numero = extraerNumeroTelefono(mensaje.key);
        const colaId = numero ?? jid;
        const tareaMensaje = (sesion.colas.get(colaId) ?? Promise.resolve()).catch(() => {}).then(async () => {
          if (!vigente()) return;
          const contenido = mensaje.message?.ephemeralMessage?.message ?? mensaje.message;

          // Detectar audio en ventas
          if (canal === 'ventas' && contenido?.audioMessage) {
            console.log(`🎤 Audio recibido de ${numero || jid}`);
            try {
              const { procesarAudioBaileys } = await import('./procesar-audio-baileys.js');
              await procesarAudioBaileys(socket, jid, mensaje, numero);
            } catch (error) {
              console.error('Error procesando audio:', error);
              await socket.sendMessage(jid, { text: '❌ Hubo un error procesando tu audio. Por favor escribe tu mensaje.' });
            }
            return;
          }

          const texto = contenido?.conversation || contenido?.extendedTextMessage?.text ||
            (canal === 'cobranza' ? contenido?.imageMessage?.caption || contenido?.documentMessage?.caption || (contenido?.audioMessage ? '[Audio recibido: requiere revision del asesor]' : contenido?.imageMessage || contenido?.documentMessage ? '[Adjunto recibido: requiere revision del asesor]' : '') : '');
          if (!texto) return;
          const enviar = async (respuesta: string) => {
            if (!vigente() || !sesion.conectado) throw new Error('La sesion ya no esta conectada');
            await socket.sendMessage(jid, { text: respuesta });
          };
          if (canal === 'cobranza') await procesarMensajeCobranza({ jid, telefono: numero, nombre: mensaje.pushName ?? undefined, externoId: mensaje.key.id!, texto }, enviar, vigente);
          else {
            const respuesta = await procesarMensajeWhatsApp(jid, texto, mensaje.pushName ?? undefined, numero, { externoId: mensaje.key.id! });
            if (respuesta && vigente() && await respuestaVentasPermitida(numero || jid.split('@')[0]!)) await enviar(respuesta);
          }
        }).catch(() => { console.error(`Error procesando mensaje de ${canal}`); });
        sesion.colas.set(colaId, tareaMensaje);
        void tareaMensaje.finally(() => { if (sesion.colas.get(colaId) === tareaMensaje) sesion.colas.delete(colaId); });
      }
    });
    return socket;
  }
}

export function extraerNumeroTelefono(key: WAMessageKey): string | undefined {
  const candidato = isPnUser(key.remoteJid ?? undefined) ? key.remoteJid : key.remoteJidAlt;
  if (!candidato || !isPnUser(candidato)) return undefined;
  return jidDecode(candidato)?.user;
}

export async function enviarMensajeWhatsApp(telefono: string, mensaje: string, canal: CanalWhatsApp = 'ventas') {
  const sesion = sesiones[canal];
  if (!sesion.socket || !sesion.conectado) throw new Error(`WhatsApp de ${canal} no esta conectado`);
  return sesion.socket.sendMessage(telefono.includes('@') ? telefono : `${telefono}@s.whatsapp.net`, { text: mensaje });
}

export async function enviarImagenWhatsApp(telefono: string, urlImagen: string, caption?: string, permitir: () => Promise<boolean> = async () => true) {
  const socket = sesiones.ventas.socket;
  if (!socket || !sesiones.ventas.conectado) throw new Error('WhatsApp de ventas no esta conectado');
  const response = await fetch(urlImagen);
  if (!response.ok) throw new Error(`Error descargando imagen: ${response.status}`);
  const image = Buffer.from(await response.arrayBuffer());
  if (socket !== sesiones.ventas.socket || !await permitir()) return false;
  await socket.sendMessage(telefono.includes('@') ? telefono : `${telefono}@s.whatsapp.net`, { image, caption: caption ?? '' });
  return true;
}

export async function desconectarWhatsApp(canal: CanalWhatsApp = 'ventas', cerrarSesion = true) {
  const sesion = sesiones[canal];
  sesion.detener = true; ++sesion.generacion;
  clearTimeout(sesion.timer);
  clearTimeout(sesion.esperaQR);
  const socket = sesion.socket;
  sesion.socket = null; sesion.qr = null; sesion.conectado = false;
  try {
    if (socket) {
      try { if (cerrarSesion) await socket.logout(); }
      finally { socket.end(undefined); }
    }
  } finally {
    await sesion.iniciando?.catch(() => {});
    await sesion.guardando;
    sesion.iniciando = null;
  }
  if (cerrarSesion) {
    sesion.vistos.clear();
    await rm(rutaSesionWhatsApp(canal), { recursive: true, force: true });
  }
}

export async function limpiarSesionWhatsApp(canal: CanalWhatsApp = 'ventas') {
  await desconectarWhatsApp(canal);
  await rm(rutaSesionWhatsApp(canal), { recursive: true, force: true });
}

export const obtenerQRCode = (canal: CanalWhatsApp = 'ventas') => sesiones[canal].qr;
export function obtenerEstadoConexion(canal: CanalWhatsApp = 'ventas') {
  const sesion = sesiones[canal];
  return { conectado: sesion.conectado, qrCode: sesion.qr, numero: sesion.conectado ? jidDecode(sesion.socket?.user?.id)?.user ?? null : null,
    conectando: Boolean(sesion.iniciando || (sesion.socket && !sesion.conectado)), error: sesion.error };
}
