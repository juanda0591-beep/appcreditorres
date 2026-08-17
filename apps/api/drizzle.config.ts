import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'turso',
  schema: './src/db/esquema/index.ts',
  out: './migraciones',
  casing: 'snake_case',
  dbCredentials: {
    // libSQL espera el prefijo "file:" para bases locales.
    url: process.env.DB_URL ?? `file:${process.env.DB_RUTA ?? './datos/credito.db'}`,
  },
  verbose: true,
  strict: true,
});
