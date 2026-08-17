import { obtenerArchivo } from '../api/cliente.js';

/**
 * Comparte el comprobante de un pago por WhatsApp.
 *
 * Usa la Web Share API con el archivo adjunto cuando el navegador la soporta
 * (celulares, sobre todo): abre el selector nativo y la persona elige el chat
 * con el PDF ya pegado. Donde no esta disponible (la mayoria de escritorio) se
 * descarga el PDF y se abre WhatsApp con el resumen en texto, para adjuntarlo
 * a mano.
 *
 * El texto NO lleva enlace al comprobante a proposito: publicar una URL con el
 * detalle del pago dejaria salarios al alcance de cualquiera que la tenga.
 *
 * Devuelve si hubo que caer al modo descarga, para poder avisarlo en pantalla.
 */
export async function compartirComprobante(opciones: {
  liquidacionId: string;
  numero: string;
  texto: string;
}): Promise<{ seDescargo: boolean }> {
  const blob = await obtenerArchivo(`/api/nomina/${opciones.liquidacionId}/comprobante.pdf`);
  const nombreArchivo = `comprobante-${opciones.numero}.pdf`;
  const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });

  // canShare confirma que este navegador puede compartir ARCHIVOS, no solo
  // texto. Sin ese chequeo, share() con files falla en silencio en varios
  // navegadores de escritorio.
  if (navigator.canShare?.({ files: [archivo] })) {
    await navigator.share({
      files: [archivo],
      text: opciones.texto,
      title: `Comprobante ${opciones.numero}`,
    });
    return { seDescargo: false };
  }

  descargar(blob, nombreArchivo);
  window.open(`https://wa.me/?text=${encodeURIComponent(opciones.texto)}`, '_blank');
  return { seDescargo: true };
}

/**
 * Comparte el reporte de nomina por WhatsApp.
 *
 * Mismo mecanismo que {@link compartirComprobante}: adjunta el PDF via Web
 * Share API donde se puede, y si no, lo descarga y abre WhatsApp con el
 * resumen en texto para pegarlo a mano junto con el archivo descargado.
 */
export async function compartirReporte(opciones: {
  desde: string;
  hasta: string;
  texto: string;
}): Promise<{ seDescargo: boolean }> {
  const blob = await obtenerArchivo(
    `/api/nomina/reporte.pdf?desde=${opciones.desde}&hasta=${opciones.hasta}`,
  );
  const nombreArchivo = `reporte-nomina-${opciones.desde}-a-${opciones.hasta}.pdf`;
  const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [archivo] })) {
    await navigator.share({
      files: [archivo],
      text: opciones.texto,
      title: 'Reporte de nomina',
    });
    return { seDescargo: false };
  }

  descargar(blob, nombreArchivo);
  window.open(`https://wa.me/?text=${encodeURIComponent(opciones.texto)}`, '_blank');
  return { seDescargo: true };
}

/** True si la persona cerro el selector de compartir. No es un error. */
export function esCancelacion(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function descargar(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
