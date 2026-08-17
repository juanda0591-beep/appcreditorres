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
    ? `<div class="galeria">${imagenes.map((img, idx) =>
        `<img src="${escAttr(img.miniaturaUrl)}" alt="${escAttr(producto.nombre)} ${idx + 1}" loading="lazy" class="miniatura" onclick="cambiarImagen_${idSeguro}(${idx})">`
      ).join('')}</div>`
    : '';

  // Preparar datos para compartir (escapados para JavaScript)
  const nombreJS = producto.nombre.replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const descripcionJS = producto.descripcion ? producto.descripcion.replace(/'/g, "\\'").replace(/\n/g, '\\n') : '';

  return `
    <article class="producto${producto.disponible ? '' : ' agotado'}" data-nombre="${escAttr(producto.nombre.toLowerCase())}" data-categoria="${escAttr(producto.categoria || '')}" data-precio-min="${producto.precioContado || producto.precioCredicontado || producto.precioCredito}">
      ${producto.esNuevo || producto.enPromocion ? `
      <div class="badges">
        ${producto.esNuevo ? '<span class="badge badge-nuevo">🆕 Nuevo</span>' : ''}
        ${producto.enPromocion ? '<span class="badge badge-promo">🔥 Promoción</span>' : ''}
      </div>
      ` : ''}
      ${
        imagenPrincipal
          ? `<img id="img-${idSeguro}" src="${escAttr(imagenPrincipal)}" alt="${escAttr(producto.nombre)}" loading="lazy" class="imagen-principal">`
          : '<div class="sin-foto">Sin foto</div>'
      }
      ${galeria}
      <div class="datos">
        <h2>${esc(producto.nombre)}</h2>
        ${producto.descripcion ? `<p class="desc">${esc(producto.descripcion)}</p>` : ''}
        ${ajustes.mostrarPrecios && (producto.precioContado || producto.precioCredicontado || producto.precioCredito) ? `
          <div class="precios">
            ${producto.precioContado > 0 ? `<p class="precio-item"><span class="etiq">Contado:</span> <span class="valor">${esc(formatearPesos(producto.precioContado))}</span></p>` : ''}
            ${producto.precioCredicontado > 0 ? `<p class="precio-item"><span class="etiq">Credicontado:</span> <span class="valor">${esc(formatearPesos(producto.precioCredicontado))}</span></p>` : ''}
            ${producto.precioCredito > 0 ? `<p class="precio-item"><span class="etiq">Crédito:</span> <span class="valor">${esc(formatearPesos(producto.precioCredito))}</span></p>` : ''}
            ${producto.inicial > 0 ? `<p class="precio-item"><span class="etiq">Inicial:</span> <span class="valor">${esc(formatearPesos(producto.inicial))}</span></p>` : ''}
            ${pagoSemanal > 0 ? `
              <div class="pagos">
                <p class="pago-item">${esc(formatearPesos(pagoSemanal))} semanal</p>
                <p class="pago-item">${esc(formatearPesos(pagoQuincenal))} quincenal</p>
                <p class="pago-item">${esc(formatearPesos(pagoMensual))} mensual</p>
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${producto.disponible ? '' : '<p class="aviso">Agotado</p>'}
        ${
          enlace && producto.disponible
            ? `<a class="boton" href="${escAttr(enlace)}" target="_blank" rel="noopener">Preguntar por WhatsApp</a>`
            : ''
        }
        <button class="boton-quiero" onclick="mostrarFormulario_${idSeguro}()">¡Quiero este!</button>
      </div>
    </article>

    <!-- Modal con formulario -->
    <div id="modal-${idSeguro}" class="modal">
      <div class="modal-contenido">
        <div class="modal-header">
          <h3>Solicitar: ${esc(producto.nombre)}</h3>
          <button class="cerrar" onclick="cerrarModal_${idSeguro}()">×</button>
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
          if (img) img.src = imagenes[idx];
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
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:linear-gradient(135deg,#f5f7fa 0%,#e8eef5 100%);color:#1c1917;line-height:1.5;min-height:100vh}
  header{background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:8px 20px;text-align:center;box-shadow:0 2px 8px rgba(30,58,138,.2);position:sticky;top:0;z-index:100}
  .logo-container{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:2px}
  .logo{max-width:45px;max-height:45px;object-fit:contain}
  header h1{font-size:18px;margin-bottom:2px;color:#fff;font-weight:700}
  header p{color:#e0e7ff;font-size:12px}
  .filtros-container{background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:16px;box-shadow:0 2px 4px rgba(30,58,138,.15)}
  .filtros{max-width:1400px;margin:0 auto;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .busqueda{flex:1;min-width:250px;padding:10px 14px;border:2px solid #3b82f6;border-radius:8px;font-size:14px;transition:all .2s ease;background:#fff}
  .busqueda:focus{outline:none;border-color:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.2)}
  .filtro-precio{padding:9px 12px;border:2px solid #3b82f6;border-radius:8px;font-size:14px;min-width:150px;transition:all .2s ease;background:#fff}
  .filtro-precio:focus{outline:none;border-color:#60a5fa}
  .boton-limpiar{padding:9px 18px;background:#fff;border:2px solid #3b82f6;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s ease;color:#1e40af}
  .boton-limpiar:hover{background:#eff6ff;border-color:#60a5fa}
  .resultados-info{padding:12px 20px;text-align:center;color:#1e40af;font-size:14px;font-weight:600}
  .info-footer{background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:32px 20px;margin-top:32px;color:#fff}
  .footer-content{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:28px}
  .footer-section h3{font-size:16px;font-weight:700;color:#fff;margin-bottom:10px}
  .footer-section p,.footer-section a{font-size:14px;color:#e0e7ff;line-height:1.8;text-decoration:none}
  .footer-section a:hover{color:#fff}
  .contacto-item{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#e0e7ff}
  .icono{font-size:18px}
  .whatsapp-footer{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#25D366 0%,#128C7E 100%);color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;margin-top:10px;transition:all .2s ease}
  .whatsapp-footer:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(37,211,102,.4);color:#fff}
  .footer-bottom{text-align:center;padding:16px;color:#c7d2fe;font-size:13px;border-top:1px solid rgba(255,255,255,.1)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;padding:32px 20px;max-width:1400px;margin:0 auto}
  @media(max-width:768px){.grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;padding:20px 16px}}
  @media(min-width:1200px){.grid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}}
  .producto{background:#fff;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 12px rgba(0,0,0,.08);transition:all .3s ease;border:1px solid rgba(0,0,0,.05);position:relative}
  .producto:hover{transform:translateY(-4px);box-shadow:0 12px 24px rgba(0,0,0,.12)}
  .producto.oculto{display:none}
  .badges{position:absolute;top:12px;right:12px;z-index:10;display:flex;flex-direction:column;gap:6px}
  .badge{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.15)}
  .badge-nuevo{background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff}
  .badge-promo{background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:#fff}
  .producto.agotado{opacity:.6}
  .producto .imagen-principal{width:100%;height:320px;object-fit:contain;background:#f5f5f4;display:block;cursor:pointer;transition:transform .3s ease;padding:8px}
  .producto:hover .imagen-principal{transform:scale(1.02)}
  .sin-foto{width:100%;height:320px;display:flex;align-items:center;justify-content:center;color:#a8a29e;font-size:14px;background:linear-gradient(135deg,#e7e5e4 0%,#d6d3d1 100%)}
  @media(max-width:768px){.producto .imagen-principal{height:280px;object-fit:contain;padding:12px}}
  .galeria{display:flex;gap:6px;padding:12px;overflow-x:auto;background:#fafaf9;border-bottom:1px solid #f5f5f4}
  .miniatura{width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid transparent;transition:all .2s ease}
  .miniatura:hover{border-color:#16a34a;transform:scale(1.05)}
  .datos{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}
  .datos h2{font-size:16px;font-weight:700;color:#0f172a}
  .desc{font-size:13px;color:#64748b;line-height:1.5}
  .precios{background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);padding:12px;border-radius:8px;font-size:13px;border:1px solid #bbf7d0}
  .precio-item{display:flex;justify-content:space-between;margin-bottom:6px;align-items:center}
  .precio-item .etiq{color:#15803d;font-weight:600;font-size:12px}
  .precio-item .valor{color:#15803d;font-weight:700;font-size:14px}
  .pagos{margin-top:8px;padding-top:8px;border-top:2px solid #bbf7d0;display:flex;flex-direction:column;gap:3px}
  .pago-item{color:#15803d;font-size:12px;font-weight:500;padding:3px 6px;background:#f0fdf4;border-radius:4px;text-align:center}
  .aviso{font-size:12px;color:#dc2626;font-weight:700;text-align:center;padding:6px;background:#fef2f2;border-radius:6px}
  .boton{display:block;text-align:center;background:#16a34a;color:#fff;text-decoration:none;padding:10px;border-radius:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;margin-bottom:6px;transition:all .2s ease}
  .boton:hover{background:#15803d;transform:translateY(-1px);box-shadow:0 4px 8px rgba(22,163,74,.2)}
  .boton:active{background:#15803d;transform:translateY(0)}
  .boton-quiero{display:block;width:100%;text-align:center;background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);color:#fff;padding:12px;border-radius:10px;font-size:14px;font-weight:700;border:none;cursor:pointer;transition:all .2s ease;box-shadow:0 4px 12px rgba(14,165,233,.2)}
  .boton-quiero:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(14,165,233,.3)}
  .boton-quiero:active{background:linear-gradient(135deg,#0284c7 0%,#0369a1 100%);transform:translateY(0)}
  footer{text-align:center;padding:40px 20px;color:#78716c;font-size:14px;background:#fff;border-top:1px solid #e7e5e4;margin-top:32px}
  .vacio{text-align:center;padding:80px 20px;color:#78716c;font-size:16px}
  .modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
  .modal.activo{display:flex}
  .modal-contenido{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,.15)}
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
  @media(max-width:768px){.footer-content{grid-template-columns:1fr;text-align:center}}
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
      ? `<div class="grid" id="grid-productos">${productos.map((p) => tarjetaProducto(p, ajustes, urlPublica)).join('')}</div>`
      : '<p class="vacio">Todavia no hay productos publicados.</p>';

  const barraFiltros = productos.length > 0 ? `
  <div class="filtros-container">
    <div class="filtros">
      <input type="text" class="busqueda" id="busqueda" placeholder="🔍 Buscar productos...">
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
  <div class="resultados-info" id="resultados-info"></div>
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
<footer class="info-footer">
  <div class="footer-content">
    <div class="footer-section">
      <h3>📍 ${esc(ajustes.nombreNegocio)}</h3>
      <p>Tu aliado en créditos y productos de calidad. Facilitamos tus compras con las mejores opciones de pago.</p>
    </div>

    <div class="footer-section">
      <h3>📞 Contacto</h3>
      ${ajustes.whatsappNumero ? `
      <div class="contacto-item">
        <span class="icono">📱</span>
        <span>WhatsApp disponible</span>
      </div>
      <a href="https://wa.me/${escAttr(ajustes.whatsappNumero)}" target="_blank" rel="noopener" class="whatsapp-footer">
        💬 Chatea con nosotros
      </a>
      ` : ''}
    </div>

    <div class="footer-section">
      <h3>💳 Formas de Pago</h3>
      <p>• Contado</p>
      <p>• Credicontado</p>
      <p>• Crédito (semanal, quincenal, mensual)</p>
      <p>• Facilidades de pago disponibles</p>
    </div>

    <div class="footer-section">
      <h3>🛡️ ¿Cómo funciona?</h3>
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
  // Sistema de búsqueda y filtros
  const busqueda = document.getElementById('busqueda');
  const filtroPrecio = document.getElementById('filtro-precio');
  const productos = document.querySelectorAll('.producto');
  const resultadosInfo = document.getElementById('resultados-info');
  const totalProductos = productos.length;

  function aplicarFiltros() {
    const textoBusqueda = busqueda ? busqueda.value.toLowerCase() : '';
    const rangoPrecios = filtroPrecio ? filtroPrecio.value : '';
    let visibles = 0;

    productos.forEach(producto => {
      const nombre = producto.getAttribute('data-nombre') || '';
      const precioMin = parseInt(producto.getAttribute('data-precio-min')) || 0;

      // Filtro de búsqueda
      const coincideBusqueda = !textoBusqueda || nombre.includes(textoBusqueda);

      // Filtro de precio
      let coincidePrecio = true;
      if (rangoPrecios) {
        const [min, max] = rangoPrecios.split('-').map(Number);
        coincidePrecio = precioMin >= min && precioMin <= max;
      }

      // Mostrar/ocultar producto
      if (coincideBusqueda && coincidePrecio) {
        producto.classList.remove('oculto');
        visibles++;
      } else {
        producto.classList.add('oculto');
      }
    });

    // Actualizar información de resultados
    if (resultadosInfo) {
      if (textoBusqueda || rangoPrecios) {
        resultadosInfo.textContent = visibles + ' de ' + totalProductos + ' productos';
        resultadosInfo.style.display = 'block';
      } else {
        resultadosInfo.style.display = 'none';
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
</script>
` : ''}
</body>
</html>`;
}
