import { useState, useEffect } from 'react';
import { Tag, X, Plus } from 'lucide-react';

interface Etiqueta {
  id: string;
  nombre: string;
  color: string;
  icono: string | null;
  descripcion: string | null;
}

interface EtiquetaAsignada extends Etiqueta {
  asignadoEn: string;
  asignadoPor: string;
  notas: string | null;
}

interface Props {
  clienteId: string;
  onCambio?: () => void;
}

export default function GestorEtiquetas({ clienteId, onCambio }: Props) {
  const [etiquetasDisponibles, setEtiquetasDisponibles] = useState<Etiqueta[]>([]);
  const [etiquetasAsignadas, setEtiquetasAsignadas] = useState<EtiquetaAsignada[]>([]);
  const [mostrarSelector, setMostrarSelector] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    cargarEtiquetas();
    cargarEtiquetasCliente();
  }, [clienteId]);

  async function cargarEtiquetas() {
    try {
      const res = await fetch('/api/admin/crm/etiquetas');
      const data = await res.json();
      setEtiquetasDisponibles(data.etiquetas || []);
    } catch (error) {
      console.error('Error al cargar etiquetas:', error);
    }
  }

  async function cargarEtiquetasCliente() {
    try {
      const res = await fetch(`/api/admin/crm/clientes/${clienteId}/etiquetas`);
      const data = await res.json();
      setEtiquetasAsignadas(data.etiquetas || []);
    } catch (error) {
      console.error('Error al cargar etiquetas del cliente:', error);
    }
  }

  async function asignarEtiqueta(etiquetaId: string) {
    setCargando(true);
    try {
      const res = await fetch(`/api/admin/crm/clientes/${clienteId}/etiquetas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiquetaIds: [etiquetaId] }),
      });

      if (res.ok) {
        await cargarEtiquetasCliente();
        setMostrarSelector(false);
        onCambio?.();
      }
    } catch (error) {
      console.error('Error al asignar etiqueta:', error);
    } finally {
      setCargando(false);
    }
  }

  async function removerEtiqueta(etiquetaId: string) {
    setCargando(true);
    try {
      const res = await fetch(
        `/api/admin/crm/clientes/${clienteId}/etiquetas/${etiquetaId}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        await cargarEtiquetasCliente();
        onCambio?.();
      }
    } catch (error) {
      console.error('Error al remover etiqueta:', error);
    } finally {
      setCargando(false);
    }
  }

  const etiquetasNoAsignadas = etiquetasDisponibles.filter(
    (e) => !etiquetasAsignadas.find((a) => a.id === e.id)
  );

  return (
    <div className="relative">
      {/* Etiquetas asignadas */}
      <div className="flex flex-wrap gap-2 items-center">
        {etiquetasAsignadas.length === 0 && (
          <span className="text-sm text-gray-400 italic">Sin etiquetas</span>
        )}

        {etiquetasAsignadas.map((etiqueta) => (
          <div
            key={etiqueta.id}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-white"
            style={{ backgroundColor: etiqueta.color }}
            title={etiqueta.descripcion || etiqueta.nombre}
          >
            {etiqueta.icono && <span className="text-base">{etiqueta.icono}</span>}
            <span>{etiqueta.nombre}</span>
            <button
              onClick={() => removerEtiqueta(etiqueta.id)}
              disabled={cargando}
              className="ml-1 hover:bg-black hover:bg-opacity-20 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        <button
          onClick={() => setMostrarSelector(!mostrarSelector)}
          className="inline-flex items-center gap-1 px-3 py-1 border-2 border-dashed border-gray-300 rounded-full text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800"
        >
          <Plus className="w-4 h-4" />
          Agregar
        </button>
      </div>

      {/* Selector de etiquetas */}
      {mostrarSelector && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-3 min-w-[300px]">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-sm">Agregar Etiqueta</h4>
            <button
              onClick={() => setMostrarSelector(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {etiquetasNoAsignadas.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              Todas las etiquetas están asignadas
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {etiquetasNoAsignadas.map((etiqueta) => (
                <button
                  key={etiqueta.id}
                  onClick={() => asignarEtiqueta(etiqueta.id)}
                  disabled={cargando}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-gray-50 text-left disabled:opacity-50"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm"
                    style={{ backgroundColor: etiqueta.color }}
                  >
                    {etiqueta.icono || <Tag className="w-3 h-3" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{etiqueta.nombre}</div>
                    {etiqueta.descripcion && (
                      <div className="text-xs text-gray-500">{etiqueta.descripcion}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
