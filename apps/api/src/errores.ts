/**
 * Errores del dominio con su codigo HTTP.
 * El manejador de errores de Fastify los traduce a respuestas limpias
 * en vez de soltar un 500 con el stack trace.
 */

export class ErrorAplicacion extends Error {
  constructor(
    mensaje: string,
    readonly codigoHttp: number,
    readonly codigo: string,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** 404: el recurso no existe. */
export class ErrorNoEncontrado extends ErrorAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 404, 'NO_ENCONTRADO');
  }
}

/** 400: los datos que llegaron no sirven para la operacion. */
export class ErrorDatosInvalidos extends ErrorAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 400, 'DATOS_INVALIDOS');
  }
}

/** 409: la operacion choca con el estado actual (ej: liquidar dos veces). */
export class ErrorConflicto extends ErrorAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 409, 'CONFLICTO');
  }
}

/** 401: no hay sesion valida. El frontend responde mandando al login. */
export class ErrorNoAutorizado extends ErrorAplicacion {
  constructor(mensaje = 'Necesitas iniciar sesion.') {
    super(mensaje, 401, 'NO_AUTORIZADO');
  }
}

/** 403: hay sesion, pero el rol no alcanza para esta operacion. */
export class ErrorSinPermiso extends ErrorAplicacion {
  constructor(mensaje = 'No tienes permiso para esta operacion.') {
    super(mensaje, 403, 'SIN_PERMISO');
  }
}
