import { eq } from 'drizzle-orm';
import type { Configuracion, ConfiguracionEditable } from '@credito/shared';
import { db, esquema } from '../db/cliente.js';

const { configuracion, ID_CONFIGURACION } = esquema;

/**
 * Configuracion del negocio.
 *
 * Si la fila no existe todavia se crea con los valores por defecto, para que
 * el sistema funcione recien instalado sin obligar a configurar nada primero.
 */
export async function obtenerConfiguracion(): Promise<Configuracion> {
  const [fila] = await db
    .select()
    .from(configuracion)
    .where(eq(configuracion.id, ID_CONFIGURACION))
    .limit(1);

  if (fila) return aConfiguracion(fila);

  const [creada] = await db
    .insert(configuracion)
    .values({ id: ID_CONFIGURACION })
    .returning();

  return aConfiguracion(creada!);
}

export async function actualizarConfiguracion(
  cambios: ConfiguracionEditable,
): Promise<Configuracion> {
  // Se asegura de que la fila exista antes de actualizarla.
  await obtenerConfiguracion();

  const [actualizada] = await db
    .update(configuracion)
    .set({ ...cambios, actualizadoEn: new Date().toISOString() })
    .where(eq(configuracion.id, ID_CONFIGURACION))
    .returning();

  return aConfiguracion(actualizada!);
}

function aConfiguracion(fila: typeof configuracion.$inferSelect): Configuracion {
  return {
    nombreNegocio: fila.nombreNegocio,
    whatsappNumero: fila.whatsappNumero,
    tituloCatalogo: fila.tituloCatalogo,
    descripcionCatalogo: fila.descripcionCatalogo,
    plantillaMensaje: fila.plantillaMensaje,
    plantillaConsulta: fila.plantillaConsulta,
    notaPie: fila.notaPie,
    catalogoActivo: fila.catalogoActivo,
    mostrarPrecios: fila.mostrarPrecios,
    logoUrl: fila.logoUrl,
    actualizadoEn: fila.actualizadoEn,
  };
}
