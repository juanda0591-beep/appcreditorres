import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const esquemaConfigCobranza = z.object({
  activo: z.boolean(),
  apiKey: z.string().max(500),
  modelo: z.string().trim().min(1).max(100),
  temperatura: z.number().min(0).max(2),
  maxTokens: z.number().int().min(64).max(2000),
  promptSistema: z.string().trim().min(20).max(12000),
});
export type ConfigAgenteCobranza = z.infer<typeof esquemaConfigCobranza>;
export const configCobranzaDefecto: ConfigAgenteCobranza = {
  activo: false, apiKey: '', modelo: 'gpt-4o-mini', temperatura: 0.4, maxTokens: 400,
  promptSistema: 'Eres el asistente de cobranza de Creditorres en Colombia. Ayuda con seguimientos, promesas de pago y actualizacion de ubicacion. Se amable, claro y respetuoso. Responde en pocas lineas. Si el cliente menciona un pago, una promesa o una nueva direccion, recopila los datos y aclara que el gestor debe revisarlos. No ofrezcas productos ni tramites ventas. No inventes saldos, cuentas bancarias, descuentos o consecuencias legales. No confirmes pagos ni cumplimiento de promesas: los saldos se actualizan desde el sistema externo mediante Excel.',
};
const rutaConfig = () => process.env.CRM_IA_CONFIG_PATH ?? resolve('datos/config-agente-cobranza.json');
export async function leerConfigAgenteCobranza(): Promise<ConfigAgenteCobranza> {
  try {
    return esquemaConfigCobranza.parse({ ...configCobranzaDefecto, ...JSON.parse(await readFile(rutaConfig(), 'utf8')) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...configCobranzaDefecto };
    throw new Error('No se pudo leer la configuracion del agente de cobranza');
  }
}
let escritura = Promise.resolve();
export function guardarConfigAgenteCobranza(datos: ConfigAgenteCobranza): Promise<void> {
  const operacion = escritura.catch(() => {}).then(async () => {
    const actual = await leerConfigAgenteCobranza();
    const config = esquemaConfigCobranza.parse(datos);
    if (config.apiKey.startsWith('***')) config.apiKey = actual.apiKey;
    const archivo = rutaConfig();
    await mkdir(dirname(archivo), { recursive: true });
    const temporal = `${archivo}.${randomUUID()}.tmp`;
    await writeFile(temporal, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporal, archivo);
  });
  escritura = operacion;
  return operacion;
}
