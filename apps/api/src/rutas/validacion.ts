import { z } from 'zod';

/**
 * Validacion de entrada con Zod.
 *
 * Todo lo que llega de afuera se valida aqui antes de tocar la base de datos.
 * Es la frontera del sistema: adentro los tipos ya son confiables.
 */

/** Monto en pesos: entero, no negativo. Rechaza decimales explicitamente. */
export const zMonto = z
  .number()
  .int('Los montos en pesos deben ser enteros, sin decimales')
  .nonnegative('El monto no puede ser negativo');

/** Porcentaje entre 0 y 100. Acepta decimales (2.5%). */
export const zPorcentaje = z
  .number()
  .min(0, 'El porcentaje no puede ser negativo')
  .max(100, 'El porcentaje no puede pasar de 100');

/** Fecha ISO corta que ademas debe existir en el calendario. */
export const zFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD')
  .refine((valor) => {
    const fecha = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
  }, 'Esa fecha no existe en el calendario');

export const zId = z.string().min(1, 'El id es obligatorio');

/** Periodo con validacion de orden: desde no puede ser mayor que hasta. */
export const zPeriodo = z
  .object({ desde: zFecha, hasta: zFecha })
  .refine((p) => p.desde <= p.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['desde'],
  });

/**
 * Objeto base del empleado, sin la validacion cruzada de tarifas.
 * Se separa porque Zod no permite .partial() sobre un objeto con .refine(),
 * y el PATCH necesita la version parcial.
 */
const objetoEmpleado = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  documento: z.string().trim().max(40).nullish(),
  telefono: z.string().trim().max(40).nullish(),
  tarifaVenta: zMonto.optional(),
  tarifaLiquidacion: zMonto.optional(),
  porcentajeCobro: zPorcentaje.optional(),
});

/** La liquidacion nunca puede superar la venta: generaria ahorro negativo. */
const tarifasCoherentes = (e: {
  tarifaVenta?: number | undefined;
  tarifaLiquidacion?: number | undefined;
}) =>
  e.tarifaVenta === undefined ||
  e.tarifaLiquidacion === undefined ||
  e.tarifaLiquidacion <= e.tarifaVenta;

const mensajeTarifas = {
  message: 'La tarifa de liquidacion no puede superar la de venta: generaria un ahorro negativo',
  path: ['tarifaLiquidacion'],
};

export const zNuevoEmpleado = objetoEmpleado.refine(tarifasCoherentes, mensajeTarifas);

/**
 * Version parcial para PATCH. Mantiene la validacion de tarifas, porque
 * mandar solo tarifaLiquidacion mas alta que la de venta tambien es un error.
 */
export const zEmpleadoParcial = objetoEmpleado.partial().refine(tarifasCoherentes, mensajeTarifas);

export const zNuevoMunicipio = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  metaRecaudo: zMonto,
  porcentajeExcedente: zPorcentaje,
  baseBono: z.enum(['excedente', 'total']).optional(),
});

export const zNuevaZonaVenta = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  whatsappVendedor: z.string().trim().min(1, 'El numero del vendedor es obligatorio').max(25),
  activo: z.boolean().optional(),
});

export const zZonaVentaParcial = zNuevaZonaVenta.partial();

export const zNuevaVenta = z.object({
  empleadoId: zId,
  municipioId: zId.nullish(),
  fecha: zFecha,
  cantidad: z
    .number()
    .int('La cantidad de ventas debe ser un numero entero')
    .positive('La cantidad debe ser mayor a cero'),
  nota: z.string().trim().max(500).nullish(),
});

export const zNuevoCobro = z.object({
  empleadoId: zId,
  municipioId: zId,
  fecha: zFecha,
  montoRecaudado: zMonto.refine((v) => v > 0, 'El monto recaudado debe ser mayor a cero'),
  nota: z.string().trim().max(500).nullish(),
});

export const zNuevoGasto = z.object({
  empleadoId: zId,
  municipioId: zId.nullish(),
  fecha: zFecha,
  monto: zMonto.refine((v) => v > 0, 'El gasto debe ser mayor a cero'),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio').max(200),
  deducible: z.boolean().optional(),
});

export const zNuevaDevolucion = z.object({
  empleadoId: zId,
  municipioId: zId.nullish(),
  fecha: zFecha,
  cantidad: z
    .number()
    .int('La cantidad de devoluciones debe ser un numero entero')
    .positive('La cantidad debe ser mayor a cero'),
  motivo: z.string().trim().max(500).nullish(),
});

export const zNuevoMovimientoCaja = z.object({
  fecha: zFecha,
  tipo: z.enum(['ingreso', 'egreso']),
  monto: zMonto.refine((v) => v > 0, 'El monto debe ser mayor a cero'),
  categoria: z.string().trim().min(1, 'La categoria es obligatoria').max(60),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio').max(200),
  empleadoId: zId.nullish(),
});

export const zNuevoProducto = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(150),
  descripcion: z.string().trim().max(1000).nullish(),
  precio: zMonto.optional(),
  precioContado: zMonto.optional(),
  precioCredicontado: zMonto.optional(),
  precioCredito: zMonto.optional(),
  inicial: zMonto.optional(),
  pagoSemanal: zMonto.optional(),
  categoria: z.string().trim().max(60).nullish(),
  visible: z.boolean().optional(),
  disponible: z.boolean().optional(),
  esNuevo: z.boolean().optional(),
  enPromocion: z.boolean().optional(),
  orden: z.number().int().optional(),
});

export const zProductoParcial = zNuevoProducto.partial();

/**
 * Configuracion editable.
 *
 * El numero de WhatsApp se acepta como lo escriba la persona (con espacios,
 * guiones o parentesis); se normaliza al generar el enlace.
 */
export const zConfiguracion = z.object({
  nombreNegocio: z.string().trim().min(1, 'El nombre del negocio es obligatorio').max(120),
  whatsappNumero: z.string().trim().max(25).nullish(),
  whatsappVendedor: z.string().trim().max(25).nullish(),
  tituloCatalogo: z.string().trim().min(1, 'El titulo es obligatorio').max(120),
  descripcionCatalogo: z.string().trim().max(300).nullish(),
  plantillaMensaje: z.string().trim().min(1).max(500),
  plantillaConsulta: z.string().trim().min(1).max(500),
  notaPie: z.string().trim().max(500).nullish(),
  catalogoActivo: z.boolean(),
  mostrarPrecios: z.boolean(),
}).partial();

export const zLiquidacion = z.object({
  empleadoId: zId,
  periodo: zPeriodo,
  incluirBonos: z.boolean().optional(),
  nota: z.string().trim().max(500).optional(),
  abonoPrestamo: z.number().int().nonnegative().optional(),
});

/** Validación de permisos */
export const zPermisos = z.object({
  dashboard: z.boolean(),
  empleados: z.boolean(),
  municipios: z.boolean(),
  ventas: z.boolean(),
  cobros: z.boolean(),
  gastos: z.boolean(),
  liquidaciones: z.boolean(),
  caja: z.boolean(),
  prestamos: z.boolean(),
  catalogo: z.boolean(),
  configuracion: z.boolean(),
  usuarios: z.boolean(),
});

/** Validación para crear usuario */
export const zNuevoUsuario = z.object({
  usuario: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(50).toLowerCase(),
  contrasena: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  rol: z.enum(['admin', 'vendedor', 'catalogo', 'custom']),
  permisos: zPermisos.optional(),
  empleadoId: zId.nullish(),
  activo: z.boolean().optional(),
});

/** Validación para actualizar usuario */
export const zActualizarUsuario = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120).optional(),
  rol: z.enum(['admin', 'vendedor', 'catalogo', 'custom']).optional(),
  permisos: zPermisos.optional(),
  empleadoId: zId.nullish(),
  activo: z.boolean().optional(),
}).partial();

/** Validación para cambiar contraseña */
export const zCambiarContrasena = z.object({
  contrasenaActual: z.string().min(1, 'La contraseña actual es obligatoria'),
  contrasenaNueva: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres').max(100),
});
