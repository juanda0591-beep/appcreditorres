import { describe, it, expect } from 'vitest';
import { calcularLiquidacion } from './calcular.js';
import type { EntradaLiquidacion } from './calcular.js';
import {
  crearEmpleado,
  crearMunicipio,
  crearVenta,
  crearCobro,
  crearGasto,
  mapaMunicipios,
} from './fixtures.js';

const PERIODO = { desde: '2026-08-01', hasta: '2026-08-31' };

function entrada(cambios: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion {
  return {
    empleado: crearEmpleado(),
    periodo: PERIODO,
    ventas: [],
    cobros: [],
    gastos: [],
    municipios: mapaMunicipios(crearMunicipio()),
    ...cambios,
  };
}

describe('ejemplos reales del negocio', () => {
  it('Adriana: 12 ventas -> gana 72.000, se le pagan 60.000, ahorra 12.000', () => {
    const resultado = calcularLiquidacion(
      entrada({ ventas: [crearVenta({ cantidad: 12 })] }),
    );

    expect(resultado.ventas.cantidad).toBe(12);
    expect(resultado.ventas.devengado).toBe(72_000);
    expect(resultado.ventas.liquidado).toBe(60_000);
    expect(resultado.ahorroRetenido).toBe(12_000);
    expect(resultado.netoAPagar).toBe(60_000);
  });

  it('cobro de 2 millones al 10% menos 30.000 de gastos -> 170.000', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ montoRecaudado: 2_000_000 })],
        gastos: [crearGasto({ monto: 30_000 })],
        // La meta se pone alta a proposito para aislar la comision del bono.
        municipios: mapaMunicipios(crearMunicipio({ metaRecaudo: 5_000_000 })),
      }),
    );

    expect(resultado.cobros.totalRecaudado).toBe(2_000_000);
    expect(resultado.cobros.comision).toBe(200_000);
    expect(resultado.deducciones.total).toBe(30_000);
    expect(resultado.bonos.total).toBe(0);
    expect(resultado.netoAPagar).toBe(170_000);
  });

  it('el dia completo de Adriana: ventas + cobro + gastos', () => {
    const resultado = calcularLiquidacion(
      entrada({
        ventas: [crearVenta({ cantidad: 12 })],
        cobros: [crearCobro({ montoRecaudado: 2_000_000 })],
        gastos: [crearGasto({ monto: 30_000 })],
        municipios: mapaMunicipios(crearMunicipio({ metaRecaudo: 5_000_000 })),
      }),
    );

    // 60.000 de ventas + 200.000 de comision = 260.000 bruto
    expect(resultado.totalBruto).toBe(260_000);
    // 260.000 - 30.000 de gastos = 230.000
    expect(resultado.netoAPagar).toBe(230_000);
    // El ahorro va aparte, no entra al neto
    expect(resultado.ahorroRetenido).toBe(12_000);
  });
});

describe('bono por superar la meta del municipio', () => {
  it('calcula el bono sobre el excedente', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ montoRecaudado: 2_000_000 })],
        municipios: mapaMunicipios(
          crearMunicipio({ metaRecaudo: 1_500_000, porcentajeExcedente: 2 }),
        ),
      }),
    );

    // Excedente: 2.000.000 - 1.500.000 = 500.000. El 2% son 10.000.
    expect(resultado.bonos.total).toBe(10_000);
    expect(resultado.bonos.detalles[0]?.excedente).toBe(500_000);
    // Comision 200.000 + bono 10.000
    expect(resultado.netoAPagar).toBe(210_000);
  });

  it('calcula el bono sobre el total cuando baseBono es "total"', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ montoRecaudado: 2_000_000 })],
        municipios: mapaMunicipios(
          crearMunicipio({ metaRecaudo: 1_500_000, porcentajeExcedente: 2, baseBono: 'total' }),
        ),
      }),
    );

    // 2% de 2.000.000 = 40.000
    expect(resultado.bonos.total).toBe(40_000);
  });

  it('no genera bono si no alcanzo la meta', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ montoRecaudado: 1_000_000 })],
        municipios: mapaMunicipios(crearMunicipio({ metaRecaudo: 1_500_000 })),
      }),
    );

    expect(resultado.bonos.total).toBe(0);
    expect(resultado.bonos.detalles).toHaveLength(0);
  });

  it('suma varios cobros del mismo municipio antes de comparar con la meta', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [
          crearCobro({ id: 'c1', montoRecaudado: 800_000 }),
          crearCobro({ id: 'c2', montoRecaudado: 900_000 }),
        ],
        municipios: mapaMunicipios(
          crearMunicipio({ metaRecaudo: 1_500_000, porcentajeExcedente: 2 }),
        ),
      }),
    );

    // 1.700.000 en total supera la meta por 200.000. El 2% son 4.000.
    expect(resultado.bonos.total).toBe(4_000);
  });

  it('no calcula bonos cuando incluirBonos es false', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ montoRecaudado: 2_000_000 })],
        incluirBonos: false,
      }),
    );

    expect(resultado.bonos.total).toBe(0);
    expect(resultado.netoAPagar).toBe(200_000);
  });
});

describe('Granada: meta mensual con liquidacion quincenal', () => {
  const granada = crearMunicipio({
    id: 'granada',
    nombre: 'Granada',
    metaRecaudo: 7_000_000,
    porcentajeExcedente: 4,
    baseBono: 'excedente',
  });

  it('cobra 9 millones de una: 10% de comision + 4% del excedente', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ municipioId: 'granada', montoRecaudado: 9_000_000 })],
        municipios: mapaMunicipios(granada),
      }),
    );

    expect(resultado.cobros.comision).toBe(900_000); // 10% de 9.000.000
    expect(resultado.bonos.detalles[0]?.excedente).toBe(2_000_000);
    expect(resultado.bonos.total).toBe(80_000); // 4% de 2.000.000
    expect(resultado.netoAPagar).toBe(980_000);
  });

  it('reconoce la meta aunque el recaudo venga partido en dos quincenas', () => {
    // 4.5M en cada quincena: ninguna llega sola a la meta de 7M,
    // pero en el mes son 9M y el bono se debe pagar.
    const cobrosDelMes = [
      crearCobro({ id: 'q1', municipioId: 'granada', montoRecaudado: 4_500_000, fecha: '2026-08-10' }),
      crearCobro({ id: 'q2', municipioId: 'granada', montoRecaudado: 4_500_000, fecha: '2026-08-20' }),
    ];

    const segundaQuincena = calcularLiquidacion(
      entrada({
        periodo: { desde: '2026-08-16', hasta: '2026-08-31' },
        cobros: [cobrosDelMes[1]!],
        cobrosDelMes,
        municipios: mapaMunicipios(granada),
      }),
    );

    // La comision es solo de la quincena que se esta pagando.
    expect(segundaQuincena.cobros.comision).toBe(450_000);
    // El bono mira el mes completo: 9M - 7M = 2M, al 4%.
    expect(segundaQuincena.bonos.total).toBe(80_000);
  });

  it('en la primera quincena no paga bono, para no pagarlo dos veces', () => {
    const primeraQuincena = calcularLiquidacion(
      entrada({
        periodo: { desde: '2026-08-01', hasta: '2026-08-15' },
        cobros: [crearCobro({ municipioId: 'granada', montoRecaudado: 9_000_000, fecha: '2026-08-10' })],
        municipios: mapaMunicipios(granada),
        incluirBonos: false,
      }),
    );

    expect(primeraQuincena.cobros.comision).toBe(900_000);
    expect(primeraQuincena.bonos.total).toBe(0);
  });

  it('cada municipio usa su propia meta y su propio porcentaje', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [
          crearCobro({ id: 'c1', municipioId: 'granada', montoRecaudado: 9_000_000 }),
          crearCobro({ id: 'c2', municipioId: 'sonson', montoRecaudado: 6_000_000 }),
        ],
        municipios: mapaMunicipios(
          granada,
          crearMunicipio({
            id: 'sonson',
            nombre: 'Sonson',
            metaRecaudo: 5_000_000,
            porcentajeExcedente: 3,
          }),
        ),
      }),
    );

    // Granada: 4% de 2.000.000 = 80.000
    // Sonson:  3% de 1.000.000 = 30.000
    expect(resultado.bonos.total).toBe(110_000);
    expect(resultado.bonos.detalles).toHaveLength(2);
  });
});

describe('gastos del empleado', () => {
  it('no descuenta los gastos que asume el negocio', () => {
    const resultado = calcularLiquidacion(
      entrada({
        ventas: [crearVenta({ cantidad: 12 })],
        gastos: [crearGasto({ monto: 30_000, deducible: false })],
      }),
    );

    expect(resultado.deducciones.total).toBe(0);
    expect(resultado.deducciones.asumidosPorNegocio).toBe(30_000);
    expect(resultado.netoAPagar).toBe(60_000);
  });

  it('avisa y deja saldo en contra si los gastos superan lo ganado', () => {
    const resultado = calcularLiquidacion(
      entrada({
        ventas: [crearVenta({ cantidad: 2 })], // 10.000 liquidados
        gastos: [crearGasto({ monto: 30_000 })],
      }),
    );

    expect(resultado.netoAPagar).toBe(-20_000);
    expect(resultado.quedaSaldoEnContra).toBe(true);
    expect(resultado.advertencias).toHaveLength(1);
  });
});

describe('filtro por periodo', () => {
  it('ignora los registros de fuera del periodo', () => {
    const resultado = calcularLiquidacion(
      entrada({
        ventas: [
          crearVenta({ id: 'v1', cantidad: 12, fecha: '2026-08-09' }),
          crearVenta({ id: 'v2', cantidad: 5, fecha: '2026-07-31' }),
          crearVenta({ id: 'v3', cantidad: 7, fecha: '2026-09-01' }),
        ],
      }),
    );

    expect(resultado.ventas.cantidad).toBe(12);
  });

  it('incluye los registros de los dias limite', () => {
    const resultado = calcularLiquidacion(
      entrada({
        ventas: [
          crearVenta({ id: 'v1', cantidad: 3, fecha: '2026-08-01' }),
          crearVenta({ id: 'v2', cantidad: 4, fecha: '2026-08-31' }),
        ],
      }),
    );

    expect(resultado.ventas.cantidad).toBe(7);
  });
});

describe('casos borde', () => {
  it('un empleado sin movimientos liquida en cero, no falla', () => {
    const resultado = calcularLiquidacion(entrada());

    expect(resultado.totalBruto).toBe(0);
    expect(resultado.netoAPagar).toBe(0);
    expect(resultado.ahorroRetenido).toBe(0);
    expect(resultado.quedaSaldoEnContra).toBe(false);
  });

  it('respeta las tarifas guardadas en el registro, no las actuales del empleado', () => {
    // Simula una venta registrada cuando la tarifa era menor.
    const resultado = calcularLiquidacion(
      entrada({
        empleado: crearEmpleado({ tarifaVenta: 8000, tarifaLiquidacion: 7000 }),
        ventas: [crearVenta({ cantidad: 10, tarifaVenta: 6000, tarifaLiquidacion: 5000 })],
      }),
    );

    expect(resultado.ventas.liquidado).toBe(50_000);
    expect(resultado.ahorroRetenido).toBe(10_000);
  });

  it('avisa cuando falta el municipio de un cobro', () => {
    const resultado = calcularLiquidacion(
      entrada({
        cobros: [crearCobro({ municipioId: 'mun-desconocido' })],
        municipios: mapaMunicipios(),
      }),
    );

    // La comision se paga igual: no depende del municipio.
    expect(resultado.cobros.comision).toBe(200_000);
    expect(resultado.advertencias[0]).toContain('no encontrado');
  });
});
