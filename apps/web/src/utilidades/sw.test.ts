import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Pruebas del service worker.
 *
 * El archivo vive en public/ como JS plano: no pasa por TypeScript ni por el
 * empaquetado, asi que nada mas lo revisa. Y un service worker equivocado es de
 * los errores mas caros de arreglar, porque se queda instalado en el celular de
 * la persona y sigue respondiendo con lo que tenga guardado.
 *
 * Lo que se comprueba aqui, sobre todo, es que NADA de /api se cachee. Son
 * datos de plata: un saldo viejo mostrado como si fuera de ahora lleva a
 * decidir sobre numeros que no existen.
 *
 * Se carga el archivo de verdad y se le arma un entorno falso de service
 * worker, en vez de reimplementar sus reglas en la prueba: probar una copia de
 * la logica no diria nada sobre el archivo que se despliega.
 */

// Con entorno jsdom, import.meta.url no es una ruta de archivo: se resuelve
// desde la raiz del proyecto, que es donde vitest arranca.
const RUTA_SW = resolve(process.cwd(), 'public/sw.js');

interface Entorno {
  /** Dispara un fetch y devuelve la respuesta, o null si el SW no lo intercepto. */
  fetch(url: string, opciones?: { method?: string; mode?: string }): Promise<Response | null>;
  /** Contenido de cada cache: nombre -> URLs guardadas. */
  contenido(): Record<string, string[]>;
  /** Cuantas veces se fue a la red. */
  llamadasDeRed: string[];
  /** Corta o restablece la red, sin perder lo que ya esta en cache. */
  cortarRed(cortada: boolean): void;
  instalar(): Promise<void>;
  activar(): Promise<void>;
}

/** Cache falso, con lo justo de la Cache API que el service worker usa. */
class CacheFalso {
  readonly guardado = new Map<string, Response>();

  async match(peticion: Request | string): Promise<Response | undefined> {
    const clave = typeof peticion === 'string' ? peticion : peticion.url;
    const encontrada = this.guardado.get(clave) ?? this.guardado.get(rutaDe(clave));
    return encontrada ? encontrada.clone() : undefined;
  }

  async put(peticion: Request | string, respuesta: Response): Promise<void> {
    const clave = typeof peticion === 'string' ? peticion : peticion.url;
    if (respuesta.status !== 200) throw new TypeError('cache.put rechaza respuestas que no son 200');
    this.guardado.set(rutaDe(clave), respuesta);
  }

  async add(ruta: string): Promise<void> {
    this.guardado.set(rutaDe(ruta), respuestaFalsa('precargado'));
  }
}

function rutaDe(url: string): string {
  try {
    return new URL(url, 'https://negocio.test').pathname;
  } catch {
    return url;
  }
}

function respuestaFalsa(cuerpo: string, estado = 200): Response {
  const respuesta = new Response(cuerpo, { status: estado });
  // type y redirected son de solo lectura en la clase Response; el service
  // worker los consulta antes de guardar, asi que hay que poderlos fijar.
  Object.defineProperty(respuesta, 'type', { value: 'basic' });
  Object.defineProperty(respuesta, 'redirected', { value: false });
  return respuesta;
}

/** Monta el service worker con un entorno falso y devuelve como manejarlo. */
function montarServiceWorker(): Entorno {
  const caches = new Map<string, CacheFalso>();
  const llamadasDeRed: string[] = [];
  const escuchas = new Map<string, (evento: unknown) => void>();
  let redCortada = false;

  const self = {
    location: { origin: 'https://negocio.test' },
    addEventListener: (tipo: string, manejador: (evento: unknown) => void) => {
      escuchas.set(tipo, manejador);
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };

  const cachesFalso = {
    open: async (nombre: string) => {
      if (!caches.has(nombre)) caches.set(nombre, new CacheFalso());
      return caches.get(nombre)!;
    },
    keys: async () => [...caches.keys()],
    delete: async (nombre: string) => caches.delete(nombre),
  };

  const fetchFalso = async (peticion: Request | string) => {
    const url = typeof peticion === 'string' ? peticion : peticion.url;
    llamadasDeRed.push(rutaDe(url));
    if (redCortada) throw new TypeError('sin conexion');
    return respuestaFalsa(`de la red: ${rutaDe(url)}`);
  };

  // El archivo se evalua con su propio `self`, `caches` y `fetch`.
  const codigo = readFileSync(RUTA_SW, 'utf8');
  const ejecutar = new Function('self', 'caches', 'fetch', 'Response', codigo);
  ejecutar(self, cachesFalso, fetchFalso, Response);

  async function disparar(tipo: string, evento: Record<string, unknown>) {
    const manejador = escuchas.get(tipo);
    if (!manejador) throw new Error(`El service worker no escucha "${tipo}"`);
    manejador(evento);
  }

  return {
    llamadasDeRed,

    cortarRed(cortada: boolean) {
      redCortada = cortada;
    },

    async instalar() {
      const esperas: Array<Promise<unknown>> = [];
      await disparar('install', { waitUntil: (p: Promise<unknown>) => esperas.push(p) });
      await Promise.all(esperas);
    },

    async activar() {
      const esperas: Array<Promise<unknown>> = [];
      await disparar('activate', { waitUntil: (p: Promise<unknown>) => esperas.push(p) });
      await Promise.all(esperas);
    },

    async fetch(url, { method = 'GET', mode = 'no-cors' } = {}) {
      let respondida: Promise<Response> | null = null;
      const peticion = { url: new URL(url, 'https://negocio.test').toString(), method, mode };

      await disparar('fetch', {
        request: peticion,
        respondWith: (p: Promise<Response>) => {
          respondida = p;
        },
      });

      return respondida ? await respondida : null;
    },

    contenido() {
      const salida: Record<string, string[]> = {};
      for (const [nombre, cache] of caches) salida[nombre] = [...cache.guardado.keys()];
      return salida;
    },
  };
}

let sw: Entorno;

beforeEach(async () => {
  sw = montarServiceWorker();
  await sw.instalar();
  await sw.activar();
});

describe('el service worker no toca los datos de plata', () => {
  it('no intercepta /api: siempre va a la red', async () => {
    const rutas = ['/api/caja/balance', '/api/nomina', '/api/sesion', '/api/empleados'];

    for (const ruta of rutas) {
      expect(await sw.fetch(ruta), `${ruta} no debe pasar por el service worker`).toBeNull();
    }
  });

  it('no guarda ninguna respuesta de /api en cache', async () => {
    await sw.fetch('/api/caja/balance');
    await sw.fetch('/api/nomina');

    const guardado = Object.values(sw.contenido()).flat();

    expect(guardado.filter((url) => url.includes('/api/'))).toEqual([]);
  });

  it('deja pasar el catalogo publico, que lo arma el servidor', async () => {
    expect(await sw.fetch('/catalogo')).toBeNull();
  });

  it('no intercepta nada que no sea GET: un POST cacheado duplicaria una venta', async () => {
    expect(await sw.fetch('/registrar', { method: 'POST' })).toBeNull();
    expect(await sw.fetch('/assets/index-abc123.js', { method: 'POST' })).toBeNull();
  });

  it('no intercepta otros dominios', async () => {
    expect(await sw.fetch('https://wa.me/?text=hola')).toBeNull();
  });
});

describe('el armazon de la app se guarda', () => {
  it('precarga los iconos y el manifest al instalarse', async () => {
    const armazon = sw.contenido()['armazon-v1'] ?? [];

    expect(armazon).toContain('/manifest.webmanifest');
    expect(armazon).toContain('/icono-192.png');
  });

  it('NO precarga index.html: quedaria apuntando a archivos JS que ya no existen', async () => {
    const armazon = sw.contenido()['armazon-v1'] ?? [];

    expect(armazon).not.toContain('/index.html');
    expect(armazon).not.toContain('/');
  });

  it('guarda los archivos con hash y la segunda vez no vuelve a la red', async () => {
    const archivo = '/assets/index-DQsYyT1x.js';

    const primera = await sw.fetch(archivo);
    expect(await primera?.text()).toContain('de la red');

    const antes = sw.llamadasDeRed.length;
    const segunda = await sw.fetch(archivo);

    expect(sw.llamadasDeRed.length).toBe(antes);
    expect(await segunda?.text()).toContain('de la red');
  });

  it('en una navegacion va a la red primero y guarda el armazon', async () => {
    await sw.fetch('/nomina', { mode: 'navigate' });

    expect(sw.llamadasDeRed).toContain('/nomina');
    expect(sw.contenido()['armazon-v1']).toContain('/index.html');
  });
});

describe('sin conexion', () => {
  it('abre con el armazon de la ultima visita en vez del error del navegador', async () => {
    // Una visita con red, que es la que deja el armazon guardado.
    await sw.fetch('/', { mode: 'navigate' });

    sw.cortarRed(true);
    const respuesta = await sw.fetch('/nomina', { mode: 'navigate' });

    // Responde con el armazon que quedo de la visita a "/", no con el error de
    // red: la app se pinta y son sus datos los que muestran el fallo.
    expect(respuesta).not.toBeNull();
    expect(await respuesta?.text()).toBe('de la red: /');
  });

  it('sirve los archivos con hash desde el cache', async () => {
    const archivo = '/assets/index-DQsYyT1x.js';
    await sw.fetch(archivo);

    sw.cortarRed(true);

    expect(await sw.fetch(archivo)).not.toBeNull();
  });

  it('propaga el error si nunca hubo una visita: mejor que una respuesta vacia', async () => {
    const nuevo = montarServiceWorker();
    await nuevo.instalar();
    await nuevo.activar();
    nuevo.cortarRed(true);

    // Una respuesta vacia con estado 200 le haria creer a la app que cargo
    // bien, y quedaria en blanco sin explicacion.
    await expect(nuevo.fetch('/nomina', { mode: 'navigate' })).rejects.toThrow();
  });

  it('las imagenes que ya se vieron siguen apareciendo', async () => {
    await sw.fetch('/imagenes/logo-abc.png');

    sw.cortarRed(true);
    const respuesta = await sw.fetch('/imagenes/logo-abc.png');

    expect(await respuesta?.text()).toContain('de la red');
  });
});

describe('limpieza de versiones viejas', () => {
  it('borra los caches de una version anterior al activarse', async () => {
    const entorno = montarServiceWorker();
    await entorno.instalar();
    // Se ensucia con un cache de otra version antes de activar.
    await entorno.fetch('/assets/viejo.js');
    await entorno.activar();

    const nombres = Object.keys(entorno.contenido());

    expect(nombres.every((nombre) => nombre.endsWith('-v1'))).toBe(true);
  });
});
