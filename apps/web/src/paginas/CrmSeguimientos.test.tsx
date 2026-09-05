import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CrmGestionCobros from './CrmGestionCobros';
import CrmDetalleCliente from './CrmDetalleCliente';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function renderCrm(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
}

const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: errorToast, success: vi.fn() } }));

const cliente = { id: 'cliente-1', cliente: 'Cliente de prueba', numero: '16508', saldo: 500000, abono: 200000, diasMora: 45, ultimaGestion: null, articulo: 'Nevera', vendedor: 'Asesor', cedula: '123456789', montoCuota: 100000, periodosPago: 'MENSUAL', estado: 'mora' };
const gestion = { id: 'gestion-1', tipoGestion: 'llamada', canal: 'telefono', resultado: 'promesa_pago', fechaGestion: '2026-09-01T12:00:00Z', proximaAccion: 'Verificar promesa', fechaProximaAccion: '2026-09-02', seguimientoCerradoEn: null, nombreUsuario: 'Gestor' };
let pendientes: { gestion: typeof gestion; cliente: typeof cliente }[];
let cerrada: string | null;
let fallaCierre: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pendientes = [{ gestion, cliente }];
  cerrada = '2026-09-05T12:00:00Z';
  fallaCierre = false;
  errorToast.mockClear();
  fetchMock = vi.fn(async (url: string, opciones?: RequestInit) => {
    let data: unknown;
    if (url.includes('/cartera/') && url.endsWith('/seguimiento')) {
      data = { documento: '123456789', contacto: null, creditos: [cliente], promesas: [], responsables: [], usuarioActualId: 'admin', historial: [], cambiosContacto: [] };
    } else if (url.includes('/agenda?')) {
      data = { hoy: '2026-09-05', filas: [], total: 0, pagina: 0, responsables: [], contadores: {}, importaciones: [], indicadores: { personas: 1, saldo: 500000, tramos: [], porGestor: [], promesasMes: 0, cumplidasMes: 0, localizados: 0 } };
    } else if (url.endsWith('/seguimiento')) {
      if (fallaCierre) return { ok: false, json: async () => ({ error: 'Fallo' }) };
      const { cerrado } = JSON.parse(opciones!.body as string);
      pendientes = cerrado ? [] : [{ gestion, cliente }];
      cerrada = cerrado ? '2026-09-05T12:00:00Z' : null;
      data = { gestion: { ...gestion, seguimientoCerradoEn: cerrada } };
    } else if (url.endsWith('/historial')) {
      data = { cliente, gestiones: [{ ...gestion, seguimientoCerradoEn: cerrada }], pagos: [], cambios: [] };
    } else if (url.endsWith('/pendientes')) {
      data = { gestiones: pendientes };
    } else if (url.endsWith('/recientes')) {
      data = { gestiones: [{ gestion: { ...gestion, id: 'reciente-1', proximaAccion: null, fechaProximaAccion: null }, cliente: { ...cliente, cliente: 'Contacto de hoy' } }] };
    } else if (url.endsWith('/prioritarios')) {
      data = { clientes: [] };
    } else if (url.endsWith('/plantillas')) {
      data = { plantillas: [] };
    } else {
      data = { conectado: false };
    }
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('bandeja de seguimientos', () => {
  it('separa contactos de hoy de pendientes y retira el seguimiento al atenderlo', async () => {
    renderCrm(<MemoryRouter><CrmGestionCobros /></MemoryRouter>);
    await userEvent.click(screen.getByRole('tab', { name: 'Seguimientos y gestiones' }));
    const titulo = await screen.findByRole('heading', { name: 'Seguimientos Pendientes (1)' });
    const seccion = titulo.closest('section')!;
    expect(within(seccion).queryByText('Contacto de hoy')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Gestiones de hoy (1)' })).toBeTruthy();
    expect(within(seccion).getByText(/Fecha prevista:/)).toBeTruthy();
    await userEvent.click(within(seccion).getByRole('button', { name: 'Atendido' }));
    await screen.findByRole('heading', { name: 'Seguimientos Pendientes (0)' });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/crm/gestiones/gestion-1/seguimiento', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cerrado: true }) }));
    expect(screen.getByText('Contacto de hoy')).toBeTruthy();
  });

  it('conserva el seguimiento y avisa cuando falla el cierre', async () => {
    fallaCierre = true;
    renderCrm(<MemoryRouter><CrmGestionCobros /></MemoryRouter>);
    await userEvent.click(screen.getByRole('tab', { name: 'Seguimientos y gestiones' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Atendido' }));
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Seguimientos Pendientes (1)' })).toBeTruthy();
  });

  it('permite reabrir un seguimiento desde el historial', async () => {
    renderCrm(<MemoryRouter initialEntries={['/crm/cartera/cliente-1']}><Routes><Route path="/crm/cartera/:id" element={<CrmDetalleCliente />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir' }));
    await screen.findByText('Pendiente');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/crm/gestiones/gestion-1/seguimiento', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ cerrado: false }) }));
  });
});
