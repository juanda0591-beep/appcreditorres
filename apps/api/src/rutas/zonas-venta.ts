import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normalizarNumero } from '@credito/shared';
import { db, esquema } from '../db/cliente.js';
import { aZonaVenta } from '../db/mapeo.js';
import { ErrorNoEncontrado, ErrorConflicto, ErrorDatosInvalidos } from '../errores.js';
import { zNuevaZonaVenta, zZonaVentaParcial, zId } from './validacion.js';

const { zonasVenta } = esquema;

/**
 * Detecta el choque con el indice unico del nombre.
 *
 * Misma logica que en municipios.ts: hay que recorrer la cadena de causas
 * porque libSQL envuelve el error de SQLite dentro de otros dos.
 */
function esNombreRepetido(error: unknown): boolean {
  let actual: unknown = error;

  for (let nivel = 0; nivel < 5 && actual instanceof Error; nivel += 1) {
    if (actual.message.includes('UNIQUE constraint failed')) return true;
    actual = (actual as { cause?: unknown }).cause;
  }

  return false;
}

/** Valida y normaliza el numero de WhatsApp del vendedor de la zona. */
function normalizarVendedor(numero: string): string {
  const normalizado = normalizarNumero(numero);
  if (!normalizado) {
    throw new ErrorDatosInvalidos(
      `El numero de vendedor "${numero}" no parece valido. ` +
        `Escribelo con indicativo, por ejemplo: 3001234567`,
    );
  }
  return normalizado;
}

export const rutasZonasVenta: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    handler: async () => {
      const filas = await db.select().from(zonasVenta).orderBy(zonasVenta.nombre);
      return filas.map(aZonaVenta);
    },
  });

  app.post('/', {
    schema: { body: zNuevaZonaVenta },
    handler: async (peticion, respuesta) => {
      try {
        const datos = {
          ...peticion.body,
          whatsappVendedor: normalizarVendedor(peticion.body.whatsappVendedor),
        };
        const [creada] = await db.insert(zonasVenta).values(datos).returning();
        respuesta.code(201);
        return aZonaVenta(creada!);
      } catch (error) {
        if (esNombreRepetido(error)) {
          throw new ErrorConflicto(`Ya existe una zona llamada ${peticion.body.nombre}`);
        }
        throw error;
      }
    },
  });

  app.patch('/:id', {
    schema: { params: z.object({ id: zId }), body: zZonaVentaParcial },
    handler: async (peticion) => {
      try {
        const cambios = {
          ...peticion.body,
          ...(peticion.body.whatsappVendedor
            ? { whatsappVendedor: normalizarVendedor(peticion.body.whatsappVendedor) }
            : {}),
        };

        const [actualizada] = await db
          .update(zonasVenta)
          .set(cambios)
          .where(eq(zonasVenta.id, peticion.params.id))
          .returning();

        if (!actualizada) {
          throw new ErrorNoEncontrado(`No existe la zona ${peticion.params.id}`);
        }
        return aZonaVenta(actualizada);
      } catch (error) {
        if (esNombreRepetido(error)) {
          throw new ErrorConflicto(`Ya existe una zona llamada ${peticion.body.nombre}`);
        }
        throw error;
      }
    },
  });
};
