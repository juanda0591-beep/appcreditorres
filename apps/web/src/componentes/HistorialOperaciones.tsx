import { useMemo, useState } from 'react';
import { MapPin, Pencil, Trash2 } from 'lucide-react';
import {
  formatearPesos,
  devengadoDeVenta,
  ahorroDeVenta,
  comisionDeCobro,
  type RegistroVenta,
  type RegistroCobro,
  type GastoEmpleado,
} from '@credito/shared';
import { useEmpleados, useMunicipios, useVentas, useCobros, useGastos, useBorrarOperacion } from '../api/hooks.js';
import { Cargando, Vacio, Aviso, Dinero, Modal } from './base.js';
import { fechaCorta } from '../utilidades/fechas.js';
import { FormularioVenta, FormularioCobro, FormularioGasto } from '../paginas/formularios.js';
import { confirmar } from '../utilidades/alertas.js';
import { toast } from 'sonner';

const SIN_MUNICIPIO = 'sin-municipio';

/** Filtros comunes a ambos historiales: empleado, municipio y rango de fechas. */
function FiltrosHistorial({
  empleadoId,
  setEmpleadoId,
  municipioId,
  setMunicipioId,
  desde,
  setDesde,
  hasta,
  setHasta,
}: {
  empleadoId: string;
  setEmpleadoId: (valor: string) => void;
  municipioId: string;
  setMunicipioId: (valor: string) => void;
  desde: string;
  setDesde: (valor: string) => void;
  hasta: string;
  setHasta: (valor: string) => void;
}) {
  const empleados = useEmpleados();
  const municipios = useMunicipios();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="campo w-auto"
        value={empleadoId}
        onChange={(e) => setEmpleadoId(e.target.value)}
        aria-label="Filtrar por empleado"
      >
        <option value="">Todos los empleados</option>
        {(empleados.data ?? []).map((empleado) => (
          <option key={empleado.id} value={empleado.id}>
            {empleado.nombre}
          </option>
        ))}
      </select>

      <select
        className="campo w-auto"
        value={municipioId}
        onChange={(e) => setMunicipioId(e.target.value)}
        aria-label="Filtrar por municipio"
      >
        <option value="">Todos los municipios</option>
        {(municipios.data ?? []).map((municipio) => (
          <option key={municipio.id} value={municipio.id}>
            {municipio.nombre}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <input
          type="date"
          className="campo w-auto"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          aria-label="Desde"
        />
        <span className="text-sm text-slate-400">—</span>
        <input
          type="date"
          className="campo w-auto"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          aria-label="Hasta"
        />
      </div>
    </div>
  );
}

/** Nombre del municipio de un registro, o "Sin municipio" para ventas sueltas. */
function nombreMunicipio(
  municipioId: string | null,
  municipios: Array<{ id: string; nombre: string }>,
): string {
  if (!municipioId) return 'Sin municipio';
  return municipios.find((m) => m.id === municipioId)?.nombre ?? 'Municipio eliminado';
}

export function HistorialVentas() {
  const [empleadoId, setEmpleadoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [ventaEditar, setVentaEditar] = useState<RegistroVenta | null>(null);

  const empleados = useEmpleados();
  const municipios = useMunicipios();
  const ventas = useVentas({
    empleadoId: empleadoId || undefined,
    municipioId: municipioId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  const borrarVenta = useBorrarOperacion('ventas');

  const porMunicipio = useMemo(() => {
    if (!ventas.data) return [];
    const grupos = new Map<
      string,
      { clave: string; nombre: string; cantidad: number; devengado: number; ahorro: number }
    >();

    for (const venta of ventas.data) {
      const clave = venta.municipioId ?? SIN_MUNICIPIO;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave,
          nombre: nombreMunicipio(venta.municipioId, municipios.data ?? []),
          cantidad: 0,
          devengado: 0,
          ahorro: 0,
        });
      }
      const grupo = grupos.get(clave)!;
      grupo.cantidad += venta.cantidad;
      grupo.devengado += devengadoDeVenta(venta);
      grupo.ahorro += ahorroDeVenta(venta);
    }

    return Array.from(grupos.values()).sort((a, b) => b.devengado - a.devengado);
  }, [ventas.data, municipios.data]);

  function nombreEmpleado(empleadoId: string): string {
    return empleados.data?.find((e) => e.id === empleadoId)?.nombre ?? 'Empleado eliminado';
  }

  async function manejarBorrar(venta: RegistroVenta) {
    const seguro = await confirmar({
      titulo: '¿Borrar esta venta?',
      resumen: [
        { rotulo: 'Fecha', valor: fechaCorta(venta.fecha) },
        { rotulo: 'Empleado', valor: nombreEmpleado(venta.empleadoId) },
        { rotulo: 'Cantidad', valor: `${venta.cantidad} ventas` },
        { rotulo: 'Devengado', valor: formatearPesos(devengadoDeVenta(venta)) },
      ],
      confirmar: 'Borrar venta',
    });
    if (!seguro) return;

    await borrarVenta.mutateAsync(venta.id);
    toast.success('Venta borrada');
  }

  return (
    <div className="space-y-4">
      <FiltrosHistorial
        empleadoId={empleadoId}
        setEmpleadoId={setEmpleadoId}
        municipioId={municipioId}
        setMunicipioId={setMunicipioId}
        desde={desde}
        setDesde={setDesde}
        hasta={hasta}
        setHasta={setHasta}
      />

      {ventas.isLoading && <Cargando texto="Cargando ventas" />}
      <Aviso error={ventas.error} />

      {ventas.data?.length === 0 && <Vacio>No hay ventas en este rango.</Vacio>}

      {porMunicipio.length > 0 && (
        <div className="tarjeta">
          <h2 className="mb-3 font-semibold text-slate-900">Por municipio</h2>
          <div className="divide-y divide-slate-100">
            {porMunicipio.map((grupo) => (
              <div key={grupo.clave} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-800">
                  <MapPin size={14} className="text-slate-400" />
                  {grupo.nombre}
                  <span className="pastilla bg-slate-100 text-slate-600">
                    {grupo.cantidad} {grupo.cantidad === 1 ? 'venta' : 'ventas'}
                  </span>
                </span>
                <div className="text-right">
                  <Dinero valor={grupo.devengado} tipo="ingreso" />
                  {grupo.ahorro > 0 && (
                    <p className="text-xs text-blue-600">
                      +{formatearPesos(grupo.ahorro)} a ahorro
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ventas.data && ventas.data.length > 0 && (
        <TablaVentas
          ventas={ventas.data}
          municipios={municipios.data ?? []}
          nombreEmpleado={nombreEmpleado}
          onEditar={setVentaEditar}
          onBorrar={manejarBorrar}
        />
      )}

      {ventaEditar && (
        <Modal
          titulo="Editar venta"
          onCerrar={() => setVentaEditar(null)}
          ancho="amplio"
        >
          <FormularioVenta
            inicial={ventaEditar}
            empleadoId={ventaEditar.empleadoId}
            municipioId={ventaEditar.municipioId ?? ''}
            fecha={ventaEditar.fecha}
            empleadoNombre={nombreEmpleado(ventaEditar.empleadoId)}
            municipios={municipios.data ?? []}
            onExito={() => {
              setVentaEditar(null);
              toast.success('Venta actualizada');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function TablaVentas({
  ventas,
  municipios,
  nombreEmpleado,
  onEditar,
  onBorrar,
}: {
  ventas: RegistroVenta[];
  municipios: Array<{ id: string; nombre: string }>;
  nombreEmpleado: (id: string) => string;
  onEditar: (venta: RegistroVenta) => void;
  onBorrar: (venta: RegistroVenta) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-lg border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <th scope="col" className="px-3 py-2">Fecha</th>
            <th scope="col" className="px-3 py-2">Empleado</th>
            <th scope="col" className="px-3 py-2">Municipio</th>
            <th scope="col" className="px-3 py-2 text-right">Cantidad</th>
            <th scope="col" className="px-3 py-2 text-right">Devengado</th>
            <th scope="col" className="px-3 py-2 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((venta, indice) => (
            <tr
              key={venta.id}
              className={`border-t border-slate-100 ${indice % 2 === 1 ? 'bg-slate-50/60' : ''}`}
            >
              <td className="px-3 py-2 text-slate-600">{fechaCorta(venta.fecha)}</td>
              <td className="px-3 py-2 font-medium text-slate-900">{nombreEmpleado(venta.empleadoId)}</td>
              <td className="px-3 py-2 text-slate-600">{nombreMunicipio(venta.municipioId, municipios)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{venta.cantidad}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatearPesos(devengadoDeVenta(venta))}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEditar(venta)}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    title="Editar venta"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onBorrar(venta)}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Borrar venta"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistorialCobros() {
  const [empleadoId, setEmpleadoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cobroEditar, setCobroEditar] = useState<RegistroCobro | null>(null);

  const empleados = useEmpleados();
  const municipios = useMunicipios();
  const cobros = useCobros({
    empleadoId: empleadoId || undefined,
    municipioId: municipioId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  const borrarCobro = useBorrarOperacion('cobros');

  const porMunicipio = useMemo(() => {
    if (!cobros.data) return [];
    const grupos = new Map<
      string,
      { clave: string; nombre: string; recaudado: number; comision: number }
    >();

    for (const cobro of cobros.data) {
      const clave = cobro.municipioId;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave,
          nombre: nombreMunicipio(cobro.municipioId, municipios.data ?? []),
          recaudado: 0,
          comision: 0,
        });
      }
      const grupo = grupos.get(clave)!;
      grupo.recaudado += cobro.montoRecaudado;
      grupo.comision += comisionDeCobro(cobro);
    }

    return Array.from(grupos.values()).sort((a, b) => b.recaudado - a.recaudado);
  }, [cobros.data, municipios.data]);

  function nombreEmpleado(empleadoId: string): string {
    return empleados.data?.find((e) => e.id === empleadoId)?.nombre ?? 'Empleado eliminado';
  }

  async function manejarBorrar(cobro: RegistroCobro) {
    const seguro = await confirmar({
      titulo: '¿Borrar este cobro?',
      resumen: [
        { rotulo: 'Fecha', valor: fechaCorta(cobro.fecha) },
        { rotulo: 'Empleado', valor: nombreEmpleado(cobro.empleadoId) },
        { rotulo: 'Recaudado', valor: formatearPesos(cobro.montoRecaudado) },
        { rotulo: 'Comisión', valor: formatearPesos(comisionDeCobro(cobro)) },
      ],
      confirmar: 'Borrar cobro',
    });
    if (!seguro) return;

    await borrarCobro.mutateAsync(cobro.id);
    toast.success('Cobro borrado');
  }

  return (
    <div className="space-y-4">
      <FiltrosHistorial
        empleadoId={empleadoId}
        setEmpleadoId={setEmpleadoId}
        municipioId={municipioId}
        setMunicipioId={setMunicipioId}
        desde={desde}
        setDesde={setDesde}
        hasta={hasta}
        setHasta={setHasta}
      />

      {cobros.isLoading && <Cargando texto="Cargando cobros" />}
      <Aviso error={cobros.error} />

      {cobros.data?.length === 0 && <Vacio>No hay cobros en este rango.</Vacio>}

      {porMunicipio.length > 0 && (
        <div className="tarjeta">
          <h2 className="mb-3 font-semibold text-slate-900">Por municipio</h2>
          <div className="divide-y divide-slate-100">
            {porMunicipio.map((grupo) => (
              <div key={grupo.clave} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-800">
                  <MapPin size={14} className="text-slate-400" />
                  {grupo.nombre}
                </span>
                <div className="text-right">
                  <Dinero valor={grupo.recaudado} tipo="ingreso" />
                  <p className="text-xs text-slate-500">
                    {formatearPesos(grupo.comision)} de comision
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cobros.data && cobros.data.length > 0 && (
        <TablaCobros
          cobros={cobros.data}
          municipios={municipios.data ?? []}
          nombreEmpleado={nombreEmpleado}
          onEditar={setCobroEditar}
          onBorrar={manejarBorrar}
        />
      )}

      {cobroEditar && (
        <Modal
          titulo="Editar cobro"
          onCerrar={() => setCobroEditar(null)}
          ancho="amplio"
        >
          <FormularioCobro
            inicial={cobroEditar}
            empleadoId={cobroEditar.empleadoId}
            municipioId={cobroEditar.municipioId}
            fecha={cobroEditar.fecha}
            empleadoNombre={nombreEmpleado(cobroEditar.empleadoId)}
            municipios={municipios.data ?? []}
            onExito={() => {
              setCobroEditar(null);
              toast.success('Cobro actualizado');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function TablaCobros({
  cobros,
  municipios,
  nombreEmpleado,
  onEditar,
  onBorrar,
}: {
  cobros: RegistroCobro[];
  municipios: Array<{ id: string; nombre: string }>;
  nombreEmpleado: (id: string) => string;
  onEditar: (cobro: RegistroCobro) => void;
  onBorrar: (cobro: RegistroCobro) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-lg border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <th scope="col" className="px-3 py-2">Fecha</th>
            <th scope="col" className="px-3 py-2">Empleado</th>
            <th scope="col" className="px-3 py-2">Municipio</th>
            <th scope="col" className="px-3 py-2 text-right">Recaudado</th>
            <th scope="col" className="px-3 py-2 text-right">Comision</th>
            <th scope="col" className="px-3 py-2 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cobros.map((cobro, indice) => (
            <tr
              key={cobro.id}
              className={`border-t border-slate-100 ${indice % 2 === 1 ? 'bg-slate-50/60' : ''}`}
            >
              <td className="px-3 py-2 text-slate-600">{fechaCorta(cobro.fecha)}</td>
              <td className="px-3 py-2 font-medium text-slate-900">{nombreEmpleado(cobro.empleadoId)}</td>
              <td className="px-3 py-2 text-slate-600">{nombreMunicipio(cobro.municipioId, municipios)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatearPesos(cobro.montoRecaudado)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                {formatearPesos(comisionDeCobro(cobro))}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEditar(cobro)}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    title="Editar cobro"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onBorrar(cobro)}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Borrar cobro"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistorialGastos() {
  const [empleadoId, setEmpleadoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [gastoEditar, setGastoEditar] = useState<GastoEmpleado | null>(null);

  const empleados = useEmpleados();
  const municipios = useMunicipios();
  const gastos = useGastos({
    empleadoId: empleadoId || undefined,
    municipioId: municipioId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  const borrarGasto = useBorrarOperacion('gastos');

  function nombreEmpleado(empleadoId: string): string {
    return empleados.data?.find((e) => e.id === empleadoId)?.nombre ?? 'Empleado eliminado';
  }

  async function manejarBorrar(gasto: GastoEmpleado) {
    const seguro = await confirmar({
      titulo: '¿Borrar este gasto?',
      resumen: [
        { rotulo: 'Fecha', valor: fechaCorta(gasto.fecha) },
        { rotulo: 'Empleado', valor: nombreEmpleado(gasto.empleadoId) },
        { rotulo: 'Concepto', valor: gasto.concepto },
        { rotulo: 'Monto', valor: formatearPesos(gasto.monto) },
        { rotulo: 'Deducible', valor: gasto.deducible ? 'Sí' : 'No (lo asume el negocio)' },
      ],
      confirmar: 'Borrar gasto',
    });
    if (!seguro) return;

    await borrarGasto.mutateAsync(gasto.id);
    toast.success('Gasto borrado');
  }

  const totalDeducible = useMemo(() => {
    if (!gastos.data) return 0;
    return gastos.data.filter(g => g.deducible).reduce((sum, g) => sum + g.monto, 0);
  }, [gastos.data]);

  const totalNoDeducible = useMemo(() => {
    if (!gastos.data) return 0;
    return gastos.data.filter(g => !g.deducible).reduce((sum, g) => sum + g.monto, 0);
  }, [gastos.data]);

  return (
    <div className="space-y-4">
      <FiltrosHistorial
        empleadoId={empleadoId}
        setEmpleadoId={setEmpleadoId}
        municipioId={municipioId}
        setMunicipioId={setMunicipioId}
        desde={desde}
        setDesde={setDesde}
        hasta={hasta}
        setHasta={setHasta}
      />

      {gastos.isLoading && <Cargando texto="Cargando gastos" />}
      <Aviso error={gastos.error} />

      {gastos.data?.length === 0 && <Vacio>No hay gastos en este rango.</Vacio>}

      {gastos.data && gastos.data.length > 0 && (
        <>
          <div className="tarjeta">
            <h2 className="mb-3 font-semibold text-slate-900">Resumen</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Gastos deducibles (descontados al empleado):</span>
                <span className="font-semibold text-red-700">{formatearPesos(totalDeducible)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Gastos no deducibles (asumidos por el negocio):</span>
                <span className="font-semibold text-slate-700">{formatearPesos(totalNoDeducible)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-900">Total de gastos:</span>
                <span className="font-bold text-slate-900">{formatearPesos(totalDeducible + totalNoDeducible)}</span>
              </div>
            </div>
          </div>

          <TablaGastos
            gastos={gastos.data}
            municipios={municipios.data ?? []}
            nombreEmpleado={nombreEmpleado}
            onEditar={setGastoEditar}
            onBorrar={manejarBorrar}
          />
        </>
      )}

      {gastoEditar && (
        <Modal
          titulo="Editar gasto"
          onCerrar={() => setGastoEditar(null)}
          ancho="amplio"
        >
          <FormularioGasto
            inicial={gastoEditar}
            empleadoId={gastoEditar.empleadoId}
            municipioId={gastoEditar.municipioId ?? ''}
            fecha={gastoEditar.fecha}
            empleadoNombre={nombreEmpleado(gastoEditar.empleadoId)}
            onExito={() => {
              setGastoEditar(null);
              toast.success('Gasto actualizado');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function TablaGastos({
  gastos,
  municipios,
  nombreEmpleado,
  onEditar,
  onBorrar,
}: {
  gastos: GastoEmpleado[];
  municipios: Array<{ id: string; nombre: string }>;
  nombreEmpleado: (id: string) => string;
  onEditar: (gasto: GastoEmpleado) => void;
  onBorrar: (gasto: GastoEmpleado) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-lg border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <th scope="col" className="px-3 py-2">Fecha</th>
            <th scope="col" className="px-3 py-2">Empleado</th>
            <th scope="col" className="px-3 py-2">Municipio</th>
            <th scope="col" className="px-3 py-2">Concepto</th>
            <th scope="col" className="px-3 py-2 text-right">Monto</th>
            <th scope="col" className="px-3 py-2 text-center">Tipo</th>
            <th scope="col" className="px-3 py-2 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((gasto, indice) => (
            <tr
              key={gasto.id}
              className={`border-t border-slate-100 ${indice % 2 === 1 ? 'bg-slate-50/60' : ''}`}
            >
              <td className="px-3 py-2 text-slate-600">{fechaCorta(gasto.fecha)}</td>
              <td className="px-3 py-2 font-medium text-slate-900">{nombreEmpleado(gasto.empleadoId)}</td>
              <td className="px-3 py-2 text-slate-600">{nombreMunicipio(gasto.municipioId, municipios)}</td>
              <td className="px-3 py-2 text-slate-700">{gasto.concepto}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatearPesos(gasto.monto)}
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`pastilla ${gasto.deducible ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                  {gasto.deducible ? 'Deducible' : 'No deducible'}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEditar(gasto)}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    title="Editar gasto"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onBorrar(gasto)}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Borrar gasto"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
