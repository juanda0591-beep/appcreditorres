import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clienteAutenticado, limpiarBaseDatos, type ClientePrueba } from '../pruebas/ayudas.js';

/**
 * Pruebas de la API contra una base de datos real (archivo temporal).
 *
 * No se simula la base de datos a proposito: lo que interesa validar es que
 * el flujo completo cuadre (registrar, liquidar, ahorro, caja), y eso incluye
 * las transacciones y las llaves foraneas de SQLite.
 */

const RUTA_PRUEBA = './datos/prueba-rutas.db';
process.env.DB_RUTA = RUTA_PRUEBA;
process.env.DB_URL = `file:${RUTA_PRUEBA}`;
limpiarBaseDatos(RUTA_PRUEBA);

let app: FastifyInstance;
let api: ClientePrueba;
let adriana: string;
let granada: string;

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const { db } = await import('../db/cliente.js');
  await migrate(db, { migrationsFolder: './migraciones' });

  const { construirApp } = await import('../app.js');
  app = await construirApp();
  await app.ready();

  // La API exige sesion: el cliente ya la lleva en cada peticion.
  api = await clienteAutenticado(app);

  const resEmpleado = await api.post('/api/empleados', { nombre: 'Adriana' });
  adriana = resEmpleado.json().id;

  const resMunicipio = await api.post('/api/municipios', { nombre: 'Granada', metaRecaudo: 7_000_000, porcentajeExcedente: 4 });
  granada = resMunicipio.json().id;
});

afterAll(async () => {
  await app.close();
  const { cerrarBaseDatos } = await import('../db/cliente.js');
  cerrarBaseDatos();
});

describe('valores por defecto del empleado', () => {
  it('crea a Adriana con las tarifas del negocio', async () => {
    const res = await api.get(`/api/empleados/${adriana}`);
    const empleado = res.json();

    expect(res.statusCode).toBe(200);
    expect(empleado.tarifaVenta).toBe(6000);
    expect(empleado.tarifaLiquidacion).toBe(5000);
    expect(empleado.porcentajeCobro).toBe(10);
  });
});

describe('validacion de entrada', () => {
  it('rechaza montos con decimales', async () => {
    const res = await api.post('/api/cobros', { empleadoId: adriana, municipioId: granada, fecha: '2026-08-09', montoRecaudado: 1500.75 });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('DATOS_INVALIDOS');
  });

  it('rechaza fechas que no existen', async () => {
    const res = await api.post('/api/ventas', { empleadoId: adriana, fecha: '2026-02-30', cantidad: 5 });

    expect(res.statusCode).toBe(400);
  });

  it('rechaza una tarifa de liquidacion mayor que la de venta', async () => {
    const res = await api.post('/api/empleados', { nombre: 'Prueba', tarifaVenta: 5000, tarifaLiquidacion: 6000 });

    expect(res.statusCode).toBe(400);
  });

  it('avisa con 409 si el municipio ya existe, en vez de fallar con 500', async () => {
    // libSQL envuelve el error de SQLite en varias capas; si no se recorren,
    // el choque de nombre repetido se escapa como error interno.
    const res = await api.post('/api/municipios', {
      nombre: 'Granada',
      metaRecaudo: 7_000_000,
      porcentajeExcedente: 4,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().mensaje).toContain('Ya existe un municipio');
  });

  it('rechaza un empleado que no existe', async () => {
    const res = await api.post('/api/ventas', { empleadoId: 'no-existe', fecha: '2026-08-09', cantidad: 5 });

    expect(res.statusCode).toBe(404);
  });
});

describe('flujo completo: el mes de Adriana en Granada', () => {
  const primeraQuincena = { desde: '2026-08-01', hasta: '2026-08-15' };
  const segundaQuincena = { desde: '2026-08-16', hasta: '2026-08-31' };

  it('registra las ventas copiando las tarifas vigentes', async () => {
    const res = await api.post('/api/ventas', { empleadoId: adriana, municipioId: granada, fecha: '2026-08-09', cantidad: 12 });

    expect(res.statusCode).toBe(201);
    expect(res.json().tarifaVenta).toBe(6000);
    expect(res.json().tarifaLiquidacion).toBe(5000);
  });

  it('registra el cobro copiando el porcentaje vigente', async () => {
    const res = await api.post('/api/cobros', {
        empleadoId: adriana,
        municipioId: granada,
        fecha: '2026-08-10',
        montoRecaudado: 4_500_000,
      });

    expect(res.statusCode).toBe(201);
    expect(res.json().porcentajeAplicado).toBe(10);
  });

  it('primera quincena: paga ventas y comision, sin bono', async () => {
    const res = await api.post('/api/nomina/previsualizar', { empleadoId: adriana, periodo: primeraQuincena });

    const liq = res.json();
    expect(liq.ventas.devengado).toBe(72_000);
    expect(liq.ventas.liquidado).toBe(60_000);
    expect(liq.ahorroRetenido).toBe(12_000);
    expect(liq.cobros.comision).toBe(450_000);
    // Todavia no cierra el mes: el bono no se paga aqui.
    expect(liq.bonos.total).toBe(0);
    expect(liq.netoAPagar).toBe(510_000);
  });

  it('segunda quincena: al cerrar el mes reconoce el bono sobre el excedente', async () => {
    // Segundo cobro: con este el mes llega a 9M y supera la meta de 7M.
    await api.post('/api/cobros', {
        empleadoId: adriana,
        municipioId: granada,
        fecha: '2026-08-20',
        montoRecaudado: 4_500_000,
      });

    const res = await api.post('/api/nomina/previsualizar', { empleadoId: adriana, periodo: segundaQuincena });

    const liq = res.json();
    // Comision solo de esta quincena.
    expect(liq.cobros.comision).toBe(450_000);
    // El bono mira el mes completo: 9M - 7M = 2M al 4% = 80.000
    expect(liq.bonos.total).toBe(80_000);
    expect(liq.bonos.detalles[0].totalRecaudado).toBe(9_000_000);
    expect(liq.netoAPagar).toBe(530_000);
  });

  it('descuenta los gastos personales del pago', async () => {
    await api.post('/api/gastos', {
        empleadoId: adriana,
        fecha: '2026-08-20',
        monto: 30_000,
        concepto: 'Transporte',
      });

    const res = await api.post('/api/nomina/previsualizar', { empleadoId: adriana, periodo: segundaQuincena });

    expect(res.json().deducciones.total).toBe(30_000);
    expect(res.json().netoAPagar).toBe(500_000);
  });
});

describe('confirmar el pago mueve ahorro y caja', () => {
  const primera = { desde: '2026-08-01', hasta: '2026-08-15' };
  const segunda = { desde: '2026-08-16', hasta: '2026-08-31' };

  it('confirma la primera quincena: aqui caen las 12 ventas', async () => {
    const res = await api.post('/api/nomina/confirmar', { empleadoId: adriana, periodo: primera });

    expect(res.statusCode).toBe(201);
    // 60.000 de ventas + 450.000 de comision
    expect(res.json().liquidacion.netoAPagar).toBe(510_000);
    expect(res.json().liquidacion.ahorroRetenido).toBe(12_000);
  });

  it('confirma la segunda quincena con el bono del mes', async () => {
    const res = await api.post('/api/nomina/confirmar', { empleadoId: adriana, periodo: segunda });

    expect(res.statusCode).toBe(201);
    expect(res.json().liquidacion.netoAPagar).toBe(500_000);
  });

  it('los dos egresos de nomina quedan en el balance de caja', async () => {
    const res = await api.get('/api/caja/balance?desde=2026-08-01&hasta=2026-08-31');

    const balance = res.json();
    // 510.000 de la primera quincena + 500.000 de la segunda
    expect(balance.egresos).toBe(1_010_000);
    expect(balance.balance).toBe(-1_010_000);
    expect(balance.porCategoria.some((c: { categoria: string }) => c.categoria === 'nomina')).toBe(true);
  });

  it('el ahorro queda acumulado y con su movimiento', async () => {
    const res = await api.get(`/api/empleados/${adriana}/ahorro?hoy=2026-08-31`);
    const ahorro = res.json();

    // Las 12 ventas retuvieron 1.000 cada una.
    expect(ahorro.saldo).toBe(12_000);
    // Nunca se le ha pagado, asi que se puede entregar.
    expect(ahorro.cicloCumplido).toBe(true);
  });

  it('no permite liquidar dos veces el mismo periodo', async () => {
    const res = await api.post('/api/nomina/confirmar', { empleadoId: adriana, periodo: segunda });

    expect(res.statusCode).toBe(409);
    expect(res.json().mensaje).toContain('Ya existe una liquidacion');
  });
});

describe('entrega del ahorro cada 3 meses', () => {
  it('entrega el ahorro y lo registra como egreso de caja', async () => {
    const res = await api.post('/api/nomina/ahorro/pagar', { empleadoId: adriana, fecha: '2026-08-31' });

    expect(res.statusCode).toBe(201);
    expect(res.json().montoPagado).toBe(12_000);
    expect(res.json().saldoRestante).toBe(0);
  });

  it('bloquea la siguiente entrega hasta que pasen los 3 meses', async () => {
    // Se agregan ventas nuevas para que haya saldo otra vez.
    await api.post('/api/ventas', { empleadoId: adriana, municipioId: granada, fecha: '2026-09-05', cantidad: 10 });
    await api.post('/api/nomina/confirmar', { empleadoId: adriana, periodo: { desde: '2026-09-01', hasta: '2026-09-15' } });

    const res = await api.post('/api/nomina/ahorro/pagar', { empleadoId: adriana, fecha: '2026-09-20' });

    expect(res.statusCode).toBe(400);
    expect(res.json().mensaje).toContain('3 meses');
  });

  it('permite forzar la entrega cuando se necesita', async () => {
    const res = await api.post('/api/nomina/ahorro/pagar', { empleadoId: adriana, fecha: '2026-09-20', forzar: true });

    expect(res.statusCode).toBe(201);
    expect(res.json().montoPagado).toBe(10_000);
  });
});

describe('proteccion de los movimientos generados por el sistema', () => {
  it('no deja borrar el egreso que creo una liquidacion', async () => {
    const lista = await api.get('/api/caja?tipo=egreso' );
    const deNomina = lista.json().find((m: { origen: string }) => m.origen === 'nomina');

    const res = await api.delete(`/api/caja/${deNomina.id}`);

    expect(res.statusCode).toBe(409);
    expect(res.json().mensaje).toContain('lo genero el sistema');
  });

  it('si deja borrar un movimiento manual', async () => {
    const creado = await api.post('/api/caja', {
        fecha: '2026-08-15',
        tipo: 'egreso',
        monto: 50_000,
        categoria: 'arriendo',
        concepto: 'Arriendo local',
      });

    const res = await api.delete(`/api/caja/${creado.json().id}`);
    expect(res.statusCode).toBe(200);
  });
});

/**
 * Edicion desde la pantalla de empleados y municipios.
 *
 * Estas rutas existian sin pruebas mientras no habia boton que las llamara.
 * Ahora la pantalla tiene "Editar", asi que conviene fijar el comportamiento:
 * sobre todo que cambiar una tarifa NO reescriba los pagos ya hechos.
 */
describe('editar empleados y municipios', () => {
  it('cambia el nombre y las tarifas de un empleado', async () => {
    const res = await api.patch(`/api/empleados/${adriana}`, {
      nombre: 'Adriana Restrepo',
      tarifaVenta: 7_000,
      tarifaLiquidacion: 5_500,
      porcentajeCobro: 12,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().nombre).toBe('Adriana Restrepo');
    expect(res.json().tarifaVenta).toBe(7_000);
    expect(res.json().porcentajeCobro).toBe(12);
  });

  it('la tarifa nueva no reescribe las ventas ya registradas', async () => {
    // Las ventas del mes se guardaron con la tarifa vieja ($6.000/$5.000) y
    // deben seguir asi: si cambiaran, un pago ya entregado dejaria de cuadrar
    // con su comprobante.
    const ventas = await api.get('/api/ventas');
    const delMes = ventas.json().filter((v: { fecha: string }) => v.fecha.startsWith('2026-08'));

    expect(delMes.length).toBeGreaterThan(0);
    for (const venta of delMes) {
      expect(venta.tarifaVenta).toBe(6_000);
      expect(venta.tarifaLiquidacion).toBe(5_000);
    }
  });

  it('cambia la meta y el porcentaje de un municipio', async () => {
    const res = await api.patch(`/api/municipios/${granada}`, {
      metaRecaudo: 8_000_000,
      porcentajeExcedente: 5,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().metaRecaudo).toBe(8_000_000);
    expect(res.json().porcentajeExcedente).toBe(5);
  });

  it('avisa con 409 si el nombre nuevo ya lo tiene otro municipio', async () => {
    await api.post('/api/municipios', {
      nombre: 'Marinilla',
      metaRecaudo: 5_000_000,
      porcentajeExcedente: 3,
    });

    // Renombrar Granada a "Marinilla" choca con el indice unico. Tiene que
    // salir un 409 explicado, no un 500: desde la pantalla esto es un error
    // que la persona puede corregir escribiendo otro nombre.
    const res = await api.patch(`/api/municipios/${granada}`, { nombre: 'Marinilla' });

    expect(res.statusCode).toBe(409);
    expect(res.json().mensaje).toContain('Marinilla');
  });

  it('responde 404 al editar algo que no existe', async () => {
    const inventado = '00000000-0000-4000-8000-000000000000';

    expect((await api.patch(`/api/empleados/${inventado}`, { nombre: 'X' })).statusCode).toBe(404);
    expect((await api.patch(`/api/municipios/${inventado}`, { nombre: 'X' })).statusCode).toBe(404);
  });
});

/**
 * Cobro y gasto anotados juntos, como los manda la pantalla de registro.
 *
 * La pantalla los guarda en dos llamadas seguidas con la MISMA fecha. No hay
 * llave foranea entre ellos: lo que los relaciona es empleado + fecha, que es
 * justo como la nomina agrupa. Esta prueba fija esa relacion, porque si algun
 * dia se cambia el filtro de gastos a otro criterio, el gasto del dia dejaria
 * de descontarse y el empleado recibiria mas plata de la que le corresponde.
 */
describe('cobro con gasto del mismo dia', () => {
  let juan: string;
  const periodo = { desde: '2026-09-01', hasta: '2026-09-15' };

  it('registra el cobro y el gasto en la misma fecha', async () => {
    juan = (await api.post('/api/empleados', { nombre: 'Juan' })).json().id;

    const cobro = await api.post('/api/cobros', {
      empleadoId: juan,
      municipioId: granada,
      fecha: '2026-09-10',
      montoRecaudado: 2_000_000,
    });
    const gasto = await api.post('/api/gastos', {
      empleadoId: juan,
      municipioId: granada,
      fecha: '2026-09-10',
      monto: 70_000,
      concepto: 'Transporte del recaudo',
    });

    expect(cobro.statusCode).toBe(201);
    expect(gasto.statusCode).toBe(201);
    expect(gasto.json().fecha).toBe(cobro.json().fecha);
  });

  it('la liquidacion descuenta ese gasto de la comision', async () => {
    const res = await api.post('/api/nomina/previsualizar', { empleadoId: juan, periodo });
    const liq = res.json();

    // 10% de 2.000.000 = 200.000, menos los 70.000 del gasto = 130.000
    expect(liq.cobros.comision).toBe(200_000);
    expect(liq.deducciones.total).toBe(70_000);
    expect(liq.netoAPagar).toBe(130_000);
  });

  it('el gasto queda visible con su concepto, no solo como un total', async () => {
    // Sin el concepto no se puede responder "y esos 70.000 en que fueron?".
    const res = await api.get(`/api/gastos?empleadoId=${juan}`);
    const delDia = res.json().filter((g: { fecha: string }) => g.fecha === '2026-09-10');

    expect(delDia).toHaveLength(1);
    expect(delDia[0].concepto).toBe('Transporte del recaudo');
    expect(delDia[0].deducible).toBe(true);
  });

  it('un gasto no deducible no le baja el pago: lo asume el negocio', async () => {
    await api.post('/api/gastos', {
      empleadoId: juan,
      fecha: '2026-09-11',
      monto: 50_000,
      concepto: 'Herramienta del negocio',
      deducible: false,
    });

    const res = await api.post('/api/nomina/previsualizar', { empleadoId: juan, periodo });

    expect(res.json().deducciones.total).toBe(70_000);
    expect(res.json().netoAPagar).toBe(130_000);
  });
});
