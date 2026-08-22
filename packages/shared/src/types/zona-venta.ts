import type { Id, FechaHoraISO } from './base.js';

/**
 * Zona de venta con su vendedor asignado. Cuando un cliente del agente de IA
 * confirma que quiere comprar y dice en que municipio/zona esta, el aviso se
 * envia al vendedor de esta zona en vez del vendedor general.
 */
export interface ZonaVenta {
  id: Id;
  nombre: string;

  /** Numero de WhatsApp del vendedor de esta zona, con indicativo. */
  whatsappVendedor: string;

  activo: boolean;
  creadoEn: FechaHoraISO;
}

export interface NuevaZonaVenta {
  nombre: string;
  whatsappVendedor: string;
  activo?: boolean;
}
