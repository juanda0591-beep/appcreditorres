import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Pedido {
  id: string;
  estado: string;
}

interface Conversacion {
  id: string;
  telefono: string;
  nombreCliente: string | null;
  estado: string;
  ultimoMensaje: string | null;
  creadoEn: string;
  actualizadoEn: string;
  cantidadMensajes: number;
  tienePedidos: boolean;
  pedidos: Pedido[];
}

interface Mensaje {
  id: string;
  conversacionId: string;
  rol: 'user' | 'assistant';
  contenido: string;
  metadata: { productos?: string[] } | null;
  creadoEn: string;
}

interface PedidoDetalle {
  id: string;
  telefono: string;
  nombreCliente: string;
  direccion: string | null;
  productos: Array<{ nombre: string; cantidad: number; precio: number }>;
  total: number;
  estado: string;
  zona: string | null;
  notas: string | null;
  creadoEn: string;
}

interface DetalleConversacion {
  conversacion: Conversacion;
  mensajes: Mensaje[];
  pedidos: PedidoDetalle[];
}

export function Conversaciones() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleConversacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarConversaciones();
  }, []);

  async function cargarConversaciones() {
    try {
      setCargando(true);
      setError(null);
      const res = await fetch('/api/admin/conversaciones', {
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Error al cargar conversaciones');
      }

      const data = await res.json();
      setConversaciones(data.conversaciones);
    } catch (err) {
      setError('Error al cargar conversaciones');
      console.error(err);
    } finally {
      setCargando(false);
    }
  }

  async function cargarDetalle(conversacionId: string) {
    try {
      setCargandoDetalle(true);
      setError(null);
      const res = await fetch(`/api/admin/conversaciones/${conversacionId}`, {
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Error al cargar detalle');
      }

      const data = await res.json();
      setDetalle(data);
      setConversacionSeleccionada(conversacionId);
    } catch (err) {
      setError('Error al cargar detalle de conversación');
      console.error(err);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function formatearFecha(fecha: string) {
    return new Date(fecha).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatearTelefono(telefono: string) {
    // Eliminar caracteres no numéricos excepto el +
    const limpio = telefono.replace(/[^\d+]/g, '');
    // Formato: +57 322 404 5884
    if (limpio.startsWith('+57') && limpio.length === 13) {
      return `+57 ${limpio.slice(3, 6)} ${limpio.slice(6, 9)} ${limpio.slice(9)}`;
    }
    return limpio;
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-sky-400">Cargando conversaciones...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-slate-50">Historial de Conversaciones WhatsApp</h1>
          <Link to="/admin" className="text-sm text-slate-400 hover:text-sky-400 transition-colors">
            ← Volver al panel
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Lista de conversaciones */}
          <div className="col-span-12 lg:col-span-5 bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-sm font-medium text-slate-300">
                {conversaciones.length} conversaciones
              </h2>
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-240px)]">
              {conversaciones.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No hay conversaciones todavía
                </div>
              ) : (
                conversaciones.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => cargarDetalle(conv.id)}
                    className={`w-full text-left p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors ${
                      conversacionSeleccionada === conv.id ? 'bg-slate-800/70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-200">
                            {conv.nombreCliente || formatearTelefono(conv.telefono)}
                          </span>
                          {conv.tienePedidos && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-sky-950/50 text-sky-400 border border-sky-900/50">
                              {conv.pedidos.length} pedido{conv.pedidos.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {conv.nombreCliente && (
                          <div className="text-xs text-slate-500 mb-1">
                            {formatearTelefono(conv.telefono)}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 ml-2">
                        {formatearFecha(conv.actualizadoEn).split(',')[0]}
                      </div>
                    </div>

                    {conv.ultimoMensaje && (
                      <p className="text-xs text-slate-400 truncate">
                        {conv.ultimoMensaje}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span>{conv.cantidadMensajes} mensajes</span>
                      {conv.pedidos.length > 0 && (
                        <span className="flex items-center gap-1">
                          {conv.pedidos.map(p => p.estado).join(', ')}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detalle de conversación */}
          <div className="col-span-12 lg:col-span-7 bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
            {!detalle && !cargandoDetalle && (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Selecciona una conversación para ver el detalle
              </div>
            )}

            {cargandoDetalle && (
              <div className="flex-1 flex items-center justify-center text-sky-400 text-sm">
                Cargando detalle...
              </div>
            )}

            {detalle && !cargandoDetalle && (
              <>
                {/* Header */}
                <div className="p-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-medium text-slate-200">
                        {detalle.conversacion.nombreCliente || formatearTelefono(detalle.conversacion.telefono)}
                      </h2>
                      {detalle.conversacion.nombreCliente && (
                        <p className="text-sm text-slate-500">
                          {formatearTelefono(detalle.conversacion.telefono)}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      detalle.conversacion.estado === 'activa'
                        ? 'bg-green-950/50 text-green-400 border border-green-900/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {detalle.conversacion.estado}
                    </span>
                  </div>
                </div>

                {/* Pedidos asociados */}
                {detalle.pedidos.length > 0 && (
                  <div className="p-4 border-b border-slate-800 bg-slate-900/80">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                      Pedidos ({detalle.pedidos.length})
                    </h3>
                    <div className="space-y-2">
                      {detalle.pedidos.map((pedido) => (
                        <div key={pedido.id} className="p-3 bg-slate-800/50 rounded border border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono text-slate-400">#{pedido.id.slice(0, 8)}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              pedido.estado === 'completado'
                                ? 'bg-green-950/50 text-green-400 border border-green-900/50'
                                : pedido.estado === 'pendiente'
                                ? 'bg-amber-950/50 text-amber-400 border border-amber-900/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {pedido.estado}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs text-slate-300">
                            {pedido.productos.map((prod, idx) => (
                              <div key={idx}>
                                {prod.cantidad}x {prod.nombre} - ${prod.precio.toLocaleString()}
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Total</span>
                            <span className="font-medium text-slate-200">${pedido.total.toLocaleString()}</span>
                          </div>
                          {pedido.zona && (
                            <div className="mt-1 text-xs text-slate-500">
                              📍 {pedido.zona}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mensajes */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-400px)]">
                  {detalle.mensajes.map((mensaje) => (
                    <div
                      key={mensaje.id}
                      className={`flex ${mensaje.rol === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${
                        mensaje.rol === 'user'
                          ? 'bg-sky-950/50 border border-sky-900/50'
                          : 'bg-slate-800/50 border border-slate-700'
                      } rounded-lg p-3`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-400">
                            {mensaje.rol === 'user' ? 'Cliente' : 'María IA'}
                          </span>
                          <span className="text-xs text-slate-600">
                            {formatearFecha(mensaje.creadoEn).split(',')[1]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 whitespace-pre-wrap">
                          {mensaje.contenido}
                        </p>
                        {mensaje.metadata?.productos && mensaje.metadata.productos.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-700">
                            <div className="flex flex-wrap gap-1">
                              {mensaje.metadata.productos.map((prod, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-900/50 text-slate-400 border border-slate-700"
                                >
                                  {prod}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
