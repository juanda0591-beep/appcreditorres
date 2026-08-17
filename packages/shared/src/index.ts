// Punto de entrada del paquete compartido.
// El backend y el frontend importan desde aqui: @credito/shared

export * from './money.js';

export * from './types/base.js';
export * from './types/empleado.js';
export * from './types/municipio.js';
export * from './types/venta.js';
export * from './types/cobro.js';
export * from './types/gasto.js';
export * from './types/nomina.js';
export * from './types/prestamo.js';
export * from './types/ahorro.js';
export * from './types/caja.js';
export * from './types/producto.js';
export * from './types/configuracion.js';
export * from './types/usuario.js';

export * from './nomina/calcular.js';
export * from './nomina/comprobante.js';
export * from './whatsapp.js';
