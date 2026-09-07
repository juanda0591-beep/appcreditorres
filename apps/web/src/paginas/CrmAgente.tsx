import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, QrCode, Unplug, Send, FlaskConical, RefreshCw, Bot, ArrowLeft, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { obtener, enviar, parchar } from '../api/cliente';

interface Config { activo: boolean; apiKey: string; modelo: string; temperatura: number; maxTokens: number; promptSistema: string; apiKeyConfigured?: boolean; }
interface Estado { conectado: boolean; qrCode: string | null; numero: string | null; conectando: boolean; error: string | null; }
interface Conversacion { id: string; telefono: string | null; nombre: string | null; documento: string | null; pausada: boolean; requiereAsesor: boolean; ultimoMensaje: string; actualizadoEn: string; }
interface Detalle {
  conversacion: Conversacion;
  mensajes: { id: string; rol: string; contenido: string; estado: string; creadoEn: string }[];
  candidatos: { id: string; cliente: string; numero: string; documento: string }[];
  identificacion?: { tipo: 'manual' | 'telefono' | 'ambiguo' | 'sin_coincidencia'; documento: string | null };
  cartera?: { numero: string; producto: string; montoCuota: number; periodicidad: string; saldoPendiente: number; abonoAcumulado: number; ultimaFechaAbono: string | null; fechaCorte: string | null }[];
}
const base = '/api/admin/cobranza';
const boton = 'inline-flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50';
const campo = 'block mt-1 w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm';
const pesos = (valor: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

export default function CrmAgente() {
  const cache = useQueryClient();
  const [vista, setVista] = useState('config');
  const [edicion, setEdicion] = useState<Config | null>(null);
  const [simulacion, setSimulacion] = useState('Hola, quiero acordar una fecha para pagar.');
  const [respuesta, setRespuesta] = useState('');
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [clienteId, setClienteId] = useState('');
  const config = useQuery({ queryKey: ['cobranza', 'config'], queryFn: () => obtener<Config>(`${base}/config`) });
  const estado = useQuery({ queryKey: ['cobranza', 'estado'], queryFn: () => obtener<Estado>(`${base}/estado`), refetchInterval: 4000 });
  const conversaciones = useQuery({ queryKey: ['cobranza', 'conversaciones'], queryFn: () => obtener<{ conversaciones: Conversacion[] }>(`${base}/conversaciones`), refetchInterval: 8000 });
  const detalle = useQuery({ queryKey: ['cobranza', 'detalle', seleccionada], queryFn: () => obtener<Detalle>(`${base}/conversaciones/${seleccionada}`), enabled: Boolean(seleccionada), refetchInterval: 5000 });
  const accion = useMutation({
    mutationFn: ({ ruta, datos, metodo = 'POST' }: { ruta: string; datos?: unknown; metodo?: 'POST' | 'PUT' | 'PATCH' }) => metodo === 'PATCH' ? parchar(`${base}${ruta}`, datos) : enviar(`${base}${ruta}`, datos, metodo),
    onSuccess: async (_data, variables) => {
      if (variables.ruta === '/config') setEdicion(null);
      if (variables.ruta.endsWith('/enviar')) setTexto('');
      await cache.invalidateQueries({ queryKey: ['cobranza'] });
      if (variables.ruta !== '/conectar') toast.success('Actualizado');
    }, onError: (error: Error) => toast.error(error.message),
  });
  const probar = useMutation({ mutationFn: () => enviar<{ respuesta: string }>(`${base}/probar`, { mensaje: simulacion }), onSuccess: data => setRespuesta(data.respuesta), onError: (error: Error) => toast.error(error.message) });
  const form = edicion ?? config.data;
  const modificar = (datos: Partial<Config>) => { if (form) setEdicion({ ...form, ...datos }); };
  const conversacion = detalle.data?.conversacion;
  return <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
    <Link to="/crm/gestiones" className="text-sm text-teal-700 inline-flex items-center gap-1 mb-4"><ArrowLeft size={16} /> Gestion de cobros</Link>
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><h1 className="text-2xl font-semibold inline-flex items-center gap-2"><Bot size={24} /> Agente de cobranza</h1><span className={estado.data?.conectado ? 'text-green-700' : 'text-amber-800'}>{estado.data?.conectado ? `WhatsApp +${estado.data.numero ?? ''}` : estado.data?.conectando ? 'Conectando WhatsApp' : 'WhatsApp sin conectar'}</span></div>
    <div role="tablist" aria-label="Agente de cobranza" className="flex border-b border-gray-200 mb-5">
      {[['config', 'Configuracion'], ['conversaciones', `Conversaciones (${conversaciones.data?.conversaciones.filter(c => c.requiereAsesor).length ?? 0} por revisar)`]].map(([id, nombre]) => <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id!)} className={`px-3 py-3 text-sm border-b-2 ${vista === id ? 'border-teal-700 text-teal-800 font-semibold' : 'border-transparent'}`}>{nombre}</button>)}
    </div>
    {(config.isError || estado.isError || conversaciones.isError) && <p role="alert" className="text-red-700 mb-4">No se pudo cargar el agente. <button onClick={() => cache.invalidateQueries({ queryKey: ['cobranza'] })} className={boton}><RefreshCw size={16} /> Reintentar</button></p>}
    {vista === 'config' && <>
      <section className="border-b border-gray-200 pb-5 mb-5">
        <h2 className="text-lg font-semibold mb-3">Numero de WhatsApp de cobranza</h2>
        <div className="flex flex-wrap gap-5 items-start">
          {!estado.data?.qrCode && !estado.data?.conectado && (estado.data?.conectando || (accion.isPending && accion.variables?.ruta === '/conectar')) && (
            <div role="status" className="w-60 max-w-full aspect-square flex flex-col items-center justify-center gap-3 border border-gray-200 bg-white text-gray-600">
              <LoaderCircle className="animate-spin" size={28} /><span className="text-sm">Solicitando QR a WhatsApp...</span>
            </div>
          )}
          {estado.data?.qrCode && <img src={estado.data.qrCode} alt="QR para vincular el numero de cobranza" width={240} height={240} className="w-60 max-w-full aspect-square bg-white border border-gray-200" />}
          <div className="space-y-3">
            {estado.data?.error && <p role="alert" className="text-red-700 text-sm">{estado.data.error}</p>}
            <div className="flex flex-wrap gap-2"><button className={boton} disabled={accion.isPending || estado.data?.conectado || estado.data?.conectando} onClick={() => accion.mutate({ ruta: '/conectar' })}><QrCode size={16} /> Vincular numero</button><button className={boton} disabled={accion.isPending || (!estado.data?.conectado && !estado.data?.qrCode && !estado.data?.conectando)} onClick={() => accion.mutate({ ruta: '/desconectar' })}><Unplug size={16} /> Desvincular</button></div>
          </div>
        </div>
      </section>
      {!form ? <p>Cargando configuracion...</p> : <form onSubmit={event => { event.preventDefault(); accion.mutate({ ruta: '/config', metodo: 'PUT', datos: form }); }} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Asistente de cobranza</h2><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form.activo} onChange={e => modificar({ activo: e.target.checked })} /> Respuestas automaticas activadas</label></div>
        <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">Clave de OpenAI para cobranza<input type="password" autoComplete="new-password" className={campo} value={form.apiKey} onChange={e => modificar({ apiKey: e.target.value })} /></label><label className="text-sm">Modelo<input required className={campo} value={form.modelo} onChange={e => modificar({ modelo: e.target.value })} /></label></div>
        <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">Variacion de respuestas: {form.temperatura}<input aria-label="Variacion de respuestas" type="range" min="0" max="2" step="0.1" className="block w-full mt-2" value={form.temperatura} onChange={e => modificar({ temperatura: Number(e.target.value) })} /></label><label className="text-sm">Limite de respuesta (tokens)<input type="number" min="64" max="2000" required className={campo} value={form.maxTokens} onChange={e => modificar({ maxTokens: Number(e.target.value) })} /></label></div>
        <label className="block text-sm">Instrucciones del agente<textarea required minLength={20} maxLength={12000} rows={8} className={campo} value={form.promptSistema} onChange={e => modificar({ promptSistema: e.target.value })} /></label>
        <button className={`${boton} bg-teal-700 text-white`} disabled={accion.isPending}><Save size={16} /> Guardar configuracion</button>
      </form>}
      <section className="border-t border-gray-200 mt-6 pt-5"><h2 className="text-lg font-semibold mb-3">Simulacion del agente</h2><form onSubmit={e => { e.preventDefault(); probar.mutate(); }}><label className="text-sm">Mensaje de prueba<textarea className={campo} maxLength={2000} required value={simulacion} onChange={e => setSimulacion(e.target.value)} /></label><button className={`${boton} mt-3`} disabled={probar.isPending || !config.data?.apiKeyConfigured || edicion !== null}><FlaskConical size={16} /> {probar.isPending ? 'Probando...' : 'Probar configuracion guardada'}</button></form>{respuesta && <p className="mt-3 whitespace-pre-wrap border-l-2 border-teal-600 pl-3 text-sm" role="status">{respuesta}</p>}</section>
    </>}
    {vista === 'conversaciones' && <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section><h2 className="font-semibold mb-3">Ultimas conversaciones</h2><ul className="divide-y divide-gray-200">{conversaciones.data?.conversaciones.map(c => <li key={c.id}><button className={`w-full text-left py-3 px-2 ${seleccionada === c.id ? 'bg-teal-50' : ''}`} onClick={() => { setSeleccionada(c.id); setClienteId(''); setTexto(''); }}><span className="font-medium">{c.nombre || c.telefono || 'Numero sin identificar'}</span><p className="text-xs text-gray-500">{c.telefono} {c.pausada ? '· Atencion manual' : ''}</p><p className="text-sm truncate">{c.ultimoMensaje}</p>{c.requiereAsesor && <span className="text-xs text-amber-800">Pendiente de revision</span>}</button></li>)}</ul>{conversaciones.data?.conversaciones.length === 0 && <p className="text-gray-500 text-sm">Sin conversaciones de cobranza</p>}</section>
      <section className="min-w-0">{!seleccionada ? <p className="text-gray-500">Selecciona una conversacion</p> : detalle.isError ? <p role="alert" className="text-red-700">No se pudo cargar la conversacion</p> : !conversacion ? <p>Cargando...</p> : <>
        <div className="flex flex-wrap gap-3 items-center justify-between pb-3 border-b border-gray-200"><h2 className="font-semibold">{conversacion.nombre || conversacion.telefono}</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conversacion.pausada} disabled={accion.isPending} onChange={e => accion.mutate({ ruta: `/conversaciones/${conversacion.id}`, metodo: 'PATCH', datos: { pausada: e.target.checked } })} /> Atencion manual</label></div>
        <div className="py-3 text-sm border-b border-gray-200"><p>Cliente identificado: {conversacion.documento ?? detalle.data?.identificacion?.documento ?? 'Pendiente'}</p><div className="flex flex-wrap gap-2 mt-2"><select aria-label="Cliente verificado" className="min-w-0 max-w-full border rounded px-2 py-1" value={clienteId} onChange={e => setClienteId(e.target.value)}><option value="">Seleccionar cliente</option>{detalle.data?.candidatos.map(c => <option key={c.id} value={c.id}>{c.cliente} · #{c.numero}</option>)}</select><button className={boton} disabled={!clienteId || accion.isPending} onClick={() => accion.mutate({ ruta: `/conversaciones/${conversacion.id}`, metodo: 'PATCH', datos: { clienteId } })}>Confirmar identidad</button>{conversacion.documento && <button className={boton} disabled={accion.isPending} onClick={() => accion.mutate({ ruta: `/conversaciones/${conversacion.id}`, metodo: 'PATCH', datos: { clienteId: null } })}>Desvincular cliente</button>}</div>{detalle.data?.candidatos[0] && <Link className="inline-block mt-2 text-teal-700 underline" to={`/crm/cartera/${detalle.data.candidatos[0].id}`}>Abrir ficha CRM</Link>}</div>
        <section className="py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold">Cartera del cliente</h3>
          <p className="text-xs text-gray-500 mt-1">{detalle.data?.identificacion?.tipo === 'telefono' ? 'Identificado por telefono' : detalle.data?.identificacion?.tipo === 'manual' ? 'Identidad confirmada por el gestor' : detalle.data?.identificacion?.tipo === 'ambiguo' ? 'Telefono compartido: selecciona y confirma el cliente' : 'Sin coincidencia en cartera'}</p>
          {detalle.data?.cartera?.map(c => <div key={c.numero} className="py-2 text-sm break-words">
            <p className="font-medium">#{c.numero} · {c.producto}</p>
            <p>Saldo: {pesos(c.saldoPendiente)} · Abonado: {pesos(c.abonoAcumulado)}</p>
            <p className="text-gray-600">Cuota: {pesos(c.montoCuota)} · {c.periodicidad}</p>
            <p className="text-xs text-gray-500">Corte: {c.fechaCorte?.slice(0, 10) ?? 'Sin fecha registrada'} · Ultimo abono: {c.ultimaFechaAbono?.slice(0, 10) ?? 'Sin fecha registrada'}</p>
          </div>)}
        </section>
        <ol className="max-h-[480px] overflow-y-auto divide-y divide-gray-100">{detalle.data?.mensajes.map(m => <li key={m.id} className="py-3"><div className="flex flex-wrap justify-between gap-1 text-xs text-gray-500"><span>{m.rol === 'user' ? 'Cliente' : m.rol === 'gestor' ? 'Gestor' : 'Agente de cobranza'}</span><span>{new Date(m.creadoEn).toLocaleString('es-CO')}</span></div><p className="whitespace-pre-wrap break-words text-sm mt-1">{m.contenido}</p>{m.estado !== 'recibido' && <span className={`text-xs ${m.estado === 'error' ? 'text-red-700' : 'text-gray-500'}`}>{m.estado}</span>}</li>)}</ol>
        <form className="border-t border-gray-200 pt-3" onSubmit={e => { e.preventDefault(); accion.mutate({ ruta: `/conversaciones/${conversacion.id}/enviar`, datos: { mensaje: texto } }); }}><label className="text-sm">Respuesta del gestor<textarea className={campo} maxLength={8000} required value={texto} onChange={e => setTexto(e.target.value)} /></label><div className="flex flex-wrap gap-2 mt-2"><button className={boton} disabled={accion.isPending || !estado.data?.conectado}><Send size={16} /> Enviar por cobranza</button><button type="button" className={boton} disabled={accion.isPending} onClick={() => accion.mutate({ ruta: `/conversaciones/${conversacion.id}`, metodo: 'PATCH', datos: { requiereAsesor: false } })}>Marcar revisada</button></div></form>
      </>}</section>
    </div>}
  </div>;
}
