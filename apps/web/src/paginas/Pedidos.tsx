import { useState, useEffect } from 'react';

interface ProductoPedido {
  nombre: string;
  precio: number;
  cantidad: number;
}

interface Pedido {
  id: string;
  conversacionId?: string;
  telefono: string;
  nombreCliente: string;
  direccion: string;
  productos: ProductoPedido[];
  total: number;
  estado: string;
  notas: string;
  creadoEn: string;
  actualizadoEn: string;
}

export function PaginaPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    cargarPedidos();

    // Actualizar cada 10 segundos
    const interval = setInterval(cargarPedidos, 10000);
    return () => clearInterval(interval);
  }, []);

  const cargarPedidos = async () => {
    try {
      console.log('📦 Cargando pedidos desde API...');
      const res = await fetch('/api/admin/pedidos', {
        credentials: 'include'
      });
      console.log('📦 Respuesta API status:', res.status);

      if (!res.ok) {
        console.error('❌ Error en la respuesta:', res.statusText);
        return;
      }

      const data = await res.json();
      console.log('📦 Datos recibidos:', data);
      console.log('📦 Número de pedidos:', data.pedidos?.length || 0);

      setPedidos(data.pedidos || []);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    }
  };

  const actualizarEstado = async (pedidoId: string, nuevoEstado: string) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/admin/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ estado: nuevoEstado })
      });

      if (res.ok) {
        cargarPedidos();
      }
    } catch (error) {
      console.error('Error actualizando estado:', error);
    }
    setCargando(false);
  };

  const pedidosFiltrados = filtroEstado === 'todos'
    ? pedidos
    : pedidos.filter(p => p.estado === filtroEstado);

  const estadoColor = (estado: string) => {
    switch (estado) {
      case 'pendiente': return '#f59e0b';
      case 'confirmado': return '#3b82f6';
      case 'enviado': return '#8b5cf6';
      case 'entregado': return '#10b981';
      case 'cancelado': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const estadoTexto = (estado: string) => {
    switch (estado) {
      case 'pendiente': return 'Pendiente';
      case 'confirmado': return 'Confirmado';
      case 'enviado': return 'Enviado';
      case 'entregado': return 'Entregado';
      case 'cancelado': return 'Cancelado';
      default: return estado;
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '30px', color: '#111827' }}>
        Gestión de Pedidos WhatsApp
      </h1>

      {/* Filtros */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '30px',
        flexWrap: 'wrap'
      }}>
        {['todos', 'pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'].map(estado => (
          <button
            key={estado}
            onClick={() => setFiltroEstado(estado)}
            style={{
              padding: '10px 20px',
              backgroundColor: filtroEstado === estado ? '#3b82f6' : '#f3f4f6',
              color: filtroEstado === estado ? '#fff' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              textTransform: 'capitalize'
            }}
          >
            {estado === 'todos' ? 'Todos' : estadoTexto(estado)} ({estado === 'todos' ? pedidos.length : pedidos.filter(p => p.estado === estado).length})
          </button>
        ))}
      </div>

      {/* Estadísticas rápidas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '30px'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>
            {pedidos.filter(p => p.estado === 'pendiente').length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Pendientes
          </div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>
            {pedidos.filter(p => p.estado === 'confirmado').length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Confirmados
          </div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>
            {pedidos.filter(p => p.estado === 'entregado').length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Entregados
          </div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#111827' }}>
            ${pedidos.reduce((sum, p) => sum + p.total, 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Total
          </div>
        </div>
      </div>

      {/* Lista de pedidos */}
      {pedidosFiltrados.length === 0 ? (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px'
        }}>
          <p style={{ fontSize: '16px', color: '#6b7280' }}>
            No hay pedidos {filtroEstado !== 'todos' ? `en estado "${estadoTexto(filtroEstado)}"` : ''}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {pedidosFiltrados.map((pedido) => (
            <div
              key={pedido.id}
              style={{
                padding: '24px',
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              {/* Header del pedido */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                    {pedido.nombreCliente}
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    📱 {pedido.telefono}
                  </div>
                </div>
                <div style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  backgroundColor: estadoColor(pedido.estado) + '20',
                  color: estadoColor(pedido.estado),
                  fontSize: '14px',
                  fontWeight: '600',
                  alignSelf: 'flex-start'
                }}>
                  {estadoTexto(pedido.estado)}
                </div>
              </div>

              {/* Información del pedido */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
                  📍 <strong>Dirección:</strong> {pedido.direccion || 'No especificada'}
                </div>

                {pedido.notas && (
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
                    📝 <strong>Notas:</strong> {pedido.notas}
                  </div>
                )}

                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
                  📅 <strong>Fecha:</strong> {new Date(pedido.creadoEn).toLocaleString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>

              {/* Productos */}
              <div style={{
                backgroundColor: '#f9fafb',
                padding: '16px',
                borderRadius: '6px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                  🛒 Productos:
                </div>
                {pedido.productos.map((prod, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '14px',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    <span>{prod.nombre} x{prod.cantidad}</span>
                    <span style={{ fontWeight: '600' }}>${prod.precio.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '2px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#111827'
                }}>
                  <span>TOTAL:</span>
                  <span>${pedido.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {pedido.estado === 'pendiente' && (
                  <>
                    <button
                      onClick={() => actualizarEstado(pedido.id, 'confirmado')}
                      disabled={cargando}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: cargando ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      ✓ Confirmar
                    </button>
                    <button
                      onClick={() => actualizarEstado(pedido.id, 'cancelado')}
                      disabled={cargando}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: cargando ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      ✗ Cancelar
                    </button>
                  </>
                )}

                {pedido.estado === 'confirmado' && (
                  <button
                    onClick={() => actualizarEstado(pedido.id, 'enviado')}
                    disabled={cargando}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#8b5cf6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: cargando ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    🚚 Marcar como Enviado
                  </button>
                )}

                {pedido.estado === 'enviado' && (
                  <button
                    onClick={() => actualizarEstado(pedido.id, 'entregado')}
                    disabled={cargando}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: cargando ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    ✓ Marcar como Entregado
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
