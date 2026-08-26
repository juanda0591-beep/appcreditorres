import { useState, useRef, type FormEvent } from 'react';
import { toast } from 'sonner';
import { formatearPesos, type Municipio, type RegistroVenta, type RegistroCobro, type GastoEmpleado } from '@credito/shared';
import { useRegistrarVenta, useRegistrarCobro, useRegistrarGasto, useEditarVenta, useEditarCobro, useEditarGasto } from '../api/hooks.js';
import { CampoDinero } from '../componentes/CampoDinero.js';
import { Aviso, Boton } from '../componentes/base.js';
import { confirmar } from '../utilidades/alertas.js';

interface Comunes {
  empleadoId: string;
  municipioId: string;
  fecha: string;
  /**
   * Para nombrarlo en la confirmacion.
   *
   * El modal ya lo muestra en su encabezado, pero el dialogo de confirmacion se
   * abre encima y lo tapa: sin el nombre aqui, la ultima pantalla antes de
   * guardar no dice a quien se le esta anotando la plata.
   */
  empleadoNombre?: string;
}

/**
 * Gasto que se anota junto con la venta o el cobro.
 *
 * Va aqui adentro y no en un formulario aparte porque el gasto casi siempre
 * sale del mismo viaje: el empleado recaudo dos millones y gasto setenta mil
 * en transporte ese mismo dia. Obligar a cambiar de pestana y volver a elegir
 * empleado y fecha hace que se anote despues o no se anote.
 *
 * No hay llave foranea hacia la venta ni el cobro: la nomina agrupa los gastos
 * por empleado y fecha, que es justo lo que los relaciona con lo del dia.
 */
export interface GastoOpcional {
  activo: boolean;
  monto: number;
  concepto: string;
  deducible: boolean;
}

export const GASTO_VACIO: GastoOpcional = {
  activo: false,
  monto: 0,
  concepto: '',
  deducible: true,
};

/** true si el gasto esta activo pero incompleto: no se puede guardar asi. */
export function gastoIncompleto(gasto: GastoOpcional): boolean {
  return gasto.activo && (gasto.monto <= 0 || !gasto.concepto.trim());
}

function SelectorMunicipio({
  valor,
  onCambio,
  municipios,
  requerido,
}: {
  valor: string;
  onCambio: (id: string) => void;
  municipios: Municipio[];
  requerido?: boolean;
}) {
  return (
    <div>
      <label className="etiqueta" htmlFor="municipio">
        Municipio {requerido && <span className="text-red-600">*</span>}
      </label>
      <select
        id="municipio"
        className="campo"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      >
        <option value="">{requerido ? 'Selecciona un municipio' : 'Sin municipio'}</option>
        {municipios.map((municipio) => (
          <option key={municipio.id} value={municipio.id}>
            {municipio.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Bloque de gasto que se despliega dentro de venta y cobro. */
function SeccionGasto({
  gasto,
  onCambio,
  idPrefijo,
}: {
  gasto: GastoOpcional;
  onCambio: (gasto: GastoOpcional) => void;
  idPrefijo: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <label className="flex cursor-pointer items-center gap-3 p-3">
        <input
          type="checkbox"
          className="size-4 accent-metal-600"
          checked={gasto.activo}
          onChange={(e) => onCambio({ ...gasto, activo: e.target.checked })}
        />
        <span className="text-sm font-medium">Hubo un gasto este dia</span>
      </label>

      {gasto.activo && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          <CampoDinero
            etiqueta="Monto del gasto"
            valor={gasto.monto}
            onCambio={(monto) => onCambio({ ...gasto, monto })}
            requerido
          />

          <div>
            <label className="etiqueta" htmlFor={`${idPrefijo}-concepto`}>
              En que fue <span className="text-red-600">*</span>
            </label>
            <input
              id={`${idPrefijo}-concepto`}
              type="text"
              className="campo"
              value={gasto.concepto}
              onChange={(e) => onCambio({ ...gasto, concepto: e.target.value })}
              placeholder="Transporte, alimentacion..."
              maxLength={200}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-metal-600"
              checked={gasto.deducible}
              onChange={(e) => onCambio({ ...gasto, deducible: e.target.checked })}
            />
            <span className="text-sm">
              <span className="font-medium">Descontar del pago del empleado</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                {gasto.deducible
                  ? 'Se le resta de lo que se le paga en la liquidacion.'
                  : 'Lo asume el negocio: no afecta el pago del empleado.'}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

/** Mensaje de exito que desaparece solo. */
function Listo({ texto }: { texto: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-metal-200 bg-metal-50 p-3 text-sm font-medium text-metal-800"
    >
      {texto}
    </div>
  );
}

export function FormularioVenta({
  empleadoId,
  municipioId,
  setMunicipioId,
  fecha,
  municipios,
  tarifaVenta,
  tarifaLiquidacion,
  empleadoNombre,
  onListo,
  inicial,
  onExito,
}: Comunes & {
  setMunicipioId?: (id: string) => void;
  municipios: Municipio[];
  tarifaVenta?: number;
  tarifaLiquidacion?: number;
  onListo?: (resumen: string) => void;
  inicial?: RegistroVenta;
  onExito?: () => void;
}) {
  const [cantidad, setCantidad] = useState(inicial?.cantidad ?? 0);
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [municipioIdLocal, setMunicipioIdLocal] = useState(inicial?.municipioId ?? municipioId ?? '');
  const [listo, setListo] = useState('');
  const [gasto, setGasto] = useState<GastoOpcional>(GASTO_VACIO);
  const registrar = useRegistrarVenta();
  const editar = useEditarVenta();
  const registrarGasto = useRegistrarGasto();

  const modoEdicion = Boolean(inicial);
  const empleadoIdFinal = inicial?.empleadoId ?? empleadoId;
  const fechaFinal = inicial?.fecha ?? fecha;
  const tarifaVentaFinal = inicial?.tarifaVenta ?? tarifaVenta ?? 0;
  const tarifaLiquidacionFinal = inicial?.tarifaLiquidacion ?? tarifaLiquidacion ?? 0;

  /**
   * Recuerda que la venta ya quedo guardada.
   *
   * La venta y el gasto son dos llamadas: si la primera pasa y la segunda falla,
   * el formulario queda abierto con el error. Sin esta marca, volver a darle
   * guardar registraria la venta OTRA VEZ y el empleado cobraria doble.
   */
  const ventaGuardada = useRef(false);

  // El calculo se muestra en vivo con las mismas tarifas que usara el backend,
  // asi la persona confirma que va a registrar lo correcto antes de guardar.
  const devengado = cantidad * tarifaVentaFinal;
  const liquidado = cantidad * tarifaLiquidacionFinal;
  const ahorro = devengado - liquidado;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setListo('');

    const filas = [
      { rotulo: 'Empleado', valor: empleadoNombre ?? 'el seleccionado' },
      { rotulo: 'Fecha', valor: fechaFinal },
      { rotulo: 'Ventas', valor: `${cantidad} x ${formatearPesos(tarifaVentaFinal)}` },
      { rotulo: 'Se le paga', valor: formatearPesos(liquidado), destacado: true },
      { rotulo: 'Va al ahorro', valor: formatearPesos(ahorro) },
    ];

    if (gasto.activo) {
      filas.push({
        rotulo: gasto.deducible ? `Gasto: ${gasto.concepto}` : `Gasto (lo asume el negocio)`,
        valor: `-${formatearPesos(gasto.monto)}`,
      });
    }

    // Si la venta ya paso, no se vuelve a preguntar: lo que falta es el gasto.
    if (!ventaGuardada.current) {
      const seguro = await confirmar({
        titulo: modoEdicion ? 'Actualizar estas ventas?' : 'Registrar estas ventas?',
        resumen: filas,
        confirmar: modoEdicion ? 'Actualizar ventas' : 'Registrar ventas',
      });
      if (!seguro) return;

      if (modoEdicion) {
        await editar.mutateAsync({
          id: inicial!.id,
          empleadoId: empleadoIdFinal,
          municipioId: municipioIdLocal || null,
          fecha: fechaFinal,
          cantidad,
          nota: nota || null,
        });
      } else {
        await registrar.mutateAsync({
          empleadoId: empleadoIdFinal,
          municipioId: municipioIdLocal || null,
          fecha: fechaFinal,
          cantidad,
          nota: nota || null,
        });
      }
      ventaGuardada.current = true;
    }

    if (gasto.activo) {
      await registrarGasto.mutateAsync({
        empleadoId: empleadoIdFinal,
        municipioId: municipioIdLocal || null,
        fecha: fechaFinal,
        monto: gasto.monto,
        concepto: gasto.concepto,
        deducible: gasto.deducible,
      });
    }

    ventaGuardada.current = false;

    const resumen = gasto.activo
      ? `${cantidad} ventas y un gasto de ${formatearPesos(gasto.monto)}`
      : `${cantidad} ventas`;

    if (modoEdicion && onExito) {
      onExito();
      return;
    }

    setCantidad(0);
    setNota('');
    setGasto(GASTO_VACIO);

    toast.success(`Se ${modoEdicion ? 'actualizaron' : 'registraron'} ${resumen}`);
    if (onListo) onListo(`Se ${modoEdicion ? 'actualizaron' : 'registraron'} ${resumen}`);
    else setListo(`Se ${modoEdicion ? 'actualizaron' : 'registraron'} ${resumen}`);
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {listo && <Listo texto={listo} />}
      <Aviso error={registrar.error ?? editar.error ?? registrarGasto.error} />

      <div>
        <label className="etiqueta" htmlFor="cantidad">
          Cuantas ventas <span className="text-red-600">*</span>
        </label>
        <input
          id="cantidad"
          type="text"
          inputMode="numeric"
          className="campo text-right text-lg font-semibold tabular-nums"
          value={cantidad === 0 ? '' : cantidad}
          onChange={(e) => setCantidad(Number(e.target.value.replace(/\D/g, '')) || 0)}
          placeholder="0"
        />
      </div>

      <SelectorMunicipio
        valor={municipioIdLocal}
        onCambio={setMunicipioId || setMunicipioIdLocal}
        municipios={municipios}
      />

      <div>
        <label className="etiqueta" htmlFor="nota-venta">
          Nota
        </label>
        <input
          id="nota-venta"
          type="text"
          className="campo"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      {cantidad > 0 && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">
              {cantidad} x {formatearPesos(tarifaVentaFinal)}
            </span>
            <span className="font-medium tabular-nums">{formatearPesos(devengado)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Se le paga</span>
            <span className="font-semibold text-metal-700 tabular-nums">
              {formatearPesos(liquidado)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1">
            <span className="text-slate-600">Va al ahorro</span>
            <span className="font-medium text-blue-700 tabular-nums">{formatearPesos(ahorro)}</span>
          </div>
          {gasto.activo && gasto.monto > 0 && gasto.deducible && (
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-600">Menos el gasto</span>
              <span className="font-medium text-red-700 tabular-nums">
                -{formatearPesos(gasto.monto)}
              </span>
            </div>
          )}
        </div>
      )}

      {!modoEdicion && <SeccionGasto gasto={gasto} onCambio={setGasto} idPrefijo="venta" />}

      <Boton
        submit
        cargando={registrar.isPending || editar.isPending || registrarGasto.isPending}
        deshabilitado={!empleadoIdFinal || cantidad <= 0 || gastoIncompleto(gasto)}
      >
        {modoEdicion ? 'Actualizar ventas' : 'Registrar ventas'}
      </Boton>
    </form>
  );
}

export function FormularioCobro({
  empleadoId,
  municipioId,
  setMunicipioId,
  fecha,
  municipios,
  porcentaje,
  empleadoNombre,
  onListo,
  inicial,
  onExito,
}: Comunes & {
  setMunicipioId?: (id: string) => void;
  municipios: Municipio[];
  porcentaje?: number;
  onListo?: (resumen: string) => void;
  inicial?: RegistroCobro;
  onExito?: () => void;
}) {
  const [monto, setMonto] = useState(inicial?.montoRecaudado ?? 0);
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [municipioIdLocal, setMunicipioIdLocal] = useState(inicial?.municipioId ?? municipioId ?? '');
  const [listo, setListo] = useState('');
  const [gasto, setGasto] = useState<GastoOpcional>(GASTO_VACIO);
  const registrar = useRegistrarCobro();
  const editar = useEditarCobro();
  const registrarGasto = useRegistrarGasto();

  const modoEdicion = Boolean(inicial);
  const empleadoIdFinal = inicial?.empleadoId ?? empleadoId;
  const fechaFinal = inicial?.fecha ?? fecha;
  const porcentajeFinal = inicial?.porcentajeAplicado ?? porcentaje ?? 0;

  const comision = Math.round((monto * porcentajeFinal) / 100);
  const municipio = municipios.find((m) => m.id === municipioIdLocal);

  /** Igual que en las ventas: evita registrar el cobro dos veces al reintentar. */
  const cobroGuardado = useRef(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setListo('');

    const filas = [
      { rotulo: 'Empleado', valor: empleadoNombre ?? 'el seleccionado' },
      { rotulo: 'Municipio', valor: municipio?.nombre ?? '' },
      { rotulo: 'Fecha', valor: fechaFinal },
      { rotulo: 'Recaudado', valor: formatearPesos(monto) },
      {
        rotulo: `Comision (${porcentajeFinal}%)`,
        valor: formatearPesos(comision),
        destacado: true,
      },
    ];

    if (gasto.activo) {
      filas.push({
        rotulo: gasto.deducible ? `Gasto: ${gasto.concepto}` : 'Gasto (lo asume el negocio)',
        valor: `-${formatearPesos(gasto.monto)}`,
      });
    }

    if (!cobroGuardado.current) {
      const seguro = await confirmar({
        // El monto recaudado va en el titulo: es la cifra que mas se equivoca al
        // escribir, por la cantidad de ceros.
        titulo: modoEdicion ? `Actualizar cobro de ${formatearPesos(monto)}?` : `Registrar cobro de ${formatearPesos(monto)}?`,
        resumen: filas,
        confirmar: modoEdicion ? 'Actualizar cobro' : 'Registrar cobro',
      });
      if (!seguro) return;

      if (modoEdicion) {
        await editar.mutateAsync({
          id: inicial!.id,
          empleadoId: empleadoIdFinal,
          municipioId: municipioIdLocal,
          fecha: fechaFinal,
          montoRecaudado: monto,
          nota: nota || null,
        });
      } else {
        await registrar.mutateAsync({
          empleadoId: empleadoIdFinal,
          municipioId: municipioIdLocal,
          fecha: fechaFinal,
          montoRecaudado: monto,
          nota: nota || null,
        });
      }
      cobroGuardado.current = true;
    }

    if (gasto.activo) {
      await registrarGasto.mutateAsync({
        empleadoId: empleadoIdFinal,
        municipioId: municipioIdLocal || null,
        fecha: fechaFinal,
        monto: gasto.monto,
        concepto: gasto.concepto,
        deducible: gasto.deducible,
      });
    }

    cobroGuardado.current = false;

    const resumen = gasto.activo
      ? `Cobro de ${formatearPesos(monto)} y gasto de ${formatearPesos(gasto.monto)} ${modoEdicion ? 'actualizados' : 'registrados'}`
      : `Cobro de ${formatearPesos(monto)} ${modoEdicion ? 'actualizado' : 'registrado'}`;

    if (modoEdicion && onExito) {
      onExito();
      return;
    }

    setMonto(0);
    setNota('');
    setGasto(GASTO_VACIO);

    toast.success(resumen);
    if (onListo) onListo(resumen);
    else setListo(resumen);
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {listo && <Listo texto={listo} />}
      <Aviso error={registrar.error ?? editar.error ?? registrarGasto.error} />

      <CampoDinero
        etiqueta="Cuanto recaudo"
        valor={monto}
        onCambio={setMonto}
        requerido
        ayuda={`Gana el ${porcentajeFinal}% de lo recaudado`}
      />

      <SelectorMunicipio
        valor={municipioIdLocal}
        onCambio={setMunicipioId || setMunicipioIdLocal}
        municipios={municipios}
        requerido
      />

      <div>
        <label className="etiqueta" htmlFor="nota-cobro">
          Nota
        </label>
        <input
          id="nota-cobro"
          type="text"
          className="campo"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      {monto > 0 && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Comision del {porcentajeFinal}%</span>
            <span className="font-semibold text-metal-700 tabular-nums">
              {formatearPesos(comision)}
            </span>
          </div>
          {gasto.activo && gasto.monto > 0 && gasto.deducible && (
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-600">Menos el gasto</span>
              <span className="font-medium text-red-700 tabular-nums">
                -{formatearPesos(gasto.monto)}
              </span>
            </div>
          )}
          {municipio && !modoEdicion && (
            <MetaMunicipio municipio={municipio} recaudado={monto} />
          )}
        </div>
      )}

      {!modoEdicion && <SeccionGasto gasto={gasto} onCambio={setGasto} idPrefijo="cobro" />}

      <Boton
        submit
        cargando={registrar.isPending || editar.isPending || registrarGasto.isPending}
        deshabilitado={!empleadoIdFinal || !municipioIdLocal || monto <= 0 || gastoIncompleto(gasto)}
      >
        {modoEdicion ? 'Actualizar cobro' : 'Registrar cobro'}
      </Boton>
    </form>
  );
}

/**
 * Avisa como va el recaudo frente a la meta del municipio.
 *
 * Solo informa sobre ESTE cobro. El bono real lo calcula el backend sumando
 * todos los cobros del mes, porque la meta es mensual aunque se pague quincenal.
 */
function MetaMunicipio({ municipio, recaudado }: { municipio: Municipio; recaudado: number }) {
  const falta = municipio.metaRecaudo - recaudado;

  return (
    <div className="border-t border-slate-200 pt-1 text-xs text-slate-600">
      <p>
        Meta mensual de {municipio.nombre}:{' '}
        <span className="font-medium">{formatearPesos(municipio.metaRecaudo)}</span>
      </p>
      {falta > 0 ? (
        <p className="mt-0.5">Con este cobro faltan {formatearPesos(falta)} para el bono.</p>
      ) : (
        <p className="mt-0.5 font-medium text-metal-700">
          Este cobro solo ya supera la meta. El bono del {municipio.porcentajeExcedente}% se
          calcula al cerrar el mes con todos los cobros.
        </p>
      )}
    </div>
  );
}

/**
 * Gasto por su cuenta, sin venta ni cobro.
 *
 * Sigue existiendo aparte porque no todo gasto sale de un viaje: un adelanto o
 * una herramienta se anotan sin que ese dia haya habido recaudo.
 */
export function FormularioGasto({
  empleadoId,
  municipioId,
  fecha,
  empleadoNombre,
  onListo,
  inicial,
  onExito,
}: Comunes & {
  onListo?: (resumen: string) => void;
  inicial?: GastoEmpleado;
  onExito?: () => void;
}) {
  const [monto, setMonto] = useState(inicial?.monto ?? 0);
  const [concepto, setConcepto] = useState(inicial?.concepto ?? '');
  const [deducible, setDeducible] = useState(inicial?.deducible ?? true);
  const [listo, setListo] = useState('');
  const registrar = useRegistrarGasto();
  const editar = useEditarGasto();

  const modoEdicion = Boolean(inicial);
  const empleadoIdFinal = inicial?.empleadoId ?? empleadoId;
  const fechaFinal = inicial?.fecha ?? fecha;
  const municipioIdFinal = inicial?.municipioId ?? municipioId;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setListo('');

    const seguro = await confirmar({
      titulo: modoEdicion ? `Actualizar gasto de ${formatearPesos(monto)}?` : `Registrar gasto de ${formatearPesos(monto)}?`,
      resumen: [
        { rotulo: 'Empleado', valor: empleadoNombre ?? 'el seleccionado' },
        { rotulo: 'Fecha', valor: fechaFinal },
        { rotulo: 'En que fue', valor: concepto },
        {
          rotulo: deducible ? 'Se le descuenta del pago' : 'Lo asume el negocio',
          valor: deducible ? `-${formatearPesos(monto)}` : 'No afecta su pago',
          destacado: true,
        },
      ],
      confirmar: modoEdicion ? 'Actualizar gasto' : 'Registrar gasto',
    });
    if (!seguro) return;

    if (modoEdicion) {
      await editar.mutateAsync({
        id: inicial!.id,
        empleadoId: empleadoIdFinal,
        municipioId: municipioIdFinal || null,
        fecha: fechaFinal,
        monto,
        concepto,
        deducible,
      });
    } else {
      await registrar.mutateAsync({
        empleadoId: empleadoIdFinal,
        municipioId: municipioIdFinal || null,
        fecha: fechaFinal,
        monto,
        concepto,
        deducible,
      });
    }

    const resumen = `Gasto de ${formatearPesos(monto)} ${modoEdicion ? 'actualizado' : 'registrado'}`;

    if (modoEdicion && onExito) {
      onExito();
      return;
    }

    setMonto(0);
    setConcepto('');

    toast.success(resumen);
    if (onListo) onListo(resumen);
    else setListo(resumen);
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {listo && <Listo texto={listo} />}
      <Aviso error={registrar.error ?? editar.error} />

      <CampoDinero etiqueta="Monto del gasto" valor={monto} onCambio={setMonto} requerido />

      <div>
        <label className="etiqueta" htmlFor="concepto">
          En que fue <span className="text-red-600">*</span>
        </label>
        <input
          id="concepto"
          type="text"
          className="campo"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Transporte, alimentacion..."
          maxLength={200}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-metal-600"
          checked={deducible}
          onChange={(e) => setDeducible(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">Descontar del pago del empleado</span>
          <span className="mt-0.5 block text-xs text-slate-600">
            {deducible
              ? 'Se le resta de lo que se le paga en la liquidacion.'
              : 'Lo asume el negocio: no afecta el pago del empleado.'}
          </span>
        </span>
      </label>

      <Boton
        submit
        cargando={registrar.isPending || editar.isPending}
        deshabilitado={!empleadoIdFinal || monto <= 0 || !concepto.trim()}
      >
        {modoEdicion ? 'Actualizar gasto' : 'Registrar gasto'}
      </Boton>
    </form>
  );
}
