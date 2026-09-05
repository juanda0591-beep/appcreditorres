import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, X, RefreshCw, MapPin, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { obtener, enviar, parchar } from '../api/cliente';
import { fechaCrm, pesosCrm, ubicacionesCrm, type FichaCrm, type ContactoCrm, type PromesaCrm } from '../api/crm-operativo';

const campo = 'mt-1 w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm';
const boton = 'inline-flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50';

export function CrmFichaSeguimiento({ creditoId, onActualizado }: { creditoId: string; onActualizado: () => void }) {
  const cache = useQueryClient();
  const [vista, setVista] = useState('promesas');
  const [crear, setCrear] = useState(false);
  const [resolver, setResolver] = useState<PromesaCrm | null>(null);
  const [estadoResolucion, setEstadoResolucion] = useState('cumplida');
  const [resolucion, setResolucion] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const ficha = useQuery({ queryKey: ['crm', 'ficha', creditoId], queryFn: () => obtener<FichaCrm>(`/api/admin/crm/cartera/${creditoId}/seguimiento`) });
  const [formContacto, setFormContacto] = useState<(Omit<ContactoCrm, 'documento' | 'verificadoEn' | 'actualizadoEn' | 'version'> & { version: number | null }) | null>(null);
  const [formPromesa, setFormPromesa] = useState({ monto: '', fechaCompromiso: '', responsableId: '', notas: '' });
  const guardar = useMutation({
    mutationFn: ({ ruta, datos, metodo }: { ruta: string; datos: unknown; metodo: 'POST' | 'PUT' | 'PATCH' }) => metodo === 'PATCH' ? parchar(ruta, datos) : enviar(ruta, datos, metodo),
    onSuccess: async () => {
      setCrear(false); setResolver(null); setFormContacto(null);
      await cache.invalidateQueries({ queryKey: ['crm'] });
      onActualizado(); toast.success('Guardado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (ficha.isPending) return <p className="py-4 text-gray-500">Cargando seguimiento...</p>;
  if (ficha.isError) return <div role="alert" className="py-4 text-red-700">{ficha.error.message} <button className={boton} onClick={() => ficha.refetch()}><RefreshCw size={16} /> Reintentar</button></div>;
  const datos = ficha.data;
  const contacto = datos.contacto;
  const abiertas = datos.promesas.filter(p => p.carteraClienteId === creditoId && ['pendiente', 'parcial'].includes(p.estado));
  const editarContacto = () => {
    setFormContacto({ responsableId: contacto?.responsableId ?? null, estadoUbicacion: contacto?.estadoUbicacion ?? 'por_confirmar',
      direccionAnterior: contacto?.direccionAnterior ?? '', direccionActual: contacto?.direccionActual ?? '', barrio: contacto?.barrio ?? '',
      municipio: contacto?.municipio ?? '', referencias: contacto?.referencias ?? '', telefonoAlternativo: contacto?.telefonoAlternativo ?? '',
      version: contacto?.version ?? null });
  };
  return (
    <section className="my-6 border-y border-gray-200 bg-white">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Seguimiento de la persona</h2><p className="text-sm text-gray-600">{datos.creditos.length} credito(s) · Saldo conjunto {pesosCrm(datos.creditos.reduce((s, c) => s + c.saldo, 0))}</p></div>
        <span className="text-sm">Responsable: {datos.responsables.find(r => r.id === contacto?.responsableId)?.nombre ?? 'Sin asignar'}</span>
      </div>
      <div role="tablist" aria-label="Seguimiento de la persona" className="flex flex-wrap border-y border-gray-200">
        {Object.entries({ promesas: 'Promesas', ubicacion: 'Localizacion y responsable', creditos: 'Creditos', historial: 'Historial conjunto' }).map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)} className={`px-4 py-3 text-sm border-b-2 ${vista === id ? 'border-teal-700 text-teal-800 font-semibold' : 'border-transparent text-gray-600'}`}>{nombre}</button>
        ))}
      </div>
      <div className="p-4" role="tabpanel">
        {vista === 'promesas' && <>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h3 className="font-semibold">Compromisos de pago</h3>
            <button className={boton} disabled={abiertas.length > 0 || guardar.isPending} onClick={() => { setCrear(true); setFormPromesa({ monto: '', fechaCompromiso: '', notas: '', responsableId: contacto?.responsableId ?? datos.usuarioActualId }); }}><Plus size={16} /> Nueva promesa</button>
          </div>
          {crear && <form className="mb-5 border-y border-gray-200 py-4" onSubmit={e => { e.preventDefault(); guardar.mutate({ ruta: `/api/admin/crm/cartera/${creditoId}/promesas`, metodo: 'POST', datos: { ...formPromesa, monto: Number(formPromesa.monto) } }); }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">Monto prometido (COP)<input className={campo} type="number" min="1" step="1" required value={formPromesa.monto} onChange={e => setFormPromesa({ ...formPromesa, monto: e.target.value })} /></label>
              <label className="text-sm">Fecha de compromiso<input className={campo} type="date" required min={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())} value={formPromesa.fechaCompromiso} onChange={e => setFormPromesa({ ...formPromesa, fechaCompromiso: e.target.value })} /></label>
              <label className="text-sm">Responsable<select className={campo} required value={formPromesa.responsableId} onChange={e => setFormPromesa({ ...formPromesa, responsableId: e.target.value })}>{datos.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
            </div>
            <label className="block text-sm mt-3">Notas<textarea className={campo} maxLength={2000} value={formPromesa.notas} onChange={e => setFormPromesa({ ...formPromesa, notas: e.target.value })} /></label>
            <div className="flex gap-2 mt-3"><button disabled={guardar.isPending} className={`${boton} bg-teal-700 text-white`}><Save size={16} /> Guardar promesa</button><button type="button" disabled={guardar.isPending} className={boton} onClick={() => setCrear(false)}><X size={16} /> Cancelar</button></div>
          </form>}
          {datos.promesas.length === 0 ? <p className="text-sm text-gray-500">Sin promesas registradas</p> : <ul className="divide-y divide-gray-200">
            {datos.promesas.map(p => <li key={p.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{pesosCrm(p.monto)} · {fechaCrm(p.fechaCompromiso)}</p><p className="text-sm text-gray-600">Credito #{p.numero} · {p.responsableNombre}</p></div><span className={`text-sm font-medium ${p.vencida ? 'text-red-700' : 'text-teal-700'}`}>{p.vencida ? 'Vencida por revisar' : p.estado}</span></div>
              {p.notas && <p className="text-sm mt-2 break-words">{p.notas}</p>}
              {['pendiente', 'parcial'].includes(p.estado) && <div className="mt-3 border-l-2 border-amber-500 pl-3 text-sm space-y-1">
                <p>Abono acumulado al crear: {pesosCrm(p.abonoBase)} · Actual: {pesosCrm(p.abonoActual)}</p>
                <p>Incremento observado: <strong>{pesosCrm(p.avanceDetectado)}</strong> · Corte de abonos: {fechaCrm(p.fechaCorteAbono)}</p>
                {p.revision && <p className="font-medium text-amber-800">{p.revision === 'posible_cumplimiento' ? 'Posible cumplimiento' : p.revision === 'ajuste_abono' ? 'Abono acumulado corregido: requiere revision' : 'Posible abono parcial'}</p>}
                <button className={`${boton} mt-2`} disabled={guardar.isPending} onClick={() => { setResolver(p); setResolucion(''); setEstadoResolucion(p.revision === 'posible_abono_parcial' ? 'parcial' : p.vencida && !p.revision ? 'incumplida' : 'cumplida'); }}><ClipboardCheck size={16} /> Revisar compromiso</button>
              </div>}
              {resolver?.id === p.id && <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); guardar.mutate({ ruta: `/api/admin/crm/promesas/${p.id}`, metodo: 'PATCH', datos: { estado: estadoResolucion === 'reprogramar' ? (p.estado === 'parcial' ? 'parcial' : 'pendiente') : estadoResolucion, resolucion, ...(estadoResolucion === 'reprogramar' ? { fechaCompromiso: nuevaFecha } : {}) } }); }}>
                <label className="text-sm">Resultado confirmado<select className={campo} value={estadoResolucion} onChange={e => setEstadoResolucion(e.target.value)}><option value="cumplida">Cumplida</option><option value="parcial">Cumplimiento parcial</option><option value="incumplida">Incumplida</option><option value="cancelada">Cancelada</option><option value="reprogramar">Reprogramar fecha</option></select></label>
                {estadoResolucion === 'reprogramar' && <label className="text-sm">Nueva fecha de compromiso<input type="date" className={campo} required value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} /></label>}
                <label className="text-sm">Observacion de la revision<textarea className={campo} minLength={3} maxLength={2000} required value={resolucion} onChange={e => setResolucion(e.target.value)} /></label>
                <div className="flex gap-2"><button className={boton} disabled={guardar.isPending}><Save size={16} /> Confirmar resultado</button><button type="button" className={boton} onClick={() => setResolver(null)} disabled={guardar.isPending}><X size={16} /> Cancelar</button></div>
              </form>}
              {p.resolucion && <p className="mt-2 text-sm text-gray-600">Revision: {p.resolucion}</p>}
            </li>)}
          </ul>}
        </>}
        {vista === 'ubicacion' && <>
          <div className="flex items-center justify-between gap-2 mb-3"><h3 className="font-semibold flex items-center gap-2"><MapPin size={18} /> {ubicacionesCrm[contacto?.estadoUbicacion ?? 'sin_datos']}</h3><button className={boton} onClick={editarContacto} disabled={guardar.isPending}>Editar ficha</button></div>
          {formContacto ? <form onSubmit={e => { e.preventDefault(); guardar.mutate({ ruta: `/api/admin/crm/cartera/${creditoId}/contacto`, metodo: 'PUT', datos: formContacto }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Responsable de la persona<select className={campo} value={formContacto.responsableId ?? ''} onChange={e => setFormContacto({ ...formContacto, responsableId: e.target.value || null })}><option value="">Sin asignar</option>{datos.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
              <label className="text-sm">Estado de ubicacion<select className={campo} value={formContacto.estadoUbicacion} onChange={e => setFormContacto({ ...formContacto, estadoUbicacion: e.target.value as ContactoCrm['estadoUbicacion'] })}>{Object.entries(ubicacionesCrm).filter(([id]) => id !== 'sin_datos').map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
              {(['direccionAnterior', 'direccionActual', 'barrio', 'municipio', 'telefonoAlternativo'] as const).map(clave => <label className="text-sm" key={clave}>{{ direccionAnterior: 'Direccion anterior', direccionActual: 'Direccion actual', barrio: 'Barrio', municipio: 'Municipio', telefonoAlternativo: 'Telefono alternativo' }[clave]}<input className={campo} value={formContacto[clave]} required={formContacto.estadoUbicacion === 'localizado' && ['direccionActual', 'municipio'].includes(clave)} maxLength={clave === 'telefonoAlternativo' ? 40 : clave.startsWith('direccion') ? 300 : 120} onChange={e => setFormContacto({ ...formContacto, [clave]: e.target.value })} /></label>)}
              <label className="text-sm sm:col-span-2">Referencias de ubicacion<textarea className={campo} maxLength={2000} value={formContacto.referencias} onChange={e => setFormContacto({ ...formContacto, referencias: e.target.value })} /></label>
            </div>
            <div className="mt-3 flex gap-2"><button className={boton} disabled={guardar.isPending}><Save size={16} /> Guardar ficha</button><button type="button" className={boton} disabled={guardar.isPending} onClick={() => setFormContacto(null)}><X size={16} /> Cancelar</button></div>
          </form> : <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            {Object.entries({ 'Direccion anterior': contacto?.direccionAnterior, 'Direccion actual': contacto?.direccionActual, Barrio: contacto?.barrio, Municipio: contacto?.municipio, 'Telefono alternativo': contacto?.telefonoAlternativo, Referencias: contacto?.referencias, 'Verificado el': contacto?.verificadoEn ? fechaCrm(contacto.verificadoEn) : null }).map(([label, value]) => <div key={label} className="min-w-0 break-words"><dt className="text-gray-500">{label}</dt><dd>{value || 'Sin registrar'}</dd></div>)}
          </dl>}
          {datos.cambiosContacto.length > 0 && <div className="mt-5 border-t border-gray-200 pt-3"><h4 className="font-medium text-sm mb-2">Cambios de ubicacion y responsable</h4><ul className="space-y-2">{datos.cambiosContacto.map(c => <li key={c.id} className="text-sm break-words"><span className="text-gray-500">{fechaCrm(c.creadoEn)} · {c.nombreUsuario}</span><p>{c.anterior?.direccionActual || 'Sin direccion'} → {c.nuevo.direccionActual || 'Sin direccion'} · {ubicacionesCrm[c.nuevo.estadoUbicacion]}</p></li>)}</ul></div>}
        </>}
        {vista === 'creditos' && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-gray-200"><th className="p-2">Credito</th><th className="p-2">Saldo</th><th className="p-2">Mora</th><th className="p-2">Corte Excel</th></tr></thead><tbody>{datos.creditos.map(c => <tr key={c.id} className="border-b border-gray-100"><td className="p-2"><Link className="text-teal-800 underline" to={`/crm/cartera/${c.id}`}>#{c.numero}</Link>{c.id === creditoId && ' · Actual'}</td><td className="p-2 whitespace-nowrap">{pesosCrm(c.saldo)}</td><td className="p-2">{c.diasMora} dias</td><td className="p-2">{fechaCrm(c.fechaCorteExcel)}</td></tr>)}</tbody></table></div>}
        {vista === 'historial' && <ul className="divide-y divide-gray-200">{datos.historial.length === 0 && <li className="text-gray-500 text-sm">Sin gestiones</li>}{datos.historial.map(({ gestion: g, numero }) => <li key={g.id} className="py-3 text-sm break-words"><p className="font-medium">Credito #{numero} · {g.resultado.replace(/_/g, ' ')}</p><p className="text-gray-500">{new Date(g.fechaGestion).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · {g.nombreUsuario}</p>{g.notas && <p className="mt-1">{g.notas}</p>}</li>)}</ul>}
      </div>
    </section>
  );
}
