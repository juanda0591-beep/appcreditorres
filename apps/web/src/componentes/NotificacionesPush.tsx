import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  soportaNotificacionesPush,
  obtenerEstadoPermisos,
  suscribirseANotificaciones,
  desuscribirseDeNotificaciones,
  estaSuscrito
} from '../utilidades/notificaciones-push.js';
import { Boton } from '../componentes/base.js';
import { avisar, avisarError } from '../utilidades/alertas.js';

/**
 * Componente para gestionar las notificaciones push
 */
export function NotificacionesPush() {
  const [soportado, setSoportado] = useState(false);
  const [suscrito, setSuscrito] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    async function verificar() {
      try {
        const soporte = soportaNotificacionesPush();
        setSoportado(soporte);

        if (soporte) {
          const yaEstaSuscrito = await estaSuscrito();
          setSuscrito(yaEstaSuscrito);
        }
      } catch (error) {
        console.error('Error al verificar notificaciones:', error);
      } finally {
        setCargando(false);
      }
    }

    verificar();
  }, []);

  async function toggleNotificaciones() {
    setProcesando(true);

    try {
      if (suscrito) {
        // Desuscribirse
        const exito = await desuscribirseDeNotificaciones();
        if (exito) {
          setSuscrito(false);
          avisar('Notificaciones desactivadas');
        } else {
          avisarError('No se pudo desactivar las notificaciones');
        }
      } else {
        // Suscribirse
        const permiso = obtenerEstadoPermisos();

        if (permiso === 'denied') {
          avisarError('Has bloqueado las notificaciones. Debes habilitarlas en la configuración del navegador.');
          return;
        }

        const exito = await suscribirseANotificaciones();
        if (exito) {
          setSuscrito(true);
          avisar('Notificaciones activadas correctamente');
        } else {
          avisarError('No se pudo activar las notificaciones');
        }
      }
    } catch (error) {
      console.error('Error al cambiar estado de notificaciones:', error);
      avisarError('Ocurrió un error al gestionar las notificaciones');
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) {
    return (
      <div className="tarjeta space-y-3">
        <h2 className="font-semibold">Notificaciones Push</h2>
        <p className="text-sm text-slate-600">Verificando soporte...</p>
      </div>
    );
  }

  if (!soportado) {
    return (
      <div className="tarjeta space-y-3">
        <h2 className="font-semibold">Notificaciones Push</h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            Tu navegador no soporta notificaciones push o no estás en una conexión segura (HTTPS).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="tarjeta space-y-3">
      <h2 className="font-semibold">Notificaciones Push</h2>

      <p className="text-sm text-slate-600">
        Recibe notificaciones instantáneas cuando un cliente muestre interés en un producto,
        incluso si tienes el navegador minimizado.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          {suscrito ? (
            <Bell size={24} className="text-green-600" />
          ) : (
            <BellOff size={24} className="text-slate-400" />
          )}
          <div>
            <p className="font-medium text-slate-800">
              {suscrito ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
            </p>
            <p className="text-xs text-slate-600">
              {suscrito
                ? 'Recibirás alertas cuando lleguen nuevos pedidos'
                : 'Activa para recibir alertas en tiempo real'}
            </p>
          </div>
        </div>

        <Boton
          tipo={suscrito ? 'secundario' : 'primario'}
          deshabilitado={procesando}
          onClick={toggleNotificaciones}
        >
          {procesando ? 'Procesando...' : suscrito ? 'Desactivar' : 'Activar'}
        </Boton>
      </div>

      {suscrito && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong> Para recibir notificaciones, mantén al menos una pestaña
            del sitio abierta en el navegador (puede estar minimizada).
          </p>
        </div>
      )}
    </div>
  );
}
