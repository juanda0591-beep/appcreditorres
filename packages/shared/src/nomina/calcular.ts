import type { Id, Periodo } from '../types/base.js';
import { estaEnPeriodo, periodoDelMes } from '../types/base.js';
import type { Empleado } from '../types/empleado.js';
import type { Municipio } from '../types/municipio.js';
import type { RegistroVenta } from '../types/venta.js';
import type { RegistroCobro } from '../types/cobro.js';
import type { GastoEmpleado } from '../types/gasto.js';
import type { DevolucionVenta } from '../types/devolucion.js';
import type {
  LiquidacionNomina,
  ResumenVentas,
  ResumenCobros,
  ResumenBonos,
  ResumenDeducciones,
  DetalleBono,
} from '../types/nomina.js';
import { aplicarPorcentaje, type Money } from '../money.js';

/** Todo lo que el motor necesita para liquidar. Sin acceso a base de datos. */
export interface EntradaLiquidacion {
  empleado: Empleado;
  periodo: Periodo;
  ventas: readonly RegistroVenta[];
  cobros: readonly RegistroCobro[];
  gastos: readonly GastoEmpleado[];
  devoluciones: readonly DevolucionVenta[];
  /** Municipios indexados por id, para resolver metas y porcentajes de bono. */
  municipios: ReadonlyMap<Id, Municipio>;
  /**
   * Si es false, no se calculan bonos de municipio.
   * El bono se paga una vez al mes: al liquidar la primera quincena se apaga
   * y al cerrar el mes se prende, para no pagarlo dos veces.
   */
  incluirBonos?: boolean;

  /**
   * Cobros del MES completo, para evaluar las metas de municipio.
   *
   * Importante: las metas son mensuales pero la liquidacion es quincenal.
   * Sin esto, alguien que recaude 4.5M y 4.5M en Granada (meta 7M) no
   * alcanzaria la meta en ninguna quincena y perderia el bono, aunque
   * en el mes hizo 9M. Si no se pasa, se usan los cobros del periodo.
   */
  cobrosDelMes?: readonly RegistroCobro[];

  /**
   * Periodo mensual sobre el que se evaluan las metas.
   * Si no se pasa, se deduce del mes de `periodo.hasta`.
   */
  periodoBonos?: Periodo;

  /**
   * Préstamo pendiente y abono a descontar en esta liquidación.
   * Si no se pasa o abonoRealizado es 0, no se descuenta nada.
   */
  prestamo?: {
    saldoPendiente: Money;
    abonoRealizado?: Money;
  };
}

function resumirVentas(
  ventas: readonly RegistroVenta[],
  advertencias: string[],
): ResumenVentas {
  let cantidad = 0;
  let devengado = 0;
  let liquidado = 0;

  for (const venta of ventas) {
    if (venta.cantidad < 0) {
      advertencias.push(`Venta ${venta.id}: cantidad negativa (${venta.cantidad}), se ignoro.`);
      continue;
    }
    if (venta.tarifaLiquidacion > venta.tarifaVenta) {
      advertencias.push(
        `Venta ${venta.id}: la tarifa de liquidacion supera la de venta, generaria ahorro negativo.`,
      );
    }
    cantidad += venta.cantidad;
    devengado += venta.cantidad * venta.tarifaVenta;
    liquidado += venta.cantidad * venta.tarifaLiquidacion;
  }

  return { cantidad, devengado, liquidado, ahorroRetenido: devengado - liquidado };
}

function resumirCobros(cobros: readonly RegistroCobro[]): ResumenCobros {
  let totalRecaudado = 0;
  let comision = 0;

  for (const cobro of cobros) {
    totalRecaudado += cobro.montoRecaudado;
    // La comision se calcula por registro, no sobre el total acumulado,
    // porque cada cobro pudo quedar con un porcentaje distinto.
    comision += aplicarPorcentaje(cobro.montoRecaudado, cobro.porcentajeAplicado);
  }

  return { registros: cobros.length, totalRecaudado, comision };
}

/**
 * Bono por superar la meta de un municipio.
 * Se agrupa el recaudo por municipio y se compara contra la meta acordada.
 */
function calcularBonos(
  cobros: readonly RegistroCobro[],
  municipios: ReadonlyMap<Id, Municipio>,
  advertencias: string[],
): ResumenBonos {
  const recaudoPorMunicipio = new Map<Id, number>();
  for (const cobro of cobros) {
    const acumulado = recaudoPorMunicipio.get(cobro.municipioId) ?? 0;
    recaudoPorMunicipio.set(cobro.municipioId, acumulado + cobro.montoRecaudado);
  }

  const detalles: DetalleBono[] = [];
  let total = 0;

  for (const [municipioId, totalRecaudado] of recaudoPorMunicipio) {
    const municipio = municipios.get(municipioId);
    if (!municipio) {
      advertencias.push(`Municipio ${municipioId} no encontrado: no se calculo su bono.`);
      continue;
    }

    const excedente = totalRecaudado - municipio.metaRecaudo;
    if (excedente <= 0) continue;

    const base = municipio.baseBono === 'total' ? totalRecaudado : excedente;
    const bono = aplicarPorcentaje(base, municipio.porcentajeExcedente);
    if (bono === 0) continue;

    detalles.push({
      municipioId,
      municipioNombre: municipio.nombre,
      totalRecaudado,
      metaRecaudo: municipio.metaRecaudo,
      excedente,
      porcentajeAplicado: municipio.porcentajeExcedente,
      baseBono: municipio.baseBono,
      bono,
    });
    total += bono;
  }

  return { detalles, total };
}

function resumirDeducciones(
  gastos: readonly GastoEmpleado[],
  devoluciones: readonly DevolucionVenta[],
): ResumenDeducciones {
  let registros = 0;
  let total = 0;
  let asumidosPorNegocio = 0;

  for (const gasto of gastos) {
    if (gasto.deducible) {
      registros += 1;
      total += gasto.monto;
    } else {
      asumidosPorNegocio += gasto.monto;
    }
  }

  // Las devoluciones siempre se descuentan (son ventas que regresaron)
  for (const devolucion of devoluciones) {
    registros += 1;
    total += devolucion.cantidad * devolucion.tarifaVenta;
  }

  return { registros, total, asumidosPorNegocio };
}

/**
 * Liquida a un empleado en un periodo.
 *
 * Funcion pura: no toca base de datos ni fechas del sistema. Recibe los datos,
 * devuelve el calculo. Eso la hace facil de probar y de usar tanto en el
 * backend (al guardar) como en el frontend (para previsualizar).
 *
 * Formula:
 *   bruto = (ventas x tarifaLiquidacion) + comision de cobros + bonos
 *   neto  = bruto - gastos deducibles - devoluciones - abono préstamo
 *   ahorro retenido = ventas x (tarifaVenta - tarifaLiquidacion)   [va aparte]
 */
export function calcularLiquidacion(entrada: EntradaLiquidacion): LiquidacionNomina {
  const { empleado, periodo, municipios, incluirBonos = true, prestamo } = entrada;
  const advertencias: string[] = [];

  // El filtro por periodo se hace aqui para que el resultado no dependa
  // de que quien llama haya filtrado bien los registros.
  const enPeriodo = <T extends { fecha: string }>(items: readonly T[]): T[] =>
    items.filter((item) => estaEnPeriodo(item.fecha, periodo));

  const ventasDelPeriodo = enPeriodo(entrada.ventas);
  const cobrosDelPeriodo = enPeriodo(entrada.cobros);
  const gastosDelPeriodo = enPeriodo(entrada.gastos);
  const devolucionesDelPeriodo = enPeriodo(entrada.devoluciones);

  const ventas = resumirVentas(ventasDelPeriodo, advertencias);
  const cobros = resumirCobros(cobrosDelPeriodo);
  const deducciones = resumirDeducciones(gastosDelPeriodo, devolucionesDelPeriodo);

  // Las metas de municipio son mensuales: se evaluan sobre los cobros del mes
  // completo, no solo los de esta quincena.
  const mesBonos = entrada.periodoBonos ?? periodoDelMes(periodo.hasta);
  const cobrosBase = entrada.cobrosDelMes ?? entrada.cobros;
  const cobrosDelMes = cobrosBase.filter((cobro) => estaEnPeriodo(cobro.fecha, mesBonos));

  const bonos = incluirBonos
    ? calcularBonos(cobrosDelMes, municipios, advertencias)
    : { detalles: [], total: 0 };

  // Préstamo: si hay saldo pendiente y se especificó un abono
  const abonoRealizado = prestamo?.abonoRealizado ?? 0;
  const resumenPrestamo =
    prestamo && prestamo.saldoPendiente > 0
      ? {
          saldoPendiente: prestamo.saldoPendiente,
          abonoRealizado,
          saldoDespuesAbono: prestamo.saldoPendiente - abonoRealizado,
        }
      : undefined;

  if (abonoRealizado > 0 && prestamo && abonoRealizado > prestamo.saldoPendiente) {
    advertencias.push(
      `El abono ($${abonoRealizado}) supera el saldo pendiente ($${prestamo.saldoPendiente}).`,
    );
  }

  const totalBruto = ventas.liquidado + cobros.comision + bonos.total;
  const netoAPagar = totalBruto - deducciones.total - abonoRealizado;

  if (netoAPagar < 0) {
    const razon = abonoRealizado > 0 ? 'los gastos y el abono al préstamo' : 'los gastos deducibles';
    advertencias.push(
      `${razon.charAt(0).toUpperCase()}${razon.slice(1)} superan lo ganado: el empleado queda debiendo ${-netoAPagar}.`,
    );
  }

  return {
    empleadoId: empleado.id,
    empleadoNombre: empleado.nombre,
    periodo,
    ventas,
    cobros,
    bonos,
    deducciones,
    prestamo: resumenPrestamo,
    totalBruto,
    netoAPagar,
    ahorroRetenido: ventas.ahorroRetenido,
    quedaSaldoEnContra: netoAPagar < 0,
    advertencias,
  };
}
