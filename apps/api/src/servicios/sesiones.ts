import { eq, and, lt, gt } from 'drizzle-orm';
import { db, esquema } from '../db/cliente.js';
import { ErrorDatosInvalidos, ErrorNoAutorizado } from '../errores.js';
import {
  hashearContrasena,
  verificarContrasena,
  generarTokenSesion,
  LARGO_MINIMO_CONTRASENA,
} from './contrasenas.js';
import type { Rol } from '@credito/shared';

const { usuarios, sesiones, DIAS_SESION } = esquema;

export interface UsuarioSesion {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
}

function aUsuarioSesion(fila: typeof usuarios.$inferSelect): UsuarioSesion {
  return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol };
}

/** Normaliza el nombre de usuario: minusculas y sin espacios sobrantes. */
function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** True si todavia no hay ningun usuario: sirve para la instalacion inicial. */
export async function necesitaInstalacion(): Promise<boolean> {
  const [alguno] = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  return alguno === undefined;
}

/**
 * Crea el primer usuario administrador.
 *
 * Solo funciona si la base no tiene usuarios. Se hace asi en vez de dejar un
 * usuario y contrasena por defecto en el codigo: una credencial por defecto
 * que nadie cambia es la forma mas comun de que entren a un sistema.
 */
export async function instalarPrimerUsuario(datos: {
  usuario: string;
  contrasena: string;
  nombre: string;
}): Promise<UsuarioSesion> {
  if (!(await necesitaInstalacion())) {
    throw new ErrorDatosInvalidos(
      'Ya hay usuarios registrados. Pide a un administrador que te cree la cuenta.',
    );
  }

  return crearUsuario({ ...datos, rol: 'admin' });
}

export async function crearUsuario(datos: {
  usuario: string;
  contrasena: string;
  nombre: string;
  rol?: Rol;
}): Promise<UsuarioSesion> {
  const usuario = normalizarUsuario(datos.usuario);

  if (usuario.length < 3) {
    throw new ErrorDatosInvalidos('El usuario debe tener al menos 3 caracteres.');
  }

  if (datos.contrasena.length < LARGO_MINIMO_CONTRASENA) {
    throw new ErrorDatosInvalidos(
      `La contrasena debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
    );
  }

  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.usuario, usuario))
    .limit(1);

  if (existente) {
    throw new ErrorDatosInvalidos(`El usuario "${usuario}" ya esta registrado.`);
  }

  const [creado] = await db
    .insert(usuarios)
    .values({
      usuario,
      contrasenaHash: await hashearContrasena(datos.contrasena),
      nombre: datos.nombre.trim(),
      rol: datos.rol ?? 'admin',
    })
    .returning();

  return aUsuarioSesion(creado!);
}

/**
 * Valida usuario y contrasena, y abre una sesion.
 *
 * El mensaje de error es el mismo si el usuario no existe o si la contrasena
 * esta mal, a proposito: decir "ese usuario no existe" le confirma a quien
 * este probando cuales nombres son validos.
 */
export async function iniciarSesion(datos: {
  usuario: string;
  contrasena: string;
  ip?: string;
  navegador?: string;
}): Promise<{ token: string; usuario: UsuarioSesion; expiraEn: string }> {
  const nombreUsuario = normalizarUsuario(datos.usuario);

  const [fila] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.usuario, nombreUsuario))
    .limit(1);

  const generico = 'Usuario o contrasena incorrectos.';

  // Si el usuario no existe se verifica igual contra un hash de mentira, para
  // que la respuesta tarde lo mismo. Sin esto, un usuario inexistente responde
  // al instante y uno real tarda 80ms, y esa diferencia revela cuales existen.
  if (!fila) {
    await verificarContrasena(datos.contrasena, 'scrypt$00$00');
    throw new ErrorNoAutorizado(generico);
  }

  if (!fila.activo) {
    throw new ErrorNoAutorizado('Esta cuenta esta desactivada.');
  }

  if (!(await verificarContrasena(datos.contrasena, fila.contrasenaHash))) {
    throw new ErrorNoAutorizado(generico);
  }

  const token = generarTokenSesion();
  const expira = new Date();
  expira.setDate(expira.getDate() + DIAS_SESION);
  const expiraEn = expira.toISOString();

  await db.insert(sesiones).values({
    id: token,
    usuarioId: fila.id,
    expiraEn,
    ip: datos.ip ?? null,
    navegador: datos.navegador?.slice(0, 200) ?? null,
  });

  await db
    .update(usuarios)
    .set({ ultimoAcceso: new Date().toISOString() })
    .where(eq(usuarios.id, fila.id));

  // Oportunidad barata para limpiar sesiones vencidas.
  await limpiarSesionesVencidas();

  return { token, usuario: aUsuarioSesion(fila), expiraEn };
}

/**
 * Busca el usuario dueno de una sesion valida.
 * Devuelve null si el token no existe, vencio o el usuario se desactivo.
 */
export async function usuarioDeSesion(token: string): Promise<UsuarioSesion | null> {
  const ahora = new Date().toISOString();

  const [fila] = await db
    .select({
      id: usuarios.id,
      usuario: usuarios.usuario,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(sesiones.usuarioId, usuarios.id))
    .where(and(eq(sesiones.id, token), gt(sesiones.expiraEn, ahora)))
    .limit(1);

  if (!fila || !fila.activo) return null;

  return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol };
}

/** Cierra una sesion. Borrar la fila la invalida de inmediato. */
export async function cerrarSesion(token: string): Promise<void> {
  await db.delete(sesiones).where(eq(sesiones.id, token));
}

/** Cierra TODAS las sesiones de un usuario. Util si sospecha que lo espiaron. */
export async function cerrarTodasLasSesiones(usuarioId: string): Promise<void> {
  await db.delete(sesiones).where(eq(sesiones.usuarioId, usuarioId));
}

async function limpiarSesionesVencidas(): Promise<void> {
  await db.delete(sesiones).where(lt(sesiones.expiraEn, new Date().toISOString()));
}

/**
 * Cambia la contrasena.
 *
 * Exige la actual aunque ya haya sesion abierta: si alguien deja el computador
 * desbloqueado, no debe poder cambiarle la contrasena y quedarse con la cuenta.
 * Al cambiarla se cierran las demas sesiones.
 */
export async function cambiarContrasena(datos: {
  usuarioId: string;
  contrasenaActual: string;
  contrasenaNueva: string;
}): Promise<void> {
  if (datos.contrasenaNueva.length < LARGO_MINIMO_CONTRASENA) {
    throw new ErrorDatosInvalidos(
      `La contrasena nueva debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
    );
  }

  const [fila] = await db
    .select({ contrasenaHash: usuarios.contrasenaHash })
    .from(usuarios)
    .where(eq(usuarios.id, datos.usuarioId))
    .limit(1);

  if (!fila) throw new ErrorNoAutorizado('Sesion invalida.');

  if (!(await verificarContrasena(datos.contrasenaActual, fila.contrasenaHash))) {
    throw new ErrorDatosInvalidos('La contrasena actual no es correcta.');
  }

  await db
    .update(usuarios)
    .set({ contrasenaHash: await hashearContrasena(datos.contrasenaNueva) })
    .where(eq(usuarios.id, datos.usuarioId));

  await cerrarTodasLasSesiones(datos.usuarioId);
}

/** Lista de usuarios, sin los hashes. */
export async function listarUsuarios() {
  return db
    .select({
      id: usuarios.id,
      usuario: usuarios.usuario,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      ultimoAcceso: usuarios.ultimoAcceso,
      creadoEn: usuarios.creadoEn,
    })
    .from(usuarios)
    .orderBy(usuarios.nombre);
}
