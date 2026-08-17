import { formatearPesos, type Money } from '../money.js';
import type { LiquidacionNomina, ReporteNomina } from '../types/nomina.js';
import type { RegistroVenta } from '../types/venta.js';
import type { RegistroCobro } from '../types/cobro.js';
import { comisionDeCobro } from '../types/cobro.js';
import type { GastoEmpleado } from '../types/gasto.js';

/** Datos del negocio que encabezan el comprobante. */
export interface EncabezadoComprobante {
  nombreNegocio: string;
  /** Texto libre opcional: NIT, direccion, telefono. */
  detalle?: string | null;
}

/** Fecha larga en espanol, para el cuerpo del comprobante. */
export function fechaLarga(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  if (!ano || !mes || !dia) return iso;
  return `${dia} de ${meses[mes - 1]} de ${ano}`;
}

/** "1 al 15 de agosto de 2026" o el rango completo si cruza meses. */
export function describirPeriodoLargo(desde: string, hasta: string): string {
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  if (!mismoMes) return `${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
  return `${Number(desde.slice(8, 10))} al ${fechaLarga(hasta)}`;
}

/** Fecha corta para el PDF: "10 ago" */
export function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (!mes || !dia) return iso;
  return `${dia} ${meses[mes - 1]}`;
}

/**
 * Numero corto y legible del comprobante, derivado del id.
 *
 * El id es un UUID: sirve para la base de datos pero nadie lo puede dictar por
 * telefono. Este numero se muestra en el PDF y en el mensaje para que empleado
 * y administrador puedan referirse al mismo pago.
 */
export function numeroComprobante(id: string, periodoHasta: string): string {
  const corto = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${periodoHasta.slice(0, 4)}${periodoHasta.slice(5, 7)}-${corto}`;
}

/**
 * Mensaje de WhatsApp que acompana al comprobante.
 *
 * Es un RESUMEN, no un enlace. Decision deliberada: publicar un enlace con el
 * detalle del pago dejaria salarios accesibles a cualquiera que tenga la URL.
 * El detalle completo viaja en el PDF adjunto, que solo recibe quien esta en
 * la conversacion.
 */
export function mensajeComprobante(
  liquidacion: LiquidacionNomina,
  opciones: { numero: string; nombreNegocio: string },
): string {
  const lineas: string[] = [
    `*${opciones.nombreNegocio}*`,
    `Comprobante de pago ${opciones.numero}`,
    '',
    `${liquidacion.empleadoNombre}`,
    `Periodo: ${describirPeriodoLargo(liquidacion.periodo.desde, liquidacion.periodo.hasta)}`,
    '',
  ];

  if (liquidacion.ventas.cantidad > 0) {
    lineas.push(
      `Ventas: ${liquidacion.ventas.cantidad} = ${formatearPesos(liquidacion.ventas.liquidado)}`,
    );
  }
  if (liquidacion.cobros.comision > 0) {
    lineas.push(`Comision de cobros: ${formatearPesos(liquidacion.cobros.comision)}`);
  }
  if (liquidacion.bonos.total > 0) {
    lineas.push(`Bono por metas: ${formatearPesos(liquidacion.bonos.total)}`);
  }
  if (liquidacion.deducciones.total > 0) {
    lineas.push(`Gastos descontados: -${formatearPesos(liquidacion.deducciones.total)}`);
  }

  lineas.push('', `*Total pagado: ${formatearPesos(liquidacion.netoAPagar)}*`);

  if (liquidacion.ahorroRetenido > 0) {
    lineas.push(
      '',
      `Ahorro acumulado en este periodo: ${formatearPesos(liquidacion.ahorroRetenido)}`,
      '(se entrega cada 3 meses, no entra en este pago)',
    );
  }

  return lineas.join('\n');
}

/**
 * Mensaje de WhatsApp del reporte de nomina.
 *
 * Igual que el comprobante individual, es un resumen y no lleva enlace: el
 * detalle completo va en el PDF adjunto. Lista a cada empleado con su neto a
 * pagar y cierra con el total, para que quien lo recibe pueda ver de un
 * vistazo cuanto hay que alistar antes de liquidar.
 */
export function mensajeReporte(
  reporte: ReporteNomina,
  opciones: { nombreNegocio: string },
): string {
  const lineas: string[] = [
    `*${opciones.nombreNegocio}*`,
    `Reporte de nomina: ${describirPeriodoLargo(reporte.periodo.desde, reporte.periodo.hasta)}`,
    '',
  ];

  const total = reporte.empleados.reduce((suma, l) => suma + l.netoAPagar, 0);

  for (const liquidacion of reporte.empleados) {
    lineas.push(`${liquidacion.empleadoNombre}: ${formatearPesos(liquidacion.netoAPagar)}`);
  }

  lineas.push('', `*Total: ${formatearPesos(total)}*`);

  return lineas.join('\n');
}

/** Nombre de archivo del PDF del reporte, sin caracteres que molesten al sistema. */
export function nombreArchivoReporte(desde: string, hasta: string): string {
  return `reporte-nomina-${desde}-a-${hasta}.pdf`;
}

/** Una linea del detalle del pago, como se ve en la tabla y en el PDF. */
export interface ConceptoComprobante {
  concepto: string;
  detalle: string;
  /** Fecha del registro, para mostrar cuando ocurrio cada venta o cobro. */
  fecha?: string;
  /** Cantidad de unidades, cuando el concepto se cobra por unidad. */
  cantidad: number | null;
  /** Valor de cada unidad. Null cuando el concepto no se cobra por unidad. */
  valorUnitario: Money | null;
  /** Lo que suma (o resta, si es negativo) al pago. */
  subtotal: Money;
}

/**
 * Desglose del pago en lineas.
 *
 * Vive aqui, compartido, para que la tabla del historial y el PDF muestren
 * exactamente los mismos conceptos. Cuando estaban duplicados, cualquier ajuste
 * en uno dejaba al otro mostrando algo distinto para el mismo pago, que es la
 * clase de diferencia que termina en un reclamo del empleado.
 *
 * Si se pasan los registros originales, se arma una linea por cada venta, cobro
 * y gasto, con su fecha. Si no, se muestran solo los totales. Esto permite usar
 * la misma funcion para el historial (que solo muestra totales) y el PDF (que
 * debe mostrar fechas individuales).
 */
export function conceptosComprobante(
  liquidacion: LiquidacionNomina,
  registros?: {
    ventas?: readonly RegistroVenta[];
    cobros?: readonly RegistroCobro[];
    gastos?: readonly GastoEmpleado[];
  },
): ConceptoComprobante[] {
  const lineas: ConceptoComprobante[] = [];

  // Si hay registros individuales, una linea por cada uno. Si no, solo el total.
  if (registros?.ventas && registros.ventas.length > 0) {
    for (const venta of registros.ventas) {
      const liquidado = venta.cantidad * venta.tarifaLiquidacion;
      lineas.push({
        concepto: 'Venta',
        detalle: venta.nota ?? `${venta.cantidad} unidades`,
        fecha: venta.fecha,
        cantidad: venta.cantidad,
        valorUnitario: venta.tarifaLiquidacion,
        subtotal: liquidado,
      });
    }
  } else if (liquidacion.ventas.cantidad > 0) {
    lineas.push({
      concepto: 'Ventas',
      detalle: `Generaron ${formatearPesos(liquidacion.ventas.devengado)} en total`,
      cantidad: liquidacion.ventas.cantidad,
      valorUnitario: divideExacto(liquidacion.ventas.liquidado, liquidacion.ventas.cantidad),
      subtotal: liquidacion.ventas.liquidado,
    });
  }

  if (registros?.cobros && registros.cobros.length > 0) {
    for (const cobro of registros.cobros) {
      lineas.push({
        concepto: 'Cobro',
        detalle: `${formatearPesos(cobro.montoRecaudado)} recaudados`,
        fecha: cobro.fecha,
        cantidad: null,
        valorUnitario: null,
        subtotal: comisionDeCobro(cobro),
      });
    }
  } else if (liquidacion.cobros.comision > 0) {
    lineas.push({
      concepto: 'Comision de cobros',
      detalle: `Sobre ${formatearPesos(liquidacion.cobros.totalRecaudado)} recaudados`,
      cantidad: null,
      valorUnitario: null,
      subtotal: liquidacion.cobros.comision,
    });
  }

  for (const bono of liquidacion.bonos.detalles) {
    lineas.push({
      concepto: `Bono ${bono.municipioNombre}`,
      detalle:
        bono.baseBono === 'excedente'
          ? `${bono.porcentajeAplicado}% sobre el excedente de ${formatearPesos(bono.excedente)}` +
            ` (meta ${formatearPesos(bono.metaRecaudo)})`
          : `${bono.porcentajeAplicado}% sobre ${formatearPesos(bono.totalRecaudado)}, supero la meta`,
      cantidad: null,
      valorUnitario: null,
      subtotal: bono.bono,
    });
  }

  if (registros?.gastos && registros.gastos.length > 0) {
    for (const gasto of registros.gastos) {
      if (!gasto.deducible) continue; // Los que asume el negocio no van al comprobante
      lineas.push({
        concepto: 'Gasto',
        detalle: gasto.concepto,
        fecha: gasto.fecha,
        cantidad: null,
        valorUnitario: null,
        subtotal: -gasto.monto,
      });
    }
  } else if (liquidacion.deducciones.total > 0) {
    lineas.push({
      concepto: 'Gastos descontados',
      detalle: 'Gastos personales del periodo',
      cantidad: null,
      valorUnitario: null,
      subtotal: -liquidacion.deducciones.total,
    });
  }

  return lineas;
}

/** El valor por unidad, solo si la division es exacta en pesos enteros. */
function divideExacto(total: Money, cantidad: number): Money | null {
  if (cantidad <= 0 || total % cantidad !== 0) return null;
  return total / cantidad;
}

/** Nombre de archivo del PDF, sin caracteres que molesten al sistema. */
export function nombreArchivoComprobante(nombreEmpleado: string, numero: string): string {
  const limpio = nombreEmpleado
    .normalize('NFD')
    // Quita las tildes que NFD dejo separadas: "Adrián" -> "Adrian".
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `comprobante-${limpio || 'empleado'}-${numero}.pdf`;
}
