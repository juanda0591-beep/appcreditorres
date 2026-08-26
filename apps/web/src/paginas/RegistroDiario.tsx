import { useState } from 'react';
import { ShoppingCart, HandCoins, Receipt } from 'lucide-react';
import { useEmpleados, useMunicipios } from '../api/hooks.js';
import { Cargando, Modal } from '../componentes/base.js';
import { Pestanas } from '../componentes/Pestanas.js';
import { HistorialVentas, HistorialCobros, HistorialGastos } from '../componentes/HistorialOperaciones.js';
import { hoy } from '../utilidades/fechas.js';
import { FormularioVenta, FormularioCobro, FormularioGasto } from './formularios.js';

type Formulario = 'venta' | 'cobro' | 'gasto';

const TITULOS: Record<Formulario, string> = {
  venta: 'Registrar ventas',
  cobro: 'Registrar cobro',
  gasto: 'Registrar gasto',
};

type Vista = 'registrar' | 'ventas' | 'cobros' | 'gastos';

/** Pantalla del dia a dia: registrar operaciones y revisar su historial. */
export function RegistroDiario() {
  const [vista, setVista] = useState<Vista>('registrar');

  return (
    <div className="space-y-5">
      <Pestanas
        valor={vista}
        onCambio={setVista}
        opciones={[
          ['registrar', 'Registrar'],
          ['ventas', 'Historial de ventas'],
          ['cobros', 'Historial de cobros'],
          ['gastos', 'Historial de gastos'],
        ]}
      />

      {vista === 'registrar' && <Registrar />}
      {vista === 'ventas' && <HistorialVentas />}
      {vista === 'cobros' && <HistorialCobros />}
      {vista === 'gastos' && <HistorialGastos />}
    </div>
  );
}

/**
 * El empleado y la fecha se eligen una vez y quedan arriba; cada registro se
 * hace en un modal. El gasto va dentro de la venta y del cobro, que es como
 * ocurre en la realidad: "recaudo dos millones y gasto setenta mil" en un
 * solo viaje.
 */
function Registrar() {
  const [abierto, setAbierto] = useState<Formulario | null>(null);

  // Se conservan entre registros: lo normal es anotar varias cosas seguidas de
  // la misma persona.
  const [empleadoId, setEmpleadoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [fecha, setFecha] = useState(hoy());

  // Ultimo registro, para tener confirmacion de que quedo guardado despues de
  // que el modal se cierra.
  const [ultimo, setUltimo] = useState('');

  const empleados = useEmpleados();
  const municipios = useMunicipios();

  if (empleados.isLoading) return <Cargando texto="Cargando empleados" />;

  const listaEmpleados = empleados.data ?? [];

  if (listaEmpleados.length === 0) {
    return (
      <div className="tarjeta text-center">
        <p className="text-slate-600">Todavia no hay empleados registrados.</p>
        <p className="mt-1 text-sm text-slate-500">
          Ve a Empleados y agrega el primero para poder registrar ventas.
        </p>
      </div>
    );
  }

  const empleado = listaEmpleados.find((e) => e.id === empleadoId);

  function cerrar(resumen?: string) {
    if (resumen) setUltimo(resumen);
    setAbierto(null);
  }

  return (
    <div className="space-y-5">
      <div className="tarjeta space-y-3">
        <div>
          <label className="etiqueta" htmlFor="empleado">
            Empleado <span className="text-red-600">*</span>
          </label>
          <select
            id="empleado"
            className="campo"
            value={empleadoId}
            onChange={(e) => setEmpleadoId(e.target.value)}
          >
            <option value="">Selecciona un empleado</option>
            {listaEmpleados.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta" htmlFor="fecha">
            Fecha
          </label>
          <input
            id="fecha"
            type="date"
            className="campo"
            value={fecha}
            max={hoy()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      {ultimo && (
        <div
          role="status"
          className="rounded-lg border border-metal-200 bg-metal-50 p-3 text-sm font-medium text-metal-800"
        >
          {ultimo}
        </div>
      )}

      {/*
        Los botones se deshabilitan sin empleado en vez de esconderse: asi se ve
        que existen y queda claro que falta elegir a quien.
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        <BotonRegistro
          icono={ShoppingCart}
          texto="Ventas"
          ayuda="Con gasto del dia"
          onClick={() => setAbierto('venta')}
          deshabilitado={!empleadoId}
        />
        <BotonRegistro
          icono={HandCoins}
          texto="Cobro"
          ayuda="Con gasto del dia"
          onClick={() => setAbierto('cobro')}
          deshabilitado={!empleadoId}
        />
        <BotonRegistro
          icono={Receipt}
          texto="Solo gasto"
          ayuda="Sin venta ni cobro"
          onClick={() => setAbierto('gasto')}
          deshabilitado={!empleadoId}
        />
      </div>

      {!empleadoId && (
        <p className="text-center text-sm text-slate-500">
          Elige un empleado para empezar a registrar.
        </p>
      )}

      {abierto && (
        <Modal titulo={TITULOS[abierto]} onCerrar={() => cerrar()}>
          <p className="-mt-2 mb-4 text-sm text-slate-500">
            {empleado?.nombre} · {fecha}
          </p>

          {abierto === 'venta' && (
            <FormularioVenta
              empleadoId={empleadoId}
              municipioId={municipioId}
              setMunicipioId={setMunicipioId}
              fecha={fecha}
              empleadoNombre={empleado?.nombre}
              municipios={municipios.data ?? []}
              tarifaVenta={empleado?.tarifaVenta ?? 6000}
              tarifaLiquidacion={empleado?.tarifaLiquidacion ?? 5000}
              onListo={cerrar}
            />
          )}

          {abierto === 'cobro' && (
            <FormularioCobro
              empleadoId={empleadoId}
              municipioId={municipioId}
              setMunicipioId={setMunicipioId}
              fecha={fecha}
              empleadoNombre={empleado?.nombre}
              municipios={municipios.data ?? []}
              porcentaje={empleado?.porcentajeCobro ?? 10}
              onListo={cerrar}
            />
          )}

          {abierto === 'gasto' && (
            <FormularioGasto
              empleadoId={empleadoId}
              municipioId={municipioId}
              fecha={fecha}
              empleadoNombre={empleado?.nombre}
              onListo={cerrar}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function BotonRegistro({
  icono: Icono,
  texto,
  ayuda,
  onClick,
  deshabilitado,
}: {
  icono: typeof ShoppingCart;
  texto: string;
  ayuda: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-5
        text-center transition hover:border-metal-300 hover:bg-metal-50
        disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200
        disabled:hover:bg-white"
    >
      <Icono size={24} className="text-metal-600" />
      <span className="text-sm font-semibold text-slate-900">{texto}</span>
      <span className="text-xs text-slate-500">{ayuda}</span>
    </button>
  );
}
