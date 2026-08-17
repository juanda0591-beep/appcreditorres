import { and, eq, sql, desc } from 'drizzle-orm';
import { MESES_CICLO_AHORRO, type SaldoAhorro } from '@credito/shared';
import { db, esquema } from '../db/cliente.js';
import { ErrorNoEncontrado, ErrorDatosInvalidos } from '../errores.js';

const { movimientosAhorro, empleados, movimientosCaja } = esquema;

/** Suma los meses indicados a una fecha ISO, devolviendo ISO corto. */
function sumarMeses(fecha: string, meses: number): string {
  const base = new Date(`${fecha}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + meses);
  return base.toISOString().slice(0, 10);
}

/**
 * Saldo del ahorro de un empleado.
 *
 * El saldo se calcula sumando los movimientos, no se lee de un campo.
 * Asi el numero siempre concuerda con su historial y no puede desincronizarse.
 *
 * `hoy` se recibe como parametro en vez de usar new Date() adentro para que
 * la funcion sea determinista y se pueda probar sin depender del reloj.
 */
export async function obtenerSaldoAhorro(
  empleadoId: string,
  hoy: string,
): Promise<SaldoAhorro> {
  const [resumen] = await db
    .select({ saldo: sql<number>`coalesce(sum(${movimientosAhorro.monto}), 0)` })
    .from(movimientosAhorro)
    .where(eq(movimientosAhorro.empleadoId, empleadoId));

  const [ultimoPago] = await db
    .select({ fecha: movimientosAhorro.fecha })
    .from(movimientosAhorro)
    .where(and(eq(movimientosAhorro.empleadoId, empleadoId), eq(movimientosAhorro.tipo, 'pago')))
    .orderBy(desc(movimientosAhorro.fecha))
    .limit(1);

  const fechaUltimoPago = ultimoPago?.fecha ?? null;

  return {
    empleadoId,
    saldo: resumen?.saldo ?? 0,
    ultimoPago: fechaUltimoPago,
    // Sin pagos previos el ciclo se considera cumplido: es la primera entrega.
    cicloCumplido: fechaUltimoPago === null
      ? true
      : hoy >= sumarMeses(fechaUltimoPago, MESES_CICLO_AHORRO),
  };
}

/**
 * Entrega el ahorro acumulado al empleado (el pago de cada 3 meses).
 *
 * Es una accion MANUAL a proposito: no se dispara sola al cumplirse el ciclo.
 * Mover plata sin que alguien lo confirme es un riesgo que no vale la pena;
 * el sistema avisa que el ciclo se cumplio y tu decides cuando pagar.
 *
 * `forzar` permite entregar antes de los 3 meses cuando haga falta.
 */
export async function pagarAhorro(opciones: {
  empleadoId: string;
  fecha: string;
  monto?: number;
  forzar?: boolean;
  nota?: string;
}): Promise<{ id: string; montoPagado: number; saldoRestante: number }> {
  const { empleadoId, fecha, forzar = false } = opciones;

  const [empleado] = await db
    .select({ nombre: empleados.nombre })
    .from(empleados)
    .where(eq(empleados.id, empleadoId))
    .limit(1);

  if (!empleado) {
    throw new ErrorNoEncontrado(`No existe el empleado ${empleadoId}`);
  }

  const estado = await obtenerSaldoAhorro(empleadoId, fecha);

  if (estado.saldo <= 0) {
    throw new ErrorDatosInvalidos(
      `${empleado.nombre} no tiene ahorro acumulado para entregar.`,
    );
  }

  if (!estado.cicloCumplido && !forzar) {
    const proximo = sumarMeses(estado.ultimoPago!, MESES_CICLO_AHORRO);
    throw new ErrorDatosInvalidos(
      `Todavia no se cumplen los ${MESES_CICLO_AHORRO} meses. El proximo pago va ` +
        `desde ${proximo}. Usa "forzar" si necesitas entregarlo antes.`,
    );
  }

  // Por defecto se entrega todo el saldo, pero se permite un pago parcial.
  const montoPagado = opciones.monto ?? estado.saldo;

  if (montoPagado <= 0 || !Number.isInteger(montoPagado)) {
    throw new ErrorDatosInvalidos('El monto a pagar debe ser un entero positivo.');
  }

  if (montoPagado > estado.saldo) {
    throw new ErrorDatosInvalidos(
      `No se puede entregar ${montoPagado}: el ahorro de ${empleado.nombre} ` +
        `es de ${estado.saldo}.`,
    );
  }

  return db.transaction(async (tx) => {
    const [movimiento] = await tx
      .insert(movimientosAhorro)
      .values({
        empleadoId,
        fecha,
        tipo: 'pago',
        // Negativo: la plata sale del ahorro.
        monto: -montoPagado,
        referenciaId: null,
        nota: opciones.nota ?? `Entrega de ahorro acumulado`,
      })
      .returning({ id: movimientosAhorro.id });

    if (!movimiento) {
      throw new Error('No se pudo registrar el pago de ahorro');
    }

    await tx
      .insert(movimientosCaja)
      .values({
        fecha,
        tipo: 'egreso',
        monto: montoPagado,
        categoria: 'ahorro',
        concepto: `Entrega de ahorro a ${empleado.nombre}`,
        empleadoId,
        origen: 'ahorro',
        referenciaId: movimiento.id,
      });

    return {
      id: movimiento.id,
      montoPagado,
      saldoRestante: estado.saldo - montoPagado,
    };
  });
}
