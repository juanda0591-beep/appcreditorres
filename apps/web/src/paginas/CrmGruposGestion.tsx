import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, CheckCircle, Clock, Archive } from 'lucide-react';

interface Grupo {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  estado: 'activo' | 'en_progreso' | 'completado' | 'archivado';
  totalClientes: number;
  clientesGestionados: number;
  fechaInicio: string | null;
  fechaObjetivo: string | null;
  fechaCompletado: string | null;
  creadoPorNombre: string;
  creadoEn: string;
}

export default function CrmGruposGestion() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalCrear, setModalCrear] = useState(false);
  const [formGrupo, setFormGrupo] = useState({
    nombre: '',
    descripcion: '',
    color: '#3b82f6',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaObjetivo: '',
  });

  const navigate = useNavigate();

  useEffect(() => {
    cargarGrupos();
  }, []);

  async function cargarGrupos() {
    setCargando(true);
    try {
      const res = await fetch('/api/admin/crm/grupos');
      const data = await res.json();
      setGrupos(data.grupos || []);
    } catch (error) {
      console.error('Error al cargar grupos:', error);
    } finally {
      setCargando(false);
    }
  }

  async function crearGrupo(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await fetch('/api/admin/crm/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formGrupo),
      });

      if (res.ok) {
        setModalCrear(false);
        setFormGrupo({
          nombre: '',
          descripcion: '',
          color: '#3b82f6',
          fechaInicio: new Date().toISOString().split('T')[0],
          fechaObjetivo: '',
        });
        cargarGrupos();
      }
    } catch (error) {
      console.error('Error al crear grupo:', error);
    }
  }

  function obtenerIconoEstado(estado: string) {
    switch (estado) {
      case 'activo':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'en_progreso':
        return <Users className="w-5 h-5 text-yellow-500" />;
      case 'completado':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'archivado':
        return <Archive className="w-5 h-5 text-gray-500" />;
      default:
        return null;
    }
  }

  function obtenerTextoEstado(estado: string) {
    switch (estado) {
      case 'activo':
        return 'Activo';
      case 'en_progreso':
        return 'En Progreso';
      case 'completado':
        return 'Completado';
      case 'archivado':
        return 'Archivado';
      default:
        return estado;
    }
  }

  function calcularProgreso(grupo: Grupo) {
    if (grupo.totalClientes === 0) return 0;
    return Math.round((grupo.clientesGestionados / grupo.totalClientes) * 100);
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Grupos de Gestión</h1>
          <p className="text-gray-600 mt-1">
            Organiza y gestiona clientes en grupos para campañas de cobranza
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/crm/cartera"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
          >
            Ver Cartera
          </Link>
          <button
            onClick={() => setModalCrear(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Crear Grupo
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="text-center py-12">Cargando grupos...</div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            No hay grupos de gestión
          </h3>
          <p className="text-gray-500 mb-6">
            Crea tu primer grupo para organizar clientes y realizar campañas de cobranza
          </p>
          <button
            onClick={() => setModalCrear(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Crear Primer Grupo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {grupos.map((grupo) => {
            const progreso = calcularProgreso(grupo);
            return (
              <div
                key={grupo.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/crm/grupos/${grupo.id}`)}
              >
                {/* Header con color */}
                <div
                  className="h-2 rounded-t-lg"
                  style={{ backgroundColor: grupo.color }}
                />

                <div className="p-6">
                  {/* Título y estado */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {grupo.nombre}
                      </h3>
                      {grupo.descripcion && (
                        <p className="text-sm text-gray-600">{grupo.descripcion}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {obtenerIconoEstado(grupo.estado)}
                    </div>
                  </div>

                  {/* Estadísticas */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600">Progreso</span>
                      <span className="font-medium text-gray-900">
                        {grupo.clientesGestionados} / {grupo.totalClientes} clientes
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${progreso}%`,
                          backgroundColor: grupo.color,
                        }}
                      />
                    </div>
                    <div className="text-right text-xs text-gray-500 mt-1">
                      {progreso}% completado
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="space-y-2 text-sm">
                    {grupo.fechaObjetivo && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fecha objetivo:</span>
                        <span className="text-gray-900">
                          {new Date(grupo.fechaObjetivo).toLocaleDateString('es-CO')}
                        </span>
                      </div>
                    )}
                    {grupo.fechaCompletado && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Completado:</span>
                        <span className="text-green-600 font-medium">
                          {new Date(grupo.fechaCompletado).toLocaleDateString('es-CO')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Creado por {grupo.creadoPorNombre}</span>
                      <span>{obtenerTextoEstado(grupo.estado)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear Grupo */}
      {modalCrear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Crear Grupo de Gestión</h2>

            <form onSubmit={crearGrupo}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Nombre del grupo *
                  </label>
                  <input
                    type="text"
                    value={formGrupo.nombre}
                    onChange={(e) =>
                      setFormGrupo({ ...formGrupo, nombre: e.target.value })
                    }
                    className="w-full border rounded px-3 py-2"
                    placeholder="Ej: Morosos Agosto 2026"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Descripción</label>
                  <textarea
                    value={formGrupo.descripcion}
                    onChange={(e) =>
                      setFormGrupo({ ...formGrupo, descripcion: e.target.value })
                    }
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    placeholder="Descripción opcional del grupo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={formGrupo.color}
                      onChange={(e) =>
                        setFormGrupo({ ...formGrupo, color: e.target.value })
                      }
                      className="h-10 w-20 rounded cursor-pointer"
                    />
                    <span className="text-sm text-gray-600">{formGrupo.color}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={formGrupo.fechaInicio}
                    onChange={(e) =>
                      setFormGrupo({ ...formGrupo, fechaInicio: e.target.value })
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Fecha objetivo (opcional)
                  </label>
                  <input
                    type="date"
                    value={formGrupo.fechaObjetivo}
                    onChange={(e) =>
                      setFormGrupo({ ...formGrupo, fechaObjetivo: e.target.value })
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setModalCrear(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Crear Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
