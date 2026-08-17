/**
 * Armado de enlaces de WhatsApp.
 *
 * Se usa wa.me, que es la forma gratuita y sin registro de abrir un chat con
 * un mensaje ya escrito. No requiere la API de negocios de Meta ni aprobacion
 * de plantillas: funciona con cualquier numero de WhatsApp.
 *
 * Lo que wa.me NO permite es enviar mensajes solo: siempre abre la app y la
 * persona confirma el envio. No sirve para mensajes masivos automaticos.
 */

import { formatearPesos, type Money } from './money.js';

/** Indicador de pais de Colombia. */
export const INDICATIVO_COLOMBIA = '57';

/**
 * Normaliza un numero para wa.me: solo digitos, con indicador de pais.
 *
 * Acepta lo que la gente escribe de verdad: "300 123 4567",
 * "+57 300-123-4567", "(300) 1234567". Si no trae indicador, asume Colombia.
 *
 * Devuelve null si no queda un numero usable, para que quien llame decida
 * que hacer en vez de generar un enlace roto.
 */
export function normalizarNumero(
  numero: string | null | undefined,
  indicativo = INDICATIVO_COLOMBIA,
): string | null {
  if (!numero) return null;

  let digitos = numero.replace(/\D/g, '');
  if (digitos.length === 0) return null;

  // 00 al inicio es prefijo internacional en varios paises: se descarta.
  if (digitos.startsWith('00')) digitos = digitos.slice(2);

  // Celular colombiano suelto: 10 digitos empezando por 3.
  if (digitos.length === 10 && digitos.startsWith('3')) {
    return `${indicativo}${digitos}`;
  }

  // Ya viene con indicativo (57 + 10 digitos = 12).
  if (digitos.startsWith(indicativo) && digitos.length >= 12) {
    return digitos;
  }

  // Numeros de otros paises o fijos con indicativo: se dejan como estan
  // si tienen largo plausible.
  if (digitos.length >= 11 && digitos.length <= 15) return digitos;

  return null;
}

/** Reemplaza los marcadores {{clave}} de una plantilla. */
export function aplicarPlantilla(
  plantilla: string,
  valores: Record<string, string>,
): string {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (coincidencia, clave: string) =>
    // Si el marcador no tiene valor se deja tal cual, asi se nota el error
    // en vez de mandar un mensaje con un hueco silencioso.
    Object.hasOwn(valores, clave) ? valores[clave]! : coincidencia,
  );
}

/**
 * Enlace para que el CLIENTE escriba al negocio.
 * Se usa en el boton "Preguntar por este producto" del catalogo.
 */
export function enlaceConsultaProducto(opciones: {
  numeroNegocio: string | null | undefined;
  plantilla: string;
  producto: string;
  precio: Money;
  mostrarPrecio?: boolean;
}): string | null {
  const numero = normalizarNumero(opciones.numeroNegocio);
  if (!numero) return null;

  const texto = aplicarPlantilla(opciones.plantilla, {
    producto: opciones.producto,
    precio: opciones.mostrarPrecio === false ? '' : formatearPesos(opciones.precio),
  });

  return `https://wa.me/${numero}?text=${encodeURIComponent(texto.trim())}`;
}

/**
 * Enlace para que el NEGOCIO comparta el catalogo.
 *
 * Sin numero de destino a proposito: al abrirlo, WhatsApp deja elegir a quien
 * enviarlo. Asi el mismo enlace sirve para cualquier cliente o grupo.
 */
export function enlaceCompartirCatalogo(opciones: {
  plantilla: string;
  titulo: string;
  link: string;
}): string {
  const texto = aplicarPlantilla(opciones.plantilla, {
    titulo: opciones.titulo,
    link: opciones.link,
  });
  return `https://wa.me/?text=${encodeURIComponent(texto.trim())}`;
}
