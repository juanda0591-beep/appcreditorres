import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  proto
} from '@whiskeysockets/baileys';

type WAMessage = proto.IWebMessageInfo;
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { procesarMensajeWhatsApp } from './procesar-mensaje.js';

let socket: ReturnType<typeof makeWASocket> | null = null;
let qrCodeDataURL: string | null = null;
let isConnected: boolean = false;

/**
 * Conecta a WhatsApp usando Baileys
 */
export async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./datos/auth_info_baileys');

  socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  // Manejar actualización de credenciales
  socket.ev.on('creds.update', saveCreds);

  // Manejar conexión
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Mostrar QR en la terminal y guardar como imagen
    if (qr) {
      console.log('\n📱 Escanea este código QR con WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n');

      // Generar QR como data URL para el frontend
      try {
        qrCodeDataURL = await QRCode.toDataURL(qr);
        isConnected = false;
      } catch (err) {
        console.error('Error generando QR code:', err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      console.info('Conexión cerrada. Reconectando...', shouldReconnect);
      isConnected = false;
      qrCodeDataURL = null;

      if (shouldReconnect) {
        await conectarWhatsApp();
      }
    } else if (connection === 'open') {
      console.info('✅ Conectado a WhatsApp exitosamente');
      isConnected = true;
      qrCodeDataURL = null;
    }
  });

  // Manejar mensajes entrantes
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensajes propios
      if (msg.key.fromMe) continue;

      await manejarMensaje(msg);
    }
  });

  return socket;
}

/**
 * Maneja un mensaje entrante
 */
async function manejarMensaje(mensaje: WAMessage) {
  try {
    const remitente = mensaje.key.remoteJid;
    if (!remitente) return;

    // Extraer texto del mensaje
    const textoMensaje =
      mensaje.message?.conversation ||
      mensaje.message?.extendedTextMessage?.text ||
      '';

    if (!textoMensaje) return;

    console.info('Mensaje recibido', { remitente, texto: textoMensaje });

    // Procesar el mensaje con el agente de IA
    const respuesta = await procesarMensajeWhatsApp(remitente, textoMensaje);

    // Enviar respuesta
    if (respuesta && socket) {
      await socket.sendMessage(remitente, { text: respuesta });
      console.info('Respuesta enviada', { remitente });
    }
  } catch (error) {
    console.error('Error al manejar mensaje', error);
  }
}

/**
 * Envía un mensaje de WhatsApp
 */
export async function enviarMensajeWhatsApp(telefono: string, mensaje: string) {
  if (!socket) {
    throw new Error('WhatsApp no está conectado');
  }

  // Formatear número: agregar @s.whatsapp.net si no lo tiene
  const jid = telefono.includes('@') ? telefono : `${telefono}@s.whatsapp.net`;

  await socket.sendMessage(jid, { text: mensaje });
  console.info('Mensaje enviado', { telefono, mensaje });
}

/**
 * Envía una imagen por WhatsApp con un caption opcional
 */
export async function enviarImagenWhatsApp(telefono: string, urlImagen: string, caption?: string) {
  if (!socket) {
    throw new Error('WhatsApp no está conectado');
  }

  // Formatear número
  const jid = telefono.includes('@') ? telefono : `${telefono}@s.whatsapp.net`;

  try {
    // Descargar la imagen
    const response = await fetch(urlImagen);
    if (!response.ok) {
      throw new Error(`Error al descargar imagen: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Enviar imagen con caption
    await socket.sendMessage(jid, {
      image: buffer,
      caption: caption || ''
    });

    console.info('Imagen enviada', { telefono, urlImagen, caption });
  } catch (error) {
    console.error('Error al enviar imagen:', error);
    throw error;
  }
}


/**
 * Desconecta de WhatsApp
 */
export async function desconectarWhatsApp() {
  if (socket) {
    try {
      await socket.logout();
    } catch (error) {
      console.error('Error al hacer logout:', error);
    }
    socket = null;
  }
  isConnected = false;
  qrCodeDataURL = null;
  console.info('Desconectado de WhatsApp');
}

/**
 * Limpia la sesión de WhatsApp para forzar un nuevo QR
 */
export async function limpiarSesionWhatsApp() {
  await desconectarWhatsApp();

  // Eliminar carpeta de autenticación para forzar nuevo QR
  const { rm } = await import('fs/promises');
  const path = await import('path');
  const authPath = path.join(process.cwd(), 'datos', 'auth_info_baileys');

  try {
    await rm(authPath, { recursive: true, force: true });
    console.info('Sesión de WhatsApp limpiada');
  } catch (error) {
    console.error('Error al limpiar sesión:', error);
  }
}

/**
 * Obtiene el código QR actual como data URL
 */
export function obtenerQRCode(): string | null {
  return qrCodeDataURL;
}

/**
 * Obtiene el estado de la conexión
 */
export function obtenerEstadoConexion(): { conectado: boolean; qrCode: string | null } {
  return {
    conectado: isConnected,
    qrCode: qrCodeDataURL
  };
}
