import OpenAI from 'openai';

// Inicializar cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Mensaje {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProductoContexto {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  precioPromocion?: number;
  enPromocion: boolean;
  stock?: number;
  imagenUrl?: string;
}

/**
 * Genera una respuesta del agente IA usando OpenAI
 */
export async function generarRespuestaIA(
  mensajeUsuario: string,
  productos: ProductoContexto[],
  historial: Mensaje[] = [],
): Promise<string> {
  // Contexto del sistema con información de productos
  const contextoProductos = productos
    .map(
      (p) =>
        `- ${p.nombre}: ${p.descripcion}. Precio: $${p.precio}${
          p.enPromocion ? ` (Promoción: $${p.precioPromocion})` : ''
        }${p.stock !== undefined ? ` - Stock: ${p.stock}` : ''}`,
    )
    .join('\n');

  const mensajeSistema: Mensaje = {
    role: 'system',
    content: `Eres un asistente virtual de ventas para "Control de Dinero", una empresa de crédito y productos.

Tu objetivo es:
1. Ayudar a los clientes a encontrar productos
2. Responder preguntas sobre precios, promociones y disponibilidad
3. Tomar pedidos y confirmar información
4. Ser amable, profesional y usar un tono conversacional en español

Productos disponibles:
${contextoProductos || 'No hay productos en el catálogo actualmente.'}

Reglas:
- Siempre responde en español
- Sé conciso pero amable
- Si no tienes información específica, ofrece alternativas
- Sugiere productos relacionados cuando sea relevante
- Para hacer un pedido, solicita: nombre completo, dirección y teléfono
- Usa emojis ocasionalmente para ser más cercano (📦 🎁 💳)`,
  };

  const mensajes: Mensaje[] = [
    mensajeSistema,
    ...historial,
    { role: 'user', content: mensajeUsuario },
  ];

  try {
    const respuesta = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Más económico y rápido
      messages: mensajes,
      temperature: 0.7,
      max_tokens: 500,
    });

    return respuesta.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
  } catch (error) {
    console.error('Error al consultar OpenAI:', error);
    throw new Error('Error al generar respuesta del asistente');
  }
}

/**
 * Busca productos relevantes basándose en el mensaje del usuario
 */
export function buscarProductosRelevantes(
  mensaje: string,
  todosLosProductos: ProductoContexto[],
): ProductoContexto[] {
  const palabrasClave = mensaje
    .toLowerCase()
    .split(' ')
    .filter((p) => p.length > 3);

  if (palabrasClave.length === 0) {
    // Si no hay palabras clave, devolver productos en promoción o primeros 5
    return todosLosProductos.filter((p) => p.enPromocion).slice(0, 5);
  }

  // Buscar productos que coincidan con las palabras clave
  const productosRelevantes = todosLosProductos.filter((producto) => {
    const textoProducto = `${producto.nombre} ${producto.descripcion}`.toLowerCase();
    return palabrasClave.some((palabra) => textoProducto.includes(palabra));
  });

  // Si no hay coincidencias, devolver productos destacados
  if (productosRelevantes.length === 0) {
    return todosLosProductos.slice(0, 5);
  }

  return productosRelevantes.slice(0, 5);
}
