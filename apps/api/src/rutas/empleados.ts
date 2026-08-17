import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, esquema } from '../db/cliente.js';
import { aEmpleado } from '../db/mapeo.js';
import { ErrorNoEncontrado } from '../errores.js';
import { zNuevoEmpleado, zEmpleadoParcial, zId, zFecha } from './validacion.js';
import { obtenerSaldoAhorro } from '../servicios/ahorro.js';
import {
  obtenerPrestamo,
  registrarPrestamo,
  historialMovimientos,
} from '../servicios/prestamos.js';

const { empleados } = esquema;

export const rutasEmpleados: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: { querystring: z.object({ incluirInactivos: z.coerce.boolean().default(false) }) },
    handler: async (peticion) => {
      const { incluirInactivos } = peticion.query;
      const filas = incluirInactivos
        ? await db.select().from(empleados).orderBy(empleados.nombre)
        : await db.select().from(empleados).where(eq(empleados.activo, true)).orderBy(empleados.nombre);
      return filas.map(aEmpleado);
    },
  });

  app.get('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [fila] = await db
        .select()
        .from(empleados)
        .where(eq(empleados.id, peticion.params.id))
        .limit(1);

      if (!fila) throw new ErrorNoEncontrado(`No existe el empleado ${peticion.params.id}`);
      return aEmpleado(fila);
    },
  });

  app.post('/', {
    schema: { body: zNuevoEmpleado },
    handler: async (peticion, respuesta) => {
      const [creado] = await db.insert(empleados).values(peticion.body).returning();
      respuesta.code(201);
      return aEmpleado(creado!);
    },
  });

  app.patch('/:id', {
    schema: { params: z.object({ id: zId }), body: zEmpleadoParcial },
    handler: async (peticion) => {
      const [actualizado] = await db
        .update(empleados)
        .set(peticion.body)
        .where(eq(empleados.id, peticion.params.id))
        .returning();

      if (!actualizado) throw new ErrorNoEncontrado(`No existe el empleado ${peticion.params.id}`);
      return aEmpleado(actualizado);
    },
  });

  /**
   * Desactiva al empleado en vez de borrarlo.
   *
   * Borrarlo destruiria el historial de pagos, y ese historial es justamente
   * lo que sirve para responder reclamos. Un empleado inactivo desaparece de
   * los listados pero su historia queda intacta.
   */
  app.delete('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [desactivado] = await db
        .update(empleados)
        .set({ activo: false })
        .where(eq(empleados.id, peticion.params.id))
        .returning({ id: empleados.id, nombre: empleados.nombre });

      if (!desactivado) throw new ErrorNoEncontrado(`No existe el empleado ${peticion.params.id}`);
      return { desactivado: true, ...desactivado };
    },
  });

  /** Saldo del ahorro y si ya se cumplieron los 3 meses para entregarlo. */
  app.get('/:id/ahorro', {
    schema: {
      params: z.object({ id: zId }),
      querystring: z.object({ hoy: zFecha.optional() }),
    },
    handler: async (peticion) => {
      const hoy = peticion.query.hoy ?? new Date().toISOString().slice(0, 10);
      return obtenerSaldoAhorro(peticion.params.id, hoy);
    },
  });

  /** Obtiene el préstamo y su historial de movimientos. */
  app.get('/:id/prestamo', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const prestamo = await obtenerPrestamo(peticion.params.id);
      const movimientos = await historialMovimientos(peticion.params.id);
      return { prestamo, movimientos };
    },
  });

  /** Registra un nuevo préstamo al empleado. */
  app.post('/:id/prestamo', {
    schema: {
      params: z.object({ id: zId }),
      body: z.object({
        monto: z.number().int().positive(),
        fecha: zFecha,
        concepto: z.string().optional(),
      }),
    },
    handler: async (peticion, respuesta) => {
      const movimiento = await registrarPrestamo({
        empleadoId: peticion.params.id,
        monto: peticion.body.monto,
        fecha: peticion.body.fecha,
        concepto: peticion.body.concepto,
      });
      respuesta.code(201);
      return movimiento;
    },
  });
};
