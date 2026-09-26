import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import OpenAI from 'openai';
import XLSX from 'xlsx';
import { db, esquema } from '../db/cliente.js';
import { config } from '../config.js';
import { ErrorNoEncontrado, ErrorDatosInvalidos } from '../errores.js';
import { guardarImagenProducto, borrarImagenProducto } from '../servicios/imagenes.js';
import { leerConfigIA } from './admin-ia.js';
import { zNuevoProducto, zProductoParcial, zId } from './validacion.js';
import { aProducto } from '../db/mapeo.js';
import type { ImagenProducto } from '@credito/shared';

const { productos } = esquema;

function normalizarEncabezado(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function textoCelda(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

function dineroCelda(valor: unknown, fila: number, columna: string): number {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) return Math.round(valor);
  const texto = textoCelda(valor);
  if (!texto) return 0;
  const limpio = texto.replace(/[\s$]/g, '');
  const numero = Number(limpio.replace(/\./g, '').replace(',', '.'));
  if (!/^\d[\d.,]*$/.test(limpio) || !Number.isFinite(numero) || numero < 0) {
    throw new ErrorDatosInvalidos(`Fila ${fila}: el valor de ${columna} no es un precio valido.`);
  }
  return Math.round(numero);
}

function valorColumna(fila: Record<string, unknown>, ...nombres: string[]): unknown {
  for (const nombre of nombres) {
    const clave = normalizarEncabezado(nombre);
    const encontrada = Object.keys(fila).find((actual) => normalizarEncabezado(actual) === clave);
    if (encontrada !== undefined) return fila[encontrada];
  }
  return undefined;
}

/**
 * Administracion de productos (PRIVADO).
 *
 * Estas rutas modifican el catalogo. La lectura publica esta aparte,
 * en catalogo.ts, y solo devuelve los productos visibles.
 */
export const rutasProductos: FastifyPluginAsyncZod = async (app) => {
  /** Importa productos desde un Excel sin tocar fotos ni productos existentes. */
  app.post('/importar-excel', async (peticion, respuesta) => {
    const archivo = await peticion.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!archivo) {
      return respuesta.code(400).send({ error: 'ARCHIVO_REQUERIDO', mensaje: 'Selecciona un archivo Excel.' });
    }

    const nombreArchivo = archivo.filename.toLowerCase();
    if (!nombreArchivo.endsWith('.xlsx') && !nombreArchivo.endsWith('.xls')) {
      return respuesta.code(400).send({ error: 'FORMATO_INVALIDO', mensaje: 'El archivo debe ser .xlsx o .xls.' });
    }

    let filas: Array<Record<string, unknown>>;
    try {
      const libro = XLSX.read(await archivo.toBuffer(), { type: 'buffer', cellDates: false });
      const hoja = libro.Sheets[libro.SheetNames[0] ?? ''];
      if (!hoja) throw new Error('El archivo no tiene hojas.');
      filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: null });
    } catch {
      return respuesta.code(400).send({ error: 'EXCEL_INVALIDO', mensaje: 'No se pudo leer el archivo Excel.' });
    }

    if (filas.length === 0) {
      return respuesta.code(400).send({ error: 'EXCEL_VACIO', mensaje: 'El Excel no contiene filas de productos.' });
    }

    const encabezados = Object.keys(filas[0] ?? {}).map(normalizarEncabezado);
    if (!encabezados.some((clave) => ['nombreproducto', 'nombre', 'producto'].includes(clave))) {
      return respuesta.code(400).send({
        error: 'COLUMNA_REQUERIDA',
        mensaje: 'El Excel debe tener una columna NombreProducto, Nombre o Producto.',
      });
    }
    if (!encabezados.some((clave) => ['preciocontados', 'preciocontado', 'contado', 'preciocredito', 'credito', 'preciocredicontado', 'credicontado'].includes(clave))) {
      return respuesta.code(400).send({ error: 'COLUMNA_REQUERIDA', mensaje: 'El Excel debe tener al menos una columna de precio.' });
    }
    if (filas.length > 1000) {
      return respuesta.code(400).send({ error: 'EXCEL_MUY_GRANDE', mensaje: 'Importa hasta 1000 productos por archivo.' });
    }

    const existentes = await db.select({ nombre: productos.nombre, orden: productos.orden }).from(productos);
    const nombresExistentes = new Set(existentes.map((producto) => producto.nombre.trim().toLocaleLowerCase('es')));
    let orden = existentes.reduce((maximo, producto) => Math.max(maximo, producto.orden), 0);
    const creados: string[] = [];
    const omitidos: Array<{ fila: number; nombre: string; motivo: string }> = [];
    const pendientes: Array<typeof productos.$inferInsert> = [];

    filas.forEach((fila, indice) => {
      const numeroFila = indice + 2;
      const nombre = textoCelda(valorColumna(fila, 'NombreProducto', 'Nombre', 'Producto'));
      if (!nombre) {
        omitidos.push({ fila: numeroFila, nombre: '', motivo: 'Falta el nombre' });
        return;
      }

      const clave = nombre.toLocaleLowerCase('es');
      if (nombresExistentes.has(clave)) {
        omitidos.push({ fila: numeroFila, nombre, motivo: 'Ya existe' });
        return;
      }

      const precioContado = dineroCelda(valorColumna(fila, 'Precio contados', 'Precio contado', 'Contado'), numeroFila, 'precio contado');
      const precioCredito = dineroCelda(valorColumna(fila, 'PrecioCredito', 'Precio credito', 'Credito'), numeroFila, 'precio credito');
      const precioCredicontado = dineroCelda(valorColumna(fila, 'PrecioCrediContado', 'Precio credicontado', 'Credicontado'), numeroFila, 'precio credicontado');
      const inicial = dineroCelda(valorColumna(fila, 'Precio Inicial', 'Inicial'), numeroFila, 'inicial');
      const pagoSemanal = dineroCelda(valorColumna(fila, 'Pago Semanal', 'Semanal'), numeroFila, 'pago semanal');
      if (precioContado === 0 && precioCredito === 0 && precioCredicontado === 0) {
        omitidos.push({ fila: numeroFila, nombre, motivo: 'Sin precio' });
        return;
      }
      orden += 1;
      pendientes.push({
        nombre,
        descripcion: textoCelda(valorColumna(fila, 'Descripcion', 'Descripción')) || null,
        categoria: textoCelda(valorColumna(fila, 'Categoria', 'Categoría')) || null,
        precioContado,
        precioCredito,
        precioCredicontado,
        inicial,
        pagoSemanal,
        precio: precioContado || precioCredicontado || precioCredito,
        visible: true,
        disponible: true,
        esNuevo: false,
        enPromocion: false,
        orden,
      });
      nombresExistentes.add(clave);
      creados.push(nombre);
    });

    if (pendientes.length > 0) {
      await db.transaction(async (tx) => {
        for (let indice = 0; indice < pendientes.length; indice += 100) {
          await tx.insert(productos).values(pendientes.slice(indice, indice + 100));
        }
      });
    }

    return {
      filasLeidas: filas.length,
      creados: creados.length,
      omitidos,
      imagenes: 0,
    };
  });

  /** Genera una descripcion comercial breve para el formulario de producto. */
  app.post('/generar-descripcion', {
    schema: {
      body: z.object({
        nombre: z.string().trim().min(1).max(150),
        categoria: z.string().trim().max(60).nullish(),
        precioContado: z.number().nonnegative().optional(),
        precioCredicontado: z.number().nonnegative().optional(),
        precioCredito: z.number().nonnegative().optional(),
      }),
    },
    handler: async (peticion, respuesta) => {
      const configIA = await leerConfigIA();
      if (!configIA.apiKey) {
        return respuesta.code(400).send({
          error: 'IA_NO_CONFIGURADA',
          mensaje: 'Configura la API key de IA en Administracion antes de generar descripciones.',
        });
      }

      const precios = [
        peticion.body.precioContado ? `contado: ${peticion.body.precioContado}` : '',
        peticion.body.precioCredicontado ? `credicontado: ${peticion.body.precioCredicontado}` : '',
        peticion.body.precioCredito ? `credito: ${peticion.body.precioCredito}` : '',
      ].filter(Boolean).join(', ');

      try {
        const cliente = new OpenAI({ apiKey: configIA.apiKey });
        const respuestaIA = await cliente.chat.completions.create({
          model: configIA.modelo || 'gpt-4o-mini',
          temperature: Math.min(Math.max(configIA.temperatura ?? 0.7, 0), 1),
          max_tokens: 120,
          messages: [
            {
              role: 'system',
              content: 'Eres copywriter de un catalogo de productos en Colombia. Escribe descripciones cortas, claras y persuasivas en espanol. Usa solo los datos recibidos: no inventes materiales, medidas, marcas, garantia ni beneficios especificos. Devuelve solo una descripcion de una o dos frases, de maximo 180 caracteres, sin comillas, emojis ni etiquetas.',
            },
            {
              role: 'user',
              content: `Producto: ${peticion.body.nombre}\nCategoria: ${peticion.body.categoria || 'sin categoria'}\nPrecios disponibles: ${precios || 'no indicados'}`,
            },
          ],
        });

        const descripcion = respuestaIA.choices[0]?.message?.content?.trim().replace(/^['"]|['"]$/g, '');
        if (!descripcion) {
          return respuesta.code(502).send({ error: 'IA_SIN_RESPUESTA', mensaje: 'La IA no devolvio una descripcion.' });
        }

        return { descripcion: descripcion.slice(0, 180) };
      } catch (error) {
        peticion.log.error({ err: error }, 'Error al generar descripcion de producto');
        return respuesta.code(502).send({
          error: 'IA_NO_DISPONIBLE',
          mensaje: 'No se pudo generar la descripcion. Revisa la configuracion de IA e intentalo de nuevo.',
        });
      }
    },
  });

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
