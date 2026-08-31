import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  Wallet,
  Landmark,
  Users,
  Package,
  Settings,
  LogOut,
  X,
  ChevronLeft,
  ChevronRight,
  UserCog,
  Shield,
  ShoppingCart,
  MessageCircle,
  CreditCard,
  Phone,
  ChevronDown,
  FolderKanban,
} from 'lucide-react';
import { useMediaQuery } from '../utilidades/useMediaQuery.js';
import type { UsuarioSesion } from '../api/hooks.js';

export interface Seccion {
  ruta: string;
  texto: string;
  icono: typeof LayoutDashboard;
  /** Si es true, solo lo ve el rol admin. */
  soloAdmin?: boolean;
  /** Grupo al que pertenece la sección */
  grupo?: string;
}

export const SECCIONES: Seccion[] = [
  { ruta: '/', texto: 'Resumen', icono: LayoutDashboard, soloAdmin: true },
  { ruta: '/registrar', texto: 'Registrar', icono: PlusCircle, soloAdmin: true },
  { ruta: '/empleados', texto: 'Empleados', icono: Users, soloAdmin: true },
  { ruta: '/productos', texto: 'Catalogo', icono: Package },

  // Grupo Finanzas
  { ruta: '/nomina', texto: 'Nómina', icono: Wallet, soloAdmin: true, grupo: 'Finanzas' },
  { ruta: '/caja', texto: 'Caja', icono: Landmark, soloAdmin: true, grupo: 'Finanzas' },

  // Grupo WhatsApp
  { ruta: '/admin', texto: 'Administración', icono: Shield, soloAdmin: true, grupo: 'WhatsApp' },
  { ruta: '/conversaciones', texto: 'Conversaciones', icono: MessageCircle, soloAdmin: true, grupo: 'WhatsApp' },
  { ruta: '/pedidos', texto: 'Pedidos', icono: ShoppingCart, soloAdmin: true, grupo: 'WhatsApp' },

  // Grupo CRM
  { ruta: '/crm/cartera', texto: 'Cartera', icono: CreditCard, soloAdmin: true, grupo: 'CRM' },
  { ruta: '/crm/gestiones', texto: 'Gestión de Cobros', icono: Phone, soloAdmin: true, grupo: 'CRM' },
  { ruta: '/crm/grupos', texto: 'Grupos de Gestión', icono: FolderKanban, soloAdmin: true, grupo: 'CRM' },

  { ruta: '/usuarios', texto: 'Usuarios', icono: UserCog, soloAdmin: true },
  { ruta: '/ajustes', texto: 'Ajustes', icono: Settings },
];

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  usuario: UsuarioSesion;
  onSalir: () => void;
  expandido: boolean;
  onToggleExpandir: () => void;
}

/**
 * Menu lateral.
 *
 * En pantalla grande esta fijo a la izquierda y se puede colapsar para ganar
 * espacio. En celular se abre por encima del contenido con un fondo oscuro
 * detras, y se cierra al elegir una opcion, al tocar el fondo o con Escape.
 */
export function MenuLateral({ abierto, onCerrar, usuario, onSalir, expandido, onToggleExpandir }: Props) {
  const panel = useRef<HTMLElement>(null);

  /**
   * El menu esta oculto solo cuando esta cerrado Y la pantalla es angosta.
   *
   * En escritorio el panel esta siempre a la vista, asi que marcarlo como
   * aria-hidden lo borraria para los lectores de pantalla: la navegacion
   * completa dejaria de existir para quien la use, aunque se vea en pantalla.
   * Por eso se consulta el ancho real en vez de asumir el estado del boton.
   */
  const anchoEscritorio = useMediaQuery('(min-width: 1024px)');
  const oculto = !abierto && !anchoEscritorio;

  // Escape cierra el menu: es lo que espera cualquiera que use teclado.
  useEffect(() => {
    if (!abierto) return;

    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }

    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  /**
   * Con el menu abierto encima del contenido se bloquea el scroll del fondo.
   * Sin esto, arrastrar sobre el menu mueve la pagina de atras y se ve raro.
   *
   * Solo aplica en celular: en escritorio el menu no tapa nada, y bloquear el
   * scroll ahi dejaria la pagina congelada sin motivo.
   */
  useEffect(() => {
    if (!abierto || anchoEscritorio) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto, anchoEscritorio]);

  /**
   * Al abrirse en celular, el foco entra al panel para que el lector de
   * pantalla lo anuncie. En escritorio no se mueve el foco: el menu ya estaba
   * visible y robarlo interrumpiria lo que la persona estuviera haciendo.
   */
  useEffect(() => {
    if (abierto && !anchoEscritorio) panel.current?.focus();
  }, [abierto, anchoEscritorio]);

  const visibles = SECCIONES.filter(
    (seccion) => !seccion.soloAdmin || usuario.rol === 'admin',
  );

  // Agrupar secciones por grupo
  const grupos = visibles.reduce((acc, seccion) => {
    const grupo = seccion.grupo || 'principal';
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(seccion);
    return acc;
  }, {} as Record<string, Seccion[]>);

  const ordenGrupos = ['principal', 'Finanzas', 'WhatsApp', 'CRM'];

  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({
    Finanzas: true,
    WhatsApp: false,
    CRM: false,
  });

  const toggleGrupo = (grupo: string) => {
    setGruposAbiertos(prev => ({ ...prev, [grupo]: !prev[grupo] }));
  };

  return (
    <>
      {/*
        Fondo oscuro solo en celular. En pantalla grande el menu esta fijo y no
        tapa nada, asi que no hace falta.
      */}
      <div
        onClick={onCerrar}
        aria-hidden
        className={`fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        ref={panel}
        tabIndex={-1}
        aria-label="Menu principal"
        aria-hidden={oculto}
        className={`panel-metal fixed inset-y-0 left-0 z-40 flex flex-col
          transition-all duration-200 ease-out outline-none
          ${abierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${expandido ? 'w-72' : 'w-72 lg:w-20'}`}
      >
        {/* Las separaciones son blanco translucido: sobre el azul, una linea
            gris se ve como suciedad y no como division. */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          {expandido ? (
            <div>
              <p className="text-base font-semibold text-white">Control</p>
              <p className="text-xs text-white/65">Dinero y nomina</p>
            </div>
          ) : (
            <div className="mx-auto">
              <p className="text-base font-bold text-white">C</p>
            </div>
          )}

          {/* Boton de cerrar en celular, colapsar/expandir en escritorio */}
          <button
            type="button"
            onClick={anchoEscritorio ? onToggleExpandir : onCerrar}
            className="foco-claro -mr-1 rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={anchoEscritorio ? (expandido ? 'Contraer menu' : 'Expandir menu') : 'Cerrar menu'}
          >
            {anchoEscritorio ? (
              expandido ? <ChevronLeft size={20} /> : <ChevronRight size={20} />
            ) : (
              <X size={20} />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {ordenGrupos.map((nombreGrupo) => {
            const secciones = grupos[nombreGrupo];
            if (!secciones || secciones.length === 0) return null;

            // Grupo principal sin acordeón
            if (nombreGrupo === 'principal') {
              return (
                <div key={nombreGrupo}>
                  {secciones.map((seccion) => (
                    <NavLink
                      key={seccion.ruta}
                      to={seccion.ruta}
                      end={seccion.ruta === '/'}
                      onClick={onCerrar}
                      title={expandido ? undefined : seccion.texto}
                      className={({ isActive }) =>
                        `foco-claro relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                         transition ${expandido ? '' : 'justify-center lg:px-2'} ${
                           isActive
                             ? 'bg-white/10 font-semibold text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.1)]'
                             : 'font-medium text-white/85 hover:bg-white/[0.06] hover:text-white'
                         }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-white"
                            />
                          )}
                          <seccion.icono size={18} className={isActive ? 'text-white' : 'text-white/85'} />
                          {expandido && <span>{seccion.texto}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              );
            }

            // Grupos con acordeón
            const estaAbierto = gruposAbiertos[nombreGrupo];
            return (
              <div key={nombreGrupo} className="mt-3">
                {expandido ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleGrupo(nombreGrupo)}
                      className="foco-claro w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider hover:text-white/70 transition rounded-lg hover:bg-white/5"
                    >
                      <span>{nombreGrupo}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${estaAbierto ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {estaAbierto && (
                      <div className="mt-1">
                        {secciones.map((seccion) => (
                          <NavLink
                            key={seccion.ruta}
                            to={seccion.ruta}
                            end={seccion.ruta === '/'}
                            onClick={onCerrar}
                            className={({ isActive }) =>
                              `foco-claro relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                               transition ${
                                 isActive
                                   ? 'bg-white/10 font-semibold text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.1)]'
                                   : 'font-medium text-white/85 hover:bg-white/[0.06] hover:text-white'
                               }`
                            }
                          >
                            {({ isActive }) => (
                              <>
                                {isActive && (
                                  <span
                                    aria-hidden
                                    className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-white"
                                  />
                                )}
                                <seccion.icono size={18} className={isActive ? 'text-white' : 'text-white/85'} />
                                <span>{seccion.texto}</span>
                              </>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  // Cuando el menú está contraído, mostrar iconos sin agrupar
                  secciones.map((seccion) => (
                    <NavLink
                      key={seccion.ruta}
                      to={seccion.ruta}
                      onClick={onCerrar}
                      title={seccion.texto}
                      className={({ isActive }) =>
                        `foco-claro relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                         transition justify-center lg:px-2 ${
                           isActive
                             ? 'bg-white/10 font-semibold text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.1)]'
                             : 'font-medium text-white/85 hover:bg-white/[0.06] hover:text-white'
                         }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-white"
                            />
                          )}
                          <seccion.icono size={18} className={isActive ? 'text-white' : 'text-white/85'} />
                        </>
                      )}
                    </NavLink>
                  ))
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {expandido && (
            <div className="mb-2 px-3 py-1">
              <p className="truncate text-sm font-medium text-white">{usuario.nombre}</p>
              <p className="text-xs text-white/65">
                {usuario.rol === 'admin' ? 'Administrador' : 'Catalogo'}
              </p>
            </div>
          )}

          {/*
            Salir queda blanco como el resto y solo se tine de rojo al pasar por
            encima. En rojo permanente competiria por atencion con la navegacion,
            y es la accion que menos se usa.
          */}
          <button
            type="button"
            onClick={onSalir}
            title={expandido ? undefined : 'Cerrar sesion'}
            className={`foco-claro flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm
              font-medium text-white/85 transition hover:bg-red-500/25 hover:text-white ${
                expandido ? '' : 'justify-center lg:px-2'
              }`}
          >
            <LogOut size={18} />
            {expandido && <span>Cerrar sesion</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
