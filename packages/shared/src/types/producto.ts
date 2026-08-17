import type { Id, FechaHoraISO } from './base.js';
import type { Money } from '../money.js';

/**
 * Imagen de un producto (full size y miniatura)
 */
export interface ImagenProducto {
  imagenUrl: string;
  miniaturaUrl: string;
}

/**
 * Precios del producto según modalidad de pago
 */
export interface PreciosProducto {
  /** Precio de contado (pago inmediato) */
  contado: Money;
  /** Precio credicontado (crédito con inicial) */
  credicontado: Money;
  /** Precio a crédito puro */
  credito: Money;
  /** Inicial requerida para crédito */
  inicial: Money;
  /** Pago semanal */
  pagoSemanal: Money;
  /** Pago quincenal (calculado: pagoSemanal x 2) */
  pagoQuincenal: Money;
  /** Pago mensual (calculado: pagoSemanal x 4) */
  pagoMensual: Money;
}

/**
 * Producto del catalogo. Es la unica entidad con lectura publica:
 * el catalogo se comparte por WhatsApp y lo abre gente sin cuenta.
 *
 * Por eso NUNCA se debe agregar aqui un campo sensible como el costo
 * de compra o el margen. Si se necesita, va en otra tabla privada.
 */
export interface Producto {
  id: Id;
  nombre: string;
  descripcion: string | null;

  /** Precio legacy - mantener para compatibilidad */
  precio: Money;

  /** Precios según modalidad de pago */
  precios: PreciosProducto;

  categoria: string | null;

  /** Múltiples imágenes del producto */
  imagenes: ImagenProducto[];

  /** URL de la imagen principal (legacy, para compatibilidad) */
  imagenUrl: string | null;

  /** Version pequena de la imagen principal (legacy) */
  miniaturaUrl: string | null;

  /** Solo los visibles aparecen en el catalogo publico. */
  visible: boolean;
  disponible: boolean;

  /** Marcar producto como nuevo (muestra badge en catálogo) */
  esNuevo: boolean;
  /** Marcar producto en promoción (muestra badge en catálogo) */
  enPromocion: boolean;

  /** Orden manual para acomodar los productos en el catalogo. */
  orden: number;

  creadoEn: FechaHoraISO;
  actualizadoEn: FechaHoraISO;
}

export interface NuevoProducto {
  nombre: string;
  descripcion?: string | null;
  precio?: Money;
  precioContado?: Money;
  precioCredicontado?: Money;
  precioCredito?: Money;
  inicial?: Money;
  pagoSemanal?: Money;
  categoria?: string | null;
  imagenUrl?: string | null;
  visible?: boolean;
  disponible?: boolean;
  esNuevo?: boolean;
  enPromocion?: boolean;
  orden?: number;
}
