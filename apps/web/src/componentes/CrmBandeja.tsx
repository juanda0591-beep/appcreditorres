import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ExternalLink, Phone, RefreshCw } from 'lucide-react';
import { obtener } from '../api/cliente';
import { categoriasCrm, fechaCrm, pesosCrm, ubicacionesCrm, type AgendaCrm, type CreditoCrm } from '../api/crm-operativo';

const boton = 'inline-flex items-center justify-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50';

export function CrmBandeja({ onGestionar }: { onGestionar: (credito: CreditoCrm) => void }) {
  const [categoria, setCategoria] = useState('todos');
  const [responsableId, setResponsableId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(0);
  const [vista, setVista] = useState('agenda');
  useEffect(() => { const timer = setTimeout(() => { setConsulta(busqueda); setPagina(0); }, 300); return () => clearTimeout(timer); }, [busqueda]);
  const params = new URLSearchParams({ categoria, responsableId, busqueda: consulta, pagina: String(pagina) });
  const datos = useQuery({ queryKey: ['crm', 'agenda', categoria, responsableId, consulta, pagina], queryFn: () => obtener<AgendaCrm>(`/api/admin/crm/agenda?${params}`), refetchInterval: 60000 });
  const agenda = datos.data;
  if (datos.isError) return <div className="py-6 text-red-700" role="alert">{datos.error.message} <button className={boton} onClick={() => datos.refetch()}><RefreshCw size={16} /> Reintentar</button></div>;
  if (!agenda) return <p className="py-6 text-gray-500">Cargando agenda...</p>;
  const ultima = agenda.importaciones[0];
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
      <div className="text-sm text-gray-600"><p>Fecha de trabajo: {fechaCrm(agenda.hoy)}</p><p>Ultima carga: {ultima ? `${fechaCrm(ultima.fechaCorte)} · ${ultima.archivo}` : 'Sin cargas registradas'}{ultima && !ultima.finalizadaEn ? ' · Sin finalizar' : ultima?.errores ? ` · ${ultima.errores} filas sin aplicar` : ''}</p></div>
      <button className={boton} onClick={() => datos.refetch()} disabled={datos.isFetching} title="Actualizar agenda"><RefreshCw size={16} /> Actualizar</button>
    </div>
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-5 border-b border-gray-200">
      {Object.entries({ 'Personas por gestionar': agenda.contadores.todos ?? 0, 'Promesas vencidas': agenda.contadores.promesas_vencidas ?? 0, 'Abonos por revisar': agenda.contadores.revisar_abonos ?? 0, 'Por localizar': agenda.contadores.localizar ?? 0 }).map(([label, valor]) => <div key={label}><dt className="text-sm text-gray-500">{label}</dt><dd className="text-2xl font-semibold mt-1">{valor}</dd></div>)}
    </dl>
    <div role="tablist" aria-label="Agenda de cobranza" className="flex border-b border-gray-200 mb-4">
      {Object.entries({ agenda: 'Prioridades', indicadores: 'Indicadores', importaciones: 'Cargas de Excel' }).map(([id, label]) => <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)} className={`px-3 py-3 text-sm border-b-2 ${vista === id ? 'border-teal-700 font-semibold text-teal-800' : 'border-transparent text-gray-600'}`}>{label}</button>)}
    </div>
    {vista === 'agenda' && <>
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label className="text-sm">Prioridad<select className="block w-full mt-1 rounded border border-gray-300 px-3 py-2 bg-white" value={categoria} onChange={e => { setCategoria(e.target.value); setPagina(0); }}>{Object.entries(categoriasCrm).map(([id, label]) => <option key={id} value={id}>{label} ({agenda.contadores[id] ?? 0})</option>)}</select></label>
        <label className="text-sm">Responsable<select className="block w-full mt-1 rounded border border-gray-300 px-3 py-2 bg-white" value={responsableId} onChange={e => { setResponsableId(e.target.value); setPagina(0); }}><option value="">Todos</option><option value="sin_asignar">Sin asignar</option>{agenda.responsables.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
        <label className="text-sm">Cliente, cedula, credito o telefono<input className="block w-full mt-1 rounded border border-gray-300 px-3 py-2" type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
      </div>
      <ul className="md:hidden divide-y divide-gray-200 border-y border-gray-200">
        {agenda.filas.map(f => <li key={f.documento} className="py-4 text-sm break-words">
          <Link to={`/crm/cartera/${f.creditoPrincipal.id}`} className="font-semibold text-teal-800 underline">{f.cliente}</Link>
          <p className="mt-1 text-gray-500">{f.documento} · {f.creditos.map(c => `#${c.numero}`).join(', ')}</p>
          <p className="mt-2 font-medium">{pesosCrm(f.saldo)} · Hasta {f.diasMora} dias de mora</p>
          <ul className="mt-2 space-y-1">{f.categorias.map(c => <li key={c} className={c === 'promesas_vencidas' ? 'text-red-700' : c === 'revisar_abonos' ? 'text-amber-800' : 'text-gray-600'}>{categoriasCrm[c]}</li>)}</ul>
          <p className="mt-2 text-gray-600">{f.responsableNombre ?? 'Sin asignar'}{f.fechaProxima ? ` · ${fechaCrm(f.fechaProxima)}` : ''}</p>
          <div className="flex gap-2 mt-3"><button className={boton} onClick={() => onGestionar(f.creditoPrincipal)}><Phone size={16} /> Gestionar</button><Link className={boton} to={`/crm/cartera/${f.creditoPrincipal.id}`}><ExternalLink size={16} /> Abrir ficha</Link></div>
        </li>)}
        {!agenda.filas.length && <li className="py-5 text-center text-gray-500">No hay personas con estos filtros</li>}
      </ul>
      <div className="hidden md:block overflow-x-auto border-y border-gray-200">
        <table className="w-full text-sm min-w-[720px]"><thead className="bg-gray-50 text-gray-600 text-left"><tr><th className="p-3">Persona / creditos</th><th className="p-3">Prioridad</th><th className="p-3 text-right">Saldo conjunto</th><th className="p-3">Responsable</th><th className="p-3">Acciones</th></tr></thead><tbody>
          {agenda.filas.map(f => <tr key={f.documento} className="border-t border-gray-200 align-top">
            <td className="p-3 max-w-60 break-words"><Link to={`/crm/cartera/${f.creditoPrincipal.id}`} className="font-semibold text-teal-800 underline">{f.cliente}</Link><p className="text-gray-500 mt-1">{f.documento} · {f.creditos.length} credito(s)</p><p className="text-gray-500">{f.creditos.map(c => `#${c.numero}`).join(', ')}</p></td>
            <td className="p-3 max-w-56"><ul className="space-y-1">{f.categorias.map(c => <li key={c} className={c === 'promesas_vencidas' ? 'text-red-700 font-medium' : c === 'revisar_abonos' ? 'text-amber-800' : 'text-gray-600'}>{categoriasCrm[c]}</li>)}</ul>{f.fechaProxima && <p className="mt-2 font-medium">{fechaCrm(f.fechaProxima)}</p>}<p className="mt-1 text-gray-500">{ubicacionesCrm[f.estadoUbicacion]}</p></td>
            <td className="p-3 text-right whitespace-nowrap"><p className="font-medium">{pesosCrm(f.saldo)}</p><p className="text-gray-500 mt-1">Hasta {f.diasMora} dias de mora</p></td>
            <td className="p-3">{f.responsableNombre ?? 'Sin asignar'}<p className="mt-1 text-gray-500">{f.ultimaGestion ? `Ultima gestion: ${fechaCrm(f.ultimaGestion)}` : 'Sin gestion'}</p></td>
            <td className="p-3"><div className="flex gap-2"><button className={boton} title="Registrar gestion" onClick={() => onGestionar(f.creditoPrincipal)}><Phone size={16} /></button><Link className={boton} to={`/crm/cartera/${f.creditoPrincipal.id}`} title="Abrir ficha y promesas"><ExternalLink size={16} /></Link></div></td>
          </tr>)}
          {!agenda.filas.length && <tr><td colSpan={5} className="p-6 text-center text-gray-500">No hay personas con estos filtros</td></tr>}
        </tbody></table>
      </div>
      <div className="flex items-center justify-between gap-2 py-3 text-sm"><span>{agenda.total} personas · Pagina {pagina + 1} de {Math.max(1, Math.ceil(agenda.total / 30))}</span><div className="flex gap-2"><button className={boton} title="Pagina anterior" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}><ArrowLeft size={16} /></button><button className={boton} title="Pagina siguiente" disabled={(pagina + 1) * 30 >= agenda.total} onClick={() => setPagina(p => p + 1)}><ArrowRight size={16} /></button></div></div>
    </>}
    {vista === 'indicadores' && <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-gray-500">Saldo de cartera</dt><dd className="text-xl font-semibold">{pesosCrm(agenda.indicadores.saldo)}</dd></div><div><dt className="text-sm text-gray-500">Promesas creadas este mes / cumplidas</dt><dd className="text-xl font-semibold">{agenda.indicadores.promesasMes} / {agenda.indicadores.cumplidasMes}</dd></div><div><dt className="text-sm text-gray-500">Personas localizadas</dt><dd className="text-xl font-semibold">{agenda.indicadores.localizados}</dd></div></dl>
      <section><h3 className="font-semibold mb-3">Antiguedad de cartera</h3><table className="w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="py-2">Mora</th><th>Creditos</th><th className="text-right">Saldo</th></tr></thead><tbody>{agenda.indicadores.tramos.map(t => <tr key={t.nombre} className="border-t border-gray-200"><td className="py-3">{t.nombre}</td><td>{t.creditos}</td><td className="text-right">{pesosCrm(t.saldo)}</td></tr>)}</tbody></table></section>
      <section><h3 className="font-semibold mb-3">Gestion del mes por responsable</h3><div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]"><thead className="text-left text-gray-500"><tr><th className="py-2">Responsable</th><th>Asignados</th><th>Gestiones</th><th>Promesas</th><th>Cumplidas</th></tr></thead><tbody>{agenda.indicadores.porGestor.map(g => <tr key={g.nombre} className="border-t border-gray-200"><td className="py-3">{g.nombre}</td><td>{g.clientesAsignados}</td><td>{g.gestionesMes}</td><td>{g.promesas}</td><td>{g.cumplidas}</td></tr>)}</tbody></table></div></section>
    </div>}
    {vista === 'importaciones' && <section><h3 className="font-semibold mb-3">Ultimas cargas y variacion de creditos comparados</h3>{!agenda.importaciones.length ? <p className="text-sm text-gray-500">Sin cargas registradas</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="text-left text-gray-500"><tr><th className="p-2">Corte / archivo</th><th className="p-2">Nuevos</th><th className="p-2">Comparados</th><th className="p-2">Variacion saldo</th><th className="p-2">Variacion abonos</th><th className="p-2">Estado</th></tr></thead><tbody>{agenda.importaciones.map(i => <tr key={i.id} className="border-t border-gray-200"><td className="p-2 max-w-52 break-words">{fechaCrm(i.fechaCorte)}<p className="text-gray-500">{i.archivo}</p></td><td className="p-2">{i.nuevos}</td><td className="p-2">{i.comparados}</td><td className="p-2 whitespace-nowrap">{pesosCrm(i.saldoNuevo - i.saldoAnterior)}</td><td className="p-2 whitespace-nowrap">{pesosCrm(i.abonoNuevo - i.abonoAnterior)}</td><td className="p-2">{!i.finalizadaEn ? 'Sin finalizar' : i.errores ? `${i.errores} filas sin aplicar` : 'Completada'}</td></tr>)}</tbody></table></div>}</section>}
  </div>;
}
