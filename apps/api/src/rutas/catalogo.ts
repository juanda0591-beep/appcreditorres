import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, eq, asc } from 'drizzle-orm';
import { enlaceCompartirCatalogo, enlaceConsultaProducto, type ImagenProducto } from '@credito/shared';
import { db, esquema } from '../db/cliente.js';
import { config } from '../config.js';
import { obtenerConfiguracion } from '../servicios/configuracion.js';
import { paginaCatalogo } from '../vistas/catalogo.js';

const { productos } = esquema;

/**
 * Catalogo PUBLICO. Sin login: lo abre cualquiera con el enlace.
 *
 * Por eso las consultas seleccionan campos uno por uno en vez de traer la fila
 * completa. Si manana alguien agrega una columna privada a la tabla (un costo,
 * un proveedor), no se filtra sola al catalogo.
 */
export const rutasCatalogo: FastifyPluginAsyncZod = async (app) => {
  /** Datos del catalogo en JSON. Lo consume el frontend. */
  app.get('/api/catalogo', async (_peticion, respuesta) => {
    const ajustes = await obtenerConfiguracion();

    if (!ajustes.catalogoActivo) {
      return respuesta.code(404).send({
        error: 'CATALOGO_INACTIVO',
        mensaje: 'El catalogo no esta disponible en este momento.',
      });
    }

    const items = await db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        descripcion: productos.descripcion,
        precio: productos.precio,
        precioContado: productos.precioContado,
        precioCredicontado: productos.precioCredicontado,
        precioCredito: productos.precioCredito,
        inicial: productos.inicial,
        pagoSemanal: productos.pagoSemanal,
        categoria: productos.categoria,
        imagenes: productos.imagenes,
        imagenUrl: productos.imagenUrl,
        miniaturaUrl: productos.miniaturaUrl,
        disponible: productos.disponible,
        esNuevo: productos.esNuevo,
        enPromocion: productos.enPromocion,
      })
      .from(productos)
      .where(and(eq(productos.visible, true)))
      .orderBy(asc(productos.orden), asc(productos.nombre));

    return {
      negocio: {
        nombre: ajustes.nombreNegocio,
        titulo: ajustes.tituloCatalogo,
        descripcion: ajustes.descripcionCatalogo,
        notaPie: ajustes.notaPie,
        mostrarPrecios: ajustes.mostrarPrecios,
      },
      productos: items.map((item) => {
        let imagenes: ImagenProducto[] = [];
        if (item.imagenes) {
          try {
            imagenes = JSON.parse(item.imagenes);
          } catch {
            imagenes = [];
          }
        }
        if (imagenes.length === 0 && item.imagenUrl && item.miniaturaUrl) {
          imagenes = [{ imagenUrl: item.imagenUrl, miniaturaUrl: item.miniaturaUrl }];
        }

        const pagoSemanal = item.pagoSemanal || 0;

        return {
          ...item,
          imagenes,
          precios: {
            contado: item.precioContado || 0,
            credicontado: item.precioCredicontado || 0,
            credito: item.precioCredito || 0,
            inicial: item.inicial || 0,
            pagoSemanal,
            pagoQuincenal: pagoSemanal * 2,
            pagoMensual: pagoSemanal * 4,
          },
          precio: ajustes.mostrarPrecios ? item.precio : null,
          enlaceWhatsapp: enlaceConsultaProducto({
            numeroNegocio: ajustes.whatsappNumero,
            plantilla: ajustes.plantillaConsulta,
            producto: item.nombre,
            precio: item.precio,
            mostrarPrecio: ajustes.mostrarPrecios,
          }),
        };
      }),
    };
  });

  /**
   * Pagina del catalogo en HTML, generada en el servidor.
   *
   * IMPORTANTE: esto es HTML y no la app de React a proposito.
   *
   * El robot que WhatsApp usa para armar la vista previa del chat NO ejecuta
   * JavaScript: solo lee el HTML que llega. Una app de React entrega un archivo
   * casi vacio y lo llena despues en el navegador, asi que WhatsApp veria una
   * pagina sin titulo ni imagen y mostraria el enlace pelado.
   *
   * Sirviendo el HTML ya armado, la vista previa sale bien y el catalogo
   * carga de una en celulares con mala senal. El panel de administracion si
   * es React, donde ese trabajo rinde.
   */
  app.get('/catalogo', async (_peticion, respuesta) => {
    const ajustes = await obtenerConfiguracion();

    if (!ajustes.catalogoActivo) {
      return respuesta
        .code(404)
        .type('text/html; charset=utf-8')
        .send('<!doctype html><meta charset="utf-8"><p>El catalogo no esta disponible.</p>');
    }

    const items = await db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        descripcion: productos.descripcion,
        precio: productos.precio,
        precioContado: productos.precioContado,
        precioCredicontado: productos.precioCredicontado,
        precioCredito: productos.precioCredito,
        inicial: productos.inicial,
        pagoSemanal: productos.pagoSemanal,
        categoria: productos.categoria,
        imagenes: productos.imagenes,
        imagenUrl: productos.imagenUrl,
        miniaturaUrl: productos.miniaturaUrl,
        disponible: productos.disponible,
        esNuevo: productos.esNuevo,
        enPromocion: productos.enPromocion,
      })
      .from(productos)
      .where(eq(productos.visible, true))
      .orderBy(asc(productos.orden), asc(productos.nombre));

    const html = paginaCatalogo({
      ajustes,
      productos: items,
      urlPublica: config.urlPublica,
    });

    return respuesta
      .code(200)
      .type('text/html; charset=utf-8')
      // Cache corto: si cambias un precio, el cliente lo ve en un minuto,
      // pero varias visitas seguidas no vuelven a golpear la base.
      .header('cache-control', 'public, max-age=60')
      .send(html);
  });

  /** Enlace listo para compartir el catalogo por WhatsApp. */
  app.get('/api/catalogo/compartir', async () => {
    const ajustes = await obtenerConfiguracion();
    const link = `${config.urlPublica}/catalogo`;

    return {
      link,
      enlaceWhatsapp: enlaceCompartirCatalogo({
        plantilla: ajustes.plantillaMensaje,
        titulo: ajustes.tituloCatalogo,
        link,
      }),
    };
  });
};
