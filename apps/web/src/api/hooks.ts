import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Empleado,
  Municipio,
  RegistroVenta,
  RegistroCobro,
  GastoEmpleado,
  LiquidacionNomina,
  ReporteNomina,
  MovimientoCaja,
  BalanceCaja,
  SaldoAhorro,
  Prestamo,
  MovimientoPrestamo,
  Producto,
  Configuracion,
  ConceptoComprobante,
  Periodo,
  ZonaVenta,
} from '@credito/shared';
import { obtener, enviar, parchar, borrar, subirArchivo } from './cliente.js';

/**
 * Hooks de datos.
 *
 * Las claves de cache estan agrupadas por entidad para poder invalidar de
 * a bloques: al registrar una venta hay que refrescar la liquidacion y el
 * ahorro, porque los tres dependen del mismo dato.
 */
export const claves = {
  sesion: ['sesion'] as const,
  empleados: ['empleados'] as const,
  empleado: (id: string) => ['empleados', id] as const,
  ahorro: (id: string) => ['empleados', id, 'ahorro'] as const,
  prestamo: (id: string) => ['empleados', id, 'prestamo'] as const,
  municipios: ['municipios'] as const,
  zonasVenta: ['zonas-venta'] as const,
  ventas: (filtros?: unknown) => ['ventas', filtros] as const,
  cobros: (filtros?: unknown) => ['cobros', filtros] as const,
  gastos: (filtros?: unknown) => ['gastos', filtros] as const,
  nomina: ['nomina'] as const,
  liquidacion: (id: string, periodo: Periodo) => ['nomina', 'previa', id, periodo] as const,
  reporteNomina: (periodo: Periodo) => ['nomina', 'reporte', periodo] as const,
  historialNomina: (filtros?: unknown) => ['nomina', 'historial', filtros] as const,
  caja: (filtros?: unknown) => ['caja', filtros] as const,
  balance: (periodo: Periodo) => ['caja', 'balance', periodo] as const,
  productos: ['productos'] as const,
  configuracion: ['configuracion'] as const,
};

function parametros(filtros: Record<string, string | undefined>): string {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor) busqueda.set(clave, valor);
  }
  const texto = busqueda.toString();
  return texto ? `?${texto}` : '';
}

// ---------- Sesion ----------

export interface UsuarioSesion {
  id: string;
  usuario: string;
  nombre: string;
  rol: 'admin' | 'catalogo';
}

export interface EstadoSesion {
  necesitaInstalacion: boolean;
  autenticado: boolean;
  usuario: UsuarioSesion | null;
}

/**
 * Estado de la sesion. Decide que se muestra al abrir la app: el asistente de
 * instalacion, el login, o la aplicacion.
 */
export function useSesion() {
  return useQuery({
    queryKey: claves.sesion,
    queryFn: () => obtener<EstadoSesion>('/api/sesion/estado'),
    // Si la sesion expira mientras la pestana esta abierta, conviene notarlo.
    staleTime: 60_000,
    retry: false,
  });
}

export function useEntrar() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: { usuario: string; contrasena: string }) =>
      enviar<{ usuario: UsuarioSesion }>('/api/sesion/entrar', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.sesion }),
  });
}

export function useInstalar() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: { usuario: string; contrasena: string; nombre: string }) =>
      enviar<{ usuario: UsuarioSesion }>('/api/sesion/instalar', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.sesion }),
  });
}

export function useSalir() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => enviar<{ salio: boolean }>('/api/sesion/salir'),
    onSuccess: () => {
      /**
       * Primero se marca la sesion como cerrada.
       *
       * El orden importa: al cambiar este dato, la app desmonta las pantallas
       * privadas y muestra el login. Si en cambio se limpiara la cache de una,
       * las pantallas seguirian montadas un instante y volverian a pedir sus
       * datos sin sesion, soltando una tanda de 401 en la consola.
       */
      cache.setQueryData(claves.sesion, {
        necesitaInstalacion: false,
        autenticado: false,
        usuario: null,
      } satisfies EstadoSesion);

      /**
       * Ya sin pantallas privadas montadas, se descartan los datos del usuario
       * anterior (salarios, balances) para que no queden visibles si entra otra
       * persona en el mismo dispositivo.
       *
       * removeQueries y no clear(): clear() borraria tambien el estado de
       * sesion que se acaba de fijar arriba.
       */
      for (const clave of ['empleados', 'ventas', 'cobros', 'gastos', 'nomina', 'caja', 'productos', 'configuracion']) {
        cache.removeQueries({ queryKey: [clave] });
      }
    },
  });
}

export function useCambiarContrasena() {
  return useMutation({
    mutationFn: (datos: { contrasenaActual: string; contrasenaNueva: string }) =>
      enviar<{ cambiada: boolean; mensaje: string }>('/api/sesion/cambiar-contrasena', datos),
  });
}

// ---------- Empleados ----------

export function useEmpleados(incluirInactivos = false) {
  return useQuery({
    queryKey: [...claves.empleados, incluirInactivos],
    queryFn: () => obtener<Empleado[]>(`/api/empleados${parametros({ incluirInactivos: incluirInactivos ? 'true' : undefined })}`),
  });
}

export function useAhorro(empleadoId: string | null) {
  return useQuery({
    queryKey: claves.ahorro(empleadoId ?? ''),
    queryFn: () => obtener<SaldoAhorro>(`/api/empleados/${empleadoId}/ahorro`),
    enabled: Boolean(empleadoId),
  });
}

export function usePrestamo(empleadoId: string | null) {
  return useQuery({
    queryKey: claves.prestamo(empleadoId ?? ''),
    queryFn: () =>
      obtener<{ prestamo: Prestamo | null; movimientos: MovimientoPrestamo[] }>(
        `/api/empleados/${empleadoId}/prestamo`,
      ),
    enabled: Boolean(empleadoId),
  });
}

export function useRegistrarPrestamo() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({
      empleadoId,
      ...datos
    }: {
      empleadoId: string;
      monto: number;
      fecha: string;
      concepto?: string;
    }) => enviar<MovimientoPrestamo>(`/api/empleados/${empleadoId}/prestamo`, datos),
    onSuccess: (_, variables) => {
      cache.invalidateQueries({ queryKey: claves.prestamo(variables.empleadoId) });
      cache.invalidateQueries({ queryKey: claves.nomina });
    },
  });
}

export function useCrearEmpleado() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => enviar<Empleado>('/api/empleados', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.empleados }),
  });
}

export function useActualizarEmpleado() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string } & Record<string, unknown>) =>
      parchar<Empleado>(`/api/empleados/${id}`, datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.empleados }),
  });
}

export function useDesactivarEmpleado() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => borrar<{ desactivado: boolean }>(`/api/empleados/${id}`),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.empleados }),
  });
}

// ---------- Municipios ----------

export function useMunicipios() {
  return useQuery({
    queryKey: claves.municipios,
    queryFn: () => obtener<Municipio[]>('/api/municipios'),
  });
}

export function useGuardarMunicipio() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id?: string } & Record<string, unknown>) =>
      id
        ? parchar<Municipio>(`/api/municipios/${id}`, datos)
        : enviar<Municipio>('/api/municipios', datos),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: claves.municipios });
      // Cambiar una meta cambia los bonos, asi que la nomina se recalcula.
      cache.invalidateQueries({ queryKey: claves.nomina });
    },
  });
}

// ---------- Zonas de venta ----------

export function useZonasVenta() {
  return useQuery({
    queryKey: claves.zonasVenta,
    queryFn: () => obtener<ZonaVenta[]>('/api/zonas-venta'),
  });
}

export function useGuardarZonaVenta() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id?: string } & Record<string, unknown>) =>
      id
        ? parchar<ZonaVenta>(`/api/zonas-venta/${id}`, datos)
        : enviar<ZonaVenta>('/api/zonas-venta', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.zonasVenta }),
  });
}

// ---------- Operaciones del dia ----------

export interface FiltrosOperacion extends Record<string, string | undefined> {
  empleadoId?: string;
  municipioId?: string;
  desde?: string;
  hasta?: string;
}

/**
 * Al registrar una venta, un cobro o un gasto hay que refrescar tambien la
 * nomina y el ahorro: los tres se calculan a partir de estos registros y
 * quedarian mostrando datos viejos.
 */
function useRegistrarOperacion<T>(ruta: string, clave: readonly unknown[]) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => enviar<T>(ruta, datos),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: clave });
      cache.invalidateQueries({ queryKey: claves.nomina });
      cache.invalidateQueries({ queryKey: claves.empleados });
    },
  });
}

export function useVentas(filtros: FiltrosOperacion = {}) {
  return useQuery({
    queryKey: claves.ventas(filtros),
    queryFn: () => obtener<RegistroVenta[]>(`/api/ventas${parametros(filtros)}`),
  });
}

export const useRegistrarVenta = () =>
  useRegistrarOperacion<RegistroVenta>('/api/ventas', ['ventas']);

export function useCobros(filtros: FiltrosOperacion = {}) {
  return useQuery({
    queryKey: claves.cobros(filtros),
    queryFn: () => obtener<RegistroCobro[]>(`/api/cobros${parametros(filtros)}`),
  });
}

export const useRegistrarCobro = () =>
  useRegistrarOperacion<RegistroCobro>('/api/cobros', ['cobros']);

export function useGastos(filtros: FiltrosOperacion = {}) {
  return useQuery({
    queryKey: claves.gastos(filtros),
    queryFn: () => obtener<GastoEmpleado[]>(`/api/gastos${parametros(filtros)}`),
  });
}

export const useRegistrarGasto = () =>
  useRegistrarOperacion<GastoEmpleado>('/api/gastos', ['gastos']);

export function useBorrarOperacion(tipo: 'ventas' | 'cobros' | 'gastos') {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => borrar<{ borrado: boolean }>(`/api/${tipo}/${id}`),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: [tipo] });
      cache.invalidateQueries({ queryKey: claves.nomina });
    },
  });
}

// ---------- Nomina ----------

/**
 * Previsualiza la liquidacion sin guardarla.
 *
 * Se apoya en el mismo motor de calculo del backend, asi que lo que se ve en
 * pantalla es exactamente lo que se va a pagar. No hay una segunda formula
 * en el frontend que pueda quedar desalineada.
 */
export function usePreviaLiquidacion(empleadoId: string | null, periodo: Periodo) {
  return useQuery({
    queryKey: claves.liquidacion(empleadoId ?? '', periodo),
    queryFn: () =>
      enviar<LiquidacionNomina>('/api/nomina/previsualizar', { empleadoId, periodo }),
    enabled: Boolean(empleadoId && periodo.desde && periodo.hasta),
  });
}

/**
 * Cuanto se le debe a cada empleado en un rango de fechas.
 *
 * No es una liquidacion real (no incluye bonos ni prestamo), es una foto de
 * lo que se hizo en el rango para saber cuanto hay que tener listo antes de
 * liquidar a cada uno.
 */
export function useReporteNomina(periodo: Periodo) {
  return useQuery({
    queryKey: claves.reporteNomina(periodo),
    queryFn: () =>
      obtener<ReporteNomina>(
        `/api/nomina/reporte${parametros({ desde: periodo.desde, hasta: periodo.hasta })}`,
      ),
    enabled: Boolean(periodo.desde && periodo.hasta),
  });
}

/** Texto resumen para compartir el reporte de nomina por WhatsApp. */
export function useTextoCompartirReporte(periodo: Periodo) {
  return useQuery({
    queryKey: [...claves.reporteNomina(periodo), 'compartir'],
    queryFn: () =>
      obtener<{ texto: string; reporte: ReporteNomina }>(
        `/api/nomina/reporte/compartir${parametros({ desde: periodo.desde, hasta: periodo.hasta })}`,
      ),
    enabled: Boolean(periodo.desde && periodo.hasta),
  });
}

export function useConfirmarLiquidacion() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: {
      empleadoId: string;
      periodo: Periodo;
      nota?: string;
      abonoPrestamo?: number;
    }) => enviar<{ id: string; liquidacion: LiquidacionNomina }>('/api/nomina/confirmar', datos),
    onSuccess: (_, variables) => {
      // Pagar mueve nomina, ahorro, caja y préstamo a la vez.
      cache.invalidateQueries({ queryKey: claves.nomina });
      cache.invalidateQueries({ queryKey: claves.empleados });
      cache.invalidateQueries({ queryKey: claves.prestamo(variables.empleadoId) });
      cache.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export interface ItemHistorialNomina {
  id: string;
  numero: string;
  empleadoId: string;
  empleadoNombre: string;
  empleadoDocumento: string | null;
  periodoDesde: string;
  periodoHasta: string;
  netoAPagar: number;
  totalBruto: number;
  deduccionesTotal: number;
  ahorroRetenido: number;
  estado: 'borrador' | 'pagada' | 'anulada';
  pagadaEn: string | null;
  creadoEn: string;
  nota: string | null;
  conceptos: ConceptoComprobante[];
}

interface FiltrosHistorialNomina extends Record<string, string | undefined> {
  empleadoId?: string;
  desde?: string;
  hasta?: string;
}

/** Historial de pagos, del mas reciente al mas viejo. */
export function useHistorialNomina(filtros: FiltrosHistorialNomina = {}) {
  return useQuery({
    queryKey: claves.historialNomina(filtros),
    queryFn: () => obtener<ItemHistorialNomina[]>(`/api/nomina${parametros(filtros)}`),
  });
}

export function useAnularLiquidacion() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      enviar<{ anulada: boolean; id: string }>(`/api/nomina/${id}/anular`, { motivo }),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: claves.nomina });
      cache.invalidateQueries({ queryKey: claves.empleados });
      cache.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

/** Texto resumen para compartir el comprobante por WhatsApp. */
export function useTextoCompartirNomina(id: string | null) {
  return useQuery({
    queryKey: ['nomina', 'compartir', id],
    queryFn: () =>
      obtener<{ texto: string; numero: string; telefonoEmpleado: string | null }>(
        `/api/nomina/${id}/compartir`,
      ),
    enabled: Boolean(id),
  });
}

export function usePagarAhorro() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: { empleadoId: string; fecha: string; forzar?: boolean }) =>
      enviar<{ montoPagado: number; saldoRestante: number }>('/api/nomina/ahorro/pagar', datos),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: claves.empleados });
      cache.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

// ---------- Caja ----------

export function useBalance(periodo: Periodo) {
  return useQuery({
    queryKey: claves.balance(periodo),
    queryFn: () =>
      obtener<BalanceCaja>(`/api/caja/balance${parametros({ desde: periodo.desde, hasta: periodo.hasta })}`),
    enabled: Boolean(periodo.desde && periodo.hasta),
  });
}

export function useMovimientosCaja(filtros: { desde?: string; hasta?: string; tipo?: string } = {}) {
  return useQuery({
    queryKey: claves.caja(filtros),
    queryFn: () => obtener<MovimientoCaja[]>(`/api/caja${parametros(filtros)}`),
  });
}

export function useRegistrarMovimiento() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => enviar<MovimientoCaja>('/api/caja', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['caja'] }),
  });
}

export function useBorrarMovimiento() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => borrar<{ borrado: boolean }>(`/api/caja/${id}`),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['caja'] }),
  });
}

// ---------- Productos y catalogo ----------

export function useProductos() {
  return useQuery({
    queryKey: claves.productos,
    queryFn: () => obtener<Producto[]>('/api/productos'),
  });
}

export function useGuardarProducto() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id?: string } & Record<string, unknown>) =>
      id ? parchar<Producto>(`/api/productos/${id}`, datos) : enviar<Producto>('/api/productos', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.productos }),
  });
}

export function useBorrarProducto() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => borrar<{ borrado: boolean }>(`/api/productos/${id}`),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.productos }),
  });
}

export function useSubirFoto() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archivo }: { id: string; archivo: File }) =>
      subirArchivo<{ producto: Producto; original: number; procesada: number }>(
        `/api/productos/${id}/imagen`,
        'imagen',
        archivo,
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.productos }),
  });
}

export function useQuitarFoto() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => borrar<{ borrada: boolean }>(`/api/productos/${id}/imagen`),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.productos }),
  });
}

export function useConfiguracion() {
  return useQuery({
    queryKey: claves.configuracion,
    queryFn: () => obtener<Configuracion>('/api/configuracion'),
  });
}

export function useGuardarConfiguracion() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => parchar<Configuracion>('/api/configuracion', datos),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.configuracion }),
  });
}

export function useSubirLogo() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (archivo: File) =>
      subirArchivo<{ configuracion: Configuracion; original: number; procesada: number }>(
        '/api/configuracion/logo',
        'logo',
        archivo,
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.configuracion }),
  });
}

export function useQuitarLogo() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => borrar<{ borrado: boolean }>('/api/configuracion/logo'),
    onSuccess: () => cache.invalidateQueries({ queryKey: claves.configuracion }),
  });
}

export function useEnlaceCompartir() {
  return useQuery({
    queryKey: ['catalogo', 'compartir'],
    queryFn: () => obtener<{ link: string; enlaceWhatsapp: string }>('/api/catalogo/compartir'),
  });
}
