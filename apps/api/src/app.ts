import Fastify, { type FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import {
  serializerCompiler,
  validatorCompiler,
  hasZodFastifySchemaValidationErrors,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { config } from './config.js';
import { ErrorAplicacion } from './errores.js';
import { rutasEmpleados } from './rutas/empleados.js';
import { rutasMunicipios } from './rutas/municipios.js';
import { rutasVentas, rutasCobros, rutasGastos } from './rutas/operaciones.js';
import { rutasNomina } from './rutas/nomina.js';
import { rutasCaja } from './rutas/caja.js';
import { rutasProductos } from './rutas/productos.js';
import { rutasConfiguracion } from './rutas/configuracion.js';
import { rutasCatalogo } from './rutas/catalogo.js';
import { rutasSesion } from './rutas/sesion.js';
import { rutasUsuarios } from './rutas/usuarios.js';
import { rutasWhatsapp } from './rutas/whatsapp.js';
import { rutasAdminWhatsApp } from './rutas/admin-whatsapp.js';
import { rutasAdminIA } from './rutas/admin-ia.js';
import { rutasPedidos } from './rutas/pedidos.js';
import { verificarSesion, soloAdmin } from './autenticacion.js';

/**
 * Opciones del logger.
 *
 * pino-pretty solo embellece la salida en desarrollo. Se verifica que este
 * instalado antes de pedirlo: si falta, el servidor arranca igual con logs
 * en JSON en vez de negarse a iniciar por una dependencia cosmetica.
 */
function opcionesLogger() {
  const nivel = config.esProduccion ? 'info' : 'debug';
  if (config.esProduccion) return { level: nivel };

  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return { level: nivel, transport: { target: 'pino-pretty' } };
  } catch {
    return { level: nivel };
  }
}

/**
 * Saca el nombre del campo que fallo desde los params de Zod.
 * Vienen sin tipo, asi que se revisan con cuidado antes de leerlos.
 */
function nombreCampo(params: unknown): string | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const issue = (params as { issue?: unknown }).issue;
  if (typeof issue !== 'object' || issue === null) return undefined;
  const path = (issue as { path?: unknown }).path;
  return Array.isArray(path) && path.length > 0 ? path.join('.') : undefined;
}

export async function construirApp(): Promise<FastifyInstance> {
  // fastify-static falla si la carpeta no existe todavia.
  mkdirSync(config.carpetaImagenes, { recursive: true });

  const app = Fastify({
    // En tests el logger se apaga para no ensuciar la salida.
    logger: config.esPrueba ? false : opcionesLogger(),
  }).withTypeProvider<ZodTypeProvider>();

  // Zod valida la entrada y serializa la salida.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // CORS restringido a los origenes configurados: no se usa '*' porque
  // mas adelante la API llevara sesion y '*' no permite credenciales.
  await app.register(cors, { origin: config.origenesPermitidos, credentials: true });

  /**
   * Limite de peticiones. Importa porque el catalogo es publico: en un VPS,
   * sin esto, cualquiera puede golpear la pagina en bucle y tumbar el servidor.
   */
  await app.register(rateLimit, {
    max: config.esPrueba ? 10_000 : 300,
    timeWindow: '1 minute',
    // El catalogo esta pensado para que varias personas lo abran a la vez,
    // asi que el limite es por IP y no global.
    keyGenerator: (peticion) => peticion.ip,
  });

  // Cookies firmadas: si alguien modifica el valor a mano, la firma no cuadra
  // y Fastify la descarta.
  await app.register(cookie, { secret: config.secretoCookies });

  // Recibe las fotos del celular. El limite real se aplica por ruta.
  await app.register(multipart, {
    limits: { fileSize: config.maxBytesImagen, files: 1 },
  });

  // Sirve las fotos ya procesadas.
  await app.register(fastifyStatic, {
    root: config.carpetaImagenes,
    prefix: `${config.rutaPublicaImagenes}/`,
    // Las imagenes llevan nombre unico (uuid), asi que nunca cambian:
    // se pueden cachear por mucho tiempo sin riesgo de servir una vieja.
    maxAge: '30d',
    // No listar el contenido de la carpeta.
    index: false,
    list: false,
  });

  app.setErrorHandler((error, peticion, respuesta) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return respuesta.code(400).send({
        error: 'DATOS_INVALIDOS',
        mensaje: 'Los datos enviados no son validos',
        detalles: error.validation.map((v) => ({
          campo: v.instancePath || nombreCampo(v.params) || '(raiz)',
          mensaje: v.message ?? 'Valor invalido',
        })),
      });
    }

    if (error instanceof ErrorAplicacion) {
      return respuesta.code(error.codigoHttp).send({
        error: error.codigo,
        mensaje: error.message,
      });
    }

    /**
     * Demasiadas peticiones.
     *
     * Sin esto el limitador respondia 500 con un mensaje generico, y quien
     * estuviera entrando pensaria que el servidor se rompio en vez de entender
     * que tiene que esperar un momento.
     */
    if ((error as { statusCode?: number }).statusCode === 429) {
      return respuesta.code(429).send({
        error: 'DEMASIADOS_INTENTOS',
        mensaje: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
      });
    }

    // Errores no previstos: se registran completos pero al cliente solo le
    // llega un mensaje generico, para no exponer detalles internos.
    peticion.log.error({ err: error }, 'Error no controlado');
    return respuesta.code(500).send({
      error: 'ERROR_INTERNO',
      mensaje: 'Ocurrio un error inesperado. Revisa los logs del servidor.',
    });
  });

  /**
   * Guardian de sesion. Va como hook global y no ruta por ruta para que las
   * rutas nuevas queden protegidas por omision: lo publico se declara
   * explicitamente en la lista de autenticacion.ts.
   *
   * Se registra DESPUES de cookie y ANTES de las rutas.
   */
  app.addHook('onRequest', verificarSesion);

  app.get('/salud', () => ({ estado: 'ok', entorno: config.entorno }));

  await app.register(rutasSesion, { prefix: '/api/sesion' });

  /**
   * Rutas con informacion de plata: exigen rol de administrador.
   *
   * Se agrupan en un contexto propio para que el permiso se aplique una vez y
   * no haya que recordarlo en cada endpoint nuevo que se agregue adentro.
   */
  await app.register(async (privado) => {
    soloAdmin(privado);

    await privado.register(rutasEmpleados, { prefix: '/api/empleados' });
    await privado.register(rutasMunicipios, { prefix: '/api/municipios' });
    await privado.register(rutasVentas, { prefix: '/api/ventas' });
    await privado.register(rutasCobros, { prefix: '/api/cobros' });
    await privado.register(rutasGastos, { prefix: '/api/gastos' });
    await privado.register(rutasNomina, { prefix: '/api/nomina' });
    await privado.register(rutasCaja, { prefix: '/api/caja' });
    await privado.register(rutasUsuarios, { prefix: '/api/usuarios' });
    await privado.register(rutasAdminWhatsApp, { prefix: '/api' });
    await privado.register(rutasAdminIA, { prefix: '/api' });
    await privado.register(rutasPedidos, { prefix: '/api' });
  });

  // El catalogo lo puede administrar tambien el rol 'catalogo'.
  await app.register(rutasProductos, { prefix: '/api/productos' });
  await app.register(rutasConfiguracion, { prefix: '/api/configuracion' });

  // Rutas de WhatsApp - incluyen webhook público
  await app.register(rutasWhatsapp, { prefix: '/api/whatsapp' });

  // Publicas, sin sesion: /catalogo y /api/catalogo
  await app.register(rutasCatalogo);

  return app;
}
