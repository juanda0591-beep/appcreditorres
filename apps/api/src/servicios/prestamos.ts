import { eq, desc } from 'drizzle-orm';
import type { Prestamo, MovimientoPrestamo, NuevoPrestamo } from '@credito/shared';
import { db } from '../db/cliente.js';
import { prestamosEmpleado, movimientosPrestamo } from '../db/esquema/index.js';
import { aPrestamo, aMovimientoPrestamo } from '../db/mapeo.js';

/**
 * Obtiene el préstamo de un empleado.
 * Retorna null si el empleado no tiene préstamos o su saldo es 0.
 */
export async function obtenerPrestamo(empleadoId: string): Promise<Prestamo | null> {
  const [fila] = await db
    .select()
    .from(prestamosEmpleado)
    .where(eq(prestamosEmpleado.empleadoId, empleadoId))
    .limit(1);

  if (!fila || fila.saldoActual === 0) return null;
  return aPrestamo(fila);
}

/**
 * Registra un nuevo préstamo otorgado al empleado.
 * Crea o actualiza el registro de saldo y registra el movimiento.
 */
export async function registrarPrestamo(datos: NuevoPrestamo): Promise<MovimientoPrestamo> {
  const { empleadoId, monto, fecha, concepto } = datos;

  if (monto <= 0) {
    throw new Error('El monto del préstamo debe ser mayor a 0');
  }

  return await db.transaction(async (tx) => {
    // Obtener o crear el registro de saldo
    const [prestamoExistente] = await tx
      .select()
      .from(prestamosEmpleado)
      .where(eq(prestamosEmpleado.empleadoId, empleadoId))
      .limit(1);

    const saldoAnterior = prestamoExistente?.saldoActual ?? 0;
    const saldoNuevo = saldoAnterior + monto;

    if (prestamoExistente) {
      // Actualizar saldo existente
      await tx
        .update(prestamosEmpleado)
        .set({
          saldoActual: saldoNuevo,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(prestamosEmpleado.id, prestamoExistente.id));
    } else {
      // Crear nuevo registro de saldo
      await tx.insert(prestamosEmpleado).values({
        empleadoId,
        saldoActual: saldoNuevo,
      });
    }

    // Registrar el movimiento
    const movimientos = await tx
      .insert(movimientosPrestamo)
      .values({
        empleadoId,
        fecha,
        tipo: 'prestamo',
        monto,
        saldoAnterior,
        saldoNuevo,
        concepto: concepto ?? null,
        liquidacionId: null,
      })
      .returning();

    if (!movimientos[0]) {
      throw new Error('No se pudo registrar el movimiento del préstamo');
    }

    return aMovimientoPrestamo(movimientos[0]);
  });
}

/**
 * Registra un abono al préstamo durante una liquidación.
 * Actualiza el saldo y registra el movimiento vinculado a la liquidación.
 */
export async function registrarAbono(
  empleadoId: string,
  monto: number,
  liquidacionId: string,
): Promise<MovimientoPrestamo> {
  if (monto <= 0) {
    throw new Error('El monto del abono debe ser mayor a 0');
  }

  return await db.transaction(async (tx) => {
    // Obtener el saldo actual
    const [prestamo] = await tx
      .select()
      .from(prestamosEmpleado)
      .where(eq(prestamosEmpleado.empleadoId, empleadoId))
      .limit(1);

    if (!prestamo || prestamo.saldoActual === 0) {
      throw new Error('El empleado no tiene préstamos pendientes');
    }

    if (monto > prestamo.saldoActual) {
      throw new Error(
        `El abono ($${monto}) no puede ser mayor al saldo pendiente ($${prestamo.saldoActual})`,
      );
    }

    const saldoAnterior = prestamo.saldoActual;
    const saldoNuevo = saldoAnterior - monto;

    // Actualizar saldo
    await tx
      .update(prestamosEmpleado)
      .set({
        saldoActual: saldoNuevo,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(prestamosEmpleado.id, prestamo.id));

    // Registrar el movimiento
    const movimientos = await tx
      .insert(movimientosPrestamo)
      .values({
        empleadoId,
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'abono',
        monto,
        saldoAnterior,
        saldoNuevo,
        concepto: `Abono en liquidación`,
        liquidacionId,
      })
      .returning();

    if (!movimientos[0]) {
      throw new Error('No se pudo registrar el abono del préstamo');
    }

    return aMovimientoPrestamo(movimientos[0]);
  });
}

/**
 * Obtiene el historial completo de movimientos de préstamo de un empleado.
 * Ordenado por fecha descendente (más reciente primero).
 */
export async function historialMovimientos(empleadoId: string): Promise<MovimientoPrestamo[]> {
  const filas = await db
    .select()
    .from(movimientosPrestamo)
    .where(eq(movimientosPrestamo.empleadoId, empleadoId))
    .orderBy(desc(movimientosPrestamo.fecha), desc(movimientosPrestamo.creadoEn));

  return filas.map(aMovimientoPrestamo);
}
