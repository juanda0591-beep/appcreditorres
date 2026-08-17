import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { formatearPesos, type Producto } from '@credito/shared';
import {
  useProductos,
  useGuardarProducto,
  useBorrarProducto,
  useSubirFoto,
  useQuitarFoto,
  useEnlaceCompartir,
} from '../api/hooks.js';
import { CampoDinero } from '../componentes/CampoDinero.js';
import { Aviso, Boton, Cargando, Vacio } from '../componentes/base.js';
import { confirmarPeligro, avisar, avisarError } from '../utilidades/alertas.js';

export function Productos() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const productos = useProductos();
  const compartir = useEnlaceCompartir();

  const visibles = productos.data?.filter((p) => p.visible).length ?? 0;

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

      {mostrarForm ? (
        <FormularioProducto onListo={() => setMostrarForm(false)} />
      ) : (
        <Boton onClick={() => setMostrarForm(true)}>Agregar producto</Boton>
      )}

      {productos.isLoading && <Cargando />}
      {productos.data?.length === 0 && <Vacio>Todavia no hay productos.</Vacio>}

      <div className="grid gap-3 sm:grid-cols-2">
        {productos.data?.map((producto) => (
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
  const borrar = useBorrarProducto();
  const [resultado, setResultado] = useState<string | null>(null);
  const [imagenSeleccionada, setImagenSeleccionada] = useState(0);

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
          capture="environment" hace que el celular abra la camara de atras
          directamente, que es lo que uno quiere al fotografiar un producto.
        */}
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          className="hidden"
          onChange={elegirFoto}
        />
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
        <label className="etiqueta" htmlFor="desc-prod">
          Descripcion
        </label>
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
