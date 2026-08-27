import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  calcularLiquidacion,
  periodoDelMes,
  cierraElMes,
  type LiquidacionNomina,
  type ReporteNomina,
  type Periodo,
  type Municipio,
  type RegistroVenta,
  type RegistroCobro,
  type GastoEmpleado,
  type DevolucionVenta,
} from '@credito/shared';
import { db, esquema } from '../db/cliente.js';
import { leerDetalleBonos } from './comprobante-pdf.js';
import { aEmpleado, aMunicipio, aRegistroVenta, aRegistroCobro, aGastoEmpleado, aDevolucionVenta } from '../db/mapeo.js';
import { obtenerPrestamo } from './prestamos.js';
import { ErrorNoEncontrado, ErrorDatosInvalidos, ErrorConflicto } from '../errores.js';

const {
  empleados,
  municipios,
  registrosVenta,
  registrosCobro,
  gastosEmpleado,
  devolucionesVenta,
  liquidaciones,
  movimientosAhorro,
  movimientosCaja,
  prestamosEmpleado,
  movimientosPrestamo,
} = esquema;

/** Trae los municipios en un mapa, como lo espera el motor de calculo. */
async function cargarMunicipios(): Promise<Map<string, Municipio>> {
  const filas = await db.select().from(municipios);
  return new Map(filas.map((fila) => [fila.id, aMunicipio(fila)]));
}

export interface OpcionesPrevisualizacion {
  empleadoId: string;
  periodo: Periodo;
  /**
   * Si no se indica, se decide por el periodo: el bono se paga solo en la
   * quincena que cierra el mes, para no pagarlo dos veces en el mismo mes.
   */
  incluirBonos?: boolean;
}

/**
 * Calcula la liquidacion sin guardar nada.
 *
 * Sirve para que la pantalla muestre el resultado antes de confirmar el pago.
 * Usa el mismo motor que el guardado definitivo, asi que lo que se ve en
 * pantalla es exactamente lo que se va a pagar.
 */
export async function previsualizarLiquidacion(
  opciones: OpcionesPrevisualizacion,
): Promise<LiquidacionNomina> {
  const { empleadoId, periodo } = opciones;

  const [filaEmpleado] = await db
    .select()
    .from(empleados)
    .where(eq(empleados.id, empleadoId))
    .limit(1);

  if (!filaEmpleado) {
    throw new ErrorNoEncontrado(`No existe el empleado ${empleadoId}`);
  }

  // SQLiteColumn generico: el helper sirve para las tres tablas.
  const enRango = (columna: SQLiteColumn) =>
    and(gte(columna, periodo.desde), lte(columna, periodo.hasta));

  const [ventas, cobros, gastos, devoluciones] = await Promise.all([
    db
      .select()
      .from(registrosVenta)
      .where(and(eq(registrosVenta.empleadoId, empleadoId), enRango(registrosVenta.fecha))),
    db
      .select()
      .from(registrosCobro)
      .where(and(eq(registrosCobro.empleadoId, empleadoId), enRango(registrosCobro.fecha))),
    db
      .select()
      .from(gastosEmpleado)
      .where(and(eq(gastosEmpleado.empleadoId, empleadoId), enRango(gastosEmpleado.fecha))),
    db
      .select()
      .from(devolucionesVenta)
      .where(and(eq(devolucionesVenta.empleadoId, empleadoId), enRango(devolucionesVenta.fecha))),
  ]);

  // Las metas de municipio son mensuales: hay que traer los cobros del mes
  // completo, no solo los de la quincena que se esta liquidando.
  const mes = periodoDelMes(periodo.hasta);
  const cobrosDelMes = await db
    .select()
    .from(registrosCobro)
    .where(
      and(
        eq(registrosCobro.empleadoId, empleadoId),
        gte(registrosCobro.fecha, mes.desde),
        lte(registrosCobro.fecha, mes.hasta),
      ),
    );

  // Consultar el préstamo pendiente del empleado
  const prestamo = await obtenerPrestamo(empleadoId);

  return calcularLiquidacion({
    empleado: aEmpleado(filaEmpleado),
    periodo,
    ventas: ventas.map(aRegistroVenta),
    cobros: cobros.map(aRegistroCobro),
    gastos: gastos.map(aGastoEmpleado),
    devoluciones: devoluciones.map(aDevolucionVenta),
    cobrosDelMes: cobrosDelMes.map(aRegistroCobro),
    periodoBonos: mes,
    municipios: await cargarMunicipios(),
    // El bono se paga al cerrar el mes. En la primera quincena no.
    incluirBonos: opciones.incluirBonos ?? cierraElMes(periodo),
    // Incluir el saldo del préstamo (sin abono por ahora, eso se hace al confirmar)
    prestamo: prestamo
      ? {
          saldoPendiente: prestamo.saldoActual,
          abonoRealizado: 0,
        }
      : undefined,
  });
}

/**
 * Cuanto se le debe a cada empleado en un rango de fechas.
 *
 * Trae ventas, cobros y gastos de TODOS los empleados en tres consultas
 * (no una por empleado, para no multiplicar las consultas por la cantidad de
 * empleados) y calcula cada liquidacion en memoria con el mismo motor que
 * usa la previsualizacion, pero sin bonos ni prestamo: el reporte es una
 * foto de lo que se hizo en el rango, no una liquidacion real que se vaya a
 * pagar asi.
 */
export async function generarReporte(periodo: Periodo): Promise<ReporteNomina> {
  const enRango = (columna: SQLiteColumn) =>
    and(gte(columna, periodo.desde), lte(columna, periodo.hasta));

  const [filasEmpleados, ventas, cobros, gastos, devoluciones, mapaMunicipios] = await Promise.all([
    db.select().from(empleados).where(eq(empleados.activo, true)).orderBy(empleados.nombre),
    db.select().from(registrosVenta).where(enRango(registrosVenta.fecha)),
    db.select().from(registrosCobro).where(enRango(registrosCobro.fecha)),
    db.select().from(gastosEmpleado).where(enRango(gastosEmpleado.fecha)),
    db.select().from(devolucionesVenta).where(enRango(devolucionesVenta.fecha)),
    cargarMunicipios(),
  ]);

  const ventasPorEmpleado = new Map<string, RegistroVenta[]>();
  for (const fila of ventas) {
    const registro = aRegistroVenta(fila);
    const lista = ventasPorEmpleado.get(registro.empleadoId) ?? [];
    lista.push(registro);
    ventasPorEmpleado.set(registro.empleadoId, lista);
  }

  const cobrosPorEmpleado = new Map<string, RegistroCobro[]>();
  for (const fila of cobros) {
    const registro = aRegistroCobro(fila);
    const lista = cobrosPorEmpleado.get(registro.empleadoId) ?? [];
    lista.push(registro);
    cobrosPorEmpleado.set(registro.empleadoId, lista);
  }

  const gastosPorEmpleado = new Map<string, GastoEmpleado[]>();
  for (const fila of gastos) {
    const registro = aGastoEmpleado(fila);
    const lista = gastosPorEmpleado.get(registro.empleadoId) ?? [];
    lista.push(registro);
    gastosPorEmpleado.set(registro.empleadoId, lista);
  }

  const devolucionesPorEmpleado = new Map<string, DevolucionVenta[]>();
  for (const fila of devoluciones) {
    const registro = aDevolucionVenta(fila);
    const lista = devolucionesPorEmpleado.get(registro.empleadoId) ?? [];
    lista.push(registro);
    devolucionesPorEmpleado.set(registro.empleadoId, lista);
  }

  const conMovimientos = filasEmpleados.filter(
    (fila) =>
      ventasPorEmpleado.has(fila.id) ||
      cobrosPorEmpleado.has(fila.id) ||
      gastosPorEmpleado.has(fila.id) ||
      devolucionesPorEmpleado.has(fila.id),
  );

  const reporteEmpleados = conMovimientos.map((fila) =>
    calcularLiquidacion({
      empleado: aEmpleado(fila),
      periodo,
      ventas: ventasPorEmpleado.get(fila.id) ?? [],
      cobros: cobrosPorEmpleado.get(fila.id) ?? [],
      gastos: gastosPorEmpleado.get(fila.id) ?? [],
      devoluciones: devolucionesPorEmpleado.get(fila.id) ?? [],
      municipios: mapaMunicipios,
      // Bonos y prestamo son de una liquidacion real, no de un reporte sobre
      // un rango cualquiera: se evaluan mensualmente o al momento de pagar.
      incluirBonos: false,
    }),
  );

  reporteEmpleados.sort((a, b) => b.netoAPagar - a.netoAPagar);

  return { periodo, empleados: reporteEmpleados };
}

/**
 * Guarda la liquidacion y registra sus consecuencias, todo en una transaccion:
 *
 *   1. El comprobante de la liquidacion
 *   2. La retencion al ahorro (los $1.000 por venta)
 *   3. El egreso de caja por lo que se le pago
 *   4. El abono al préstamo si se especificó
 *
 * Van juntas a proposito. Si se guardara la liquidacion y fallara el egreso
 * de caja, quedaria un pago hecho que el balance no refleja, y ese descuadre
 * es dificil de encontrar despues.
 */
export async function confirmarLiquidacion(
  opciones: OpcionesPrevisualizacion & { nota?: string; abonoPrestamo?: number },
): Promise<{ id: string; liquidacion: LiquidacionNomina }> {
  const { empleadoId, periodo, abonoPrestamo } = opciones;

  // Consultar el préstamo si hay abono
  const prestamo = abonoPrestamo && abonoPrestamo > 0
    ? await obtenerPrestamo(empleadoId)
    : null;

  // Validar el abono
  if (abonoPrestamo && abonoPrestamo > 0) {
    if (!prestamo || prestamo.saldoActual === 0) {
      throw new ErrorDatosInvalidos('El empleado no tiene préstamos pendientes');
    }
    if (abonoPrestamo > prestamo.saldoActual) {
      throw new ErrorDatosInvalidos(
        `El abono ($${abonoPrestamo}) no puede ser mayor al saldo pendiente ($${prestamo.saldoActual})`,
      );
    }
  }

  // Cargar datos para el cálculo completo
  const [filaEmpleado] = await db
    .select()
    .from(empleados)
    .where(eq(empleados.id, empleadoId))
    .limit(1);

  if (!filaEmpleado) {
    throw new ErrorNoEncontrado(`No existe el empleado ${empleadoId}`);
  }

  const enRango = (columna: SQLiteColumn) =>
    and(gte(columna, periodo.desde), lte(columna, periodo.hasta));

  const [ventas, cobros, gastos, devoluciones] = await Promise.all([
    db
      .select()
      .from(registrosVenta)
      .where(and(eq(registrosVenta.empleadoId, empleadoId), enRango(registrosVenta.fecha))),
    db
      .select()
      .from(registrosCobro)
      .where(and(eq(registrosCobro.empleadoId, empleadoId), enRango(registrosCobro.fecha))),
    db
      .select()
      .from(gastosEmpleado)
      .where(and(eq(gastosEmpleado.empleadoId, empleadoId), enRango(gastosEmpleado.fecha))),
    db
      .select()
      .from(devolucionesVenta)
      .where(and(eq(devolucionesVenta.empleadoId, empleadoId), enRango(devolucionesVenta.fecha))),
  ]);

  const mes = periodoDelMes(periodo.hasta);
  const cobrosDelMes = await db
    .select()
    .from(registrosCobro)
    .where(
      and(
        eq(registrosCobro.empleadoId, empleadoId),
        gte(registrosCobro.fecha, mes.desde),
        lte(registrosCobro.fecha, mes.hasta),
      ),
    );

  // Calcular con el abono incluido
  const liquidacion = calcularLiquidacion({
    empleado: aEmpleado(filaEmpleado),
    periodo,
    ventas: ventas.map(aRegistroVenta),
    cobros: cobros.map(aRegistroCobro),
    gastos: gastos.map(aGastoEmpleado),
    devoluciones: devoluciones.map(aDevolucionVenta),
    cobrosDelMes: cobrosDelMes.map(aRegistroCobro),
    periodoBonos: mes,
    municipios: await cargarMunicipios(),
    incluirBonos: opciones.incluirBonos ?? cierraElMes(periodo),
    prestamo:
      prestamo && abonoPrestamo
        ? {
            saldoPendiente: prestamo.saldoActual,
            abonoRealizado: abonoPrestamo,
          }
        : undefined,
  });

  if (liquidacion.quedaSaldoEnContra) {
    throw new ErrorDatosInvalidos(
      `No se puede pagar: el total a descontar supera lo ganado. ` +
        `Ganado: $${liquidacion.totalBruto}, ` +
        `Gastos: $${liquidacion.deducciones.total}` +
        (abonoPrestamo ? `, Abono: $${abonoPrestamo}` : ''),
    );
  }

  const yaLiquidado = await db
    .select({ id: liquidaciones.id })
    .from(liquidaciones)
    .where(
      and(
        eq(liquidaciones.empleadoId, opciones.empleadoId),
        eq(liquidaciones.periodoDesde, opciones.periodo.desde),
        eq(liquidaciones.periodoHasta, opciones.periodo.hasta),
        inArray(liquidaciones.estado, ['borrador', 'pagada']),
      ),
    )
    .limit(1);

  if (yaLiquidado.length > 0) {
    throw new ErrorConflicto(
      `Ya existe una liquidacion para ${liquidacion.empleadoNombre} en el periodo ` +
        `${opciones.periodo.desde} a ${opciones.periodo.hasta}. Anulala antes de rehacerla.`,
    );
  }

  // Si algo lanza dentro de la transaccion, libSQL revierte todo.
  return db.transaction(async (tx) => {
    const [guardada] = await tx
      .insert(liquidaciones)
      .values({
        empleadoId: liquidacion.empleadoId,
        periodoDesde: liquidacion.periodo.desde,
        periodoHasta: liquidacion.periodo.hasta,
        ventasCantidad: liquidacion.ventas.cantidad,
        ventasDevengado: liquidacion.ventas.devengado,
        ventasLiquidado: liquidacion.ventas.liquidado,
        cobrosRecaudado: liquidacion.cobros.totalRecaudado,
        cobrosComision: liquidacion.cobros.comision,
        bonosTotal: liquidacion.bonos.total,
        deduccionesTotal: liquidacion.deducciones.total,
        totalBruto: liquidacion.totalBruto,
        netoAPagar: liquidacion.netoAPagar,
        ahorroRetenido: liquidacion.ahorroRetenido,
        incluyoBonos: liquidacion.bonos.total > 0 || liquidacion.bonos.detalles.length > 0,
        detalleBonos: JSON.stringify(liquidacion.bonos.detalles),
        estado: 'pagada',
        pagadaEn: new Date().toISOString(),
        nota: opciones.nota ?? null,
      })
      .returning({ id: liquidaciones.id });

    if (!guardada) {
      throw new Error('No se pudo guardar la liquidacion');
    }

    // El ahorro entra al libro de movimientos, no al pago.
    if (liquidacion.ahorroRetenido > 0) {
      await tx
        .insert(movimientosAhorro)
        .values({
          empleadoId: liquidacion.empleadoId,
          fecha: liquidacion.periodo.hasta,
          tipo: 'retencion',
          monto: liquidacion.ahorroRetenido,
          referenciaId: guardada.id,
          nota: `Retencion por ${liquidacion.ventas.cantidad} ventas`,
        });
    }

    // La plata que sale del negocio queda en el balance.
    if (liquidacion.netoAPagar > 0) {
      await tx
        .insert(movimientosCaja)
        .values({
          fecha: liquidacion.periodo.hasta,
          tipo: 'egreso',
          monto: liquidacion.netoAPagar,
          categoria: 'nomina',
          concepto: `Liquidacion ${liquidacion.empleadoNombre} (${liquidacion.periodo.desde} a ${liquidacion.periodo.hasta})`,
          empleadoId: liquidacion.empleadoId,
          origen: 'nomina',
          referenciaId: guardada.id,
        });
    }

    // Registrar el abono al préstamo si se especificó
    if (opciones.abonoPrestamo && opciones.abonoPrestamo > 0 && prestamo) {
      const saldoAnterior = prestamo.saldoActual;
      const saldoNuevo = saldoAnterior - opciones.abonoPrestamo;

      // Actualizar el saldo del préstamo
      await tx
        .update(prestamosEmpleado)
        .set({
          saldoActual: saldoNuevo,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(prestamosEmpleado.empleadoId, opciones.empleadoId));

      // Registrar el movimiento
      await tx.insert(movimientosPrestamo).values({
        empleadoId: opciones.empleadoId,
        fecha: liquidacion.periodo.hasta,
        tipo: 'abono',
        monto: opciones.abonoPrestamo,
        saldoAnterior,
        saldoNuevo,
        concepto: 'Abono en liquidación',
        liquidacionId: guardada.id,
      });
    }

    return { id: guardada.id, liquidacion };
  });
}

/**
 * Reconstruye la liquidacion desde la fila guardada.
 *
 * Se usa para los comprobantes y el historial: devuelve lo que se pago en su
 * momento, sin recalcular. Si se recalculara, cambiar una tarifa hoy alteraria
 * el detalle de un pago de hace tres meses y el comprobante ya no coincidiria
 * con el que recibio el empleado.
 *
 * Algunos datos derivados no se guardan en la tabla (cuantos cobros hubo, los
 * gastos que asumio el negocio) porque no afectan el monto pagado. Se dejan en
 * cero de forma explicita en vez de inventarlos.
 */
export function aLiquidacionNomina(
  fila: typeof liquidaciones.$inferSelect,
  empleadoNombre: string,
): LiquidacionNomina {
  const detalles = leerDetalleBonos(fila.detalleBonos);

  return {
    empleadoId: fila.empleadoId,
    empleadoNombre,
    periodo: { desde: fila.periodoDesde, hasta: fila.periodoHasta },
    ventas: {
      cantidad: fila.ventasCantidad,
      devengado: fila.ventasDevengado,
      liquidado: fila.ventasLiquidado,
      ahorroRetenido: fila.ahorroRetenido,
    },
    cobros: {
      // registros no se guarda: no cambia el monto y nadie lo consulta despues.
      registros: 0,
      totalRecaudado: fila.cobrosRecaudado,
      comision: fila.cobrosComision,
    },
    bonos: { total: fila.bonosTotal, detalles },
    deducciones: {
      registros: 0,
      total: fila.deduccionesTotal,
      asumidosPorNegocio: 0,
    },
    totalBruto: fila.totalBruto,
    netoAPagar: fila.netoAPagar,
    ahorroRetenido: fila.ahorroRetenido,
    quedaSaldoEnContra: false,
    advertencias: [],
  };
}

