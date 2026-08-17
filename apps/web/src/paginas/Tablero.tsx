import { Link } from 'react-router-dom';
import {
  PlusCircle,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Wallet,
  Package,
  ChevronRight,
} from 'lucide-react';
import { formatearPesos } from '@credito/shared';
import { useBalance, useEmpleados, useVentas, useCobros } from '../api/hooks.js';
import { Cargando, Dinero, TarjetaDato } from '../componentes/base.js';
import { mesActual, quincenaActual, describirPeriodo } from '../utilidades/fechas.js';

/** Resumen del mes y accesos rapidos. */
export function Tablero() {
  const mes = mesActual();
  const quincena = quincenaActual();

  const balance = useBalance(mes);
  const empleados = useEmpleados();
  const ventas = useVentas({ desde: quincena.desde, hasta: quincena.hasta });
  const cobros = useCobros({ desde: quincena.desde, hasta: quincena.hasta });

  const totalVentas = ventas.data?.reduce((suma, venta) => suma + venta.cantidad, 0) ?? 0;
  const totalRecaudado = cobros.data?.reduce((suma, cobro) => suma + cobro.montoRecaudado, 0) ?? 0;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Quincena del {describirPeriodo(quincena)}</p>

      <Link
        to="/registrar"
        className="flex items-center justify-between rounded-2xl bg-metal-600 p-5 text-white shadow-xs transition hover:bg-metal-700"
      >
        <span className="flex items-center gap-3">
          <PlusCircle size={22} />
          <span className="font-semibold">Registrar ventas o cobros</span>
        </span>
        <ChevronRight size={20} className="text-metal-200" />
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        <TarjetaDato etiqueta="Ventas de la quincena" icono={ShoppingBag}>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{totalVentas}</p>
        </TarjetaDato>

        <TarjetaDato etiqueta="Recaudado" icono={TrendingUp} tono="ingreso">
          <Dinero valor={totalRecaudado} tamano="grande" />
        </TarjetaDato>
      </div>

      {balance.isLoading ? (
        <Cargando texto="Calculando balance del mes" />
      ) : (
        balance.data && (
          <Link to="/caja" className="block">
            <div className="tarjeta transition hover:border-slate-300">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                    Balance del mes
                  </p>
                  <p className="mt-2">
                    <Dinero valor={balance.data.balance} tamano="grande" />
                  </p>
                </div>
                <ChevronRight size={18} className="mt-1 text-slate-300" />
              </div>

              <div className="mt-4 flex gap-5 border-t border-slate-100 pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <TrendingUp size={14} className="text-metal-600" />
                  {formatearPesos(balance.data.ingresos)}
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <TrendingDown size={14} className="text-red-600" />
                  {formatearPesos(balance.data.egresos)}
                </span>
              </div>
            </div>
          </Link>
        )
      )}

      <div className="tarjeta">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Empleados</h2>
          <Link to="/empleados" className="text-sm font-medium text-metal-700 hover:underline">
            Ver todos
          </Link>
        </div>

        {empleados.isLoading && <Cargando />}
        {empleados.data?.length === 0 && (
          <p className="py-3 text-sm text-slate-500">
            Todavia no hay empleados.{' '}
            <Link to="/empleados" className="font-medium text-metal-700 hover:underline">
              Agregar el primero
            </Link>
          </p>
        )}

        <div className="divide-y divide-slate-100">
          {empleados.data?.slice(0, 5).map((empleado) => (
            <div key={empleado.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm font-medium text-slate-800">{empleado.nombre}</span>
              <span className="text-xs text-slate-500">
                {formatearPesos(empleado.tarifaLiquidacion)} por venta
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { ruta: '/nomina', texto: 'Liquidar nomina', icono: Wallet },
          { ruta: '/productos', texto: 'Catalogo', icono: Package },
        ].map((atajo) => (
          <Link
            key={atajo.ruta}
            to={atajo.ruta}
            className="tarjeta flex items-center gap-3 transition hover:border-slate-300"
          >
            <atajo.icono size={18} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-800">{atajo.texto}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
