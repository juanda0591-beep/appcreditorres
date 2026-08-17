import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Toaster } from 'sonner';
import { useSesion, useSalir, type UsuarioSesion } from './api/hooks.js';
import { MenuLateral, SECCIONES } from './componentes/MenuLateral.js';
import { Cargando } from './componentes/base.js';
import { Entrar } from './paginas/Entrar.js';
import { Tablero } from './paginas/Tablero.js';
import { Empleados } from './paginas/Empleados.js';
import { DetalleEmpleado } from './paginas/DetalleEmpleado.js';
import { RegistroDiario } from './paginas/RegistroDiario.js';
import { Nomina } from './paginas/Nomina.js';
import { Caja } from './paginas/Caja.js';
import { Productos } from './paginas/Productos.js';
import { Ajustes } from './paginas/Ajustes.js';
import Usuarios from './paginas/Usuarios.js';
import { PaginaAdmin } from './paginas/Admin.js';
import { PaginaPedidos } from './paginas/Pedidos.js';

export function App() {
  const sesion = useSesion();

  if (sesion.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Cargando texto="Abriendo" />
      </div>
    );
  }

  // Sin sesion no se monta nada de la app: ni las rutas ni las consultas de
  // datos existen todavia, asi que no hay peticiones que vayan a dar 401.
  const usuario = sesion.data?.autenticado ? sesion.data.usuario : null;

  if (!usuario) {
    return (
      <>
        <Toaster richColors position="top-right" />
        <Entrar necesitaInstalacion={sesion.data?.necesitaInstalacion ?? false} />
      </>
    );
  }

  return (
    <>
      <Toaster richColors position="top-right" />
      <AppAutenticada usuario={usuario} />
    </>
  );
}

/**
 * Recibe el usuario como propiedad en vez de volver a consultar la sesion.
 *
 * Asi este componente no puede quedarse sin usuario a mitad de camino: al
 * cerrar sesion, `App` deja de montarlo y muestra el login. Cuando lo
 * consultaba por su cuenta, el orden de los re-renders lo dejaba con el usuario
 * en nulo y la pantalla quedaba en blanco.
 */
function AppAutenticada({ usuario }: { usuario: UsuarioSesion }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuExpandido, setMenuExpandido] = useState(() => {
    const guardado = localStorage.getItem('menu-expandido');
    return guardado ? guardado === 'true' : true;
  });
  const salir = useSalir();
  const ubicacion = useLocation();

  useEffect(() => {
    localStorage.setItem('menu-expandido', menuExpandido.toString());
  }, [menuExpandido]);

  const esAdmin = usuario.rol === 'admin';
  const seccionActual = SECCIONES.find((s) => s.ruta === ubicacion.pathname);

  return (
    <div
      className={`min-h-dvh transition-[padding] duration-200 ${
        menuExpandido ? 'lg:pl-72' : 'lg:pl-20'
      }`}
    >
      <MenuLateral
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        usuario={usuario}
        onSalir={() => salir.mutate()}
        expandido={menuExpandido}
        onToggleExpandir={() => setMenuExpandido(!menuExpandido)}
      />

      {/*
        Barra superior. En celular lleva el boton de hamburguesa; en pantalla
        grande solo el titulo, porque el menu ya esta visible al lado.
      */}
      <header className="barra-segura sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            className="-ml-1 rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menu"
            aria-expanded={menuAbierto}
          >
            <Menu size={22} />
          </button>

          <h1 className="text-base font-semibold text-slate-900">
            {seccionActual?.texto ?? 'Control'}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        <Routes>
          {/*
            Las rutas con informacion de plata solo se montan para admin. El
            backend igual las protege: esto es para que la persona no vea
            pantallas que le van a responder 403.
          */}
          {esAdmin ? (
            <>
              <Route path="/" element={<Tablero />} />
              <Route path="/registrar" element={<RegistroDiario />} />
              <Route path="/nomina" element={<Nomina />} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/empleados" element={<Empleados />} />
              <Route path="/empleados/:id" element={<DetalleEmpleado />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/admin" element={<PaginaAdmin />} />
              <Route path="/pedidos" element={<PaginaPedidos />} />
            </>
          ) : (
            <Route path="/" element={<Navigate to="/productos" replace />} />
          )}

          <Route path="/productos" element={<Productos />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to={esAdmin ? '/' : '/productos'} replace />} />
        </Routes>
      </main>
    </div>
  );
}
