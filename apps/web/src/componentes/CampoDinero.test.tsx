import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoDinero } from './CampoDinero.js';

/**
 * Pruebas del campo de dinero.
 *
 * Importan mas que otras: si este campo entrega un valor con decimales o mal
 * parseado, el backend rechaza el guardado o, peor, se registra un monto
 * distinto al que la persona escribio.
 */

/**
 * Monta el campo dentro de un formulario con estado, como se usa en la app.
 * El campo es controlado: sin un padre que guarde el valor, escribir no
 * mostraria nada, igual que pasaria en la aplicacion real.
 */
function montar(valorInicial = 0) {
  const alCambiar = vi.fn();

  function Formulario() {
    const [monto, setMonto] = useState(valorInicial);
    return (
      <CampoDinero
        valor={monto}
        onCambio={(nuevo) => {
          alCambiar(nuevo);
          setMonto(nuevo);
        }}
        etiqueta="Monto"
      />
    );
  }

  render(<Formulario />);
  return { alCambiar, campo: screen.getByLabelText(/monto/i) as HTMLInputElement };
}

describe('CampoDinero', () => {
  it('muestra los miles con puntos mientras se escribe', async () => {
    const usuario = userEvent.setup();
    const { campo } = montar();

    await usuario.type(campo, '45000');
    expect(campo.value).toBe('45.000');
  });

  it('entrega siempre un entero limpio, sin puntos', async () => {
    const usuario = userEvent.setup();
    const { alCambiar, campo } = montar();

    await usuario.type(campo, '2000000');

    const ultimo = alCambiar.mock.calls.at(-1)?.[0];
    expect(ultimo).toBe(2_000_000);
    expect(Number.isInteger(ultimo)).toBe(true);
  });

  it('ignora letras y simbolos', async () => {
    const usuario = userEvent.setup();
    const { alCambiar, campo } = montar();

    await usuario.type(campo, '12abc34');

    expect(alCambiar.mock.calls.at(-1)?.[0]).toBe(1234);
  });

  it('descarta las comas, que darian un monto con decimales', async () => {
    const usuario = userEvent.setup();
    const { alCambiar, campo } = montar();

    // Si alguien escribe "45000,50" el backend rechazaria el decimal.
    await usuario.type(campo, '45000,50');

    const ultimo = alCambiar.mock.calls.at(-1)?.[0];
    expect(Number.isInteger(ultimo)).toBe(true);
    expect(ultimo).toBe(4_500_050);
  });

  it('no acepta valores negativos', async () => {
    const usuario = userEvent.setup();
    const { alCambiar, campo } = montar();

    await usuario.type(campo, '-500');

    expect(alCambiar.mock.calls.at(-1)?.[0]).toBe(500);
  });

  it('queda vacio en cero, no muestra "0"', () => {
    const { campo } = montar(0);
    expect(campo.value).toBe('');
  });

  it('formatea el valor que recibe al montarse', () => {
    const { campo } = montar(1_500_000);
    expect(campo.value).toBe('1.500.000');
  });

  it('abre el teclado numerico en celular', () => {
    const { campo } = montar();
    // inputMode numeric da teclado de numeros sin las flechitas ni la "e"
    // que permite type="number".
    expect(campo.getAttribute('inputmode')).toBe('numeric');
    expect(campo.getAttribute('type')).toBe('text');
  });

  it('se limpia cuando el formulario reinicia el valor despues de guardar', async () => {
    const usuario = userEvent.setup();

    // Se envuelve en un formulario con estado, como en la app de verdad.
    function Formulario() {
      const [monto, setMonto] = useState(0);
      return (
        <>
          <CampoDinero valor={monto} onCambio={setMonto} etiqueta="Monto" />
          <button type="button" onClick={() => setMonto(0)}>
            Limpiar
          </button>
        </>
      );
    }

    render(<Formulario />);
    const campo = screen.getByLabelText(/monto/i) as HTMLInputElement;

    await usuario.type(campo, '5000');
    expect(campo.value).toBe('5.000');

    await usuario.click(screen.getByRole('button', { name: /limpiar/i }));
    expect(campo.value).toBe('');
  });

  it('el texto en pantalla siempre refleja el valor del formulario', async () => {
    const usuario = userEvent.setup();

    function Formulario() {
      const [monto, setMonto] = useState(0);
      return (
        <>
          <CampoDinero valor={monto} onCambio={setMonto} etiqueta="Monto" />
          <output>{monto}</output>
        </>
      );
    }

    render(<Formulario />);
    const campo = screen.getByLabelText(/monto/i) as HTMLInputElement;

    await usuario.type(campo, '45000');

    // Lo que se ve formateado y lo que guarda el formulario son el mismo numero.
    expect(campo.value).toBe('45.000');
    expect(screen.getByText('45000')).toBeDefined();
  });
});
