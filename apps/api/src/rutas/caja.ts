import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, esquema } from '../db/cliente.js';
import { ErrorNoEncontrado, ErrorConflicto } from '../errores.js';
import { obtenerBalance } from '../servicios/caja.js';
import { zNuevoMovimientoCaja, zFecha, zId } from './validacion.js';

const { movimientosCaja } = esquema;

export const rutasCaja: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: {
      querystring: z.object({
        desde: zFecha.optional(),
        hasta: zFecha.optional(),
        tipo: z.enum(['ingreso', 'egreso']).optional(),
      }),
    },
    handler: async (peticion) => {
      const partes = [];
      if (peticion.query.desde) partes.push(gte(movimientosCaja.fecha, peticion.query.desde));
      if (peticion.query.hasta) partes.push(lte(movimientosCaja.fecha, peticion.query.hasta));
      if (peticion.query.tipo) partes.push(eq(movimientosCaja.tipo, peticion.query.tipo));

      return db
        .select()
        .from(movimientosCaja)
        .where(partes.length > 0 ? and(...partes) : undefined)
        .orderBy(desc(movimientosCaja.fecha));
    },
  });

  /** Balance del periodo: ingresos, egresos y desglose por categoria. */
  app.get('/balance', {
    schema: { querystring: z.object({ desde: zFecha, hasta: zFecha }) },
    handler: async (peticion) =>
      obtenerBalance({ desde: peticion.query.desde, hasta: peticion.query.hasta }),
  });

  app.post('/', {
    schema: { body: zNuevoMovimientoCaja },
    handler: async (peticion, respuesta) => {
      const [creado] = await db
        .insert(movimientosCaja)
        .values({ ...peticion.body, origen: 'manual' })
        .returning();
      respuesta.code(201);
      return creado!;
    },
  });

  /**
   * Solo se pueden borrar los movimientos registrados a mano.
   *
   * Los que genero el sistema (una liquidacion, una entrega de ahorro) se
   * quedan: si se borrara el egreso de un pago que si se hizo, el balance
   * mostraria plata que en realidad ya no esta. Para deshacer esos, se anula
   * la liquidacion que los origino.
   */
  app.delete('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [movimiento] = await db
        .select({ id: movimientosCaja.id, origen: movimientosCaja.origen })
        .from(movimientosCaja)
        .where(eq(movimientosCaja.id, peticion.params.id))
        .limit(1);

      if (!movimiento) {
        throw new ErrorNoEncontrado(`No existe el movimiento ${peticion.params.id}`);
      }

      if (movimiento.origen && movimiento.origen !== 'manual') {
        throw new ErrorConflicto(
          `Este movimiento lo genero el sistema (${movimiento.origen}) y no se puede ` +
            `borrar directamente. Anula la operacion que lo origino.`,
        );
      }

      await db.delete(movimientosCaja).where(eq(movimientosCaja.id, peticion.params.id));
      return { borrado: true, id: movimiento.id };
    },
  });
};
