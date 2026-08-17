import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Rellena lo que jsdom no implementa (window.matchMedia). Sin esto,
    // cualquier prueba que abra un dialogo de SweetAlert2 falla al montarlo.
    setupFiles: ['./src/pruebas/preparar.ts'],
  },
});
