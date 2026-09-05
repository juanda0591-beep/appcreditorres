import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { CrmFichaSeguimiento } from '../componentes/CrmFichaSeguimiento';
import { useQueryClient } from '@tanstack/react-query';

interface Cliente {
  id: string;
  numero: string;
  vendedor: string;
  cliente: string;
  cedula: string;
  telefono: string | null;
  municipio: string | null;
  articulo: string;
  fechaInicio: string;
  montoCuota: number;
  periodosPago: string;
  abono: number;
  saldo: number;
  ultimaFechaAbono: string | null;
  estado: string;
  diasMora: number;
}

interface Gestion {
  id: string;
  fechaGestion: string;
  tipoGestion: string;
  canal: string;
  resultado: string;
  notas: string | null;
  proximaAccion: string | null;
  fechaProximaAccion: string | null;
  seguimientoCerradoEn: string | null;
  nombreUsuario: string;
}

interface Pago {
  id: string;
  fechaPago: string;
  monto: number;
  metodoPago: string;
  referencia: string | null;
  notas: string | null;
  nombreUsuario: string;
}

interface Cambio {
  id: string;
  fecha: string;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string;
  nombreUsuario: string;
}

export default function CrmDetalleCliente() {
  const cache = useQueryClient();
  const [montoPromesa, setMontoPromesa] = useState('');
  const [guardandoGestion, setGuardandoGestion] = useState(false);
  const { id } = useParams<{ id: string }>();
  const idActual = useRef(id);
  idActual.current = id;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoSeguimiento, setGuardandoSeguimiento] = useState<string | null>(null);
  const [vistaActiva, setVistaActiva] = useState<'gestiones' | 'pagos' | 'cambios'>('gestiones');

  // Modal de gestión
  const [modalGestionAbierto, setModalGestionAbierto] = useState(false);
  const [formGestion, setFormGestion] = useState({
    tipoGestion: 'llamada',
    canal: 'telefono',
    resultado: 'contacto_efectivo',
    notas: '',
    proximaAccion: '',
    fechaProximaAccion: '',
  });
  const esPromesa = formGestion.tipoGestion === 'promesa_pago' || formGestion.resultado === 'promesa_pago';

  useEffect(() => {
    if (id) {
      setModalGestionAbierto(false);
      cargarDatos();
    }
  }, [id]);

  async function cargarDatos(mostrarCarga = true) {
    if (mostrarCarga) setCargando(true);
    try {
      const res = await fetch(`/api/admin/crm/cartera/${id}/historial`);
      if (!res.ok) throw new Error('No se pudo cargar la ficha');
      const data = await res.json();
      if (idActual.current !== id) return;

      setCliente(data.cliente);
      setGestiones(data.gestiones || []);
      setPagos(data.pagos || []);
      setCambios(data.cambios || []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      if (idActual.current === id) setCliente(null);
    } finally {
      if (idActual.current === id) setCargando(false);
    }
  }

  async function cambiarSeguimiento(gestion: Gestion) {
    setGuardandoSeguimiento(gestion.id);
    try {
      const res = await fetch(`/api/admin/crm/gestiones/${gestion.id}/seguimiento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cerrado: !gestion.seguimientoCerradoEn }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar el seguimiento');
      const data = await res.json();
      setGestiones(actuales => actuales.map(actual => actual.id === gestion.id ? data.gestion : actual));
    } catch {
      toast.error('No se pudo actualizar el seguimiento');
    } finally {
      setGuardandoSeguimiento(null);
    }
  }

  async function registrarGestion(e: React.FormEvent) {
    e.preventDefault();
    if (guardandoGestion) return;
    setGuardandoGestion(true);
    try {
      const res = await fetch(esPromesa ? `/api/admin/crm/cartera/${id}/promesas` : '/api/admin/crm/gestiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(esPromesa ? { monto: Number(montoPromesa), fechaCompromiso: formGestion.fechaProximaAccion, notas: formGestion.notas, canal: formGestion.canal } : {
          carteraClienteId: id,
          ...formGestion,
        }),
      });

      if (res.ok) {
        alert('Gestión registrada exitosamente');
        setModalGestionAbierto(false);
        void cache.invalidateQueries({ queryKey: ['crm'] });
        cargarDatos();
      } else {
        const error = await res.json();
        alert(`Error: ${error.mensaje ?? error.error}`);
      }
    } catch (error) {
      console.error('Error al registrar gestión:', error);
      alert('Error al registrar gestión');
    } finally {
      setGuardandoGestion(false);
    }
  }

  function formatearPesos(valor: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  }

  function formatearFecha(fecha: string | null): string {
    if (!fecha) return '-';
    // Fechas guardadas como medianoche UTC: se formatean en UTC para que no se
    // corran un día en hora local (Colombia, UTC-5).
    return new Date(fecha).toLocaleDateString('es-CO', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatearFechaHora(fecha: string): string {
    return new Date(fecha).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (cargando) {
    return <div className="p-6 text-center">Cargando...</div>;
  }

  if (!cliente) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 mb-4">Cliente no encontrado</p>
        <Link to="/crm/cartera" className="text-blue-600 hover:text-blue-800">
          Volver a cartera
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/crm/cartera" className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
          ← Volver a Cartera
        </Link>
        <div className="flex flex-wrap gap-4 justify-between items-start">
          <div className="min-w-0 break-words">
            <h1 className="text-3xl font-bold">{cliente.cliente}</h1>
            <div className="mt-2 text-gray-600 space-y-1">
              <p>Crédito #{cliente.numero} • Cédula: {cliente.cedula}</p>
              {cliente.telefono && <p>Teléfono: {cliente.telefono}</p>}
              {cliente.municipio && <p>Municipio: {cliente.municipio}</p>}
              <p>Vendedor: {cliente.vendedor}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setMontoPromesa(''); setModalGestionAbierto(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Nueva Gestión
            </button>
          </div>
        </div>
      </div>

      {/* Información del Crédito */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Saldo Actual</div>
          <div className="text-2xl font-bold text-red-600">{formatearPesos(cliente.saldo)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Abonado</div>
          <div className="text-2xl font-bold text-green-600">{formatearPesos(cliente.abono)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Días de Mora</div>
          <div className={`text-2xl font-bold ${cliente.diasMora > 30 ? 'text-red-600' : 'text-yellow-600'}`}>
            {cliente.diasMora} días
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Cuota</div>
          <div className="text-2xl font-bold">{formatearPesos(cliente.montoCuota)}</div>
          <div className="text-xs text-gray-500 mt-1">{cliente.periodosPago}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Artículo</div>
          <div className="font-medium">{cliente.articulo}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Fecha de Inicio</div>
          <div className="font-medium">{formatearFecha(cliente.fechaInicio)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Último Abono</div>
          <div className="font-medium">{formatearFecha(cliente.ultimaFechaAbono)}</div>
        </div>
      </div>

      <CrmFichaSeguimiento key={id} creditoId={id!} onActualizado={() => cargarDatos(false)} />

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b flex">
          <button
            onClick={() => setVistaActiva('gestiones')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              vistaActiva === 'gestiones'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Gestiones ({gestiones.length})
          </button>
          <button
            onClick={() => setVistaActiva('pagos')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              vistaActiva === 'pagos'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Pagos ({pagos.length})
          </button>
          <button
            onClick={() => setVistaActiva('cambios')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              vistaActiva === 'cambios'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Historial ({cambios.length})
          </button>
        </div>

        {/* Contenido Gestiones */}
        {vistaActiva === 'gestiones' && (
          <div className="p-6">
            {gestiones.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay gestiones registradas para este cliente
              </div>
            ) : (
              <div className="space-y-4">
                {gestiones.map((gestion) => (
                  <div key={gestion.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium capitalize">
                          {gestion.tipoGestion === 'gestion_grupo' ? 'Gestión de grupo' : gestion.tipoGestion.replace(/_/g, ' ')}
                        </span>
                        {gestion.canal !== 'no_especificado' && (
                          <span className="text-gray-500 text-sm ml-2">vía {gestion.canal}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatearFechaHora(gestion.fechaGestion)}
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className="text-sm font-medium">Resultado: </span>
                      <span className="text-sm capitalize">{gestion.resultado.replace(/_/g, ' ')}</span>
                    </div>
                    {gestion.notas && (
                      <div className="text-sm text-gray-700 mb-2">{gestion.notas}</div>
                    )}
                    {(gestion.proximaAccion || gestion.fechaProximaAccion) && (
                      <div className="text-sm bg-blue-50 text-blue-800 p-2 rounded">
                        <span className="font-medium">Próxima acción:</span> {gestion.proximaAccion}
                        {gestion.fechaProximaAccion && (
                          <span className="ml-2">
                            ({formatearFecha(gestion.fechaProximaAccion)})
                          </span>
                        )}
                        {gestion.fechaProximaAccion && (
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span>{gestion.seguimientoCerradoEn ? 'Atendido' : 'Pendiente'}</span>
                            <button
                              onClick={() => cambiarSeguimiento(gestion)}
                              disabled={guardandoSeguimiento !== null}
                              title={gestion.seguimientoCerradoEn ? 'Reabrir seguimiento' : 'Marcar seguimiento como atendido'}
                              className="inline-flex items-center gap-1 border rounded px-2 py-1 disabled:opacity-50"
                            >
                              {gestion.seguimientoCerradoEn ? <RotateCcw size={14} /> : <Check size={14} />}
                              {gestion.seguimientoCerradoEn ? 'Reabrir' : 'Atendido'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      Por: {gestion.nombreUsuario}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contenido Pagos */}
        {vistaActiva === 'pagos' && (
          <div className="p-6">
            {pagos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay pagos registrados para este cliente
              </div>
            ) : (
              <div className="space-y-3">
                {pagos.map((pago) => (
                  <div key={pago.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-green-600 text-lg">
                          {formatearPesos(pago.monto)}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {formatearFecha(pago.fechaPago)} • {pago.metodoPago}
                        </div>
                        {pago.referencia && (
                          <div className="text-sm text-gray-500">Ref: {pago.referencia}</div>
                        )}
                        {pago.notas && (
                          <div className="text-sm text-gray-700 mt-2">{pago.notas}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">Por: {pago.nombreUsuario}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contenido Cambios */}
        {vistaActiva === 'cambios' && (
          <div className="p-6">
            {cambios.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No hay cambios registrados
              </div>
            ) : (
              <div className="space-y-2">
                {cambios.map((cambio) => (
                  <div key={cambio.id} className="border-l-4 border-gray-300 pl-4 py-2">
                    <div className="text-sm">
                      <span className="font-medium capitalize">{cambio.campo.replace(/_/g, ' ')}</span>
                      {' cambió de '}
                      <span className="bg-red-100 px-1">{cambio.valorAnterior || '(vacío)'}</span>
                      {' a '}
                      <span className="bg-green-100 px-1">{cambio.valorNuevo}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatearFechaHora(cambio.fecha)} • {cambio.nombreUsuario}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Registrar Gestión */}
      {modalGestionAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h3 className="text-xl font-semibold">Registrar Gestión</h3>
              <p className="text-sm text-gray-600">
                {cliente.cliente} - Crédito #{cliente.numero}
              </p>
            </div>

          <form onSubmit={registrarGestion} className="p-6">
            {esPromesa && <label className="block text-sm font-medium mb-4">Monto prometido (COP)<input type="number" min="1" step="1" required value={montoPromesa} onChange={e => setMontoPromesa(e.target.value)} className="block mt-1 w-full border rounded px-3 py-2" /></label>}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de Gestión</label>
                  <select
                    value={formGestion.tipoGestion}
                    onChange={(e) =>
                      setFormGestion({ ...formGestion, tipoGestion: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    <option value="llamada">Llamada</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="visita">Visita domicilio</option>
                    <option value="visita_fallida">Visita fallida - No encontrado</option>
                    <option value="promesa_pago">Promesa de Pago</option>
                    <option value="acuerdo">Acuerdo de Pago</option>
                    <option value="cambio_ubicacion">Cambio de Ubicación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Canal</label>
                  <select
                    value={formGestion.canal}
                    onChange={(e) => setFormGestion({ ...formGestion, canal: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    <option value="telefono">Teléfono</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="presencial">Presencial</option>
                    <option value="email">Email</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Resultado</label>
                <select
                  value={formGestion.resultado}
                  onChange={(e) => setFormGestion({ ...formGestion, resultado: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                >
                  <option value="contacto_efectivo">Contacto Efectivo</option>
                  <option value="no_contesta">No Contesta</option>
                  <option value="no_localizado">No Localizado en Domicilio</option>
                  <option value="cambio_direccion">Cliente Cambió de Dirección</option>
                  <option value="promesa_pago">Promesa de Pago</option>
                  <option value="compromiso_incumplido">Compromiso Incumplido</option>
                  <option value="refinanciacion">Solicita Refinanciación</option>
                  <option value="cliente_molesto">Cliente Molesto</option>
                  <option value="numero_equivocado">Número Equivocado</option>
                  <option value="telefono_apagado">Teléfono Apagado/Fuera de Servicio</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Notas</label>
                <textarea
                  value={formGestion.notas}
                  onChange={(e) => setFormGestion({ ...formGestion, notas: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                  placeholder="Detalles de la gestión..."
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Próxima Acción</label>
                <input
                  type="text"
                  value={formGestion.proximaAccion}
                  onChange={(e) =>
                    setFormGestion({ ...formGestion, proximaAccion: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Ej: Llamar nuevamente, enviar recordatorio..."
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-1">Fecha Próxima Acción</label>
                <input
                  type="date"
                  value={formGestion.fechaProximaAccion}
                  required={esPromesa}
                  onChange={(e) =>
                    setFormGestion({ ...formGestion, fechaProximaAccion: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalGestionAbierto(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {guardandoGestion ? 'Guardando...' : esPromesa ? 'Registrar promesa' : 'Registrar Gestión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
