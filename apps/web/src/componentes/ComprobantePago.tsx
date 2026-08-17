import { useState } from 'react';
import { FileText, Share2 } from 'lucide-react';
import { useTextoCompartirNomina } from '../api/hooks.js';
import { compartirComprobante, esCancelacion } from '../utilidades/compartir.js';
import { Modal, Boton, Cargando, Nota, Aviso } from './base.js';

/**
 * Comprobante de un pago ya hecho: ver/descargar el PDF y compartirlo por
 * WhatsApp.
 *
 * El compartir usa la Web Share API con el archivo adjunto cuando el
 * navegador la soporta (celulares, sobre todo): abre el selector nativo y la
 * persona elige el chat, con el PDF ya pegado. Donde no esta disponible (la
 * mayoria de escritorio) se cae a abrir WhatsApp con el resumen en texto y se
 * deja el PDF descargado aparte para adjuntarlo a mano.
 */
export function ComprobantePago({
  liquidacionId,
  onCerrar,
}: {
  liquidacionId: string;
  onCerrar: () => void;
}) {
  const compartir = useTextoCompartirNomina(liquidacionId);
  const [compartiendo, setCompartiendo] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [avisoDescarga, setAvisoDescarga] = useState(false);

  const urlPdf = `/api/nomina/${liquidacionId}/comprobante.pdf`;
  const numero = compartir.data?.numero;

  async function compartirPorWhatsapp() {
    if (!compartir.data) return;
    setError(null);
    setCompartiendo(true);
    try {
      const { seDescargo } = await compartirComprobante({
        liquidacionId,
        numero: compartir.data.numero,
        texto: compartir.data.texto,
      });
      setAvisoDescarga(seDescargo);
    } catch (err) {
      if (esCancelacion(err)) return;
      setError(err);
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <Modal titulo={numero ? `Comprobante ${numero}` : 'Comprobante'} onCerrar={onCerrar}>
      <div className="space-y-3">
        {compartir.isLoading && <Cargando texto="Preparando comprobante" />}
        <Aviso error={compartir.error} />
        <Aviso error={error} />

        {avisoDescarga && (
          <Nota>
            El PDF se descargo a tu dispositivo. Adjuntalo en la conversacion de WhatsApp que se
            abrio, junto con el mensaje ya escrito.
          </Nota>
        )}

        <a
          href={urlPdf}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200
            bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs
            transition hover:bg-slate-50"
        >
          <FileText size={16} />
          Ver o descargar el PDF
        </a>

        <Boton
          icono={Share2}
          onClick={compartirPorWhatsapp}
          cargando={compartiendo}
          deshabilitado={!compartir.data}
          ancho
        >
          Compartir por WhatsApp
        </Boton>

        {compartir.data && !compartir.data.telefonoEmpleado && (
          <p className="text-xs text-slate-500">
            Este empleado no tiene telefono guardado: al compartir eliges el chat a mano.
          </p>
        )}
      </div>
    </Modal>
  );
}

