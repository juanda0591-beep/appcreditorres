import type { FastifyInstance } from 'fastify';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'datos', 'config-ia.json');

interface ConfigIA {
  apiKey: string;
  modelo?: string;
  temperatura?: number;
  maxTokens?: number;
  promptSistema?: string;
}

async function leerConfigIA(): Promise<ConfigIA> {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = await readFile(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error leyendo configuración IA:', error);
  }
  return {
    apiKey: '',
    modelo: 'gpt-4',
    temperatura: 0.7,
    maxTokens: 500,
    promptSistema: `Eres un agente de ventas profesional y amable de una empresa que vende artículos para el hogar a crédito.

Tu trabajo es:
- Asesorar a los clientes sobre productos disponibles (muebles, electrodomésticos, decoración, etc.)
- Explicar las opciones de crédito y planes de pago
- Responder preguntas sobre productos, precios y financiamiento
- Ser persuasivo pero respetuoso
- Mantener un tono cálido y cercano
- Si no tienes información específica, ofrecer que un asesor se comunicará con el cliente

FORMATO DE MENSAJES WHATSAPP:
- Usa *texto en negrita* para resaltar precios, nombres de productos y datos importantes
- Usa emojis relevantes: 🏠 (hogar), 💰 (precios), ✨ (promociones), 📦 (productos), 💳 (crédito), ⏰ (plazos)
- Estructura clara con saltos de línea cuando sea necesario
- Ejemplo: "*ARMARIO VALLUNO* 🏠\n💰 Contado: *$1.000.000*\n💳 Crédito: *$1.500.000*\n📦 Inicial: *$400.000*"

IMPORTANTE: Mantén las respuestas cortas (máximo 3-4 líneas) ya que es por WhatsApp.`
  };
}

async function guardarConfigIA(config: ConfigIA): Promise<void> {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function rutasAdminIA(app: FastifyInstance) {
  // Obtener configuración de IA
  app.get('/admin/ia/config', async (request, reply) => {
    const config = await leerConfigIA();
    // No enviar la API key completa por seguridad
    return {
      ...config,
      apiKey: config.apiKey ? '***' + config.apiKey.slice(-4) : '',
      apiKeyConfigured: !!config.apiKey
    };
  });

  // Verificar estado de conexión con la API de IA
  app.get('/admin/ia/estado', async (request, reply) => {
    const config = await leerConfigIA();

    if (!config.apiKey) {
      return {
        conectado: false,
        mensaje: 'API Key no configurada'
      };
    }

    try {
      // Hacer una petición de prueba a OpenAI
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      });

      if (response.ok) {
        return {
          conectado: true,
          mensaje: 'Conectado a OpenAI',
          modelo: config.modelo || 'gpt-4'
        };
      } else {
        return {
          conectado: false,
          mensaje: `Error: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        conectado: false,
        mensaje: 'Error al conectar con OpenAI'
      };
    }
  });

  // Actualizar configuración de IA
  app.post<{ Body: ConfigIA }>('/admin/ia/config', async (request, reply) => {
    try {
      const config = request.body;

      // Si la API key tiene asteriscos, mantener la existente
      if (config.apiKey && config.apiKey.includes('***')) {
        const configExistente = await leerConfigIA();
        config.apiKey = configExistente.apiKey;
      }

      await guardarConfigIA(config);
      return { success: true, message: 'Configuración actualizada' };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Error al guardar configuración' };
    }
  });

  // Probar configuración de IA
  app.post('/admin/ia/probar', async (request, reply) => {
    try {
      const config = await leerConfigIA();
      if (!config.apiKey) {
        reply.status(400);
        return { success: false, error: 'API key no configurada' };
      }

      // Aquí irá la lógica para probar la conexión con la IA
      return { success: true, message: 'Configuración válida' };
    } catch (error) {
      reply.status(500);
      return { success: false, error: 'Error al probar configuración' };
    }
  });
}

export { leerConfigIA };
