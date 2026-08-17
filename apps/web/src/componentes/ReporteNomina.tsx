import { useState } from 'react';
import { FileText, Share2 } from 'lucide-react';
import { formatearPesos, type LiquidacionNomina } from '@credito/shared';
import { useReporteNomina, useTextoCompartirReporte } from '../api/hooks.js';
import { Cargando, Vacio, Aviso, Dinero, TarjetaDato, Boton, Nota } from './base.js';
import { compartirReporte, esCancelacion } from '../utilidades/compartir.js';
import { hoy, mesActual } from '../utilidades/fechas.js';

/**
 * Cuanto se le debe a cada empleado en un rango de fechas.
 *
 * No reemplaza la liquidacion (esa sigue siendo por empleado, en la pestana
 * de Liquidar): esto es para ver de un vistazo, antes de ponerse a liquidar
 * a cada uno, cuanto hay que tener listo en total y como se reparte.
 */
export function ReporteNomina() {
  const [desde, setDesde] = useState(() => mesActual().desde);
  const [hasta, setHasta] = useState(() => hoy());

  const reporte = useReporteNomina({ desde, hasta });
  const empleados = reporte.data?.empleados ?? [];

  const compartir = useTextoCompartirReporte({ desde, hasta });
  const [compartiendo, setCompartiendo] = useState(false);
  const [errorCompartir, setErrorCompartir] = useState<unknown>(null);
  const [avisoDescarga, setAvisoDescarga] = useState(false);

  const urlPdf = `/api/nomina/reporte.pdf?desde=${desde}&hasta=${hasta}`;

  async function compartirPorWhatsapp() {
    if (!compartir.data) return;
    setErrorCompartir(null);
    setCompartiendo(true);
    try {
      const { seDescargo } = await compartirReporte({ desde, hasta, texto: compartir.data.texto });
      setAvisoDescarga(seDescargo);
    } catch (err) {
      if (esCancelacion(err)) return;
      setErrorCompartir(err);
    } finally {
      setCompartiendo(false);
    }
  }

  const totalNeto = empleados.reduce((suma, l) => suma + l.netoAPagar, 0);
  const totalVentas = empleados.reduce((suma, l) => suma + l.ventas.cantidad, 0);
  const totalRecaudado = empleados.reduce((suma, l) => suma + l.cobros.totalRecaudado, 0);
  const totalGastos = empleados.reduce((suma, l) => suma + l.deducciones.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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

      {reporte.isLoading && <Cargando texto="Calculando el reporte" />}
      <Aviso error={reporte.error} />

      {reporte.data && empleados.length === 0 && (
        <Vacio>No hay ventas, cobros ni gastos en este rango.</Vacio>
      )}

      {empleados.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TarjetaDato etiqueta="Total a pagar">
              <Dinero valor={totalNeto} tamano="grande" />
              <p className="mt-1 text-xs text-slate-500">
                Entre {empleados.length} {empleados.length === 1 ? 'empleado' : 'empleados'}
              </p>
            </TarjetaDato>

            <TarjetaDato etiqueta="Movimiento del rango">
              <p className="text-sm text-slate-700">
                {totalVentas} {totalVentas === 1 ? 'venta' : 'ventas'} ·{' '}
                {formatearPesos(totalRecaudado)} recaudado
              </p>
              {totalGastos > 0 && (
                <p className="mt-0.5 text-xs text-red-600">
                  -{formatearPesos(totalGastos)} en gastos deducibles
                </p>
              )}
            </TarjetaDato>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={urlPdf}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200
                bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs
                transition hover:bg-slate-50"
            >
              <FileText size={16} />
              Ver o descargar el PDF
            </a>

            <Boton
              icono={Share2}
              onClick={compartirPorWhatsapp}
              cargando={compartiendo}
              deshabilitado={!compartir.data}
            >
              Compartir por WhatsApp
            </Boton>
          </div>

          {avisoDescarga && (
            <Nota>
              El PDF se descargo a tu dispositivo. Adjuntalo en la conversacion de WhatsApp que se abrio,
              junto con el mensaje ya escrito.
            </Nota>
          )}

          <Aviso error={errorCompartir} />

          <div className="tarjeta">
            <h2 className="mb-3 font-semibold text-slate-900">Por empleado</h2>
            <div className="divide-y divide-slate-100">
              {empleados.map((liquidacion) => (
                <FilaEmpleado key={liquidacion.empleadoId} liquidacion={liquidacion} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilaEmpleado({ liquidacion }: { liquidacion: LiquidacionNomina }) {
  const { ventas, cobros, deducciones } = liquidacion;

  const partes: string[] = [];
  if (ventas.cantidad > 0) partes.push(`${ventas.cantidad} ${ventas.cantidad === 1 ? 'venta' : 'ventas'}`);
  if (cobros.registros > 0) partes.push(`${formatearPesos(cobros.totalRecaudado)} recaudados`);

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{liquidacion.empleadoNombre}</p>
        <p className="text-xs text-slate-500">
          {partes.length > 0 ? partes.join(' · ') : 'Sin ventas ni cobros'}
          {deducciones.total > 0 && ` · -${formatearPesos(deducciones.total)} en gastos`}
        </p>
      </div>
      <Dinero
        valor={liquidacion.netoAPagar}
        tipo={liquidacion.quedaSaldoEnContra ? 'egreso' : 'ingreso'}
      />
    </div>
  );
}
