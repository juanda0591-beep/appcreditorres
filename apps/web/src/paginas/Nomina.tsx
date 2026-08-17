import { useState } from 'react';
import { toast } from 'sonner';
import { cierraElMes, formatearPesos } from '@credito/shared';
import { useEmpleados, usePreviaLiquidacion, useConfirmarLiquidacion, usePrestamo } from '../api/hooks.js';
import { Aviso, Boton, Cargando, Vacio } from '../componentes/base.js';
import { Pestanas } from '../componentes/Pestanas.js';
import { HistorialNomina } from '../componentes/HistorialNomina.js';
import { ReporteNomina } from '../componentes/ReporteNomina.js';
import { ComprobantePago } from '../componentes/ComprobantePago.js';
import { confirmar as confirmarDialogo } from '../utilidades/alertas.js';
import { hoy, quincenaActual, quincenasDelMes, describirPeriodo } from '../utilidades/fechas.js';
import { DesgloseLiquidacion } from './DesgloseLiquidacion.js';

/**
 * Liquidacion de nomina.
 *
 * Siempre muestra el desglose completo antes de pagar. Es a proposito:
 * confirmar un pago mueve plata de verdad (registra el egreso en caja y la
 * retencion del ahorro), asi que no debe ser un boton que se presione sin ver
 * que se esta pagando.
 */
export function Nomina() {
  const [vista, setVista] = useState<'liquidar' | 'reporte' | 'historial'>('liquidar');

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Nomina</h1>

      <Pestanas
        valor={vista}
        onCambio={setVista}
        opciones={[
          ['liquidar', 'Liquidar'],
          ['reporte', 'Reporte'],
          ['historial', 'Historial de pagos'],
        ]}
      />

      {vista === 'liquidar' && <Liquidar />}
      {vista === 'reporte' && <ReporteNomina />}
      {vista === 'historial' && <HistorialNomina />}
    </div>
  );
}

function Liquidar() {
  const [empleadoId, setEmpleadoId] = useState('');
  const [mes, setMes] = useState(() => hoy().slice(0, 7));
  const [indiceQuincena, setIndiceQuincena] = useState(() =>
    Number(hoy().slice(8, 10)) <= 15 ? 0 : 1,
  );
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [verComprobante, setVerComprobante] = useState(false);
  const [abonoPrestamo, setAbonoPrestamo] = useState<number | null>(null);

  const empleados = useEmpleados();
  const quincenas = quincenasDelMes(mes);
  const periodo = quincenas[indiceQuincena] ?? quincenaActual();

  const previa = usePreviaLiquidacion(empleadoId || null, periodo);
  const prestamo = usePrestamo(empleadoId || null);
  const confirmar = useConfirmarLiquidacion();

  const listaEmpleados = empleados.data ?? [];
  const cierra = cierraElMes(periodo);
  const saldoPrestamo = prestamo.data?.prestamo?.saldoActual ?? 0;
  const tienePrestamo = saldoPrestamo > 0;

  // Calcular el neto después del abono
  const netoConAbono = (previa.data?.netoAPagar ?? 0) - (abonoPrestamo ?? 0);

  // Validar que el abono no exceda el saldo del préstamo ni el neto a pagar
  const montoMaximoAbono = Math.min(saldoPrestamo, previa.data?.netoAPagar ?? 0);
  const abonoInvalido = abonoPrestamo !== null && abonoPrestamo > montoMaximoAbono;
  const campoObligatorioVacio = tienePrestamo && !confirmado && abonoPrestamo === null;

  async function pagar() {
    if (!empleadoId) return;

    const empleadoNombre = listaEmpleados.find((e) => e.id === empleadoId)?.nombre;
    const filas = [
      { rotulo: 'Empleado', valor: empleadoNombre ?? 'el seleccionado' },
      { rotulo: 'Periodo', valor: describirPeriodo(periodo) },
      { rotulo: 'Neto a pagar', valor: formatearPesos(netoConAbono), destacado: true },
    ];
    if (abonoPrestamo !== null && abonoPrestamo > 0) {
      filas.push({ rotulo: 'Abono al prestamo', valor: formatearPesos(abonoPrestamo) });
    }

    const seguro = await confirmarDialogo({
      titulo: 'Confirmar pago de la liquidacion?',
      resumen: filas,
      confirmar: 'Confirmar pago',
    });
    if (!seguro) return;

    const resultado = await confirmar.mutateAsync({
      empleadoId,
      periodo,
      abonoPrestamo: abonoPrestamo !== null && abonoPrestamo > 0 ? abonoPrestamo : undefined,
    });
    setConfirmado(resultado.id);
    setAbonoPrestamo(null);
    toast.success('Liquidacion pagada y registrada');
  }

  return (
    <div className="space-y-5">
      <div className="tarjeta space-y-3">
        <div>
          <label className="etiqueta" htmlFor="emp-nomina">
            Empleado
          </label>
          <select
            id="emp-nomina"
            className="campo"
            value={empleadoId}
            onChange={(e) => {
              setEmpleadoId(e.target.value);
              setConfirmado(null);
              setAbonoPrestamo(null);
            }}
          >
            <option value="">Selecciona un empleado</option>
            {listaEmpleados.map((empleado) => (
              <option key={empleado.id} value={empleado.id}>
                {empleado.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiqueta" htmlFor="mes">
              Mes
            </label>
            <input
              id="mes"
              type="month"
              className="campo"
              value={mes}
              onChange={(e) => {
                setMes(e.target.value);
                setConfirmado(null);
              }}
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="quincena">
              Quincena
            </label>
            <select
              id="quincena"
              className="campo"
              value={indiceQuincena}
              onChange={(e) => {
                setIndiceQuincena(Number(e.target.value));
                setConfirmado(null);
              }}
            >
              <option value={0}>Primera (1 al 15)</option>
              <option value={1}>Segunda (16 al fin)</option>
            </select>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Periodo: <span className="font-medium">{describirPeriodo(periodo)}</span>
        </p>

        {/*
          El aviso del bono importa: la meta de cada municipio es mensual, pero
          el pago es quincenal. Si no se explica, parece un error que la primera
          quincena no incluya bono.
        */}
        <div
          className={`rounded-lg p-3 text-sm ${
            cierra ? 'bg-metal-50 text-metal-900' : 'bg-blue-50 text-blue-900'
          }`}
        >
          {cierra ? (
            <>
              <span className="font-medium">Esta quincena cierra el mes.</span> Incluye los bonos
              por superar las metas de los municipios, calculados con los cobros de todo el mes.
            </>
          ) : (
            <>
              <span className="font-medium">Primera quincena.</span> No incluye bonos: las metas de
              municipio son mensuales y se pagan al cerrar el mes, para no pagarlas dos veces.
            </>
          )}
        </div>
      </div>

      {!empleadoId && <Vacio>Selecciona un empleado para ver su liquidacion.</Vacio>}

      {previa.isLoading && empleadoId && <Cargando texto="Calculando liquidacion" />}
      <Aviso error={previa.error} />

      {previa.data && (
        <>
          <DesgloseLiquidacion liquidacion={previa.data} />

          {/* Sección de préstamo si tiene saldo pendiente */}
          {saldoPrestamo > 0 && !confirmado && (
            <div className="tarjeta space-y-3">
              <h3 className="font-semibold text-slate-900">Préstamo pendiente</h3>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Saldo actual:</span>
                  <span className="font-semibold text-slate-900">
                    {formatearPesos(saldoPrestamo)}
                  </span>
                </div>

                <div>
                  <label className="etiqueta" htmlFor="abono-prestamo">
                    Abono esta quincena <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="abono-prestamo"
                    type="number"
                    className={`campo ${abonoInvalido || campoObligatorioVacio ? 'border-red-500' : ''}`}
                    value={abonoPrestamo ?? ''}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setAbonoPrestamo(valor === '' ? null : Number(valor));
                    }}
                    placeholder="Ingrese 0 si no abona"
                    min="0"
                    max={montoMaximoAbono}
                    required
                  />
                  {campoObligatorioVacio && (
                    <p className="mt-1 text-xs text-red-600">
                      Este campo es obligatorio. Ingrese 0 si no desea abonar.
                    </p>
                  )}
                  {abonoInvalido && (
                    <p className="mt-1 text-xs text-red-600">
                      El abono no puede ser mayor a {formatearPesos(montoMaximoAbono)}
                    </p>
                  )}
                  {!abonoInvalido && !campoObligatorioVacio && (
                    <p className="mt-1 text-xs text-slate-500">
                      Máximo: {formatearPesos(montoMaximoAbono)}
                    </p>
                  )}
                </div>

                {abonoPrestamo !== null && abonoPrestamo > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Saldo después del abono:</span>
                    <span className="font-semibold text-slate-900">
                      {formatearPesos(saldoPrestamo - abonoPrestamo)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="tarjeta space-y-3">
            <Aviso error={confirmar.error} />

            {confirmado ? (
              <div
                role="status"
                className="space-y-3 rounded-lg border border-metal-200 bg-metal-50 p-3 text-sm text-metal-900"
              >
                <div>
                  <p className="font-medium">Liquidacion pagada y registrada.</p>
                  <p className="mt-1">
                    Se registro el egreso en caja
                    {previa.data.ahorroRetenido > 0 && ' y la retencion del ahorro'}.
                  </p>
                </div>
                <Boton tipo="secundario" onClick={() => setVerComprobante(true)}>
                  Ver comprobante y compartir
                </Boton>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Al confirmar se registra el pago, el egreso en caja
                  {previa.data.ahorroRetenido > 0 && ' y la retencion del ahorro'}
                  {abonoPrestamo !== null && abonoPrestamo > 0 && ' y el abono al préstamo'}. Para deshacerlo hay que
                  anular la liquidacion.
                </p>
                {abonoPrestamo !== null && abonoPrestamo > 0 && netoConAbono < 0 && (
                  <p className="text-sm text-red-600">
                    El abono supera lo ganado. El empleado quedará debiendo{' '}
                    {formatearPesos(-netoConAbono)}.
                  </p>
                )}
                <Boton
                  onClick={pagar}
                  cargando={confirmar.isPending}
                  deshabilitado={
                    previa.data.quedaSaldoEnContra && (abonoPrestamo === null || abonoPrestamo === 0) ||
                    abonoInvalido ||
                    campoObligatorioVacio
                  }
                >
                  Confirmar pago de{' '}
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    maximumFractionDigits: 0,
                  }).format(netoConAbono)}
                </Boton>
              </>
            )}
          </div>
        </>
      )}

      {verComprobante && confirmado && (
        <ComprobantePago liquidacionId={confirmado} onCerrar={() => setVerComprobante(false)} />
      )}
    </div>
  );
}
