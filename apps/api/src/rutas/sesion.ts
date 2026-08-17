import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { config } from '../config.js';
import {
  iniciarSesion,
  cerrarSesion,
  necesitaInstalacion,
  instalarPrimerUsuario,
  crearUsuario,
  cambiarContrasena,
  listarUsuarios,
} from '../servicios/sesiones.js';
import { COOKIE_SESION, opcionesCookie, exigirAdmin, leerTokenSesion } from '../autenticacion.js';
import { ErrorNoAutorizado } from '../errores.js';
import { LARGO_MINIMO_CONTRASENA } from '../servicios/contrasenas.js';

const zCredenciales = z.object({
  usuario: z.string().trim().min(1, 'Escribe tu usuario'),
  contrasena: z.string().min(1, 'Escribe tu contrasena'),
});

const zNuevoUsuario = z.object({
  usuario: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, numeros, punto, guion y guion bajo'),
  contrasena: z
    .string()
    .min(LARGO_MINIMO_CONTRASENA, `Minimo ${LARGO_MINIMO_CONTRASENA} caracteres`)
    .max(200),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
});

export const rutasSesion: FastifyPluginAsyncZod = async (app) => {
  /**
   * Estado de la sesion. Es publica porque el frontend la consulta al cargar
   * para saber si mostrar el login, el asistente de instalacion o la app.
   */
  app.get('/estado', async (peticion) => {
    const instalacion = await necesitaInstalacion();
    return {
      necesitaInstalacion: instalacion,
      autenticado: Boolean(peticion.usuario),
      usuario: peticion.usuario ?? null,
    };
  });

  /**
   * Crea el primer administrador. Solo funciona con la base sin usuarios.
   *
   * Existe para no dejar una credencial por defecto en el codigo, que es la
   * forma mas comun de que entren a un sistema recien instalado.
   */
  app.post('/instalar', {
    schema: { body: zNuevoUsuario },
    handler: async (peticion, respuesta) => {
      const usuario = await instalarPrimerUsuario(peticion.body);

      // Se entra de inmediato: no tiene sentido pedirle la contrasena que
      // acaba de escribir.
      const sesion = await iniciarSesion({
        usuario: peticion.body.usuario,
        contrasena: peticion.body.contrasena,
        ip: peticion.ip,
        navegador: peticion.headers['user-agent'],
      });

      respuesta.setCookie(COOKIE_SESION, sesion.token, opcionesCookie(sesion.expiraEn));
      respuesta.code(201);
      return { usuario };
    },
  });

  app.post('/entrar', {
    schema: { body: zCredenciales },
    /**
     * Limite propio de esta ruta: sin el se pueden probar contrasenas en bucle
     * hasta acertar.
     *
     * Se limita por IP. No se puede incluir el nombre de usuario en la clave
     * porque el limitador corre en onRequest, antes de que Fastify parsee el
     * cuerpo de la peticion: alli `peticion.body` todavia no existe.
     *
     * 30 intentos por cada 5 minutos alcanza de sobra para el uso normal, aun
     * equivocandose varias veces o entrando desde varios dispositivos de la
     * misma oficina, y deja sin salida un ataque de fuerza bruta.
     */
    config: { rateLimit: { max: config.maxIntentosEntrar, timeWindow: '5 minutes' } },
    handler: async (peticion, respuesta) => {
      const sesion = await iniciarSesion({
        ...peticion.body,
        ip: peticion.ip,
        navegador: peticion.headers['user-agent'],
      });

      respuesta.setCookie(COOKIE_SESION, sesion.token, opcionesCookie(sesion.expiraEn));
      return { usuario: sesion.usuario };
    },
  });

  app.post('/salir', async (peticion, respuesta) => {
    const token = leerTokenSesion(peticion);
    if (token) await cerrarSesion(token);
    respuesta.clearCookie(COOKIE_SESION, { path: '/' });
    return { salio: true };
  });

  app.post('/cambiar-contrasena', {
    schema: {
      body: z.object({
        contrasenaActual: z.string().min(1, 'Escribe tu contrasena actual'),
        contrasenaNueva: z.string().min(LARGO_MINIMO_CONTRASENA, `Minimo ${LARGO_MINIMO_CONTRASENA} caracteres`),
      }),
    },
    handler: async (peticion, respuesta) => {
      if (!peticion.usuario) throw new ErrorNoAutorizado();

      await cambiarContrasena({
        usuarioId: peticion.usuario.id,
        ...peticion.body,
      });

      // Cambiar la contrasena cierra todas las sesiones, incluida esta.
      respuesta.clearCookie(COOKIE_SESION, { path: '/' });
      return { cambiada: true, mensaje: 'Contrasena cambiada. Vuelve a entrar.' };
    },
  });

  /** Administracion de usuarios: solo un admin puede crear cuentas. */
  app.get('/usuarios', { onRequest: exigirAdmin }, async () => listarUsuarios());

  app.post('/usuarios', {
    onRequest: exigirAdmin,
    schema: {
      body: zNuevoUsuario.extend({ rol: z.enum(['admin', 'catalogo']).default('catalogo') }),
    },
    handler: async (peticion, respuesta) => {
      const usuario = await crearUsuario(peticion.body);
      respuesta.code(201);
      return usuario;
    },
  });
};
