export interface CreditoCrm {
  id: string; numero: string; cliente: string; cedula: string; saldo: number; abono: number;
  diasMora: number; telefono: string | null; fechaCorteExcel: string | null; vendedor: string;
}
export interface ContactoCrm {
  documento: string; responsableId: string | null; version: number;
  estadoUbicacion: 'por_confirmar' | 'cambio_vivienda' | 'no_localizado' | 'localizado';
  direccionAnterior: string; direccionActual: string; barrio: string; municipio: string;
  referencias: string; telefonoAlternativo: string; verificadoEn: string | null; actualizadoEn: string;
}
export interface PromesaCrm {
  id: string; carteraClienteId: string; numero: string; monto: number; fechaCompromiso: string;
  estado: string; abonoBase: number; abonoActual: number; avanceDetectado: number;
  fechaCorteAbono: string | null; responsableNombre: string; notas: string; resolucion: string | null;
  vencida: boolean; revision: string | null;
}
export interface FichaCrm {
  documento: string; contacto: ContactoCrm | null; creditos: CreditoCrm[]; promesas: PromesaCrm[];
  responsables: { id: string; nombre: string }[]; usuarioActualId: string;
  historial: { numero: string; gestion: { id: string; fechaGestion: string; tipoGestion: string; resultado: string; notas: string | null; nombreUsuario: string } }[];
  cambiosContacto: { id: string; creadoEn: string; nombreUsuario: string; anterior: ContactoCrm | null; nuevo: ContactoCrm }[];
}
export interface FilaAgenda {
  documento: string; cliente: string; creditoPrincipal: CreditoCrm; creditos: { id: string; numero: string }[];
  saldo: number; diasMora: number; ultimaGestion: string | null; pendientes: number; promesas: number;
  categorias: string[]; estadoUbicacion: string; responsableId: string | null; responsableNombre: string | null; fechaProxima: string | null;
}
export interface AgendaCrm {
  hoy: string; filas: FilaAgenda[]; total: number; pagina: number; responsables: { id: string; nombre: string }[];
  contadores: Record<string, number>;
  indicadores: { personas: number; saldo: number; promesasMes: number; cumplidasMes: number; localizados: number;
    tramos: { nombre: string; creditos: number; saldo: number }[];
    porGestor: { nombre: string; gestionesMes: number; promesas: number; cumplidas: number; clientesAsignados: number }[] };
  importaciones: { id: string; archivo: string; fechaCorte: string; creadoEn: string; finalizadaEn: string | null;
    nuevos: number; actualizados: number; errores: number; comparados: number;
    saldoAnterior: number; saldoNuevo: number; abonoAnterior: number; abonoNuevo: number }[];
}
export const pesosCrm = (valor: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
export const fechaCrm = (valor: string | null) => valor ? new Date(valor.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC' }) : 'Sin corte';
export const ubicacionesCrm: Record<string, string> = { por_confirmar: 'Por confirmar', cambio_vivienda: 'Cambio de vivienda', no_localizado: 'No localizado', localizado: 'Localizado', sin_datos: 'Sin datos' };
export const categoriasCrm: Record<string, string> = { todos: 'Todos', sin_contacto: 'Mora sin contacto reciente', seguimientos: 'Seguimientos pendientes', promesas_hoy: 'Promesas de hoy', promesas_vencidas: 'Promesas vencidas', localizar: 'Por localizar', revisar_abonos: 'Abonos por revisar', proximos: 'Proximos compromisos' };
