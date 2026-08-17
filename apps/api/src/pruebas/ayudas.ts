import { rmSync } from 'node:fs';
import type { FastifyInstance, InjectOptions } from 'fastify';

/** Respuesta de app.inject(). Se deriva del tipo real para no desalinearse. */
type Respuesta = Awaited<ReturnType<FastifyInstance['inject']>>;

/**
 * Ayudas para las pruebas de integracion.
 *
 * Desde que la API exige sesion, cada peticion de prueba necesita su cookie.
 * En vez de repetir el login en cada archivo, aqui se crea un cliente que ya
 * la lleva puesta.
 */

export interface ClientePrueba {
  get(url: string): Promise<Respuesta>;
  post(url: string, payload?: unknown): Promise<Respuesta>;
  patch(url: string, payload?: unknown): Promise<Respuesta>;
  delete(url: string): Promise<Respuesta>;
  /** Peticion con control total, para casos especiales (multipart, etc). */
  crudo(opciones: InjectOptions): Promise<Respuesta>;
  /** La cookie, para probar accesos sin ella o con otra. */
  cookie: string;
}

/**
 * Crea el primer usuario e inicia sesion, devolviendo un cliente autenticado.
 *
 * El rol se puede cambiar para probar los permisos del rol 'catalogo'.
 */
export async function clienteAutenticado(
  app: FastifyInstance,
  opciones: { usuario?: string; rol?: 'admin' | 'catalogo' } = {},
): Promise<ClientePrueba> {
  const usuario = opciones.usuario ?? 'admin_prueba';
  const contrasena = 'contrasena-de-prueba-123';

  // Si ya hay usuarios, instalar falla; en ese caso se entra directo.
  const instalacion = await app.inject({
    method: 'POST',
    url: '/api/sesion/instalar',
    payload: { usuario, contrasena, nombre: 'Admin de prueba' },
  });

  let cookie = extraerCookie(instalacion);

  if (!cookie) {
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario, contrasena },
    });
    cookie = extraerCookie(entrada);
  }

  if (!cookie) {
    throw new Error('No se pudo autenticar el cliente de pruebas');
  }

  const conCookie = (opciones: InjectOptions) =>
    app.inject({
      ...opciones,
      headers: { ...opciones.headers, cookie },
    });

  return {
    cookie,
    get: (url) => conCookie({ method: 'GET', url }),
    post: (url, payload) => conCookie({ method: 'POST', url, payload: payload ?? {} }),
    patch: (url, payload) => conCookie({ method: 'PATCH', url, payload: payload ?? {} }),
    delete: (url) => conCookie({ method: 'DELETE', url }),
    crudo: (opciones) => conCookie(opciones),
  };
}

function extraerCookie(respuesta: Respuesta): string {
  const sesion = respuesta.cookies.find((c: { name: string }) => c.name === 'sesion');
  return sesion ? `sesion=${sesion.value}` : '';
}

/**
 * Borra la base de una prueba para que empiece vacia.
 *
 * Sin esto las pruebas pasan la primera vez y fallan la segunda: el archivo
 * .db queda en disco y el segundo `npm test` arranca con el administrador y
 * los empleados de la corrida anterior, asi que "necesita instalacion" da
 * falso y las liquidaciones choncan con las que ya existen.
 *
 * Se llama al cargar el modulo de prueba, ANTES de importar db/cliente.js: al
 * importarse, el cliente abre el archivo, y en Windows un archivo abierto no
 * se puede borrar.
 *
 * Es sincrona por lo mismo: en el cuerpo del modulo no hay donde esperar una
 * promesa, y esto tiene que terminar antes del primer import dinamico.
 */
export function limpiarBaseDatos(ruta: string): void {
  // -wal y -shm son los archivos que SQLite deja al lado; si sobrevive uno,
  // la base "vacia" vuelve a tener los datos de antes.
  for (const archivo of [ruta, `${ruta}-wal`, `${ruta}-shm`]) {
    rmSync(archivo, { force: true });
  }
}

/** Variables de entorno comunes a las pruebas de integracion. */
export function prepararEntorno(nombre: string): void {
  process.env.DB_RUTA = `./datos/prueba-${nombre}.db`;
  process.env.DB_URL = `file:./datos/prueba-${nombre}.db`;
  process.env.CARPETA_IMAGENES = `./datos/imagenes-prueba-${nombre}`;
  process.env.SECRETO_COOKIES = 'secreto-de-prueba-con-mas-de-32-caracteres-largo';
  limpiarBaseDatos(`./datos/prueba-${nombre}.db`);
}
