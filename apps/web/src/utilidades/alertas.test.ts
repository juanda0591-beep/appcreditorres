import { describe, it, expect, afterEach } from 'vitest';
import Swal from 'sweetalert2';
import { confirmar, confirmarPeligro, confirmarConMotivo, avisar, avisarError } from './alertas.js';
import { ErrorApi } from '../api/cliente.js';

/**
 * Pruebas de los dialogos.
 *
 * Lo que mas importa aqui es el ESCAPADO: el mensaje de error se inserta como
 * html para poder listar los errores por campo, y ese texto arrastra datos que
 * escribio una persona (el concepto de un gasto, el nombre de un producto). Sin
 * escapar, eso es inyeccion de HTML dentro del dialogo.
 *
 * Lo segundo es que las acciones destructivas arranquen con el foco en Cancelar:
 * un Enter de mas no debe borrar un movimiento de caja.
 */

const tick = (ms = 10) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Cierra el dialogo y espera a que salga del DOM.
 *
 * Hace falta esperar: si la prueba siguiente arranca con el anterior todavia
 * montado, `Swal.getPopup()` devuelve el viejo y las aserciones se hacen contra
 * el dialogo equivocado.
 */
afterEach(async () => {
  Swal.close();
  for (let intento = 0; intento < 50 && Swal.getPopup(); intento += 1) {
    await tick();
  }
});

/**
 * Espera a que el dialogo este montado y con el foco ya puesto.
 *
 * SweetAlert2 mueve el foco despues de renderizar, no durante: sin esta espera
 * las pruebas de foco leen el estado de un instante antes y ven el contenedor.
 */
async function esperarDialogo(): Promise<HTMLElement> {
  for (let intento = 0; intento < 50; intento += 1) {
    const popup = Swal.getPopup();
    if (popup) {
      await tick(20);
      return popup;
    }
    await tick();
  }
  throw new Error('El dialogo no se monto');
}

/**
 * Lo que NO se puede comprobar aqui: donde arranca el foco.
 *
 * `confirmarPeligro` y `confirmarConMotivo` piden `focusCancel` para que un
 * Enter de mas no borre nada, pero jsdom no calcula layout: SweetAlert2 descarta
 * los botones por tener ancho cero, no encuentra nada enfocable y deja el foco
 * en el contenedor. Una prueba de foco aqui pasaria o fallaria por el entorno y
 * no por el codigo, asi que se comprueba la clase del boton (que si distingue
 * una accion destructiva) y el foco queda para verificacion manual.
 */

describe('escapado del texto que viene de afuera', () => {
  /** El cuerpo del dialogo, que es donde se inserta el texto de afuera. */
  const cuerpo = () => Swal.getHtmlContainer()!;

  it('no interpreta HTML en el mensaje del error', async () => {
    avisarError(new Error('<img src=x onerror="window.atacado=1">'));
    await esperarDialogo();

    // Se busca dentro del cuerpo y no en todo el dialogo: la libreria ya trae
    // su propio <img> oculto para el modo imagen, y encontrarlo no diria nada.
    expect(cuerpo().querySelector('img')).toBeNull();
    expect(cuerpo().textContent).toContain('<img src=x');
    expect((window as unknown as { atacado?: number }).atacado).toBeUndefined();
  });

  it('no interpreta HTML en el detalle por campo', async () => {
    avisarError(
      new ErrorApi('Datos invalidos', 400, 'VALIDACION', [
        { campo: '<script>1</script>', mensaje: '<b>ojo</b>' },
      ]),
    );
    await esperarDialogo();

    expect(cuerpo().querySelector('script')).toBeNull();
    // El <b> tampoco debe volverse negrita: es dato que escribio alguien, no
    // formato que el backend haya querido dar.
    expect(cuerpo().querySelector('b')?.textContent).not.toBe('ojo');
    expect(cuerpo().textContent).toContain('<b>ojo</b>');
  });

  it('muestra el detalle por campo, que es lo que dice que corregir', async () => {
    avisarError(
      new ErrorApi('Datos invalidos', 400, 'VALIDACION', [
        { campo: 'monto', mensaje: 'debe ser mayor a cero' },
      ]),
    );
    await esperarDialogo();

    expect(cuerpo().textContent).toContain('monto');
    expect(cuerpo().textContent).toContain('debe ser mayor a cero');
  });
});

describe('las acciones destructivas no se aceptan por accidente', () => {
  it('el dialogo de peligro ofrece salida: siempre trae Cancelar', async () => {
    void confirmarPeligro({ titulo: 'Borrar esto?' });
    await esperarDialogo();

    expect(Swal.getCancelButton()?.style.display).not.toBe('none');
    expect(Swal.getCancelButton()?.textContent).toBe('Cancelar');
  });

  it('cancelar devuelve false y no ejecuta nada', async () => {
    const promesa = confirmarPeligro({ titulo: 'Borrar esto?' });
    await esperarDialogo();
    Swal.clickCancel();

    expect(await promesa).toBe(false);
  });

  it('aceptar devuelve true', async () => {
    const promesa = confirmar({ titulo: 'Entregar el ahorro?' });
    await esperarDialogo();
    Swal.clickConfirm();

    expect(await promesa).toBe(true);
  });
});

describe('confirmacion con motivo', () => {
  it('exige el motivo: sin texto no deja continuar', async () => {
    const promesa = confirmarConMotivo({
      titulo: 'Anular el pago?',
      etiquetaMotivo: 'Por que se anula',
    });
    await esperarDialogo();

    // Se intenta aceptar con el campo vacio.
    Swal.clickConfirm();
    await tick(60);

    // El dialogo sigue montado con el reclamo a la vista. Se comprueba con
    // getPopup y no con isVisible: jsdom no calcula layout, asi que isVisible
    // devuelve false incluso con el dialogo puesto.
    expect(Swal.getPopup()).not.toBeNull();
    expect(Swal.getValidationMessage()?.textContent).toContain('motivo');

    Swal.clickCancel();
    expect(await promesa).toBeNull();
  });

  it('devuelve el motivo sin espacios de sobra', async () => {
    const promesa = confirmarConMotivo({
      titulo: 'Anular el pago?',
      etiquetaMotivo: 'Por que se anula',
    });
    await esperarDialogo();

    const campo = Swal.getInput()!;
    campo.value = '  se pago dos veces  ';
    campo.dispatchEvent(new Event('input'));
    Swal.clickConfirm();

    expect(await promesa).toBe('se pago dos veces');
  });

  it('cancelar devuelve null, que es distinto de un motivo vacio', async () => {
    const promesa = confirmarConMotivo({
      titulo: 'Anular el pago?',
      etiquetaMotivo: 'Por que se anula',
    });
    await esperarDialogo();
    Swal.clickCancel();

    // Quien llama distingue "no quiso" de "escribio nada" por el null.
    expect(await promesa).toBeNull();
  });
});

describe('aviso corto', () => {
  it('no muestra botones: no hay nada que decidir', async () => {
    avisar('Movimiento borrado');
    const popup = await esperarDialogo();

    expect(popup.textContent).toContain('Movimiento borrado');
    // La libreria deja el boton en el DOM pero oculto; lo que importa es que no
    // se vea, para que el aviso no pida un clic de mas.
    expect(Swal.getConfirmButton()?.style.display).toBe('none');
  });

  it('se va solo, sin que nadie lo cierre', async () => {
    avisar('Producto borrado');
    await esperarDialogo();

    expect(Swal.getTimerLeft()).toBeGreaterThan(0);
  });
});

describe('el tema se aplica siempre', () => {
  it('los dialogos usan las clases propias, no el estilo de la libreria', async () => {
    void confirmar({ titulo: 'Algo?' });
    const popup = await esperarDialogo();

    expect(popup.classList.contains('dialogo-metal')).toBe(true);
    expect(Swal.getConfirmButton()?.classList.contains('boton-metal')).toBe(true);
    // Con buttonsStyling activo, la libreria pinta su propio fondo en linea.
    expect(Swal.getConfirmButton()?.style.backgroundColor).toBe('');
  });

  it('el boton de una accion destructiva sale en rojo, no en azul', async () => {
    void confirmarPeligro({ titulo: 'Borrar?' });
    await esperarDialogo();

    expect(Swal.getConfirmButton()?.classList.contains('boton-peligro')).toBe(true);
    expect(Swal.getConfirmButton()?.classList.contains('boton-metal')).toBe(false);
  });
});
