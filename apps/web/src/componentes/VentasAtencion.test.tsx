import { beforeEach, afterEach, vi, it, expect } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ModoVentas } from './ModoVentas';
import { NuevoPedidoVentas } from './NuevoPedidoVentas';
import { AtencionConversacionVentas } from './AtencionConversacionVentas';

const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: mocks }));
let modo: string;
let fetchMock: ReturnType<typeof vi.fn>;
let fallarPedido: boolean;
const conv = { id: 'conv1', nombreCliente: 'Ana Torres', telefono: '573001234567', modoAtencion: 'automatico' };
const onGuardado = vi.fn();
beforeEach(() => {
  modo = 'automatico'; fallarPedido = false; onGuardado.mockClear(); mocks.error.mockClear();
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown = {};
    if (url.endsWith('/ventas/modo')) {
      if (options?.method === 'PUT') modo = JSON.parse(options.body as string).modo;
      data = { modo };
    } else if (url.endsWith('/catalogo')) data = { productos: [{ id: 'p1', nombre: 'Nevera Polar', contado: 1000000, credito: 1500000, credicontado: 1200000 }] };
    else if (url.endsWith('/conversaciones')) data = { conversaciones: [conv] };
    else if (url.endsWith('/pedidos') && options?.method === 'POST') {
      if (fallarPedido) return { ok: false, status: 500, json: async () => ({ mensaje: 'No se pudo guardar el pedido' }) };
      data = { pedido: { id: 'pedido1' } };
    }
    return { ok: true, status: 200, json: async () => data };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function abrir(ui: ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>); }
it('permite cambiar el modo general y muestra su estado', async () => {
  abrir(<ModoVentas />);
  await screen.findByText('Agente automatico activo');
  await userEvent.click(within(screen.getByRole('group', { name: 'Modo general de ventas' })).getByRole('button', { name: 'Manual' }));
  await screen.findByText('Respuestas del agente pausadas');
  expect(fetchMock).toHaveBeenCalledWith('/api/admin/ventas/modo', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ modo: 'manual' }) }));
});
async function formulario() {
  abrir(<NuevoPedidoVentas conversacion={conv} onGuardado={onGuardado} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nuevo pedido manual' }));
  await screen.findByRole('option', { name: 'Nevera Polar' });
  await userEvent.selectOptions(screen.getByLabelText('Producto'), 'p1');
  await userEvent.selectOptions(screen.getByLabelText('Forma de pago'), 'contado');
  await userEvent.type(screen.getByLabelText('Direccion de entrega'), 'Calle 20 numero 10');
  await userEvent.type(screen.getByLabelText('Municipio'), 'Granada');
}
it('registra un pedido manual con conversacion, producto y entrega', async () => {
  await formulario();
  expect(screen.getByText(/Total:.*1\.000\.000/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Registrar pedido' }));
  await waitFor(() => expect(onGuardado).toHaveBeenCalledOnce());
  const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/pedidos') && options?.method === 'POST')!;
  expect(JSON.parse(call[1].body)).toMatchObject({ conversacionId: 'conv1', productoId: 'p1', pago: 'contado', cantidad: 1, direccion: 'Calle 20 numero 10', zona: 'Granada' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('conserva el formulario y la clave de reintento si falla el guardado', async () => {
  fallarPedido = true; await formulario();
  await userEvent.click(screen.getByRole('button', { name: 'Registrar pedido' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(screen.getByRole('dialog')).toBeTruthy(); expect(onGuardado).not.toHaveBeenCalled();
  const primerId = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith('/pedidos'))![1].body).id;
  fallarPedido = false;
  await userEvent.click(screen.getByRole('button', { name: 'Registrar pedido' }));
  await waitFor(() => expect(onGuardado).toHaveBeenCalled());
  const ids = fetchMock.mock.calls.filter(([url]) => url.endsWith('/pedidos')).map(([, options]) => JSON.parse(options.body).id);
  expect(ids).toEqual([primerId, primerId]);
});
it('permite pausa por conversacion y enviar una respuesta del gestor', async () => {
  abrir(<AtencionConversacionVentas conversacion={conv} onActualizado={onGuardado} />);
  await userEvent.click(within(screen.getByRole('group', { name: 'Modo de la conversacion' })).getByRole('button', { name: 'Manual' }));
  await waitFor(() => expect(onGuardado).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/admin/ventas/conversaciones/conv1/modo', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ modo: 'manual' }) }));
  await userEvent.type(screen.getByLabelText('Respuesta del gestor'), 'Te atiende un asesor');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar por WhatsApp de ventas' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/ventas/conversaciones/conv1/enviar', expect.objectContaining({ method: 'POST', body: JSON.stringify({ mensaje: 'Te atiende un asesor' }) })));
});
