import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
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
