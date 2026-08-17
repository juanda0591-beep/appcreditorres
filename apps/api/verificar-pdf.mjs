/** Revisa donde y de que tamano quedo el logo dentro del PDF generado. */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const pdf = readFileSync('./datos/comprobante-verificacion.pdf');
const texto = pdf.toString('latin1');

// Todos los objetos de imagen. El logo y su mascara de transparencia son dos
// objetos distintos: la mascara siempre es en escala de grises.
console.log('Objetos de imagen en el PDF:');
for (const bloque of texto.matchAll(/<<([^<>]*\/Subtype\s*\/Image[^<>]*)>>/g)) {
  const d = bloque[1];
  console.log(
    '  ' +
      [
        /\/Width\s+(\d+)/.exec(d)?.[1] + 'x' + /\/Height\s+(\d+)/.exec(d)?.[1],
        /\/ColorSpace\s*\/?(\w+)/.exec(d)?.[1] ?? 'sin colorspace',
        /\/Filter\s*\/(\w+)/.exec(d)?.[1] ?? '',
        d.includes('/SMask') ? '(con mascara de transparencia)' : '',
      ]
        .filter(Boolean)
        .join('  '),
  );
}

// El flujo de dibujo de la pagina: ahi esta la posicion del logo.
for (const coincidencia of texto.matchAll(/stream\r?\n/g)) {
  const inicio = coincidencia.index + coincidencia[0].length;
  const fin = texto.indexOf('endstream', inicio);
  if (fin < 0) continue;

  let contenido;
  try {
    contenido = inflateSync(pdf.subarray(inicio, fin)).toString('latin1');
  } catch {
    continue; // Las imagenes tambien son flujos, pero no son texto.
  }

  // El bloque que dibuja una imagen: q ... cm ... /Ix Do ... Q
  const dibujo = /q\s+([^Q]*?\/I\d+\s+Do)\s*Q/.exec(contenido);
  if (!dibujo) continue;

  console.log('\nBloque que dibuja el logo:');
  console.log('  ' + dibujo[1].replace(/\s+/g, ' ').trim());

  const numeros = /([-\d.]+)\s+0\s+0\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm/.exec(dibujo[1]);
  if (numeros) {
    const [, w, h, x, y] = numeros.map(Number);
    const ALTO_PAGINA = 792; // LETTER en puntos
    const ANCHO_PAGINA = 612;

    console.log('  tamano:', `${w}x${h} pt`);
    console.log('  x:', x, '(margen del documento: 48)');
    console.log('  y desde arriba:', ALTO_PAGINA - y - h, 'pt');
    console.log(
      '  cabe en la pagina:',
      x >= 0 && y >= 0 && x + w <= ANCHO_PAGINA && y + h <= ALTO_PAGINA,
    );
  }
  break;
}
