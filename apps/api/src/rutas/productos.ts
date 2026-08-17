import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db, esquema } from '../db/cliente.js';
import { config } from '../config.js';
import { ErrorNoEncontrado, ErrorDatosInvalidos } from '../errores.js';
import { guardarImagenProducto, borrarImagenProducto } from '../servicios/imagenes.js';
import { zNuevoProducto, zProductoParcial, zId } from './validacion.js';
import { aProducto } from '../db/mapeo.js';
import type { ImagenProducto } from '@credito/shared';

const { productos } = esquema;

/**
 * Administracion de productos (PRIVADO).
 *
 * Estas rutas modifican el catalogo. La lectura publica esta aparte,
 * en catalogo.ts, y solo devuelve los productos visibles.
 */
export const rutasProductos: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: { querystring: z.object({ categoria: z.string().optional() }) },
    handler: async (peticion) => {
      const filtro = peticion.query.categoria;
      const filas = filtro
        ? await db.select().from(productos).where(eq(productos.categoria, filtro)).orderBy(asc(productos.orden))
        : await db.select().from(productos).orderBy(asc(productos.orden), asc(productos.nombre));

      return filas.map(aProducto);
    },
  });

  app.post('/', {
    schema: { body: zNuevoProducto },
    handler: async (peticion, respuesta) => {
      const [creado] = await db.insert(productos).values({
        nombre: peticion.body.nombre,
        descripcion: peticion.body.descripcion ?? null,
        categoria: peticion.body.categoria ?? null,
        precio: peticion.body.precio ?? 0,
        precioContado: peticion.body.precioContado ?? 0,
        precioCredicontado: peticion.body.precioCredicontado ?? 0,
        precioCredito: peticion.body.precioCredito ?? 0,
        inicial: peticion.body.inicial ?? 0,
        pagoSemanal: peticion.body.pagoSemanal ?? 0,
        visible: peticion.body.visible ?? true,
        disponible: peticion.body.disponible ?? true,
        esNuevo: peticion.body.esNuevo ?? false,
        enPromocion: peticion.body.enPromocion ?? false,
        orden: peticion.body.orden ?? 0,
      }).returning();
      respuesta.code(201);
      return aProducto(creado!);
    },
  });

  app.patch('/:id', {
    schema: { params: z.object({ id: zId }), body: zProductoParcial },
    handler: async (peticion) => {
      const [actualizado] = await db
        .update(productos)
        .set({ ...peticion.body, actualizadoEn: new Date().toISOString() })
        .where(eq(productos.id, peticion.params.id))
        .returning();

      if (!actualizado) throw new ErrorNoEncontrado(`No existe el producto ${peticion.params.id}`);
      return aProducto(actualizado);
    },
  });

  /**
   * Sube la foto de un producto desde el celular.
   *
   * Espera multipart/form-data con un campo de archivo llamado "imagen".
   * El servidor la reduce y la convierte a WebP: una foto de 5 MB queda en
   * unos cientos de KB, que es la diferencia entre un catalogo que carga y
   * uno que el cliente cierra antes de ver.
   *
   * Ahora soporta múltiples imágenes: las nuevas se agregan al array existente.
   */
  app.post('/:id/imagen', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [producto] = await db
        .select()
        .from(productos)
        .where(eq(productos.id, peticion.params.id))
        .limit(1);

      if (!producto) throw new ErrorNoEncontrado(`No existe el producto ${peticion.params.id}`);

      const archivo = await peticion.file({ limits: { fileSize: config.maxBytesImagen } });
      if (!archivo) {
        throw new ErrorDatosInvalidos('No llego ninguna imagen en el campo "imagen".');
      }

      const datos = await archivo.toBuffer().catch(() => {
        // multipart lanza cuando el archivo pasa el limite configurado.
        const mb = Math.round(config.maxBytesImagen / (1024 * 1024));
        throw new ErrorDatosInvalidos(`La imagen supera el limite de ${mb} MB.`);
      });

      const guardada = await guardarImagenProducto(datos, archivo.mimetype);

      // Parsear imágenes existentes
      let imagenesExistentes: ImagenProducto[] = [];
      if (producto.imagenes) {
        try {
          imagenesExistentes = JSON.parse(producto.imagenes);
        } catch {
          imagenesExistentes = [];
        }
      }

      // Agregar la nueva imagen
      const nuevasImagenes: ImagenProducto[] = [
        ...imagenesExistentes,
        { imagenUrl: guardada.imagenUrl, miniaturaUrl: guardada.miniaturaUrl },
      ];

      const [actualizado] = await db
        .update(productos)
        .set({
          imagenes: JSON.stringify(nuevasImagenes),
          imagenUrl: nuevasImagenes.length > 0 && nuevasImagenes[0] ? nuevasImagenes[0].imagenUrl : null,
          miniaturaUrl: nuevasImagenes.length > 0 && nuevasImagenes[0] ? nuevasImagenes[0].miniaturaUrl : null,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(productos.id, producto.id))
        .returning();

      return {
        producto: aProducto(actualizado!),
        original: datos.length,
        procesada: guardada.bytes,
      };
    },
  });

  /** Quita la foto del producto y borra los archivos. */
  app.delete('/:id/imagen', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [producto] = await db
        .select()
        .from(productos)
        .where(eq(productos.id, peticion.params.id))
        .limit(1);

      if (!producto) throw new ErrorNoEncontrado(`No existe el producto ${peticion.params.id}`);

      // Parsear imágenes existentes y borrar todas
      let imagenesExistentes: ImagenProducto[] = [];
      if (producto.imagenes) {
        try {
          imagenesExistentes = JSON.parse(producto.imagenes);
        } catch {
          imagenesExistentes = [];
        }
      }

      await db
        .update(productos)
        .set({ imagenes: null, imagenUrl: null, miniaturaUrl: null, actualizadoEn: new Date().toISOString() })
        .where(eq(productos.id, producto.id));

      // Borrar todos los archivos de imágenes
      for (const img of imagenesExistentes) {
        await borrarImagenProducto(img.imagenUrl, img.miniaturaUrl);
      }

      return { borrada: true, id: producto.id };
    },
  });

  /** Elimina una imagen específica del producto */
  app.delete('/:id/imagen/:indice', {
    schema: { params: z.object({ id: zId, indice: z.coerce.number().int().nonnegative() }) },
    handler: async (peticion) => {
      const [producto] = await db
        .select()
        .from(productos)
        .where(eq(productos.id, peticion.params.id))
        .limit(1);

      if (!producto) throw new ErrorNoEncontrado(`No existe el producto ${peticion.params.id}`);

      let imagenesExistentes: ImagenProducto[] = [];
      if (producto.imagenes) {
        try {
          imagenesExistentes = JSON.parse(producto.imagenes);
        } catch {
          imagenesExistentes = [];
        }
      }

      const indice = peticion.params.indice;
      if (indice >= imagenesExistentes.length) {
        throw new ErrorNoEncontrado(`No existe la imagen en el índice ${indice}`);
      }

      const imagenABorrar = imagenesExistentes[indice];
      if (!imagenABorrar) {
        throw new ErrorNoEncontrado(`No existe la imagen en el índice ${indice}`);
      }

      const nuevasImagenes = imagenesExistentes.filter((_, i) => i !== indice);

      await db
        .update(productos)
        .set({
          imagenes: nuevasImagenes.length > 0 ? JSON.stringify(nuevasImagenes) : null,
          imagenUrl: nuevasImagenes[0]?.imagenUrl || null,
          miniaturaUrl: nuevasImagenes[0]?.miniaturaUrl || null,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(productos.id, producto.id));

      await borrarImagenProducto(imagenABorrar.imagenUrl, imagenABorrar.miniaturaUrl);

      return { borrada: true, id: producto.id, indice };
    },
  });

  app.delete('/:id', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => {
      const [borrado] = await db
        .delete(productos)
        .where(eq(productos.id, peticion.params.id))
        .returning();

      if (!borrado) throw new ErrorNoEncontrado(`No existe el producto ${peticion.params.id}`);

      // Parsear y borrar todas las imágenes
      let imagenesExistentes: ImagenProducto[] = [];
      if (borrado.imagenes) {
        try {
          imagenesExistentes = JSON.parse(borrado.imagenes);
        } catch {
          imagenesExistentes = [];
        }
      }

      for (const img of imagenesExistentes) {
        await borrarImagenProducto(img.imagenUrl, img.miniaturaUrl);
      }

      return { borrado: true, id: borrado.id };
    },
  });
};
