import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/cliente.js';
import { etiquetasCartera, clienteEtiquetas, gruposGestion, clientesGrupo } from '../db/esquema/crm-etiquetas.js';
import { carteraClientes, gestionesCobro } from '../db/esquema/crm.js';
import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm';
import { crearPromesaCrm } from './crm-operativo.js';

export async function rutasEtiquetasGrupos(fastify: FastifyInstance) {

  // ============================================================================
  // ETIQUETAS
  // ============================================================================

  /**
   * GET /api/admin/crm/etiquetas
   * Lista todas las etiquetas disponibles
   */
  fastify.get('/etiquetas', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const etiquetas = await db
      .select()
      .from(etiquetasCartera)
      .where(eq(etiquetasCartera.activa, true))
      .orderBy(asc(etiquetasCartera.orden));

    return { etiquetas };
  });

  /**
   * POST /api/admin/crm/etiquetas
   * Crear nueva etiqueta personalizada
   */
  fastify.post('/etiquetas', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      nombre: z.string().min(1),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      icono: z.string().optional(),
      descripcion: z.string().optional(),
      orden: z.number().optional(),
    });

    const datos = schema.parse(request.body);

    const [etiqueta] = await db
      .insert(etiquetasCartera)
      .values({
        ...datos,
        sistema: false,
        activa: true,
      })
      .returning();

    return { etiqueta };
  });

  /**
   * POST /api/admin/crm/clientes/:clienteId/etiquetas
   * Asignar etiqueta(s) a un cliente
   */
  fastify.post('/clientes/:clienteId/etiquetas', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { clienteId } = request.params as { clienteId: string };

    const schema = z.object({
      etiquetaIds: z.array(z.string()),
      notas: z.string().optional(),
    });

    const datos = schema.parse(request.body);

    // Insertar las etiquetas
    const asignaciones = await Promise.all(
      datos.etiquetaIds.map((etiquetaId) =>
        db
          .insert(clienteEtiquetas)
          .values({
            carteraClienteId: clienteId,
            etiquetaId,
            usuarioId: request.usuario!.id,
            nombreUsuario: request.usuario!.nombre,
            notas: datos.notas,
          })
          .returning()
          .catch(() => null) // Ignorar duplicados
      )
    );

    return { asignaciones: asignaciones.filter(Boolean) };
  });

  /**
   * DELETE /api/admin/crm/clientes/:clienteId/etiquetas/:etiquetaId
   * Remover etiqueta de un cliente
   */
  fastify.delete('/clientes/:clienteId/etiquetas/:etiquetaId', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { clienteId, etiquetaId } = request.params as { clienteId: string; etiquetaId: string };

    await db
      .delete(clienteEtiquetas)
      .where(
        and(
          eq(clienteEtiquetas.carteraClienteId, clienteId),
          eq(clienteEtiquetas.etiquetaId, etiquetaId)
        )
      );

    return { success: true };
  });

  /**
   * GET /api/admin/crm/clientes/:clienteId/etiquetas
   * Obtener etiquetas de un cliente
   */
  fastify.get('/clientes/:clienteId/etiquetas', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { clienteId } = request.params as { clienteId: string };

    const etiquetas = await db
      .select({
        id: etiquetasCartera.id,
        nombre: etiquetasCartera.nombre,
        color: etiquetasCartera.color,
        icono: etiquetasCartera.icono,
        descripcion: etiquetasCartera.descripcion,
        asignadoEn: clienteEtiquetas.creadoEn,
        asignadoPor: clienteEtiquetas.nombreUsuario,
        notas: clienteEtiquetas.notas,
      })
      .from(clienteEtiquetas)
      .innerJoin(etiquetasCartera, eq(clienteEtiquetas.etiquetaId, etiquetasCartera.id))
      .where(eq(clienteEtiquetas.carteraClienteId, clienteId))
      .orderBy(asc(etiquetasCartera.orden));

    return { etiquetas };
  });

  // ============================================================================
  // GRUPOS DE GESTIÓN
  // ============================================================================

  /**
   * GET /api/admin/crm/grupos
   * Listar todos los grupos de gestión
   */
  fastify.get('/grupos', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const grupos = await db
      .select()
      .from(gruposGestion)
      .orderBy(desc(gruposGestion.creadoEn));

    return { grupos };
  });

  /**
   * POST /api/admin/crm/grupos
   * Crear nuevo grupo de gestión
   */
  fastify.post('/grupos', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      nombre: z.string().min(1),
      descripcion: z.string().optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      fechaInicio: z.string().optional(),
      fechaObjetivo: z.string().optional(),
    });

    const datos = schema.parse(request.body);

    const [grupo] = await db
      .insert(gruposGestion)
      .values({
        ...datos,
        estado: 'activo',
        totalClientes: 0,
        clientesGestionados: 0,
        creadoPorId: request.usuario.id,
        creadoPorNombre: request.usuario.nombre,
      })
      .returning();

    return { grupo };
  });

  /**
   * GET /api/admin/crm/grupos/:grupoId
   * Obtener detalle de un grupo con sus clientes
   */
  fastify.get('/grupos/:grupoId', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { grupoId } = request.params as { grupoId: string };

    // Obtener info del grupo
    const [grupo] = await db
      .select()
      .from(gruposGestion)
      .where(eq(gruposGestion.id, grupoId))
      .limit(1);

    if (!grupo) {
      return reply.code(404).send({ error: 'Grupo no encontrado' });
    }

    // Obtener clientes del grupo con sus datos
    const clientes = await db
      .select({
        clienteGrupoId: clientesGrupo.id,
        gestionado: clientesGrupo.gestionado,
        fechaGestion: clientesGrupo.fechaGestion,
        resultado: clientesGrupo.resultado,
        notas: clientesGrupo.notas,
        orden: clientesGrupo.orden,
        // Datos del cliente
        clienteId: carteraClientes.id,
        numero: carteraClientes.numero,
        cliente: carteraClientes.cliente,
        cedula: carteraClientes.cedula,
        telefono: carteraClientes.telefono,
        vendedor: carteraClientes.vendedor,
        saldo: carteraClientes.saldo,
        diasMora: carteraClientes.diasMora,
        estado: carteraClientes.estado,
      })
      .from(clientesGrupo)
      .innerJoin(carteraClientes, eq(clientesGrupo.carteraClienteId, carteraClientes.id))
      .where(eq(clientesGrupo.grupoId, grupoId))
      .orderBy(asc(clientesGrupo.orden), desc(carteraClientes.diasMora));

    return { grupo, clientes };
  });

  /**
   * POST /api/admin/crm/grupos/:grupoId/clientes
   * Agregar clientes a un grupo
   */
  fastify.post('/grupos/:grupoId/clientes', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { grupoId } = request.params as { grupoId: string };

    const schema = z.object({
      clienteIds: z.array(z.string()),
    });

    const datos = schema.parse(request.body);

    // Insertar los clientes en el grupo
    const asignaciones = await Promise.all(
      datos.clienteIds.map((clienteId, index) =>
        db
          .insert(clientesGrupo)
          .values({
            grupoId,
            carteraClienteId: clienteId,
            gestionado: false,
            orden: index,
          })
          .returning()
          .catch(() => null) // Ignorar duplicados
      )
    );

    const insertados = asignaciones.filter(Boolean);

    // Actualizar contador del grupo
    await db
      .update(gruposGestion)
      .set({
        totalClientes: sql`${gruposGestion.totalClientes} + ${insertados.length}`,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(gruposGestion.id, grupoId));

    return { asignaciones: insertados };
  });

  /**
   * PATCH /api/admin/crm/grupos/:grupoId/clientes/:clienteGrupoId
   * Marcar cliente como gestionado dentro del grupo
   */
  fastify.patch('/grupos/:grupoId/clientes/:clienteGrupoId', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { grupoId, clienteGrupoId } = request.params as { grupoId: string; clienteGrupoId: string };

    const schema = z.object({
      gestionado: z.boolean(),
      resultado: z.string().optional(),
      notas: z.string().optional(),
      montoPromesa: z.number().positive().optional(),
      fechaPromesa: z.string().optional(),
    });

    const validacion = schema.safeParse(request.body);
    if (!validacion.success || (validacion.data.gestionado && !validacion.data.resultado?.trim())) {
      return reply.code(400).send({ error: 'Selecciona el resultado de la gestion' });
    }
    const datos = validacion.data;
    const actualizado = await db.transaction(async (tx) => {
      const [grupo] = await tx.select().from(gruposGestion)
        .where(eq(gruposGestion.id, grupoId)).limit(1);
      const condicion = and(eq(clientesGrupo.id, clienteGrupoId), eq(clientesGrupo.grupoId, grupoId));
      const [anterior] = await tx.select().from(clientesGrupo).where(condicion).limit(1);
      if (!grupo || !anterior) return null;
      // Reintentar la misma transicion no debe crear otra gestion ni cambiar su fecha.
      if (anterior.gestionado === datos.gestionado) return anterior;
      const ahora = new Date().toISOString();
      const [cliente] = await tx.update(clientesGrupo).set({
        gestionado: datos.gestionado,
        fechaGestion: datos.gestionado ? ahora : null,
        resultado: datos.resultado,
        notas: datos.notas,
        actualizadoEn: ahora,
      }).where(condicion).returning();

      if (datos.gestionado && datos.resultado === 'promesa_pago') {
        await crearPromesaCrm(tx, cliente.carteraClienteId, { monto: datos.montoPromesa, fechaCompromiso: datos.fechaPromesa,
          notas: [`Grupo: ${grupo.nombre}`, datos.notas?.trim()].filter(Boolean).join('\n') }, request.usuario!);
      } else if (datos.gestionado) {
        await tx.insert(gestionesCobro).values({
          carteraClienteId: cliente.carteraClienteId,
          fechaGestion: ahora,
          tipoGestion: 'gestion_grupo',
          canal: 'no_especificado',
          resultado: datos.resultado!.trim(),
          notas: [`Grupo: ${grupo.nombre}`, datos.notas?.trim()].filter(Boolean).join('\n'),
          usuarioId: request.usuario!.id,
          nombreUsuario: request.usuario!.nombre,
        });
      }
      // Desmarcar reabre el trabajo del grupo, pero conserva el historial de contacto.
      const [conteo] = await tx.select({ total: sql<number>`COUNT(*)` }).from(clientesGrupo)
        .where(and(eq(clientesGrupo.grupoId, grupoId), eq(clientesGrupo.gestionado, true)));
      await tx.update(gruposGestion).set({
        clientesGestionados: conteo.total,
        actualizadoEn: ahora,
      }).where(eq(gruposGestion.id, grupoId));
      return cliente;
    });
    if (!actualizado) return reply.code(404).send({ error: 'Cliente no encontrado en el grupo' });

    return { cliente: actualizado };
  });

  /**
   * PATCH /api/admin/crm/grupos/:grupoId
   * Actualizar estado del grupo
   */
  fastify.patch('/grupos/:grupoId', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { grupoId } = request.params as { grupoId: string };

    const schema = z.object({
      estado: z.enum(['activo', 'en_progreso', 'completado', 'archivado']).optional(),
      nombre: z.string().optional(),
      descripcion: z.string().optional(),
      fechaObjetivo: z.string().optional(),
    });

    const datos = schema.parse(request.body);

    const updates: any = { ...datos, actualizadoEn: new Date().toISOString() };

    if (datos.estado === 'completado') {
      updates.fechaCompletado = new Date().toISOString();
    }

    const [grupo] = await db
      .update(gruposGestion)
      .set(updates)
      .where(eq(gruposGestion.id, grupoId))
      .returning();

    return { grupo };
  });
}
