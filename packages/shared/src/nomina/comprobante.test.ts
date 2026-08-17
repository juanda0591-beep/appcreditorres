import { describe, it, expect } from 'vitest';
import {
  fechaLarga,
  describirPeriodoLargo,
  numeroComprobante,
  mensajeComprobante,
  conceptosComprobante,
  nombreArchivoComprobante,
} from './comprobante.js';
import { calcularLiquidacion } from './calcular.js';
import {
  crearEmpleado,
  crearMunicipio,
  crearVenta,
  crearCobro,
  crearGasto,
  mapaMunicipios,
} from './fixtures.js';

const GRANADA = crearMunicipio({
  id: 'mun-granada',
  nombre: 'Granada',
  metaRecaudo: 7_000_000,
  porcentajeExcedente: 4,
  baseBono: 'excedente',
});

/** El caso real: segunda quincena de agosto, con cobro y bono de Granada. */
function liquidacionGranada() {
  const periodo = { desde: '2026-08-16', hasta: '2026-08-31' };
  const cobros = [
    crearCobro({ municipioId: GRANADA.id, fecha: '2026-08-20', montoRecaudado: 9_000_000 }),
  ];

  return calcularLiquidacion({
    empleado: crearEmpleado(),
    periodo,
    ventas: [],
    cobros,
    gastos: [crearGasto({ fecha: '2026-08-20', monto: 30_000, deducible: true })],
    cobrosDelMes: cobros,
    periodoBonos: { desde: '2026-08-01', hasta: '2026-08-31' },
    municipios: mapaMunicipios(GRANADA),
    incluirBonos: true,
  });
}

describe('fechas del comprobante', () => {
  it('escribe la fecha en espanol', () => {
    expect(fechaLarga('2026-08-31')).toBe('31 de agosto de 2026');
    expect(fechaLarga('2026-01-01')).toBe('1 de enero de 2026');
  });

  it('acorta el periodo cuando cae dentro del mismo mes', () => {
    expect(describirPeriodoLargo('2026-08-01', '2026-08-15')).toBe('1 al 15 de agosto de 2026');
  });

  it('escribe las dos fechas completas si el periodo cruza meses', () => {
    expect(describirPeriodoLargo('2026-08-26', '2026-09-10')).toBe(
      '26 de agosto de 2026 al 10 de septiembre de 2026',
    );
  });
});

describe('numero de comprobante', () => {
  it('es corto y se puede dictar por telefono', () => {
    const numero = numeroComprobante('9f8e7d6c-1234-4abc-9def-0123456789ab', '2026-08-31');

    expect(numero).toBe('202608-9F8E7D');
    // Corto de verdad: el UUID completo tiene 36 caracteres.
    expect(numero.length).toBeLessThan(16);
  });

  it('empieza con el ano y mes del periodo, asi ordena solo', () => {
    const agosto = numeroComprobante('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '2026-08-31');
    const septiembre = numeroComprobante('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '2026-09-15');

    expect(agosto < septiembre).toBe(true);
  });

  it('dos liquidaciones distintas dan numeros distintos', () => {
    const uno = numeroComprobante('11111111-1111-1111-1111-111111111111', '2026-08-31');
    const dos = numeroComprobante('22222222-2222-2222-2222-222222222222', '2026-08-31');

    expect(uno).not.toBe(dos);
  });
});

describe('mensaje de WhatsApp del comprobante', () => {
  it('resume el pago con los montos reales', () => {
    const mensaje = mensajeComprobante(liquidacionGranada(), {
      numero: '202608-ABC123',
      nombreNegocio: 'Distribuciones JD',
    });

    expect(mensaje).toContain('Distribuciones JD');
    expect(mensaje).toContain('202608-ABC123');
    expect(mensaje).toContain('Adriana');
    expect(mensaje).toContain('16 al 31 de agosto de 2026');
    // Comision 900.000, bono 80.000, gastos -30.000, neto 950.000
    expect(mensaje).toContain('900.000');
    expect(mensaje).toContain('80.000');
    expect(mensaje).toContain('30.000');
    expect(mensaje).toContain('950.000');
  });

  it('NO incluye enlaces: el detalle va en el PDF adjunto, no publicado', () => {
    const mensaje = mensajeComprobante(liquidacionGranada(), {
      numero: '202608-ABC123',
      nombreNegocio: 'Distribuciones JD',
    });

    expect(mensaje).not.toContain('http');
  });

  it('explica que el ahorro no entra en el pago', () => {
    const periodo = { desde: '2026-08-01', hasta: '2026-08-15' };
    const liquidacion = calcularLiquidacion({
      empleado: crearEmpleado(),
      periodo,
      ventas: [crearVenta({ fecha: '2026-08-09', cantidad: 12 })],
      cobros: [],
      gastos: [],
      municipios: mapaMunicipios(crearMunicipio()),
      incluirBonos: false,
    });

    const mensaje = mensajeComprobante(liquidacion, {
      numero: '202608-XYZ',
      nombreNegocio: 'Distribuciones JD',
    });

    expect(mensaje).toContain('12');
    expect(mensaje).toContain('60.000');
    expect(mensaje).toContain('12.000');
    expect(mensaje).toContain('cada 3 meses');
  });

  it('omite las lineas que no aplican', () => {
    const liquidacion = calcularLiquidacion({
      empleado: crearEmpleado(),
      periodo: { desde: '2026-08-01', hasta: '2026-08-15' },
      ventas: [crearVenta({ fecha: '2026-08-09', cantidad: 3 })],
      cobros: [],
      gastos: [],
      municipios: mapaMunicipios(crearMunicipio()),
      incluirBonos: false,
    });

    const mensaje = mensajeComprobante(liquidacion, {
      numero: '202608-XYZ',
      nombreNegocio: 'JD',
    });

    expect(mensaje).not.toContain('Comision');
    expect(mensaje).not.toContain('Bono');
    expect(mensaje).not.toContain('Gastos descontados');
  });
});

describe('conceptos del comprobante', () => {
  it('arma una linea por concepto que sumo al pago', () => {
    const conceptos = conceptosComprobante(liquidacionGranada());
    const rotulos = conceptos.map((c) => c.concepto);

    expect(rotulos).toContain('Comision de cobros');
    expect(rotulos).toContain('Bono Granada');
    expect(rotulos).toContain('Gastos descontados');
  });

  it('deja los gastos en negativo, para que resten al sumar la tabla', () => {
    const conceptos = conceptosComprobante(liquidacionGranada());
    const gastos = conceptos.find((c) => c.concepto === 'Gastos descontados');

    expect(gastos?.subtotal).toBe(-30_000);
  });

  it('los subtotales suman exactamente el neto pagado', () => {
    const liquidacion = liquidacionGranada();
    const suma = conceptosComprobante(liquidacion).reduce((total, c) => total + c.subtotal, 0);

    expect(suma).toBe(liquidacion.netoAPagar);
  });

  it('muestra la tarifa por venta cuando el total divide exacto', () => {
    const liquidacion = calcularLiquidacion({
      empleado: crearEmpleado(),
      periodo: { desde: '2026-08-01', hasta: '2026-08-15' },
      ventas: [
        crearVenta({ id: 'v1', fecha: '2026-08-02', cantidad: 2, tarifaLiquidacion: 4_000 }),
        crearVenta({ id: 'v2', fecha: '2026-08-03', cantidad: 1, tarifaLiquidacion: 4_000 }),
      ],
      cobros: [],
      gastos: [],
      cobrosDelMes: [],
      municipios: mapaMunicipios(),
      incluirBonos: false,
    });

    const ventas = conceptosComprobante(liquidacion).find((c) => c.concepto === 'Ventas');

    expect(ventas?.cantidad).toBe(3);
    expect(ventas?.valorUnitario).toBe(4_000);
    expect(ventas?.subtotal).toBe(12_000);
  });

  it('omite la tarifa si no divide exacto, en vez de mostrar un valor que no multiplica', () => {
    const conceptos = conceptosComprobante({
      ...liquidacionGranada(),
      ventas: { cantidad: 3, devengado: 10_000, liquidado: 10_000, ahorroRetenido: 0 },
    });

    const ventas = conceptos.find((c) => c.concepto === 'Ventas');

    expect(ventas?.cantidad).toBe(3);
    expect(ventas?.valorUnitario).toBeNull();
  });

  it('no inventa lineas cuando el periodo no genero nada', () => {
    const vacia = calcularLiquidacion({
      empleado: crearEmpleado(),
      periodo: { desde: '2026-08-01', hasta: '2026-08-15' },
      ventas: [],
      cobros: [],
      gastos: [],
      cobrosDelMes: [],
      municipios: mapaMunicipios(),
      incluirBonos: false,
    });

    expect(conceptosComprobante(vacia)).toEqual([]);
  });

  it('muestra la fecha de cada registro cuando se pasan los detalles', () => {
    const liquidacion = calcularLiquidacion({
      empleado: crearEmpleado(),
      periodo: { desde: '2026-08-01', hasta: '2026-08-15' },
      ventas: [
        crearVenta({ id: 'v1', fecha: '2026-08-05', cantidad: 2 }),
        crearVenta({ id: 'v2', fecha: '2026-08-10', cantidad: 3 }),
      ],
      cobros: [
        crearCobro({ id: 'c1', fecha: '2026-08-07', montoRecaudado: 5_000_000 }),
      ],
      gastos: [
        crearGasto({ id: 'g1', fecha: '2026-08-12', monto: 20_000, deducible: true }),
      ],
      cobrosDelMes: [],
      municipios: mapaMunicipios(),
      incluirBonos: false,
    });

    const conceptos = conceptosComprobante(liquidacion, {
      ventas: [
        crearVenta({ id: 'v1', fecha: '2026-08-05', cantidad: 2 }),
        crearVenta({ id: 'v2', fecha: '2026-08-10', cantidad: 3 }),
      ],
      cobros: [
        crearCobro({ id: 'c1', fecha: '2026-08-07', montoRecaudado: 5_000_000 }),
      ],
      gastos: [
        crearGasto({ id: 'g1', fecha: '2026-08-12', monto: 20_000, deducible: true }),
      ],
    });

    // Debe tener una línea por cada registro
    expect(conceptos.length).toBe(4); // 2 ventas + 1 cobro + 1 gasto

    // Cada registro debe tener su fecha
    const venta1 = conceptos.find((c) => c.fecha === '2026-08-05');
    expect(venta1).toBeDefined();
    expect(venta1?.concepto).toContain('Venta');

    const cobro1 = conceptos.find((c) => c.fecha === '2026-08-07');
    expect(cobro1).toBeDefined();
    expect(cobro1?.concepto).toBe('Cobro');

    const gasto1 = conceptos.find((c) => c.fecha === '2026-08-12');
    expect(gasto1).toBeDefined();
    expect(gasto1?.concepto).toContain('Gasto');
  });
});

describe('nombre del archivo PDF', () => {
  it('quita acentos y espacios, que rompen descargas en algunos telefonos', () => {
    expect(nombreArchivoComprobante('María José Peña', '202608-ABC')).toBe(
      'comprobante-maria-jose-pena-202608-ABC.pdf',
    );
  });

  it('no deja rastros de caracteres raros en la ruta', () => {
    const nombre = nombreArchivoComprobante('../../etc/passwd', '202608-ABC');

    expect(nombre).not.toContain('/');
    expect(nombre).not.toContain('..');
    expect(nombre.endsWith('.pdf')).toBe(true);
  });

  it('aguanta un nombre que quede vacio al limpiarlo', () => {
    expect(nombreArchivoComprobante('...', '202608-ABC')).toBe(
      'comprobante-empleado-202608-ABC.pdf',
    );
  });
});
