import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import OpenAI from 'openai';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { procesarMensajeWhatsApp } from './procesar-mensaje.js';
import { respuestaVentasPermitida } from './atencion-ventas.js';

/**
 * Procesar audio de Baileys (WhatsApp Web):
 * 1. Descargar el audio del mensaje
 * 2. Transcribirlo con Whisper
 * 3. Generar respuesta con el agente IA
 * 4. Convertir respuesta a audio con TTS
 * 5. Enviar el audio de vuelta al cliente
 */
export async function procesarAudioBaileys(
  socket: WASocket,
  jid: string,
  mensaje: WAMessage,
  telefono?: string,
): Promise<void> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY no configurado');
    await socket.sendMessage(jid, { text: '❌ El servicio de audio no está disponible.' });
    return;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  let archivoAudioDescargado: string | null = null;
  let archivoAudioRespuesta: string | null = null;

  try {
    console.log('📥 Descargando audio...');

    // 1. Descargar el audio desde Baileys
    const buffer = await downloadMediaMessage(mensaje, 'buffer', {});
    if (!buffer) {
      console.error('No se pudo descargar el audio');
      await socket.sendMessage(jid, { text: '❌ No pude descargar el audio.' });
      return;
    }

    // Guardar el buffer como archivo temporal
    archivoAudioDescargado = join(tmpdir(), `baileys-audio-${randomUUID()}.ogg`);
    await writeFile(archivoAudioDescargado, buffer);
    console.log(`✅ Audio descargado: ${archivoAudioDescargado}`);

    // 2. Transcribir con Whisper
    console.log('🎤 Transcribiendo audio...');
    const transcripcion = await transcribirAudio(openai, archivoAudioDescargado);
    console.log(`📝 Transcripción: ${transcripcion}`);

    if (!transcripcion || transcripcion.trim().length === 0) {
      await socket.sendMessage(jid, { text: '❌ No pude entender el audio. ¿Podrías escribirlo?' });
      return;
    }

    // 3. Generar respuesta del agente IA
    console.log('🤖 Generando respuesta...');
    const respuestaTexto = await procesarMensajeWhatsApp(
      jid,
      transcripcion,
      mensaje.pushName ?? undefined,
      telefono,
      { externoId: mensaje.key.id! },
    );

    if (!respuestaTexto) {
      console.log('No hay respuesta del agente');
      return;
    }

    // Verificar si está permitido responder
    if (!await respuestaVentasPermitida(telefono || jid.split('@')[0]!)) {
      console.log('Respuesta no permitida por el modo de atención');
      return;
    }

    console.log(`💬 Respuesta generada: ${respuestaTexto}`);

    // 4. Convertir respuesta a audio con TTS
    console.log('🔊 Generando audio TTS...');
    archivoAudioRespuesta = await generarAudioTTS(openai, respuestaTexto);
    console.log(`✅ Audio TTS generado: ${archivoAudioRespuesta}`);

    // 5. Leer el archivo de audio
    const fs = await import('node:fs/promises');
    const audioBuffer = await fs.readFile(archivoAudioRespuesta);

    // 6. Enviar audio al cliente con formato OGG para mayor compatibilidad
    console.log('📤 Enviando audio...');
    await socket.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true, // Push to talk (nota de voz)
    });

    console.log(`✅ Audio enviado a ${telefono || jid}`);

  } catch (error) {
    console.error('❌ Error procesando audio:', error);
    try {
      await socket.sendMessage(jid, { text: '❌ Hubo un error procesando tu audio. Por favor intenta de nuevo o escribe tu mensaje.' });
    } catch (e) {
      console.error('No se pudo enviar mensaje de error:', e);
    }
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
 * Transcribir audio usando Whisper de OpenAI
 */
async function transcribirAudio(openai: OpenAI, rutaArchivo: string): Promise<string> {
  try {
    const fs = await import('node:fs');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(rutaArchivo),
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
    const rutaArchivo = join(tmpdir(), `baileys-tts-${randomUUID()}.mp3`);
    await writeFile(rutaArchivo, buffer);

    return rutaArchivo;
  } catch (error) {
    console.error('Error generando audio TTS:', error);
    throw error;
  }
}
