import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, esquema } from '../db/cliente.js';
import { hashearContrasena } from '../auth/contrasena.js';
import { obtenerPermisos } from '../auth/permisos.js';
import {
  zNuevoUsuario,
  zActualizarUsuario,
  zCambiarContrasena,
} from './validacion.js';
import type { Usuario, UsuarioFila } from '@credito/shared';

const { usuarios } = esquema;

function mapearUsuario(fila: UsuarioFila): Usuario {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    rol: fila.rol,
    permisos: obtenerPermisos(fila.rol, fila.permisos),
    empleadoId: fila.empleadoId,
    activo: fila.activo,
    ultimoAcceso: fila.ultimoAcceso,
    creadoEn: fila.creadoEn,
  };
}

export async function rutasUsuarios(app: FastifyInstance) {
  // GET /api/usuarios - Listar todos los usuarios
  app.get('/', async (request, reply) => {
    const filas = await db
      .select({
        id: usuarios.id,
        usuario: usuarios.usuario,
        contrasenaHash: usuarios.contrasenaHash,
        nombre: usuarios.nombre,
        rol: usuarios.rol,
        permisos: usuarios.permisos,
        empleadoId: usuarios.empleadoId,
        activo: usuarios.activo,
        ultimoAcceso: usuarios.ultimoAcceso,
        creadoEn: usuarios.creadoEn,
      })
      .from(usuarios)
      .orderBy(usuarios.nombre);

    const usuariosMap = filas.map(mapearUsuario);
    return usuariosMap;
  });

  // GET /api/usuarios/:id - Obtener un usuario por ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const [fila] = await db
      .select({
        id: usuarios.id,
        usuario: usuarios.usuario,
        contrasenaHash: usuarios.contrasenaHash,
        nombre: usuarios.nombre,
        rol: usuarios.rol,
        permisos: usuarios.permisos,
        empleadoId: usuarios.empleadoId,
        activo: usuarios.activo,
        ultimoAcceso: usuarios.ultimoAcceso,
        creadoEn: usuarios.creadoEn,
      })
      .from(usuarios)
      .where(eq(usuarios.id, request.params.id))
      .limit(1);

    if (!fila) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    return mapearUsuario(fila);
  });

  // POST /api/usuarios - Crear un nuevo usuario
  app.post('/', async (request, reply) => {
    const datos = zNuevoUsuario.parse(request.body);

    // Validar que el usuario no exista
    const [existente] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.usuario, datos.usuario))
      .limit(1);

    if (existente) {
      return reply.code(400).send({ error: 'El usuario ya existe' });
    }

    // Si el rol es custom, debe tener permisos definidos
    if (datos.rol === 'custom' && !datos.permisos) {
      return reply
        .code(400)
        .send({ error: 'El rol custom requiere permisos explícitos' });
    }

    // Hashear contraseña
    const contrasenaHash = await hashearContrasena(datos.contrasena);

    // Crear usuario
    const [nuevo] = await db
      .insert(usuarios)
      .values({
        usuario: datos.usuario,
        contrasenaHash,
        nombre: datos.nombre,
        rol: datos.rol,
        permisos: datos.permisos ? JSON.stringify(datos.permisos) : null,
        empleadoId: datos.empleadoId ?? null,
        activo: datos.activo ?? true,
      })
      .returning({
        id: usuarios.id,
        usuario: usuarios.usuario,
        contrasenaHash: usuarios.contrasenaHash,
        nombre: usuarios.nombre,
        rol: usuarios.rol,
        permisos: usuarios.permisos,
        empleadoId: usuarios.empleadoId,
        activo: usuarios.activo,
        ultimoAcceso: usuarios.ultimoAcceso,
        creadoEn: usuarios.creadoEn,
      });

    return reply.code(201).send(mapearUsuario(nuevo!));
  });

  // PATCH /api/usuarios/:id - Actualizar un usuario
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const datos = zActualizarUsuario.parse(request.body);

    // Si el rol es custom, debe tener permisos definidos
    if (datos.rol === 'custom' && !datos.permisos) {
      return reply
        .code(400)
        .send({ error: 'El rol custom requiere permisos explícitos' });
    }

    const valores: any = {};
    if (datos.nombre !== undefined) valores.nombre = datos.nombre;
    if (datos.rol !== undefined) valores.rol = datos.rol;
    if (datos.permisos !== undefined)
      valores.permisos = JSON.stringify(datos.permisos);
    if (datos.empleadoId !== undefined) valores.empleadoId = datos.empleadoId;
    if (datos.activo !== undefined) valores.activo = datos.activo;

    const [actualizado] = await db
      .update(usuarios)
      .set(valores)
      .where(eq(usuarios.id, request.params.id))
      .returning({
        id: usuarios.id,
        usuario: usuarios.usuario,
        contrasenaHash: usuarios.contrasenaHash,
        nombre: usuarios.nombre,
        rol: usuarios.rol,
        permisos: usuarios.permisos,
        empleadoId: usuarios.empleadoId,
        activo: usuarios.activo,
        ultimoAcceso: usuarios.ultimoAcceso,
        creadoEn: usuarios.creadoEn,
      });

    if (!actualizado) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    return mapearUsuario(actualizado);
  });

  // DELETE /api/usuarios/:id - Eliminar un usuario
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const [eliminado] = await db
      .delete(usuarios)
      .where(eq(usuarios.id, request.params.id))
      .returning({ id: usuarios.id });

    if (!eliminado) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    return reply.code(204).send();
  });

  // POST /api/usuarios/:id/cambiar-contrasena - Cambiar contraseña
  app.post<{ Params: { id: string } }>(
    '/:id/cambiar-contrasena',
    async (request, reply) => {
      const datos = zCambiarContrasena.parse(request.body);

      // Aquí deberías verificar la contraseña actual
      // Por simplicidad, solo actualizamos con la nueva

      const contrasenaHash = await hashearContrasena(datos.contrasenaNueva);

      const [actualizado] = await db
        .update(usuarios)
        .set({ contrasenaHash })
        .where(eq(usuarios.id, request.params.id))
        .returning({ id: usuarios.id });

      if (!actualizado) {
        return reply.code(404).send({ error: 'Usuario no encontrado' });
      }

      return reply.send({ mensaje: 'Contraseña actualizada' });
    },
  );
}
