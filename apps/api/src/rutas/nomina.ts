import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { periodoQuincena, periodoDelMes } from '@credito/shared';
import { db, esquema } from '../db/cliente.js';
import { ErrorNoEncontrado } from '../errores.js';
import { previsualizarLiquidacion, confirmarLiquidacion, generarReporte } from '../servicios/nomina.js';
import {
  listarHistorial,
  detalleGuardado,
  comprobanteEnPdf,
  textoParaCompartir,
  reporteEnPdf,
  textoParaCompartirReporte,
} from '../servicios/comprobante.js';
import { pagarAhorro } from '../servicios/ahorro.js';
import { zLiquidacion, zId, zFecha, zPeriodo, zMonto } from './validacion.js';

const { liquidaciones, movimientosAhorro } = esquema;

export const rutasNomina: FastifyPluginAsyncZod = async (app) => {
  /**
   * Calcula sin guardar. La pantalla lo usa para mostrar el desglose antes
   * de confirmar el pago.
   */
  app.post('/previsualizar', {
    schema: { body: zLiquidacion },
    handler: async (peticion) => previsualizarLiquidacion(peticion.body),
  });

  /** Guarda la liquidacion, retiene el ahorro y registra el egreso de caja. */
  app.post('/confirmar', {
    schema: { body: zLiquidacion },
    handler: async (peticion, respuesta) => {
      const resultado = await confirmarLiquidacion(peticion.body);
      respuesta.code(201);
      return resultado;
    },
  });

  /**
   * Cuanto se le debe a cada empleado en un rango de fechas.
   *
   * No es una liquidacion real (no incluye bonos ni prestamo): es una foto
   * de lo que se hizo en el rango, para saber cuanto hay que tener listo
   * antes de liquidar.
   */
  app.get('/reporte', {
    schema: { querystring: zPeriodo },
    handler: async (peticion) => generarReporte(peticion.query),
  });

  /** El reporte en PDF, listo para descargar o adjuntar en WhatsApp. */
  app.get('/reporte.pdf', {
    schema: { querystring: zPeriodo },
    handler: async (peticion, respuesta) => {
      const { pdf, nombreArchivo } = await reporteEnPdf(peticion.query);

      return respuesta
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="${nombreArchivo}"`)
        .header('cache-control', 'private, no-store')
        .send(pdf);
    },
  });

  /** Texto resumen del reporte para enviar por WhatsApp junto con el PDF. */
  app.get('/reporte/compartir', {
    schema: { querystring: zPeriodo },
    handler: async (peticion) => textoParaCompartirReporte(peticion.query),
  });

  /** Ayuda a la UI: la quincena y el mes a los que pertenece una fecha. */
  app.get('/periodos', {
    schema: { querystring: z.object({ fecha: zFecha }) },
    handler: async (peticion) => ({
      quincena: periodoQuincena(peticion.query.fecha),
      mes: periodoDelMes(peticion.query.fecha),
    }),
  });

  /**
   * Historial de pagos, del mas reciente al mas viejo.
   *
   * Trae el nombre del empleado resuelto: la lista se muestra tal cual y no
   * obliga a la pantalla a cruzar dos peticiones para armar una fila.
   */
  app.get('/', {
    schema: {
      querystring: z.object({
        empleadoId: zId.optional(),
        desde: zFecha.optional(),
        hasta: zFecha.optional(),
        soloPagadas: z.coerce.boolean().optional(),
      }),
    },
    handler: async (peticion) => listarHistorial(peticion.query),
  });

  /**
   * Detalle de un pago ya hecho, reconstruido desde la fila guardada.
   * No recalcula: muestra lo que se pago en su momento.
   */
  app.get('/:id/detalle', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => detalleGuardado(peticion.params.id),
  });

  /** Comprobante en PDF, listo para descargar o adjuntar en WhatsApp. */
  app.get('/:id/comprobante.pdf', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion, respuesta) => {
      const { pdf, nombreArchivo } = await comprobanteEnPdf(peticion.params.id);

      // 'inline' deja que el navegador lo muestre antes de guardarlo, que es lo
      // que uno quiere al revisar un comprobante. El nombre igual se respeta
      // cuando se descarga o se comparte.
      return respuesta
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="${nombreArchivo}"`)
        .header('cache-control', 'private, no-store')
        .send(pdf);
    },
  });

  /** Texto resumen para enviar por WhatsApp junto con el PDF. */
  app.get('/:id/compartir', {
    schema: { params: z.object({ id: zId }) },
    handler: async (peticion) => textoParaCompartir(peticion.params.id),
  });

  /**
   * Anula una liquidacion. No la borra: cambia su estado y revierte el
   * ahorro que habia retenido, dejando el movimiento contrario en el libro.
   *
   * El egreso de caja NO se borra tampoco: se agrega un ingreso que lo
   * compensa, para que el balance quede correcto sin perder el rastro
   * de que ese pago existio y se anulo.
   */
  app.post('/:id/anular', {
    schema: {
      params: z.object({ id: zId }),
      body: z.object({ motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(300) }),
    },
    handler: async (peticion) => {
      const [original] = await db
        .select()
        .from(liquidaciones)
        .where(eq(liquidaciones.id, peticion.params.id))
        .limit(1);

      if (!original) throw new ErrorNoEncontrado(`No existe la liquidacion ${peticion.params.id}`);
      if (original.estado === 'anulada') {
        return { anulada: true, id: original.id, nota: 'Ya estaba anulada' };
      }

      return db.transaction(async (tx) => {
        await tx
          .update(liquidaciones)
          .set({ estado: 'anulada', nota: `ANULADA: ${peticion.body.motivo}` })
          .where(eq(liquidaciones.id, original.id));

        if (original.ahorroRetenido > 0) {
          await tx
            .insert(movimientosAhorro)
            .values({
              empleadoId: original.empleadoId,
              fecha: new Date().toISOString().slice(0, 10),
              tipo: 'ajuste',
              monto: -original.ahorroRetenido,
              referenciaId: null,
              nota: `Reversa de ahorro por anulacion de liquidacion ${original.id}`,
            });
        }

        if (original.netoAPagar > 0) {
          await tx
            .insert(esquema.movimientosCaja)
            .values({
              fecha: new Date().toISOString().slice(0, 10),
              tipo: 'ingreso',
              monto: original.netoAPagar,
              categoria: 'nomina',
              concepto: `Reversa por anulacion de liquidacion ${original.id}`,
              empleadoId: original.empleadoId,
              origen: 'nomina-anulacion',
              referenciaId: original.id,
            });
        }

        return { anulada: true, id: original.id };
      });
    },
  });

  /** Entrega el ahorro acumulado (el pago de cada 3 meses). */
  app.post('/ahorro/pagar', {
    schema: {
      body: z.object({
        empleadoId: zId,
        fecha: zFecha,
        monto: zMonto.optional(),
        forzar: z.boolean().optional(),
        nota: z.string().trim().max(300).optional(),
      }),
    },
    handler: async (peticion, respuesta) => {
      const resultado = await pagarAhorro(peticion.body);
      respuesta.code(201);
      return resultado;
    },
  });

  /** Historial de movimientos del ahorro de un empleado. */
  app.get('/ahorro/:empleadoId/movimientos', {
    schema: { params: z.object({ empleadoId: zId }) },
    handler: async (peticion) =>
      db
        .select()
        .from(movimientosAhorro)
        .where(eq(movimientosAhorro.empleadoId, peticion.params.empleadoId))
        .orderBy(desc(movimientosAhorro.fecha)),
  });
};
