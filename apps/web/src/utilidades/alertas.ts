import Swal from 'sweetalert2';
import { ErrorApi } from '../api/cliente.js';

/**
 * Confirmaciones y avisos, sobre SweetAlert2.
 *
 * Todo pasa por aqui y ningun componente importa Swal directo. Dos razones:
 * el tema se define una sola vez (si cada pantalla lo configurara, con el
 * tiempo cada dialogo se veria distinto), y las opciones peligrosas quedan
 * detras de una funcion que ya viene con los valores prudentes puestos.
 *
 * Los botones se estilan con clases propias (`buttonsStyling: false`) para que
 * usen el mismo gradiente metalizado que el boton primario de la app.
 */
const base = Swal.mixin({
  buttonsStyling: false,
  customClass: {
    popup: 'dialogo-metal',
    confirmButton: 'boton-metal',
    denyButton: 'boton-peligro',
    cancelButton: 'boton-neutro',
  },
  /**
   * Cancelar va a la izquierda y confirmar a la derecha, como en los modales
   * propios y en los formularios. SweetAlert2 los pone al revés por defecto.
   */
  reverseButtons: true,
  showClass: { popup: 'swal2-noanimation' },
  hideClass: { popup: '' },
});

interface OpcionesConfirmar {
  titulo: string;
  /** Que va a pasar exactamente. Se muestra bajo el titulo. */
  detalle?: string;
  /** Texto del boton que ejecuta la accion. */
  confirmar?: string;
  cancelar?: string;
  /**
   * Desglose de lo que se va a guardar, en filas de rotulo y valor.
   *
   * Existe para que la confirmacion sirva de algo. Un "estas seguro?" pelado
   * solo agrega un clic: nadie lo lee y se acepta por reflejo. Mostrando las
   * cifras ya calculadas, el dialogo es el ultimo lugar donde se puede cachar
   * un monto mal escrito antes de que quede registrado.
   */
  resumen?: Array<{ rotulo: string; valor: string; destacado?: boolean }>;
}

/** Arma el desglose como tabla, ya escapado. */
function tablaResumen(filas: NonNullable<OpcionesConfirmar['resumen']>): string {
  const cuerpo = filas
    .map(
      (fila) =>
        `<tr class="${fila.destacado ? 'destacada' : ''}">` +
        `<th>${escapar(fila.rotulo)}</th>` +
        `<td>${escapar(fila.valor)}</td>` +
        '</tr>',
    )
    .join('');

  return `<table class="resumen-confirmacion"><tbody>${cuerpo}</tbody></table>`;
}

/**
 * Pregunta antes de una accion normal. Devuelve true si la persona acepto.
 *
 * El texto del boton se pide explicito y no se deja en "OK": un boton que dice
 * lo que hace ("Entregar ahorro") se lee sin tener que volver al titulo.
 */
export async function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
  // Con resumen se usa `html` y sin resumen `text`: `text` lo escapa la propia
  // libreria, asi que mientras no haya tabla no hace falta armar HTML a mano.
  const cuerpo = opciones.resumen?.length
    ? {
        html:
          (opciones.detalle ? `<p>${escapar(opciones.detalle)}</p>` : '') +
          tablaResumen(opciones.resumen),
      }
    : { text: opciones.detalle };

  const { isConfirmed } = await base.fire({
    title: opciones.titulo,
    ...cuerpo,
    icon: 'question',
    iconColor: 'oklch(0.515 0.142 256)',
    showCancelButton: true,
    confirmButtonText: opciones.confirmar ?? 'Confirmar',
    cancelButtonText: opciones.cancelar ?? 'Cancelar',
  });

  return isConfirmed;
}

/**
 * Pregunta antes de algo que no se puede deshacer.
 *
 * Se separa de `confirmar` a proposito: el boton sale en rojo, el icono es de
 * advertencia y el foco arranca en Cancelar. Asi un Enter de mas no borra nada.
 */
export async function confirmarPeligro(opciones: OpcionesConfirmar): Promise<boolean> {
  const { isConfirmed } = await base.fire({
    title: opciones.titulo,
    text: opciones.detalle,
    icon: 'warning',
    iconColor: '#dc2626',
    showCancelButton: true,
    confirmButtonText: opciones.confirmar ?? 'Borrar',
    cancelButtonText: opciones.cancelar ?? 'Cancelar',
    customClass: {
      popup: 'dialogo-metal',
      confirmButton: 'boton-peligro',
      cancelButton: 'boton-neutro',
    },
    focusCancel: true,
  });

  return isConfirmed;
}

/**
 * Confirma algo que exige explicar por que, y devuelve el texto escrito.
 *
 * Devuelve null si se cancelo. El motivo es obligatorio y se valida aqui: sin
 * el, el registro de la anulacion queda sin razon y despues nadie sabe por que
 * se revirtio un pago.
 *
 * Se pide en el mismo dialogo en vez de encimar dos: escribir el motivo ya es
 * un acto deliberado, y agregarle un "estas seguro?" encima solo entrena a la
 * gente a aceptar sin leer.
 */
export async function confirmarConMotivo(
  opciones: OpcionesConfirmar & { etiquetaMotivo: string },
): Promise<string | null> {
  const { isConfirmed, value } = await base.fire({
    title: opciones.titulo,
    text: opciones.detalle,
    icon: 'warning',
    iconColor: '#dc2626',
    input: 'text',
    inputLabel: opciones.etiquetaMotivo,
    inputAttributes: { maxlength: '300', autocapitalize: 'sentences' },
    inputValidator: (valor) => (valor.trim() ? null : 'Escribe el motivo para continuar'),
    showCancelButton: true,
    confirmButtonText: opciones.confirmar ?? 'Confirmar',
    cancelButtonText: opciones.cancelar ?? 'Cancelar',
    customClass: {
      popup: 'dialogo-metal',
      confirmButton: 'boton-peligro',
      cancelButton: 'boton-neutro',
      input: 'campo',
    },
    focusCancel: true,
  });

  return isConfirmed && typeof value === 'string' ? value.trim() : null;
}

/**
 * Aviso corto arriba a la derecha, sin botones y sin tapar la pantalla.
 *
 * Va para lo que ya salio bien: la persona no tiene que decidir nada, solo
 * enterarse. Un dialogo con boton "OK" para eso obliga a un clic de mas cada
 * vez que se guarda algo.
 */
export function avisar(mensaje: string): void {
  void base.fire({
    title: mensaje,
    toast: true,
    position: 'top-end',
    icon: 'success',
    iconColor: 'oklch(0.515 0.142 256)',
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    customClass: { popup: 'aviso-metal' },
  });
}

/**
 * Muestra un error de la API en un dialogo.
 *
 * Se usa cuando el error ocurre despues de cerrar el formulario y no hay donde
 * pintarlo en linea. Los errores de validacion traen el detalle por campo, que
 * es lo que dice que corregir; sin eso queda un "revisa los datos" inutil.
 */
export function avisarError(error: unknown): void {
  const mensaje = error instanceof Error ? error.message : 'Ocurrio un error inesperado';
  const detalles = error instanceof ErrorApi ? error.detalles : undefined;

  const lista =
    detalles && detalles.length > 0
      ? `<ul style="margin-top:.5rem;text-align:left">${detalles
          .map((d) => `<li><b>${escapar(d.campo)}</b>: ${escapar(d.mensaje)}</li>`)
          .join('')}</ul>`
      : '';

  void base.fire({
    title: 'No se pudo completar',
    html: `${escapar(mensaje)}${lista}`,
    icon: 'error',
    iconColor: '#dc2626',
    confirmButtonText: 'Entendido',
  });
}

/**
 * Escapa el texto antes de meterlo en `html`.
 *
 * El mensaje viene del backend, pero puede arrastrar datos que escribio una
 * persona (el concepto de un gasto, el nombre de un producto). Interpolarlo sin
 * escapar seria inyeccion de HTML dentro del dialogo.
 */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
