/**
 * Manejo de dinero en pesos colombianos (COP).
 *
 * REGLA DEL PROYECTO: todo monto se guarda como ENTERO de pesos.
 * Nunca usamos decimales para dinero porque los flotantes de JavaScript
 * pierden precision (0.1 + 0.2 !== 0.3) y en nomina eso se convierte
 * en centavos que no cuadran al final del mes.
 *
 * El COP no se usa con centavos en la practica, asi que 1 unidad = $1.
 */

/** Monto entero en pesos colombianos. */
export type Money = number;

/** Porcentaje expresado en forma humana: 10 significa 10%, 2.5 significa 2.5%. */
export type Percent = number;

export function esMontoValido(valor: unknown): valor is Money {
  return typeof valor === 'number' && Number.isSafeInteger(valor);
}

/** Valida que un monto sea entero y no negativo. Lanza error si no lo es. */
export function exigirMontoNoNegativo(valor: number, campo: string): Money {
  if (!Number.isFinite(valor)) {
    throw new Error(`${campo}: debe ser un numero, se recibio ${valor}`);
  }
  if (!Number.isInteger(valor)) {
    throw new Error(`${campo}: los montos en pesos deben ser enteros, se recibio ${valor}`);
  }
  if (valor < 0) {
    throw new Error(`${campo}: no puede ser negativo, se recibio ${valor}`);
  }
  return valor;
}

/**
 * Aplica un porcentaje a un monto y redondea al peso mas cercano.
 * Ejemplo: aplicarPorcentaje(2_000_000, 10) === 200_000
 */
export function aplicarPorcentaje(base: Money, porcentaje: Percent): Money {
  if (!Number.isFinite(porcentaje)) {
    throw new Error(`Porcentaje invalido: ${porcentaje}`);
  }
  return Math.round((base * porcentaje) / 100);
}

/** Suma una lista de montos. Devuelve 0 si la lista esta vacia. */
export function sumar(montos: readonly Money[]): Money {
  return montos.reduce((total, monto) => total + monto, 0);
}

const formateadorCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Formatea para mostrar en pantalla: 60000 -> "$ 60.000" */
export function formatearPesos(monto: Money): string {
  return formateadorCOP.format(monto);
}
