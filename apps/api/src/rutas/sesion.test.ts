import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { limpiarBaseDatos } from '../pruebas/ayudas.js';

/**
 * Pruebas de autenticacion.
 *
 * Son las mas importantes del proyecto: si fallan, cualquiera puede leer los
 * salarios de los empleados. Se prueba tanto que deje entrar a quien debe,
 * como que NIEGUE el acceso a quien no.
 */

const RUTA_PRUEBA = './datos/prueba-sesion.db';
process.env.DB_RUTA = RUTA_PRUEBA;
process.env.DB_URL = `file:${RUTA_PRUEBA}`;
process.env.CARPETA_IMAGENES = './datos/imagenes-prueba-sesion';
process.env.SECRETO_COOKIES = 'secreto-de-prueba-con-mas-de-32-caracteres-largo';
limpiarBaseDatos(RUTA_PRUEBA);

let app: FastifyInstance;

/** Extrae la cookie de sesion de la respuesta, para reusarla. */
function cookieDe(respuesta: { cookies: Array<{ name: string; value: string }> }): string {
  const sesion = respuesta.cookies.find((c) => c.name === 'sesion');
  return sesion ? `sesion=${sesion.value}` : '';
}

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { db } = await import('../db/cliente.js');
  await migrate(db, { migrationsFolder: './migraciones' });

  const { construirApp } = await import('../app.js');
  app = await construirApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  const { cerrarBaseDatos } = await import('../db/cliente.js');
  cerrarBaseDatos();
});

describe('instalacion inicial', () => {
  it('avisa que hace falta crear el primer usuario', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sesion/estado' });

    expect(res.json().necesitaInstalacion).toBe(true);
    expect(res.json().autenticado).toBe(false);
  });

  it('crea el primer administrador y lo deja adentro', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/instalar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123', nombre: 'Juan D' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().usuario.rol).toBe('admin');
    // Entra de una: no tiene sentido pedirle la clave que acaba de escribir.
    expect(cookieDe(res)).toContain('sesion=');
  });

  it('no permite instalar dos veces', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/instalar',
      payload: { usuario: 'otro', contrasena: 'clave-larga-123', nombre: 'Otro' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('Ya hay usuarios');
  });

  it('rechaza contrasenas cortas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: '123' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('entrar y salir', () => {
  it('deja entrar con las credenciales correctas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().usuario.nombre).toBe('Juan D');
    expect(cookieDe(res)).toContain('sesion=');
  });

  /**
   * Este test cubre un bug real: /estado es publica, y el guardian retornaba
   * antes de leer la cookie. Respondia siempre "no autenticado", asi que el
   * login entraba bien pero la pantalla nunca avanzaba.
   */
  it('estado reconoce la sesion despues de entrar', async () => {
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sesion/estado',
      headers: { cookie: cookieDe(entrada) },
    });

    expect(res.json().autenticado).toBe(true);
    expect(res.json().usuario.usuario).toBe('juand');
    expect(res.json().usuario.rol).toBe('admin');
  });

  it('estado responde sin sesion, sin fallar', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sesion/estado' });

    expect(res.statusCode).toBe(200);
    expect(res.json().autenticado).toBe(false);
    expect(res.json().usuario).toBeNull();
  });

  it('acepta el usuario en mayusculas: se normaliza', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'JuanD', contrasena: 'clave-larga-123' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('rechaza la contrasena incorrecta', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'equivocada-123' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('da el mismo mensaje si el usuario no existe: no confirma cuales son validos', async () => {
    const inexistente = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'noexiste', contrasena: 'cualquiera-123' },
    });

    const claveMala = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'equivocada-123' },
    });

    expect(inexistente.json().mensaje).toBe(claveMala.json().mensaje);
  });

  it('la cookie no es accesible desde JavaScript ni viaja entre sitios', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123' },
    });

    const cookie = res.cookies.find((c) => c.name === 'sesion');
    // httpOnly corta el robo de sesion por scripts inyectados.
    expect(cookie?.httpOnly).toBe(true);
    // sameSite corta las peticiones hechas desde paginas ajenas.
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
  });

  it('cerrar sesion invalida el token de inmediato', async () => {
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123' },
    });
    const cookie = cookieDe(entrada);

    // Con la sesion abierta funciona.
    const antes = await app.inject({
      method: 'GET',
      url: '/api/empleados',
      headers: { cookie },
    });
    expect(antes.statusCode).toBe(200);

    await app.inject({ method: 'POST', url: '/api/sesion/salir', headers: { cookie } });

    // Con el mismo token ya no.
    const despues = await app.inject({
      method: 'GET',
      url: '/api/empleados',
      headers: { cookie },
    });
    expect(despues.statusCode).toBe(401);
  });
});

describe('las rutas privadas estan cerradas sin sesion', () => {
  /**
   * Este es el bloque que justifica todo el trabajo de autenticacion: sin el,
   * cualquiera con la URL del servidor lee los salarios y registra pagos.
   */
  const RUTAS_QUE_DEBEN_ESTAR_CERRADAS = [
    ['GET', '/api/empleados'],
    ['POST', '/api/empleados'],
    ['GET', '/api/municipios'],
    ['GET', '/api/ventas'],
    ['POST', '/api/ventas'],
    ['GET', '/api/cobros'],
    ['GET', '/api/gastos'],
    ['POST', '/api/nomina/previsualizar'],
    ['POST', '/api/nomina/confirmar'],
    ['GET', '/api/nomina'],
    ['POST', '/api/nomina/ahorro/pagar'],
    ['GET', '/api/caja'],
    ['GET', '/api/caja/balance?desde=2026-08-01&hasta=2026-08-31'],
    ['POST', '/api/caja'],
    ['GET', '/api/productos'],
    ['POST', '/api/productos'],
    ['GET', '/api/configuracion'],
    ['PATCH', '/api/configuracion'],
    ['GET', '/api/sesion/usuarios'],
  ] as const;

  for (const [metodo, url] of RUTAS_QUE_DEBEN_ESTAR_CERRADAS) {
    it(`${metodo} ${url} responde 401 sin sesion`, async () => {
      const res = await app.inject({ method: metodo, url, payload: {} });
      expect(res.statusCode).toBe(401);
    });
  }

  it('rechaza una cookie inventada', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/empleados',
      headers: { cookie: 'sesion=token-falso-inventado' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('el catalogo publico sigue abierto', () => {
  /**
   * El catalogo se comparte por WhatsApp y lo abre gente sin cuenta: si la
   * autenticacion lo cerrara por accidente, el negocio pierde su vitrina.
   */
  it('la pagina del catalogo se ve sin sesion', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalogo' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('el JSON del catalogo se lee sin sesion', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogo' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().productos)).toBe(true);
  });

  it('el enlace para compartir se obtiene sin sesion', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogo/compartir' });
    expect(res.statusCode).toBe(200);
  });

  it('la ruta de salud responde sin sesion', async () => {
    const res = await app.inject({ method: 'GET', url: '/salud' });
    expect(res.statusCode).toBe(200);
  });

  it('el catalogo NO filtra datos de empleados ni de nomina', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalogo' });
    const texto = JSON.stringify(res.json());

    // Nada de tarifas, salarios ni ahorro debe aparecer en la respuesta publica.
    expect(texto).not.toContain('tarifa');
    expect(texto).not.toContain('salario');
    expect(texto).not.toContain('ahorro');
    expect(texto).not.toContain('empleado');
  });
});

describe('roles: quien administra el catalogo no ve la nomina', () => {
  let cookieAdmin = '';
  let cookieCatalogo = '';

  beforeAll(async () => {
    const admin = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123' },
    });
    cookieAdmin = cookieDe(admin);

    await app.inject({
      method: 'POST',
      url: '/api/sesion/usuarios',
      headers: { cookie: cookieAdmin },
      payload: {
        usuario: 'vendedora',
        contrasena: 'otra-clave-456',
        nombre: 'Encargada catalogo',
        rol: 'catalogo',
      },
    });

    const catalogo = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'vendedora', contrasena: 'otra-clave-456' },
    });
    cookieCatalogo = cookieDe(catalogo);
  });

  it('el rol catalogo SI puede administrar productos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/productos',
      headers: { cookie: cookieCatalogo },
      payload: { nombre: 'Camiseta', precio: 45_000 },
    });

    expect(res.statusCode).toBe(201);
  });

  it('el rol catalogo NO puede ver los empleados', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/empleados',
      headers: { cookie: cookieCatalogo },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().mensaje).toContain('administradores');
  });

  it('el rol catalogo NO puede ver la nomina ni la caja', async () => {
    const nomina = await app.inject({
      method: 'GET',
      url: '/api/nomina',
      headers: { cookie: cookieCatalogo },
    });
    const caja = await app.inject({
      method: 'GET',
      url: '/api/caja',
      headers: { cookie: cookieCatalogo },
    });

    expect(nomina.statusCode).toBe(403);
    expect(caja.statusCode).toBe(403);
  });

  it('el rol catalogo NO puede crear usuarios', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/usuarios',
      headers: { cookie: cookieCatalogo },
      payload: { usuario: 'colado', contrasena: 'clave-larga-789', nombre: 'Colado' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('el admin SI puede ver todo', async () => {
    const empleados = await app.inject({
      method: 'GET',
      url: '/api/empleados',
      headers: { cookie: cookieAdmin },
    });
    const nomina = await app.inject({
      method: 'GET',
      url: '/api/nomina',
      headers: { cookie: cookieAdmin },
    });

    expect(empleados.statusCode).toBe(200);
    expect(nomina.statusCode).toBe(200);
  });
});

describe('cambio de contrasena', () => {
  // Usuario propio de este bloque: cambiarle la clave a uno compartido dejaria
  // los otros describe dependiendo del orden de ejecucion.
  const CLAVE_INICIAL = 'clave-inicial-123';
  let cookie = '';

  beforeAll(async () => {
    const admin = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'juand', contrasena: 'clave-larga-123' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/sesion/usuarios',
      headers: { cookie: cookieDe(admin) },
      payload: {
        usuario: 'cambiaclave',
        contrasena: CLAVE_INICIAL,
        nombre: 'Prueba de cambio',
        rol: 'admin',
      },
    });

    const entrada = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'cambiaclave', contrasena: CLAVE_INICIAL },
    });
    cookie = cookieDe(entrada);
  });

  it('exige la contrasena actual, aunque haya sesion abierta', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sesion/cambiar-contrasena',
      headers: { cookie },
      payload: { contrasenaActual: 'la-que-no-es', contrasenaNueva: 'nueva-clave-999' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('actual no es correcta');
  });

  it('cambia la contrasena y cierra las sesiones abiertas', async () => {
    const cambio = await app.inject({
      method: 'POST',
      url: '/api/sesion/cambiar-contrasena',
      headers: { cookie },
      payload: { contrasenaActual: CLAVE_INICIAL, contrasenaNueva: 'nueva-clave-999' },
    });
    expect(cambio.statusCode).toBe(200);

    // La sesion vieja ya no sirve: si alguien tenia el token robado, queda fuera.
    const conTokenViejo = await app.inject({
      method: 'GET',
      url: '/api/empleados',
      headers: { cookie },
    });
    expect(conTokenViejo.statusCode).toBe(401);

    // Y la contrasena nueva si funciona.
    const nueva = await app.inject({
      method: 'POST',
      url: '/api/sesion/entrar',
      payload: { usuario: 'cambiaclave', contrasena: 'nueva-clave-999' },
    });
    expect(nueva.statusCode).toBe(200);
  });
});
