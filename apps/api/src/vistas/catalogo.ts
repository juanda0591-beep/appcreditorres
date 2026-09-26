import { formatearPesos, enlaceConsultaProducto, type Configuracion, type ImagenProducto } from '@credito/shared';

/**
 * Pagina del catalogo publico, armada en el servidor.
 *
 * El HTML se construye a mano y no con una libreria de plantillas para no
 * agregar otra dependencia por una sola pagina.
 */

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precioContado: number;
  precioCredicontado: number;
  precioCredito: number;
  inicial: number;
  pagoSemanal: number;
  categoria: string | null;
  imagenes: string | null;
  imagenUrl: string | null;
  miniaturaUrl: string | null;
  disponible: boolean;
  esNuevo: boolean;
  enPromocion: boolean;
}

const CATEGORIAS_CATALOGO = ['ARMARIOS', 'COLCHONES', 'HOGAR', 'ELECTRODOMESTICOS', 'CAMAS'] as const;

/**
 * Escapa texto para insertarlo en HTML.
 *
 * Es obligatorio: los nombres y descripciones los escribe una persona, y si
 * alguien pone "<script>" en el nombre de un producto, sin escapar ese codigo
 * se ejecutaria en el navegador de todos los clientes que abran el catalogo.
 */
function esc(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapa para usar dentro de un atributo entre comillas dobles. */
function escAttr(texto: string | null | undefined): string {
  return esc(texto);
}

/**
 * Escapa texto para meterlo en un string JS (comillas simples) que vive
 * dentro de una etiqueta <script> real.
 *
 * No basta con escapar la comilla: si el nombre trae "</script>", el
 * parser de HTML cierra la etiqueta ahi mismo (antes de que el motor de JS
 * vea nada), y el resto queda como markup ejecutable en la pagina. Por eso
 * ademas se escapan "<" y ">" como </>.
 */
function escJS(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E');
}

function tarjetaProducto(
  producto: ProductoCatalogo,
  ajustes: Configuracion,
  urlPublica: string,
): string {
  const enlace = enlaceConsultaProducto({
    numeroNegocio: ajustes.whatsappNumero,
    plantilla: ajustes.plantillaConsulta,
    producto: producto.nombre,
    precio: producto.precio,
    mostrarPrecio: ajustes.mostrarPrecios,
  });

  // Parsear imágenes
  let imagenes: ImagenProducto[] = [];
  if (producto.imagenes) {
    try {
      imagenes = JSON.parse(producto.imagenes);
    } catch {
      imagenes = [];
    }
  }
  if (imagenes.length === 0 && producto.imagenUrl && producto.miniaturaUrl) {
    imagenes = [{ imagenUrl: producto.imagenUrl, miniaturaUrl: producto.miniaturaUrl }];
  }

  const imagenPrincipal = imagenes[0]?.imagenUrl ?? imagenes[0]?.miniaturaUrl;

  // Calcular pagos
  const pagoSemanal = producto.pagoSemanal || 0;
  const pagoQuincenal = pagoSemanal * 2;
  const pagoMensual = pagoSemanal * 4;

  // ID seguro para JavaScript
  const idSeguro = producto.id.replace(/[^a-zA-Z0-9]/g, '_');

  // Construir galería de imágenes si hay múltiples
  const galeria = imagenes.length > 1
    ? `<div class="galeria" aria-label="Fotos de ${escAttr(producto.nombre)}">${imagenes.map((img, idx) =>
        `<button type="button" class="miniatura-boton" aria-label="Ver foto ${idx + 1} de ${escAttr(producto.nombre)}" onclick="cambiarImagen_${idSeguro}(${idx})"><img src="${escAttr(img.miniaturaUrl)}" alt="" loading="lazy" class="miniatura"></button>`
      ).join('')}</div>`
    : '';

  // Preparar datos para compartir (escapados para JavaScript)
  const nombreJS = escJS(producto.nombre);
  const precioPrincipal = producto.precioContado > 0 ? producto.precioContado : producto.precioCredicontado > 0 ? producto.precioCredicontado : producto.precioCredito;
  const etiquetaPrincipal = producto.precioContado > 0 ? 'Precio de contado' : producto.precioCredicontado > 0 ? 'Precio credicontado' : 'Precio a credito';

  const categoria = (producto.categoria ?? '').trim().toLocaleUpperCase('es');

  return `
    <article class="producto${producto.disponible ? '' : ' agotado'}${producto.esNuevo ? '' : ' oculto'}" data-busqueda="${escAttr(`${producto.nombre} ${producto.descripcion || ''} ${producto.categoria || ''} ${categoria}`.toLocaleLowerCase('es'))}" data-categoria="${escAttr(categoria)}" data-nuevo="${producto.esNuevo}" ${ajustes.mostrarPrecios ? `data-precio-min="${precioPrincipal}"` : ''}>
      <div class="producto-media">
      ${producto.esNuevo || producto.enPromocion ? `
      <div class="badges">
        ${producto.esNuevo ? '<span class="badge badge-nuevo">Nuevo</span>' : ''}
        ${producto.enPromocion ? '<span class="badge badge-promo">Promocion</span>' : ''}
      </div>
      ` : ''}
      ${producto.disponible ? '' : '<span class="etiqueta-agotado">Agotado</span>'}
      ${
        imagenPrincipal
          ? `<img id="img-${idSeguro}" src="${escAttr(imagenPrincipal)}" alt="${escAttr(producto.nombre)}" loading="lazy" class="imagen-principal" role="button" tabindex="0" aria-label="Ampliar imagen de ${escAttr(producto.nombre)}" onclick="abrirVistaImagen_${idSeguro}()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirVistaImagen_${idSeguro}()}">`
          : '<div class="sin-foto">Imagen no disponible</div>'
      }
      </div>
      ${galeria}
      <div class="datos">
        ${categoria ? `<p class="categoria-producto">${esc(categoria)}</p>` : ''}
        <h2>${esc(producto.nombre)}</h2>
        ${producto.descripcion ? `<p class="desc">${esc(producto.descripcion)}</p>` : ''}
        ${ajustes.mostrarPrecios && precioPrincipal > 0 ? `
          <div class="precios">
            <p class="precio-principal"><span class="etiq">${etiquetaPrincipal}</span><strong>${esc(formatearPesos(precioPrincipal))}</strong></p>
            ${producto.precioContado > 0 && producto.precioCredicontado > 0 ? `<p class="precio-item"><span>Credicontado</span><strong>${esc(formatearPesos(producto.precioCredicontado))}</strong></p>` : ''}
            ${producto.precioCredito > 0 && producto.precioCredito !== precioPrincipal ? `<p class="precio-item"><span>Credito</span><strong>${esc(formatearPesos(producto.precioCredito))}</strong></p>` : ''}
            ${producto.inicial > 0 ? `<p class="precio-item"><span>Inicial</span><strong>${esc(formatearPesos(producto.inicial))}</strong></p>` : ''}
            ${pagoSemanal > 0 ? `
              <div class="pagos">
                <span>Pago semanal</span><strong>${esc(formatearPesos(pagoSemanal))}</strong>
              </div>
            ` : ''}
          </div>
        ` : ''}
        <div class="acciones-producto">
          ${producto.disponible ? `<button type="button" class="boton-quiero" onclick="mostrarFormulario_${idSeguro}()">Solicitar producto <span aria-hidden="true">&rarr;</span></button>` : ''}
          ${enlace && producto.disponible ? `<a class="boton" href="${escAttr(enlace)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>` : ''}
        </div>
      </div>
    </article>

    <!-- Modal con formulario -->
    <div id="modal-${idSeguro}" class="modal">
      <div class="modal-contenido">
        <div class="modal-header">
          <h3>Solicitar: ${esc(producto.nombre)}</h3>
          <button type="button" class="cerrar" aria-label="Cerrar formulario" onclick="cerrarModal_${idSeguro}()">&times;</button>
        </div>
        <form id="form-${idSeguro}">
          <div class="form-group">
            <label class="form-label">Nombre completo *</label>
            <input type="text" class="form-input" id="nombre-${idSeguro}" required placeholder="Ej: Juan Pérez">
          </div>

          <div class="form-group">
            <label class="form-label">¿Ya es cliente? *</label>
            <select class="form-select" id="cliente-${idSeguro}" required>
              <option value="">Seleccione...</option>
              <option value="si">Sí, ya soy cliente</option>
              <option value="no">No, soy cliente nuevo</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Dirección *</label>
            <input type="text" class="form-input" id="direccion-${idSeguro}" required placeholder="Ej: Calle 10 #20-30">
          </div>

          <div class="form-group">
            <label class="form-label">Municipio *</label>
            <input type="text" class="form-input" id="municipio-${idSeguro}" required placeholder="Ej: Bogotá">
          </div>

          ${pagoSemanal > 0 ? `
          <div class="form-group">
            <label class="form-label">Forma de pago *</label>
            <select class="form-select" id="formaPago-${idSeguro}" required>
              <option value="">Seleccione...</option>
              <option value="Semanal - ${formatearPesos(pagoSemanal)}">Semanal - ${formatearPesos(pagoSemanal)}</option>
              <option value="Quincenal - ${formatearPesos(pagoQuincenal)}">Quincenal - ${formatearPesos(pagoQuincenal)}</option>
              <option value="Mensual - ${formatearPesos(pagoMensual)}">Mensual - ${formatearPesos(pagoMensual)}</option>
            </select>
          </div>
          ` : ''}

          ${producto.inicial > 0 ? `
          <div class="form-group">
            <label class="form-label">¿Tiene la inicial de ${formatearPesos(producto.inicial)}? *</label>
            <select class="form-select" id="inicial-${idSeguro}" required>
              <option value="">Seleccione...</option>
              <option value="si">Sí, tengo la inicial</option>
              <option value="no">No, aún no tengo la inicial</option>
            </select>
          </div>
          ` : ''}

          <button type="submit" class="boton-enviar">Enviar pedido por WhatsApp</button>
          <button type="button" class="boton-cancelar" onclick="cerrarModal_${idSeguro}()">Cancelar</button>
        </form>
      </div>
    </div>

    <script>
      (function() {
        // Función para cambiar imagen
        window.cambiarImagen_${idSeguro} = function(idx) {
          const imagenes = ${JSON.stringify(imagenes.map(i => i.imagenUrl))};
          const img = document.getElementById('img-${idSeguro}');
          if (img) {
            img.src = imagenes[idx];
            window.__indiceImagen_${idSeguro} = idx;
          }
        };

        // Abrir la foto actual en el visor de pantalla completa.
        window.abrirVistaImagen_${idSeguro} = function() {
          const imagen = document.getElementById('img-${idSeguro}');
          const visor = document.getElementById('visor-imagen');
          const imagenAmpliada = document.getElementById('imagen-ampliada');
          if (!imagen || !visor || !imagenAmpliada) return;
          window.__visorImagenes = ${JSON.stringify(imagenes.map(i => i.imagenUrl))};
          window.__visorImagenActual = window.__indiceImagen_${idSeguro} || 0;
          imagenAmpliada.src = imagen.src;
          imagenAmpliada.alt = imagen.alt;
          visor.classList.add('activo');
          document.body.classList.add('visor-abierto');
          actualizarNavegacionImagen();
        };

        // Función para mostrar el modal
        window.mostrarFormulario_${idSeguro} = function() {
          const modal = document.getElementById('modal-${idSeguro}');
          if (modal) modal.classList.add('activo');
        };

        // Función para cerrar el modal
        window.cerrarModal_${idSeguro} = function() {
          const modal = document.getElementById('modal-${idSeguro}');
          if (modal) modal.classList.remove('activo');
        };

        // Cerrar modal al hacer clic fuera
        document.getElementById('modal-${idSeguro}').addEventListener('click', function(e) {
          if (e.target === this) {
            cerrarModal_${idSeguro}();
          }
        });

        // Manejar envío del formulario
        document.getElementById('form-${idSeguro}').addEventListener('submit', function(e) {
          e.preventDefault();

          const nombre = document.getElementById('nombre-${idSeguro}').value;
          const esClienteSelect = document.getElementById('cliente-${idSeguro}');
          const esCliente = esClienteSelect ? esClienteSelect.value : '';
          const direccion = document.getElementById('direccion-${idSeguro}').value;
          const municipio = document.getElementById('municipio-${idSeguro}').value;
          const formaPagoSelect = document.getElementById('formaPago-${idSeguro}');
          const formaPago = formaPagoSelect ? formaPagoSelect.value : '';
          const tieneInicialSelect = document.getElementById('inicial-${idSeguro}');
          const inicial = tieneInicialSelect ? tieneInicialSelect.value : '';

          // Construir mensaje
          let mensaje = '🛒 *SOLICITUD DE PRODUCTO*\\n\\n';
          mensaje += '📦 *Producto:* ${nombreJS}\\n\\n';

          mensaje += '👤 *DATOS DEL CLIENTE*\\n';
          mensaje += '• Nombre: ' + nombre + '\\n';
          mensaje += '• Cliente: ' + (esCliente === 'si' ? 'Sí, ya es cliente' : 'Cliente nuevo') + '\\n';
          mensaje += '• Dirección: ' + direccion + '\\n';
          mensaje += '• Municipio: ' + municipio + '\\n';

          ${pagoSemanal > 0 ? `
          if (formaPago) {
            mensaje += '\\n💳 *FORMA DE PAGO PREFERIDA*\\n';
            mensaje += '• ' + formaPago + '\\n';
          }
          ` : ''}

          ${producto.inicial > 0 ? `
          if (inicial) {
            mensaje += '\\n💰 *INICIAL*\\n';
            mensaje += '• ${formatearPesos(producto.inicial).replace(/'/g, "\\'")} - ' + (inicial === 'si' ? '✅ Disponible' : '❌ No disponible aún') + '\\n';
          }
          ` : ''}

          mensaje += '\\n💵 *PRECIOS DEL PRODUCTO*\\n';
          ${producto.precioContado > 0 ? `mensaje += '• Contado: ${formatearPesos(producto.precioContado).replace(/'/g, "\\'")}\\n';` : ''}
          ${producto.precioCredicontado > 0 ? `mensaje += '• Credicontado: ${formatearPesos(producto.precioCredicontado).replace(/'/g, "\\'")}\\n';` : ''}
          ${producto.precioCredito > 0 ? `mensaje += '• Crédito: ${formatearPesos(producto.precioCredito).replace(/'/g, "\\'")}\\n';` : ''}

          // Enviar por WhatsApp
          // El cliente elige el contacto desde su propia cuenta de WhatsApp.
          const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(mensaje);
          window.open(whatsappUrl, '_blank');
          cerrarModal_${idSeguro}();
        });
      })();
    </script>`;
}

/** Estilos en linea: una sola peticion, sin CSS aparte que retrase la carga. */
const ESTILOS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f7f8fa;color:#172033;line-height:1.5;min-height:100vh}
  header{background:linear-gradient(135deg,#102a43 0%,#176b87 100%);padding:30px 20px 34px;text-align:center;box-shadow:0 4px 16px rgba(16,42,67,.18);position:relative;z-index:100}
  .logo-container{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px}
  .logo{max-width:64px;max-height:64px;object-fit:contain}
  header h1{font-size:clamp(26px,4vw,40px);line-height:1.1;margin-bottom:8px;color:#fff;font-weight:800;letter-spacing:0}
  header p{color:#d8f3f7;font-size:15px;max-width:620px;margin:0 auto}
  .filtros-container{background:#fff;padding:0 20px 16px;box-shadow:0 2px 8px rgba(16,42,67,.08);border-bottom:1px solid #e5eaf0}
  .categorias{max-width:1280px;margin:0 auto 14px;display:flex;gap:4px;overflow-x:auto;scrollbar-width:thin;border-bottom:1px solid #e5eaf0}
  .categoria-tab{flex:none;min-height:48px;padding:10px 13px;border:0;border-bottom:3px solid transparent;background:transparent;color:#526473;font:inherit;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer;transition:color .2s ease,border-color .2s ease,background .2s ease}
  .categoria-tab:hover{color:#176b87;background:#f2f8f9}
  .categoria-tab.activo{color:#176b87;border-bottom-color:#176b87}
  .categoria-tab:focus-visible{outline:2px solid #176b87;outline-offset:-3px}
  .filtros{max-width:1400px;margin:0 auto;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .busqueda{flex:1;min-width:250px;padding:12px 15px;border:1px solid #cbd5df;border-radius:9px;font-size:14px;transition:all .2s ease;background:#fff}
  .busqueda:focus{outline:none;border-color:#1d8a9d;box-shadow:0 0 0 4px rgba(29,138,157,.12)}
  .filtro-precio{padding:11px 12px;border:1px solid #cbd5df;border-radius:9px;font-size:14px;min-width:160px;transition:all .2s ease;background:#fff;color:#334155}
  .filtro-precio:focus{outline:none;border-color:#1d8a9d}
  .boton-limpiar{padding:11px 17px;background:#f0f7f8;border:1px solid #b8d9dd;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s ease;color:#146273}
  .boton-limpiar:hover{background:#dff1f3;border-color:#7fc1c8}
  .resultados-info{max-width:1280px;margin:0 auto;padding:18px 20px 0;color:#39707c;font-size:13px;font-weight:700}
  .sin-resultados{max-width:1280px;margin:0 auto;padding:56px 20px 72px;text-align:center}
  .sin-resultados[hidden]{display:none}
  .sin-resultados h2{font-size:19px;color:#172033;margin-bottom:7px}
  .sin-resultados p{font-size:14px;color:#66778a}
  .info-footer{background:#102a43;padding:38px 20px 0;margin-top:42px;color:#fff}
  .footer-content{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:28px}
  .footer-section h3{font-size:16px;font-weight:700;color:#fff;margin-bottom:10px}
  .footer-section p,.footer-section a{font-size:14px;color:#cfe1e8;line-height:1.8;text-decoration:none}
  .footer-section a:hover{color:#fff}
  .contacto-item{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#cfe1e8}
  .icono{font-size:18px}
  .whatsapp-footer{display:inline-flex;align-items:center;gap:8px;background:#25a56a;color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;margin-top:10px;transition:all .2s ease}
  .whatsapp-footer:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(37,211,102,.4);color:#fff}
  .footer-bottom{text-align:center;padding:16px;color:#c7d2fe;font-size:13px;border-top:1px solid rgba(255,255,255,.1)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:22px;padding:28px 20px;max-width:1280px;margin:0 auto}
  .grid[hidden]{display:none}
  @media(max-width:768px){.grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;padding:20px 16px}}
  @media(min-width:1200px){.grid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}}
  @keyframes entradaTarjeta{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  .producto{background:#fff;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(16,42,67,.08);transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;border:1px solid #e5eaf0;position:relative;animation:entradaTarjeta .5s ease both}
  .producto:nth-child(2){animation-delay:.04s}.producto:nth-child(3){animation-delay:.08s}.producto:nth-child(4){animation-delay:.12s}.producto:nth-child(5){animation-delay:.16s}.producto:nth-child(6){animation-delay:.2s}
  .producto:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(16,42,67,.14)}
  .producto.oculto{display:none}
  .badges{position:absolute;top:12px;right:12px;z-index:10;display:flex;flex-direction:column;gap:6px}
  .badge{padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.15)}
  .badge-nuevo{background:#176b87;color:#fff}
  .badge-promo{background:#d97706;color:#fff}
  .producto.agotado{opacity:.78}
  .producto-media{position:relative;background:#f2f7f8}
  .etiqueta-agotado{position:absolute;left:12px;bottom:12px;z-index:2;background:#334155;color:#fff;padding:5px 9px;border-radius:5px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
  .producto .imagen-principal{width:100%;height:280px;object-fit:contain;background:#f2f7f8;display:block;cursor:pointer;transition:transform .3s ease;padding:12px}
  .producto:hover .imagen-principal{transform:scale(1.02)}
  .sin-foto{width:100%;height:280px;display:flex;align-items:center;justify-content:center;color:#78909c;font-size:14px;background:#e8f0f2}
  @media(max-width:768px){.producto .imagen-principal{height:280px;object-fit:contain;padding:12px}}
  .galeria{display:flex;gap:6px;padding:9px 12px;overflow-x:auto;background:#fff;border-bottom:1px solid #edf1f3}
  .miniatura-boton{border:0;padding:0;background:transparent;cursor:pointer;border-radius:6px}
  .miniatura{width:52px;height:52px;object-fit:cover;border-radius:6px;border:2px solid transparent;transition:all .2s ease;display:block}
  .miniatura-boton:hover .miniatura{border-color:#1d8a9d;transform:scale(1.04)}
  .datos{padding:18px;display:flex;flex-direction:column;gap:9px;flex:1}
  .categoria-producto{font-size:11px;color:#176b87;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
  .datos h2{font-size:18px;line-height:1.25;font-weight:800;color:#172033}
  .desc{font-size:13px;color:#66778a;line-height:1.5}
  .precios{background:#f2faf8;padding:13px;border-radius:8px;font-size:13px;border:1px solid #cce8df}
  .precio-principal{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
  .precio-principal .etiq{color:#4f6872;font-size:11px;font-weight:700}
  .precio-principal strong{color:#176b59;font-size:22px;line-height:1.1}
  .precio-item{display:flex;justify-content:space-between;margin-bottom:6px;align-items:center;color:#59707a}
  .precio-item strong{color:#176b59;font-size:13px}
  .pagos{margin-top:8px;padding-top:9px;border-top:1px solid #cce8df;display:flex;justify-content:space-between;align-items:center;color:#59707a;font-size:12px}
  .pagos strong{color:#176b59;font-size:14px}
  .aviso{font-size:12px;color:#dc2626;font-weight:700;text-align:center;padding:6px;background:#fef2f2;border-radius:6px}
  .acciones-producto{margin-top:auto;padding-top:4px}
  .boton{display:block;text-align:center;background:#25a56a;color:#fff;text-decoration:none;padding:10px;border-radius:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;margin-top:7px;transition:all .2s ease}
  .boton:hover{background:#1c8153;transform:translateY(-1px);box-shadow:0 4px 8px rgba(37,165,106,.2)}
  .boton-quiero{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;text-align:center;background:#176b87;color:#fff;padding:12px;border-radius:8px;font-size:14px;font-weight:800;border:none;cursor:pointer;transition:all .2s ease}
  .boton-quiero:hover{background:#12556c;transform:translateY(-1px);box-shadow:0 5px 12px rgba(23,107,135,.24)}
  footer{text-align:center;padding:40px 20px;color:#78716c;font-size:14px;background:#fff;border-top:1px solid #e7e5e4;margin-top:32px}
  .vacio{text-align:center;padding:80px 20px;color:#78716c;font-size:16px}
  .modal{display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .25s ease,visibility .25s ease}
  .modal.activo{opacity:1;visibility:visible;pointer-events:auto}
  .modal-contenido{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,.15);transform:translateY(14px) scale(.98);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
  .modal.activo .modal-contenido{transform:translateY(0) scale(1)}
  .visor-imagen{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(8,24,38,.88);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .25s ease,visibility .25s ease}
  .visor-imagen.activo{opacity:1;visibility:visible;pointer-events:auto}
  .visor-imagen img{max-width:min(94vw,1200px);max-height:88vh;width:auto;height:auto;object-fit:contain;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.45);transform:scale(.96);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
  .visor-imagen.activo img{transform:scale(1)}
  .visor-flecha{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:30px;line-height:1;cursor:pointer;transition:background .2s ease,transform .2s ease;display:none;align-items:center;justify-content:center}
  .visor-flecha:hover{background:rgba(255,255,255,.25)}
  .visor-flecha:active{transform:translateY(-50%) scale(.94)}
  .visor-flecha.visible{display:flex}
  .visor-anterior{left:18px}.visor-siguiente{right:18px}
  .visor-cerrar{position:absolute;top:18px;right:20px;width:42px;height:42px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:28px;line-height:1;cursor:pointer;transition:background .2s ease,transform .2s ease}
  .visor-cerrar:hover{background:rgba(255,255,255,.25);transform:scale(1.06)}
  .visor-abierto{overflow:hidden}
  .modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f5f5f4}
  .modal-header h3{font-size:20px;font-weight:700;color:#0f172a}
  .cerrar{background:#f5f5f4;border:none;font-size:24px;cursor:pointer;color:#78716c;padding:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all .2s ease}
  .cerrar:hover{background:#e7e5e4;color:#1c1917}
  .form-group{margin-bottom:20px}
  .form-label{display:block;font-size:14px;font-weight:600;margin-bottom:8px;color:#0f172a}
  .form-input,.form-select{width:100%;padding:12px 14px;border:2px solid #e7e5e4;border-radius:8px;font-size:14px;font-family:inherit;transition:all .2s ease}
  .form-input:focus,.form-select:focus{outline:none;border-color:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.1)}
  .form-checkbox{width:20px;height:20px;margin-right:10px}
  .checkbox-label{display:flex;align-items:center;font-size:14px;cursor:pointer}
  .form-error{color:#dc2626;font-size:12px;margin-top:6px;font-weight:500}
  .boton-enviar{width:100%;background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:#fff;padding:14px;border-radius:10px;font-size:16px;font-weight:700;border:none;cursor:pointer;transition:all .2s ease;box-shadow:0 4px 12px rgba(22,163,74,.2)}
  .boton-enviar:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(22,163,74,.3)}
  .boton-enviar:disabled{background:#d6d3d1;cursor:not-allowed;transform:none}
  .boton-cancelar{width:100%;background:#f5f5f4;color:#57534e;padding:12px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;margin-top:12px;transition:all .2s ease}
  .boton-cancelar:hover{background:#e7e5e4}
  @media(max-width:768px){.footer-content{grid-template-columns:1fr;text-align:center}.categoria-tab{font-size:12px;padding-inline:12px}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
`;

export function paginaCatalogo(opciones: {
  ajustes: Configuracion;
  productos: ProductoCatalogo[];
  urlPublica: string;
}): string {
  const { ajustes, productos, urlPublica } = opciones;

  const titulo = ajustes.tituloCatalogo;
  const descripcion = ajustes.descripcionCatalogo ?? `Catalogo de ${ajustes.nombreNegocio}`;

  // Imagen de la vista previa: la del primer producto con foto.
  let primeraFoto: string | null = null;
  for (const p of productos) {
    if (p.imagenes) {
      try {
        const imgs: ImagenProducto[] = JSON.parse(p.imagenes);
        if (imgs.length > 0 && imgs[0] && imgs[0].imagenUrl) {
          primeraFoto = imgs[0].imagenUrl;
          break;
        }
      } catch {
        // Ignorar error de parseo
      }
    }
    if (!primeraFoto && p.imagenUrl) {
      primeraFoto = p.imagenUrl;
      break;
    }
  }
  const imagenPrevia = primeraFoto ? `${urlPublica}${primeraFoto}` : null;

  const cuerpo =
    productos.length > 0
      ? `<div class="resultados-info" id="resultados-info" aria-live="polite"></div>
         <div class="grid" id="grid-productos">${productos.map((p) => tarjetaProducto(p, ajustes, urlPublica)).join('')}</div>
         <div class="sin-resultados" id="sin-resultados" hidden><h2 id="sin-resultados-titulo"></h2><p id="sin-resultados-texto"></p></div>`
      : '<p class="vacio">Todavia no hay productos publicados.</p>';

  const visorImagen = `
  <div class="visor-imagen" id="visor-imagen" role="dialog" aria-modal="true" aria-label="Vista ampliada de imagen" onclick="if(event.target===this)cerrarVistaImagen()">
    <button type="button" class="visor-cerrar" aria-label="Cerrar imagen ampliada" onclick="cerrarVistaImagen()">&times;</button>
    <button type="button" class="visor-flecha visor-anterior" id="visor-anterior" aria-label="Imagen anterior" onclick="cambiarVistaImagen(-1)">&lsaquo;</button>
    <img id="imagen-ampliada" src="" alt="">
    <button type="button" class="visor-flecha visor-siguiente" id="visor-siguiente" aria-label="Imagen siguiente" onclick="cambiarVistaImagen(1)">&rsaquo;</button>
  </div>`;

  const barraFiltros = productos.length > 0 ? `
  <div class="filtros-container">
    <nav class="categorias" aria-label="Categorias del catalogo">
      <button type="button" class="categoria-tab activo" data-seccion="NUEVOS" aria-current="page">Nuevos</button>
      ${CATEGORIAS_CATALOGO.map((categoria) => `<button type="button" class="categoria-tab" data-seccion="${categoria}">${categoria}</button>`).join('')}
      <button type="button" class="categoria-tab" data-seccion="TODOS">Todos</button>
    </nav>
    <div class="filtros">
      <input type="text" class="busqueda" id="busqueda" placeholder="Buscar productos..." aria-label="Buscar productos">
      <select class="filtro-precio" id="filtro-precio">
        <option value="">Todos los precios</option>
        <option value="0-100000">Hasta $100,000</option>
        <option value="100000-300000">$100,000 - $300,000</option>
        <option value="300000-500000">$300,000 - $500,000</option>
        <option value="500000-1000000">$500,000 - $1,000,000</option>
        <option value="1000000-999999999">Más de $1,000,000</option>
      </select>
      <button class="boton-limpiar" onclick="limpiarFiltros()">Limpiar filtros</button>
    </div>
  </div>
  ` : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${escAttr(descripcion)}">

<!-- Etiquetas Open Graph: son las que lee WhatsApp para armar la vista previa
     del chat (titulo, descripcion y miniatura). Sin estas, el enlace aparece
     pelado y la gente desconfia de abrirlo. -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escAttr(ajustes.nombreNegocio)}">
<meta property="og:title" content="${escAttr(titulo)}">
<meta property="og:description" content="${escAttr(descripcion)}">
<meta property="og:url" content="${escAttr(`${urlPublica}/catalogo`)}">
${imagenPrevia ? `<meta property="og:image" content="${escAttr(imagenPrevia)}">` : ''}
<meta name="twitter:card" content="summary_large_image">

<style>${ESTILOS}</style>
</head>
<body>
<header>
  ${ajustes.logoUrl ? `
  <div class="logo-container">
    <img src="${escAttr(ajustes.logoUrl)}" alt="Logo ${escAttr(ajustes.nombreNegocio)}" class="logo">
  </div>
  ` : ''}
  <h1>${esc(titulo)}</h1>
  ${ajustes.descripcionCatalogo ? `<p>${esc(ajustes.descripcionCatalogo)}</p>` : ''}
</header>
${barraFiltros}
${cuerpo}
${visorImagen}
<footer class="info-footer">
  <div class="footer-content">
    <div class="footer-section">
      <h3>${esc(ajustes.nombreNegocio)}</h3>
      <p>Tu aliado en créditos y productos de calidad. Facilitamos tus compras con las mejores opciones de pago.</p>
    </div>

    <div class="footer-section">
      <h3>Contacto</h3>
      ${ajustes.whatsappNumero ? `
      <div class="contacto-item">
        <span class="icono" aria-hidden="true">+</span>
        <span>WhatsApp disponible</span>
      </div>
      <a href="https://wa.me/${escAttr(ajustes.whatsappNumero)}" target="_blank" rel="noopener" class="whatsapp-footer">
        Chatea con nosotros
      </a>
      ` : ''}
    </div>

    <div class="footer-section">
      <h3>Formas de pago</h3>
      <p>• Contado</p>
      <p>• Credicontado</p>
      <p>• Crédito (semanal, quincenal, mensual)</p>
      <p>• Facilidades de pago disponibles</p>
    </div>

    <div class="footer-section">
      <h3>Como funciona</h3>
      <p>1. Elige tu producto</p>
      <p>2. Selecciona tu forma de pago</p>
      <p>3. Completa el formulario</p>
      <p>4. Nos pondremos en contacto</p>
    </div>
  </div>
  <div class="footer-bottom">
    ${ajustes.notaPie ? `<p>${esc(ajustes.notaPie)}</p>` : `<p>© ${new Date().getFullYear()} ${esc(ajustes.nombreNegocio)} - Todos los derechos reservados</p>`}
  </div>
</footer>

${productos.length > 0 ? `
<script>
  window.__visorImagenes = [];
  window.__visorImagenActual = 0;

  function actualizarNavegacionImagen() {
    const hayVarias = window.__visorImagenes.length > 1;
    document.getElementById('visor-anterior')?.classList.toggle('visible', hayVarias);
    document.getElementById('visor-siguiente')?.classList.toggle('visible', hayVarias);
  }

  function cambiarVistaImagen(direccion) {
    const imagenes = window.__visorImagenes;
    if (imagenes.length < 2) return;
    window.__visorImagenActual = (window.__visorImagenActual + direccion + imagenes.length) % imagenes.length;
    const imagenAmpliada = document.getElementById('imagen-ampliada');
    if (imagenAmpliada) imagenAmpliada.src = imagenes[window.__visorImagenActual];
  }

  function cerrarVistaImagen() {
    const visor = document.getElementById('visor-imagen');
    if (visor) {
      visor.classList.remove('activo');
      document.body.classList.remove('visor-abierto');
    }
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') cerrarVistaImagen();
    if (e.key === 'ArrowLeft') cambiarVistaImagen(-1);
    if (e.key === 'ArrowRight') cambiarVistaImagen(1);
  });

  // Sistema de búsqueda y filtros
  const busqueda = document.getElementById('busqueda');
  const filtroPrecio = document.getElementById('filtro-precio');
  const productos = document.querySelectorAll('.producto');
  const resultadosInfo = document.getElementById('resultados-info');
  const sinResultados = document.getElementById('sin-resultados');
  const tabs = document.querySelectorAll('.categoria-tab');
  let seccionActiva = 'NUEVOS';

  function aplicarFiltros() {
    const textoBusqueda = busqueda ? busqueda.value.trim().toLocaleLowerCase('es') : '';
    const rangoPrecios = filtroPrecio ? filtroPrecio.value : '';
    let visibles = 0;

    productos.forEach(producto => {
      const nombre = producto.getAttribute('data-busqueda') || '';
      const categoria = producto.getAttribute('data-categoria') || '';
      const esNuevo = producto.getAttribute('data-nuevo') === 'true';
      const precioMin = parseInt(producto.getAttribute('data-precio-min')) || 0;

      const coincideBusqueda = !textoBusqueda || nombre.includes(textoBusqueda);
      const coincideSeccion = textoBusqueda || seccionActiva === 'TODOS' ||
        (seccionActiva === 'NUEVOS' ? esNuevo : categoria === seccionActiva);
      let coincidePrecio = true;
      if (rangoPrecios) {
        const [min, max] = rangoPrecios.split('-').map(Number);
        coincidePrecio = precioMin >= min && precioMin <= max;
      }

      if (coincideBusqueda && coincideSeccion && coincidePrecio) {
        producto.classList.remove('oculto');
        visibles++;
      } else {
        producto.classList.add('oculto');
      }
    });

    if (resultadosInfo) {
      const contexto = textoBusqueda ? 'Resultados de busqueda' : seccionActiva === 'NUEVOS' ? 'Nuevos' : seccionActiva === 'TODOS' ? 'Todos los productos' : seccionActiva;
      resultadosInfo.textContent = contexto + ' · ' + visibles + (visibles === 1 ? ' producto' : ' productos');
    }
    tabs.forEach(tab => {
      const activa = !textoBusqueda && tab.getAttribute('data-seccion') === seccionActiva;
      tab.classList.toggle('activo', activa);
      if (activa) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    document.getElementById('grid-productos').hidden = visibles === 0;
    if (sinResultados) {
      sinResultados.hidden = visibles > 0;
      if (visibles === 0) {
        document.getElementById('sin-resultados-titulo').textContent = textoBusqueda || rangoPrecios ? 'No encontramos coincidencias' : seccionActiva === 'NUEVOS' ? 'Aun no hay productos nuevos' : 'No hay productos en esta categoria';
        document.getElementById('sin-resultados-texto').textContent = textoBusqueda || rangoPrecios ? 'Prueba otra busqueda o limpia los filtros.' : 'Explora otra categoria o consulta todos los productos.';
      }
    }
  }

  function limpiarFiltros() {
    if (busqueda) busqueda.value = '';
    if (filtroPrecio) filtroPrecio.value = '';
    aplicarFiltros();
  }

  // Eventos
  if (busqueda) {
    busqueda.addEventListener('input', aplicarFiltros);
  }
  if (filtroPrecio) {
    filtroPrecio.addEventListener('change', aplicarFiltros);
  }
  tabs.forEach(tab => tab.addEventListener('click', function() {
    seccionActiva = this.getAttribute('data-seccion') || 'NUEVOS';
    if (busqueda) busqueda.value = '';
    aplicarFiltros();
  }));
  aplicarFiltros();
</script>
` : ''}
</body>
</html>`;
}
