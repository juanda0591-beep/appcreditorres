import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { registrarServiceWorker } from './utilidades/pwa.js';
import './estilos.css';

const cache = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos de dinero no deben quedar viejos en pantalla: si alguien
      // registra una venta en otro dispositivo, se refresca al volver.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

const contenedor = document.getElementById('raiz');
if (!contenedor) throw new Error('No se encontro el elemento #raiz');

createRoot(contenedor).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

registrarServiceWorker();
