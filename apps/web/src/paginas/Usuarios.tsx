import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Usuario, NuevoUsuario, Rol, Permisos } from '@credito/shared';

const PERMISOS_POR_ROL: Record<Exclude<Rol, 'custom'>, Permisos> = {
  admin: {
    dashboard: true,
    empleados: true,
    municipios: true,
    ventas: true,
    cobros: true,
    gastos: true,
    liquidaciones: true,
    caja: true,
    prestamos: true,
    catalogo: true,
    configuracion: true,
    usuarios: true,
  },
  vendedor: {
    dashboard: true,
    empleados: false,
    municipios: true,
    ventas: true,
    cobros: true,
    gastos: true,
    liquidaciones: false,
    caja: false,
    prestamos: false,
    catalogo: true,
    configuracion: false,
    usuarios: false,
  },
  catalogo: {
    dashboard: false,
    empleados: false,
    municipios: false,
    ventas: false,
    cobros: false,
    gastos: false,
    liquidaciones: false,
    caja: false,
    prestamos: false,
    catalogo: true,
    configuracion: false,
    usuarios: false,
  },
};

export default function Usuarios() {
  const queryClient = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [usuarioEditar, setUsuarioEditar] = useState<Usuario | null>(null);

  const { data: usuarios = [], isLoading } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const res = await fetch('/api/usuarios', { credentials: 'include' });
      if (!res.ok) throw new Error('Error al cargar usuarios');
      return res.json();
    },
  });

  const crearUsuario = useMutation({
    mutationFn: async (datos: NuevoUsuario) => {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(datos),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al crear usuario');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setMostrarFormulario(false);
    },
  });

  const actualizarUsuario = useMutation({
    mutationFn: async ({
      id,
      datos,
    }: {
      id: string;
      datos: Partial<NuevoUsuario>;
    }) => {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(datos),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al actualizar usuario');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setUsuarioEditar(null);
      setMostrarFormulario(false);
    },
  });

  const eliminarUsuario = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Error al eliminar usuario');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
  });

  if (isLoading) return <div className="cargando">Cargando usuarios...</div>;

  return (
    <div className="pagina-usuarios">
      <div className="encabezado">
        <h1>Usuarios del Sistema</h1>
        <button
          className="boton-primario"
          onClick={() => {
            setUsuarioEditar(null);
            setMostrarFormulario(true);
          }}
        >
          + Nuevo Usuario
        </button>
      </div>

      {mostrarFormulario && (
        <FormularioUsuario
          usuario={usuarioEditar}
          onGuardar={(datos) => {
            if (usuarioEditar) {
              actualizarUsuario.mutate({ id: usuarioEditar.id, datos });
            } else {
              crearUsuario.mutate(datos as NuevoUsuario);
            }
          }}
          onCancelar={() => {
            setMostrarFormulario(false);
            setUsuarioEditar(null);
          }}
          guardando={crearUsuario.isPending || actualizarUsuario.isPending}
          error={crearUsuario.error?.message || actualizarUsuario.error?.message}
        />
      )}

      <div className="lista-usuarios">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último Acceso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.usuario}</td>
                <td>{usuario.nombre}</td>
                <td>
                  <span className={`badge badge-${usuario.rol}`}>
                    {usuario.rol}
                  </span>
                </td>
                <td>
                  <span
                    className={`estado ${usuario.activo ? 'activo' : 'inactivo'}`}
                  >
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  {usuario.ultimoAcceso
                    ? new Date(usuario.ultimoAcceso).toLocaleString()
                    : 'Nunca'}
                </td>
                <td className="acciones">
                  <button
                    className="boton-icono"
                    onClick={() => {
                      setUsuarioEditar(usuario);
                      setMostrarFormulario(true);
                    }}
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    className="boton-icono boton-peligro"
                    onClick={() => {
                      if (
                        confirm(
                          `¿Eliminar usuario ${usuario.nombre}? Esta acción no se puede deshacer.`,
                        )
                      ) {
                        eliminarUsuario.mutate(usuario.id);
                      }
                    }}
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .pagina-usuarios {
          padding: 20px;
        }
        .encabezado {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .lista-usuarios {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background: #f8f9fa;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          border-bottom: 2px solid #dee2e6;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #dee2e6;
        }
        .badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge-admin { background: #d1ecf1; color: #0c5460; }
        .badge-vendedor { background: #d4edda; color: #155724; }
        .badge-catalogo { background: #fff3cd; color: #856404; }
        .badge-custom { background: #e2e3e5; color: #383d41; }
        .estado {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        .estado.activo { background: #d4edda; color: #155724; }
        .estado.inactivo { background: #f8d7da; color: #721c24; }
        .acciones {
          display: flex;
          gap: 8px;
        }
        .boton-icono {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 4px;
        }
        .boton-icono:hover {
          opacity: 0.7;
        }
        .boton-primario {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        }
        .boton-primario:hover {
          background: #0056b3;
        }
      `}</style>
    </div>
  );
}

interface FormularioUsuarioProps {
  usuario: Usuario | null;
  onGuardar: (datos: Partial<NuevoUsuario>) => void;
  onCancelar: () => void;
  guardando: boolean;
  error?: string;
}

function FormularioUsuario({
  usuario,
  onGuardar,
  onCancelar,
  guardando,
  error,
}: FormularioUsuarioProps) {
  const [usuarioNombre, setUsuarioNombre] = useState(usuario?.usuario || '');
  const [contrasena, setContrasena] = useState('');
  const [cambiarContrasena, setCambiarContrasena] = useState(false);
  const [nombre, setNombre] = useState(usuario?.nombre || '');
  const [rol, setRol] = useState<Rol>(usuario?.rol || 'vendedor');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [permisosCustom, setPermisosCustom] = useState<Permisos>(
    usuario?.permisos || PERMISOS_POR_ROL.vendedor,
  );

  const permisos = rol === 'custom' ? permisosCustom : PERMISOS_POR_ROL[rol];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const datos: Partial<NuevoUsuario> = {
      nombre,
      rol,
      activo,
      permisos: rol === 'custom' ? permisosCustom : undefined,
    };
    if (!usuario) {
      datos.usuario = usuarioNombre;
      datos.contrasena = contrasena;
    } else if (cambiarContrasena && contrasena) {
      datos.contrasena = contrasena;
    }
    onGuardar(datos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-contenido">
        <h2>{usuario ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label>Usuario (login)</label>
            <input
              type="text"
              value={usuarioNombre}
              onChange={(e) => setUsuarioNombre(e.target.value.toLowerCase())}
              disabled={!!usuario}
              required
              minLength={3}
              maxLength={50}
            />
          </div>

          {!usuario && (
            <div className="campo">
              <label>Contraseña</label>
              <input
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          {usuario && (
            <div className="campo">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cambiarContrasena}
                  onChange={(e) => {
                    setCambiarContrasena(e.target.checked);
                    if (!e.target.checked) setContrasena('');
                  }}
                />
                Cambiar contraseña
              </label>
              {cambiarContrasena && (
                <input
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="Nueva contraseña"
                  required
                  minLength={6}
                  style={{ marginTop: '8px' }}
                />
              )}
            </div>
          )}

          <div className="campo">
            <label>Nombre Completo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          <div className="campo">
            <label>Rol</label>
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="admin">Admin (acceso completo)</option>
              <option value="vendedor">Vendedor (sin finanzas)</option>
              <option value="catalogo">Catálogo (solo vista pública)</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {rol === 'custom' && (
            <div className="campo-permisos">
              <label>Permisos Personalizados</label>
              <div className="grid-permisos">
                {(Object.keys(permisosCustom) as Array<keyof Permisos>).map(
                  (modulo) => (
                    <label key={modulo} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={permisosCustom[modulo]}
                        onChange={(e) =>
                          setPermisosCustom({
                            ...permisosCustom,
                            [modulo]: e.target.checked,
                          })
                        }
                      />
                      {modulo.charAt(0).toUpperCase() + modulo.slice(1)}
                    </label>
                  ),
                )}
              </div>
            </div>
          )}

          {rol !== 'custom' && (
            <div className="campo-permisos">
              <label>Permisos del Rol</label>
              <div className="permisos-readonly">
                {(Object.entries(permisos) as Array<[keyof Permisos, boolean]>)
                  .filter(([, activo]) => activo)
                  .map(([modulo]) => (
                    <span key={modulo} className="permiso-badge">
                      {modulo}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="campo">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              Usuario activo
            </label>
          </div>

          {error && <div className="error-mensaje">{error}</div>}

          <div className="botones">
            <button
              type="button"
              className="boton-secundario"
              onClick={onCancelar}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="boton-primario"
              disabled={guardando}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-contenido {
            background: white;
            padding: 24px;
            border-radius: 8px;
            max-width: 600px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
          }
          .campo {
            margin-bottom: 16px;
          }
          .campo label {
            display: block;
            margin-bottom: 4px;
            font-weight: 600;
          }
          .campo input,
          .campo select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
          }
          .campo-permisos {
            margin: 16px 0;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 4px;
          }
          .grid-permisos {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 8px;
            margin-top: 8px;
          }
          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }
          .checkbox-label input[type="checkbox"] {
            width: auto;
          }
          .permisos-readonly {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
          }
          .permiso-badge {
            background: #e7f3ff;
            color: #004085;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
          }
          .error-mensaje {
            background: #f8d7da;
            color: #721c24;
            padding: 12px;
            border-radius: 4px;
            margin: 16px 0;
          }
          .botones {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
          }
          .boton-secundario {
            background: #6c757d;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
          }
          .boton-secundario:hover {
            background: #5a6268;
          }
          .boton-secundario:disabled,
          .boton-primario:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
}
