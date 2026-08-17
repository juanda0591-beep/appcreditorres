import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, esquema } from '../db/cliente.js';
import { aMunicipio } from '../db/mapeo.js';
import { ErrorNoEncontrado, ErrorConflicto } from '../errores.js';
import { zNuevoMunicipio, zId } from './validacion.js';

const { municipios } = esquema;

/**
 * Detecta el choque con el indice unico del nombre.
 *
 * Hay que recorrer la cadena de causas: libSQL envuelve el error de SQLite
 * dentro de otros dos ("Failed query" -> LibsqlError -> SqliteError), asi que
 * mirar solo el mensaje de arriba no siempre encuentra el texto y la respuesta
 * se iba en 500 en vez del 409 que corresponde.
 */
function esNombreRepetido(error: unknown): boolean {
  let actual: unknown = error;

  for (let nivel = 0; nivel < 5 && actual instanceof Error; nivel += 1) {
    if (actual.message.includes('UNIQUE constraint failed')) return true;
    actual = (actual as { cause?: unknown }).cause;
  }

  return false;
}

export const rutasMunicipios: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    handler: async () => {
      const filas = await db.select().from(municipios).orderBy(municipios.nombre);
      return filas.map(aMunicipio);
    },
  });

  app.post('/', {
    schema: { body: zNuevoMunicipio },
    handler: async (peticion, respuesta) => {
      try {
        const [creado] = await db.insert(municipios).values(peticion.body).returning();
        respuesta.code(201);
        return aMunicipio(creado!);
      } catch (error) {
        if (esNombreRepetido(error)) {
          throw new ErrorConflicto(`Ya existe un municipio llamado ${peticion.body.nombre}`);
        }
        throw error;
      }
    },
  });

  /**
   * Cambiar la meta o el porcentaje afecta SOLO los bonos que se calculen
   * de aqui en adelante. Las liquidaciones ya pagadas guardan su propio
   * detalle de bonos, asi que no se recalculan hacia atras.
   */
  app.patch('/:id', {
    schema: { params: z.object({ id: zId }), body: zNuevoMunicipio.partial() },
    handler: async (peticion) => {
      try {
        const [actualizado] = await db
          .update(municipios)
          .set(peticion.body)
          .where(eq(municipios.id, peticion.params.id))
          .returning();

        if (!actualizado) {
          throw new ErrorNoEncontrado(`No existe el municipio ${peticion.params.id}`);
        }
        return aMunicipio(actualizado);
      } catch (error) {
        // Mismo choque que al crear: renombrar a un nombre que ya existe. Desde
        // la pantalla es un error corregible, asi que va 409 con explicacion y
        // no el 500 que salia antes de que hubiera boton para renombrar.
        if (esNombreRepetido(error)) {
          throw new ErrorConflicto(`Ya existe un municipio llamado ${peticion.body.nombre}`);
        }
        throw error;
      }
    },
  });
};
