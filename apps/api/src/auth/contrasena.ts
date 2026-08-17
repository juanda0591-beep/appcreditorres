import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Hashea una contraseña usando scrypt.
 * Genera una sal aleatoria y devuelve el formato "scrypt$sal$hash".
 */
export async function hashearContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(contrasena, sal, 64)) as Buffer;
  return `scrypt$${sal}$${hash.toString('hex')}`;
}

/**
 * Verifica si una contraseña coincide con su hash.
 * Usa comparación de tiempo constante para prevenir ataques de timing.
 */
export async function verificarContrasena(
  contrasena: string,
  hashAlmacenado: string,
): Promise<boolean> {
  const [algoritmo, sal, hashHex] = hashAlmacenado.split('$');

  if (algoritmo !== 'scrypt' || !sal || !hashHex) {
    return false;
  }

  const hashBuffer = Buffer.from(hashHex, 'hex');
  const hashCalculado = (await scryptAsync(contrasena, sal, 64)) as Buffer;

  return timingSafeEqual(hashBuffer, hashCalculado);
}
