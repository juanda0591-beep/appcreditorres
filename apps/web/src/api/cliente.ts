/**
 * Cliente HTTP de la API.
 *
 * Usa rutas relativas ("/api/..."): en desarrollo Vite las reenvia al backend
 * y en produccion Nginx hace lo mismo. Asi no hay URLs que cambiar al desplegar.
 */

/** Error con el mensaje que el backend devolvio, para mostrarlo tal cual. */
export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly codigoHttp: number,
    readonly codigo: string,
    readonly detalles?: Array<{ campo: string; mensaje: string }>,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

interface RespuestaError {
  error?: string;
  mensaje?: string;
  detalles?: Array<{ campo: string; mensaje: string }>;
}

async function procesar<T>(respuesta: Response): Promise<T> {
  if (respuesta.ok) {
    // 204 no trae cuerpo.
    if (respuesta.status === 204) return undefined as T;
    return (await respuesta.json()) as T;
  }

  let datos: RespuestaError = {};
  try {
    datos = (await respuesta.json()) as RespuestaError;
  } catch {
    // El servidor respondio algo que no es JSON (por ejemplo un 502 de Nginx).
  }

  // Se prefiere el mensaje del backend: esta escrito para que lo lea una
  // persona ("Ya existe una liquidacion para..."), no un mensaje genrico.
  throw new ErrorApi(
    datos.mensaje ?? `Error ${respuesta.status}`,
    respuesta.status,
    datos.error ?? 'ERROR',
    datos.detalles,
  );
}

export async function obtener<T>(ruta: string): Promise<T> {
  return procesar<T>(await fetch(ruta, { headers: { accept: 'application/json' } }));
}

async function conCuerpo<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  /**
   * El encabezado content-type se manda SOLO si hay cuerpo.
   *
   * Declarar 'application/json' con el cuerpo vacio hace que Fastify responda
   * 500 ("Body cannot be empty"), que es lo que pasaba al cerrar sesion: la
   * peticion fallaba y la pantalla se quedaba adentro.
   */
  const tieneCuerpo = cuerpo !== undefined;

  return procesar<T>(
    await fetch(ruta, {
      method: metodo,
      headers: tieneCuerpo ? { 'content-type': 'application/json' } : {},
      body: tieneCuerpo ? JSON.stringify(cuerpo) : undefined,
    }),
  );
}

export const enviar = <T,>(ruta: string, cuerpo?: unknown, metodo: 'POST' | 'PUT' = 'POST') => conCuerpo<T>(metodo, ruta, cuerpo);
export const parchar = <T,>(ruta: string, cuerpo?: unknown) => conCuerpo<T>('PATCH', ruta, cuerpo);
export const borrar = <T,>(ruta: string) => conCuerpo<T>('DELETE', ruta);

/** Sube un archivo con multipart. No lleva content-type: lo pone el navegador. */
export async function subirArchivo<T>(ruta: string, campo: string, archivo: File): Promise<T> {
  const datos = new FormData();
  datos.append(campo, archivo);
  return procesar<T>(await fetch(ruta, { method: 'POST', body: datos }));
}

/** Descarga un archivo binario (el PDF del comprobante). */
export async function obtenerArchivo(ruta: string): Promise<Blob> {
  const respuesta = await fetch(ruta, { headers: { accept: 'application/pdf' } });
  if (!respuesta.ok) {
    throw new ErrorApi(`No se pudo generar el archivo (error ${respuesta.status})`, respuesta.status, 'ERROR');
  }
  return respuesta.blob();
}
