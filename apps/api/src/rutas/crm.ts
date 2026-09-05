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
  importacionesCrm,
} from '../db/esquema/crm.js';
import { rutasCrmOperativo } from './crm-operativo.js';

function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/**
 * Nombres con los que puede venir la columna de última fecha de abono.
 *
 * Se declara aquí, y no dentro del handler, para que la lectura de la celda y
 * la advertencia de "columna no encontrada" usen exactamente la misma lista.
 * En los archivos reales el encabezado viene abreviado ("Ulti.Fecha Abono"),
 * así que incluimos las formas cortas además de las completas.
 */
const ALIAS_ULTIMA_FECHA_ABONO = [
  'Última Fecha Abono',
  'Ultima Fecha Abono',
  'UltimaFechaAbono',
  'Ulti.Fecha Abono',
  'Ult.Fecha Abono',
  'Ulti Fecha Abono',
  'Ult Fecha Abono',
  'Fecha Último Abono',
  'Fecha Ultimo Abono',
  'Fecha Ult Abono',
  'Último Abono',
  'Ultimo Abono',
  'Ulti Abono',
  'Ult Abono',
  'Fecha Abono',
  'Fecha Último Pago',
  'Fecha Ultimo Pago',
  'Último Pago',
  'Ultimo Pago',
];

/** Nombres con los que puede venir la columna de fecha de inicio. */
const ALIAS_FECHA_INICIO = [
  'Fecha Inicio',
  'FechaInicio',
  'Fecha de Inicio',
  'Fec.Inicio',
  'Fecha Ini',
  'Inicio',
];

/**
 * Convierte un valor de fecha del Excel a medianoche UTC en ISO.
 *
 * Acepta los tres formatos que produce `sheet_to_json`: el número serial de
 * Excel (días desde 1900-01-01, con su bug del año bisiesto), un `Date` ya
 * parseado por la librería, o texto escrito a mano.
 *
 * El texto se interpreta como día/mes/año (formato colombiano) y nunca se pasa
 * por `new Date(texto)`, que lo leería como mes/día/año y además aplicaría la
 * zona horaria local, corriendo la fecha un día.
 */
export function normalizarFechaExcel(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;

  const desdePartes = (anio: number, mes: number, dia: number): string | null => {
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    // Rechaza fechas que se desbordan, p.ej. 31/02.
    if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
    return fecha.toISOString().split('T')[0] + 'T00:00:00.000Z';
  };

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor <= 0) return null;
    // La fracción del serial es la hora del día, así que nos quedamos con los
    // días. Pero un serial puede llegar como 46151.99999 por error de coma
    // flotante: en ese caso truncar restaría un día, así que primero acercamos
    // los valores que están a un pelo de un entero. El margen equivale a unos
    // 8 segundos: muy por encima del error de coma flotante y muy por debajo de
    // cualquier hora real escrita en la celda.
    const margen = 1e-4;
    const dias =
      Math.abs(valor - Math.round(valor)) < margen ? Math.round(valor) : Math.floor(valor);
    return new Date(Math.round((dias - 25569) * 86400 * 1000)).toISOString().split('T')[0] + 'T00:00:00.000Z';
  }

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // xlsx construye el Date en hora local, así que leemos los componentes
    // locales para no perder un día al normalizar a UTC.
    return desdePartes(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  }

  const texto = String(valor).trim();
  if (texto === '') return null;

  // ISO: 2026-03-20 (con hora opcional)
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return desdePartes(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Colombiano: 20/03/2026, 20-3-26, 20.03.2026
  const dmy = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let anio = Number(dmy[3]);
    if (anio < 100) anio += anio < 70 ? 2000 : 1900;
    return desdePartes(anio, Number(dmy[2]), Number(dmy[1]));
  }

  return null;
}

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

    // Obtener registros paginados con última gestión
    const cartera = await db
      .select({
        id: carteraClientes.id,
        numero: carteraClientes.numero,
        vendedor: carteraClientes.vendedor,
        cliente: carteraClientes.cliente,
        cedula: carteraClientes.cedula,
        telefono: carteraClientes.telefono,
        municipio: carteraClientes.municipio,
        articulo: carteraClientes.articulo,
        fechaInicio: carteraClientes.fechaInicio,
        montoCuota: carteraClientes.montoCuota,
        periodosPago: carteraClientes.periodosPago,
        abono: carteraClientes.abono,
        saldo: carteraClientes.saldo,
        ultimaFechaAbono: carteraClientes.ultimaFechaAbono,
        estado: carteraClientes.estado,
        diasMora: carteraClientes.diasMora,
        ultimaGestion: sql<string | null>`(
          SELECT fecha_gestion
          FROM gestiones_cobro
          WHERE cartera_cliente_id = cartera_clientes.id
          ORDER BY fecha_gestion DESC
          LIMIT 1
        )`,
      })
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

    const opciones = z.object({ fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(hoyColombia()),
      aceptarAjustes: z.enum(['true', 'false']).default('false') }).safeParse(request.query);
    if (!opciones.success || !normalizarFechaExcel(opciones.data.fechaCorte) || opciones.data.fechaCorte > hoyColombia()) {
      return reply.code(400).send({ error: 'Fecha de corte invalida o futura' });
    }
    const { fechaCorte, aceptarAjustes } = opciones.data;
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
      const [importacion] = await db.insert(importacionesCrm).values({
        archivo: data.filename, fechaCorte, usuarioId: request.usuario.id,
      }).returning();

      // Los encabezados del Excel varían en tildes, mayúsculas, espacios y
      // guiones bajos. Normalizamos cada nombre de columna una sola vez y
      // buscamos por esa forma canónica en lugar de listar cada variante.
      const normalizarEncabezado = (texto: string): string =>
        texto
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();

      // Tomamos los encabezados de la primera fila de la hoja, no de las claves
      // de rows[0]: sheet_to_json omite las celdas vacías, así que una columna
      // en blanco en el primer registro desaparecería del índice.
      const [filaEncabezados = []] = utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        range: 0,
        blankrows: false,
      });

      const indiceEncabezados = new Map<string, string>();
      for (const nombreColumna of filaEncabezados) {
        if (typeof nombreColumna === 'string' && nombreColumna.trim() !== '') {
          indiceEncabezados.set(normalizarEncabezado(nombreColumna), nombreColumna);
        }
      }

      /** Lee una celda probando varios alias de encabezado ya normalizados. */
      const leerCelda = (row: any, ...alias: string[]): any => {
        for (const nombre of alias) {
          const columnaReal = indiceEncabezados.get(normalizarEncabezado(nombre));
          if (columnaReal !== undefined) {
            const valor = row[columnaReal];
            if (valor !== undefined && valor !== null && String(valor).trim() !== '') return valor;
          }
        }
        return undefined;
      };

      for (const row of rows) {
        try {
          // Mapeo de columnas Excel a campos de BD
          const numero = String(leerCelda(row, 'Número', 'Numero', 'Num', 'Credito', 'Crédito') ?? '').trim();

          if (!numero) {
            errores.push(`Fila sin número de crédito: ${JSON.stringify(row)}`);
            continue;
          }

          const resultado = await db.transaction(async (tx) => {
            const [registro] = await tx.select().from(carteraClientes)
              .where(eq(carteraClientes.numero, numero)).limit(1);
            if (registro?.fechaCorteExcel && fechaCorte < registro.fechaCorteExcel) {
              throw new Error(`Credito ${numero}: corte anterior al ${registro.fechaCorteExcel}; no se modifico`);
            }

            const numeroCelda = (anterior: number | null | undefined, ...alias: string[]): number => {
              const valor = leerCelda(row, ...alias);
              const valorNumerico = valor === undefined ? anterior : Number(valor);
              if (valorNumerico === undefined || valorNumerico === null || !Number.isFinite(valorNumerico)) {
                throw new Error(`Registro ${numero}: ${alias[0]} ausente o invalido`);
              }
              return valorNumerico;
            };
            const fechaCelda = (valor: unknown, anterior: string | null): string | null => {
              if (valor === undefined) return anterior;
              const fecha = normalizarFechaExcel(valor);
              if (!fecha) throw new Error(`Registro ${numero}: fecha invalida`);
              return fecha;
            };

            const cliente = String(leerCelda(row, 'Cliente', 'Nombre') ?? registro?.cliente ?? '').trim();
            const cedula = String(leerCelda(row, 'Cédula', 'Cedula', 'Documento', 'CC') ?? registro?.cedula ?? '').trim();
            const vendedor = String(leerCelda(row, 'Vendedor', 'Asesor') ?? registro?.vendedor ?? '').trim();
            const telefono = leerCelda(row, 'Teléfono', 'Telefono', 'Celular', 'Movil', 'Móvil') ?? registro?.telefono ?? null;
            const municipio = leerCelda(row, 'Municipio', 'Ciudad', 'Ubicacion', 'Ubicación') ?? registro?.municipio ?? null;
            const articulo = String(leerCelda(row, 'Artículo', 'Articulo', 'Producto') ?? registro?.articulo ?? '').trim();

            const fechaInicioRaw = leerCelda(row, ...ALIAS_FECHA_INICIO);
            const montoCuota = numeroCelda(registro?.montoCuota, 'Monto Cuota', 'MontoCuota', 'Cuota', 'Valor Cuota');
            const periodosPago = String(
              leerCelda(row, 'Periodos Pago', 'PeriodosPago', 'Período', 'Periodo', 'Periodicidad', 'Frecuencia') ??
                registro?.periodosPago ?? 'MENSUAL'
            );

            const abono = numeroCelda(registro?.abono ?? 0, 'Abono', 'Abonos', 'Pagado');
            const saldo = numeroCelda(registro?.saldo, 'Saldo', 'Saldo Actual', 'Deuda');
            if (registro && abono < registro.abono && aceptarAjustes !== 'true') {
              throw new Error(`Credito ${numero}: el abono acumulado disminuye de ${registro.abono} a ${abono}. Revisa el archivo o habilita los ajustes`);
            }
            const fechaCorteAbono = leerCelda(row, 'Abono', 'Abonos', 'Pagado') !== undefined ? fechaCorte : registro?.fechaCorteAbono ?? null;
            const ultimaImportacionEn = new Date().toISOString();
            const ultimaFechaAbonoRaw = leerCelda(row, ...ALIAS_ULTIMA_FECHA_ABONO);

            const fechaInicio = fechaCelda(fechaInicioRaw, registro?.fechaInicio ?? null);
            const ultimaFechaAbono = fechaCelda(ultimaFechaAbonoRaw, registro?.ultimaFechaAbono ?? null);

            const estado = String(leerCelda(row, 'Estado', 'Situacion', 'Situación') ?? registro?.estado ?? 'activo').trim().toLowerCase();
            const diasMora = numeroCelda(registro?.diasMora ?? 0, 'Días Mora', 'Dias Mora', 'DiasMora', 'Mora');
            if (!Number.isInteger(diasMora)) throw new Error(`Registro ${numero}: dias de mora invalidos`);

            // Validar campos obligatorios
            if (!cliente || !cedula || !vendedor || !articulo || !fechaInicio) {
              throw new Error(`Registro ${numero}: faltan campos obligatorios`);
            }

            if (!registro) {
              // Insertar nuevo
              const [insertado] = await tx.insert(carteraClientes).values({
                numero,
                vendedor,
                cliente,
                cedula,
                telefono: telefono ? String(telefono) : null,
                municipio: municipio ? String(municipio) : null,
                articulo,
                fechaInicio,
                montoCuota,
                periodosPago,
                abono,
                saldo,
                ultimaFechaAbono,
                fechaCorteExcel: fechaCorte, fechaCorteAbono, ultimaImportacionEn,
                estado,
                diasMora,
              }).returning();

              await tx.insert(carteraCambios).values({
                carteraClienteId: insertado.id,
                tipoOperacion: 'insert',
                campoModificado: 'all',
                valorAnterior: null,
                valorNuevo: JSON.stringify({ cliente, cedula, saldo, abono }),
                archivoOrigen: data.filename,
                usuarioId: request.usuario.id,
              });
              await tx.update(importacionesCrm).set({ nuevos: sql`${importacionesCrm.nuevos} + 1` }).where(eq(importacionesCrm.id, importacion.id));

              return 'nuevo';
            } else {
              await tx.update(importacionesCrm).set({
                comparados: sql`${importacionesCrm.comparados} + 1`,
                saldoAnterior: sql`${importacionesCrm.saldoAnterior} + ${registro.saldo}`,
                saldoNuevo: sql`${importacionesCrm.saldoNuevo} + ${saldo}`,
                abonoAnterior: sql`${importacionesCrm.abonoAnterior} + ${registro.abono}`,
                abonoNuevo: sql`${importacionesCrm.abonoNuevo} + ${abono}`,
              }).where(eq(importacionesCrm.id, importacion.id));
              // Detectar cambios
              const cambios: Array<{ campo: string; anterior: any; nuevo: any }> = [];

              if (registro.saldo !== saldo) cambios.push({ campo: 'saldo', anterior: registro.saldo, nuevo: saldo });
              if (registro.abono !== abono) cambios.push({ campo: 'abono', anterior: registro.abono, nuevo: abono });
              if (registro.montoCuota !== montoCuota) cambios.push({ campo: 'montoCuota', anterior: registro.montoCuota, nuevo: montoCuota });
              if (registro.periodosPago !== periodosPago) cambios.push({ campo: 'periodosPago', anterior: registro.periodosPago, nuevo: periodosPago });
              if (registro.diasMora !== diasMora) cambios.push({ campo: 'diasMora', anterior: registro.diasMora, nuevo: diasMora });
              if (registro.estado !== estado) cambios.push({ campo: 'estado', anterior: registro.estado, nuevo: estado });
              if (registro.telefono !== (telefono ? String(telefono) : null)) {
                cambios.push({ campo: 'telefono', anterior: registro.telefono, nuevo: telefono });
              }

              // Detectar cambios en fechas
              const fechaInicioNormalizada = fechaInicio.split('T')[0];
              const fechaInicioExistenteNormalizada = registro.fechaInicio ? registro.fechaInicio.split('T')[0] : null;
              if (fechaInicioExistenteNormalizada !== fechaInicioNormalizada) {
                cambios.push({ campo: 'fechaInicio', anterior: registro.fechaInicio, nuevo: fechaInicio });
              }

              const ultimaFechaAbonoNormalizada = ultimaFechaAbono ? ultimaFechaAbono.split('T')[0] : null;
              const ultimaFechaAbonoExistenteNormalizada = registro.ultimaFechaAbono ? registro.ultimaFechaAbono.split('T')[0] : null;
              if (ultimaFechaAbonoNormalizada !== ultimaFechaAbonoExistenteNormalizada) {
                cambios.push({ campo: 'ultimaFechaAbono', anterior: registro.ultimaFechaAbono, nuevo: ultimaFechaAbono });
              }

              if (cambios.length > 0) {
                // Actualizar
                await tx
                  .update(carteraClientes)
                  .set({
                    saldo,
                    abono,
                    montoCuota,
                    periodosPago,
                    diasMora,
                    estado,
                    telefono: telefono ? String(telefono) : null,
                    fechaInicio,
                    ultimaFechaAbono,
                    fechaCorteExcel: fechaCorte, fechaCorteAbono, ultimaImportacionEn,
                    actualizadoEn: new Date().toISOString(),
                  })
                  .where(eq(carteraClientes.id, registro.id));

                // Registrar cada cambio
                for (const cambio of cambios) {
                  await tx.insert(carteraCambios).values({
                    carteraClienteId: registro.id,
                    tipoOperacion: 'update',
                    campoModificado: cambio.campo,
                    valorAnterior: String(cambio.anterior),
                    valorNuevo: String(cambio.nuevo),
                    archivoOrigen: data.filename,
                    usuarioId: request.usuario.id,
                  });
                }

                return 'actualizado';
              } else {
                await tx.update(carteraClientes).set({ fechaCorteExcel: fechaCorte, fechaCorteAbono, ultimaImportacionEn })
                  .where(eq(carteraClientes.id, registro.id));
                return 'sinCambios';
              }
            }
          });
          if (resultado === 'nuevo') nuevos++;
          else if (resultado === 'actualizado') actualizados++;
          else sinCambios++;
        } catch (error: any) {
          errores.push(`Error en fila ${JSON.stringify(row)}: ${error.message}`);
        }
      }

      // Avisar de columnas ausentes aunque se conserven los valores anteriores.
      const advertencias: string[] = [];
      const columnasEncontradas = [...indiceEncabezados.values()];

      const tieneColumna = (alias: string[]): boolean =>
        alias.some((nombre) => indiceEncabezados.has(normalizarEncabezado(nombre)));

      if (!tieneColumna(ALIAS_FECHA_INICIO)) {
        advertencias.push(
          `No se encontró la columna "Fecha Inicio". Columnas detectadas: ${columnasEncontradas.join(', ')}`
        );
      }

      if (!tieneColumna(ALIAS_ULTIMA_FECHA_ABONO)) {
        advertencias.push(
          `No se encontró la columna de última fecha de abono. Columnas detectadas: ${columnasEncontradas.join(', ')}`
        );
      }

      const [resumenImportacion] = await db.update(importacionesCrm).set({ nuevos, actualizados, sinCambios,
        errores: errores.length, finalizadaEn: new Date().toISOString() }).where(eq(importacionesCrm.id, importacion.id)).returning();
      return {
        importacion: resumenImportacion,
        procesamiento: {
          nuevos,
          actualizados,
          sinCambios,
          errores: errores.length,
        },
        advertencias: advertencias.length > 0 ? advertencias : undefined,
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
   * Seguimientos sin cerrar, vencidos o programados para hoy en Colombia.
   */
  fastify.get('/gestiones/pendientes', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const hoy = hoyColombia();

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
          WHERE cartera_cliente_id = cartera_clientes.id
        )`,
      })
      .from(gestionesCobro)
      .innerJoin(carteraClientes, eq(gestionesCobro.carteraClienteId, carteraClientes.id))
      .where(and(
        sql`DATE(${gestionesCobro.fechaProximaAccion}) <= ${hoy}`,
        sql`${gestionesCobro.seguimientoCerradoEn} IS NULL`
      ))
      .orderBy(asc(gestionesCobro.fechaProximaAccion), desc(carteraClientes.diasMora));

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

  fastify.patch('/gestiones/:id/seguimiento', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }
    const parametros = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const datos = z.object({ cerrado: z.boolean() }).safeParse(request.body);
    if (!parametros.success || !datos.success) {
      return reply.code(400).send({ error: 'Datos de seguimiento invalidos' });
    }
    const [gestion] = await db.update(gestionesCobro).set({
      seguimientoCerradoEn: datos.data.cerrado
        ? sql`COALESCE(${gestionesCobro.seguimientoCerradoEn}, ${new Date().toISOString()})` : null,
      seguimientoCerradoPor: datos.data.cerrado
        ? sql`COALESCE(${gestionesCobro.seguimientoCerradoPor}, ${request.usuario.id})` : null,
    }).where(and(
      eq(gestionesCobro.id, parametros.data.id),
      sql`DATE(${gestionesCobro.fechaProximaAccion}) IS NOT NULL`
    )).returning();
    if (!gestion) return reply.code(404).send({ error: 'Seguimiento no encontrado' });
    return { gestion };
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
          WHERE cartera_cliente_id = cartera_clientes.id
        )`,
        totalGestiones: sql<number>`(
          SELECT COUNT(*)
          FROM gestiones_cobro
          WHERE cartera_cliente_id = cartera_clientes.id
        )`,
      })
      .from(carteraClientes)
      .where(
        and(
          sql`${carteraClientes.diasMora} > 30`,
          sql`${carteraClientes.saldo} > 200000`,
          sql`${carteraClientes.estado} != 'cancelado'`,
          sql`NOT EXISTS (SELECT 1 FROM gestiones_cobro g WHERE g.cartera_cliente_id = cartera_clientes.id AND g.fecha_gestion >= ${hace7Dias.toISOString()})`
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
   * GET /api/admin/crm/gestiones/recientes
   *
   * Gestiones realizadas hoy (sin filtrar por fecha de próxima acción).
   */
  fastify.get('/gestiones/recientes', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const hoy = hoyColombia();

    const recientes = await db
      .select({
        gestionId: gestionesCobro.id,
        fechaGestion: gestionesCobro.fechaGestion,
        tipoGestion: gestionesCobro.tipoGestion,
        canal: gestionesCobro.canal,
        resultado: gestionesCobro.resultado,
        notas: gestionesCobro.notas,
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
          WHERE cartera_cliente_id = cartera_clientes.id
        )`,
      })
      .from(gestionesCobro)
      .innerJoin(carteraClientes, eq(gestionesCobro.carteraClienteId, carteraClientes.id))
      .where(sql`DATE(${gestionesCobro.fechaGestion}, '-5 hours') = ${hoy}`)
      .orderBy(desc(gestionesCobro.fechaGestion));

    // Transformar para que coincida con la estructura esperada
    const gestiones = recientes.map(r => ({
      gestion: {
        id: r.gestionId,
        fechaGestion: r.fechaGestion,
        tipoGestion: r.tipoGestion,
        canal: r.canal,
        resultado: r.resultado,
        notas: r.notas,
        proximaAccion: r.proximaAccion,
        fechaProximaAccion: r.fechaProximaAccion,
      },
      cliente: {
        id: r.clienteId,
        numero: r.numero,
        cliente: r.cliente,
        cedula: r.cedula,
        telefono: r.telefono,
        vendedor: r.vendedor,
        saldo: r.saldo,
        diasMora: r.diasMora,
        ultimaGestion: r.ultimaGestion,
      },
    }));

    return { gestiones };
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

  // ============================================================================
  // WHATSAPP - Envío de mensajes
  // ============================================================================

  /**
   * GET /api/admin/crm/whatsapp/estado
   *
   * Obtiene el estado de conexión de WhatsApp para saber si se pueden enviar mensajes.
   */
  fastify.get('/whatsapp/estado', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { obtenerEstadoConexion } = await import('../whatsapp/baileys-client.js');
    const estado = obtenerEstadoConexion();

    return estado;
  });

  /**
   * POST /api/admin/crm/whatsapp/enviar
   *
   * Envía un mensaje de WhatsApp a un cliente y registra automáticamente la gestión.
   */
  fastify.post('/whatsapp/enviar', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      carteraClienteId: z.string(),
      mensaje: z.string().min(1),
    });

    const datos = schema.parse(request.body);

    // Obtener cliente
    const [cliente] = await db
      .select()
      .from(carteraClientes)
      .where(eq(carteraClientes.id, datos.carteraClienteId))
      .limit(1);

    if (!cliente) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }

    if (!cliente.telefono) {
      return reply.code(400).send({ error: 'El cliente no tiene teléfono registrado' });
    }

    // Normalizar teléfono a formato colombiano (57 + 10 dígitos)
    const telefonoLimpio = cliente.telefono.replace(/\D/g, '');
    const telefonoNormalizado = telefonoLimpio.startsWith('57')
      ? telefonoLimpio
      : `57${telefonoLimpio}`;

    // Verificar conexión de WhatsApp
    const { obtenerEstadoConexion, enviarMensajeWhatsApp } = await import('../whatsapp/baileys-client.js');
    const estado = obtenerEstadoConexion();

    if (!estado.conectado) {
      return reply.code(503).send({ error: 'WhatsApp no está conectado' });
    }

    try {
      // Enviar mensaje
      await enviarMensajeWhatsApp(telefonoNormalizado, datos.mensaje);

      // Registrar gestión automáticamente
      await db.insert(gestionesCobro).values({
        carteraClienteId: datos.carteraClienteId,
        tipoGestion: 'whatsapp',
        canal: 'whatsapp',
        resultado: 'mensaje_enviado',
        notas: datos.mensaje,
        usuarioId: request.usuario.id,
        nombreUsuario: request.usuario.nombre,
      });

      return { success: true, message: 'Mensaje enviado y gestión registrada' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Error al enviar mensaje' });
    }
  });

  // ============================================================================
  // PLANTILLAS - CRUD
  // ============================================================================

  /**
   * GET /api/admin/crm/plantillas
   *
   * Lista todas las plantillas de mensajes.
   */
  fastify.get('/plantillas', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { plantillasCobranza } = await import('../db/esquema/crm.js');

    const plantillas = await db
      .select()
      .from(plantillasCobranza)
      .orderBy(asc(plantillasCobranza.orden));

    return { plantillas };
  });

  /**
   * GET /api/admin/crm/plantillas/:id/previsualizar
   *
   * Previsualiza una plantilla con datos reales de un cliente.
   */
  fastify.get('/plantillas/:id/previsualizar', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const paramsSchema = z.object({
      id: z.string(),
    });

    const querySchema = z.object({
      carteraClienteId: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);
    const { carteraClienteId } = querySchema.parse(request.query);

    const { plantillasCobranza } = await import('../db/esquema/crm.js');

    // Obtener plantilla
    const [plantilla] = await db
      .select()
      .from(plantillasCobranza)
      .where(eq(plantillasCobranza.id, id))
      .limit(1);

    if (!plantilla) {
      return reply.code(404).send({ error: 'Plantilla no encontrada' });
    }

    // Obtener cliente
    const [cliente] = await db
      .select()
      .from(carteraClientes)
      .where(eq(carteraClientes.id, carteraClienteId))
      .limit(1);

    if (!cliente) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }

    // Reemplazar variables
    const { reemplazarVariablesPlantilla } = await import('../servicios/plantillas.js');
    const mensajeResuelto = reemplazarVariablesPlantilla(plantilla.cuerpo, cliente);

    return { mensaje: mensajeResuelto };
  });

  /**
   * POST /api/admin/crm/plantillas
   *
   * Crea una nueva plantilla.
   */
  fastify.post('/plantillas', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      nombre: z.string(),
      categoria: z.string(),
      cuerpo: z.string(),
      activa: z.boolean().default(true),
      orden: z.number().default(0),
    });

    const datos = schema.parse(request.body);

    const { plantillasCobranza } = await import('../db/esquema/crm.js');

    const [plantilla] = await db
      .insert(plantillasCobranza)
      .values(datos)
      .returning();

    return { plantilla };
  });

  /**
   * PUT /api/admin/crm/plantillas/:id
   *
   * Actualiza una plantilla existente.
   */
  fastify.put('/plantillas/:id', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const paramsSchema = z.object({
      id: z.string(),
    });

    const bodySchema = z.object({
      nombre: z.string().optional(),
      categoria: z.string().optional(),
      cuerpo: z.string().optional(),
      activa: z.boolean().optional(),
      orden: z.number().optional(),
    });

    const { id } = paramsSchema.parse(request.params);
    const datos = bodySchema.parse(request.body);

    const { plantillasCobranza } = await import('../db/esquema/crm.js');

    const [plantilla] = await db
      .update(plantillasCobranza)
      .set({
        ...datos,
        actualizadoEn: new Date().toISOString(),
      })
      .where(eq(plantillasCobranza.id, id))
      .returning();

    if (!plantilla) {
      return reply.code(404).send({ error: 'Plantilla no encontrada' });
    }

    return { plantilla };
  });

  /**
   * DELETE /api/admin/crm/plantillas/:id
   *
   * Elimina una plantilla.
   */
  fastify.delete('/plantillas/:id', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const paramsSchema = z.object({
      id: z.string(),
    });

    const { id } = paramsSchema.parse(request.params);

    const { plantillasCobranza } = await import('../db/esquema/crm.js');

    await db
      .delete(plantillasCobranza)
      .where(eq(plantillasCobranza.id, id));

    return { success: true };
  });

  // ============================================================================
  // IA - Análisis y asistencia
  // ============================================================================

  /**
   * POST /api/admin/crm/ia/analizar/:carteraClienteId
   *
   * Analiza un cliente con IA y persiste el resultado.
   */
  fastify.post('/ia/analizar/:carteraClienteId', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const paramsSchema = z.object({
      carteraClienteId: z.string(),
    });

    const { carteraClienteId } = paramsSchema.parse(request.params);

    // Obtener cliente
    const [cliente] = await db
      .select()
      .from(carteraClientes)
      .where(eq(carteraClientes.id, carteraClienteId))
      .limit(1);

    if (!cliente) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }

    // Verificar si hay análisis vigente (menos de 24 horas)
    const { analisisCarteraIA } = await import('../db/esquema/crm.js');

    const ahora = new Date();
    const analisisExistentes = await db
      .select()
      .from(analisisCarteraIA)
      .where(eq(analisisCarteraIA.carteraClienteId, carteraClienteId))
      .orderBy(desc(analisisCarteraIA.fechaAnalisis))
      .limit(1);

    if (analisisExistentes.length > 0) {
      const analisis = analisisExistentes[0];
      const vigenciaHasta = analisis.vigenciaHasta ? new Date(analisis.vigenciaHasta) : null;

      if (vigenciaHasta && vigenciaHasta > ahora) {
        return { analisis, fromCache: true };
      }
    }

    // Obtener historial
    const gestiones = await db
      .select()
      .from(gestionesCobro)
      .where(eq(gestionesCobro.carteraClienteId, carteraClienteId))
      .orderBy(desc(gestionesCobro.fechaGestion))
      .limit(10);

    const pagos = await db
      .select()
      .from(pagosCartera)
      .where(eq(pagosCartera.carteraClienteId, carteraClienteId))
      .orderBy(desc(pagosCartera.fechaPago))
      .limit(10);

    // Analizar con IA
    const { analizarClienteCartera } = await import('../servicios/agente-cobranza.js');

    try {
      const resultado = await analizarClienteCartera(cliente, gestiones, pagos);

      // Calcular vigencia (24 horas desde ahora)
      const vigenciaHasta = new Date();
      vigenciaHasta.setHours(vigenciaHasta.getHours() + 24);

      // Persistir análisis
      const [analisis] = await db
        .insert(analisisCarteraIA)
        .values({
          carteraClienteId,
          probabilidadPago: resultado.probabilidadPago,
          riesgoMorosidad: resultado.riesgoMorosidad,
          accionSugerida: resultado.accionSugerida,
          razonamiento: resultado.razonamiento,
          confianza: resultado.confianza,
          modeloUtilizado: 'gpt-4o-mini',
          vigenciaHasta: vigenciaHasta.toISOString(),
        })
        .returning();

      return { analisis, fromCache: false };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Error al analizar cliente con IA' });
    }
  });

  /**
   * POST /api/admin/crm/ia/redactar
   *
   * Genera un mensaje de WhatsApp personalizado usando IA.
   */
  fastify.post('/ia/redactar', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const schema = z.object({
      carteraClienteId: z.string(),
      tono: z.enum(['amable', 'firme', 'urgente']).default('amable'),
    });

    const datos = schema.parse(request.body);

    // Obtener cliente
    const [cliente] = await db
      .select()
      .from(carteraClientes)
      .where(eq(carteraClientes.id, datos.carteraClienteId))
      .limit(1);

    if (!cliente) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }

    // Obtener gestiones recientes
    const gestiones = await db
      .select()
      .from(gestionesCobro)
      .where(eq(gestionesCobro.carteraClienteId, datos.carteraClienteId))
      .orderBy(desc(gestionesCobro.fechaGestion))
      .limit(5);

    // Generar mensaje con IA
    const { redactarMensajeCobranza } = await import('../servicios/agente-cobranza.js');

    try {
      const mensaje = await redactarMensajeCobranza(cliente, gestiones, datos.tono);
      return { mensaje };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Error al generar mensaje con IA' });
    }
  });

  /**
   * GET /api/admin/crm/ia/resumen
   *
   * Obtiene un resumen de la cartera analizada por IA.
   */
  fastify.get('/ia/resumen', async (request, reply) => {
    if (!request.usuario || request.usuario.rol !== 'admin') {
      return reply.code(403).send({ error: 'No autorizado' });
    }

    const { analisisCarteraIA } = await import('../db/esquema/crm.js');

    // Obtener análisis vigentes
    const ahora = new Date().toISOString();

    const analisisVigentes = await db
      .select({
        id: analisisCarteraIA.id,
        carteraClienteId: analisisCarteraIA.carteraClienteId,
        riesgoMorosidad: analisisCarteraIA.riesgoMorosidad,
        probabilidadPago: analisisCarteraIA.probabilidadPago,
        accionSugerida: analisisCarteraIA.accionSugerida,
        fechaAnalisis: analisisCarteraIA.fechaAnalisis,
        cliente: carteraClientes.cliente,
        numero: carteraClientes.numero,
        saldo: carteraClientes.saldo,
        diasMora: carteraClientes.diasMora,
      })
      .from(analisisCarteraIA)
      .innerJoin(carteraClientes, eq(analisisCarteraIA.carteraClienteId, carteraClientes.id))
      .where(sql`${analisisCarteraIA.vigenciaHasta} > ${ahora}`)
      .orderBy(desc(analisisCarteraIA.fechaAnalisis));

    // Agrupar por riesgo
    const distribucion = {
      critico: analisisVigentes.filter(a => a.riesgoMorosidad === 'critico').length,
      alto: analisisVigentes.filter(a => a.riesgoMorosidad === 'alto').length,
      medio: analisisVigentes.filter(a => a.riesgoMorosidad === 'medio').length,
      bajo: analisisVigentes.filter(a => a.riesgoMorosidad === 'bajo').length,
    };

    // Top 10 más urgentes
    const masUrgentes = analisisVigentes
      .filter(a => a.riesgoMorosidad === 'critico' || a.riesgoMorosidad === 'alto')
      .slice(0, 10);

    return {
      totalAnalizados: analisisVigentes.length,
      distribucion,
      masUrgentes,
    };
  });

  // ============================================================================
  // ETIQUETAS Y GRUPOS - Importar rutas adicionales
  // ============================================================================

  // Importar y registrar las rutas de etiquetas y grupos
  const { rutasEtiquetasGrupos } = await import('./crm-etiquetas.js');
  await rutasEtiquetasGrupos(fastify);
  await fastify.register(rutasCrmOperativo);
};
