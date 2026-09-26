import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { formatearPesos, type Producto } from '@credito/shared';
import {
  useProductos,
  useGuardarProducto,
  useGenerarDescripcionProducto,
  useImportarProductosExcel,
  useBorrarProducto,
  useSubirFoto,
  useQuitarFoto,
  useEnlaceCompartir,
} from '../api/hooks.js';
import { CampoDinero } from '../componentes/CampoDinero.js';
import { Aviso, Boton, Cargando, Modal, Vacio } from '../componentes/base.js';
import { confirmarPeligro, avisar, avisarError } from '../utilidades/alertas.js';

export function Productos() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
  const entradaExcel = useRef<HTMLInputElement>(null);
  const [resultadoImportacion, setResultadoImportacion] = useState<{
    filasLeidas: number;
    creados: number;
    omitidos: Array<{ fila: number; nombre: string; motivo: string }>;
  } | null>(null);
  const productos = useProductos();
  const compartir = useEnlaceCompartir();
  const importarExcel = useImportarProductosExcel();

  const visibles = productos.data?.filter((p) => p.visible).length ?? 0;
  const textoBusqueda = busqueda.trim().toLocaleLowerCase('es');
  const categorias = [...new Set(
    (productos.data ?? [])
      .map((producto) => producto.categoria?.trim())
      .filter((categoria): categoria is string => Boolean(categoria)),
  )].sort((a, b) => a.localeCompare(b, 'es'));
  const productosFiltrados = (productos.data ?? []).filter((producto) => {
    const textoProducto = `${producto.nombre} ${producto.descripcion ?? ''} ${producto.categoria ?? ''}`
      .toLocaleLowerCase('es');
    const coincideTexto = !textoBusqueda || textoProducto.includes(textoBusqueda);
    const coincideCategoria = !categoriaSeleccionada || producto.categoria?.trim() === categoriaSeleccionada;
    return coincideTexto && coincideCategoria;
  });

  async function importarArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setResultadoImportacion(null);
    try {
      const resultado = await importarExcel.mutateAsync(archivo);
      setResultadoImportacion(resultado);
    } catch {
      // El error de la mutacion se muestra debajo del selector.
    } finally {
      evento.target.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Catalogo</h1>

      <div className="tarjeta space-y-3">
        <div>
          <p className="text-sm text-slate-600">
            {visibles} {visibles === 1 ? 'producto visible' : 'productos visibles'} en el catalogo
            publico.
          </p>
          {compartir.data && (
            <p className="mt-1 truncate text-xs text-slate-500">{compartir.data.link}</p>
          )}
        </div>

        {compartir.data && (
          <div className="flex flex-wrap gap-2">
            {/*
              Este enlace abre WhatsApp con el mensaje ya escrito y deja elegir
              a quien enviarlo. Es la forma gratuita de compartir: no requiere
              la API de negocios de Meta.
            */}
            <a
              href={compartir.data.enlaceWhatsapp}
              target="_blank"
              rel="noopener"
              className="rounded-lg bg-metal-600 px-4 py-2 text-sm font-medium text-white hover:bg-metal-700"
            >
              Compartir por WhatsApp
            </a>
            <a
              href={compartir.data.link}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ver el catalogo
            </a>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {mostrarForm ? (
          <Boton onClick={() => setMostrarForm(false)}>Cerrar formulario</Boton>
        ) : (
          <Boton onClick={() => setMostrarForm(true)}>Agregar producto</Boton>
        )}
        <input
          ref={entradaExcel}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={importarArchivo}
        />
        <Boton
          tipo="secundario"
          onClick={() => entradaExcel.current?.click()}
          cargando={importarExcel.isPending}
        >
          {importarExcel.isPending ? 'Importando Excel...' : 'Importar Excel'}
        </Boton>
      </div>

      {mostrarForm && <FormularioProducto onListo={() => setMostrarForm(false)} />}
      <Aviso error={importarExcel.error} />
      {resultadoImportacion && (
        <div className="rounded-xl border border-metal-100 bg-metal-50 p-3.5 text-sm text-metal-900" role="status">
          <p className="font-semibold">
            Importacion completada: {resultadoImportacion.creados} productos creados de {resultadoImportacion.filasLeidas} filas.
          </p>
          <p className="mt-1 text-metal-800">Las imagenes quedan pendientes para agregarlas desde cada producto.</p>
          {resultadoImportacion.omitidos.length > 0 && (
            <details className="mt-2 text-xs text-metal-800">
              <summary className="cursor-pointer font-semibold">
                {resultadoImportacion.omitidos.length} filas omitidas
              </summary>
              <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto">
                {resultadoImportacion.omitidos.map((item) => (
                  <li key={item.fila}>
                    Fila {item.fila}: {item.nombre || 'Sin nombre'} - {item.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <section className="tarjeta space-y-3" aria-label="Buscar productos del catalogo">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Buscar producto
            <input
              type="search"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Nombre, descripcion o categoria"
              className="campo mt-1"
              aria-label="Buscar productos por nombre, descripcion o categoria"
            />
          </label>
          <label className="sm:w-56 text-sm font-medium text-slate-700">
            Categoria
            <select
              value={categoriaSeleccionada}
              onChange={(evento) => setCategoriaSeleccionada(evento.target.value)}
              className="campo mt-1"
              aria-label="Filtrar productos por categoria"
            >
              <option value="">Todas las categorias</option>
              {categorias.map((categoria) => (
                <option key={categoria} value={categoria}>{categoria}</option>
              ))}
            </select>
          </label>
          {(busqueda || categoriaSeleccionada) && (
            <button
              type="button"
              onClick={() => { setBusqueda(''); setCategoriaSeleccionada(''); }}
              className="h-10 shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Limpiar
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500" aria-live="polite">
          Mostrando {productosFiltrados.length} de {productos.data?.length ?? 0} productos
        </p>
      </section>

      {productos.isLoading && <Cargando />}
      {productos.data?.length === 0 && <Vacio>Todavia no hay productos.</Vacio>}

      {productos.data && productos.data.length > 0 && productosFiltrados.length === 0 && (
        <Vacio>No hay productos que coincidan con la busqueda o categoria seleccionada.</Vacio>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {productosFiltrados.map((producto) => (
          <TarjetaProducto key={producto.id} producto={producto} />
        ))}
      </div>
    </div>
  );
}

function TarjetaProducto({ producto }: { producto: Producto }) {
  const entrada = useRef<HTMLInputElement>(null);
  const subir = useSubirFoto();
  const quitar = useQuitarFoto();
  const guardar = useGuardarProducto();
  const generarDescripcion = useGenerarDescripcionProducto();
  const borrar = useBorrarProducto();
  const [resultado, setResultado] = useState<string | null>(null);
  const [imagenSeleccionada, setImagenSeleccionada] = useState(0);
  const [editando, setEditando] = useState(false);

  async function elegirFoto(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setResultado(null);
    const datos = await subir.mutateAsync({ id: producto.id, archivo });

    // Se muestra cuanto se redujo: da confianza de que el catalogo va a cargar
    // rapido aunque la foto original pesara varios MB.
    const antes = (datos.original / 1024 / 1024).toFixed(1);
    const despues = Math.round(datos.procesada / 1024);
    setResultado(`Foto lista: ${antes} MB reducida a ${despues} KB`);

    // Se limpia para poder subir la misma foto otra vez si hace falta.
    evento.target.value = '';
  }

  const imagenes = producto.imagenes || [];
  const imagenActual = imagenes[imagenSeleccionada] || imagenes[0];

  async function generarCopyProducto() {
    try {
      const respuesta = await generarDescripcion.mutateAsync({
        nombre: producto.nombre,
        categoria: producto.categoria,
        precioContado: producto.precios.contado,
        precioCredicontado: producto.precios.credicontado,
        precioCredito: producto.precios.credito,
      });
      await guardar.mutateAsync({ id: producto.id, descripcion: respuesta.descripcion });
      avisar('Descripcion generada y guardada');
    } catch (error) {
      avisarError(error);
    }
  }

  return (
    <div className="tarjeta">
      <div className="flex gap-3">
        <div className="w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {imagenActual ? (
            <img
              src={imagenActual.miniaturaUrl}
              alt={producto.nombre}
              className="w-full h-32 object-cover"
            />
          ) : (
            <div className="flex w-full h-32 items-center justify-center text-xs text-slate-500">
              Sin foto
            </div>
          )}
          {imagenes.length > 1 && (
            <div className="flex gap-1 mt-1 overflow-x-auto">
              {imagenes.map((img, idx) => (
                <img
                  key={idx}
                  src={img.miniaturaUrl}
                  alt={`${producto.nombre} ${idx + 1}`}
                  className={`w-8 h-8 object-cover rounded cursor-pointer border-2 ${
                    idx === imagenSeleccionada ? 'border-metal-600' : 'border-transparent'
                  }`}
                  onClick={() => setImagenSeleccionada(idx)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{producto.nombre}</h3>
          {producto.descripcion && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{producto.descripcion}</p>
          )}
          <div className="text-sm space-y-0.5 mt-1">
            {producto.precios.contado > 0 && (
              <p className="text-slate-600">
                Contado: <span className="font-medium text-metal-700">{formatearPesos(producto.precios.contado)}</span>
              </p>
            )}
            {producto.precios.credicontado > 0 && (
              <p className="text-slate-600">
                Credicontado: <span className="font-medium text-metal-700">{formatearPesos(producto.precios.credicontado)}</span>
              </p>
            )}
            {producto.precios.credito > 0 && (
              <p className="text-slate-600">
                Crédito: <span className="font-medium text-metal-700">{formatearPesos(producto.precios.credito)}</span>
              </p>
            )}
            {producto.precios.inicial > 0 && (
              <p className="text-xs text-slate-500">
                Inicial: {formatearPesos(producto.precios.inicial)}
              </p>
            )}
            {producto.precios.pagoSemanal > 0 && (
              <p className="text-xs text-slate-500">
                {formatearPesos(producto.precios.pagoSemanal)}/sem • {formatearPesos(producto.precios.pagoQuincenal)}/quin • {formatearPesos(producto.precios.pagoMensual)}/mes
              </p>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {!producto.visible && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                oculto
              </span>
            )}
            {!producto.disponible && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">agotado</span>
            )}
          </div>
        </div>
      </div>

      {resultado && (
        <p role="status" className="mt-2 text-xs font-medium text-metal-700">
          {resultado}
        </p>
      )}
      <Aviso error={subir.error} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {/*
          Sin capture permite elegir desde cualquier ubicación del dispositivo
        */}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={elegirFoto}
        />
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-lg border border-metal-200 bg-metal-50 px-2.5 py-1.5 text-xs font-semibold text-metal-700 hover:bg-metal-100"
        >
          Editar producto
        </button>

        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={subir.isPending}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {subir.isPending ? 'Subiendo...' : imagenes.length > 0 ? 'Agregar foto' : 'Tomar foto'}
        </button>

        {imagenes.length > 0 && (
          <>
            <button
              type="button"
              onClick={async () => {
                const seguro = await confirmarPeligro({
                  titulo: 'Quitar esta foto?',
                  detalle: 'Se borrara del servidor. No se puede deshacer.',
                });
                if (!seguro) return;

                try {
                  await fetch(`/api/productos/${producto.id}/imagen/${imagenSeleccionada}`, {
                    method: 'DELETE',
                    credentials: 'include',
                  });
                  setImagenSeleccionada(0);
                  window.location.reload();
                } catch (error) {
                  avisarError(error);
                }
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Quitar foto actual
            </button>

            <button
              type="button"
              onClick={() => quitar.mutate(producto.id)}
              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Quitar todas las fotos
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => guardar.mutate({ id: producto.id, visible: !producto.visible })}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          {producto.visible ? 'Ocultar' : 'Mostrar'}
        </button>

        <button
          type="button"
          onClick={() => guardar.mutate({ id: producto.id, disponible: !producto.disponible })}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          {producto.disponible ? 'Marcar agotado' : 'Marcar disponible'}
        </button>

        <button
          type="button"
          onClick={generarCopyProducto}
          disabled={generarDescripcion.isPending || guardar.isPending}
          className="rounded-lg border border-metal-200 bg-metal-50 px-2.5 py-1.5 text-xs font-semibold text-metal-700 hover:bg-metal-100 disabled:opacity-50"
        >
          {generarDescripcion.isPending ? 'Generando...' : producto.descripcion ? 'Regenerar copy IA' : 'Generar copy IA'}
        </button>

        <button
          type="button"
          onClick={async () => {
            const imagenes = producto.imagenes || [];
            const precios = producto.precios;

            let mensaje = `*${producto.nombre}*\n\n`;

            if (producto.descripcion) {
              mensaje += `${producto.descripcion}\n\n`;
            }

            mensaje += `💰 *PRECIOS*\n`;
            if (precios.contado > 0) {
              mensaje += `• Contado: ${formatearPesos(precios.contado)}\n`;
            }
            if (precios.credicontado > 0) {
              mensaje += `• Credicontado: ${formatearPesos(precios.credicontado)}\n`;
            }
            if (precios.credito > 0) {
              mensaje += `• Crédito: ${formatearPesos(precios.credito)}\n`;
            }

            if (precios.inicial > 0 || precios.pagoSemanal > 0) {
              mensaje += `\n📅 *FORMA DE PAGO*\n`;
              if (precios.inicial > 0) {
                mensaje += `• Inicial: ${formatearPesos(precios.inicial)}\n`;
              }
              if (precios.pagoSemanal > 0) {
                mensaje += `• Semanal: ${formatearPesos(precios.pagoSemanal)}\n`;
                mensaje += `• Quincenal: ${formatearPesos(precios.pagoQuincenal)}\n`;
                mensaje += `• Mensual: ${formatearPesos(precios.pagoMensual)}\n`;
              }
            }

            // Intentar usar la API nativa de compartir si está disponible
            if (navigator.share && imagenes.length > 0) {
              try {
                // Descargar las imágenes como blobs
                const archivos = await Promise.all(
                  imagenes.slice(0, 3).map(async (img, idx) => { // Máximo 3 imágenes
                    const response = await fetch(`${window.location.origin}${img.imagenUrl}`);
                    const blob = await response.blob();
                    return new File([blob], `${producto.nombre.replace(/\s+/g, '_')}_${idx + 1}.jpg`, { type: 'image/jpeg' });
                  })
                );

                await navigator.share({
                  title: producto.nombre,
                  text: mensaje,
                  files: archivos,
                });
                return;
              } catch (error) {
                console.log('Error al compartir con archivos:', error);
                // Si falla, continuar con el método de WhatsApp normal
              }
            }

            // Fallback: método tradicional con WhatsApp Web
            if (imagenes.length > 0) {
              mensaje += `\n📸 Ver imágenes del producto:\n`;
              imagenes.forEach((img) => {
                mensaje += `${window.location.origin}${img.imagenUrl}\n`;
              });
            }

            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
            window.open(whatsappUrl, '_blank');
          }}
          className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
        >
          Compartir este producto
        </button>

        <button
          type="button"
          onClick={async () => {
            const seguro = await confirmarPeligro({
              titulo: `Borrar ${producto.nombre}?`,
              detalle: 'Sale del catalogo junto con sus fotos. No se puede deshacer.',
            });
            if (!seguro) return;

            try {
              await borrar.mutateAsync(producto.id);
              avisar('Producto borrado');
            } catch (error) {
              avisarError(error);
            }
          }}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Borrar
        </button>
      </div>

      {editando && (
        <Modal
          titulo={`Editar ${producto.nombre}`}
          ancho="amplio"
          onCerrar={() => setEditando(false)}
        >
          <FormularioEditarProducto producto={producto} onListo={() => setEditando(false)} />
        </Modal>
      )}
    </div>
  );
}

function FormularioProducto({ onListo }: { onListo: () => void }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precioContado, setPrecioContado] = useState(0);
  const [precioCredicontado, setPrecioCredicontado] = useState(0);
  const [precioCredito, setPrecioCredito] = useState(0);
  const [inicial, setInicial] = useState(0);
  const [pagoSemanal, setPagoSemanal] = useState(0);
  const [categoria, setCategoria] = useState('');
  const [esNuevo, setEsNuevo] = useState(false);
  const [enPromocion, setEnPromocion] = useState(false);
  const guardar = useGuardarProducto();
  const generarDescripcion = useGenerarDescripcionProducto();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    await guardar.mutateAsync({
      nombre,
      descripcion: descripcion || null,
      precioContado,
      precioCredicontado,
      precioCredito,
      inicial,
      pagoSemanal,
      precio: precioContado || precioCredicontado || precioCredito,
      categoria: categoria || null,
      esNuevo,
      enPromocion,
    });
    onListo();
  }

  async function generarCopy() {
    if (!nombre.trim()) {
      avisar('Escribe el nombre del producto para generar su descripcion.');
      return;
    }

    try {
      const respuesta = await generarDescripcion.mutateAsync({
        nombre,
        categoria: categoria || null,
        precioContado,
        precioCredicontado,
        precioCredito,
      });
      setDescripcion(respuesta.descripcion);
    } catch (error) {
      avisarError(error);
    }
  }

  const pagoQuincenal = pagoSemanal * 2;
  const pagoMensual = pagoSemanal * 4;

  return (
    <form onSubmit={enviar} className="tarjeta space-y-3">
      <Aviso error={guardar.error} />

      <div>
        <label className="etiqueta" htmlFor="nom-prod">
          Nombre <span className="text-red-600">*</span>
        </label>
        <input
          id="nom-prod"
          type="text"
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={150}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CampoDinero etiqueta="Precio contado" valor={precioContado} onCambio={setPrecioContado} />
        <CampoDinero etiqueta="Precio credicontado" valor={precioCredicontado} onCambio={setPrecioCredicontado} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CampoDinero etiqueta="Precio crédito" valor={precioCredito} onCambio={setPrecioCredito} />
        <CampoDinero etiqueta="Inicial" valor={inicial} onCambio={setInicial} />
      </div>

      <div>
        <CampoDinero etiqueta="Pago semanal" valor={pagoSemanal} onCambio={setPagoSemanal} />
        {pagoSemanal > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Quincenal: {formatearPesos(pagoQuincenal)} • Mensual: {formatearPesos(pagoMensual)}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label className="etiqueta" htmlFor="desc-prod">
            Descripcion
          </label>
          <button
            type="button"
            onClick={generarCopy}
            disabled={generarDescripcion.isPending || !nombre.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-metal-200 bg-metal-50 px-2.5 py-1.5 text-xs font-semibold text-metal-700 transition hover:bg-metal-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generarDescripcion.isPending ? 'Generando...' : 'Generar con IA'}
          </button>
        </div>
        <textarea
          id="desc-prod"
          className="campo"
          rows={2}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="cat-prod">
          Categoria
        </label>
        <input
          id="cat-prod"
          type="text"
          className="campo"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder="Opcional"
          maxLength={60}
        />
      </div>

      <div className="space-y-2">
        <label className="etiqueta">Badges visuales</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={esNuevo}
              onChange={(e) => setEsNuevo(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">🆕 Marcar como producto nuevo</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enPromocion}
              onChange={(e) => setEnPromocion(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-slate-700">🔥 Marcar como promoción</span>
          </label>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Las fotos se agregan despues de guardar, desde la tarjeta del producto.
      </p>

      <div className="flex gap-2">
        <Boton submit cargando={guardar.isPending} deshabilitado={!nombre.trim()}>
          Guardar producto
        </Boton>
        <Boton tipo="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function FormularioEditarProducto({
  producto,
  onListo,
}: {
  producto: Producto;
  onListo: () => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [descripcion, setDescripcion] = useState(producto.descripcion ?? '');
  const [precioContado, setPrecioContado] = useState(producto.precios.contado);
  const [precioCredicontado, setPrecioCredicontado] = useState(producto.precios.credicontado);
  const [precioCredito, setPrecioCredito] = useState(producto.precios.credito);
  const [inicial, setInicial] = useState(producto.precios.inicial);
  const [pagoSemanal, setPagoSemanal] = useState(producto.precios.pagoSemanal);
  const [categoria, setCategoria] = useState(producto.categoria ?? '');
  const [visible, setVisible] = useState(producto.visible);
  const [disponible, setDisponible] = useState(producto.disponible);
  const [esNuevo, setEsNuevo] = useState(producto.esNuevo);
  const [enPromocion, setEnPromocion] = useState(producto.enPromocion);
  const [generando, setGenerando] = useState(false);
  const guardar = useGuardarProducto();
  const generarDescripcion = useGenerarDescripcionProducto();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    try {
      await guardar.mutateAsync({
        id: producto.id,
        nombre,
        descripcion: descripcion || null,
        precioContado,
        precioCredicontado,
        precioCredito,
        inicial,
        pagoSemanal,
        precio: precioContado || precioCredicontado || precioCredito,
        categoria: categoria || null,
        visible,
        disponible,
        esNuevo,
        enPromocion,
      });
      avisar('Producto actualizado');
      onListo();
    } catch (error) {
      avisarError(error);
    }
  }

  async function generarCopy() {
    if (!nombre.trim()) {
      avisar('Escribe el nombre del producto para generar su descripcion.');
      return;
    }

    setGenerando(true);
    try {
      const respuesta = await generarDescripcion.mutateAsync({
        nombre,
        categoria: categoria || null,
        precioContado,
        precioCredicontado,
        precioCredito,
      });
      setDescripcion(respuesta.descripcion);
    } catch (error) {
      avisarError(error);
    } finally {
      setGenerando(false);
    }
  }

  const pagoQuincenal = pagoSemanal * 2;
  const pagoMensual = pagoSemanal * 4;

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Aviso error={guardar.error} />

      <div>
        <label className="etiqueta" htmlFor={`editar-nombre-${producto.id}`}>
          Nombre <span className="text-red-600">*</span>
        </label>
        <input
          id={`editar-nombre-${producto.id}`}
          type="text"
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={150}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoDinero etiqueta="Precio contado" valor={precioContado} onCambio={setPrecioContado} />
        <CampoDinero etiqueta="Precio credicontado" valor={precioCredicontado} onCambio={setPrecioCredicontado} />
        <CampoDinero etiqueta="Precio credito" valor={precioCredito} onCambio={setPrecioCredito} />
        <CampoDinero etiqueta="Inicial" valor={inicial} onCambio={setInicial} />
      </div>

      <div>
        <CampoDinero etiqueta="Pago semanal" valor={pagoSemanal} onCambio={setPagoSemanal} />
        {pagoSemanal > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Quincenal: {formatearPesos(pagoQuincenal)} • Mensual: {formatearPesos(pagoMensual)}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label className="etiqueta" htmlFor={`editar-descripcion-${producto.id}`}>
            Descripcion
          </label>
          <button
            type="button"
            onClick={generarCopy}
            disabled={generando || generarDescripcion.isPending || !nombre.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-metal-200 bg-metal-50 px-2.5 py-1.5 text-xs font-semibold text-metal-700 transition hover:bg-metal-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generando ? 'Generando...' : 'Generar con IA'}
          </button>
        </div>
        <textarea
          id={`editar-descripcion-${producto.id}`}
          className="campo"
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor={`editar-categoria-${producto.id}`}>
          Categoria
        </label>
        <input
          id={`editar-categoria-${producto.id}`}
          type="text"
          className="campo"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          maxLength={60}
        />
      </div>

      <div className="space-y-2">
        <label className="etiqueta">Estado y badges</label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">Mostrar en el catalogo publico</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={disponible}
            onChange={(e) => setDisponible(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">Producto disponible</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={esNuevo}
            onChange={(e) => setEsNuevo(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">Marcar como producto nuevo</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enPromocion}
            onChange={(e) => setEnPromocion(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-slate-700">Marcar como promocion</span>
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <Boton submit cargando={guardar.isPending} deshabilitado={!nombre.trim()}>
          Guardar cambios
        </Boton>
        <Boton tipo="secundario" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
