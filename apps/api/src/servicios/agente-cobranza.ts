import { leerConfigIA } from '../rutas/admin-ia.js';

interface ClienteCartera {
  cliente: string;
  numero: string;
  saldo: number;
  abono: number;
  diasMora: number;
  montoCuota: number;
  articulo: string;
  periodosPago: string;
  ultimaFechaAbono: string | null;
  estado: string;
  vendedor: string;
}

interface Gestion {
  fechaGestion: string;
  tipoGestion: string;
  resultado: string;
  notas: string | null;
}

interface Pago {
  fechaPago: string;
  monto: number;
}

interface AnalisisCartera {
  probabilidadPago: number; // 0-1
  riesgoMorosidad: 'bajo' | 'medio' | 'alto' | 'critico';
  accionSugerida: string;
  razonamiento: string;
  confianza: number; // 0-1
}

/**
 * Analiza un cliente de cartera usando IA y devuelve predicciones y sugerencias.
 */
export async function analizarClienteCartera(
  cliente: ClienteCartera,
  gestiones: Gestion[],
  pagos: Pago[]
): Promise<AnalisisCartera> {
  const config = await leerConfigIA();

  if (!config.apiKey) {
    throw new Error('API key de IA no configurada');
  }

  // Construir contexto para el modelo
  const resumenGestiones = gestiones.slice(0, 5).map(g =>
    `${g.fechaGestion}: ${g.tipoGestion} - ${g.resultado}${g.notas ? ` (${g.notas})` : ''}`
  ).join('\n');

  const resumenPagos = pagos.slice(0, 5).map(p =>
    `${p.fechaPago}: $${p.monto.toLocaleString()}`
  ).join('\n');

  const promptSistema = `Eres un analista experto en cobranza y gestión de cartera.

Analiza al cliente y devuelve un JSON con:
- probabilidadPago: número entre 0 y 1 (0 = no pagará, 1 = pagará pronto)
- riesgoMorosidad: "bajo", "medio", "alto" o "critico"
- accionSugerida: acción específica que el cobrador debe tomar
- razonamiento: explicación breve de tu análisis
- confianza: número entre 0 y 1 de qué tan seguro estás

Considera:
- Días de mora y tendencia
- Historial de gestiones (si responde, si cumple promesas)
- Historial de pagos (regularidad, montos)
- Saldo vs abono (qué tanto ha pagado)

Responde SOLO con el JSON, sin texto adicional.`;

  const promptUsuario = `Cliente: ${cliente.cliente}
Crédito: #${cliente.numero}
Artículo: ${cliente.articulo}
Vendedor: ${cliente.vendedor}

Financiero:
- Saldo actual: $${cliente.saldo.toLocaleString()}
- Abonado: $${cliente.abono.toLocaleString()}
- Cuota ${cliente.periodosPago}: $${cliente.montoCuota.toLocaleString()}
- Días de mora: ${cliente.diasMora}
- Último abono: ${cliente.ultimaFechaAbono || 'Nunca'}
- Estado: ${cliente.estado}

Últimas gestiones:
${resumenGestiones || 'Sin gestiones registradas'}

Últimos pagos:
${resumenPagos || 'Sin pagos registrados'}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelo || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: promptUsuario },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error de OpenAI: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const contenido = data.choices[0]?.message?.content;

  if (!contenido) {
    throw new Error('No se recibió respuesta de la IA');
  }

  const analisis = JSON.parse(contenido);

  return {
    probabilidadPago: analisis.probabilidadPago,
    riesgoMorosidad: analisis.riesgoMorosidad,
    accionSugerida: analisis.accionSugerida,
    razonamiento: analisis.razonamiento,
    confianza: analisis.confianza,
  };
}

/**
 * Genera un mensaje de WhatsApp personalizado para cobranza usando IA.
 */
export async function redactarMensajeCobranza(
  cliente: ClienteCartera,
  gestiones: Gestion[],
  tono: 'amable' | 'firme' | 'urgente' = 'amable'
): Promise<string> {
  const config = await leerConfigIA();

  if (!config.apiKey) {
    throw new Error('API key de IA no configurada');
  }

  const resumenGestiones = gestiones.slice(0, 3).map(g =>
    `${g.fechaGestion}: ${g.tipoGestion} - ${g.resultado}`
  ).join('\n');

  const tonoDescripcion = {
    amable: 'amable y empático, buscando colaboración',
    firme: 'profesional pero directo, enfatizando la urgencia',
    urgente: 'serio y formal, dejando claro que es crítico actuar ya',
  };

  const promptSistema = `Eres un experto en redacción de mensajes de cobranza por WhatsApp en Colombia.

Redacta un mensaje ${tonoDescripcion[tono]} para recordarle al cliente su deuda.

Requisitos:
- Máximo 3-4 líneas (formato WhatsApp)
- Menciona el crédito, saldo y días de mora
- Tono ${tono}
- Lenguaje natural colombiano
- Si hay gestiones previas sin respuesta, ajusta el mensaje
- Si prometió pagar y no lo hizo, mencionarlo sutilmente
- Termina con una llamada a acción clara

Responde SOLO con el mensaje, sin comillas ni explicaciones.`;

  const promptUsuario = `Cliente: ${cliente.cliente}
Crédito #${cliente.numero}
Saldo: $${cliente.saldo.toLocaleString()}
Días de mora: ${cliente.diasMora}
Cuota ${cliente.periodosPago}: $${cliente.montoCuota.toLocaleString()}

Últimas gestiones:
${resumenGestiones || 'Sin gestiones previas'}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelo || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: promptUsuario },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error de OpenAI: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const mensaje = data.choices[0]?.message?.content;

  if (!mensaje) {
    throw new Error('No se recibió respuesta de la IA');
  }

  return mensaje.trim();
}

/**
 * Analiza el sentimiento y prioridad de una nota de gestión.
 */
export async function analizarGestion(notas: string): Promise<{
  sentimientoIA: 'positivo' | 'neutro' | 'negativo';
  prioridadIA: number; // 1-5
}> {
  const config = await leerConfigIA();

  if (!config.apiKey) {
    throw new Error('API key de IA no configurada');
  }

  const promptSistema = `Analiza esta nota de gestión de cobro y devuelve un JSON con:
- sentimientoIA: "positivo", "neutro" o "negativo"
- prioridadIA: número del 1 al 5 (1=baja urgencia, 5=crítica)

Responde SOLO con el JSON.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelo || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: notas },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error de OpenAI: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const contenido = data.choices[0]?.message?.content;

  if (!contenido) {
    throw new Error('No se recibió respuesta de la IA');
  }

  const analisis = JSON.parse(contenido);

  return {
    sentimientoIA: analisis.sentimientoIA,
    prioridadIA: analisis.prioridadIA,
  };
}
