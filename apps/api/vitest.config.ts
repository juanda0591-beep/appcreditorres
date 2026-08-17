import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Cada archivo de prueba corre en su propio proceso y de a uno.
     *
     * Estas pruebas son de integracion: cada archivo abre su propia base de
     * datos y su propia carpeta de imagenes, y `config` es un modulo unico que
     * lee process.env una sola vez. Si dos archivos corren a la vez en el mismo
     * proceso, comparten esa configuracion y terminan escribiendo en la carpeta
     * del otro, con fallos que aparecen y desaparecen sin razon aparente.
     *
     * En Vitest 4 estas opciones van al nivel de arriba: `poolOptions` se
     * elimino y dejarlo ahi hacia que se ignoraran en silencio.
     */
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
    fileParallelism: false,
    isolate: true,

    // Las pruebas de imagenes procesan fotos grandes de verdad.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
