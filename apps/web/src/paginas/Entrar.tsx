import { useState, type FormEvent } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useEntrar, useInstalar } from '../api/hooks.js';
import { Aviso } from '../componentes/base.js';

/** Largo minimo, igual al que exige el backend. */
const MINIMO_CONTRASENA = 8;

/**
 * Pantalla de entrada.
 *
 * Cumple dos funciones: crear el primer administrador cuando el sistema esta
 * recien instalado, y el ingreso normal despues. Se hace asi para no dejar un
 * usuario y contrasena por defecto en el codigo, que es la forma mas comun de
 * que entren a un sistema nuevo.
 */
export function Entrar({ necesitaInstalacion }: { necesitaInstalacion: boolean }) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [nombre, setNombre] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);

  const entrar = useEntrar();
  const instalar = useInstalar();
  const accion = necesitaInstalacion ? instalar : entrar;

  const cortaDeMas = necesitaInstalacion && contrasena.length > 0 && contrasena.length < MINIMO_CONTRASENA;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (necesitaInstalacion) {
      await instalar.mutateAsync({ usuario, contrasena, nombre });
    } else {
      await entrar.mutateAsync({ usuario, contrasena });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-metal-600 text-white">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {necesitaInstalacion ? 'Crea tu cuenta' : 'Control de dinero'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {necesitaInstalacion
              ? 'Esta sera la cuenta de administrador del sistema.'
              : 'Entra para continuar.'}
          </p>
        </div>

        <form onSubmit={enviar} className="tarjeta space-y-4">
          <Aviso error={accion.error} />

          {necesitaInstalacion && (
            <div>
              <label className="etiqueta" htmlFor="nombre">
                Tu nombre
              </label>
              <input
                id="nombre"
                type="text"
                className="campo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Juan D"
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>
          )}

          <div>
            <label className="etiqueta" htmlFor="usuario">
              Usuario
            </label>
            <div className="relative">
              <User
                size={18}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                id="usuario"
                type="text"
                className="campo pl-11"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="tu.usuario"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
          </div>

          <div>
            <label className="etiqueta" htmlFor="contrasena">
              Contrasena
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                id="contrasena"
                type={verContrasena ? 'text' : 'password'}
                className="campo pr-11 pl-11"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                autoComplete={necesitaInstalacion ? 'new-password' : 'current-password'}
                required
              />
              {/*
                Poder ver la contrasena reduce los errores de escritura, sobre
                todo en celular donde el teclado no siempre acierta.
              */}
              <button
                type="button"
                onClick={() => setVerContrasena((previo) => !previo)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:text-slate-600"
                aria-label={verContrasena ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                {verContrasena ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {necesitaInstalacion && (
              <p className={`mt-1.5 text-xs ${cortaDeMas ? 'text-red-600' : 'text-slate-500'}`}>
                Minimo {MINIMO_CONTRASENA} caracteres.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={accion.isPending || cortaDeMas}
            className="w-full rounded-xl bg-metal-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-metal-700 disabled:cursor-not-allowed disabled:bg-metal-300"
          >
            {accion.isPending
              ? 'Un momento...'
              : necesitaInstalacion
                ? 'Crear cuenta y entrar'
                : 'Entrar'}
          </button>
        </form>

        {necesitaInstalacion && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Guarda bien estos datos: no hay forma de recuperar la contrasena desde la pantalla.
          </p>
        )}
      </div>
    </div>
  );
}
