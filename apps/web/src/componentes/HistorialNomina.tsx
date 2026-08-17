import { useState, useMemo } from 'react';
import { FileText, Share2, Ban, Calendar, Receipt, PiggyBank, Search } from 'lucide-react';
import { formatearPesos } from '@credito/shared';
import {
  useEmpleados,
  useHistorialNomina,
  useAnularLiquidacion,
  type ItemHistorialNomina,
} from '../api/hooks.js';
import { obtener } from '../api/cliente.js';
import { fechaCorta, describirPeriodo } from '../utilidades/fechas.js';
import { compartirComprobante, esCancelacion } from '../utilidades/compartir.js';
import { Cargando, Vacio, Aviso, Nota } from './base.js';
import { confirmarConMotivo, avisar, avisarError } from '../utilidades/alertas.js';

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pagada: { texto: 'Pagada', clase: 'bg-metal-50 text-metal-700' },
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-600' },
  anulada: { texto: 'Anulada', clase: 'bg-red-50 text-red-700' },
};

/**
 * Historial de pagos de nomina.
 *
 * Cada pago se muestra con su desglose desplegado en una tabla, no plegado tras
 * un clic: cuando un empleado reclama, la pregunta es siempre "de donde salio
 * este numero", y esconder el detalle obliga a abrir el PDF para responderla.
 *
 * Muestra tambien las anuladas, marcadas como tales: esconderlas haria
 * imposible ver por que una quincena aparece liquidada dos veces.
 */
export function HistorialNomina() {
  const [empleadoId, setEmpleadoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const empleados = useEmpleados();
  const historial = useHistorialNomina({
    empleadoId: empleadoId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  const anular = useAnularLiquidacion();

  /**
   * Filtrado adicional en el cliente.
   *
   * El backend ya filtra por empleado y rango de fechas, que son lo que reduce
   * mas la lista. El buscador es para afinar en memoria: buscar un monto o un
   * mes especifico sin tener que llenar dos campos de fecha.
   */
  const resultados = useMemo(() => {
    if (!historial.data || !busqueda.trim()) return historial.data ?? [];

    const termino = busqueda.toLowerCase();
    return historial.data.filter(
      (item) =>
        item.empleadoNombre.toLowerCase().includes(termino) ||
        item.numero.toLowerCase().includes(termino) ||
        describirPeriodo({ desde: item.periodoDesde, hasta: item.periodoHasta })
          .toLowerCase()
          .includes(termino) ||
        item.netoAPagar.toString().includes(termino),
    );
  }, [historial.data, busqueda]);

  async function anularPago(item: ItemHistorialNomina) {
    const motivo = await confirmarConMotivo({
      titulo: `Anular el pago de ${item.empleadoNombre}?`,
      detalle:
        `Se revierte el egreso de ${formatearPesos(item.netoAPagar)} en caja y la retencion ` +
        'del ahorro. El pago queda marcado como anulado, no se borra.',
      etiquetaMotivo: 'Por que se anula este pago',
      confirmar: 'Anular pago',
    });
    if (motivo === null) return;

    try {
      await anular.mutateAsync({ id: item.id, motivo });
      avisar('Pago anulado');
    } catch (fallo) {
      avisarError(fallo);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros que van al backend: reducen la carga antes de que llegue. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="filtro-empleado-historial">
          Filtrar por empleado
        </label>
        <select
          id="filtro-empleado-historial"
          className="campo w-auto"
          value={empleadoId}
          onChange={(e) => setEmpleadoId(e.target.value)}
        >
          <option value="">Todos los empleados</option>
          {(empleados.data ?? []).map((empleado) => (
            <option key={empleado.id} value={empleado.id}>
              {empleado.nombre}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="filtro-desde">
            Desde
          </label>
          <input
            type="date"
            id="filtro-desde"
            className="campo w-auto"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            placeholder="Desde"
          />
          <span className="text-sm text-slate-400">—</span>
          <label className="sr-only" htmlFor="filtro-hasta">
            Hasta
          </label>
          <input
            type="date"
            id="filtro-hasta"
            className="campo w-auto"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            placeholder="Hasta"
          />
        </div>

        {/* Buscador en el cliente: afina lo que ya llego del servidor. */}
        <div className="relative flex-1 min-w-[200px]">
          <label className="sr-only" htmlFor="buscar-historial">
            Buscar en el historial
          </label>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            id="buscar-historial"
            className="campo pl-10"
            placeholder="Buscar por nombre, periodo o monto"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {historial.isLoading && <Cargando texto="Cargando historial" />}
      <Aviso error={historial.error} />
      <Aviso error={error} />

      {busqueda.trim() && historial.data && (
        <p className="text-sm text-slate-600">
          {resultados.length === 0
            ? 'No se encontraron pagos con ese criterio'
            : `${resultados.length} ${resultados.length === 1 ? 'pago encontrado' : 'pagos encontrados'}`}
        </p>
      )}

      {avisoDescarga && (
        <Nota>
          El PDF se descargo a tu dispositivo. Adjuntalo en la conversacion de WhatsApp que se
          abrio, junto con el mensaje ya escrito.
        </Nota>
      )}

      {historial.data?.length === 0 && <Vacio>Todavia no hay pagos registrados.</Vacio>}

      {resultados.map((item) => (
        <PagoDelHistorial
          key={item.id}
          item={item}
          onAnular={() => void anularPago(item)}
          onDescargado={() => setAvisoDescarga(true)}
          onError={setError}
        />
      ))}
    </div>
  );
}

/** Un pago: encabezado con acciones y el desglose en tabla. */
function PagoDelHistorial({
  item,
  onAnular,
  onDescargado,
  onError,
}: {
  item: ItemHistorialNomina;
  onAnular: () => void;
  onDescargado: () => void;
  onError: (error: unknown) => void;
}) {
  const [compartiendo, setCompartiendo] = useState(false);
  const estado = ESTADOS[item.estado] ?? ESTADOS.borrador!;
  const anulada = item.estado === 'anulada';

  async function compartir() {
    setCompartiendo(true);
    onError(null);
    try {
      // El texto se pide en el momento de compartir y no al cargar la lista:
      // traerlo para cada pago de la pantalla seria una peticion por fila para
      // algo que casi siempre se usa en una sola.
      const { texto, numero } = await obtener<{ texto: string; numero: string }>(
        `/api/nomina/${item.id}/compartir`,
      );
      const { seDescargo } = await compartirComprobante({
        liquidacionId: item.id,
        numero,
        texto,
      });
      if (seDescargo) onDescargado();
    } catch (err) {
      if (esCancelacion(err)) return;
      onError(err);
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <div className={`tarjeta space-y-3 ${anulada ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{item.empleadoNombre}</p>
          {item.empleadoDocumento && (
            <p className="text-xs text-slate-500">CC {item.empleadoDocumento}</p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Calendar size={13} className="text-slate-400" />
              {describirPeriodo({ desde: item.periodoDesde, hasta: item.periodoHasta })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Receipt size={13} className="text-slate-400" />
              {item.numero}
            </span>
            {item.pagadaEn && <span>pagada el {fechaCorta(item.pagadaEn.slice(0, 10))}</span>}
          </p>
          <span className={`pastilla mt-1.5 ${estado.clase}`}>{estado.texto}</span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${
              anulada ? 'bg-slate-100 text-slate-500' : 'bg-metal-50 text-metal-700'
            }`}
          >
            {formatearPesos(item.netoAPagar)}
          </span>

          <AccionFila
            href={`/api/nomina/${item.id}/comprobante.pdf`}
            icono={FileText}
            etiqueta={`Ver el PDF del comprobante ${item.numero}`}
          >
            PDF
          </AccionFila>

          <AccionFila
            onClick={compartir}
            icono={Share2}
            cargando={compartiendo}
            etiqueta={`Compartir por WhatsApp el comprobante de ${item.empleadoNombre}`}
          >
            WhatsApp
          </AccionFila>

          {item.estado === 'pagada' && (
            <AccionFila
              onClick={onAnular}
              icono={Ban}
              tono="peligro"
              etiqueta={`Anular el pago de ${item.empleadoNombre}`}
            >
              Anular
            </AccionFila>
          )}
        </div>
      </div>

      <TablaConceptos item={item} />

      {item.nota && <p className="text-xs text-slate-500">Nota: {item.nota}</p>}
    </div>
  );
}

/** El desglose del pago. Las mismas lineas que salen en el PDF. */
function TablaConceptos({ item }: { item: ItemHistorialNomina }) {
  return (
    <div>
      {/* En celular la tabla no cabe: se desplaza en horizontal en vez de
          apretar las columnas hasta que los montos se parten en dos lineas. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-lg border-collapse text-sm">
          <caption className="sr-only">
            Desglose del pago a {item.empleadoNombre}, comprobante {item.numero}
          </caption>
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th scope="col" className="px-3 py-2">
                Concepto
              </th>
              <th scope="col" className="px-3 py-2">
                Detalle
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Cant
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Valor
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {item.conceptos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-slate-500">
                  Este periodo no genero conceptos: el pago quedo en cero.
                </td>
              </tr>
            )}

            {item.conceptos.map((concepto, indice) => (
              <tr
                key={`${concepto.concepto}-${indice}`}
                className={`border-t border-slate-100 ${indice % 2 === 1 ? 'bg-slate-50/60' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{concepto.concepto}</div>
                  {concepto.fecha && (
                    <div className="text-xs text-slate-400 mt-0.5">{fechaCorta(concepto.fecha)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{concepto.detalle}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {concepto.cantidad ?? '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {concepto.valorUnitario === null ? '—' : formatearPesos(concepto.valorUnitario)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    concepto.subtotal < 0 ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {formatearPesos(concepto.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <Total etiqueta="Subtotal" valor={formatearPesos(item.totalBruto)} />
        {item.deduccionesTotal > 0 && (
          <Total
            etiqueta="Descuentos"
            valor={`-${formatearPesos(item.deduccionesTotal)}`}
            tono="egreso"
          />
        )}
        <Total etiqueta="Total" valor={formatearPesos(item.netoAPagar)} destacado />
      </dl>

      {item.ahorroRetenido > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-800">
          <PiggyBank size={14} className="text-blue-500" />
          Ahorro acumulado en este periodo:{' '}
          <span className="font-semibold">{formatearPesos(item.ahorroRetenido)}</span>
          <span className="text-blue-600">(no entra en el pago, se entrega cada 3 meses)</span>
        </p>
      )}
    </div>
  );
}

function Total({
  etiqueta,
  valor,
  destacado,
  tono,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  tono?: 'egreso';
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={destacado ? 'font-semibold text-slate-900' : 'text-slate-500'}>{etiqueta}</dt>
      <dd
        className={`tabular-nums ${
          destacado
            ? 'font-bold text-slate-900'
            : tono === 'egreso'
              ? 'text-red-600'
              : 'text-slate-700'
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/** Boton chico con icono y texto, para las acciones del encabezado. */
function AccionFila({
  children,
  etiqueta,
  icono: Icono,
  onClick,
  href,
  cargando,
  tono = 'neutro',
}: {
  children: string;
  etiqueta: string;
  icono: typeof FileText;
  onClick?: () => void;
  href?: string;
  cargando?: boolean;
  tono?: 'neutro' | 'peligro';
}) {
  const estilos =
    tono === 'peligro'
      ? 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  const clases = `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs
    font-semibold shadow-xs transition disabled:opacity-50 ${estilos}`;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" aria-label={etiqueta} className={clases}>
        <Icono size={14} />
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={cargando} aria-label={etiqueta} className={clases}>
      <Icono size={14} />
      {cargando ? 'Abriendo...' : children}
    </button>
  );
}
