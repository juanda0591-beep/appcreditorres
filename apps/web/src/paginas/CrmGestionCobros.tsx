import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

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
  const [vistaModal, setVistaModal] = useState<'gestion' | 'whatsapp'>('gestion');
  const [formGestion, setFormGestion] = useState({
    tipoGestion: 'llamada',
    canal: 'telefono',
    resultado: 'contacto_efectivo',
    notas: '',
    proximaAccion: '',
    fechaProximaAccion: '',
  });

  // WhatsApp
  const [whatsappConectado, setWhatsappConectado] = useState(false);
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<string>('');
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState('');
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);

  // IA
  const [analisisIA, setAnalisisIA] = useState<any>(null);
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false);
  const [generandoMensaje, setGenerandoMensaje] = useState(false);

  useEffect(() => {
    cargarDatos();
    cargarEstadoWhatsapp();
    cargarPlantillas();
  }, []);

  async function cargarEstadoWhatsapp() {
    try {
      const res = await fetch('/api/admin/crm/whatsapp/estado');
      const data = await res.json();
      setWhatsappConectado(data.conectado || false);
    } catch (error) {
      console.error('Error al cargar estado de WhatsApp:', error);
    }
  }

  async function cargarPlantillas() {
    try {
      const res = await fetch('/api/admin/crm/plantillas');
      const data = await res.json();
      setPlantillas(data.plantillas || []);
    } catch (error) {
      console.error('Error al cargar plantillas:', error);
    }
  }

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
    setVistaModal('gestion');
    setFormGestion({
      tipoGestion: 'llamada',
      canal: 'telefono',
      resultado: 'contacto_efectivo',
      notas: '',
      proximaAccion: '',
      fechaProximaAccion: '',
    });
    setMensajeWhatsapp('');
    setPlantillaSeleccionada('');
    setModalAbierto(true);
  }

  async function aplicarPlantilla(plantillaId: string) {
    if (!clienteSeleccionado || !plantillaId) return;

    try {
      const res = await fetch(`/api/admin/crm/plantillas/${plantillaId}/previsualizar?carteraClienteId=${clienteSeleccionado.id}`);
      const data = await res.json();
      setMensajeWhatsapp(data.mensaje || '');
    } catch (error) {
      console.error('Error al aplicar plantilla:', error);
    }
  }

  async function enviarWhatsapp() {
    if (!clienteSeleccionado || !mensajeWhatsapp.trim()) return;

    setEnviandoWhatsapp(true);
    try {
      const res = await fetch('/api/admin/crm/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carteraClienteId: clienteSeleccionado.id,
          mensaje: mensajeWhatsapp,
        }),
      });

      if (res.ok) {
        alert('Mensaje enviado y gestión registrada exitosamente');
        setModalAbierto(false);
        cargarDatos();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error al enviar WhatsApp:', error);
      alert('Error al enviar mensaje');
    } finally {
      setEnviandoWhatsapp(false);
    }
  }

  async function analizarConIA() {
    if (!clienteSeleccionado) return;

    setCargandoAnalisis(true);
    try {
      const res = await fetch(`/api/admin/crm/ia/analizar/${clienteSeleccionado.id}`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setAnalisisIA(data.analisis);
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error al analizar con IA:', error);
      alert('Error al analizar cliente');
    } finally {
      setCargandoAnalisis(false);
    }
  }

  async function redactarConIA(tono: 'amable' | 'firme' | 'urgente') {
    if (!clienteSeleccionado) return;

    setGenerandoMensaje(true);
    try {
      const res = await fetch('/api/admin/crm/ia/redactar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carteraClienteId: clienteSeleccionado.id,
          tono,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMensajeWhatsapp(data.mensaje);
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error al generar mensaje:', error);
      alert('Error al generar mensaje con IA');
    } finally {
      setGenerandoMensaje(false);
    }
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

  function obtenerColorGestion(ultimaGestion: string | null): {
    fondo: string;
    borde: string;
    etiqueta: string;
    texto: string;
  } {
    if (!ultimaGestion) {
      return {
        fondo: 'bg-red-50',
        borde: 'border-l-4 border-red-500',
        etiqueta: 'Sin gestión',
        texto: 'text-red-700',
      };
    }

    // Normalizar fechas a medianoche local para comparar días calendario
    const fechaGestion = new Date(ultimaGestion);
    fechaGestion.setHours(0, 0, 0, 0);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const diffDias = Math.floor((hoy.getTime() - fechaGestion.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDias === 0) {
      return {
        fondo: 'bg-green-50',
        borde: 'border-l-4 border-green-500',
        etiqueta: 'Hoy',
        texto: 'text-green-700',
      };
    }
    if (diffDias <= 3) {
      return {
        fondo: 'bg-yellow-50',
        borde: 'border-l-4 border-yellow-500',
        etiqueta: `Hace ${diffDias} día${diffDias > 1 ? 's' : ''}`,
        texto: 'text-yellow-700',
      };
    }
    return {
      fondo: 'bg-red-50',
      borde: 'border-l-4 border-red-500',
      etiqueta: diffDias > 7 ? 'Sin gestión reciente' : `Hace ${diffDias} días`,
      texto: 'text-red-700',
    };
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
                {gestionesPendientes.map(({ gestion, cliente }) => {
                  const colores = obtenerColorGestion(cliente.ultimaGestion);
                  return (
                    <div key={gestion.id} className={`p-4 ${colores.fondo} ${colores.borde} hover:bg-gray-100`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{cliente.cliente}</div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${colores.texto} bg-white`}>
                              {colores.etiqueta}
                            </span>
                          </div>
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
                  );
                })}
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
                    {clientesPrioritarios.map(({ cliente, ultimaGestion, totalGestiones }) => {
                      const colores = obtenerColorGestion(ultimaGestion);
                      return (
                        <tr key={cliente.id} className={`${colores.fondo} ${colores.borde} hover:bg-gray-100`}>
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
                          <td className="px-4 py-3 text-center">
                            <div className="text-sm text-gray-600">{formatearFecha(ultimaGestion)}</div>
                            <div className={`text-xs font-medium ${colores.texto}`}>{colores.etiqueta}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm">{totalGestiones}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex gap-2 justify-center">
                              {whatsappConectado && cliente.telefono && (
                                <button
                                  onClick={() => {
                                    abrirModalGestion(cliente);
                                    setVistaModal('whatsapp');
                                  }}
                                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                                  title="Enviar WhatsApp"
                                >
                                  <MessageSquare size={14} />
                                  WhatsApp
                                </button>
                              )}
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
                      );
                    })}
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
              <h3 className="text-xl font-semibold">Gestión de Cobro</h3>
              <p className="text-sm text-gray-600">
                {clienteSeleccionado.cliente} - Crédito #{clienteSeleccionado.numero}
              </p>
            </div>

            {/* Pestañas */}
            <div className="flex border-b">
              <button
                onClick={() => setVistaModal('gestion')}
                className={`flex-1 px-6 py-3 font-medium transition ${
                  vistaModal === 'gestion'
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Registrar Gestión
              </button>
              <button
                onClick={() => setVistaModal('whatsapp')}
                className={`flex-1 px-6 py-3 font-medium transition flex items-center justify-center gap-2 ${
                  vistaModal === 'whatsapp'
                    ? 'bg-green-50 text-green-600 border-b-2 border-green-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <MessageSquare size={18} />
                WhatsApp
              </button>
            </div>

            {/* Contenido - Gestión */}
            {vistaModal === 'gestion' && (
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
            )}

            {/* Contenido - WhatsApp */}
            {vistaModal === 'whatsapp' && (
              <div className="p-6">
                {!whatsappConectado ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      WhatsApp no está conectado. No puedes enviar mensajes en este momento.
                    </p>
                  </div>
                ) : !clienteSeleccionado.telefono ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      Este cliente no tiene teléfono registrado.
                    </p>
                  </div>
                ) : null}

                {/* Análisis de IA */}
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-blue-900">Análisis de IA</h4>
                    <button
                      onClick={analizarConIA}
                      disabled={cargandoAnalisis}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {cargandoAnalisis ? 'Analizando...' : 'Analizar Cliente'}
                    </button>
                  </div>

                  {analisisIA && (
                    <div className="mt-2 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Probabilidad de pago:</span>
                        <span className="font-medium">
                          {(analisisIA.probabilidadPago * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Riesgo:</span>
                        <span
                          className={`font-medium px-2 py-0.5 rounded text-xs ${
                            analisisIA.riesgoMorosidad === 'critico'
                              ? 'bg-red-100 text-red-800'
                              : analisisIA.riesgoMorosidad === 'alto'
                              ? 'bg-orange-100 text-orange-800'
                              : analisisIA.riesgoMorosidad === 'medio'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {analisisIA.riesgoMorosidad.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Acción sugerida:</span>
                        <p className="font-medium mt-1">{analisisIA.accionSugerida}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Razonamiento:</span>
                        <p className="text-gray-700 mt-1 text-xs">{analisisIA.razonamiento}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Generar mensaje con IA */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Redactar con IA</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => redactarConIA('amable')}
                      disabled={generandoMensaje || !whatsappConectado || !clienteSeleccionado.telefono}
                      className="flex-1 px-3 py-2 text-sm border border-green-300 bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      Tono Amable
                    </button>
                    <button
                      onClick={() => redactarConIA('firme')}
                      disabled={generandoMensaje || !whatsappConectado || !clienteSeleccionado.telefono}
                      className="flex-1 px-3 py-2 text-sm border border-yellow-300 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      Tono Firme
                    </button>
                    <button
                      onClick={() => redactarConIA('urgente')}
                      disabled={generandoMensaje || !whatsappConectado || !clienteSeleccionado.telefono}
                      className="flex-1 px-3 py-2 text-sm border border-red-300 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      Tono Urgente
                    </button>
                  </div>
                  {generandoMensaje && (
                    <p className="text-xs text-gray-500 mt-1">Generando mensaje personalizado...</p>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Plantilla</label>
                  <select
                    value={plantillaSeleccionada}
                    onChange={(e) => {
                      setPlantillaSeleccionada(e.target.value);
                      if (e.target.value) {
                        aplicarPlantilla(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded"
                    disabled={!whatsappConectado || !clienteSeleccionado.telefono}
                  >
                    <option value="">-- Selecciona una plantilla --</option>
                    {plantillas.filter(p => p.activa).map((plantilla) => (
                      <option key={plantilla.id} value={plantilla.id}>
                        {plantilla.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Mensaje</label>
                  <textarea
                    value={mensajeWhatsapp}
                    onChange={(e) => setMensajeWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    rows={6}
                    placeholder="Escribe tu mensaje, selecciona una plantilla o genera uno con IA..."
                    disabled={!whatsappConectado || !clienteSeleccionado.telefono}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    El mensaje se enviará a: {clienteSeleccionado.telefono || 'Sin teléfono'}
                  </p>
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
                    type="button"
                    onClick={enviarWhatsapp}
                    disabled={!whatsappConectado || !clienteSeleccionado.telefono || !mensajeWhatsapp.trim() || enviandoWhatsapp}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {enviandoWhatsapp ? 'Enviando...' : 'Enviar WhatsApp'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
