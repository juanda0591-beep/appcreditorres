import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { obtener, enviar } from '../api/cliente';

export function ModoVentas() {
  const cache = useQueryClient();
  const consulta = useQuery({ queryKey: ['ventas', 'modo'], queryFn: () => obtener<{ modo: 'automatico' | 'manual' }>('/api/admin/ventas/modo'), refetchInterval: 5000 });
  const cambiar = useMutation({ mutationFn: (modo: string) => enviar('/api/admin/ventas/modo', { modo }, 'PUT'),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['ventas'] }), onError: (error: Error) => toast.error(error.message) });
  return <section className="border-y border-gray-200 bg-white px-4 py-3 mb-5 text-gray-900 flex flex-wrap items-center justify-between gap-3">
    <div><h2 className="font-semibold text-base">Atencion de ventas</h2><p className="text-sm text-gray-500">{consulta.data?.modo === 'manual' ? 'Respuestas del agente pausadas' : consulta.data ? 'Agente automatico activo' : 'Consultando estado...'}</p></div>
    <div role="group" aria-label="Modo general de ventas" className="flex border border-gray-300 rounded overflow-hidden">
      {(['automatico', 'manual'] as const).map(modo => <button key={modo} aria-pressed={consulta.data?.modo === modo} disabled={!consulta.data || cambiar.isPending} onClick={() => cambiar.mutate(modo)}
        className={`px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50 ${consulta.data?.modo === modo ? 'bg-teal-700 text-white' : 'bg-white text-gray-700'}`}>
        {modo === 'automatico' ? <Bot size={16} /> : <UserRound size={16} />}{modo === 'automatico' ? 'Automatico' : 'Manual'}
      </button>)}
    </div>
    {consulta.isError && <p role="alert" className="text-red-700 text-sm">No se pudo cargar el modo. <button className="underline" onClick={() => consulta.refetch()}>Reintentar</button></p>}
  </section>;
}
