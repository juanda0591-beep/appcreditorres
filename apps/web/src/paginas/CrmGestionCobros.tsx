import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface ClientePrioritario {
  cliente: {
    id: string;
    numero: string;
    cliente: string;
    cedula: string;
    telefono: string | null;
    saldo: number;
    diasMora: number;
    estado: string;
    vendedor: string;
  };
  ultimaGestion: string | null;
  totalGestiones: number;
}

interface Gestion {
  id: string;
  carteraClienteId: string;
  fechaGestion: string;
  tipoGestion: string;
  canal: string;
  resultado: string;
  notas: string | null;
  proximaAccion: string | null;
  fechaProximaAccion: string | null;
  usuarioId: string;
  nombreUsuario: string;
}

interface GestionConCliente {
  gestion: Gestion;
  cliente: any;
}

export default function CrmGestionCobros() {
  const [clientesPrioritarios, setClientesPrioritarios] = useState<ClientePrioritario[]>([]);
  const [gestionesPendientes, setGestionesPendientes] = useState<GestionConCliente[]>([]);
  const [cargando, setCargando] = useState(true);

  // Modal de gestión
  const [modalAbierto, setModalAbierto] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null);
  const [formGestion, setFormGestion] = useState({
    tipoGestion: 'llamada',
    canal: 'telefono',
    resultado: 'contacto_efectivo',
    notas: '',
    proximaAccion: '',
    fechaProximaAccion: '',
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    try {
      const [resPrioritarios, resPendientes] = await Promise.all([
        fetch('/api/admin/crm/gestiones/prioritarios'),
        fetch('/api/admin/crm/gestiones/pendientes'),
      ]);

      const dataPrioritarios = await resPrioritarios.json();
      const dataPendientes = await resPendientes.json();

      setClientesPrioritarios(dataPrioritarios.clientes || []);
      setGestionesPendientes(dataPendientes.gestiones || []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setCargando(false);
    }
  }

  function abrirModalGestion(cliente: any) {
    setClienteSeleccionado(cliente);
    setFormGestion({
      tipoGestion: 'llamada',
      canal: 'telefono',
      resultado: 'contacto_efectivo',
      notas: '',
      proximaAccion: '',
      fechaProximaAccion: '',
    });
    setModalAbierto(true);
  }

  async function registrarGestion(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await fetch('/api/admin/crm/gestiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carteraClienteId: clienteSeleccionado.id,
          ...formGestion,
        }),
      });

      if (res.ok) {
        alert('Gestión registrada exitosamente');
        setModalAbierto(false);
        cargarDatos();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error al registrar gestión:', error);
      alert('Error al registrar gestión');
    }
  }

  function obtenerColorGestion(ultimaGestion: string | null): string {
    if (!ultimaGestion) return 'bg-red-50'; // Sin gestión - prioritario

    const fechaUltimaGestion = new Date(ultimaGestion);
    const hoy = new Date();
    const diffDias = Math.floor((hoy.getTime() - fechaUltimaGestion.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDias === 0) return 'bg-green-50'; // Gestión hoy
    if (diffDias <= 3) return 'bg-yellow-50'; // Gestión últimos 3 días
    return 'bg-red-50'; // Sin gestión reciente - prioritario
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
    return new Date(fecha).toLocaleDateString('es-CO');
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestión de Cobros</h1>
        <Link
          to="/crm/cartera"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Ver Cartera Completa
        </Link>
      </div>

      {cargando ? (
        <div className="text-center py-8">Cargando...</div>
      ) : (
        <>
          {/* Leyenda de colores */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3">Código de colores por última gestión:</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-50 border border-green-200 rounded"></div>
                <span className="text-sm">Gestión hoy</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-50 border border-yellow-200 rounded"></div>
                <span className="text-sm">Gestión últimos 3 días</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-50 border border-red-200 rounded"></div>
                <span className="text-sm">Sin gestión reciente (prioritario)</span>
              </div>
            </div>
          </div>

          {/* Gestiones Pendientes */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">
                Seguimientos Pendientes ({gestionesPendientes.length})
              </h2>
              <p className="text-sm text-gray-600">
                Clientes con promesas de pago o acciones programadas para hoy
              </p>
            </div>

            {gestionesPendientes.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No hay seguimientos pendientes para hoy
              </div>
            ) : (
              <div className="divide-y">
                {gestionesPendientes.map(({ gestion, cliente }) => (
                  <div key={gestion.id} className={`p-4 hover:bg-gray-100 ${obtenerColorGestion(cliente.ultimaGestion)}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium">{cliente.cliente}</div>
                        <div className="text-sm text-gray-600">
                          Crédito #{cliente.numero} • {formatearPesos(cliente.saldo)} •{' '}
                          {cliente.diasMora} días mora
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="font-medium">Última gestión:</span>{' '}
                          {formatearFecha(gestion.fechaGestion)} •{' '}
                          <span className="capitalize">{gestion.resultado.replace(/_/g, ' ')}</span>
                        </div>
                        {gestion.proximaAccion && (
                          <div className="mt-1 text-sm text-blue-600">
                            <span className="font-medium">Acción:</span> {gestion.proximaAccion}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirModalGestion(cliente)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Nueva Gestión
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clientes Prioritarios */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">
                Clientes Prioritarios ({clientesPrioritarios.length})
              </h2>
              <p className="text-sm text-gray-600">
                Clientes en mora que requieren seguimiento: cambio de ubicación, no localizado, promesas incumplidas
              </p>
            </div>

            {clientesPrioritarios.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No hay clientes prioritarios en este momento
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Cliente
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Vendedor
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Saldo
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Días Mora
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Última Gestión
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Total Gestiones
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {clientesPrioritarios.map(({ cliente, ultimaGestion, totalGestiones }) => (
                      <tr key={cliente.id} className={`hover:bg-gray-100 ${obtenerColorGestion(ultimaGestion)}`}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{cliente.cliente}</div>
                          <div className="text-xs text-gray-500">
                            #{cliente.numero} • {cliente.cedula}
                          </div>
                          {cliente.telefono && (
                            <div className="text-xs text-gray-500">{cliente.telefono}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{cliente.vendedor}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                          {formatearPesos(cliente.saldo)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">
                            {cliente.diasMora} días
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {formatearFecha(ultimaGestion)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">{totalGestiones}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => abrirModalGestion(cliente)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Gestionar
                            </button>
                            <Link
                              to={`/crm/cartera/${cliente.id}`}
                              className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                            >
                              Ver
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Registrar Gestión */}
      {modalAbierto && clienteSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h3 className="text-xl font-semibold">Registrar Gestión</h3>
              <p className="text-sm text-gray-600">
                {clienteSeleccionado.cliente} - Crédito #{clienteSeleccionado.numero}
              </p>
            </div>

            <form onSubmit={registrarGestion} className="p-6">
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
                  onChange={(e) =>
                    setFormGestion({ ...formGestion, fechaProximaAccion: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Registrar Gestión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
