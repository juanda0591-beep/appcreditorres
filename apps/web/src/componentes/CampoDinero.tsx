import type { ChangeEvent } from 'react';

interface Props {
  valor: number;
  onCambio: (valor: number) => void;
  etiqueta?: string;
  ayuda?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
  id?: string;
}

/**
 * Campo para montos en pesos colombianos.
 *
 * Muestra el numero con puntos de miles (45.000) pero entrega SIEMPRE un entero
 * limpio. Importa porque el backend rechaza montos con decimales: si el campo
 * dejara escribir "45000,50", el guardado fallaria recien al enviar y la
 * persona no sabria por que.
 *
 * No guarda estado propio: lo que muestra sale siempre del valor que recibe.
 * Como solo se aceptan digitos, no hay estados intermedios que preservar
 * (a diferencia de un campo con decimales, donde "45." es valido mientras se
 * escribe). Asi el texto en pantalla nunca puede quedar desincronizado del
 * valor real del formulario.
 *
 * Se usa type="text" con inputMode="numeric" en vez de type="number" porque
 * asi el celular abre el teclado numerico pero el navegador no permite
 * escribir "e", "+" ni comas, que type="number" si acepta.
 */
export function CampoDinero({
  valor,
  onCambio,
  etiqueta,
  ayuda,
  requerido,
  deshabilitado,
  id,
}: Props) {
  const texto = valor === 0 ? '' : valor.toLocaleString('es-CO');

  function manejar(evento: ChangeEvent<HTMLInputElement>) {
    onCambio(soloDigitos(evento.target.value));
  }

  const idCampo = id ?? `dinero-${etiqueta?.replace(/\s+/g, '-').toLowerCase() ?? 'monto'}`;

  return (
    <div>
      {etiqueta && (
        <label className="etiqueta" htmlFor={idCampo}>
          {etiqueta}
          {requerido && <span className="text-red-600"> *</span>}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">
          $
        </span>
        <input
          id={idCampo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="campo pl-7 text-right font-medium tabular-nums"
          value={texto}
          onChange={manejar}
          placeholder="0"
          disabled={deshabilitado}
          required={requerido}
          aria-describedby={ayuda ? `${idCampo}-ayuda` : undefined}
        />
      </div>
      {ayuda && (
        <p id={`${idCampo}-ayuda`} className="mt-1 text-xs text-slate-500">
          {ayuda}
        </p>
      )}
    </div>
  );
}

/**
 * Quita todo lo que no sea digito y devuelve un entero.
 * Descarta puntos, comas, signos y letras: cualquier cosa que pudiera
 * convertirse en un decimal o un negativo.
 */
function soloDigitos(texto: string): number {
  const limpio = texto.replace(/\D/g, '');
  if (limpio === '') return 0;
  const numero = Number(limpio);
  return Number.isSafeInteger(numero) ? numero : 0;
}
