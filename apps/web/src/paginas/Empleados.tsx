import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatearPesos, type Empleado, type Municipio } from '@credito/shared';
import {
  useEmpleados,
  useCrearEmpleado,
  useActualizarEmpleado,
  useAhorro,
  usePagarAhorro,
  useMunicipios,
  useGuardarMunicipio,
} from '../api/hooks.js';
import { CampoDinero } from '../componentes/CampoDinero.js';
import { Aviso, Boton, Cargando, Dinero, Vacio, Modal } from '../componentes/base.js';
import { Pestanas } from '../componentes/Pestanas.js';
import { hoy } from '../utilidades/fechas.js';
import { confirmar, avisar, avisarError } from '../utilidades/alertas.js';

export function Empleados() {
  const [vista, setVista] = useState<'empleados' | 'municipios'>('empleados');

  return (
    <div className="space-y-5">
      <Pestanas
        valor={vista}
        onCambio={setVista}
        opciones={[
          ['empleados', 'Empleados'],
          ['municipios', 'Municipios y metas'],
        ]}
      />

      {vista === 'empleados' ? <ListaEmpleados /> : <ListaMunicipios />}
    </div>
  );
}

function ListaEmpleados() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const empleados = useEmpleados();

  return (
    <div className="space-y-5">
      <Boton onClick={() => setMostrarForm(true)}>Agregar empleado</Boton>

      {mostrarForm && (
        <Modal titulo="Agregar empleado" onCerrar={() => setMostrarForm(false)}>
          <FormularioEmpleado onListo={() => setMostrarForm(false)} />
        </Modal>
      )}

      {empleados.isLoading && <Cargando />}
      {empleados.data?.length === 0 && <Vacio>Todavia no hay empleados.</Vacio>}

      <div className="space-y-3">
        {empleados.data?.map((empleado) => (
          <TarjetaEmpleado key={empleado.id} empleado={empleado} />
        ))}
      </div>
    </div>
  );
}

function TarjetaEmpleado({ empleado }: { empleado: Empleado }) {
  const navigate = useNavigate();
  const ahorro = useAhorro(empleado.id);
  const pagar = usePagarAhorro();
  const [editando, setEditando] = useState(false);

  const saldo = ahorro.data?.saldo ?? 0;
  const puedePagar = ahorro.data?.cicloCumplido ?? false;

  return (
    <>
      <div className="tarjeta">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold">{empleado.nombre}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Venta {formatearPesos(empleado.tarifaVenta)} · paga{' '}
              {formatearPesos(empleado.tarifaLiquidacion)} · cobro {empleado.porcentajeCobro}%
            </p>
          </div>
          <div className="flex gap-2">
            <Boton tipo="secundario" onClick={() => navigate(`/empleados/${empleado.id}`)}>
              Ver detalle
            </Boton>
            <Boton tipo="secundario" onClick={() => setEditando(true)}>
              Editar
            </Boton>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-blue-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-blue-900 uppercase">
                Ahorro acumulado
              </p>
              <p className="mt-0.5">
                <Dinero valor={saldo} />
              </p>
            </div>

            {saldo > 0 && (
              <div className="text-right">
                {puedePagar ? (
                  <Boton
                    cargando={pagar.isPending}
                    onClick={async () => {
                      // Entregar el ahorro mueve plata y descarga el saldo: se
                      // confirma con el monto a la vista, no solo con un "Si".
                      const seguro = await confirmar({
                        titulo: `Entregar ${formatearPesos(saldo)} a ${empleado.nombre}?`,
                        detalle:
                          'Se registra la entrega, el saldo vuelve a cero y queda un egreso en caja.',
                        confirmar: 'Entregar ahorro',
                      });
                      if (!seguro) return;

                      try {
                        await pagar.mutateAsync({ empleadoId: empleado.id, fecha: hoy() });
                        avisar('Ahorro entregado');
                      } catch (error) {
                        avisarError(error);
                      }
                    }}
                  >
                    Entregar ahorro
                  </Boton>
                ) : (
                  <p className="max-w-40 text-xs text-blue-800">
                    Todavia no se cumplen los 3 meses desde la ultima entrega.
                  </p>
                )}
              </div>
            )}
          </div>
          <Aviso error={pagar.error} />
        </div>
      </div>

      {editando && (
        <Modal titulo="Editar empleado" onCerrar={() => setEditando(false)}>
          <FormularioEmpleado empleado={empleado} onListo={() => setEditando(false)} />
        </Modal>
      )}
    </>
  );
}

function FormularioEmpleado({ empleado, onListo }: { empleado?: Empleado; onListo: () => void }) {
  const [nombre, setNombre] = useState(empleado?.nombre ?? '');
  const [telefono, setTelefono] = useState(empleado?.telefono ?? '');
  const [tarifaVenta, setTarifaVenta] = useState(empleado?.tarifaVenta ?? 6000);
  const [tarifaLiquidacion, setTarifaLiquidacion] = useState(empleado?.tarifaLiquidacion ?? 5000);
  const [porcentajeCobro, setPorcentajeCobro] = useState(empleado?.porcentajeCobro ?? 10);
  const crear = useCrearEmpleado();
  const actualizar = useActualizarEmpleado();

  const ahorroPorVenta = tarifaVenta - tarifaLiquidacion;
  const tarifasMal = tarifaLiquidacion > tarifaVenta;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const datos = {
      nombre,
      telefono: telefono || null,
      tarifaVenta,
      tarifaLiquidacion,
      porcentajeCobro,
    };

    if (empleado) {
      await actualizar.mutateAsync({ id: empleado.id, ...datos });
    } else {
      await crear.mutateAsync(datos);
    }
    onListo();
  }

  const cargando = crear.isPending || actualizar.isPending;
  const error = crear.error || actualizar.error;

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Aviso error={error} />

      <div>
        <label className="etiqueta" htmlFor="nombre">
          Nombre <span className="text-red-600">*</span>
        </label>
        <input
          id="nombre"
          type="text"
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={120}
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="tel">
          Telefono
        </label>
        <input
          id="tel"
          type="tel"
          className="campo"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoDinero etiqueta="Vale cada venta" valor={tarifaVenta} onCambio={setTarifaVenta} />
        <CampoDinero
          etiqueta="Se le paga por venta"
          valor={tarifaLiquidacion}
          onCambio={setTarifaLiquidacion}
        />
      </div>

      {tarifasMal ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
          Lo que se le paga no puede ser mas de lo que vale la venta: daria un ahorro negativo.
        </p>
      ) : (
        ahorroPorVenta > 0 && (
          <p className="rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900">
            Se le guardan <span className="font-semibold">{formatearPesos(ahorroPorVenta)}</span> por
            venta al ahorro, que se entregan cada 3 meses.
          </p>
        )
      )}

      <div>
        <label className="etiqueta" htmlFor="pct">
          Porcentaje de cobro
        </label>
        <div className="relative">
          <input
            id="pct"
            type="text"
            inputMode="decimal"
            className="campo pr-8 text-right tabular-nums"
            value={porcentajeCobro}
            onChange={(e) => setPorcentajeCobro(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500">
            %
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Boton submit cargando={cargando} deshabilitado={!nombre.trim() || tarifasMal}>
          {empleado ? 'Guardar cambios' : 'Guardar empleado'}
        </Boton>
        <Boton tipo="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function ListaMunicipios() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const municipios = useMunicipios();

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        Cada municipio tiene su propia meta mensual y su propio porcentaje de bono. Si el empleado
        supera la meta, gana ese porcentaje sobre el excedente, y se paga al cerrar el mes.
      </div>

      <Boton onClick={() => setMostrarForm(true)}>Agregar municipio</Boton>

      {mostrarForm && (
        <Modal titulo="Agregar municipio" onCerrar={() => setMostrarForm(false)}>
          <FormularioMunicipio onListo={() => setMostrarForm(false)} />
        </Modal>
      )}

      {municipios.isLoading && <Cargando />}
      {municipios.data?.length === 0 && <Vacio>Todavia no hay municipios.</Vacio>}

      <div className="space-y-2">
        {municipios.data?.map((municipio) => (
          <TarjetaMunicipio key={municipio.id} municipio={municipio} />
        ))}
      </div>
    </div>
  );
}

function TarjetaMunicipio({ municipio }: { municipio: Municipio }) {
  const [editando, setEditando] = useState(false);

  return (
    <>
      <div className="tarjeta">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold">{municipio.nombre}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Meta mensual: <span className="font-medium">{formatearPesos(municipio.metaRecaudo)}</span>
            </p>
            <p className="text-sm text-slate-600">
              Bono: <span className="font-medium">{municipio.porcentajeExcedente}%</span> sobre{' '}
              {municipio.baseBono === 'excedente' ? 'el excedente' : 'el total recaudado'}
            </p>
          </div>
          <Boton tipo="secundario" onClick={() => setEditando(true)}>
            Editar
          </Boton>
        </div>
      </div>

      {editando && (
        <Modal titulo="Editar municipio" onCerrar={() => setEditando(false)}>
          <FormularioMunicipio municipio={municipio} onListo={() => setEditando(false)} />
        </Modal>
      )}
    </>
  );
}

function FormularioMunicipio({ municipio, onListo }: { municipio?: Municipio; onListo: () => void }) {
  const [nombre, setNombre] = useState(municipio?.nombre ?? '');
  const [meta, setMeta] = useState(municipio?.metaRecaudo ?? 0);
  const [porcentaje, setPorcentaje] = useState(municipio?.porcentajeExcedente ?? 4);
  const [baseBono, setBaseBono] = useState<'excedente' | 'total'>(municipio?.baseBono ?? 'excedente');
  const guardar = useGuardarMunicipio();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    await guardar.mutateAsync({
      id: municipio?.id,
      nombre,
      metaRecaudo: meta,
      porcentajeExcedente: porcentaje,
      baseBono,
    });
    onListo();
  }

  // Ejemplo con numeros para que se entienda que se esta configurando.
  const ejemploRecaudo = meta > 0 ? Math.round(meta * 1.3) : 0;
  const ejemploExcedente = ejemploRecaudo - meta;
  const ejemploBono = Math.round(
    ((baseBono === 'excedente' ? ejemploExcedente : ejemploRecaudo) * porcentaje) / 100,
  );

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Aviso error={guardar.error} />

      <div>
        <label className="etiqueta" htmlFor="nom-mun">
          Nombre del municipio <span className="text-red-600">*</span>
        </label>
        <input
          id="nom-mun"
          type="text"
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Granada"
          maxLength={120}
        />
      </div>

      <CampoDinero
        etiqueta="Meta de recaudo del mes"
        valor={meta}
        onCambio={setMeta}
        requerido
        ayuda="Si la supera, gana el bono"
      />

      <div>
        <label className="etiqueta" htmlFor="pct-bono">
          Porcentaje del bono
        </label>
        <div className="relative">
          <input
            id="pct-bono"
            type="text"
            inputMode="decimal"
            className="campo pr-8 text-right tabular-nums"
            value={porcentaje}
            onChange={(e) => setPorcentaje(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500">
            %
          </span>
        </div>
      </div>

      <div>
        <label className="etiqueta" htmlFor="base">
          El porcentaje aplica sobre
        </label>
        <select
          id="base"
          className="campo"
          value={baseBono}
          onChange={(e) => setBaseBono(e.target.value as 'excedente' | 'total')}
        >
          <option value="excedente">Solo lo que paso de la meta</option>
          <option value="total">Todo lo recaudado</option>
        </select>
      </div>

      {meta > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">Ejemplo</p>
          <p className="mt-1 text-slate-600">
            Si recauda {formatearPesos(ejemploRecaudo)} en el mes, supera la meta por{' '}
            {formatearPesos(ejemploExcedente)} y el bono seria{' '}
            <span className="font-semibold text-metal-700">{formatearPesos(ejemploBono)}</span>.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Boton submit cargando={guardar.isPending} deshabilitado={!nombre.trim() || meta <= 0}>
          {municipio ? 'Guardar cambios' : 'Guardar municipio'}
        </Boton>
        <Boton tipo="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
