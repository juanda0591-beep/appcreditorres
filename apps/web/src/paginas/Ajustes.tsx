import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { aplicarPlantilla, formatearPesos } from '@credito/shared';
import {
  useConfiguracion,
  useGuardarConfiguracion,
  useEnlaceCompartir,
  useSubirLogo,
  useQuitarLogo,
} from '../api/hooks.js';
import { Aviso, Boton, BotonChico, Cargando } from '../componentes/base.js';
import { confirmarPeligro, avisar, avisarError } from '../utilidades/alertas.js';
import { NotificacionesPush } from '../componentes/NotificacionesPush.js';

/**
 * Ajustes de lo que se comparte por WhatsApp.
 *
 * La vista previa de los mensajes se calcula aqui mismo con la misma funcion
 * que usa el backend, asi que lo que se ve es exactamente lo que va a recibir
 * el cliente.
 */
export function Ajustes() {
  const configuracion = useConfiguracion();
  const guardar = useGuardarConfiguracion();
  const compartir = useEnlaceCompartir();

  const [datos, setDatos] = useState({
    nombreNegocio: '',
    whatsappNumero: '',
    whatsappVendedor: '',
    tituloCatalogo: '',
    descripcionCatalogo: '',
    plantillaMensaje: '',
    plantillaConsulta: '',
    notaPie: '',
    catalogoActivo: true,
    mostrarPrecios: true,
  });
  const [guardado, setGuardado] = useState(false);

  // Se cargan los valores actuales una vez que llegan del servidor.
  useEffect(() => {
    if (!configuracion.data) return;
    const c = configuracion.data;
    setDatos({
      nombreNegocio: c.nombreNegocio,
      whatsappNumero: c.whatsappNumero ?? '',
      whatsappVendedor: c.whatsappVendedor ?? '',
      tituloCatalogo: c.tituloCatalogo,
      descripcionCatalogo: c.descripcionCatalogo ?? '',
      plantillaMensaje: c.plantillaMensaje,
      plantillaConsulta: c.plantillaConsulta,
      notaPie: c.notaPie ?? '',
      catalogoActivo: c.catalogoActivo,
      mostrarPrecios: c.mostrarPrecios,
    });
  }, [configuracion.data]);

  function cambiar<C extends keyof typeof datos>(campo: C, valor: (typeof datos)[C]) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
    setGuardado(false);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    await guardar.mutateAsync({
      ...datos,
      whatsappNumero: datos.whatsappNumero || null,
      whatsappVendedor: datos.whatsappVendedor || null,
      descripcionCatalogo: datos.descripcionCatalogo || null,
      notaPie: datos.notaPie || null,
    });
    setGuardado(true);
  }

  if (configuracion.isLoading) return <Cargando texto="Cargando configuracion" />;

  const link = compartir.data?.link ?? 'https://tu-dominio.com/catalogo';

  return (
    <form onSubmit={enviar} className="space-y-5">
      <h1 className="text-xl font-bold">Ajustes del catalogo</h1>

      <Aviso error={guardar.error} />
      {guardado && (
        <div
          role="status"
          className="rounded-lg border border-metal-200 bg-metal-50 p-3 text-sm font-medium text-metal-800"
        >
          Ajustes guardados.
        </div>
      )}

      <div className="tarjeta space-y-3">
        <h2 className="font-semibold">Datos del negocio</h2>

        <div>
          <label className="etiqueta" htmlFor="negocio">
            Nombre del negocio
          </label>
          <input
            id="negocio"
            type="text"
            className="campo"
            value={datos.nombreNegocio}
            onChange={(e) => cambiar('nombreNegocio', e.target.value)}
            maxLength={120}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="wa">
            Numero de WhatsApp
          </label>
          <input
            id="wa"
            type="tel"
            className="campo"
            value={datos.whatsappNumero}
            onChange={(e) => cambiar('whatsappNumero', e.target.value)}
            placeholder="3001234567"
          />
          <p className="mt-1 text-xs text-slate-500">
            A este numero le escriben los clientes desde el catalogo. Puedes escribirlo con espacios
            o guiones: se normaliza al guardar.
          </p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="wa-vendedor">
            Numero del vendedor
          </label>
          <input
            id="wa-vendedor"
            type="tel"
            className="campo"
            value={datos.whatsappVendedor}
            onChange={(e) => cambiar('whatsappVendedor', e.target.value)}
            placeholder="3001234567"
          />
          <p className="mt-1 text-xs text-slate-500">
            A este numero le llegan los avisos cuando un cliente quiere comprar, para que un
            vendedor lo contacte directamente.
          </p>
        </div>

        <LogoNegocio logoUrl={configuracion.data?.logoUrl ?? null} />
      </div>

      <div className="tarjeta space-y-3">
        <h2 className="font-semibold">Como se ve el catalogo</h2>

        <div>
          <label className="etiqueta" htmlFor="titulo">
            Titulo
          </label>
          <input
            id="titulo"
            type="text"
            className="campo"
            value={datos.tituloCatalogo}
            onChange={(e) => cambiar('tituloCatalogo', e.target.value)}
            maxLength={120}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="desc">
            Descripcion corta
          </label>
          <input
            id="desc"
            type="text"
            className="campo"
            value={datos.descripcionCatalogo}
            onChange={(e) => cambiar('descripcionCatalogo', e.target.value)}
            maxLength={300}
          />
          <p className="mt-1 text-xs text-slate-500">
            Aparece en la vista previa cuando compartes el enlace en un chat.
          </p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="pie">
            Nota al pie
          </label>
          <input
            id="pie"
            type="text"
            className="campo"
            value={datos.notaPie}
            onChange={(e) => cambiar('notaPie', e.target.value)}
            placeholder="Horarios, envios, formas de pago"
            maxLength={500}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-metal-600"
            checked={datos.mostrarPrecios}
            onChange={(e) => cambiar('mostrarPrecios', e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Mostrar los precios</span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Si lo apagas, los precios no se envian al catalogo: no se pueden ver ni inspeccionando
              la pagina.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-metal-600"
            checked={datos.catalogoActivo}
            onChange={(e) => cambiar('catalogoActivo', e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Catalogo activo</span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Si lo apagas, el enlace deja de funcionar sin borrar ningun producto.
            </span>
          </span>
        </label>
      </div>

      <div className="tarjeta space-y-3">
        <h2 className="font-semibold">Mensajes de WhatsApp</h2>

        <div>
          <label className="etiqueta" htmlFor="plantilla1">
            Al compartir el catalogo
          </label>
          <textarea
            id="plantilla1"
            className="campo"
            rows={2}
            value={datos.plantillaMensaje}
            onChange={(e) => cambiar('plantillaMensaje', e.target.value)}
            maxLength={500}
          />
          <p className="mt-1 text-xs text-slate-500">
            Usa <code className="rounded bg-slate-100 px-1">{'{{titulo}}'}</code> y{' '}
            <code className="rounded bg-slate-100 px-1">{'{{link}}'}</code>
          </p>
        </div>

        <Previa
          texto={aplicarPlantilla(datos.plantillaMensaje, {
            titulo: datos.tituloCatalogo,
            link,
          })}
        />

        <div>
          <label className="etiqueta" htmlFor="plantilla2">
            Cuando el cliente pregunta por un producto
          </label>
          <textarea
            id="plantilla2"
            className="campo"
            rows={2}
            value={datos.plantillaConsulta}
            onChange={(e) => cambiar('plantillaConsulta', e.target.value)}
            maxLength={500}
          />
          <p className="mt-1 text-xs text-slate-500">
            Usa <code className="rounded bg-slate-100 px-1">{'{{producto}}'}</code> y{' '}
            <code className="rounded bg-slate-100 px-1">{'{{precio}}'}</code>
          </p>
        </div>

        <Previa
          texto={aplicarPlantilla(datos.plantillaConsulta, {
            producto: 'Camiseta azul',
            precio: datos.mostrarPrecios ? formatearPesos(45_000) : '',
          })}
        />
      </div>

      <NotificacionesPush />

      <Boton submit cargando={guardar.isPending}>
        Guardar ajustes
      </Boton>
    </form>
  );
}

/**
 * Logo del negocio: se sube aparte del formulario.
 *
 * El archivo viaja solo, con su propia peticion, y no espera al boton "Guardar
 * ajustes": mezclar un multipart con el resto de los campos obligaria a
 * reenviar la imagen cada vez que alguien corrige una coma en una plantilla.
 */
function LogoNegocio({ logoUrl }: { logoUrl: string | null }) {
  const subir = useSubirLogo();
  const quitar = useQuitarLogo();

  async function elegir(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    // El input se limpia para que elegir el mismo archivo otra vez vuelva a
    // disparar el cambio (por ejemplo despues de recortarlo y guardarlo igual).
    evento.target.value = '';
    if (archivo) await subir.mutateAsync(archivo);
  }

  return (
    <div>
      <p className="etiqueta">Logo</p>

      <div className="flex items-center gap-4">
        <div
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl
            border border-slate-200 bg-slate-50"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo del negocio" className="size-full object-contain" />
          ) : (
            <ImageIcon size={22} className="text-slate-300" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border
                border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700
                shadow-xs transition hover:bg-slate-50"
            >
              <Upload size={15} />
              {subir.isPending ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                onChange={elegir}
                disabled={subir.isPending}
              />
            </label>

            {logoUrl && (
              <BotonChico
                tono="peligro"
                deshabilitado={quitar.isPending}
                onClick={async () => {
                  const seguro = await confirmarPeligro({
                    titulo: 'Quitar el logo?',
                    detalle: 'Los comprobantes en PDF que se generen despues saldran sin el.',
                    confirmar: 'Quitar logo',
                  });
                  if (!seguro) return;

                  try {
                    await quitar.mutateAsync();
                    avisar('Logo quitado');
                  } catch (error) {
                    avisarError(error);
                  }
                }}
              >
                Quitar
              </BotonChico>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Sale en el comprobante de pago en PDF. Se guarda en PNG y conserva el fondo
            transparente.
          </p>
        </div>
      </div>

      <div className="mt-2">
        <Aviso error={subir.error} />
        <Aviso error={quitar.error} />
      </div>
    </div>
  );
}

/** Vista previa del mensaje, con aspecto de burbuja de chat. */
function Previa({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg bg-slate-100 p-3">
      <p className="mb-1.5 text-xs font-medium text-slate-500">Asi lo recibe el cliente</p>
      <div className="max-w-sm rounded-lg rounded-tl-none bg-metal-100 px-3 py-2 text-sm whitespace-pre-wrap text-slate-800">
        {texto || <span className="text-slate-400">(vacio)</span>}
      </div>
    </div>
  );
}
