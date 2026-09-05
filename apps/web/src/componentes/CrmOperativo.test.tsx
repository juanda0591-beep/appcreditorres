import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmFichaSeguimiento } from './CrmFichaSeguimiento';
import type { FichaCrm } from '../api/crm-operativo';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let ficha: FichaCrm;
let solicitudes: { url: string; method: string; body: any }[];
const actualizado = vi.fn();

beforeEach(() => {
  solicitudes = [];
  actualizado.mockClear();
  ficha = { documento: '123456789', contacto: null, promesas: [], responsables: [{ id: 'gestor', nombre: 'Gestor de prueba' }], usuarioActualId: 'gestor', historial: [], cambiosContacto: [],
    creditos: ['16508', '16509'].map((numero, i) => ({ id: `credito-${i}`, numero, cliente: 'Cliente Prueba', cedula: '123456789', saldo: 500000, abono: 200000, diasMora: 45, telefono: null, fechaCorteExcel: '2026-09-05', vendedor: 'Asesor' })) };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(options.body as string) : null;
    if (options?.method) solicitudes.push({ url, method: options.method, body });
    if (url.endsWith('/contacto') && options?.method === 'PUT') {
      ficha.contacto = { ...body, documento: ficha.documento, version: 1, actualizadoEn: '2026-09-05T12:00:00Z', verificadoEn: null };
    }
    if (url.endsWith('/promesas') && options?.method === 'POST') {
      ficha.promesas.push({ ...body, id: 'promesa-1', carteraClienteId: 'credito-0', numero: '16508', estado: 'pendiente', abonoBase: 200000, abonoActual: 200000, avanceDetectado: 0, fechaCorteAbono: '2026-09-05', responsableNombre: 'Gestor de prueba', revision: null, vencida: false, resolucion: null });
    }
    return { ok: true, status: 200, json: async () => structuredClone(ficha) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function abrir() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CrmFichaSeguimiento creditoId="credito-0" onActualizado={actualizado} /></MemoryRouter></QueryClientProvider>);
}

it('registra monto, fecha y responsable sin enviar pagos ni modificar saldo', async () => {
  abrir();
  await userEvent.click(await screen.findByRole('button', { name: 'Nueva promesa' }));
  await userEvent.type(screen.getByLabelText('Monto prometido (COP)'), '100000');
  fireEvent.change(screen.getByLabelText('Fecha de compromiso'), { target: { value: '2099-01-01' } });
  await userEvent.type(screen.getByLabelText('Notas'), 'Prometio pagar el viernes');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar promesa' }));
  await screen.findByRole('button', { name: 'Revisar compromiso' });
  expect(solicitudes).toEqual([{ method: 'POST', url: '/api/admin/crm/cartera/credito-0/promesas', body: { monto: 100000, fechaCompromiso: '2099-01-01', responsableId: 'gestor', notas: 'Prometio pagar el viernes' } }]);
  expect(ficha.creditos[0]!.saldo).toBe(500000);
  expect(actualizado).toHaveBeenCalledOnce();
});

it('guarda ubicacion y responsable con la version de la ficha', async () => {
  abrir();
  await userEvent.click(await screen.findByRole('tab', { name: 'Localizacion y responsable' }));
  await userEvent.click(screen.getByRole('button', { name: 'Editar ficha' }));
  await userEvent.selectOptions(screen.getByLabelText('Estado de ubicacion'), 'cambio_vivienda');
  await userEvent.selectOptions(screen.getByLabelText('Responsable de la persona'), 'gestor');
  await userEvent.type(screen.getByLabelText('Direccion actual'), 'Calle 20 numero 10');
  await userEvent.type(screen.getByLabelText('Municipio'), 'Granada');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }));
  await waitFor(() => expect(actualizado).toHaveBeenCalled());
  expect(solicitudes[0]).toMatchObject({ method: 'PUT', body: { version: null, direccionActual: 'Calle 20 numero 10', municipio: 'Granada', responsableId: 'gestor', estadoUbicacion: 'cambio_vivienda' } });
  expect(screen.getByText('Calle 20 numero 10')).toBeTruthy();
});

it('permite abrir cada credito de la misma persona', async () => {
  abrir();
  await userEvent.click(await screen.findByRole('tab', { name: 'Creditos' }));
  expect(screen.getByRole('link', { name: '#16508' }).getAttribute('href')).toBe('/crm/cartera/credito-0');
  expect(screen.getByRole('link', { name: '#16509' }).getAttribute('href')).toBe('/crm/cartera/credito-1');
});
