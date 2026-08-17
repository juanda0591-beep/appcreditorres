import { useState } from 'react';
import { formatearPesos } from '@credito/shared';
import { usePrestamo, useRegistrarPrestamo } from '../api/hooks.js';
import { Cargando, Boton, Aviso } from './base.js';
import { hoy } from '../utilidades/fechas.js';
import { avisar, avisarError } from '../utilidades/alertas.js';

/**
 * Componente para gestionar préstamos de un empleado.
 * Muestra el saldo actual, permite registrar nuevos préstamos y ver historial.
 */
export function Prestamos({ empleadoId }: { empleadoId: string }) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [concepto, setConcepto] = useState('');

  const prestamo = usePrestamo(empleadoId);
  const registrar = useRegistrarPrestamo();

  async function handleRegistrar(e: React.FormEvent) {
    e.preventDefault();

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      avisarError('El monto debe ser mayor a 0');
      return;
    }

    try {
      await registrar.mutateAsync({
        empleadoId,
        monto: montoNum,
        fecha,
        concepto: concepto.trim() || undefined,
      });

      avisar('Préstamo registrado');
      setMostrarFormulario(false);
      setMonto('');
      setConcepto('');
      setFecha(hoy());
    } catch (error) {
      avisarError(error);
    }
  }

  if (prestamo.isLoading) {
    return <Cargando texto="Cargando préstamos" />;
  }

  const saldoActual = prestamo.data?.prestamo?.saldoActual ?? 0;
  const movimientos = prestamo.data?.movimientos ?? [];

  return (
    <div className="space-y-4">
      {/* Saldo actual */}
      <div className="tarjeta">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">Saldo pendiente</p>
            <p className="text-2xl font-bold text-slate-900">{formatearPesos(saldoActual)}</p>
          </div>
          <Boton tipo="primario" onClick={() => setMostrarFormulario(!mostrarFormulario)}>
            {mostrarFormulario ? 'Cancelar' : 'Registrar préstamo'}
          </Boton>
        </div>
      </div>

      {/* Formulario para registrar préstamo */}
      {mostrarFormulario && (
        <form onSubmit={handleRegistrar} className="tarjeta space-y-3">
          <h3 className="font-semibold text-slate-900">Nuevo préstamo</h3>

          <Aviso error={registrar.error} />

          <div>
            <label className="etiqueta" htmlFor="monto-prestamo">
              Monto a prestar
            </label>
            <input
              id="monto-prestamo"
              type="number"
              className="campo"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              min="1"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="fecha-prestamo">
              Fecha
            </label>
            <input
              id="fecha-prestamo"
              type="date"
              className="campo"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="concepto-prestamo">
              Concepto (opcional)
            </label>
            <input
              id="concepto-prestamo"
              type="text"
              className="campo"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Motivo del préstamo"
            />
          </div>

          <div className="flex gap-2">
            <Boton submit cargando={registrar.isPending}>
              Registrar
            </Boton>
            <Boton tipo="secundario" onClick={() => setMostrarFormulario(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {/* Historial de movimientos */}
      {movimientos.length > 0 && (
        <div className="tarjeta">
          <h3 className="mb-3 font-semibold text-slate-900">Historial de movimientos</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2 text-right">Monto</th>
                  <th className="pb-2 text-right">Saldo</th>
                  <th className="pb-2">Concepto</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mov) => (
                  <tr key={mov.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-600">{mov.fecha}</td>
                    <td className="py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          mov.tipo === 'prestamo'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {mov.tipo === 'prestamo' ? 'Préstamo' : 'Abono'}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {formatearPesos(mov.monto)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {formatearPesos(mov.saldoNuevo)}
                    </td>
                    <td className="py-2 text-slate-500">{mov.concepto || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {movimientos.length === 0 && saldoActual === 0 && !mostrarFormulario && (
        <p className="text-center text-sm text-slate-500">
          Este empleado no tiene préstamos registrados.
        </p>
      )}
    </div>
  );
}
