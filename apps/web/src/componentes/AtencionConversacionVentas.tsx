import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, Bot, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { obtener, enviar, parchar } from '../api/cliente';
import { NuevoPedidoVentas } from './NuevoPedidoVentas';
const boton = 'inline-flex items-center gap-2 border border-gray-300 rounded px-3 py-2 text-sm disabled:opacity-50';
export function AtencionConversacionVentas({ conversacion, onActualizado }: { conversacion: { id: string; telefono: string; nombreCliente: string | null; modoAtencion: string }; onActualizado: () => void }) {
  const [mensaje, setMensaje] = useState('');
  const global = useQuery({ queryKey: ['ventas', 'modo'], queryFn: () => obtener<{ modo: string }>('/api/admin/ventas/modo'), refetchInterval: 5000 });
  const accion = useMutation({ mutationFn: ({ modo, texto }: { modo?: string; texto?: string }) => texto
    ? enviar(`/api/admin/ventas/conversaciones/${conversacion.id}/enviar`, { mensaje: texto })
    : parchar(`/api/admin/ventas/conversaciones/${conversacion.id}/modo`, { modo }),
    onSuccess: (_data, variables) => { if (variables.texto) setMensaje(''); onActualizado(); }, onError: (error: Error) => toast.error(error.message) });
  return <section className="p-4 bg-white text-gray-900 border-b border-gray-200 space-y-3">
    <div className="flex flex-wrap justify-between gap-3 items-center"><h3 className="text-sm font-semibold">Atencion de esta conversacion</h3><div role="group" aria-label="Modo de la conversacion" className="flex gap-2">
      {['automatico', 'manual'].map(modo => <button key={modo} aria-pressed={conversacion.modoAtencion === modo} className={`${boton} ${conversacion.modoAtencion === modo ? 'bg-teal-700 text-white' : ''}`} disabled={accion.isPending} onClick={() => accion.mutate({ modo })}>
        {modo === 'automatico' ? <Bot size={16} /> : <UserRound size={16} />}{modo === 'automatico' ? 'Automatico' : 'Manual'}
      </button>)}
    </div></div>
    {global.data?.modo === 'manual' && <p className="text-sm text-amber-800">Atencion manual general activada</p>}
    <NuevoPedidoVentas conversacion={conversacion} onGuardado={onActualizado} />
    <form onSubmit={e => { e.preventDefault(); accion.mutate({ texto: mensaje.trim() }); }}><label className="text-sm">Respuesta del gestor<textarea required maxLength={8000} className="block w-full mt-1 border border-gray-300 rounded px-3 py-2 text-sm" value={mensaje} onChange={e => setMensaje(e.target.value)} /></label>
      <button className={`${boton} mt-2`} disabled={accion.isPending || !mensaje.trim()}><Send size={16} /> Enviar por WhatsApp de ventas</button>
    </form>
  </section>;
}
