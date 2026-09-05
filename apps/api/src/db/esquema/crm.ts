import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const idPorDefecto = () => randomUUID();
const ahora = () => new Date().toISOString();

/**
 * Cartera de clientes con sus créditos
 */
export const carteraClientes = sqliteTable('cartera_clientes', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  // Identificación del crédito
  numero: text('numero').notNull().unique(), // Número del crédito (ej: 16508)
  vendedor: text('vendedor').notNull(),

  // Datos del cliente
  cliente: text('cliente').notNull(),
  cedula: text('cedula').notNull(),
  telefono: text('telefono'),
  municipio: text('municipio'),

  // Datos del producto/crédito
  articulo: text('articulo').notNull(),
  fechaInicio: text('fecha_inicio').notNull(), // ISO date string
  montoCuota: real('monto_cuota').notNull(),
  periodosPago: text('periodos_pago').notNull(), // MENSUAL, SEMANAL, QUINCENAL

  // Situación financiera
  abono: real('abono').notNull().default(0),
  saldo: real('saldo').notNull(),
  ultimaFechaAbono: text('ultima_fecha_abono'), // ISO date string
  fechaCorteExcel: text('fecha_corte_excel'),
  fechaCorteAbono: text('fecha_corte_abono'),
  ultimaImportacionEn: text('ultima_importacion_en'),

  // Estado del crédito
  estado: text('estado').notNull().default('activo'), // activo, al_dia, mora, cancelado, refinanciado
  diasMora: integer('dias_mora').default(0),

  // Metadata y auditoría
  metadata: text('metadata'), // JSON para datos adicionales
  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Gestiones de cobro realizadas
 */
export const gestionesCobro = sqliteTable('gestiones_cobro', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  carteraClienteId: text('cartera_cliente_id').notNull()
    .references(() => carteraClientes.id, { onDelete: 'cascade' }),

  // Datos de la gestión
  fechaGestion: text('fecha_gestion').notNull().$defaultFn(() => new Date().toISOString()),
  tipoGestion: text('tipo_gestion').notNull(), // llamada, whatsapp, visita, promesa_pago, acuerdo
  canal: text('canal').notNull(), // telefono, whatsapp, presencial, email

  // Resultado
  resultado: text('resultado').notNull(), // contacto_efectivo, no_contesta, promesa_pago, compromiso_incumplido, refinanciacion
  notas: text('notas'),

  // Seguimiento
  proximaAccion: text('proxima_accion'), // Qué hacer después
  fechaProximaAccion: text('fecha_proxima_accion'), // Cuándo hacer seguimiento
  seguimientoCerradoEn: text('seguimiento_cerrado_en'),
  seguimientoCerradoPor: text('seguimiento_cerrado_por'),

  // Usuario que realizó la gestión
  usuarioId: text('usuario_id').notNull(),
  nombreUsuario: text('nombre_usuario').notNull(),

  // IA metadata
  sentimientoIA: text('sentimiento_ia'), // positivo, neutro, negativo (analizado por IA)
  prioridadIA: integer('prioridad_ia'), // 1-5, calculado por IA

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Registro de pagos/abonos
 */
export const pagosCartera = sqliteTable('pagos_cartera', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  carteraClienteId: text('cartera_cliente_id').notNull()
    .references(() => carteraClientes.id, { onDelete: 'cascade' }),

  fechaPago: text('fecha_pago').notNull(),
  monto: real('monto').notNull(),
  metodoPago: text('metodo_pago').notNull(), // efectivo, transferencia, nequi, daviplata
  referencia: text('referencia'), // Número de transacción

  // Auditoría
  usuarioId: text('usuario_id').notNull(),
  nombreUsuario: text('nombre_usuario').notNull(),
  notas: text('notas'),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Historial de cambios detectados en uploads de Excel
 */
export const carteraCambios = sqliteTable('cartera_cambios', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  carteraClienteId: text('cartera_cliente_id').notNull()
    .references(() => carteraClientes.id, { onDelete: 'cascade' }),

  tipoOperacion: text('tipo_operacion').notNull(), // insert, update, delete
  campoModificado: text('campo_modificado'), // saldo, abono, telefono, etc
  valorAnterior: text('valor_anterior'),
  valorNuevo: text('valor_nuevo'),

  // Metadata del upload
  archivoOrigen: text('archivo_origen'),
  fechaCambio: text('fecha_cambio').notNull().$defaultFn(() => new Date().toISOString()),
  usuarioId: text('usuario_id').notNull(),
});

/**
 * Configuración de alertas y reglas de cobranza
 */
export const reglasCobranza = sqliteTable('reglas_cobranza', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),

  // Condiciones (JSON)
  condiciones: text('condiciones').notNull(), // {diasMora: ">30", saldo: ">500000"}

  // Acción a ejecutar
  tipoAccion: text('tipo_accion').notNull(), // alerta, asignar_gestion, cambiar_estado
  parametrosAccion: text('parametros_accion').notNull(), // JSON con parámetros

  prioridad: integer('prioridad').notNull().default(1),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

/**
 * Análisis de IA sobre cartera
 */
export const analisisCarteraIA = sqliteTable('analisis_cartera_ia', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  carteraClienteId: text('cartera_cliente_id').notNull()
    .references(() => carteraClientes.id, { onDelete: 'cascade' }),

  // Predicciones
  probabilidadPago: real('probabilidad_pago'), // 0-1
  riesgoMorosidad: text('riesgo_morosidad'), // bajo, medio, alto, critico

  // Sugerencias
  accionSugerida: text('accion_sugerida'),
  razonamiento: text('razonamiento'), // Por qué la IA sugiere esta acción

  // Metadata del análisis
  modeloUtilizado: text('modelo_utilizado').notNull(),
  confianza: real('confianza'), // 0-1

  fechaAnalisis: text('fecha_analisis').notNull().$defaultFn(() => new Date().toISOString()),
  vigenciaHasta: text('vigencia_hasta'), // Cuándo se debe recalcular
});

/**
 * Plantillas de mensajes para cobranza
 */
export const plantillasCobranza = sqliteTable('plantillas_cobranza', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),

  nombre: text('nombre').notNull(),
  categoria: text('categoria').notNull(), // recordatorio, mora_temprana, mora_alta, promesa, agradecimiento
  cuerpo: text('cuerpo').notNull(), // Admite variables: {{cliente}}, {{numero}}, {{saldo}}, etc.

  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),
  orden: integer('orden').notNull().default(0),

  creadoEn: text('creado_en').notNull().$defaultFn(() => new Date().toISOString()),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(() => new Date().toISOString()),
});

export const contactosCrm = sqliteTable('contactos_crm', {
  documento: text('documento').primaryKey(),
  version: integer('version').notNull().default(1),
  responsableId: text('responsable_id'),
  estadoUbicacion: text('estado_ubicacion').notNull().default('por_confirmar'),
  direccionAnterior: text('direccion_anterior').notNull().default(''),
  direccionActual: text('direccion_actual').notNull().default(''),
  barrio: text('barrio').notNull().default(''),
  municipio: text('municipio').notNull().default(''),
  referencias: text('referencias').notNull().default(''),
  telefonoAlternativo: text('telefono_alternativo').notNull().default(''),
  verificadoEn: text('verificado_en'),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(ahora),
});

export const cambiosContactoCrm = sqliteTable('cambios_contacto_crm', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  documento: text('documento').notNull(),
  anterior: text('anterior'),
  nuevo: text('nuevo').notNull(),
  usuarioId: text('usuario_id').notNull(),
  nombreUsuario: text('nombre_usuario').notNull(),
  creadoEn: text('creado_en').notNull().$defaultFn(ahora),
}, tabla => [index('idx_contacto_cambios_documento').on(tabla.documento, tabla.creadoEn)]);

export const promesasCrm = sqliteTable('promesas_crm', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  carteraClienteId: text('cartera_cliente_id').notNull().references(() => carteraClientes.id, { onDelete: 'cascade' }),
  gestionId: text('gestion_id').references(() => gestionesCobro.id, { onDelete: 'set null' }),
  monto: real('monto').notNull(),
  fechaCompromiso: text('fecha_compromiso').notNull(),
  estado: text('estado').notNull().default('pendiente'),
  abonoBase: real('abono_base').notNull(),
  responsableId: text('responsable_id').notNull(),
  responsableNombre: text('responsable_nombre').notNull(),
  notas: text('notas').notNull().default(''),
  resolucion: text('resolucion'),
  resueltaEn: text('resuelta_en'),
  creadoEn: text('creado_en').notNull().$defaultFn(ahora),
  actualizadoEn: text('actualizado_en').notNull().$defaultFn(ahora),
}, tabla => [index('idx_promesas_estado_fecha').on(tabla.estado, tabla.fechaCompromiso),
  uniqueIndex('uq_promesa_abierta_credito').on(tabla.carteraClienteId).where(sql`${tabla.estado} IN ('pendiente', 'parcial')`)]);

export const importacionesCrm = sqliteTable('importaciones_crm', {
  id: text('id').primaryKey().$defaultFn(idPorDefecto),
  archivo: text('archivo').notNull(),
  fechaCorte: text('fecha_corte').notNull(),
  usuarioId: text('usuario_id').notNull(),
  nuevos: integer('nuevos').notNull().default(0),
  actualizados: integer('actualizados').notNull().default(0),
  sinCambios: integer('sin_cambios').notNull().default(0),
  errores: integer('errores').notNull().default(0),
  comparados: integer('comparados').notNull().default(0),
  saldoAnterior: real('saldo_anterior').notNull().default(0),
  saldoNuevo: real('saldo_nuevo').notNull().default(0),
  abonoAnterior: real('abono_anterior').notNull().default(0),
  abonoNuevo: real('abono_nuevo').notNull().default(0),
  finalizadaEn: text('finalizada_en'),
  creadoEn: text('creado_en').notNull().$defaultFn(ahora),
});
