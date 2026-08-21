import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Configuracion del negocio y del catalogo publico.
 *
 * Es una tabla de una sola fila (id fijo = 1). Se usa tabla y no archivo de
 * configuracion porque estos valores los edita el dueno del negocio desde la
 * pantalla, sin tocar codigo ni reiniciar el servidor.
 *
 * OJO: todo lo que este aqui sale en el catalogo publico. No agregar datos
 * privados a esta tabla.
 */
export const configuracion = sqliteTable('configuracion', {
  /** Siempre 1: esta tabla tiene una sola fila. */
  id: integer('id').primaryKey().default(1),

  nombreNegocio: text('nombre_negocio').notNull().default('Mi negocio'),

  /**
   * Numero de WhatsApp al que escriben los clientes, con indicador de pais.
   * Ejemplo Colombia: 573001234567
   */
  whatsappNumero: text('whatsapp_numero'),

  /**
   * Numero de WhatsApp del vendedor humano que recibe el aviso cuando un
   * cliente muestra intencion de compra en el agente de IA.
   */
  whatsappVendedor: text('whatsapp_vendedor'),

  /** Titulo que se ve arriba del catalogo y en la vista previa de WhatsApp. */
  tituloCatalogo: text('titulo_catalogo').notNull().default('Catalogo de productos'),

  /** Descripcion corta. Sale en la vista previa del chat. */
  descripcionCatalogo: text('descripcion_catalogo'),

  /**
   * Mensaje con el que se comparte el catalogo. Admite {{titulo}} y {{link}},
   * que se reemplazan al generar el enlace.
   */
  plantillaMensaje: text('plantilla_mensaje')
    .notNull()
    .default('Hola! Te comparto nuestro catalogo: {{titulo}}\n{{link}}'),

  /**
   * Mensaje que se arma cuando un cliente pregunta por un producto.
   * Admite {{producto}} y {{precio}}.
   */
  plantillaConsulta: text('plantilla_consulta')
    .notNull()
    .default('Hola! Me interesa {{producto}} ({{precio}}). Me das mas informacion?'),

  /** Texto libre al pie del catalogo: horarios, formas de pago, envios. */
  notaPie: text('nota_pie'),

  /** Si se apaga, el catalogo publico responde 404 sin borrar nada. */
  catalogoActivo: integer('catalogo_activo', { mode: 'boolean' }).notNull().default(true),

  /** Mostrar u ocultar los precios en el catalogo publico. */
  mostrarPrecios: integer('mostrar_precios', { mode: 'boolean' }).notNull().default(true),

  /**
   * Logo del negocio, en PNG. Encabeza el comprobante de pago en PDF.
   *
   * Se guarda PNG y no WebP (como las fotos de productos) porque el generador
   * de PDF solo lee JPEG y PNG.
   */
  logoUrl: text('logo_url'),

  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

export type ConfiguracionFila = typeof configuracion.$inferSelect;
export type ConfiguracionInsert = typeof configuracion.$inferInsert;

/** Id fijo de la unica fila de configuracion. */
export const ID_CONFIGURACION = 1;
