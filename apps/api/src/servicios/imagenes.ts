import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { ErrorDatosInvalidos } from '../errores.js';

/**
 * Procesamiento de las fotos de productos.
 *
 * Las fotos vienen del celular: pesan entre 3 y 8 MB y miden unos 4000px.
 * Servirlas asi haria que el catalogo tarde una eternidad con datos moviles,
 * asi que se reducen y se convierten a WebP, que pesa bastante menos que JPEG
 * con calidad parecida.
 *
 * Se generan dos tamanos: miniatura para la grilla y una version grande para
 * cuando el cliente abre el producto.
 */

const ANCHO_GRANDE = 1200;
const ANCHO_MINIATURA = 400;
const CALIDAD_WEBP = 82;

/** El logo se ve chico: en el PDF ocupa unos 45px y en pantalla poco mas. */
const LADO_LOGO = 400;

/** Tipos que aceptamos. HEIC entra porque es el formato por defecto del iPhone. */
const TIPOS_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Firmas binarias de cada formato ("magic bytes").
 *
 * Se valida el contenido y no solo el tipo declarado, porque el navegador
 * puede mandar cualquier cosa en el encabezado. Un archivo que dice ser
 * imagen pero no lo es se rechaza aqui, antes de pasarselo a sharp.
 */
function pareceImagen(datos: Buffer): boolean {
  if (datos.length < 12) return false;

  // JPEG: FF D8 FF
  if (datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return true;

  // PNG: 89 50 4E 47
  if (datos[0] === 0x89 && datos[1] === 0x50 && datos[2] === 0x4e && datos[3] === 0x47) {
    return true;
  }

  // WebP: "RIFF" .... "WEBP"
  if (datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WEBP') {
    return true;
  }

  // HEIC/HEIF: caja "ftyp" en los bytes 4-8
  if (datos.toString('ascii', 4, 8) === 'ftyp') return true;

  return false;
}

export interface ImagenGuardada {
  /** URL publica de la version grande. */
  imagenUrl: string;
  /** URL publica de la miniatura. */
  miniaturaUrl: string;
  /** Tamano final en bytes, para informar cuanto se ahorro. */
  bytes: number;
}

/** Valida formato declarado y contenido real antes de pasarle nada a sharp. */
function validarImagen(datos: Buffer, tipoDeclarado: string): void {
  if (!TIPOS_PERMITIDOS.has(tipoDeclarado.toLowerCase())) {
    throw new ErrorDatosInvalidos(
      `Formato no permitido (${tipoDeclarado}). Se aceptan JPG, PNG, WebP y HEIC.`,
    );
  }

  if (!pareceImagen(datos)) {
    throw new ErrorDatosInvalidos(
      'El archivo no parece ser una imagen valida. Intenta con otra foto.',
    );
  }
}

/**
 * Procesa y guarda una foto de producto.
 *
 * Recibe el archivo ya en memoria (el limite de tamano lo aplica multipart
 * antes de llegar aqui, para no cargar un archivo gigante).
 */
export async function guardarImagenProducto(
  datos: Buffer,
  tipoDeclarado: string,
): Promise<ImagenGuardada> {
  validarImagen(datos, tipoDeclarado);

  await mkdir(config.carpetaImagenes, { recursive: true });

  const nombre = randomUUID();
  const archivoGrande = `${nombre}.webp`;
  const archivoMini = `${nombre}-mini.webp`;

  try {
    // rotate() sin argumentos aplica la orientacion EXIF: sin esto las fotos
    // tomadas en vertical con el celular salen acostadas.
    const base = sharp(datos, { failOn: 'error' }).rotate();

    const [grande, miniatura] = await Promise.all([
      base
        .clone()
        .resize(ANCHO_GRANDE, ANCHO_GRANDE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: CALIDAD_WEBP })
        .toBuffer(),
      base
        .clone()
        .resize(ANCHO_MINIATURA, ANCHO_MINIATURA, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: CALIDAD_WEBP })
        .toBuffer(),
    ]);

    await Promise.all([
      writeFile(join(config.carpetaImagenes, archivoGrande), grande),
      writeFile(join(config.carpetaImagenes, archivoMini), miniatura),
    ]);

    return {
      imagenUrl: `${config.rutaPublicaImagenes}/${archivoGrande}`,
      miniaturaUrl: `${config.rutaPublicaImagenes}/${archivoMini}`,
      bytes: grande.length + miniatura.length,
    };
  } catch (error) {
    if (error instanceof ErrorDatosInvalidos) throw error;
    // sharp lanza si el archivo esta corrupto o es un formato que no soporta.
    throw new ErrorDatosInvalidos(
      'No se pudo procesar la imagen. Puede estar danada o en un formato no soportado.',
    );
  }
}

export interface LogoGuardado {
  logoUrl: string;
  bytes: number;
}

/**
 * Procesa y guarda el logo del negocio.
 *
 * Sale en PNG, no en WebP como las fotos de productos, porque el generador de
 * PDF (pdfkit) solo sabe leer JPEG y PNG. Un WebP aqui se veria bien en la web
 * y dejaria el comprobante sin logo, que es justo para lo que se sube.
 *
 * Se conserva el canal alfa: los logos suelen venir con fondo transparente y
 * aplanarlos contra blanco los deja con un recuadro visible sobre el papel.
 */
export async function guardarLogoNegocio(
  datos: Buffer,
  tipoDeclarado: string,
): Promise<LogoGuardado> {
  validarImagen(datos, tipoDeclarado);

  await mkdir(config.carpetaImagenes, { recursive: true });

  const archivo = `logo-${randomUUID()}.png`;

  try {
    const png = await sharp(datos, { failOn: 'error' })
      .rotate()
      .resize(LADO_LOGO, LADO_LOGO, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(join(config.carpetaImagenes, archivo), png);

    return { logoUrl: `${config.rutaPublicaImagenes}/${archivo}`, bytes: png.length };
  } catch (error) {
    if (error instanceof ErrorDatosInvalidos) throw error;
    throw new ErrorDatosInvalidos(
      'No se pudo procesar la imagen. Puede estar danada o en un formato no soportado.',
    );
  }
}

/**
 * Lee el archivo del logo para incrustarlo en el PDF.
 *
 * Devuelve null si no hay logo o si el archivo ya no esta: un comprobante sin
 * logo es aceptable, uno que no se puede generar no lo es.
 */
export async function leerLogoNegocio(logoUrl: string | null): Promise<Buffer | null> {
  const archivo = nombreDeArchivoSeguro(logoUrl);
  if (!archivo) return null;

  try {
    return await readFile(join(config.carpetaImagenes, archivo));
  } catch {
    return null;
  }
}

/** Borra el archivo del logo. No lanza: es limpieza. */
export async function borrarLogoNegocio(logoUrl: string | null): Promise<void> {
  const archivo = nombreDeArchivoSeguro(logoUrl);
  if (!archivo) return;

  try {
    await unlink(join(config.carpetaImagenes, archivo));
  } catch {
    // Que ya no exista es el resultado buscado.
  }
}

/**
 * Nombre de archivo de una URL, validado.
 *
 * Solo se opera dentro de la carpeta de imagenes: se toma el ultimo segmento y
 * se valida su forma, para que una URL con ".." o una ruta ajena no alcance
 * otros archivos del servidor.
 */
function nombreDeArchivoSeguro(url: string | null): string | null {
  if (!url) return null;
  const nombre = url.split('/').pop() ?? '';
  return /^[\w-]+\.(png|webp|jpe?g)$/i.test(nombre) ? nombre : null;
}

export interface ResultadoBorrado {
  borrados: string[];
  /** Archivos que no se pudieron borrar, con el codigo de error del sistema. */
  noBorrados: Array<{ archivo: string; motivo: string }>;
}

/**
 * Borra los archivos de una imagen.
 *
 * No lanza: borrar la foto vieja es limpieza, y no debe tumbar la operacion
 * que la pidio (subir la nueva foto ya funciono). Pero SI informa que quedo
 * sin borrar, en vez de callarlo: un archivo huerfano que nadie reporta se
 * vuelve disco ocupado sin explicacion en el VPS.
 *
 * En Windows el borrado puede fallar con EBUSY si otro proceso tiene el
 * archivo abierto. En Linux, que es donde va a correr el VPS, unlink funciona
 * incluso con el archivo abierto.
 */
export async function borrarImagenProducto(
  imagenUrl: string | null,
  miniaturaUrl: string | null,
): Promise<ResultadoBorrado> {
  const archivos = [imagenUrl, miniaturaUrl]
    .filter((url): url is string => Boolean(url))
    // Solo se borra dentro de la carpeta de imagenes: se toma el nombre del
    // archivo y se valida su forma, para que una URL con ".." o una ruta ajena
    // no pueda borrar otros archivos del servidor.
    .map((url) => url.split('/').pop() ?? '')
    .filter((nombre) => /^[\w-]+\.webp$/.test(nombre));

  const borrados: string[] = [];
  const noBorrados: Array<{ archivo: string; motivo: string }> = [];

  await Promise.all(
    archivos.map(async (archivo) => {
      try {
        await unlink(join(config.carpetaImagenes, archivo));
        borrados.push(archivo);
      } catch (error) {
        const codigo = (error as { code?: string }).code ?? 'DESCONOCIDO';

        // Que ya no exista no es problema: el objetivo era que no estuviera.
        if (codigo === 'ENOENT') {
          borrados.push(archivo);
          return;
        }

        noBorrados.push({ archivo, motivo: codigo });
      }
    }),
  );

  return { borrados, noBorrados };
}
