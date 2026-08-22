/**
 * Traduce filas de la base de datos a los tipos del dominio (@credito/shared).
 *
 * Existe esta capa porque el motor de calculo no debe saber que hay SQLite
 * detras. Recibe objetos del dominio y punto. Eso lo mantiene puro y testeable.
 */

import type {
  Empleado,
  Municipio,
  RegistroVenta,
  RegistroCobro,
  GastoEmpleado,
  Prestamo,
  MovimientoPrestamo,
  Producto,
  ImagenProducto,
  ZonaVenta,
} from '@credito/shared';
import type {
  EmpleadoFila,
  MunicipioFila,
  RegistroVentaFila,
  RegistroCobroFila,
  GastoEmpleadoFila,
  PrestamoEmpleadoFila,
  MovimientoPrestamoFila,
  ProductoFila,
  ZonaVentaFila,
} from './esquema/index.js';

export function aEmpleado(fila: EmpleadoFila): Empleado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    documento: fila.documento,
    telefono: fila.telefono,
    tarifaVenta: fila.tarifaVenta,
    tarifaLiquidacion: fila.tarifaLiquidacion,
    porcentajeCobro: fila.porcentajeCobro,
    activo: fila.activo,
    creadoEn: fila.creadoEn,
  };
}

export function aMunicipio(fila: MunicipioFila): Municipio {
  return {
    id: fila.id,
    nombre: fila.nombre,
    metaRecaudo: fila.metaRecaudo,
    porcentajeExcedente: fila.porcentajeExcedente,
    baseBono: fila.baseBono,
    activo: fila.activo,
    creadoEn: fila.creadoEn,
  };
}

export function aZonaVenta(fila: ZonaVentaFila): ZonaVenta {
  return {
    id: fila.id,
    nombre: fila.nombre,
    whatsappVendedor: fila.whatsappVendedor,
    activo: fila.activo,
    creadoEn: fila.creadoEn,
  };
}

export function aRegistroVenta(fila: RegistroVentaFila): RegistroVenta {
  return {
    id: fila.id,
    empleadoId: fila.empleadoId,
    municipioId: fila.municipioId,
    fecha: fila.fecha,
    cantidad: fila.cantidad,
    tarifaVenta: fila.tarifaVenta,
    tarifaLiquidacion: fila.tarifaLiquidacion,
    nota: fila.nota,
    creadoEn: fila.creadoEn,
  };
}

export function aRegistroCobro(fila: RegistroCobroFila): RegistroCobro {
  return {
    id: fila.id,
    empleadoId: fila.empleadoId,
    municipioId: fila.municipioId,
    fecha: fila.fecha,
    montoRecaudado: fila.montoRecaudado,
    porcentajeAplicado: fila.porcentajeAplicado,
    nota: fila.nota,
    creadoEn: fila.creadoEn,
  };
}

export function aGastoEmpleado(fila: GastoEmpleadoFila): GastoEmpleado {
  return {
    id: fila.id,
    empleadoId: fila.empleadoId,
    municipioId: fila.municipioId,
    fecha: fila.fecha,
    monto: fila.monto,
    concepto: fila.concepto,
    deducible: fila.deducible,
    creadoEn: fila.creadoEn,
  };
}

export function aPrestamo(fila: PrestamoEmpleadoFila): Prestamo {
  return {
    id: fila.id,
    empleadoId: fila.empleadoId,
    saldoActual: fila.saldoActual,
    actualizadoEn: fila.actualizadoEn,
  };
}

export function aMovimientoPrestamo(fila: MovimientoPrestamoFila): MovimientoPrestamo {
  return {
    id: fila.id,
    empleadoId: fila.empleadoId,
    fecha: fila.fecha,
    tipo: fila.tipo,
    monto: fila.monto,
    saldoAnterior: fila.saldoAnterior,
    saldoNuevo: fila.saldoNuevo,
    concepto: fila.concepto,
    liquidacionId: fila.liquidacionId,
    creadoEn: fila.creadoEn,
  };
}

export function aProducto(fila: ProductoFila): Producto {
  // Parsear imágenes del JSON
  let imagenes: ImagenProducto[] = [];
  if (fila.imagenes) {
    try {
      imagenes = JSON.parse(fila.imagenes);
    } catch {
      imagenes = [];
    }
  }

  // Si no hay imágenes pero hay URLs legacy, crear una imagen
  if (imagenes.length === 0 && fila.imagenUrl && fila.miniaturaUrl) {
    imagenes = [{ imagenUrl: fila.imagenUrl, miniaturaUrl: fila.miniaturaUrl }];
  }

  const pagoSemanal = fila.pagoSemanal || 0;

  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    precio: fila.precio, // Legacy
    precios: {
      contado: fila.precioContado || 0,
      credicontado: fila.precioCredicontado || 0,
      credito: fila.precioCredito || 0,
      inicial: fila.inicial || 0,
      pagoSemanal,
      pagoQuincenal: pagoSemanal * 2,
      pagoMensual: pagoSemanal * 4,
    },
    categoria: fila.categoria,
    imagenes,
    imagenUrl: imagenes[0]?.imagenUrl || null,
    miniaturaUrl: imagenes[0]?.miniaturaUrl || null,
    visible: fila.visible,
    disponible: fila.disponible,
    esNuevo: fila.esNuevo,
    enPromocion: fila.enPromocion,
    orden: fila.orden,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}
