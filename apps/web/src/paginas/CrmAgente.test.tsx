import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CrmAgente from './CrmAgente';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
let fetchMock: ReturnType<typeof vi.fn>;
let config: any;
let estado: any;
beforeEach(() => {
  estado = { conectado: false, qrCode: null, numero: null, error: null, conectando: false };
  config = { activo: false, apiKey: '***1234', apiKeyConfigured: true, modelo: 'gpt-4o-mini', temperatura: 0.4, maxTokens: 400, promptSistema: 'Eres el agente exclusivo de cobranza de Creditorres.' };
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown = {};
    if (url.endsWith('/config')) {
      if (options?.method === 'PUT') config = JSON.parse(options.body as string);
      data = config;
    } else if (url.endsWith('/estado')) data = estado;
    else if (url.endsWith('/conversaciones')) data = { conversaciones: [] };
    else if (url.endsWith('/probar')) data = { respuesta: 'Podemos revisar una fecha de pago.' };
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function abrir() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CrmAgente /></MemoryRouter></QueryClientProvider>);
}
it('guarda clave, instrucciones y activacion en la configuracion exclusiva de cobranza', async () => {
  abrir();
  await screen.findByLabelText('Instrucciones del agente');
  await userEvent.click(screen.getByLabelText('Respuestas automaticas activadas'));
  await userEvent.clear(screen.getByLabelText('Clave de OpenAI para cobranza'));
  await userEvent.type(screen.getByLabelText('Clave de OpenAI para cobranza'), 'nueva-clave');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar configuracion' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/cobranza/config', expect.objectContaining({ method: 'PUT', body: expect.stringContaining('nueva-clave') })));
  expect(config.activo).toBe(true);
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/admin/ia/') || url.includes('/admin/whatsapp/'))).toBe(false);
});
it('vincula el segundo numero sin ejecutar reconexion de ventas', async () => {
  abrir();
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular numero' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/cobranza/conectar', expect.objectContaining({ method: 'POST' })));
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/admin/whatsapp/'))).toBe(false);
});
it('la simulacion muestra una respuesta sin enviar mensajes a contactos', async () => {
  abrir();
  const boton = await screen.findByRole('button', { name: 'Probar configuracion guardada' });
  await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(boton);
  await screen.findByText('Podemos revisar una fecha de pago.');
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/enviar'))).toBe(false);
});
it('muestra la espera del QR mientras se establece la conexion', async () => {
  estado.conectando = true;
  abrir();
  expect(await screen.findByText('Solicitando QR a WhatsApp...')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Vincular numero' }) as HTMLButtonElement).disabled).toBe(true);
});
it('muestra el error de red y permite volver a intentar', async () => {
  estado.error = 'El servidor no tiene permiso para conectarse a WhatsApp. No se pudo generar el QR.';
  abrir();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', estado.error);
  expect((screen.getByRole('button', { name: 'Vincular numero' }) as HTMLButtonElement).disabled).toBe(false);
});
it('muestra el credito reconocido por telefono y los valores disponibles para el agente', async () => {
  const responder = fetchMock.getMockImplementation() as (url: string, opciones?: RequestInit) => Promise<unknown>;
  const conversacion = { id: 'conversacion1', nombre: 'Cliente Prueba', telefono: '573001234567', documento: null, pausada: false, requiereAsesor: false, ultimoMensaje: 'Cual es mi saldo?' };
  fetchMock.mockImplementation(async (url: string, opciones?: RequestInit) => {
    if (url.endsWith('/conversaciones')) return { ok: true, json: async () => ({ conversaciones: [conversacion] }) };
    if (url.endsWith('/conversaciones/conversacion1')) return { ok: true, json: async () => ({
      conversacion, mensajes: [], candidatos: [], identificacion: { tipo: 'telefono', documento: '123456789' },
      cartera: [{ numero: '16508', producto: 'Nevera', saldoPendiente: 500000, abonoAcumulado: 200000, montoCuota: 100000, periodicidad: 'MENSUAL', fechaCorte: '2026-09-05', ultimaFechaAbono: '2026-09-01' }],
    }) };
    return responder(url, opciones);
  });
  abrir();
  await userEvent.click(await screen.findByRole('tab', { name: /Conversaciones/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Cliente Prueba/ }));
  expect(await screen.findByText('Identificado por telefono')).toBeTruthy();
  expect(screen.getByText('#16508 · Nevera')).toBeTruthy();
  expect(screen.getByText(/Saldo:.*500\.000/)).toBeTruthy();
  expect(screen.getByText(/Corte: 2026-09-05/)).toBeTruthy();
});
