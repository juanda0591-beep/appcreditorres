/**
 * Convierte un número a texto en español colombiano para que sea más fácil de entender
 * cuando se lee con TTS (Text-to-Speech)
 */
export function formatearPrecioParaVoz(precio: number): string {
  if (precio === 0) return 'cero pesos';

  const millones = Math.floor(precio / 1000000);
  const miles = Math.floor((precio % 1000000) / 1000);
  const unidades = precio % 1000;

  const partes: string[] = [];

  if (millones > 0) {
    if (millones === 1) {
      partes.push('un millón');
    } else {
      partes.push(`${numeroATexto(millones)} millones`);
    }
  }

  if (miles > 0) {
    if (miles === 1) {
      partes.push('mil');
    } else {
      partes.push(`${numeroATexto(miles)} mil`);
    }
  }

  if (unidades > 0) {
    partes.push(numeroATexto(unidades));
  }

  return partes.join(' ') + ' pesos';
}

/**
 * Convierte números del 1 al 999 en texto
 */
function numeroATexto(num: number): string {
  if (num === 0) return 'cero';
  if (num === 1) return 'un';
  if (num === 2) return 'dos';
  if (num === 3) return 'tres';
  if (num === 4) return 'cuatro';
  if (num === 5) return 'cinco';
  if (num === 6) return 'seis';
  if (num === 7) return 'siete';
  if (num === 8) return 'ocho';
  if (num === 9) return 'nueve';
  if (num === 10) return 'diez';
  if (num === 11) return 'once';
  if (num === 12) return 'doce';
  if (num === 13) return 'trece';
  if (num === 14) return 'catorce';
  if (num === 15) return 'quince';
  if (num <= 19) return `dieci${numeroATexto(num - 10)}`;

  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  if (num < 30) {
    const unidad = num % 10;
    return unidad === 0 ? 'veinte' : `veinti${unidades[unidad]}`;
  }

  if (num < 100) {
    const decena = Math.floor(num / 10);
    const unidad = num % 10;
    return unidad === 0 ? decenas[decena] : `${decenas[decena]} y ${unidades[unidad]}`;
  }

  const centena = Math.floor(num / 100);
  const resto = num % 100;

  if (num === 100) return 'cien';
  if (resto === 0) return centenas[centena];

  return `${centenas[centena]} ${numeroATexto(resto)}`;
}

/**
 * Reemplaza formatos de precio en el texto ($1,250,000) con versión en palabras
 */
export function convertirPreciosEnTexto(texto: string): string {
  // Buscar precios con formato $1,250,000 o $1.250.000
  return texto.replace(/\$[\d,\.]+/g, (match) => {
    // Extraer solo los números
    const numero = parseInt(match.replace(/[$,\.]/g, ''), 10);
    if (isNaN(numero)) return match;
    return formatearPrecioParaVoz(numero);
  });
}
