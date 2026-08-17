import 'dotenv/config';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Configuracion del servidor leida del entorno.
 * Los valores por defecto sirven para desarrollo local.
 */

function leerNumero(valor: string | undefined, porDefecto: number): number {
  if (!valor) return porDefecto;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : porDefecto;
}

/** Origenes permitidos para CORS, separados por coma. */
function leerOrigenes(valor: string | undefined): string[] {
  if (!valor) return ['http://localhost:5173'];
  return valor.split(',').map((origen) => origen.trim()).filter(Boolean);
}

/**
 * Secreto para firmar cookies.
 *
 * En produccion se exige que venga del entorno y falla el arranque si no esta.
 * Es preferible que el servidor no inicie a que arranque con un secreto
 * generado al azar que invalida las sesiones en cada reinicio sin explicacion.
 */
function leerSecreto(): string {
  const secreto = process.env.SECRETO_COOKIES;
  const enProduccion = (process.env.NODE_ENV ?? 'development') === 'production';

  if (secreto && secreto.length >= 32) return secreto;

  if (enProduccion) {
    throw new Error(
      'Falta SECRETO_COOKIES en el .env (minimo 32 caracteres). ' +
        'Generalo con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  if (secreto) {
    console.warn('SECRETO_COOKIES es muy corto (minimo 32 caracteres). Usando uno temporal.');
  }

  return randomBytes(32).toString('hex');
}

export const config = {
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: leerNumero(process.env.PORT, 3000),
  host: process.env.HOST ?? '127.0.0.1',

  /** Archivo de la base de datos. Se resuelve contra la raiz de apps/api. */
  rutaBaseDatos: resolve(process.env.DB_RUTA ?? './datos/credito.db'),

  /**
   * URL que espera libSQL. Para un archivo local lleva el prefijo "file:".
   * Si algun dia se usa Turso, aqui iria la URL remota (libsql://...).
   */
  get urlBaseDatos(): string {
    const remota = process.env.DB_URL;
    if (remota) return remota;
    return `file:${resolve(process.env.DB_RUTA ?? './datos/credito.db')}`;
  },

  origenesPermitidos: leerOrigenes(process.env.CORS_ORIGENES),

  /**
   * Secreto con el que se firman las cookies de sesion.
   *
   * En produccion es OBLIGATORIO ponerlo en el .env: si cambia, todas las
   * sesiones abiertas se invalidan, y si alguien lo conoce puede falsificar
   * cookies. En desarrollo se genera uno al azar en cada arranque, lo que
   * significa que reiniciar el servidor cierra la sesion (molesto pero seguro).
   */
  secretoCookies: leerSecreto(),

  /** Carpeta donde se guardan las fotos de productos ya procesadas. */
  carpetaImagenes: resolve(process.env.CARPETA_IMAGENES ?? './datos/imagenes'),

  /** Prefijo con el que se sirven las imagenes. */
  rutaPublicaImagenes: '/imagenes',

  /**
   * Tamano maximo por foto. 12 MB cubre de sobra una foto de celular moderno;
   * el servidor la reduce despues a unos pocos cientos de KB.
   */
  maxBytesImagen: leerNumero(process.env.MAX_BYTES_IMAGEN, 12 * 1024 * 1024),

  /**
   * Intentos de ingreso permitidos por IP cada 5 minutos.
   *
   * En las pruebas se sube: varios tests entran y salen muchas veces desde la
   * misma IP simulada, y con el limite real se bloquearian entre ellos. El
   * bloqueo se verifica en su propio test bajandolo a proposito.
   */
  maxIntentosEntrar: leerNumero(
    process.env.MAX_INTENTOS_ENTRAR,
    (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') ? 10_000 : 30,
  ),

  /**
   * URL publica del sitio, para armar el enlace que se comparte por WhatsApp
   * y las etiquetas de vista previa. En el VPS debe ser el dominio real.
   */
  urlPublica: (process.env.URL_PUBLICA ?? 'http://localhost:3000').replace(/\/$/, ''),

  get esProduccion(): boolean {
    return this.entorno === 'production';
  },

  get esPrueba(): boolean {
    return this.entorno === 'test' || process.env.VITEST === 'true';
  },
} as const;
