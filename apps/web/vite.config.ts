import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /**
     * Las peticiones a /api y /imagenes se reenvian al backend.
     *
     * Con esto el navegador cree que todo viene del mismo origen, asi que en
     * desarrollo no hay problemas de CORS y el codigo usa rutas relativas
     * ("/api/empleados"), las mismas que funcionaran en produccion detras de
     * Nginx. Nada de URLs absolutas que haya que cambiar al desplegar.
     */
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/imagenes': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/catalogo': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
});
