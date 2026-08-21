import type { FechaHoraISO } from './base.js';

/**
 * Configuracion editable del negocio y del catalogo.
 * Todo lo que hay aqui es publico: sale en el catalogo compartido.
 */
export interface Configuracion {
  nombreNegocio: string;

  /** Numero de WhatsApp con indicador de pais. Ej: 573001234567 */
  whatsappNumero: string | null;

  /**
   * Numero de WhatsApp del vendedor que recibe el aviso cuando un cliente
   * muestra intencion de compra en el agente de IA. Ej: 573001234567
   */
  whatsappVendedor: string | null;

  tituloCatalogo: string;
  descripcionCatalogo: string | null;

  /** Plantilla para compartir el catalogo. Admite {{titulo}} y {{link}}. */
  plantillaMensaje: string;

  /** Plantilla para preguntar por un producto. Admite {{producto}} y {{precio}}. */
  plantillaConsulta: string;

  notaPie: string | null;
  catalogoActivo: boolean;
  mostrarPrecios: boolean;

  /**
   * URL publica del logo del negocio. Sale en el comprobante de pago.
   *
   * Se guarda en PNG y no en WebP como las fotos de productos: el generador de
   * PDF solo sabe leer JPEG y PNG, y un WebP aqui haria que el comprobante
   * saliera sin logo.
   */
  logoUrl: string | null;

  actualizadoEn: FechaHoraISO;
}

/**
 * Campos que se pueden editar desde la pantalla de configuracion.
 *
 * logoUrl entra aqui porque el servicio la escribe al subir el archivo, pero
 * NO esta en el esquema de validacion de la ruta PATCH: la URL la decide el
 * servidor al procesar la imagen, no el navegador.
 */
export type ConfiguracionEditable = Partial<
  Omit<Configuracion, 'actualizadoEn'>
>;

/** Marcadores que se reemplazan en las plantillas de mensaje. */
export const MARCADORES_MENSAJE = ['{{titulo}}', '{{link}}'] as const;
export const MARCADORES_CONSULTA = ['{{producto}}', '{{precio}}'] as const;
