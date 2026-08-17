import PDFDocument from 'pdfkit';
import {
  formatearPesos,
  fechaLarga,
  fechaCorta,
  describirPeriodoLargo,
  numeroComprobante,
  type Money,
  type ConceptoComprobante,
  type DetalleBono,
} from '@credito/shared';
import type { LiquidacionFila } from '../db/esquema/nomina.js';

/** Datos del negocio que encabezan el comprobante. */
export interface DatosNegocio {
  nombreNegocio: string;
  notaPie?: string | null;
  /**
   * Logo ya leido, en PNG o JPEG.
   *
   * Llega como Buffer y no como ruta a proposito: asi esta funcion no toca el
   * disco y se puede probar sin montar la carpeta de imagenes.
   */
  logo?: Buffer | null;
}

/**
 * Todo lo que necesita el PDF, ya resuelto.
 *
 * Se construye desde la FILA guardada, no recalculando la liquidacion. Un pago
 * hecho es un hecho historico: si manana cambias una tarifa o corriges un gasto
 * viejo, el comprobante de lo que ya pagaste no debe cambiar.
 */
export interface DatosComprobante {
  fila: LiquidacionFila;
  empleadoNombre: string;
  empleadoDocumento: string | null;
  negocio: DatosNegocio;
  /**
   * Desglose del pago, ya armado.
   *
   * Lo calcula quien llama, con la misma funcion compartida que usa la tabla
   * del historial en pantalla: asi el papel y la pantalla no pueden discrepar.
   */
  conceptos: ConceptoComprobante[];
  /**
   * Informacion del abono al prestamo en esta liquidacion.
   * Presente solo cuando hubo un abono.
   */
  prestamo?: {
    saldoAnterior: number;
    abono: number;
    saldoNuevo: number;
  } | null;
}

/** Colores del documento, alineados con la interfaz. */
const TINTA = '#0f172a';
const SUAVE = '#64748b';
const LINEA = '#e2e8f0';
/**
 * Azul metalizado, el mismo de la interfaz.
 *
 * Es el equivalente en hex de --color-metal-600 (oklch 0.515 0.142 256). pdfkit
 * no entiende oklch, asi que va convertido; si algun dia se ajusta la paleta en
 * estilos.css hay que actualizarlo aqui a mano.
 */
const METAL = '#2c5fb8';
const ROJO = '#dc2626';

const MARGEN = 48;

/**
 * Genera el comprobante en PDF.
 *
 * Devuelve un Buffer en vez de escribir a un archivo o a la respuesta: asi la
 * misma funcion sirve para descargar, para adjuntar y para las pruebas, sin
 * depender de un servidor levantado.
 */
export async function generarComprobantePdf(datos: DatosComprobante): Promise<Buffer> {
  const { fila, empleadoNombre, empleadoDocumento, negocio } = datos;
  const numero = numeroComprobante(fila.id, fila.periodoHasta);

  const doc = new PDFDocument({
    size: 'LETTER',
    /**
     * El margen inferior va en 0 a proposito.
     *
     * Todo este comprobante se dibuja con coordenadas absolutas, pero pdfkit
     * igual lleva su propio cursor y agrega una pagina sola cuando el texto
     * pasa del margen de abajo. El pie se escribe en y=738 y con el margen en
     * 48 el limite quedaba en 744: cada una de las dos lineas del pie se
     * pasaba y agregaba una hoja, asi que el PDF salia con dos paginas en
     * blanco al final.
     *
     * Con el margen inferior en 0 el limite es el borde del papel y el pie
     * cabe. La posicion del pie no depende de este margen: se calcula desde
     * doc.page.height.
     */
    margins: { top: MARGEN, bottom: 0, left: MARGEN, right: MARGEN },
    /**
     * Las paginas se guardan en memoria para poder volver a ellas al final.
     *
     * El pie lleva el numero del comprobante y "Hoja X de Y", y ninguno de los
     * dos se sabe hasta que se termino de dibujar todo. Sin esto, un pago con
     * muchos conceptos deja hojas intermedias sin numero, y una hoja suelta sin
     * numero no se puede volver a asociar a su pago.
     */
    bufferPages: true,
    info: {
      Title: `Comprobante ${numero}`,
      Author: negocio.nombreNegocio,
      Subject: `Pago de nomina a ${empleadoNombre}`,
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
  // El logo va a la izquierda y corre el nombre del negocio a su derecha. Si no
  // hay logo (o el archivo se perdio) el nombre arranca en el margen, sin hueco.
  const anchoLogo = dibujarLogo(doc, negocio.logo);

  doc.font('Helvetica-Bold').fontSize(17).fillColor(TINTA);
  doc.text(negocio.nombreNegocio, MARGEN + anchoLogo, MARGEN + (anchoLogo > 0 ? 10 : 0), {
    width: ancho * 0.6 - anchoLogo,
  });

  doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
  doc.text('COMPROBANTE DE PAGO', MARGEN + ancho * 0.6, MARGEN + 2, {
    width: ancho * 0.4,
    align: 'right',
  });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA);
  doc.text(numero, MARGEN + ancho * 0.6, MARGEN + 15, {
    width: ancho * 0.4,
    align: 'right',
  });

  // El estado se muestra en grande cuando NO es un pago vigente: un
  // comprobante anulado que se vea igual que uno valido genera reclamos.
  if (fila.estado !== 'pagada') {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ROJO);
    doc.text(fila.estado.toUpperCase(), MARGEN + ancho * 0.6, MARGEN + 32, {
      width: ancho * 0.4,
      align: 'right',
    });
  }

  let y = MARGEN + 52;
  linea(doc, y, ancho);
  y += 18;

  // --- Datos del empleado y periodo ---
  doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
  doc.text('Pagado a', MARGEN, y);
  doc.text('Periodo liquidado', MARGEN + ancho * 0.5, y);

  y += 13;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA);
  doc.text(empleadoNombre, MARGEN, y, { width: ancho * 0.48 });
  doc.fontSize(10);
  doc.text(describirPeriodoLargo(fila.periodoDesde, fila.periodoHasta), MARGEN + ancho * 0.5, y + 1, {
    width: ancho * 0.5,
  });

  y += 17;
  doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
  if (empleadoDocumento) {
    doc.text(`Documento ${empleadoDocumento}`, MARGEN, y);
  }
  if (fila.pagadaEn) {
    doc.text(`Pagado el ${fechaLarga(fila.pagadaEn)}`, MARGEN + ancho * 0.5, y);
  }

  y += 24;

  // --- Detalle ---
  y = seccion(doc, y, ancho, 'DETALLE DEL PAGO');
  y = tablaDetalle(doc, y, ancho, datos.conceptos);
  y += 10;

  // --- Totales ---
  // Los totales no se separan de la tabla: si no caben con ella, pasan enteros
  // a la hoja siguiente. Un "NETO PAGADO" solo en una hoja aparte, sin el
  // detalle que lo sustenta, es justo lo que hace dudar de la cifra.
  if (y + 60 > limiteTabla(doc)) {
    doc.addPage();
    y = MARGEN;
  }

  // Se alinean con la ultima columna de la tabla, no con el borde de la hoja,
  // para que el neto caiga justo debajo de los subtotales que lo componen.
  const anchoSubtotal = ancho * COLUMNAS.subtotal;
  const xTotales = MARGEN + ancho - anchoSubtotal;
  const PADDING = PADDING_CELDA;

  doc.font('Helvetica').fontSize(10).fillColor(SUAVE);
  doc.text('Total devengado', MARGEN, y, { width: ancho - anchoSubtotal, align: 'right' });
  doc.fillColor(TINTA);
  doc.text(formatearPesos(fila.totalBruto), xTotales, y, {
    width: anchoSubtotal - PADDING,
    align: 'right',
  });

  y += 22;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA);
  doc.text('NETO PAGADO', MARGEN, y + 4, { width: ancho - anchoSubtotal, align: 'right' });
  doc.fontSize(16).fillColor(METAL);
  doc.text(formatearPesos(fila.netoAPagar), xTotales, y, {
    width: anchoSubtotal - PADDING,
    align: 'right',
  });

  y += 32;

  // --- Préstamo ---
  // Muestra el abono realizado y el saldo restante. Solo aparece cuando se
  // descontó un abono en esta liquidación.
  if (datos.prestamo && datos.prestamo.abono > 0) {
    if (y + 72 > limiteTabla(doc)) {
      doc.addPage();
      y = MARGEN;
    }
    doc.roundedRect(MARGEN, y, ancho, 60, 6).fillAndStroke('#fef3c7', '#fcd34d');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#92400e');
    doc.text('Abono a préstamo', MARGEN + 12, y + 10);

    doc.font('Helvetica').fontSize(8.5).fillColor('#b45309');
    doc.text(`Saldo anterior: ${formatearPesos(datos.prestamo.saldoAnterior)}`, MARGEN + 12, y + 26);
    doc.text(`Abono realizado: ${formatearPesos(datos.prestamo.abono)}`, MARGEN + 12, y + 38);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#92400e');
    doc.text('Saldo restante:', MARGEN + 12, y + 50);
    doc.fontSize(11);
    doc.text(formatearPesos(datos.prestamo.saldoNuevo), MARGEN + 12, y + 48, {
      width: ancho - 24,
      align: 'right',
    });
    y += 72;
  }

  // --- Ahorro ---
  // Va en su propio bloque, aparte del neto. Es plata del empleado que todavia
  // no se le entrega, y mezclarla con el pago del dia es lo que mas descuadra
  // este tipo de cuentas.
  if (fila.ahorroRetenido > 0) {
    if (y + 56 > limiteTabla(doc)) {
      doc.addPage();
      y = MARGEN;
    }
    doc.roundedRect(MARGEN, y, ancho, 44, 6).fillAndStroke('#eff6ff', '#bfdbfe');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a');
    doc.text('Ahorro acumulado en este periodo', MARGEN + 12, y + 10);
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(formatearPesos(fila.ahorroRetenido), MARGEN + 12, y + 8, {
      width: ancho - 24,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(8.5).fillColor('#1d4fd8');
    doc.text(
      'No entra en este pago. Se entrega cada 3 meses.',
      MARGEN + 12,
      y + 26,
      { width: ancho - 24 },
    );
    y += 56;
  }

  if (fila.nota) {
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
    doc.text(`Nota: ${fila.nota}`, MARGEN, y, { width: ancho });
    y += 22;
  }

  // --- Firmas ---
  // Espacio real para firmar: el comprobante se imprime y se entrega en mano.
  y = Math.max(y + 16, doc.page.height - 150);
  const anchoFirma = (ancho - 30) / 2;

  for (const [indice, rotulo] of ['Entregado por', 'Recibido por'].entries()) {
    const x = MARGEN + indice * (anchoFirma + 30);
    doc.moveTo(x, y).lineTo(x + anchoFirma, y).lineWidth(0.7).strokeColor(LINEA).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE);
    doc.text(rotulo, x, y + 6, { width: anchoFirma });
  }

  // --- Pie en todas las hojas ---
  // Se hace al final, cuando ya se sabe cuantas hojas hay.
  const rango = doc.bufferedPageRange();
  for (let indice = 0; indice < rango.count; indice += 1) {
    doc.switchToPage(rango.start + indice);
    dibujarPie(doc, ancho, {
      numero,
      nota: negocio.notaPie ?? `Comprobante generado por ${negocio.nombreNegocio}`,
      hoja: indice + 1,
      hojas: rango.count,
    });
  }

  doc.flushPages();
  doc.end();
  return terminado;
}

/**
 * Pie de una hoja: nota del negocio a la izquierda, identificacion a la derecha.
 *
 * "Hoja X de Y" solo aparece cuando hay mas de una. En un comprobante de una
 * sola hoja no aporta y ocupa espacio junto al numero.
 */
function dibujarPie(
  doc: PDFKit.PDFDocument,
  ancho: number,
  datos: { numero: string; nota: string; hoja: number; hojas: number },
): void {
  const y = doc.page.height - 62;
  linea(doc, y, ancho);

  doc.font('Helvetica').fontSize(8).fillColor(SUAVE);
  doc.text(datos.nota, MARGEN, y + 8, { width: ancho * 0.6 });

  const derecha =
    datos.hojas > 1
      ? `${datos.numero} · Hoja ${datos.hoja} de ${datos.hojas}`
      : `${datos.numero} · ${fechaLarga(new Date().toISOString())}`;
  doc.text(derecha, MARGEN, y + 8, { width: ancho, align: 'right' });
}

/** Alto reservado al logo en el encabezado. */
const ALTO_LOGO = 42;

/**
 * Dibuja el logo y devuelve cuanto espacio horizontal ocupo (0 si no hubo).
 *
 * Si el archivo no se puede incrustar, se sigue sin logo en vez de tumbar el
 * comprobante: el pago ya se hizo y la persona necesita su papel. pdfkit solo
 * lee JPEG y PNG, asi que un formato distinto cae aqui.
 */
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

/**
 * Anchos de las columnas, como fraccion del ancho util.
 * Nueva estructura: Fecha | Ingresos | Gastos | Subtotal
 */
const COLUMNAS = { fecha: 0.12, ingresos: 0.48, gastos: 0.22, subtotal: 0.18 };

const FONDO_ENCABEZADO = '#f1f5f9';
const CEBRA = '#f8fafc';

const PADDING_CELDA = 6;
const ALTO_ENCABEZADO_TABLA = 20;

/**
 * Hasta donde puede llegar la tabla antes de pasar a otra hoja.
 *
 * Deja libre la franja de abajo para las firmas (que se fijan en height - 150)
 * y el pie. Si una fila cruzara esta linea se abre hoja nueva a proposito: sin
 * este limite pdfkit paginaba solo, una hoja por cada texto que se pasaba, y un
 * comprobante con 20 conceptos salia con 40 paginas.
 */
function limiteTabla(doc: PDFKit.PDFDocument): number {
  return doc.page.height - 172;
}

/** Posiciones y anchos de las columnas, derivados del ancho util. */
function geometria(ancho: number) {
  const anchoFecha = ancho * COLUMNAS.fecha;
  const anchoIngresos = ancho * COLUMNAS.ingresos;
  const anchoGastos = ancho * COLUMNAS.gastos;
  const anchoSubtotal = ancho * COLUMNAS.subtotal;
  const xFecha = MARGEN;
  const xIngresos = xFecha + anchoFecha;
  const xGastos = xIngresos + anchoIngresos;
  const xSubtotal = xGastos + anchoGastos;

  return {
    anchoFecha,
    anchoIngresos,
    anchoGastos,
    anchoSubtotal,
    xFecha,
    xIngresos,
    xGastos,
    xSubtotal,
  };
}

/** Dibuja la fila de titulos. Se repite en cada hoja que use la tabla. */
function encabezadoTabla(doc: PDFKit.PDFDocument, y: number, ancho: number): number {
  const g = geometria(ancho);

  doc.rect(MARGEN, y, ancho, ALTO_ENCABEZADO_TABLA).fill(FONDO_ENCABEZADO);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(SUAVE);
  doc.text('FECHA', g.xFecha + PADDING_CELDA, y + 6, {
    width: g.anchoFecha - PADDING_CELDA,
  });
  doc.text('INGRESOS', g.xIngresos + PADDING_CELDA, y + 6, {
    width: g.anchoIngresos - PADDING_CELDA,
  });
  doc.text('GASTOS', g.xGastos + PADDING_CELDA, y + 6, {
    width: g.anchoGastos - PADDING_CELDA,
  });
  doc.text('SUBTOTAL', g.xSubtotal, y + 6, {
    width: g.anchoSubtotal - PADDING_CELDA,
    align: 'right',
  });

  return y + ALTO_ENCABEZADO_TABLA;
}

/**
 * Agrupa conceptos por fecha para mostrar ingresos y gastos en la misma fila.
 * Los conceptos sin fecha (bonos) se agrupan en una entrada especial.
 */
interface FilaAgrupada {
  fecha: string | null;
  ingresos: ConceptoComprobante[];
  gastos: ConceptoComprobante[];
  subtotal: Money;
}

function agruparPorFecha(conceptos: ConceptoComprobante[]): FilaAgrupada[] {
  const porFecha = new Map<string, FilaAgrupada>();
  const sinFecha: ConceptoComprobante[] = [];

  for (const concepto of conceptos) {
    if (!concepto.fecha) {
      sinFecha.push(concepto);
      continue;
    }

    if (!porFecha.has(concepto.fecha)) {
      porFecha.set(concepto.fecha, {
        fecha: concepto.fecha,
        ingresos: [],
        gastos: [],
        subtotal: 0,
      });
    }

    const fila = porFecha.get(concepto.fecha)!;
    if (concepto.subtotal < 0) {
      fila.gastos.push(concepto);
    } else {
      fila.ingresos.push(concepto);
    }
    fila.subtotal += concepto.subtotal;
  }

  // Convertir a array y ordenar por fecha
  const filas = Array.from(porFecha.values()).sort((a, b) =>
    a.fecha! < b.fecha! ? -1 : 1,
  );

  // Agregar conceptos sin fecha al final
  for (const concepto of sinFecha) {
    filas.push({
      fecha: null,
      ingresos: concepto.subtotal >= 0 ? [concepto] : [],
      gastos: concepto.subtotal < 0 ? [concepto] : [],
      subtotal: concepto.subtotal,
    });
  }

  return filas;
}
/**
 * Detalle del pago como tabla.
 *
 * Agrupa ingresos y gastos por fecha en la misma fila. Las columnas son:
 * Fecha | Ingresos (ventas/cobros) | Gastos | Subtotal del día
 */
function tablaDetalle(
  doc: PDFKit.PDFDocument,
  yInicial: number,
  ancho: number,
  conceptos: ConceptoComprobante[],
): number {
  const { anchoFecha, anchoIngresos, anchoGastos, anchoSubtotal, xFecha, xIngresos, xGastos, xSubtotal } =
    geometria(ancho);

  const PADDING = PADDING_CELDA;
  let y = encabezadoTabla(doc, yInicial, ancho);

  const filasAgrupadas = agruparPorFecha(conceptos);

  for (const [indice, fila] of filasAgrupadas.entries()) {
    // Calcular altura necesaria
    let altoIngresos = 0;
    for (const ingreso of fila.ingresos) {
      const texto = `${ingreso.concepto}: ${ingreso.detalle}`;
      altoIngresos += doc
        .font('Helvetica')
        .fontSize(8.5)
        .heightOfString(texto, { width: anchoIngresos - PADDING * 2 }) + 2;
    }

    let altoGastos = 0;
    for (const gasto of fila.gastos) {
      altoGastos += doc
        .font('Helvetica')
        .fontSize(8.5)
        .heightOfString(gasto.detalle, { width: anchoGastos - PADDING * 2 }) + 2;
    }

    const altoFila = Math.max(altoIngresos, altoGastos, 30) + 8;

    // Si no cabe, nueva hoja
    if (y + altoFila > limiteTabla(doc)) {
      doc.addPage();
      y = encabezadoTabla(doc, MARGEN, ancho);
    }

    // Fondo de fila alterna
    if (indice % 2 === 1) {
      doc.rect(MARGEN, y, ancho, altoFila).fill(CEBRA);
    }

    // Fecha
    if (fila.fecha) {
      doc.font('Helvetica').fontSize(8).fillColor(SUAVE);
      doc.text(fechaCorta(fila.fecha), xFecha + PADDING, y + 6, {
        width: anchoFecha - PADDING * 2,
      });
    }

    // Ingresos
    let yIngreso = y + 6;
    for (const ingreso of fila.ingresos) {
      const texto = ingreso.cantidad !== null && ingreso.valorUnitario !== null
        ? `${ingreso.concepto}: ${ingreso.cantidad} × ${formatearPesos(ingreso.valorUnitario)} = ${formatearPesos(ingreso.subtotal)}`
        : `${ingreso.concepto}: ${formatearPesos(ingreso.subtotal)}`;

      doc.font('Helvetica').fontSize(8.5).fillColor(TINTA);
      doc.text(texto, xIngresos + PADDING, yIngreso, {
        width: anchoIngresos - PADDING * 2,
      });
      yIngreso += doc.heightOfString(texto, { width: anchoIngresos - PADDING * 2 }) + 2;
    }

    // Gastos
    let yGasto = y + 6;
    for (const gasto of fila.gastos) {
      doc.font('Helvetica').fontSize(8.5).fillColor(ROJO);
      doc.text(`-${formatearPesos(-gasto.subtotal)}`, xGastos + PADDING, yGasto, {
        width: anchoGastos - PADDING * 2,
      });
      yGasto += 10;
      doc.fontSize(7.5).fillColor(SUAVE);
      doc.text(gasto.detalle, xGastos + PADDING, yGasto, {
        width: anchoGastos - PADDING * 2,
      });
      yGasto += doc.heightOfString(gasto.detalle, { width: anchoGastos - PADDING * 2 }) + 4;
    }

    // Subtotal
    doc.font('Helvetica-Bold').fontSize(10).fillColor(fila.subtotal < 0 ? ROJO : TINTA);
    doc.text(formatearPesos(fila.subtotal), xSubtotal, y + 6, {
      width: anchoSubtotal - PADDING,
      align: 'right',
    });

    y += altoFila;
    linea(doc, y, ancho);
  }

  return y;
}

/**
 * Lee el detalle de bonos guardado en JSON.
 *
 * Es un campo de texto libre en la base: si viene corrupto o de una version
 * anterior del formato, se ignora en vez de tumbar el comprobante. Perder el
 * detalle de un bono es molesto; no poder generar el PDF de un pago es peor.
 */
export function leerDetalleBonos(json: string | null): DetalleBono[] {
  if (!json) return [];
  try {
    const valor: unknown = JSON.parse(json);
    if (!Array.isArray(valor)) return [];
    return valor.filter(
      (item): item is DetalleBono =>
        typeof item === 'object' &&
        item !== null &&
        'municipioNombre' in item &&
        'bono' in item &&
        typeof (item as DetalleBono).bono === 'number',
    );
  } catch {
    return [];
  }
}
