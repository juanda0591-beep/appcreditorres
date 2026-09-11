import OpenAI from 'openai';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Procesar mensaje de audio de WhatsApp:
 * 1. Descargar el audio desde WhatsApp
 * 2. Transcribirlo con Whisper
 * 3. Generar respuesta con el agente IA
 * 4. Convertir respuesta a audio con TTS
 * 5. Enviar el audio de vuelta al cliente
 */
export async function procesarAudioWhatsApp(
  telefono: string,
  audioId: string,
  mensajeId: string,
): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!WHATSAPP_TOKEN || !OPENAI_API_KEY) {
    console.error('WHATSAPP_TOKEN o OPENAI_API_KEY no configurados');
    return;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  let archivoAudioDescargado: string | null = null;
  let archivoAudioRespuesta: string | null = null;

  try {
    // 1. Obtener URL del audio desde WhatsApp
    const urlAudio = await obtenerUrlAudio(audioId, WHATSAPP_TOKEN);
    if (!urlAudio) {
      console.error('No se pudo obtener la URL del audio');
      return;
    }

    // 2. Descargar el audio
    archivoAudioDescargado = await descargarAudio(urlAudio, WHATSAPP_TOKEN);
    console.log(`Audio descargado: ${archivoAudioDescargado}`);

    // 3. Transcribir con Whisper
    const transcripcion = await transcribirAudio(openai, archivoAudioDescargado);
    console.log(`Transcripción: ${transcripcion}`);

    if (!transcripcion || transcripcion.trim().length === 0) {
      await enviarMensajeWhatsApp(telefono, '❌ No pude entender el audio. ¿Podrías escribirlo?');
      return;
    }

    // 4. Generar respuesta del agente IA
    const { procesarMensajeWhatsApp } = await import('./procesar-mensaje.js');
    const respuestaTexto = await procesarMensajeWhatsApp(
      telefono,
      transcripcion,
      undefined,
      telefono,
      { externoId: mensajeId, transporte: 'cloud' },
    );

    if (!respuestaTexto) {
      console.log('No hay respuesta del agente');
      return;
    }

    console.log(`Respuesta generada: ${respuestaTexto}`);

    // 5. Convertir respuesta a audio con TTS
    archivoAudioRespuesta = await generarAudioTTS(openai, respuestaTexto);
    console.log(`Audio TTS generado: ${archivoAudioRespuesta}`);

    // 6. Enviar audio al cliente
    await enviarAudioWhatsApp(telefono, archivoAudioRespuesta);
    console.log(`Audio enviado a ${telefono}`);

  } catch (error) {
    console.error('Error procesando audio:', error);
    await enviarMensajeWhatsApp(telefono, '❌ Hubo un error procesando tu audio. Por favor intenta de nuevo.');
  } finally {
    // Limpiar archivos temporales
    if (archivoAudioDescargado) {
      try {
        await unlink(archivoAudioDescargado);
      } catch (e) {
        console.error('Error eliminando archivo de audio descargado:', e);
      }
    }
    if (archivoAudioRespuesta) {
      try {
        await unlink(archivoAudioRespuesta);
      } catch (e) {
        console.error('Error eliminando archivo de audio de respuesta:', e);
      }
    }
  }
}

/**
 * Obtener URL del archivo de audio desde WhatsApp
 */
async function obtenerUrlAudio(audioId: string, token: string): Promise<string | null> {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${audioId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error('Error obteniendo URL del audio:', await response.text());
      return null;
    }

    const data = await response.json() as { url?: string };
    return data.url || null;
  } catch (error) {
    console.error('Error en obtenerUrlAudio:', error);
    return null;
  }
}

/**
 * Descargar archivo de audio desde WhatsApp
 */
async function descargarAudio(url: string, token: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Error descargando audio: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const rutaArchivo = join(tmpdir(), `whatsapp-audio-${randomUUID()}.ogg`);
  await writeFile(rutaArchivo, buffer);

  return rutaArchivo;
}

/**
 * Transcribir audio usando Whisper de OpenAI
 */
async function transcribirAudio(openai: OpenAI, rutaArchivo: string): Promise<string> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: await (async () => {
        const fs = await import('node:fs');
        return fs.createReadStream(rutaArchivo);
      })(),
      model: 'whisper-1',
      language: 'es',
    });

    return transcription.text;
  } catch (error) {
    console.error('Error transcribiendo audio:', error);
    throw error;
  }
}

/**
 * Generar audio con Text-to-Speech de OpenAI
 */
async function generarAudioTTS(openai: OpenAI, texto: string): Promise<string> {
  try {
    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1', // Modelo más rápido y económico
      voice: 'nova', // Voz femenina en español (opciones: alloy, echo, fable, onyx, nova, shimmer)
      input: texto,
      speed: 1.0,
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    const rutaArchivo = join(tmpdir(), `whatsapp-tts-${randomUUID()}.mp3`);
    await writeFile(rutaArchivo, buffer);

    return rutaArchivo;
  } catch (error) {
    console.error('Error generando audio TTS:', error);
    throw error;
  }
}

/**
 * Enviar mensaje de texto a WhatsApp
 */
async function enviarMensajeWhatsApp(telefono: string, mensaje: string): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado');
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefono,
          type: 'text',
          text: { body: mensaje },
        }),
      },
    );

    if (!response.ok) {
      console.error('Error enviando mensaje:', await response.text());
    }
  } catch (error) {
    console.error('Error en enviarMensajeWhatsApp:', error);
  }
}

/**
 * Enviar audio a WhatsApp
 */
async function enviarAudioWhatsApp(telefono: string, rutaArchivo: string): Promise<void> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado');
    return;
  }

  try {
    const fs = await import('node:fs');
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    // Primero subir el archivo a WhatsApp
    form.append('file', fs.createReadStream(rutaArchivo));
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'audio/mpeg');

    const uploadResponse = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          ...form.getHeaders(),
        },
        body: form as any,
      },
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Error subiendo audio: ${error}`);
    }

    const uploadData = await uploadResponse.json() as { id?: string };
    const mediaId = uploadData.id;

    if (!mediaId) {
      throw new Error('No se obtuvo ID del medio subido');
    }

    // Luego enviar el mensaje con el audio
    const sendResponse = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefono,
          type: 'audio',
          audio: { id: mediaId },
        }),
      },
    );

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      throw new Error(`Error enviando mensaje de audio: ${error}`);
    }

    console.log('Audio enviado exitosamente');
  } catch (error) {
    console.error('Error en enviarAudioWhatsApp:', error);
    throw error;
  }
}
