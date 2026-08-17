import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatearPesos } from '@credito/shared';
import { useQuery } from '@tanstack/react-query';
import { obtener } from '../api/cliente.js';
import { useAhorro, claves } from '../api/hooks.js';
import { Cargando, Aviso, Boton } from '../componentes/base.js';
import { Pestanas } from '../componentes/Pestanas.js';
import { Prestamos } from '../componentes/Prestamos.js';
import type { Empleado } from '@credito/shared';

/**
 * Detalle de un empleado con pestañas para:
 * - Datos básicos
 * - Préstamos
 * - Ahorro
 */
export function DetalleEmpleado() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pestana, setPestana] = useState<'datos' | 'prestamos' | 'ahorro'>('datos');

  const empleado = useQuery({
    queryKey: claves.empleado(id ?? ''),
    queryFn: () => obtener<Empleado>(`/api/empleados/${id}`),
    enabled: Boolean(id),
  });

  const ahorro = useAhorro(id ?? null);

  if (empleado.isLoading) {
    return <Cargando texto="Cargando empleado" />;
  }

  if (empleado.error || !empleado.data) {
    return (
      <div className="space-y-4">
        <Boton tipo="secundario" onClick={() => navigate('/empleados')} icono={ArrowLeft}>
          Volver
        </Boton>
        <Aviso error={empleado.error} />
      </div>
    );
  }

  const emp = empleado.data;

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Boton tipo="secundario" onClick={() => navigate('/empleados')} icono={ArrowLeft}>
            Volver
          </Boton>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{emp.nombre}</h1>
            {emp.documento && (
              <p className="text-sm text-slate-500">CC {emp.documento}</p>
            )}
          </div>
        </div>

        {!emp.activo && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            Inactivo
          </span>
        )}
      </div>

      {/* Pestañas */}
      <Pestanas
        valor={pestana}
        onCambio={setPestana}
        opciones={[
          ['datos', 'Datos'],
          ['prestamos', 'Préstamos'],
          ['ahorro', 'Ahorro'],
        ]}
      />

      {/* Contenido según pestaña */}
      {pestana === 'datos' && <DatosEmpleado empleado={emp} />}
      {pestana === 'prestamos' && id && <Prestamos empleadoId={id} />}
      {pestana === 'ahorro' && (
        <div className="tarjeta">
          {ahorro.isLoading && <Cargando texto="Cargando ahorro" />}
          <Aviso error={ahorro.error} />
          {ahorro.data && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-600">Saldo acumulado</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatearPesos(ahorro.data.saldo)}
                </p>
              </div>
              {ahorro.data.cicloCumplido ? (
                <p className="text-sm text-green-700">
                  ✓ Ya cumplió los 3 meses. Se puede entregar.
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  Último pago: {ahorro.data.ultimoPago || 'Ninguno'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Pestaña de datos básicos del empleado */
function DatosEmpleado({ empleado }: { empleado: Empleado }) {
  return (
    <div className="tarjeta space-y-4">
      <h2 className="font-semibold text-slate-900">Información básica</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre</p>
          <p className="mt-1 text-slate-900">{empleado.nombre}</p>
        </div>

        {empleado.documento && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Documento
            </p>
            <p className="mt-1 text-slate-900">{empleado.documento}</p>
          </div>
        )}

        {empleado.telefono && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Teléfono
            </p>
            <p className="mt-1 text-slate-900">{empleado.telefono}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tarifa venta
          </p>
          <p className="mt-1 text-slate-900">{formatearPesos(empleado.tarifaVenta)}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tarifa liquidación
          </p>
          <p className="mt-1 text-slate-900">{formatearPesos(empleado.tarifaLiquidacion)}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            % Comisión cobros
          </p>
          <p className="mt-1 text-slate-900">{empleado.porcentajeCobro}%</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</p>
          <p className="mt-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                empleado.activo
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {empleado.activo ? 'Activo' : 'Inactivo'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
