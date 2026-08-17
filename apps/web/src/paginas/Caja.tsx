import { useState, type FormEvent } from 'react';
import { TrendingUp, TrendingDown, Plus, Trash2, Lock } from 'lucide-react';
import {
  useBalance,
  useMovimientosCaja,
  useRegistrarMovimiento,
  useBorrarMovimiento,
} from '../api/hooks.js';
import { formatearPesos } from '@credito/shared';
import { CampoDinero } from '../componentes/CampoDinero.js';
import { Aviso, Boton, Cargando, Dinero, Vacio, TarjetaDato, Modal } from '../componentes/base.js';
import { hoy, mesActual, fechaCorta } from '../utilidades/fechas.js';
import { confirmarPeligro, avisar, avisarError } from '../utilidades/alertas.js';

/** Control de dinero del negocio: ingresos, egresos y el balance. */
export function Caja() {
  const [mes, setMes] = useState(() => hoy().slice(0, 7));
  const [mostrarForm, setMostrarForm] = useState(false);

  // El ultimo dia del mes se calcula bien (no se asume 31).
  const periodo = {
    desde: `${mes}-01`,
    hasta: mesActual().hasta.startsWith(mes)
      ? mesActual().hasta
      : new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10),
  };

  const balance = useBalance(periodo);
  const movimientos = useMovimientosCaja({ desde: periodo.desde, hasta: periodo.hasta });
  const borrarMovimiento = useBorrarMovimiento();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="month"
          className="campo w-auto"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          aria-label="Mes"
        />

        <Boton icono={Plus} onClick={() => setMostrarForm(true)}>
          Registrar movimiento
        </Boton>
      </div>

      {mostrarForm && (
        <Modal titulo="Registrar movimiento" onCerrar={() => setMostrarForm(false)}>
          <FormularioMovimiento onListo={() => setMostrarForm(false)} />
        </Modal>
      )}

      {balance.isLoading && <Cargando texto="Calculando balance" />}
      <Aviso error={balance.error} />

      {balance.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <TarjetaDato etiqueta="Entro" icono={TrendingUp} tono="ingreso">
              <Dinero valor={balance.data.ingresos} tipo="ingreso" tamano="grande" />
            </TarjetaDato>

            <TarjetaDato etiqueta="Salio" icono={TrendingDown} tono="egreso">
              <Dinero valor={balance.data.egresos} tipo="egreso" tamano="grande" />
            </TarjetaDato>

            <TarjetaDato etiqueta="Balance">
              <Dinero valor={balance.data.balance} tamano="grande" />
              {balance.data.balance < 0 && (
                <p className="mt-1 text-xs text-red-600">
                  Salio mas plata de la que entro.
                </p>
              )}
            </TarjetaDato>
          </div>

          {balance.data.porCategoria.length > 0 && (
            <div className="tarjeta">
              <h2 className="mb-3 font-semibold text-slate-900">Por categoria</h2>
              <div className="divide-y divide-slate-100">
                {balance.data.porCategoria.map((fila) => (
                  <div
                    key={`${fila.categoria}-${fila.tipo}`}
                    className="flex items-center justify-between py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className="capitalize text-slate-800">{fila.categoria}</span>
                      <span
                        className={`pastilla ${
                          fila.tipo === 'ingreso'
                            ? 'bg-metal-50 text-metal-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {fila.tipo === 'ingreso' ? 'entra' : 'sale'}
                      </span>
                    </span>
                    <Dinero valor={fila.total} tipo={fila.tipo} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="tarjeta">
        <h2 className="mb-2 font-semibold text-slate-900">Movimientos</h2>
        {movimientos.isLoading && <Cargando />}
        {movimientos.data?.length === 0 && <Vacio>No hay movimientos este mes.</Vacio>}

        <div className="divide-y divide-slate-100">
          {movimientos.data?.map((movimiento) => {
            const automatico = Boolean(movimiento.origen && movimiento.origen !== 'manual');

            return (
              <div key={movimiento.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {movimiento.concepto}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {fechaCorta(movimiento.fecha)} · {movimiento.categoria}
                    {automatico && (
                      <span className="pastilla bg-slate-100 text-slate-600">
                        <Lock size={10} className="mr-1" />
                        automatico
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Dinero valor={movimiento.monto} tipo={movimiento.tipo} />
                  {/*
                    Solo se pueden borrar los movimientos hechos a mano. Los que
                    genero el sistema (una liquidacion, una entrega de ahorro)
                    se deshacen anulando la operacion que los creo; si no, el
                    balance mostraria plata que ya no esta.
                  */}
                  {!automatico && (
                    <button
                      type="button"
                      onClick={async () => {
                        // Antes borraba de una, con un solo clic y sin
                        // preguntar. Un toque accidental en el celular movia el
                        // balance del mes sin dejar rastro.
                        const seguro = await confirmarPeligro({
                          titulo: 'Borrar este movimiento?',
                          detalle:
                            `${movimiento.concepto} por ${formatearPesos(movimiento.monto)}. ` +
                            'El balance del mes se recalcula y no se puede deshacer.',
                        });
                        if (!seguro) return;

                        try {
                          await borrarMovimiento.mutateAsync(movimiento.id);
                          avisar('Movimiento borrado');
                        } catch (error) {
                          avisarError(error);
                        }
                      }}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Borrar ${movimiento.concepto}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CATEGORIAS = ['ventas', 'cobros', 'arriendo', 'servicios', 'transporte', 'mercancia', 'otros'];

function FormularioMovimiento({ onListo }: { onListo: () => void }) {
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [monto, setMonto] = useState(0);
  const [categoria, setCategoria] = useState('ventas');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const registrar = useRegistrarMovimiento();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    await registrar.mutateAsync({ fecha, tipo, monto, categoria, concepto });
    onListo();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Aviso error={registrar.error} />

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {(['ingreso', 'egreso'] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setTipo(opcion)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
              tipo === opcion
                ? opcion === 'ingreso'
                  ? 'bg-metal-600 text-white shadow-xs'
                  : 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600'
            }`}
          >
            {opcion === 'ingreso' ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {opcion === 'ingreso' ? 'Entra plata' : 'Sale plata'}
          </button>
        ))}
      </div>

      <CampoDinero etiqueta="Monto" valor={monto} onCambio={setMonto} requerido />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="cat">
            Categoria
          </label>
          <select
            id="cat"
            className="campo capitalize"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {CATEGORIAS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="etiqueta" htmlFor="fecha-mov">
            Fecha
          </label>
          <input
            id="fecha-mov"
            type="date"
            className="campo"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="etiqueta" htmlFor="concepto-mov">
          Concepto <span className="text-red-500">*</span>
        </label>
        <input
          id="concepto-mov"
          type="text"
          className="campo"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="En que fue"
          maxLength={200}
        />
      </div>

      <div className="flex gap-2">
        <Boton submit cargando={registrar.isPending} deshabilitado={monto <= 0 || !concepto.trim()}>
          Guardar
        </Boton>
        <Boton tipo="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
