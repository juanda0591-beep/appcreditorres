/**
 * Grupo de pestañas.
 *
 * Se repetía en cuatro pantallas con el mismo marcado; aquí queda en un solo
 * lugar y con el manejo de teclado y accesibilidad hecho una vez.
 */
export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: ReadonlyArray<readonly [T, string]>;
  valor: T;
  onCambio: (valor: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {opciones.map(([clave, texto]) => (
        <button
          key={clave}
          type="button"
          role="tab"
          aria-selected={valor === clave}
          onClick={() => onCambio(clave)}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
            valor === clave
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}
