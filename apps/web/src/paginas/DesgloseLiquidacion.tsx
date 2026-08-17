import { formatearPesos, type LiquidacionNomina } from '@credito/shared';
import { Dinero } from '../componentes/base.js';

function Linea({
  texto,
  detalle,
  monto,
  tipo,
  sangria,
}: {
  texto: string;
  detalle?: string;
  monto: number;
  tipo?: 'ingreso' | 'egreso' | 'neutro';
  sangria?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${sangria ? 'pl-4' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm text-slate-700">{texto}</p>
        {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
      </div>
      <Dinero valor={monto} tipo={tipo} />
    </div>
  );
}

/**
 * Desglose de la liquidacion.
 *
 * Muestra de donde sale cada peso, no solo el total. Sirve para dos cosas:
 * revisar antes de pagar, y poder explicarle al empleado como se calculo su
 * pago si pregunta.
 */
export function DesgloseLiquidacion({ liquidacion }: { liquidacion: LiquidacionNomina }) {
  const { ventas, cobros, bonos, deducciones } = liquidacion;

  return (
    <div className="tarjeta">
      <h2 className="mb-1 font-semibold">{liquidacion.empleadoNombre}</h2>

      {liquidacion.advertencias.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ul className="space-y-1">
            {liquidacion.advertencias.map((aviso, indice) => (
              <li key={indice}>{aviso}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {ventas.cantidad > 0 && (
          <div className="py-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Ventas</p>
            <Linea
              texto={`${ventas.cantidad} ventas`}
              detalle={`Genero ${formatearPesos(ventas.devengado)} en total`}
              monto={ventas.liquidado}
              tipo="ingreso"
            />
            {ventas.ahorroRetenido > 0 && (
              <Linea
                texto="Retenido al ahorro"
                detalle="Se entrega cada 3 meses, no entra a este pago"
                monto={ventas.ahorroRetenido}
                sangria
              />
            )}
          </div>
        )}

        {cobros.registros > 0 && (
          <div className="py-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cobros</p>
            <Linea
              texto="Comision de cobros"
              detalle={`Sobre ${formatearPesos(cobros.totalRecaudado)} recaudados`}
              monto={cobros.comision}
              tipo="ingreso"
            />
          </div>
        )}

        {bonos.detalles.length > 0 && (
          <div className="py-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Bonos por meta
            </p>
            {bonos.detalles.map((bono) => (
              <Linea
                key={bono.municipioId}
                texto={bono.municipioNombre}
                detalle={
                  bono.baseBono === 'excedente'
                    ? `Recaudo ${formatearPesos(bono.totalRecaudado)} en el mes, meta ${formatearPesos(bono.metaRecaudo)}. El ${bono.porcentajeAplicado}% sobre el excedente de ${formatearPesos(bono.excedente)}`
                    : `Recaudo ${formatearPesos(bono.totalRecaudado)}, supero la meta. El ${bono.porcentajeAplicado}% sobre el total`
                }
                monto={bono.bono}
                tipo="ingreso"
              />
            ))}
          </div>
        )}

        {(deducciones.total > 0 || deducciones.asumidosPorNegocio > 0) && (
          <div className="py-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Gastos</p>
            {deducciones.total > 0 && (
              <Linea
                texto={`Se le descuentan ${deducciones.registros} gastos`}
                monto={-deducciones.total}
                tipo="egreso"
              />
            )}
            {deducciones.asumidosPorNegocio > 0 && (
              <Linea
                texto="Gastos que asume el negocio"
                detalle="No se le descuentan al empleado"
                monto={deducciones.asumidosPorNegocio}
                sangria
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 border-t-2 border-slate-200 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-600">Total bruto</span>
          <Dinero valor={liquidacion.totalBruto} />
        </div>

        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Neto a pagar</span>
          <Dinero valor={liquidacion.netoAPagar} tamano="grande" />
        </div>

        {liquidacion.ahorroRetenido > 0 && (
          <p className="rounded-lg bg-blue-50 p-2.5 text-xs text-blue-900">
            Ademas se le acumulan{' '}
            <span className="font-semibold">{formatearPesos(liquidacion.ahorroRetenido)}</span> al
            ahorro, que se entregan cada 3 meses.
          </p>
        )}

        {liquidacion.quedaSaldoEnContra && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
            Los gastos superan lo que gano: no se puede pagar esta liquidacion. Revisa los gastos
            del periodo.
          </p>
        )}
      </div>
    </div>
  );
}
