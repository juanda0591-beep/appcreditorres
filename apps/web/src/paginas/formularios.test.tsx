import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import type { Municipio } from '@credito/shared';
import { FormularioVenta, FormularioCobro, FormularioGasto } from './formularios.js';

/**
 * Pruebas de los formularios del dia.
 *
 * Lo que se comprueba aqui es que NADA se guarde sin que alguien lo acepte, y
 * que el dialogo muestre las cifras ya calculadas: es el ultimo lugar donde se
 * puede cachar un monto mal escrito, y despues de guardar la correccion implica
 * borrar y volver a anotar.
 *
 * Se mockea `enviar`, la funcion que hace el POST, en vez de la red completa:
 * asi se ve exactamente que rutas se llamaron y con que cuerpo.
 */
const enviar = vi.hoisted(() => vi.fn());

vi.mock('../api/cliente.js', async (original) => ({
  ...(await original<typeof import('../api/cliente.js')>()),
  enviar,
}));

const GRANADA: Municipio = {
  id: 'mun-1',
  nombre: 'Granada',
  metaRecaudo: 7_000_000,
  porcentajeExcedente: 4,
  baseBono: 'excedente',
  activo: true,
  creadoEn: '2026-08-01T00:00:00.000Z',
};

const COMUNES = {
  empleadoId: 'emp-1',
  fecha: '2026-08-20',
  empleadoNombre: 'Adriana Restrepo',
};

function envolver(nodo: React.ReactNode) {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={cache}>{nodo}</QueryClientProvider>);
}

const tick = (ms = 20) => new Promise((listo) => setTimeout(listo, ms));

/** Espera a que el dialogo de confirmacion este montado. */
async function esperarDialogo(): Promise<HTMLElement> {
  for (let intento = 0; intento < 60; intento += 1) {
    const popup = Swal.getPopup();
    if (popup) {
      await tick();
      return popup;
    }
    await tick(10);
  }
  throw new Error('No aparecio la confirmacion');
}

/** Las rutas a las que se hizo POST, en orden. */
const rutasLlamadas = () => enviar.mock.calls.map((llamada) => llamada[0] as string);

beforeEach(() => {
  enviar.mockReset();
  enviar.mockResolvedValue({ id: 'nuevo-1' });
});

afterEach(async () => {
  Swal.close();
  for (let intento = 0; intento < 40 && Swal.getPopup(); intento += 1) await tick(10);
});

describe('nada se guarda sin confirmar', () => {
  it('la venta no se registra si se cancela', async () => {
    envolver(
      <FormularioVenta
        {...COMUNES}
        municipioId=""
        setMunicipioId={() => {}}
        municipios={[GRANADA]}
        tarifaVenta={6000}
        tarifaLiquidacion={5000}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Cuantas ventas/), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ventas' }));
    await esperarDialogo();
    Swal.clickCancel();
    await tick(40);

    expect(enviar).not.toHaveBeenCalled();
  });

  it('la venta se registra al aceptar', async () => {
    envolver(
      <FormularioVenta
        {...COMUNES}
        municipioId=""
        setMunicipioId={() => {}}
        municipios={[GRANADA]}
        tarifaVenta={6000}
        tarifaLiquidacion={5000}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Cuantas ventas/), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ventas' }));
    await esperarDialogo();
    Swal.clickConfirm();
    await tick(60);

    expect(rutasLlamadas()).toEqual(['/api/ventas']);
    expect(enviar.mock.calls[0]![1]).toMatchObject({ cantidad: 12, fecha: '2026-08-20' });
  });

  it('el gasto suelto no se registra si se cancela', async () => {
    envolver(<FormularioGasto {...COMUNES} municipioId="" />);

    await userEvent.type(screen.getByLabelText(/En que fue/), 'Transporte');
    await userEvent.type(screen.getByLabelText(/Monto del gasto/), '70000');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    await esperarDialogo();
    Swal.clickCancel();
    await tick(40);

    expect(enviar).not.toHaveBeenCalled();
  });
});

describe('la confirmacion muestra las cifras ya calculadas', () => {
  it('en ventas: lo que se le paga y lo que va al ahorro', async () => {
    envolver(
      <FormularioVenta
        {...COMUNES}
        municipioId=""
        setMunicipioId={() => {}}
        municipios={[GRANADA]}
        tarifaVenta={6000}
        tarifaLiquidacion={5000}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Cuantas ventas/), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ventas' }));
    const popup = await esperarDialogo();

    // 12 x 5.000 = 60.000 al empleado, y 12 x 1.000 = 12.000 al ahorro.
    expect(popup.textContent).toContain('Adriana Restrepo');
    expect(popup.textContent).toMatch(/60\.000/);
    expect(popup.textContent).toMatch(/12\.000/);
  });

  it('en cobros: el recaudo en el titulo y la comision calculada', async () => {
    envolver(
      <FormularioCobro
        {...COMUNES}
        municipioId={GRANADA.id}
        setMunicipioId={() => {}}
        municipios={[GRANADA]}
        porcentaje={10}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Cuanto recaudo/), '2000000');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    const popup = await esperarDialogo();

    // El recaudo va en el titulo: es la cifra con mas ceros y la que mas se
    // equivoca al escribir.
    expect(Swal.getTitle()?.textContent).toMatch(/2\.000\.000/);
    expect(popup.textContent).toContain('Granada');
    expect(popup.textContent).toMatch(/200\.000/); // 10% de 2.000.000
  });

  it('en gastos: dice si se le descuenta o lo asume el negocio', async () => {
    envolver(<FormularioGasto {...COMUNES} municipioId="" />);

    await userEvent.type(screen.getByLabelText(/En que fue/), 'Transporte');
    await userEvent.type(screen.getByLabelText(/Monto del gasto/), '70000');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    const popup = await esperarDialogo();

    expect(popup.textContent).toContain('Se le descuenta del pago');
    expect(popup.textContent).toContain('Transporte');
  });
});

describe('el cobro y su gasto se guardan como dos registros', () => {
  it('llama a las dos rutas con la misma fecha', async () => {
    envolver(
      <FormularioCobro
        {...COMUNES}
        municipioId={GRANADA.id}
        setMunicipioId={() => {}}
        municipios={[GRANADA]}
        porcentaje={10}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Cuanto recaudo/), '2000000');
    await userEvent.click(screen.getByLabelText(/Hubo un gasto este dia/));
    await userEvent.type(screen.getByLabelText(/En que fue/), 'Transporte');
    await userEvent.type(screen.getByLabelText(/Monto del gasto/), '70000');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    await esperarDialogo();
    Swal.clickConfirm();
    await tick(80);

    expect(rutasLlamadas()).toEqual(['/api/cobros', '/api/gastos']);
    const [, cuerpoCobro] = enviar.mock.calls[0]!;
    const [, cuerpoGasto] = enviar.mock.calls[1]!;
    expect((cuerpoGasto as { fecha: string }).fecha).toBe((cuerpoCobro as { fecha: string }).fecha);
  });

  /**
   * El caso que mas plata cuesta.
   *
   * El cobro y el gasto son dos llamadas. Si la primera pasa y la segunda falla,
   * el formulario queda abierto con el error; volver a darle guardar tiene que
   * reintentar SOLO el gasto. Sin la marca que lo recuerda, el cobro se
   * registraria dos veces y el empleado cobraria doble comision.
   */
  it('si el gasto falla, al reintentar no se vuelve a registrar el cobro', async () => {
    enviar.mockImplementation((ruta: string) =>
      ruta === '/api/gastos'
        ? Promise.reject(new Error('sin conexion'))
        : Promise.resolve({ id: 'cobro-1' }),
    );

    envolver(
      <FormularioCobro
        {...COMUNES}
        municipioId={GRANADA.id}
        setMunicipioId={() => {}}
        municipios={[GRANADA]}
        porcentaje={10}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Cuanto recaudo/), '2000000');
    await userEvent.click(screen.getByLabelText(/Hubo un gasto este dia/));
    await userEvent.type(screen.getByLabelText(/En que fue/), 'Transporte');
    await userEvent.type(screen.getByLabelText(/Monto del gasto/), '70000');

    // Primer intento: el cobro pasa, el gasto falla.
    await userEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    await esperarDialogo();
    Swal.clickConfirm();
    await tick(80);

    expect(rutasLlamadas()).toEqual(['/api/cobros', '/api/gastos']);

    // Segundo intento: ahora el gasto pasa.
    enviar.mockResolvedValue({ id: 'gasto-1' });
    await userEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    await tick(80);

    // No vuelve a preguntar ni a llamar /api/cobros: solo reintenta el gasto.
    expect(rutasLlamadas()).toEqual(['/api/cobros', '/api/gastos', '/api/gastos']);
    expect(rutasLlamadas().filter((r) => r === '/api/cobros')).toHaveLength(1);
  });
});
