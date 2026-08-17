import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { usuarioDeSesion, type UsuarioSesion } from './servicios/sesiones.js';
import { ErrorNoAutorizado, ErrorSinPermiso } from './errores.js';
import { config } from './config.js';

/** Nombre de la cookie de sesion. */
export const COOKIE_SESION = 'sesion';

// Deja disponible peticion.usuario dentro de las rutas protegidas.
declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioSesion;
  }
}

/**
 * Rutas que NO exigen sesion.
 *
 * Es una lista de permitidos y no de bloqueados: si manana se agrega una ruta
 * nueva y alguien olvida protegerla, queda privada por omision. Al contrario
 * (bloquear una lista) el olvido deja datos de nomina al aire.
 */
const RUTAS_PUBLICAS = new Set([
  '/salud',
  '/catalogo',
  '/api/catalogo',
  '/api/catalogo/compartir',
  '/api/sesion/entrar',
  '/api/sesion/estado',
  '/api/sesion/instalar',
  '/api/whatsapp/webhook', // Webhook de WhatsApp (GET y POST)
]);

function esPublica(url: string): boolean {
  // Se descarta la parte de consulta antes de comparar.
  const ruta = url.split('?')[0] ?? '';
  if (RUTAS_PUBLICAS.has(ruta)) return true;
  // Las fotos del catalogo son publicas: se ven sin cuenta.
  return ruta.startsWith(`${config.rutaPublicaImagenes}/`);
}

/**
 * Verifica la sesion antes de cada peticion.
 *
 * Se registra como hook global (onRequest) en vez de ruta por ruta para que
 * no dependa de recordar ponerlo en cada endpoint nuevo.
 */
export async function verificarSesion(
  peticion: FastifyRequest,
  _respuesta: FastifyReply,
): Promise<void> {
  const token = leerTokenSesion(peticion);

  /**
   * En las rutas publicas la sesion se lee pero no se exige.
   *
   * Hace falta para /api/sesion/estado, que es publica (el frontend la
   * consulta antes de tener sesion) pero necesita informar quien entro cuando
   * si la hay. Si aqui se retornara de una, esa ruta responderia siempre
   * "no autenticado" y el login se quedaria dando vueltas: el usuario entra
   * bien, la cookie se guarda, y la pantalla no avanza.
   */
  if (esPublica(peticion.url)) {
    if (token) {
      const usuario = await usuarioDeSesion(token);
      if (usuario) peticion.usuario = usuario;
    }
    return;
  }

  if (!token) throw new ErrorNoAutorizado();

  const usuario = await usuarioDeSesion(token);
  if (!usuario) {
    // El token existe pero ya no sirve (vencio o se cerro la sesion).
    throw new ErrorNoAutorizado('Tu sesion expiro. Vuelve a entrar.');
  }

  peticion.usuario = usuario;
}

/**
 * Saca el token de la cookie firmada.
 *
 * La cookie viaja como "token.firma". Hay que verificar la firma y quedarse
 * solo con el token: si se usara el valor completo, no coincidiria con el que
 * esta guardado en la base. Y si no se verificara la firma, cualquiera podria
 * escribir un token a mano en su navegador.
 */
export function leerTokenSesion(peticion: FastifyRequest): string | null {
  const cookie = peticion.cookies[COOKIE_SESION];
  if (!cookie) return null;

  const resultado = peticion.unsignCookie(cookie);
  // valid es false si la firma no cuadra: la cookie se modifico o el secreto
  // cambio desde que se emitio.
  if (!resultado.valid || !resultado.value) return null;

  return resultado.value;
}

/**
 * Exige rol de administrador.
 *
 * Se usa en las rutas con datos de plata: salarios, nomina, ahorro y caja.
 * El rol 'catalogo' solo administra productos y la configuracion publica.
 */
export async function exigirAdmin(peticion: FastifyRequest): Promise<void> {
  if (!peticion.usuario) throw new ErrorNoAutorizado();
  if (peticion.usuario.rol !== 'admin') {
    throw new ErrorSinPermiso(
      'Esta seccion es solo para administradores: contiene informacion de pagos.',
    );
  }
}

/** Aplica exigirAdmin a todas las rutas de un plugin. */
export function soloAdmin(app: FastifyInstance): void {
  app.addHook('onRequest', exigirAdmin);
}

/** Opciones de la cookie de sesion. */
export function opcionesCookie(expiraEn: string) {
  return {
    path: '/',
    // httpOnly: el JavaScript de la pagina no puede leerla. Si alguien logra
    // inyectar un script, no se lleva la sesion.
    httpOnly: true,
    // secure: solo viaja por HTTPS. En desarrollo se apaga porque es http.
    secure: config.esProduccion,
    // sameSite lax: no se envia desde otros sitios, lo que corta los ataques
    // donde una pagina ajena hace peticiones en nombre del usuario.
    sameSite: 'lax' as const,
    expires: new Date(expiraEn),
    signed: true,
  };
}
