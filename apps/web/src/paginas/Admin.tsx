import { useState, useEffect } from 'react';

interface EstadoWhatsApp {
  conectado: boolean;
  qrCode: string | null;
}

interface ConfigIA {
  apiKey: string;
  modelo?: string;
  temperatura?: number;
  maxTokens?: number;
  promptSistema?: string;
}

interface LogMensaje {
  id: string;
  telefono: string;
  mensaje: string;
  respuesta: string;
  timestamp: number;
  exitoso: boolean;
}

interface Estadisticas {
  mensajesRecibidos: number;
  mensajesEnviados: number;
  mensajesExitosos: number;
  mensajesError: number;
  fecha: string;
}

interface Conversacion {
  telefono: string;
  mensajes: Array<{ role: 'user' | 'assistant', content: string, productos?: string[] }>;
  ultimoMensaje: string;
  cantidadMensajes: number;
}

interface ProductoEstadistica {
  nombre: string;
  menciones: number;
}

export function PaginaAdmin() {
  const [estadoWA, setEstadoWA] = useState<EstadoWhatsApp>({ conectado: false, qrCode: null });
  const [estadoIA, setEstadoIA] = useState<any>(null);
  const [logs, setLogs] = useState<LogMensaje[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<string | null>(null);
  const [productosConsultados, setProductosConsultados] = useState<ProductoEstadistica[]>([]);
  const [configIA, setConfigIA] = useState<ConfigIA>({
    apiKey: '',
    modelo: 'gpt-4',
    temperatura: 0.7,
    maxTokens: 500,
    promptSistema: ''
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [telefonoPrueba, setTelefonoPrueba] = useState('');
  const [mensajePrueba, setMensajePrueba] = useState('');

  useEffect(() => {
    cargarEstadoWhatsApp();
    cargarConfigIA();
    cargarEstadoIA();
    cargarLogs();
    cargarEstadisticas();
    cargarConversaciones();
    cargarProductosConsultados();

    // Actualizar estado cada 5 segundos
    const interval = setInterval(() => {
      cargarEstadoWhatsApp();
      cargarEstadoIA();
      cargarLogs();
      cargarEstadisticas();
      cargarConversaciones();
      cargarProductosConsultados();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const cargarEstadoWhatsApp = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/estado', {
        credentials: 'include'
      });
      if (!res.ok) {
        console.error('Error al cargar estado WhatsApp:', res.status);
        return;
      }
      const data = await res.json();
      setEstadoWA(data);
    } catch (error) {
      console.error('Error cargando estado WhatsApp:', error);
    }
  };

  const cargarConfigIA = async () => {
    try {
      const res = await fetch('/api/admin/ia/config', {
        credentials: 'include'
      });
      const data = await res.json();
      setConfigIA(data);
    } catch (error) {
      console.error('Error cargando configuración IA:', error);
    }
  };

  const cargarEstadoIA = async () => {
    try {
      const res = await fetch('/api/admin/ia/estado', {
        credentials: 'include'
      });
      const data = await res.json();
      setEstadoIA(data);
    } catch (error) {
      console.error('Error cargando estado IA:', error);
    }
  };

  const cargarLogs = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/logs', {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error cargando logs:', error);
    }
  };

  const cargarEstadisticas = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/estadisticas', {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      setEstadisticas(data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const cargarConversaciones = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/conversaciones', {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversaciones(data.conversaciones || []);
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
    }
  };

  const cargarProductosConsultados = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/productos-consultados', {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      setProductosConsultados(data.productos || []);
    } catch (error) {
      console.error('Error cargando productos consultados:', error);
    }
  };

  const reconectarWhatsApp = async () => {
    setCargando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/admin/whatsapp/reconectar', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      setMensaje(data.message || 'WhatsApp reconectando...');
      setTimeout(cargarEstadoWhatsApp, 2000);
    } catch (error) {
      setMensaje('Error al reconectar WhatsApp');
    }
    setCargando(false);
  };

  const desconectarWhatsApp = async () => {
    if (!confirm('¿Estás seguro de desconectar WhatsApp?')) return;

    setCargando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/admin/whatsapp/desconectar', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      setMensaje(data.message || 'WhatsApp desconectado');
      cargarEstadoWhatsApp();
    } catch (error) {
      setMensaje('Error al desconectar WhatsApp');
    }
    setCargando(false);
  };

  const guardarConfigIA = async () => {
    setCargando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/admin/ia/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...configIA,
          apiKey: apiKeyInput || configIA.apiKey
        })
      });
      const data = await res.json();
      setMensaje(data.message || 'Configuración guardada');
      setApiKeyInput('');
      cargarConfigIA();
    } catch (error) {
      setMensaje('Error al guardar configuración');
    }
    setCargando(false);
  };

  const enviarMensajePrueba = async () => {
    if (!telefonoPrueba || !mensajePrueba) {
      setMensaje('Error: Completa todos los campos');
      return;
    }

    setCargando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/admin/whatsapp/prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          telefono: telefonoPrueba,
          mensaje: mensajePrueba
        })
      });
      const data = await res.json();
      if (data.success) {
        setMensaje('Mensaje de prueba enviado correctamente');
        setTelefonoPrueba('');
        setMensajePrueba('');
      } else {
        setMensaje(`Error: ${data.error}`);
      }
    } catch (error) {
      setMensaje('Error al enviar mensaje de prueba');
    }
    setCargando(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '10px' }}>Panel de Administración</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>Gestiona las conexiones y configuraciones del asistente virtual</p>
      </div>

      {mensaje && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '20px',
          backgroundColor: mensaje.includes('Error') ? '#fee' : '#efe',
          border: '1px solid ' + (mensaje.includes('Error') ? '#fcc' : '#cfc'),
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          {mensaje}
        </div>
      )}

      {/* Indicadores de Estado */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '15px',
        marginBottom: '30px'
      }}>
        {/* Estado WhatsApp */}
        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: estadoWA.conectado ? '#10b981' : '#f59e0b'
            }} />
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>WhatsApp Business</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#111827' }}>
            {estadoWA.conectado ? 'Conectado' : 'Desconectado'}
          </div>
        </div>

        {/* Estado IA */}
        <div style={{
          padding: '20px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: estadoIA?.conectado ? '#10b981' : '#f59e0b'
            }} />
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Inteligencia Artificial</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#111827' }}>
            {estadoIA?.conectado ? 'Conectado' : (estadoIA?.mensaje || 'Verificando...')}
          </div>
          {estadoIA?.modelo && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Modelo: {estadoIA.modelo}
            </div>
          )}
        </div>
      </div>

      {/* Estadísticas del Día */}
      {estadisticas && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '30px'
        }}>
          {/* Mensajes Recibidos */}
          <div style={{
            padding: '20px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Mensajes Recibidos
            </div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>
              {estadisticas.mensajesRecibidos}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              Hoy
            </div>
          </div>

          {/* Mensajes Enviados */}
          <div style={{
            padding: '20px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Mensajes Enviados
            </div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>
              {estadisticas.mensajesEnviados}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              Hoy
            </div>
          </div>

          {/* Mensajes Exitosos */}
          <div style={{
            padding: '20px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Exitosos
            </div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>
              {estadisticas.mensajesExitosos}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              {estadisticas.mensajesEnviados > 0
                ? `${Math.round((estadisticas.mensajesExitosos / estadisticas.mensajesEnviados) * 100)}%`
                : '0%'}
            </div>
          </div>

          {/* Mensajes con Error */}
          <div style={{
            padding: '20px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Con Error
            </div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#ef4444' }}>
              {estadisticas.mensajesError}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              {estadisticas.mensajesEnviados > 0
                ? `${Math.round((estadisticas.mensajesError / estadisticas.mensajesEnviados) * 100)}%`
                : '0%'}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Panel WhatsApp */}
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#111827' }}>WhatsApp Business</h2>

          <div style={{ marginBottom: '20px' }}>
            <strong>Estado: </strong>
            <span style={{ color: estadoWA.conectado ? 'green' : 'orange' }}>
              {estadoWA.conectado ? '✅ Conectado' : '⏳ Desconectado'}
            </span>
          </div>

          {estadoWA.qrCode && !estadoWA.conectado && (
            <div style={{
              marginBottom: '20px',
              textAlign: 'center',
              padding: '20px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px'
            }}>
              <p style={{ marginBottom: '15px', color: '#374151', fontSize: '14px' }}>
                Escanea este código QR con WhatsApp:
              </p>
              <img
                src={estadoWA.qrCode}
                alt="QR Code WhatsApp"
                style={{
                  maxWidth: '250px',
                  border: '2px solid #e5e7eb',
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: '#fff'
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={reconectarWhatsApp}
              disabled={cargando}
              style={{
                padding: '10px 20px',
                backgroundColor: cargando ? '#93c5fd' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: cargando ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
            >
              {cargando ? 'Procesando...' : 'Reconectar'}
            </button>

            {estadoWA.conectado && (
              <button
                onClick={desconectarWhatsApp}
                disabled={cargando}
                style={{
                  padding: '10px 20px',
                  backgroundColor: cargando ? '#fca5a5' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: cargando ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s'
                }}
              >
                Desconectar
              </button>
            )}
          </div>

          {/* Formulario de mensaje de prueba */}
          {estadoWA.conectado && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                Enviar Mensaje de Prueba
              </h3>

              <div style={{ marginBottom: '12px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Número de teléfono (con código de país)
                </label>
                <input
                  type="text"
                  value={telefonoPrueba}
                  onChange={(e) => setTelefonoPrueba(e.target.value)}
                  placeholder="57300123456"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Mensaje
                </label>
                <textarea
                  value={mensajePrueba}
                  onChange={(e) => setMensajePrueba(e.target.value)}
                  placeholder="Escribe un mensaje de prueba..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                onClick={enviarMensajePrueba}
                disabled={cargando}
                style={{
                  width: '100%',
                  padding: '10px 20px',
                  backgroundColor: cargando ? '#86efac' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: cargando ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                {cargando ? 'Enviando...' : 'Enviar Mensaje de Prueba'}
              </button>
            </div>
          )}
        </div>

        {/* Panel Configuración IA */}
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#111827' }}>Configuración de IA</h2>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px',
              color: '#374151'
            }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={configIA.apiKey || 'Ingresa tu API key de OpenAI'}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            {configIA.apiKeyConfigured && (
              <p style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
                ✓ API Key configurada
              </p>
            )}
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px',
              color: '#374151'
            }}>
              Modelo
            </label>
            <select
              value={configIA.modelo}
              onChange={(e) => setConfigIA({ ...configIA, modelo: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px',
              color: '#374151'
            }}>
              Temperatura: {configIA.temperatura}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={configIA.temperatura}
              onChange={(e) => setConfigIA({ ...configIA, temperatura: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              <span>Preciso</span>
              <span>Creativo</span>
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px',
              color: '#374151'
            }}>
              Max Tokens
            </label>
            <input
              type="number"
              value={configIA.maxTokens}
              onChange={(e) => setConfigIA({ ...configIA, maxTokens: parseInt(e.target.value) })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              fontSize: '14px',
              color: '#374151'
            }}>
              Prompt del Sistema (Instrucciones para la IA)
            </label>
            <textarea
              value={configIA.promptSistema}
              onChange={(e) => setConfigIA({ ...configIA, promptSistema: e.target.value })}
              placeholder="Describe cómo debe comportarse el agente de IA..."
              rows={8}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '14px',
                resize: 'vertical',
                lineHeight: '1.5'
              }}
            />
            <small style={{ color: '#6b7280', fontSize: '12px', display: 'block', marginTop: '4px' }}>
              Define el rol, comportamiento y conocimiento del agente. Ejemplo: "Eres un agente de ventas de artículos para el hogar..."
            </small>
          </div>

          <button
            onClick={guardarConfigIA}
            disabled={cargando}
            style={{
              width: '100%',
              padding: '12px 20px',
              backgroundColor: cargando ? '#86efac' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: cargando ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
          >
            {cargando ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>

      {/* Historial de Conversaciones */}
      <div style={{
        marginTop: '30px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '24px',
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#111827' }}>
          Historial de Conversaciones
        </h2>

        {conversaciones.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            No hay conversaciones activas
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: conversacionSeleccionada ? '300px 1fr' : '1fr', gap: '20px' }}>
            {/* Lista de conversaciones */}
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {conversaciones.map((conv) => (
                <div
                  key={conv.telefono}
                  onClick={() => setConversacionSeleccionada(conv.telefono === conversacionSeleccionada ? null : conv.telefono)}
                  style={{
                    padding: '16px',
                    marginBottom: '8px',
                    backgroundColor: conversacionSeleccionada === conv.telefono ? '#eff6ff' : '#f9fafb',
                    border: '1px solid ' + (conversacionSeleccionada === conv.telefono ? '#3b82f6' : '#e5e7eb'),
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '500', color: '#374151', fontSize: '14px' }}>
                      {conv.telefono}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      fontWeight: '500'
                    }}>
                      {conv.cantidadMensajes} mensajes
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {conv.ultimoMensaje}
                  </p>
                </div>
              ))}
            </div>

            {/* Detalle de conversación seleccionada */}
            {conversacionSeleccionada && (
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '16px',
                backgroundColor: '#fafafa',
                maxHeight: '500px',
                overflowY: 'auto'
              }}>
                <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                    {conversacionSeleccionada}
                  </h3>
                </div>

                {conversaciones.find(c => c.telefono === conversacionSeleccionada)?.mensajes.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end'
                    }}
                  >
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: msg.role === 'user' ? '#fff' : '#3b82f6',
                      color: msg.role === 'user' ? '#374151' : '#fff',
                      border: msg.role === 'user' ? '1px solid #e5e7eb' : 'none',
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}>
                      <div style={{ fontSize: '11px', marginBottom: '4px', opacity: 0.7, fontWeight: '500' }}>
                        {msg.role === 'user' ? 'Cliente' : 'Asistente'}
                      </div>
                      {msg.content}
                      {msg.productos && msg.productos.length > 0 && (
                        <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>
                          📦 {msg.productos.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logs de Actividad */}
      <div style={{
        marginTop: '30px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '24px',
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#111827' }}>
          Logs de Actividad
        </h2>

        {logs.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            No hay mensajes procesados aún
          </p>
        ) : (
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  backgroundColor: log.exitoso ? '#f9fafb' : '#fef2f2',
                  border: '1px solid ' + (log.exitoso ? '#e5e7eb' : '#fecaca'),
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: '500', color: '#374151' }}>
                      {log.telefono}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: log.exitoso ? '#d1fae5' : '#fee2e2',
                      color: log.exitoso ? '#065f46' : '#991b1b',
                      fontWeight: '500'
                    }}>
                      {log.exitoso ? '✓ Exitoso' : '✗ Error'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {new Date(log.timestamp).toLocaleString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#374151', fontSize: '13px' }}>Cliente:</strong>
                  <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>
                    {log.mensaje}
                  </p>
                </div>
                <div>
                  <strong style={{ color: '#374151', fontSize: '13px' }}>Respuesta:</strong>
                  <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>
                    {log.respuesta}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Productos Más Consultados */}
      <div style={{
        marginTop: '30px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '24px',
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#111827' }}>
          Productos Más Consultados
        </h2>

        {productosConsultados.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            No hay productos consultados aún
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
            {productosConsultados.map((producto, index) => (
              <div
                key={producto.nombre}
                style={{
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: index === 0 ? '#fef3c7' : index === 1 ? '#dbeafe' : index === 2 ? '#fce7f3' : '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: '700',
                  color: index === 0 ? '#92400e' : index === 1 ? '#1e40af' : index === 2 ? '#9f1239' : '#374151',
                  flexShrink: 0
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#111827',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '4px'
                  }}>
                    {producto.nombre}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    <span style={{ fontWeight: '600', color: '#3b82f6' }}>{producto.menciones}</span> {producto.menciones === 1 ? 'consulta' : 'consultas'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
