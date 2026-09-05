import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, MessageSquare, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface ClienteGrupo {
  clienteGrupoId: string;
  gestionado: boolean;
  fechaGestion: string | null;
  resultado: string | null;
  notas: string | null;
  orden: number;
  // Datos del cliente
  clienteId: string;
  numero: string;
  cliente: string;
  cedula: string;
  telefono: string | null;
  vendedor: string;
  saldo: number;
  diasMora: number;
  estado: string;
}

interface Grupo {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  estado: string;
  totalClientes: number;
  clientesGestionados: number;
  fechaObjetivo: string | null;
}

export default function CrmGrupoDetalle() {
  const { grupoId } = useParams<{ grupoId: string }>();
  const navigate = useNavigate();

  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [clientes, setClientes] = useState<ClienteGrupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteGrupo | null>(null);
  const [modalGestion, setModalGestion] = useState(false);
  const [guardandoGestion, setGuardandoGestion] = useState(false);
  const [montoPromesa, setMontoPromesa] = useState('');
  const [fechaPromesa, setFechaPromesa] = useState('');
  const [formGestion, setFormGestion] = useState({
    resultado: '',
    notas: '',
  });

  // Modal agregar clientes
  const [modalAgregar, setModalAgregar] = useState(false);
  const [busquedaCartera, setBusquedaCartera] = useState('');
  const [resultadosCartera, setResultadosCartera] = useState<any[]>([]);
  const [clientesSeleccionados, setClientesSeleccionados] = useState<string[]>([]);

  useEffect(() => {
    if (grupoId) {
      cargarGrupo();
    }
  }, [grupoId]);

  async function cargarGrupo() {
    setCargando(true);
    try {
      const res = await fetch(`/api/admin/crm/grupos/${grupoId}`);
      const data = await res.json();
      setGrupo(data.grupo);
      setClientes(data.clientes || []);
    } catch (error) {
      console.error('Error al cargar grupo:', error);
    } finally {
      setCargando(false);
    }
  }

  async function marcarGestionado(clienteGrupo: ClienteGrupo, gestionado: boolean) {
    if (gestionado) {
      // Abrir modal para capturar resultado y notas
      setClienteSeleccionado(clienteGrupo);
      setFormGestion({ resultado: '', notas: '' });
      setMontoPromesa('');
      setFechaPromesa('');
      setModalGestion(true);
    } else {
      // Desmarcar directamente
      await actualizarEstadoCliente(clienteGrupo.clienteGrupoId, false, '', '');
    }
  }

  async function actualizarEstadoCliente(
    clienteGrupoId: string,
    gestionado: boolean,
    resultado: string,
    notas: string
  ) {
    if (guardandoGestion) return;
    setGuardandoGestion(true);
    try {
      const res = await fetch(
        `/api/admin/crm/grupos/${grupoId}/clientes/${clienteGrupoId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gestionado, resultado, notas,
            ...(gestionado && resultado === 'promesa_pago' ? { montoPromesa: Number(montoPromesa), fechaPromesa } : {}) }),
        }
      );

      if (res.ok) {
        setModalGestion(false);
        setClienteSeleccionado(null);
        cargarGrupo();
      } else {
        const error = await res.json();
        toast.error(error.mensaje || error.error || 'No se pudo guardar la gestion');
      }
    } catch (error) {
      console.error('Error al actualizar cliente:', error);
      toast.error('No se pudo guardar la gestion');
    } finally {
      setGuardandoGestion(false);
    }
  }

  async function buscarEnCartera() {
    if (!busquedaCartera.trim()) {
      setResultadosCartera([]);
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/crm/cartera?busqueda=${encodeURIComponent(busquedaCartera)}&limite=20`
      );
      const data = await res.json();

      // Filtrar clientes que ya están en el grupo
      const idsEnGrupo = clientes.map(c => c.clienteId);
      const disponibles = (data.cartera || []).filter(
        (c: any) => !idsEnGrupo.includes(c.id)
      );

      setResultadosCartera(disponibles);
    } catch (error) {
      console.error('Error al buscar en cartera:', error);
    }
  }

  async function agregarClientesAlGrupo() {
    if (clientesSeleccionados.length === 0) return;

    try {
      const res = await fetch(`/api/admin/crm/grupos/${grupoId}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteIds: clientesSeleccionados }),
      });

      if (res.ok) {
        setModalAgregar(false);
        setBusquedaCartera('');
        setResultadosCartera([]);
        setClientesSeleccionados([]);
        cargarGrupo();
      }
    } catch (error) {
      console.error('Error al agregar clientes:', error);
    }
  }

  function toggleClienteSeleccionado(clienteId: string) {
    setClientesSeleccionados((prev) =>
      prev.includes(clienteId)
        ? prev.filter((id) => id !== clienteId)
        : [...prev, clienteId]
    );
  }

  function formatearPesos(valor: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  }

  const progreso = grupo
    ? grupo.totalClientes > 0
      ? Math.round((grupo.clientesGestionados / grupo.totalClientes) * 100)
      : 0
    : 0;

  const clientesPendientes = clientes.filter((c) => !c.gestionado);
  const clientesCompletados = clientes.filter((c) => c.gestionado);

  if (cargando) {
    return <div className="p-6 text-center">Cargando grupo...</div>;
  }

  if (!grupo) {
    return <div className="p-6 text-center">Grupo no encontrado</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/crm/grupos')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver a grupos
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">{grupo.nombre}</h1>
            {grupo.descripcion && (
              <p className="text-gray-600">{grupo.descripcion}</p>
            )}
          </div>
          <button
            onClick={() => setModalAgregar(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Agregar Clientes
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Progreso de Gestión</h3>
          <span className="text-2xl font-bold" style={{ color: grupo.color }}>
            {progreso}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
          <div
            className="h-4 rounded-full transition-all"
            style={{ width: `${progreso}%`, backgroundColor: grupo.color }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-gray-900">{grupo.totalClientes}</div>
            <div className="text-gray-600">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {grupo.clientesGestionados}
            </div>
            <div className="text-gray-600">Gestionados</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">
              {clientesPendientes.length}
            </div>
            <div className="text-gray-600">Pendientes</div>
          </div>
        </div>
      </div>

      {/* Tabs: Pendientes / Completados */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button className="px-6 py-3 border-b-2 border-blue-500 font-medium text-blue-600">
              Pendientes ({clientesPendientes.length})
            </button>
          </div>
        </div>

        {/* Lista de clientes pendientes */}
        <div className="p-6">
          {clientesPendientes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              ¡Excelente! Todos los clientes han sido gestionados
            </div>
          ) : (
            <div className="space-y-4">
              {clientesPendientes.map((cliente) => (
                <div
                  key={cliente.clienteGrupoId}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm text-gray-500">
                          #{cliente.numero}
                        </span>
                        <h4 className="font-semibold text-lg">{cliente.cliente}</h4>
                        {cliente.diasMora > 0 && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                            {cliente.diasMora} días mora
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Cédula:</span>{' '}
                          <span className="font-medium">{cliente.cedula}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Vendedor:</span>{' '}
                          <span className="font-medium">{cliente.vendedor}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Saldo:</span>{' '}
                          <span className="font-bold text-red-600">
                            {formatearPesos(cliente.saldo)}
                          </span>
                        </div>
                        {cliente.telefono && (
                          <div>
                            <span className="text-gray-600">Teléfono:</span>{' '}
                            <span className="font-medium">{cliente.telefono}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Link
                        to={`/crm/cartera/${cliente.clienteId}`}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Ver detalle"
                      >
                        <Mail className="w-5 h-5" />
                      </Link>
                      {cliente.telefono && (
                        <a
                          href={`tel:${cliente.telefono}`}
                          className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Llamar"
                        >
                          <Phone className="w-5 h-5" />
                        </a>
                      )}
                      <button
                        onClick={() => marcarGestionado(cliente, true)}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Marcar Gestionado
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clientes completados */}
        {clientesCompletados.length > 0 && (
          <div className="border-t border-gray-200 p-6">
            <h3 className="font-semibold mb-4 text-gray-700">
              Gestionados ({clientesCompletados.length})
            </h3>
            <div className="space-y-3">
              {clientesCompletados.map((cliente) => (
                <div
                  key={cliente.clienteGrupoId}
                  className="border border-green-200 bg-green-50 rounded-lg p-3"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-gray-600">
                          #{cliente.numero}
                        </span>
                        <span className="font-medium">{cliente.cliente}</span>
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      {cliente.resultado && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Resultado:</span> {cliente.resultado}
                        </div>
                      )}
                      {cliente.notas && (
                        <div className="text-sm text-gray-600 mt-1">{cliente.notas}</div>
                      )}
                    </div>
                    <button
                      onClick={() => marcarGestionado(cliente, false)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Desmarcar"
                      disabled={guardandoGestion}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal registrar gestión */}
      {modalGestion && clienteSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Registrar Gestión</h2>
            <p className="text-gray-600 mb-4">
              Cliente: <span className="font-medium">{clienteSeleccionado.cliente}</span>
            </p>

            <div className="space-y-4">
              {formGestion.resultado === 'promesa_pago' && <div className="grid gap-3">
                <label className="text-sm">Monto prometido (COP)<input type="number" min="1" step="1" value={montoPromesa} onChange={e => setMontoPromesa(e.target.value)} className="block w-full mt-1 border rounded px-3 py-2" /></label>
                <label className="text-sm">Fecha de compromiso<input type="date" value={fechaPromesa} onChange={e => setFechaPromesa(e.target.value)} className="block w-full mt-1 border rounded px-3 py-2" /></label>
              </div>}
              <div>
                <label className="block text-sm font-medium mb-1">Resultado</label>
                <select
                  value={formGestion.resultado}
                  onChange={(e) =>
                    setFormGestion({ ...formGestion, resultado: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Seleccionar resultado</option>
                  <option value="contactado">Contactado exitosamente</option>
                  <option value="promesa_pago">Promesa de pago</option>
                  <option value="no_contesta">No contesta</option>
                  <option value="numero_errado">Número errado</option>
                  <option value="acuerdo">Acuerdo establecido</option>
                  <option value="negativa">Negativa de pago</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <textarea
                  value={formGestion.notas}
                  onChange={(e) =>
                    setFormGestion({ ...formGestion, notas: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={4}
                  placeholder="Notas sobre la gestión..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setModalGestion(false);
                  setClienteSeleccionado(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  actualizarEstadoCliente(
                    clienteSeleccionado.clienteGrupoId,
                    true,
                    formGestion.resultado,
                    formGestion.notas
                  )
                }
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                disabled={guardandoGestion || !formGestion.resultado || (formGestion.resultado === 'promesa_pago' && (!montoPromesa || !fechaPromesa))}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar clientes */}
      {modalAgregar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Agregar Clientes al Grupo</h2>

            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={busquedaCartera}
                  onChange={(e) => setBusquedaCartera(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && buscarEnCartera()}
                  placeholder="Buscar por nombre, cédula o número..."
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={buscarEnCartera}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Buscar
                </button>
              </div>
            </div>

            {resultadosCartera.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  {clientesSeleccionados.length} clientes seleccionados
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {resultadosCartera.map((cliente) => (
                    <label
                      key={cliente.id}
                      className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={clientesSeleccionados.includes(cliente.id)}
                        onChange={() => toggleClienteSeleccionado(cliente.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{cliente.cliente}</div>
                        <div className="text-sm text-gray-600">
                          #{cliente.numero} • {cliente.cedula} • {formatearPesos(cliente.saldo)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setModalAgregar(false);
                  setBusquedaCartera('');
                  setResultadosCartera([]);
                  setClientesSeleccionados([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={agregarClientesAlGrupo}
                disabled={clientesSeleccionados.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Agregar ({clientesSeleccionados.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
