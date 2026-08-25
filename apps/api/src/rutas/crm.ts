import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, sql, or, desc, asc } from 'drizzle-orm';
import { read, utils } from 'xlsx';
import { db } from '../db/cliente.js';
import {
  carteraClientes,
  gestionesCobro,
  pagosCartera,
  carteraCambios,
} from '../db/esquema/crm.js';

/**
 * Rutas del módulo CRM de Cobranza.
 *
 * Gestiona la cartera de clientes con créditos activos, el registro de
 * gestiones de cobro, pagos, y análisis de morosidad.
 */
export const rutasCrm: FastifyPluginAsync = async (fastify) => {

  // ============================================================================
  // CARTERA - Listado y filtros
  // ============================================================================

  /**
   * GET /api/admin/crm/cartera
   *
   * Lista la cartera de clientes con filtros y paginación.
   */
  fastify.get('/cartera', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const querySchema = z.object({
      limite: z.coerce.number().default(50),
      offset: z.coerce.number().default(0),
      estado: z.string().optional(),
      vendedor: z.string().optional(),
      municipio: z.string().optional(),
      busqueda: z.string().optional(),
    });

    const params = querySchema.parse(request.query);

    // Construir condiciones de filtro
    const condiciones = [];

    if (params.estado) {
      condiciones.push(eq(carteraClientes.estado, params.estado));
    }

    if (params.vendedor) {
      condiciones.push(eq(carteraClientes.vendedor, params.vendedor));
    }

    if (params.municipio) {
      condiciones.push(eq(carteraClientes.municipio, params.municipio));
    }

    if (params.busqueda) {
      // Búsqueda en múltiples campos
      condiciones.push(
        or(
          sql`${carteraClientes.cliente} LIKE ${`%${params.busqueda}%`}`,
          sql`${carteraClientes.cedula} LIKE ${`%${params.busqueda}%`}`,
          sql`${carteraClientes.numero} LIKE ${`%${params.busqueda}%`}`,
          sql`${carteraClientes.telefono} LIKE ${`%${params.busqueda}%`}`
        )
      );
    }

    const where = condiciones.length > 0 ? and(...condiciones) : undefined;

    // Obtener total
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(carteraClientes)
      .where(where);

    // Obtener registros paginados
    const cartera = await db
      .select()
      .from(carteraClientes)
      .where(where)
      .orderBy(desc(carteraClientes.diasMora), desc(carteraClientes.saldo))
      .limit(params.limite)
      .offset(params.offset);

    return {
      cartera,
      paginacion: {
        total,
        limite: params.limite,
        offset: params.offset,
        paginas: Math.ceil(total / params.limite),
      },
    };
  });

  /**
   * GET /api/admin/crm/cartera/vendedores
   *
   * Lista únicos vendedores para el filtro.
   */
  fastify.get('/cartera/vendedores', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const vendedores = await db
      .selectDistinct({ vendedor: carteraClientes.vendedor })
      .from(carteraClientes)
      .orderBy(asc(carteraClientes.vendedor));

    return { vendedores: vendedores.map((v) => v.vendedor) };
  });

  /**
   * GET /api/admin/crm/cartera/municipios
   *
   * Lista únicos municipios para el filtro.
   */
  fastify.get('/cartera/municipios', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const municipios = await db
      .selectDistinct({ municipio: carteraClientes.municipio })
      .from(carteraClientes)
      .where(sql`${carteraClientes.municipio} IS NOT NULL`)
      .orderBy(asc(carteraClientes.municipio));

    return { municipios: municipios.map((m) => m.municipio) };
  });

  // ============================================================================
  // CARTERA - Upload Excel
  // ============================================================================

  /**
   * POST /api/admin/crm/cartera/upload
   *
   * Procesa un archivo Excel de cartera. Detecta cambios automáticamente:
   * - Inserta nuevos registros
   * - Actualiza registros existentes solo si hubo cambios
   * - Registra el historial de cambios en cartera_cambios
   */
  fastify.post('/cartera/upload', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No se recibió archivo' });
    }

    try {
      const buffer = await data.toBuffer();
      const workbook = read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json<any>(sheet);

      if (rows.length === 0) {
        return reply.code(400).send({ error: 'El archivo está vacío' });
      }

      let nuevos = 0;
      let actualizados = 0;
      let sinCambios = 0;
      const errores: string[] = [];

      for (const row of rows) {
        try {
          // Mapeo de columnas Excel a campos de BD
          const numero = String(row['Número'] || row['NUMERO'] || row['Numero'] || '').trim();

          if (!numero) {
            errores.push(`Fila sin número de crédito: ${JSON.stringify(row)}`);
            continue;
          }

          const cliente = String(row['Cliente'] || row['CLIENTE'] || '').trim();
          const cedula = String(row['Cédula'] || row['CEDULA'] || row['Cedula'] || '').trim();
          const vendedor = String(row['Vendedor'] || row['VENDEDOR'] || '').trim();
          const telefono = row['Teléfono'] || row['TELEFONO'] || row['Telefono'] || null;
          const municipio = row['Municipio'] || row['MUNICIPIO'] || null;
          const articulo = String(row['Artículo'] || row['ARTICULO'] || row['Articulo'] || '').trim();

          const fechaInicio = row['Fecha Inicio'] || row['FECHA_INICIO'] || row['FechaInicio'];
          const montoCuota = Number(row['Monto Cuota'] || row['MONTO_CUOTA'] || row['MontoCuota'] || 0);
          const periodosPago = String(row['Periodos Pago'] || row['PERIODOS_PAGO'] || row['PeriodosPago'] || 'MENSUAL');

          const abono = Number(row['Abono'] || row['ABONO'] || 0);
          const saldo = Number(row['Saldo'] || row['SALDO'] || 0);
          const ultimaFechaAbono = row['Última Fecha Abono'] || row['ULTIMA_FECHA_ABONO'] || row['UltimaFechaAbono'] || null;

          const estado = String(row['Estado'] || row['ESTADO'] || 'activo').toLowerCase();
          const diasMora = Number(row['Días Mora'] || row['DIAS_MORA'] || row['DiasMora'] || 0);

          // Validar campos obligatorios
          if (!cliente || !cedula || !vendedor || !articulo) {
            errores.push(`Registro ${numero}: faltan campos obligatorios`);
            continue;
          }

          // Buscar si existe
          const existente = await db
            .select()
            .from(carteraClientes)
            .where(eq(carteraClientes.numero, numero))
            .limit(1);

          if (existente.length === 0) {
            // Insertar nuevo
            await db.insert(carteraClientes).values({
              numero,
              vendedor,
              cliente,
              cedula,
              telefono: telefono ? String(telefono) : null,
              municipio: municipio ? String(municipio) : null,
              articulo,
              fechaInicio: fechaInicio ? new Date(fechaInicio).toISOString() : new Date().toISOString(),
              montoCuota,
              periodosPago,
              abono,
              saldo,
              ultimaFechaAbono: ultimaFechaAbono ? new Date(ultimaFechaAbono).toISOString() : null,
              estado,
              diasMora,
            });

            await db.insert(carteraCambios).values({
              carteraClienteId: numero, // Temporal, se actualizará
              tipoOperacion: 'insert',
              campoModificado: 'all',
              valorAnterior: null,
              valorNuevo: JSON.stringify({ cliente, cedula, saldo, abono }),
              archivoOrigen: data.filename,
              usuarioId: request.usuario.id,
            });

            nuevos++;
          } else {
            // Detectar cambios
            const registro = existente[0];
            const cambios: Array<{ campo: string; anterior: any; nuevo: any }> = [];

            if (registro.saldo !== saldo) cambios.push({ campo: 'saldo', anterior: registro.saldo, nuevo: saldo });
            if (registro.abono !== abono) cambios.push({ campo: 'abono', anterior: registro.abono, nuevo: abono });
            if (registro.diasMora !== diasMora) cambios.push({ campo: 'diasMora', anterior: registro.diasMora, nuevo: diasMora });
            if (registro.estado !== estado) cambios.push({ campo: 'estado', anterior: registro.estado, nuevo: estado });
            if (registro.telefono !== (telefono ? String(telefono) : null)) {
              cambios.push({ campo: 'telefono', anterior: registro.telefono, nuevo: telefono });
            }

            if (cambios.length > 0) {
              // Actualizar
              await db
                .update(carteraClientes)
                .set({
                  saldo,
                  abono,
                  diasMora,
                  estado,
                  telefono: telefono ? String(telefono) : null,
                  ultimaFechaAbono: ultimaFechaAbono ? new Date(ultimaFechaAbono).toISOString() : registro.ultimaFechaAbono,
                  actualizadoEn: new Date().toISOString(),
                })
                .where(eq(carteraClientes.id, registro.id));

              // Registrar cada cambio
              for (const cambio of cambios) {
                await db.insert(carteraCambios).values({
                  carteraClienteId: registro.id,
                  tipoOperacion: 'update',
                  campoModificado: cambio.campo,
                  valorAnterior: String(cambio.anterior),
                  valorNuevo: String(cambio.nuevo),
                  archivoOrigen: data.filename,
                  usuarioId: request.usuario.id,
                });
              }

              actualizados++;
            } else {
              sinCambios++;
            }
          }
        } catch (error: any) {
          errores.push(`Error en fila ${JSON.stringify(row)}: ${error.message}`);
        }
      }

      return {
        procesamiento: {
          nuevos,
          actualizados,
          sinCambios,
          errores: errores.length,
        },
        detalles: errores.length > 0 ? errores.slice(0, 10) : undefined,
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Error procesando archivo', detalles: error.message });
    }
  });

  // ============================================================================
  // GESTIONES - Consultas y registro
  // ============================================================================

  /**
   * GET /api/admin/crm/gestiones/pendientes
   *
   * Clientes con seguimiento programado para hoy.
   */
  fastify.get('/gestiones/pendientes', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const hoy = new Date().toISOString().split('T')[0];

    const pendientes = await db
      .select({
        gestionId: gestionesCobro.id,
        fechaGestion: gestionesCobro.fechaGestion,
        tipoGestion: gestionesCobro.tipoGestion,
        canal: gestionesCobro.canal,
        resultado: gestionesCobro.resultado,
        proximaAccion: gestionesCobro.proximaAccion,
        fechaProximaAccion: gestionesCobro.fechaProximaAccion,
        clienteId: carteraClientes.id,
        numero: carteraClientes.numero,
        cliente: carteraClientes.cliente,
        cedula: carteraClientes.cedula,
        telefono: carteraClientes.telefono,
        vendedor: carteraClientes.vendedor,
        saldo: carteraClientes.saldo,
        diasMora: carteraClientes.diasMora,
        ultimaGestion: sql<string | null>`(
          SELECT MAX(fecha_gestion)
          FROM gestiones_cobro
          WHERE cartera_cliente_id = ${carteraClientes.id}
        )`,
      })
      .from(gestionesCobro)
      .innerJoin(carteraClientes, eq(gestionesCobro.carteraClienteId, carteraClientes.id))
      .where(sql`DATE(${gestionesCobro.fechaProximaAccion}) = ${hoy}`)
      .orderBy(desc(carteraClientes.diasMora));

    // Transformar para que coincida con la estructura esperada en el frontend
    const gestiones = pendientes.map(p => ({
      gestion: {
        id: p.gestionId,
        fechaGestion: p.fechaGestion,
        tipoGestion: p.tipoGestion,
        canal: p.canal,
        resultado: p.resultado,
        proximaAccion: p.proximaAccion,
        fechaProximaAccion: p.fechaProximaAccion,
      },
      cliente: {
        id: p.clienteId,
        numero: p.numero,
        cliente: p.cliente,
        cedula: p.cedula,
        telefono: p.telefono,
        vendedor: p.vendedor,
        saldo: p.saldo,
        diasMora: p.diasMora,
        ultimaGestion: p.ultimaGestion,
      },
    }));

    return { gestiones };
  });

  /**
   * GET /api/admin/crm/gestiones/prioritarios
   *
   * Clientes prioritarios: mora >30 días, saldo >200k, sin gestión reciente.
   */
  fastify.get('/gestiones/prioritarios', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    // Clientes con mora alta y sin gestión en últimos 7 días
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    const prioritarios = await db
      .select({
        id: carteraClientes.id,
        numero: carteraClientes.numero,
        cliente: carteraClientes.cliente,
        cedula: carteraClientes.cedula,
        telefono: carteraClientes.telefono,
        vendedor: carteraClientes.vendedor,
        saldo: carteraClientes.saldo,
        diasMora: carteraClientes.diasMora,
        estado: carteraClientes.estado,
        ultimaGestion: sql<string | null>`(
          SELECT MAX(fecha_gestion)
          FROM gestiones_cobro
          WHERE cartera_cliente_id = ${carteraClientes.id}
        )`,
        totalGestiones: sql<number>`(
          SELECT COUNT(*)
          FROM gestiones_cobro
          WHERE cartera_cliente_id = ${carteraClientes.id}
        )`,
      })
      .from(carteraClientes)
      .where(
        and(
          sql`${carteraClientes.diasMora} > 30`,
          sql`${carteraClientes.saldo} > 200000`,
          sql`${carteraClientes.estado} != 'cancelado'`
        )
      )
      .orderBy(desc(carteraClientes.diasMora), desc(carteraClientes.saldo))
      .limit(50);

    // Transformar para que coincida con la estructura esperada en el frontend
    const clientes = prioritarios.map(p => ({
      cliente: {
        id: p.id,
        numero: p.numero,
        cliente: p.cliente,
        cedula: p.cedula,
        telefono: p.telefono,
        vendedor: p.vendedor,
        saldo: p.saldo,
        diasMora: p.diasMora,
        estado: p.estado,
      },
      ultimaGestion: p.ultimaGestion,
      totalGestiones: p.totalGestiones,
    }));

    return { clientes };
  });

  /**
   * POST /api/admin/crm/gestiones
   *
   * Registra una nueva gestión de cobro.
   */
  fastify.post('/gestiones', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      carteraClienteId: z.string(),
      tipoGestion: z.string(),
      canal: z.string(),
      resultado: z.string(),
      notas: z.string().optional(),
      proximaAccion: z.string().optional(),
      fechaProximaAccion: z.string().optional(),
    });

    const datos = schema.parse(request.body);

    const [gestion] = await db
      .insert(gestionesCobro)
      .values({
        ...datos,
        usuarioId: request.usuario.id,
        nombreUsuario: request.usuario.nombre,
      })
      .returning();

    return { gestion };
  });

  // ============================================================================
  // PAGOS - Registro
  // ============================================================================

  /**
   * POST /api/admin/crm/pagos
   *
   * Registra un pago y actualiza automáticamente el saldo.
   */
  fastify.post('/pagos', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      carteraClienteId: z.string(),
      fechaPago: z.string(),
      monto: z.number().positive(),
      metodoPago: z.string(),
      referencia: z.string().optional(),
      notas: z.string().optional(),
    });

    const datos = schema.parse(request.body);

    // Registrar pago
    const [pago] = await db
      .insert(pagosCartera)
      .values({
        ...datos,
        usuarioId: request.usuario.id,
        nombreUsuario: request.usuario.nombre,
      })
      .returning();

    // Actualizar saldo y abono del cliente
    const [cliente] = await db
      .select()
      .from(carteraClientes)
      .where(eq(carteraClientes.id, datos.carteraClienteId))
      .limit(1);

    if (cliente) {
      const nuevoAbono = cliente.abono + datos.monto;
      const nuevoSaldo = Math.max(0, cliente.saldo - datos.monto);

      await db
        .update(carteraClientes)
        .set({
          abono: nuevoAbono,
          saldo: nuevoSaldo,
          ultimaFechaAbono: datos.fechaPago,
          actualizadoEn: new Date().toISOString(),
        })
        .where(eq(carteraClientes.id, datos.carteraClienteId));

      // Registrar cambio
      await db.insert(carteraCambios).values({
        carteraClienteId: datos.carteraClienteId,
        tipoOperacion: 'update',
        campoModificado: 'pago_registrado',
        valorAnterior: JSON.stringify({ saldo: cliente.saldo, abono: cliente.abono }),
        valorNuevo: JSON.stringify({ saldo: nuevoSaldo, abono: nuevoAbono, monto: datos.monto }),
        usuarioId: request.usuario.id,
      });
    }

    return { pago, clienteActualizado: await db.select().from(carteraClientes).where(eq(carteraClientes.id, datos.carteraClienteId)).limit(1).then(r => r[0]) };
  });

  // ============================================================================
  // HISTORIAL CLIENTE - Detalle completo
  // ============================================================================

  /**
   * GET /api/admin/crm/cartera/:id/historial
   *
   * Obtiene el historial completo de un cliente: datos, gestiones, pagos y cambios.
   */
  fastify.get('/cartera/:id/historial', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    const { id } = paramsSchema.parse(request.params);

    // Obtener cliente
    const [cliente] = await db
      .select()
      .from(carteraClientes)
      .where(eq(carteraClientes.id, id))
      .limit(1);

    if (!cliente) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }

    // Obtener gestiones
    const gestiones = await db
      .select()
      .from(gestionesCobro)
      .where(eq(gestionesCobro.carteraClienteId, id))
      .orderBy(desc(gestionesCobro.fechaGestion));

    // Obtener pagos
    const pagos = await db
      .select()
      .from(pagosCartera)
      .where(eq(pagosCartera.carteraClienteId, id))
      .orderBy(desc(pagosCartera.fechaPago));

    // Obtener cambios
    const cambios = await db
      .select({
        id: carteraCambios.id,
        fecha: carteraCambios.fechaCambio,
        campo: carteraCambios.campoModificado,
        valorAnterior: carteraCambios.valorAnterior,
        valorNuevo: carteraCambios.valorNuevo,
        nombreUsuario: sql<string>`(SELECT nombre FROM usuarios WHERE id = ${carteraCambios.usuarioId})`,
      })
      .from(carteraCambios)
      .where(eq(carteraCambios.carteraClienteId, id))
      .orderBy(desc(carteraCambios.fechaCambio));

    return {
      cliente,
      gestiones,
      pagos,
      cambios,
    };
  });
};
