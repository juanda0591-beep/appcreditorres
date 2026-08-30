import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface ClienteCartera {
  id: string;
  numero: string;
  vendedor: string;
  cliente: string;
  cedula: string;
  telefono: string | null;
  municipio: string | null;
  articulo: string;
  fechaInicio: string;
  montoCuota: number;
  periodosPago: string;
  abono: number;
  saldo: number;
  ultimaFechaAbono: string | null;
  estado: string;
  diasMora: number;
  ultimaGestion: string | null;
}

interface Paginacion {
  total: number;
  limite: number;
  offset: number;
  paginas: number;
}

export default function CrmCartera() {
  const [cartera, setCartera] = useState<ClienteCartera[]>([]);
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [resultadoUpload, setResultadoUpload] = useState<any>(null);

  // Filtros
  const [estado, setEstado] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(0);

  // Listas para filtros
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [municipios, setMunicipios] = useState<string[]>([]);

  const limite = 50;

  useEffect(() => {
    cargarVendedores();
    cargarMunicipios();
  }, []);

  useEffect(() => {
    cargarCartera();
  }, [estado, vendedor, municipio, busqueda, paginaActual]);

  async function cargarCartera() {
    setCargando(true);
    try {
      const params = new URLSearchParams({
        limite: String(limite),
        offset: String(paginaActual * limite),
      });

      if (estado) params.append('estado', estado);
      if (vendedor) params.append('vendedor', vendedor);
      if (municipio) params.append('municipio', municipio);
      if (busqueda) params.append('busqueda', busqueda);

      const res = await fetch(`/api/admin/crm/cartera?${params}`);
      const data = await res.json();

      setCartera(data.cartera);
      setPaginacion(data.paginacion);
    } catch (error) {
      console.error('Error al cargar cartera:', error);
    } finally {
      setCargando(false);
    }
  }

  async function cargarVendedores() {
    try {
      const res = await fetch('/api/admin/crm/cartera/vendedores');
      const data = await res.json();
      setVendedores(data.vendedores);
    } catch (error) {
      console.error('Error al cargar vendedores:', error);
    }
  }

  async function cargarMunicipios() {
    try {
      const res = await fetch('/api/admin/crm/cartera/municipios');
      const data = await res.json();
      setMunicipios(data.municipios);
    } catch (error) {
      console.error('Error al cargar municipios:', error);
    }
  }

  async function handleUploadExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setSubiendoArchivo(true);
    setResultadoUpload(null);

    try {
      const formData = new FormData();
      formData.append('file', archivo);

      const res = await fetch('/api/admin/crm/cartera/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResultadoUpload(data);
        cargarCartera(); // Recargar la cartera
      } else {
        alert(`Error: ${data.error}\n${JSON.stringify(data.detalles || data, null, 2)}`);
      }
    } catch (error) {
      console.error('Error al subir archivo:', error);
      alert('Error al subir el archivo');
    } finally {
      setSubiendoArchivo(false);
      e.target.value = ''; // Reset input
    }
  }

  function formatearPesos(valor: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  }

  function formatearFecha(fecha: string | null): string {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-CO');
  }

  function obtenerColorEstado(estado: string): string {
    const colores: Record<string, string> = {
      cancelado: 'bg-green-100 text-green-800',
      al_dia: 'bg-blue-100 text-blue-800',
      mora_temprana: 'bg-yellow-100 text-yellow-800',
      mora_media: 'bg-orange-100 text-orange-800',
      mora_alta: 'bg-red-100 text-red-800',
      mora_critica: 'bg-red-200 text-red-900',
      activo: 'bg-gray-100 text-gray-800',
    };
    return colores[estado] || 'bg-gray-100 text-gray-800';
  }

  function obtenerTextoEstado(estado: string): string {
    const textos: Record<string, string> = {
      cancelado: 'Cancelado',
      al_dia: 'Al día',
      mora_temprana: 'Mora temprana',
      mora_media: 'Mora media',
      mora_alta: 'Mora alta',
      mora_critica: 'Mora crítica',
      activo: 'Activo',
    };
    return textos[estado] || estado;
  }

  function obtenerColorGestion(fechaGestion: string | null): { border: string; bg: string; texto: string; etiqueta: string } {
    if (!fechaGestion) {
      return {
        border: 'border-l-4 border-gray-400',
        bg: 'bg-gray-50',
        texto: 'text-gray-700',
        etiqueta: 'Sin gestión',
      };
    }

    const ahora = new Date();
    const fecha = new Date(fechaGestion);

    // Normalizar a medianoche para comparación de días calendario
    ahora.setHours(0, 0, 0, 0);
    fecha.setHours(0, 0, 0, 0);

    const diffMs = ahora.getTime() - fecha.getTime();
    const diasDiferencia = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diasDiferencia === 0) {
      return {
        border: 'border-l-4 border-green-500',
        bg: 'bg-green-50',
        texto: 'text-green-800',
        etiqueta: 'Hoy',
      };
    } else if (diasDiferencia === 1) {
      return {
        border: 'border-l-4 border-blue-500',
        bg: 'bg-blue-50',
        texto: 'text-blue-800',
        etiqueta: 'Ayer',
      };
    } else if (diasDiferencia <= 3) {
      return {
        border: 'border-l-4 border-yellow-500',
        bg: 'bg-yellow-50',
        texto: 'text-yellow-800',
        etiqueta: `Hace ${diasDiferencia} días`,
      };
    } else if (diasDiferencia <= 7) {
      return {
        border: 'border-l-4 border-orange-500',
        bg: 'bg-orange-50',
        texto: 'text-orange-800',
        etiqueta: `Hace ${diasDiferencia} días`,
      };
    } else {
      return {
        border: 'border-l-4 border-red-500',
        bg: 'bg-red-50',
        texto: 'text-red-800',
        etiqueta: `Hace ${diasDiferencia} días`,
      };
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">CRM Cobranza - Cartera</h1>
        <Link
          to="/crm/gestiones"
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Gestión de Cobros
        </Link>
      </div>

      {/* Upload Excel */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Subir archivo Excel de cartera</h2>
        <div className="flex items-center gap-4">
          <label className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            {subiendoArchivo ? 'Procesando...' : 'Seleccionar archivo Excel'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadExcel}
              disabled={subiendoArchivo}
              className="hidden"
            />
          </label>
          <span className="text-sm text-gray-600">
            El sistema detectará automáticamente cambios y actualizará la cartera
          </span>
        </div>

        {resultadoUpload && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
            <h3 className="font-semibold text-green-800 mb-2">
              ✓ Archivo procesado exitosamente
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Nuevos:</span>{' '}
                {resultadoUpload.procesamiento.nuevos}
              </div>
              <div>
                <span className="font-medium">Actualizados:</span>{' '}
                {resultadoUpload.procesamiento.actualizados}
              </div>
              <div>
                <span className="font-medium">Sin cambios:</span>{' '}
                {resultadoUpload.procesamiento.sinCambios}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Filtros</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Búsqueda</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPaginaActual(0);
              }}
              placeholder="Nombre, cédula, número..."
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estado</label>
            <select
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPaginaActual(0);
              }}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Todos</option>
              <option value="al_dia">Al día</option>
              <option value="mora_temprana">Mora temprana</option>
              <option value="mora_media">Mora media</option>
              <option value="mora_alta">Mora alta</option>
              <option value="mora_critica">Mora crítica</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Vendedor</label>
            <select
              value={vendedor}
              onChange={(e) => {
                setVendedor(e.target.value);
                setPaginaActual(0);
              }}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Todos</option>
              {vendedores.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Municipio</label>
            <select
              value={municipio}
              onChange={(e) => {
                setMunicipio(e.target.value);
                setPaginaActual(0);
              }}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Todos</option>
              {municipios.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de cartera */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center">Cargando...</div>
        ) : cartera.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No se encontraron registros de cartera
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Número
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Vendedor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Artículo
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Saldo
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Abono
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Días Mora
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Última Gestión
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cartera.map((cliente) => {
                    const colorGestion = obtenerColorGestion(cliente.ultimaGestion);
                    return (
                      <tr key={cliente.id} className={`hover:bg-gray-50 ${colorGestion.border} ${colorGestion.bg}`}>
                        <td className="px-4 py-3 text-sm">{cliente.numero}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{cliente.cliente}</div>
                          <div className="text-xs text-gray-500">{cliente.cedula}</div>
                          {cliente.telefono && (
                            <div className="text-xs text-gray-500">{cliente.telefono}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{cliente.vendedor}</td>
                        <td className="px-4 py-3 text-sm">{cliente.articulo}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          {formatearPesos(cliente.saldo)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {formatearPesos(cliente.abono)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                              cliente.diasMora === 0
                                ? 'bg-green-100 text-green-800'
                                : cliente.diasMora <= 30
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {cliente.diasMora} días
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${colorGestion.texto}`}>
                            {colorGestion.etiqueta}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold rounded ${obtenerColorEstado(
                              cliente.estado
                            )}`}
                          >
                            {obtenerTextoEstado(cliente.estado)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            to={`/crm/cartera/${cliente.id}`}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {paginacion && paginacion.paginas > 1 && (
              <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Mostrando {paginacion.offset + 1} a{' '}
                  {Math.min(paginacion.offset + paginacion.limite, paginacion.total)} de{' '}
                  {paginacion.total} registros
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaginaActual(paginaActual - 1)}
                    disabled={paginaActual === 0}
                    className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-1">
                    Página {paginaActual + 1} de {paginacion.paginas}
                  </span>
                  <button
                    onClick={() => setPaginaActual(paginaActual + 1)}
                    disabled={paginaActual >= paginacion.paginas - 1}
                    className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
