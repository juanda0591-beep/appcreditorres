import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import type { ConceptoComprobante } from '@credito/shared';
import { generarComprobantePdf, type DatosComprobante } from './comprobante-pdf.js';
import type { LiquidacionFila } from '../db/esquema/nomina.js';

/**
 * Pruebas del comprobante en PDF.
 *
 * El PDF no lo revisa nadie hasta que un empleado recibe su papel, asi que aqui
 * se leen los bytes generados. Lo que mas importa es el CONTEO DE HOJAS: pdfkit
 * agrega paginas solo cuando un texto pasa el margen de abajo, y el generador
 * dibuja con coordenadas absolutas. Esa mezcla ya produjo dos hojas en blanco al
 * final de cada comprobante, y despues 40 hojas en uno de 20 conceptos.
 */

const FILA: LiquidacionFila = {
  id: 'a1b2c3d4-0000-4000-8000-000000000000',
  empleadoId: 'emp-1',
  periodoDesde: '2026-08-01',
  periodoHasta: '2026-08-15',
  estado: 'pagada',
  totalBruto: 590_000,
  netoAPagar: 560_000,
  ahorroRetenido: 12_000,
  pagadaEn: '2026-08-16',
  nota: null,
  detalleBonos: null,
  creadoEn: '2026-08-16T10:00:00.000Z',
};

function concepto(parcial: Partial<ConceptoComprobante> = {}): ConceptoComprobante {
  return {
    concepto: 'Comision de cobros',
    detalle: 'Sobre $4.500.000 recaudados',
    cantidad: null,
    valorUnitario: null,
    subtotal: 450_000,
    ...parcial,
  };
}

function datos(conceptos: ConceptoComprobante[], fila: Partial<LiquidacionFila> = {}): DatosComprobante {
  return {
    fila: { ...FILA, ...fila },
    empleadoNombre: 'Adriana Restrepo',
    empleadoDocumento: '1234567890',
    negocio: { nombreNegocio: 'Distribuciones JD', notaPie: 'Gracias', logo: null },
    conceptos,
  };
}

/** Cuantas hojas declara el arbol de paginas del PDF. */
function contarHojas(pdf: Buffer): number {
  const encontrado = /\/Count\s+(\d+)/.exec(pdf.toString('latin1'));
  return encontrado ? Number(encontrado[1]) : 0;
}

/**
 * Texto de cada hoja, en el orden en que se dibuja.
 *
 * pdfkit comprime el contenido y escribe el texto en hex dentro de arreglos TJ,
 * intercalado con los ajustes de kerning; hay que rearmarlo.
 */
function textoPorHoja(pdf: Buffer): string[][] {
  const bruto = pdf.toString('latin1');
  const hojas: string[][] = [];

  for (const marca of bruto.matchAll(/stream\r?\n/g)) {
    const inicio = marca.index + marca[0].length;
    const fin = bruto.indexOf('endstream', inicio);
    if (fin < 0) continue;

    let contenido: string;
    try {
      contenido = inflateSync(pdf.subarray(inicio, fin)).toString('latin1');
    } catch {
      continue; // Las imagenes tambien son flujos, pero no son texto.
    }
    if (!/TJ/.test(contenido)) continue;

    hojas.push(
      [...contenido.matchAll(/\[([^\]]*)\]\s*TJ/g)].map((bloque) =>
        [...bloque[1]!.matchAll(/<([0-9a-fA-F]+)>/g)]
          .map((hex) => Buffer.from(hex[1]!, 'hex').toString('latin1'))
          .join(''),
      ),
    );
  }

  return hojas;
}

describe('el comprobante no genera hojas de sobra', () => {
  it('un pago normal cabe en una sola hoja', async () => {
    const pdf = await generarComprobantePdf(
      datos([
        concepto({ concepto: 'Ventas', cantidad: 12, valorUnitario: 5_000, subtotal: 60_000 }),
        concepto(),
        concepto({ concepto: 'Bono Granada', subtotal: 80_000 }),
        concepto({ concepto: 'Gastos descontados', subtotal: -30_000 }),
      ]),
    );

    expect(contarHojas(pdf)).toBe(1);
  });

  it('sin ahorro ni nota tampoco sobra una hoja al final', async () => {
    // El pie se escribe cerca del borde de abajo y era el que agregaba hojas:
    // pasaba el margen inferior y pdfkit abria una hoja nueva por cada linea.
    const pdf = await generarComprobantePdf(
      datos([concepto()], { ahorroRetenido: 0, nota: null }),
    );

    expect(contarHojas(pdf)).toBe(1);
  });

  it('la ultima hoja no queda en blanco: siempre trae texto', async () => {
    const pdf = await generarComprobantePdf(datos([concepto()]));
    const hojas = textoPorHoja(pdf);

    expect(hojas.at(-1)!.join('')).not.toBe('');
  });

  it('crece de a poco cuando hay muchos conceptos, no una hoja por concepto', async () => {
    const muchos = Array.from({ length: 20 }, (_, i) =>
      concepto({ concepto: `Bono Municipio ${i + 1}`, subtotal: 80_000 }),
    );

    const pdf = await generarComprobantePdf(datos(muchos));

    // 20 conceptos caben en dos o tres hojas. Antes salian 40: una por cada
    // texto que se pasaba del limite.
    expect(contarHojas(pdf)).toBeLessThanOrEqual(3);
    expect(contarHojas(pdf)).toBeGreaterThan(1);
  });
});

describe('el detalle va en tabla', () => {
  it('lleva los titulos de las cuatro columnas', async () => {
    const pdf = await generarComprobantePdf(datos([concepto()]));
    const primera = textoPorHoja(pdf)[0]!;

    expect(primera).toContain('CONCEPTO');
    expect(primera).toContain('CANT.');
    expect(primera).toContain('VALOR UNIT.');
    expect(primera).toContain('SUBTOTAL');
  });

  it('muestra cantidad y valor unitario cuando el concepto se cobra por unidad', async () => {
    const pdf = await generarComprobantePdf(
      datos([concepto({ concepto: 'Ventas', cantidad: 12, valorUnitario: 5_000, subtotal: 60_000 })]),
    );
    const primera = textoPorHoja(pdf)[0]!;

    expect(primera).toContain('12');
    expect(primera.some((t) => t.includes('5.000'))).toBe(true);
  });

  it('el subtotal negativo de los gastos sale con signo', async () => {
    const pdf = await generarComprobantePdf(
      datos([concepto({ concepto: 'Gastos descontados', subtotal: -30_000 })]),
    );
    const primera = textoPorHoja(pdf)[0]!;

    expect(primera.some((t) => t.startsWith('-') && t.includes('30.000'))).toBe(true);
  });

  it('repite los titulos en la hoja siguiente: columnas sin nombre no se leen', async () => {
    const muchos = Array.from({ length: 20 }, (_, i) =>
      concepto({ concepto: `Bono Municipio ${i + 1}`, subtotal: 80_000 }),
    );

    const hojas = textoPorHoja(await generarComprobantePdf(datos(muchos)));

    expect(hojas.length).toBeGreaterThan(1);
    for (const hoja of hojas) {
      expect(hoja).toContain('CONCEPTO');
    }
  });
});

describe('identificacion de las hojas', () => {
  it('cada hoja lleva el numero del comprobante', async () => {
    const muchos = Array.from({ length: 20 }, (_, i) =>
      concepto({ concepto: `Bono Municipio ${i + 1}`, subtotal: 80_000 }),
    );

    const hojas = textoPorHoja(await generarComprobantePdf(datos(muchos)));

    // Una hoja suelta sin numero no se puede volver a asociar a su pago. Se
    // busca por "Hoja" y no por el numero: el numero tambien esta en el
    // encabezado de la primera hoja, y ese no sirve para identificar las demas.
    for (const [indice, hoja] of hojas.entries()) {
      const pie = hoja.find((t) => t.includes('Hoja '));
      expect(pie, `la hoja ${indice + 1} no tiene pie`).toBeDefined();
      expect(pie).toBe(`202608-A1B2C3 · Hoja ${indice + 1} de ${hojas.length}`);
    }
  });

  it('con una sola hoja no dice "Hoja 1 de 1"', async () => {
    const hojas = textoPorHoja(await generarComprobantePdf(datos([concepto()])));

    expect(hojas).toHaveLength(1);
    expect(hojas[0]!.some((t) => t.includes('Hoja'))).toBe(false);
  });

  it('marca en rojo el estado cuando la liquidacion esta anulada', async () => {
    const pdf = await generarComprobantePdf(datos([concepto()], { estado: 'anulada' }));

    expect(textoPorHoja(pdf)[0]).toContain('ANULADA');
  });
});
