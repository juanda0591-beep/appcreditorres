import { eq, desc, and, gte, lte, type SQL } from 'drizzle-orm';
import {
  numeroComprobante,
  nombreArchivoComprobante,
  mensajeComprobante,
  conceptosComprobante,
  mensajeReporte,
  nombreArchivoReporte,
  type ConceptoComprobante,
  type LiquidacionNomina,
  type ReporteNomina,
  type Periodo,
} from '@credito/shared';
import { db, esquema } from '../db/cliente.js';
import { aRegistroVenta, aRegistroCobro, aGastoEmpleado } from '../db/mapeo.js';
import { ErrorNoEncontrado } from '../errores.js';
import { obtenerConfiguracion } from './configuracion.js';
import { leerLogoNegocio } from './imagenes.js';
import { generarComprobantePdf, type DatosComprobante } from './comprobante-pdf.js';
import { generarReportePdf } from './reporte-pdf.js';
import { aLiquidacionNomina, generarReporte } from './nomina.js';

const { liquidaciones, empleados, registrosVenta, registrosCobro, gastosEmpleado, movimientosPrestamo } = esquema;

/**
 * Una fila del historial, con el desglose incluido.
 *
 * Trae los conceptos y no solo los totales porque el historial los muestra
 * desplegados en una tabla. Salen de la misma fila que ya se consulto, sin
 * consultas extra por pago.
 */
export interface ItemHistorial {
  id: string;
  numero: string;
  empleadoId: string;
  empleadoNombre: string;
  empleadoDocumento: string | null;
  periodoDesde: string;
  periodoHasta: string;
  netoAPagar: number;
  totalBruto: number;
  deduccionesTotal: number;
  ahorroRetenido: number;
  estado: 'borrador' | 'pagada' | 'anulada';
  pagadaEn: string | null;
  creadoEn: string;
  nota: string | null;
  conceptos: ConceptoComprobante[];
}

export interface FiltrosHistorial {
  empleadoId?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
  /** Por defecto se muestran las anuladas tambien, marcadas como tal. */
  soloPagadas?: boolean | undefined;
}

/**
 * Historial de pagos, del mas reciente al mas viejo.
 *
 * Incluye las anuladas a proposito, marcadas con su estado: un pago que se
 * deshizo sigue siendo parte de la historia del negocio y esconderlo hace
 * imposible entender por que una quincena se liquido dos veces.
 */
export async function listarHistorial(filtros: FiltrosHistorial = {}): Promise<ItemHistorial[]> {
  const condiciones: SQL[] = [];

  if (filtros.empleadoId) condiciones.push(eq(liquidaciones.empleadoId, filtros.empleadoId));
  // El filtro compara contra el FIN del periodo: buscar "agosto" debe traer la
  // quincena del 16 al 31, no descartarla por empezar antes del rango.
  if (filtros.desde) condiciones.push(gte(liquidaciones.periodoHasta, filtros.desde));
  if (filtros.hasta) condiciones.push(lte(liquidaciones.periodoHasta, filtros.hasta));
  if (filtros.soloPagadas) condiciones.push(eq(liquidaciones.estado, 'pagada'));

  const filas = await db
    .select({
      liquidacion: liquidaciones,
      empleadoNombre: empleados.nombre,
      empleadoDocumento: empleados.documento,
    })
    .from(liquidaciones)
    .innerJoin(empleados, eq(liquidaciones.empleadoId, empleados.id))
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
    .orderBy(desc(liquidaciones.periodoHasta), desc(liquidaciones.creadoEn));

  return filas.map(({ liquidacion: fila, empleadoNombre, empleadoDocumento }) => ({
    id: fila.id,
    numero: numeroComprobante(fila.id, fila.periodoHasta),
    empleadoId: fila.empleadoId,
    empleadoNombre,
    empleadoDocumento,
    periodoDesde: fila.periodoDesde,
    periodoHasta: fila.periodoHasta,
    netoAPagar: fila.netoAPagar,
    totalBruto: fila.totalBruto,
    deduccionesTotal: fila.deduccionesTotal,
    ahorroRetenido: fila.ahorroRetenido,
    estado: fila.estado,
    pagadaEn: fila.pagadaEn,
    creadoEn: fila.creadoEn,
    nota: fila.nota,
    conceptos: conceptosComprobante(aLiquidacionNomina(fila, empleadoNombre)),
  }));
}

/** Carga una liquidacion guardada junto con los datos del empleado. */
async function cargarComprobante(id: string): Promise<DatosComprobante> {
  const [fila] = await db
    .select({
      liquidacion: liquidaciones,
      nombre: empleados.nombre,
      documento: empleados.documento,
    })
    .from(liquidaciones)
    .innerJoin(empleados, eq(liquidaciones.empleadoId, empleados.id))
    .where(eq(liquidaciones.id, id))
    .limit(1);

  if (!fila) throw new ErrorNoEncontrado(`No existe la liquidacion ${id}`);

  // Traer los registros originales para mostrar la fecha de cada uno en el PDF.
  const { empleadoId, periodoDesde, periodoHasta } = fila.liquidacion;

  const [ventas, cobros, gastos, movimientoPrestamo] = await Promise.all([
    db
      .select()
      .from(registrosVenta)
      .where(
        and(
          eq(registrosVenta.empleadoId, empleadoId),
          gte(registrosVenta.fecha, periodoDesde),
          lte(registrosVenta.fecha, periodoHasta)
        )
      ),
    db
      .select()
      .from(registrosCobro)
      .where(
        and(
          eq(registrosCobro.empleadoId, empleadoId),
          gte(registrosCobro.fecha, periodoDesde),
          lte(registrosCobro.fecha, periodoHasta)
        )
      ),
    db
      .select()
      .from(gastosEmpleado)
      .where(
        and(
          eq(gastosEmpleado.empleadoId, empleadoId),
          gte(gastosEmpleado.fecha, periodoDesde),
          lte(gastosEmpleado.fecha, periodoHasta)
        )
      ),
    db
      .select()
      .from(movimientosPrestamo)
      .where(
        and(
          eq(movimientosPrestamo.liquidacionId, fila.liquidacion.id),
          eq(movimientosPrestamo.tipo, 'abono')
        )
      )
      .limit(1),
  ]);

  const ajustes = await obtenerConfiguracion();

  return {
    fila: fila.liquidacion,
    empleadoNombre: fila.nombre,
    empleadoDocumento: fila.documento,
    negocio: {
      nombreNegocio: ajustes.nombreNegocio,
      notaPie: ajustes.notaPie,
      logo: await leerLogoNegocio(ajustes.logoUrl),
    },
    conceptos: conceptosComprobante(aLiquidacionNomina(fila.liquidacion, fila.nombre), {
      ventas: ventas.map(aRegistroVenta),
      cobros: cobros.map(aRegistroCobro),
      gastos: gastos.map(aGastoEmpleado),
    }),
    prestamo: movimientoPrestamo[0]
      ? {
          saldoAnterior: movimientoPrestamo[0].saldoAnterior,
          abono: movimientoPrestamo[0].monto,
          saldoNuevo: movimientoPrestamo[0].saldoNuevo,
        }
      : null,
  };
}

/** El PDF listo para descargar, con su nombre de archivo. */
export async function comprobanteEnPdf(
  id: string,
): Promise<{ pdf: Buffer; nombreArchivo: string; numero: string }> {
  const datos = await cargarComprobante(id);
  const numero = numeroComprobante(datos.fila.id, datos.fila.periodoHasta);

  return {
    pdf: await generarComprobantePdf(datos),
    nombreArchivo: nombreArchivoComprobante(datos.empleadoNombre, numero),
    numero,
  };
}

/**
 * Detalle de una liquidacion guardada, reconstruido desde la fila.
 *
 * No recalcula: devuelve lo que se pago en su momento. Si se recalculara, un
 * cambio posterior de tarifas mostraria un detalle distinto al que el empleado
 * recibio en su comprobante.
 */
export async function detalleGuardado(id: string): Promise<{
  liquidacion: LiquidacionNomina;
  numero: string;
  estado: 'borrador' | 'pagada' | 'anulada';
  pagadaEn: string | null;
}> {
  const datos = await cargarComprobante(id);

  return {
    liquidacion: aLiquidacionNomina(datos.fila, datos.empleadoNombre),
    numero: numeroComprobante(datos.fila.id, datos.fila.periodoHasta),
    estado: datos.fila.estado,
    pagadaEn: datos.fila.pagadaEn,
  };
}

/**
 * Texto para enviar por WhatsApp.
 *
 * Es un resumen, no un enlace: publicar una URL con el detalle del pago dejaria
 * salarios al alcance de cualquiera que la tenga. El detalle completo va en el
 * PDF, que se adjunta desde el celular.
 */
export async function textoParaCompartir(id: string): Promise<{
  texto: string;
  numero: string;
  telefonoEmpleado: string | null;
}> {
  const datos = await cargarComprobante(id);
  const numero = numeroComprobante(datos.fila.id, datos.fila.periodoHasta);

  const [empleado] = await db
    .select({ telefono: empleados.telefono })
    .from(empleados)
    .where(eq(empleados.id, datos.fila.empleadoId))
    .limit(1);

  return {
    texto: mensajeComprobante(aLiquidacionNomina(datos.fila, datos.empleadoNombre), {
      numero,
      nombreNegocio: datos.negocio.nombreNegocio,
    }),
    numero,
    telefonoEmpleado: empleado?.telefono ?? null,
  };
}

/** El PDF del reporte de nomina, listo para descargar, con su nombre de archivo. */
export async function reporteEnPdf(
  periodo: Periodo,
): Promise<{ pdf: Buffer; nombreArchivo: string; reporte: ReporteNomina }> {
  const [reporte, ajustes] = await Promise.all([generarReporte(periodo), obtenerConfiguracion()]);

  const pdf = await generarReportePdf({
    reporte,
    negocio: {
      nombreNegocio: ajustes.nombreNegocio,
      notaPie: ajustes.notaPie,
      logo: await leerLogoNegocio(ajustes.logoUrl),
    },
  });

  return {
    pdf,
    nombreArchivo: nombreArchivoReporte(periodo.desde, periodo.hasta),
    reporte,
  };
}

/**
 * Texto para compartir el reporte de nomina por WhatsApp.
 *
 * Igual que el comprobante individual: es un resumen sin enlace, el detalle
 * completo va en el PDF adjunto.
 */
export async function textoParaCompartirReporte(
  periodo: Periodo,
): Promise<{ texto: string; reporte: ReporteNomina }> {
  const [reporte, ajustes] = await Promise.all([generarReporte(periodo), obtenerConfiguracion()]);

  return {
    texto: mensajeReporte(reporte, { nombreNegocio: ajustes.nombreNegocio }),
    reporte,
  };
}
