/**
 * Reemplaza variables en el cuerpo de una plantilla con datos reales del cliente.
 *
 * Variables soportadas:
 * - {{cliente}} - Nombre del cliente
 * - {{numero}} - Número del crédito
 * - {{saldo}} - Saldo formateado en pesos colombianos
 * - {{cuota}} - Cuota formateada en pesos colombianos
 * - {{diasMora}} - Días de mora
 * - {{articulo}} - Artículo financiado
 * - {{vendedor}} - Nombre del vendedor
 */
export function reemplazarVariablesPlantilla(
  cuerpo: string,
  cliente: {
    cliente: string;
    numero: string;
    saldo: number;
    montoCuota: number;
    diasMora: number;
    articulo: string;
    vendedor: string;
  }
): string {
  const formatearPesos = (valor: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  };

  return cuerpo
    .replace(/\{\{cliente\}\}/g, cliente.cliente)
    .replace(/\{\{numero\}\}/g, cliente.numero)
    .replace(/\{\{saldo\}\}/g, formatearPesos(cliente.saldo))
    .replace(/\{\{cuota\}\}/g, formatearPesos(cliente.montoCuota))
    .replace(/\{\{diasMora\}\}/g, String(cliente.diasMora))
    .replace(/\{\{articulo\}\}/g, cliente.articulo)
    .replace(/\{\{vendedor\}\}/g, cliente.vendedor);
}
