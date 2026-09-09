import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { obtener, enviar } from '../api/cliente';

interface Conversacion { id: string; nombreCliente: string | null; telefono: string; }
interface Producto { id: string; nombre: string; contado: number; credito: number; credicontado: number; }
const campo = 'block w-full mt-1 rounded border border-gray-300 px-3 py-2 text-sm bg-white';
const boton = 'inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50';
export function NuevoPedidoVentas({ conversacion, onGuardado }: { conversacion?: Conversacion; onGuardado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return <>
    <button type="button" className={`${boton} bg-white text-teal-800`} onClick={() => setAbierto(true)}><Plus size={16} /> Nuevo pedido manual</button>
    {abierto && <EditorPedido conversacion={conversacion} onCerrar={() => setAbierto(false)} onGuardado={onGuardado} />}
  </>;
}
function EditorPedido({ conversacion, onCerrar, onGuardado }: { conversacion?: Conversacion; onCerrar: () => void; onGuardado: () => void }) {
  const cache = useQueryClient();
  const [id] = useState(() => crypto.randomUUID());
  const [datos, setDatos] = useState({ conversacionId: conversacion?.id ?? '', productoId: '', cantidad: 1, pago: 'credito' as 'contado' | 'credito' | 'credicontado', nombre: conversacion?.nombreCliente ?? '', telefono: conversacion?.telefono ?? '', direccion: '', zona: '', notas: '' });
  const catalogo = useQuery({ queryKey: ['ventas', 'catalogo'], queryFn: () => obtener<{ productos: Producto[] }>('/api/admin/ventas/catalogo') });
  const conversaciones = useQuery({ queryKey: ['ventas', 'conversaciones'], queryFn: () => obtener<{ conversaciones: Conversacion[] }>('/api/admin/conversaciones'), enabled: !conversacion });
  const producto = catalogo.data?.productos.find(p => p.id === datos.productoId);
  const precio = producto?.[datos.pago] ?? 0;
  const guardar = useMutation({ mutationFn: () => enviar('/api/admin/ventas/pedidos', { id, ...datos }),
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['ventas'] }); toast.success('Pedido registrado'); onGuardado(); onCerrar(); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Nuevo pedido manual">
    <form className="bg-white text-gray-900 rounded-lg w-full max-w-xl max-h-[90dvh] overflow-y-auto p-5" onSubmit={e => { e.preventDefault(); guardar.mutate(); }}>
      <div className="flex justify-between gap-2 items-center mb-4"><h2 className="text-lg font-semibold">Nuevo pedido manual</h2><button type="button" aria-label="Cerrar" title="Cerrar" className={boton} disabled={guardar.isPending} onClick={onCerrar}><X size={16} /></button></div>
      {catalogo.isError || conversaciones.isError ? <p role="alert" className="text-red-700">No se pudieron cargar los datos. <button type="button" onClick={() => { catalogo.refetch(); if (!conversacion) conversaciones.refetch(); }}>Reintentar</button></p> : null}
      {!conversacion && <label className="block text-sm mb-3">Conversacion<select required className={campo} value={datos.conversacionId} onChange={e => { const c = conversaciones.data?.conversaciones.find(c => c.id === e.target.value); setDatos({ ...datos, conversacionId: e.target.value, nombre: c?.nombreCliente ?? '', telefono: c?.telefono ?? '' }); }}><option value="">Seleccionar cliente</option>{conversaciones.data?.conversaciones.map(c => <option key={c.id} value={c.id}>{c.nombreCliente || c.telefono} · {c.telefono}</option>)}</select></label>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm sm:col-span-2">Producto<select className={campo} required value={datos.productoId} onChange={e => setDatos({ ...datos, productoId: e.target.value })}><option value="">Seleccionar producto</option>{catalogo.data?.productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        <label className="text-sm">Cantidad<input className={campo} type="number" min="1" max="20" required value={datos.cantidad} onChange={e => setDatos({ ...datos, cantidad: Number(e.target.value) })} /></label>
        <label className="text-sm">Forma de pago<select className={campo} value={datos.pago} onChange={e => setDatos({ ...datos, pago: e.target.value as typeof datos.pago })}><option value="contado">Contado</option><option value="credito">Credito</option><option value="credicontado">Credicontado</option></select></label>
        <label className="text-sm">Nombre del cliente<input required minLength={3} maxLength={150} className={campo} value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} /></label>
        <label className="text-sm">Celular<input required className={campo} value={datos.telefono} onChange={e => setDatos({ ...datos, telefono: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Direccion de entrega<input required minLength={8} maxLength={500} className={campo} value={datos.direccion} onChange={e => setDatos({ ...datos, direccion: e.target.value })} /></label>
        <label className="text-sm">Municipio<input required minLength={3} maxLength={100} className={campo} value={datos.zona} onChange={e => setDatos({ ...datos, zona: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Notas<textarea className={campo} maxLength={2000} value={datos.notas} onChange={e => setDatos({ ...datos, notas: e.target.value })} /></label>
      </div>
      <p className="font-semibold my-4">Total: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(precio * datos.cantidad)}</p>
      {producto && precio <= 0 && <p role="alert" className="text-amber-800 mb-3 text-sm">Esta modalidad no tiene precio configurado</p>}
      <button disabled={guardar.isPending || !producto || precio <= 0 || !datos.conversacionId} className={`${boton} bg-teal-700 text-white`}><Save size={16} /> {guardar.isPending ? 'Guardando...' : 'Registrar pedido'}</button>
    </form>
  </div>;
}
