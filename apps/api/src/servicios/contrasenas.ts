import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt) as (
  contrasena: string,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * Hash de contrasenas con scrypt.
 *
 * Se usa scrypt (viene en Node) y no bcrypt ni argon2 porque esos necesitan
 * compilar binarios nativos, y en este proyecto eso ya fallo una vez con
 * better-sqlite3 en Windows. scrypt es de la misma familia: lento a proposito
 * y resistente a ataques con hardware dedicado.
 *
 * NUNCA se guarda la contrasena en texto plano ni un hash simple tipo SHA-256:
 * esos se rompen con tablas precalculadas en minutos.
 */

/**
 * Costo del hash. N=16384 tarda unos 50-100ms por intento, que es imperceptible
 * al entrar pero hace inviable probar millones de contrasenas.
 */
const PARAMETROS = { N: 16_384, r: 8, p: 1 };
const LARGO_HASH = 64;
const LARGO_SAL = 16;

/** Contrasena minima. Corta de mas es la puerta mas facil de forzar. */
export const LARGO_MINIMO_CONTRASENA = 8;

/**
 * Genera el hash. El resultado incluye la sal, asi que se guarda en un solo
 * campo y no hace falta otra columna.
 *
 * Formato: "scrypt$<sal en hex>$<hash en hex>"
 */
export async function hashearContrasena(contrasena: string): Promise<string> {
  // Sal aleatoria por usuario: dos personas con la misma contrasena tienen
  // hashes distintos, asi que romper uno no revela el otro.
  const sal = randomBytes(LARGO_SAL);
  const hash = await derivar(contrasena, sal, LARGO_HASH, PARAMETROS);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifica una contrasena contra su hash.
 *
 * Usa timingSafeEqual y no === porque comparar cadenas normalmente termina
 * en el primer caracter distinto. Midiendo cuanto tarda la respuesta se puede
 * ir adivinando el hash caracter por caracter. timingSafeEqual siempre tarda
 * lo mismo.
 */
export async function verificarContrasena(
  contrasena: string,
  guardado: string,
): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

  const [, salHex, hashHex] = partes;
  if (!salHex || !hashHex) return false;

  try {
    const sal = Buffer.from(salHex, 'hex');
    const esperado = Buffer.from(hashHex, 'hex');
    const calculado = await derivar(contrasena, sal, esperado.length, PARAMETROS);

    // Distinto largo significa hash corrupto: timingSafeEqual lanzaria.
    if (calculado.length !== esperado.length) return false;

    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/** Token de sesion: 32 bytes aleatorios, imposible de adivinar. */
export function generarTokenSesion(): string {
  return randomBytes(32).toString('base64url');
}
