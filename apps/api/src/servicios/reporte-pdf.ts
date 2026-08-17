import PDFDocument from 'pdfkit';
import {
  formatearPesos,
  fechaLarga,
  describirPeriodoLargo,
  type ReporteNomina,
} from '@credito/shared';
import type { DatosNegocio } from './comprobante-pdf.js';

/** Todo lo que necesita el PDF del reporte, ya resuelto. */
export interface DatosReportePdf {
  reporte: ReporteNomina;
  negocio: DatosNegocio;
}

/** Colores del documento, iguales a los del comprobante individual. */
const TINTA = '#0f172a';
const SUAVE = '#64748b';
const LINEA = '#e2e8f0';
const METAL = '#2c5fb8';
const ROJO = '#dc2626';

const MARGEN = 48;

/**
 * Genera el reporte de nomina en PDF: una fila por empleado con lo que hizo
 * en el rango y cuanto se le debe, mas el total de todos al final.
 *
 * Sigue la misma estructura que el comprobante individual (mismo margen
 * inferior en 0 y bufferPages, por la misma razon: el pie se dibuja a mano
 * con coordenadas absolutas y necesita saber cuantas hojas hubo en total).
 */
export async function generarReportePdf(datos: DatosReportePdf): Promise<Buffer> {
  const { reporte, negocio } = datos;
  const periodoTexto = describirPeriodoLargo(reporte.periodo.desde, reporte.periodo.hasta);

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGEN, bottom: 0, left: MARGEN, right: MARGEN },
    bufferPages: true,
    info: {
      Title: `Reporte de nomina ${reporte.periodo.desde} a ${reporte.periodo.hasta}`,
      Author: negocio.nombreNegocio,
      Subject: 'Reporte de nomina',
    },
  });

  const trozos: Buffer[] = [];
  doc.on('data', (trozo: Buffer) => trozos.push(trozo));
  const terminado = new Promise<Buffer>((resolver, rechazar) => {
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);
  });

  const ancho = doc.page.width - MARGEN * 2;

  // --- Encabezado ---
  const anchoLogo = dibujarLogo(doc, negocio.logo);

  doc.font('Helvetica-Bold').fontSize(17).fillColor(TINTA);
  doc.text(negocio.nombreNegocio, MARGEN + anchoLogo, MARGEN + (anchoLogo > 0 ? 10 : 0), {
    width: ancho * 0.6 - anchoLogo,
  });

  doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
  doc.text('REPORTE DE NOMINA', MARGEN + ancho * 0.6, MARGEN + 2, {
    width: ancho * 0.4,
    align: 'right',
  });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA);
  doc.text(periodoTexto, MARGEN + ancho * 0.6, MARGEN + 15, {
    width: ancho * 0.4,
    align: 'right',
  });

  let y = MARGEN + 52;
  linea(doc, y, ancho);
  y += 18;

  doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
  doc.text(`Generado el ${fechaLarga(new Date().toISOString())}`, MARGEN, y);
  doc.text(
    `${reporte.empleados.length} ${reporte.empleados.length === 1 ? 'empleado' : 'empleados'} con movimiento`,
    MARGEN + ancho * 0.5,
    y,
    { width: ancho * 0.5, align: 'right' },
  );

  y += 24;

  // --- Tabla ---
  y = seccion(doc, y, ancho, 'CUANTO SE LE DEBE A CADA EMPLEADO');
  y = tablaEmpleados(doc, y, ancho, reporte);
  y += 12;

  // --- Total ---
  const total = reporte.empleados.reduce((suma, l) => suma + l.netoAPagar, 0);

  if (y + 40 > limiteTabla(doc)) {
    doc.addPage();
    y = MARGEN;
  }

  const g = geometria(ancho);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA);
  doc.text('TOTAL A PAGAR', MARGEN, y + 4, { width: g.xNeto - MARGEN });
  doc.fontSize(16).fillColor(METAL);
  doc.text(formatearPesos(total), g.xNeto, y, { width: g.anchoNeto - PADDING_CELDA, align: 'right' });

  // --- Pie en todas las hojas ---
  const rango = doc.bufferedPageRange();
  for (let indice = 0; indice < rango.count; indice += 1) {
    doc.switchToPage(rango.start + indice);
    dibujarPie(doc, ancho, {
      titulo: `Reporte ${reporte.periodo.desde} a ${reporte.periodo.hasta}`,
      nota: negocio.notaPie ?? `Reporte generado por ${negocio.nombreNegocio}`,
      hoja: indice + 1,
      hojas: rango.count,
    });
  }

  doc.flushPages();
  doc.end();
  return terminado;
}

function dibujarPie(
  doc: PDFKit.PDFDocument,
  ancho: number,
  datos: { titulo: string; nota: string; hoja: number; hojas: number },
): void {
  const y = doc.page.height - 62;
  linea(doc, y, ancho);

  doc.font('Helvetica').fontSize(8).fillColor(SUAVE);
  doc.text(datos.nota, MARGEN, y + 8, { width: ancho * 0.6 });

  const derecha =
    datos.hojas > 1 ? `${datos.titulo} · Hoja ${datos.hoja} de ${datos.hojas}` : datos.titulo;
  doc.text(derecha, MARGEN, y + 8, { width: ancho, align: 'right' });
}

const ALTO_LOGO = 42;

function dibujarLogo(doc: PDFKit.PDFDocument, logo: Buffer | null | undefined): number {
  if (!logo || logo.length === 0) return 0;

  try {
    doc.image(logo, MARGEN, MARGEN, { fit: [ALTO_LOGO, ALTO_LOGO] });
    return ALTO_LOGO + 12;
  } catch {
    return 0;
  }
}

function linea(doc: PDFKit.PDFDocument, y: number, ancho: number): void {
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ancho, y).lineWidth(0.7).strokeColor(LINEA).stroke();
}

function seccion(doc: PDFKit.PDFDocument, y: number, ancho: number, titulo: string): number {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(SUAVE);
  doc.text(titulo, MARGEN, y, { width: ancho, characterSpacing: 0.6 });
  return y + 16;
}

/** Anchos de las columnas, como fraccion del ancho util. */
const COLUMNAS = { empleado: 0.34, ventas: 0.14, recaudado: 0.18, gastos: 0.16, neto: 0.18 };

const FONDO_ENCABEZADO = '#f1f5f9';
const CEBRA = '#f8fafc';
const PADDING_CELDA = 6;
const ALTO_ENCABEZADO_TABLA = 20;
const ALTO_FILA = 24;

/**
 * Hasta donde puede llegar la tabla antes de pasar a otra hoja.
 * Deja libre la franja de abajo para el pie.
 */
function limiteTabla(doc: PDFKit.PDFDocument): number {
  return doc.page.height - 90;
}

function geometria(ancho: number) {
  const anchoEmpleado = ancho * COLUMNAS.empleado;
  const anchoVentas = ancho * COLUMNAS.ventas;
  const anchoRecaudado = ancho * COLUMNAS.recaudado;
  const anchoGastos = ancho * COLUMNAS.gastos;
  const anchoNeto = ancho * COLUMNAS.neto;

  const xEmpleado = MARGEN;
  const xVentas = xEmpleado + anchoEmpleado;
  const xRecaudado = xVentas + anchoVentas;
  const xGastos = xRecaudado + anchoRecaudado;
  const xNeto = xGastos + anchoGastos;

  return {
    anchoEmpleado,
    anchoVentas,
    anchoRecaudado,
    anchoGastos,
    anchoNeto,
    xEmpleado,
    xVentas,
    xRecaudado,
    xGastos,
    xNeto,
  };
}

function encabezadoTabla(doc: PDFKit.PDFDocument, y: number, ancho: number): number {
  const g = geometria(ancho);

  doc.rect(MARGEN, y, ancho, ALTO_ENCABEZADO_TABLA).fill(FONDO_ENCABEZADO);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(SUAVE);
  doc.text('EMPLEADO', g.xEmpleado + PADDING_CELDA, y + 6, {
    width: g.anchoEmpleado - PADDING_CELDA,
  });
  doc.text('VENTAS', g.xVentas, y + 6, {
    width: g.anchoVentas - PADDING_CELDA,
    align: 'right',
  });
  doc.text('RECAUDADO', g.xRecaudado, y + 6, {
    width: g.anchoRecaudado - PADDING_CELDA,
    align: 'right',
  });
  doc.text('GASTOS', g.xGastos, y + 6, {
    width: g.anchoGastos - PADDING_CELDA,
    align: 'right',
  });
  doc.text('NETO A PAGAR', g.xNeto, y + 6, {
    width: g.anchoNeto - PADDING_CELDA,
    align: 'right',
  });

  return y + ALTO_ENCABEZADO_TABLA;
}

/** Tabla con una fila por empleado: lo que hizo y cuanto se le debe. */
function tablaEmpleados(
  doc: PDFKit.PDFDocument,
  yInicial: number,
  ancho: number,
  reporte: ReporteNomina,
): number {
  const g = geometria(ancho);
  let y = encabezadoTabla(doc, yInicial, ancho);

  for (const [indice, liquidacion] of reporte.empleados.entries()) {
    if (y + ALTO_FILA > limiteTabla(doc)) {
      doc.addPage();
      y = encabezadoTabla(doc, MARGEN, ancho);
    }

    if (indice % 2 === 1) {
      doc.rect(MARGEN, y, ancho, ALTO_FILA).fill(CEBRA);
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor(TINTA);
    doc.text(liquidacion.empleadoNombre, g.xEmpleado + PADDING_CELDA, y + 7, {
      width: g.anchoEmpleado - PADDING_CELDA * 2,
    });

    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE);
    doc.text(String(liquidacion.ventas.cantidad), g.xVentas, y + 7, {
      width: g.anchoVentas - PADDING_CELDA,
      align: 'right',
    });
    doc.text(formatearPesos(liquidacion.cobros.totalRecaudado), g.xRecaudado, y + 7, {
      width: g.anchoRecaudado - PADDING_CELDA,
      align: 'right',
    });

    if (liquidacion.deducciones.total > 0) {
      doc.fillColor(ROJO);
      doc.text(`-${formatearPesos(liquidacion.deducciones.total)}`, g.xGastos, y + 7, {
        width: g.anchoGastos - PADDING_CELDA,
        align: 'right',
      });
    } else {
      doc.text('—', g.xGastos, y + 7, { width: g.anchoGastos - PADDING_CELDA, align: 'right' });
    }

    doc.font('Helvetica-Bold').fontSize(9.5);
    doc.fillColor(liquidacion.quedaSaldoEnContra ? ROJO : TINTA);
    doc.text(formatearPesos(liquidacion.netoAPagar), g.xNeto, y + 7, {
      width: g.anchoNeto - PADDING_CELDA,
      align: 'right',
    });

    y += ALTO_FILA;
    linea(doc, y, ancho);
  }

  return y;
}
