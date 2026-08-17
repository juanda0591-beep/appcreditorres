import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { normalizarNumero } from '@credito/shared';
import { obtenerConfiguracion, actualizarConfiguracion } from '../servicios/configuracion.js';
import { guardarLogoNegocio, borrarLogoNegocio } from '../servicios/imagenes.js';
import { config } from '../config.js';
import { ErrorDatosInvalidos } from '../errores.js';
import { zConfiguracion } from './validacion.js';

/**
 * Configuracion del negocio y del catalogo (PRIVADO).
 * Desde aqui se administra todo lo que se comparte por WhatsApp.
 */
export const rutasConfiguracion: FastifyPluginAsyncZod = async (app) => {
  app.get('/', async () => obtenerConfiguracion());

  app.patch('/', {
    schema: { body: zConfiguracion },
    handler: async (peticion) => {
      const cambios = peticion.body;

      // Se valida el numero al guardarlo, no al usarlo: es mejor avisar aqui
      // que dejar el catalogo con un boton de WhatsApp que no abre nada.
      if (cambios.whatsappNumero) {
        const normalizado = normalizarNumero(cambios.whatsappNumero);
        if (!normalizado) {
          throw new ErrorDatosInvalidos(
            `El numero "${cambios.whatsappNumero}" no parece valido. ` +
              `Escribelo con indicativo, por ejemplo: 3001234567`,
          );
        }
        cambios.whatsappNumero = normalizado;
      }

      return actualizarConfiguracion(cambios);
    },
  });

  /**
   * Sube el logo del negocio.
   *
   * Espera multipart/form-data con un campo de archivo llamado "logo".
   * Se guarda en PNG porque de ahi lo toma el comprobante en PDF.
   */
  app.post('/logo', async (peticion) => {
    const previa = await obtenerConfiguracion();

    const archivo = await peticion.file({ limits: { fileSize: config.maxBytesImagen } });
    if (!archivo) {
      throw new ErrorDatosInvalidos('No llego ninguna imagen en el campo "logo".');
    }

    const datos = await archivo.toBuffer().catch(() => {
      const mb = Math.round(config.maxBytesImagen / (1024 * 1024));
      throw new ErrorDatosInvalidos(`La imagen supera el limite de ${mb} MB.`);
    });

    const guardado = await guardarLogoNegocio(datos, archivo.mimetype);
    const actualizada = await actualizarConfiguracion({ logoUrl: guardado.logoUrl });

    // El anterior se borra despues de guardar el nuevo: si algo falla antes, el
    // negocio conserva el logo que tenia en vez de quedarse sin ninguno.
    if (previa.logoUrl && previa.logoUrl !== guardado.logoUrl) {
      await borrarLogoNegocio(previa.logoUrl);
    }

    return { configuracion: actualizada, original: datos.length, procesada: guardado.bytes };
  });

  /** Quita el logo y borra el archivo. */
  app.delete('/logo', async () => {
    const previa = await obtenerConfiguracion();
    const actualizada = await actualizarConfiguracion({ logoUrl: null });
    await borrarLogoNegocio(previa.logoUrl);
    return { borrado: true, configuracion: actualizada };
  });

  /** Vista previa del mensaje sin guardar nada, para probar las plantillas. */
  app.post('/previsualizar-mensaje', {
    schema: { body: zConfiguracion.pick({ plantillaMensaje: true, plantillaConsulta: true }) },
    handler: async (peticion) => {
      const ajustes = await obtenerConfiguracion();
      const { aplicarPlantilla, formatearPesos } = await import('@credito/shared');

      return {
        compartirCatalogo: aplicarPlantilla(
          peticion.body.plantillaMensaje ?? ajustes.plantillaMensaje,
          { titulo: ajustes.tituloCatalogo, link: 'https://tu-dominio.com/catalogo' },
        ),
        consultaProducto: aplicarPlantilla(
          peticion.body.plantillaConsulta ?? ajustes.plantillaConsulta,
          { producto: 'Camiseta azul', precio: formatearPesos(45_000) },
        ),
      };
    },
  });
};
