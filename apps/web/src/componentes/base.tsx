import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2, Inbox, X } from 'lucide-react';
import { formatearPesos } from '@credito/shared';
import { ErrorApi } from '../api/cliente.js';

/** Muestra un monto con el color segun si entra o sale plata. */
export function Dinero({
  valor,
  tipo = 'neutro',
  tamano = 'normal',
}: {
  valor: number;
  tipo?: 'ingreso' | 'egreso' | 'neutro';
  tamano?: 'normal' | 'grande';
}) {
  const color =
    tipo === 'ingreso'
      ? 'text-metal-600'
      : tipo === 'egreso'
        ? 'text-red-600'
        : valor < 0
          ? 'text-red-600'
          : 'text-slate-900';

  const tamanos = tamano === 'grande' ? 'text-2xl font-semibold' : 'font-medium';

  return <span className={`tabular-nums ${color} ${tamanos}`}>{formatearPesos(valor)}</span>;
}

/**
 * Muestra el error de una operacion.
 *
 * Prefiere el mensaje del backend, que esta escrito para que lo lea una
 * persona. Los errores de validacion traen el detalle por campo, que es lo
 * que dice exactamente que corregir.
 */
export function Aviso({ error }: { error: unknown }) {
  if (!error) return null;

  const mensaje = error instanceof Error ? error.message : 'Ocurrio un error inesperado';
  const detalles = error instanceof ErrorApi ? error.detalles : undefined;

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-red-100 bg-red-50 p-3.5 text-sm text-red-800"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
      <div className="min-w-0">
        <p className="font-medium">{mensaje}</p>
        {detalles && detalles.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-red-700">
            {detalles.map((detalle, indice) => (
              <li key={indice}>
                <span className="font-medium">{detalle.campo}</span>: {detalle.mensaje}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Confirmacion de una operacion que salio bien. */
export function Exito({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-metal-100 bg-metal-50 p-3.5 text-sm font-medium text-metal-800"
    >
      <CheckCircle2 size={18} className="shrink-0 text-metal-600" />
      <div>{children}</div>
    </div>
  );
}

/** Aviso informativo, para explicar reglas del negocio en pantalla. */
export function Nota({ children, tono = 'azul' }: { children: ReactNode; tono?: 'azul' | 'ambar' }) {
  const estilos =
    tono === 'ambar'
      ? 'border-amber-100 bg-amber-50 text-amber-900'
      : 'border-blue-100 bg-blue-50 text-blue-900';

  return <div className={`rounded-xl border p-3.5 text-sm ${estilos}`}>{children}</div>;
}

export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2.5 p-4 text-sm text-slate-500" aria-live="polite">
      <Loader2 size={16} className="animate-spin" />
      {texto}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Inbox size={28} className="text-slate-300" />
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}

/**
 * Modal generico para formularios y detalles.
 *
 * Los formularios de la app viven en modales en vez de abrirse en linea: asi
 * la lista de fondo no se corre ni pierde el scroll cuando alguien abre uno.
 * Cierra con Escape y con el clic afuera, que es lo que la gente espera.
 */
export function Modal({
  titulo,
  onCerrar,
  children,
  ancho = 'normal',
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: 'normal' | 'amplio';
}) {
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  /**
   * Se renderiza en un portal, fuera del arbol donde se use <Modal>.
   *
   * Ajustes envuelve toda la pagina en un <form>, y el formulario de este
   * modal quedaba anidado adentro: HTML invalido, que React solo reporta
   * como advertencia pero el navegador resuelve mal (el boton "Guardar" no
   * quedaba asociado a su formulario y el submit no hacia nada). El portal
   * saca el modal de ese arbol sin importar donde se use.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ${
          ancho === 'amplio' ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Boton({
  children,
  onClick,
  tipo = 'primario',
  cargando,
  deshabilitado,
  submit,
  ancho,
  icono: Icono,
}: {
  children: ReactNode;
  onClick?: () => void;
  tipo?: 'primario' | 'secundario' | 'peligro';
  cargando?: boolean;
  deshabilitado?: boolean;
  submit?: boolean;
  ancho?: boolean;
  icono?: typeof Loader2;
}) {
  const estilos = {
    // El primario va con el gradiente metalizado. Deshabilitado pierde el
    // brillo y queda plano: si conservara el relieve seguiria pareciendo
    // pulsable.
    primario: 'metal metal-hover disabled:bg-none disabled:bg-metal-300 disabled:shadow-none',
    secundario:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:text-slate-400 shadow-xs',
    peligro: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 shadow-xs',
  }[tipo];

  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={onClick}
      disabled={deshabilitado || cargando}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm
        font-semibold transition disabled:cursor-not-allowed
        ${estilos} ${ancho ? 'w-full' : ''}`}
    >
      {cargando ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        Icono && <Icono size={16} />
      )}
      {cargando ? 'Guardando...' : children}
    </button>
  );
}

/** Boton pequeno para acciones dentro de una tarjeta. */
export function BotonChico({
  children,
  onClick,
  tono = 'neutro',
  deshabilitado,
}: {
  children: ReactNode;
  onClick?: () => void;
  tono?: 'neutro' | 'peligro';
  deshabilitado?: boolean;
}) {
  const estilos =
    tono === 'peligro'
      ? 'border-red-100 text-red-600 hover:bg-red-50'
      : 'border-slate-200 text-slate-600 hover:bg-slate-50';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${estilos}`}
    >
      {children}
    </button>
  );
}

/** Tarjeta con un dato destacado: se usa en el resumen y en caja. */
export function TarjetaDato({
  etiqueta,
  children,
  icono: Icono,
  tono,
}: {
  etiqueta: string;
  children: ReactNode;
  icono?: typeof Loader2;
  tono?: 'ingreso' | 'egreso';
}) {
  const colorIcono =
    tono === 'ingreso' ? 'text-metal-600' : tono === 'egreso' ? 'text-red-600' : 'text-slate-400';

  return (
    <div className="tarjeta">
      <div className="flex items-center gap-2">
        {Icono && <Icono size={15} className={colorIcono} />}
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{etiqueta}</p>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
