import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { db, esquema } from '../db/cliente.js';
import { aRegistroVenta, aRegistroCobro, aGastoEmpleado } from '../db/mapeo.js';
import { ErrorNoEncontrado } from '../errores.js';
import { zNuevaVenta, zNuevoCobro, zNuevoGasto, zFecha, zId } from './validacion.js';

const { empleados, registrosVenta, registrosCobro, gastosEmpleado } = esquema;

/** Filtros comunes de los listados de operaciones. */
const zFiltros = z.object({
  empleadoId: zId.optional(),
  municipioId: zId.optional(),
  desde: zFecha.optional(),
  hasta: zFecha.optional(),
});

/** Trae las tarifas vigentes del empleado para copiarlas al registro. */
async function tarifasDe(empleadoId: string) {
  const [empleado] = await db
    .select({
      tarifaVenta: empleados.tarifaVenta,
      tarifaLiquidacion: empleados.tarifaLiquidacion,
      porcentajeCobro: empleados.porcentajeCobro,
    })
    .from(empleados)
    .where(eq(empleados.id, empleadoId))
    .limit(1);

  if (!empleado) throw new ErrorNoEncontrado(`No existe el empleado ${empleadoId}`);
  return empleado;
}

function condiciones(
  filtros: z.infer<typeof zFiltros>,
  columnaEmpleado: SQLiteColumn,
  columnaFecha: SQLiteColumn,
  columnaMunicipio?: SQLiteColumn,
) {
  const partes = [];
  if (filtros.empleadoId) partes.push(eq(columnaEmpleado, filtros.empleadoId));
  if (filtros.municipioId && columnaMunicipio) partes.push(eq(columnaMunicipio, filtros.municipioId));
  if (filtros.desde) partes.push(gte(columnaFecha, filtros.desde));
  if (filtros.hasta) partes.push(lte(columnaFecha, filtros.hasta));
  return partes.length > 0 ? and(...partes) : undefined;
}

export const rutasVentas: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: { querystring: zFiltros },
    handler: async (peticion) => {
      const filas = await db
        .select()
        .from(registrosVenta)
        .where(
          condiciones(
            peticion.query,
            registrosVenta.empleadoId,
            registrosVenta.fecha,
            registrosVenta.municipioId,
          ),
        )
        .orderBy(desc(registrosVenta.fecha));
      return filas.map(aRegistroVenta);
    },
  });

  /**
   * Registra las ventas del dia: "hoy Adriana hizo 12 ventas".
   * Las tarifas se copian del empleado en este momento y quedan congeladas
   * en el registro.
   */
  app.post('/', {
    schema: { body: zNuevaVenta },
    handler: async (peticion, respuesta) => {
      const tarifas = await tarifasDe(peticion.body.empleadoId);
      const [creado] = await db
        .insert(registrosVenta)
        .values({
          ...peticion.body,
          tarifaVenta: tarifas.tarifaVenta,
          tarifaLiquidacion: tarifas.tarifaLiquidacion,
        })
        .returning();

      respuesta.code(201);
      return aRegistroVenta(creado!);
    },
  });

  app.delete('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [borrado] = await db
        .delete(registrosVenta)
        .where(eq(registrosVenta.id, peticion.params.id))
        .returning({ id: registrosVenta.id });

      if (!borrado) throw new ErrorNoEncontrado(`No existe la venta ${peticion.params.id}`);
      return { borrado: true, id: borrado.id };
    },
  });
};

export const rutasCobros: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: { querystring: zFiltros },
    handler: async (peticion) => {
      const filas = await db
        .select()
        .from(registrosCobro)
        .where(
          condiciones(
            peticion.query,
            registrosCobro.empleadoId,
            registrosCobro.fecha,
            registrosCobro.municipioId,
          ),
        )
        .orderBy(desc(registrosCobro.fecha));
      return filas.map(aRegistroCobro);
    },
  });

  /** Registra un recaudo. El porcentaje del empleado se copia al registro. */
  app.post('/', {
    schema: { body: zNuevoCobro },
    handler: async (peticion, respuesta) => {
      const tarifas = await tarifasDe(peticion.body.empleadoId);
      const [creado] = await db
        .insert(registrosCobro)
        .values({ ...peticion.body, porcentajeAplicado: tarifas.porcentajeCobro })
        .returning();

      respuesta.code(201);
      return aRegistroCobro(creado!);
    },
  });

  app.delete('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [borrado] = await db
        .delete(registrosCobro)
        .where(eq(registrosCobro.id, peticion.params.id))
        .returning({ id: registrosCobro.id });

      if (!borrado) throw new ErrorNoEncontrado(`No existe el cobro ${peticion.params.id}`);
      return { borrado: true, id: borrado.id };
    },
  });
};

export const rutasGastos: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: { querystring: zFiltros },
    handler: async (peticion) => {
      const filas = await db
        .select()
        .from(gastosEmpleado)
        .where(
          condiciones(
            peticion.query,
            gastosEmpleado.empleadoId,
            gastosEmpleado.fecha,
            gastosEmpleado.municipioId,
          ),
        )
        .orderBy(desc(gastosEmpleado.fecha));
      return filas.map(aGastoEmpleado);
    },
  });

  app.post('/', {
    schema: { body: zNuevoGasto },
    handler: async (peticion, respuesta) => {
      await tarifasDe(peticion.body.empleadoId); // valida que exista
      const [creado] = await db.insert(gastosEmpleado).values(peticion.body).returning();
      respuesta.code(201);
      return aGastoEmpleado(creado!);
    },
  });

  app.delete('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [borrado] = await db
        .delete(gastosEmpleado)
        .where(eq(gastosEmpleado.id, peticion.params.id))
        .returning({ id: gastosEmpleado.id });

      if (!borrado) throw new ErrorNoEncontrado(`No existe el gasto ${peticion.params.id}`);
      return { borrado: true, id: borrado.id };
    },
  });
};
