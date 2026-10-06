import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { DetalleXlsxResponse } from '../../../types';

export type EstadoDetalle =
  | { fase: 'generando' }
  | { fase: 'listo'; respuesta: DetalleXlsxResponse }
  | { fase: 'error'; mensaje: string };

interface DetalleActividadModalProps {
  /** null = cerrado */
  detalle: EstadoDetalle | null;
  onClose: () => void;
  onDescargar: () => void;
}

export function DetalleActividadModal({ detalle, onClose, onDescargar }: DetalleActividadModalProps) {
  return (
    <Modal open={detalle !== null} onClose={onClose} title="Detalle de la actividad">
      {detalle?.fase === 'generando' && (
        <div className="flex items-center gap-3 py-6 text-sm text-gray-700" role="status">
          <Loader2 size={22} className="animate-spin text-uao-mid" />
          Generando y sincronizando con tu Drive...
        </div>
      )}

      {detalle?.fase === 'error' && (
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{detalle.mensaje}</span>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}

      {detalle?.fase === 'listo' && (
        <div className="space-y-4 py-2">
          {detalle.respuesta.drive.estado === 'error' ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">No se pudo sincronizar con Drive, pero puedes descargar el archivo.</p>
                {detalle.respuesta.drive.detalle && (
                  <p className="mt-1 text-xs text-amber-700">{detalle.respuesta.drive.detalle}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  Detalle sincronizado en tu Drive
                  {detalle.respuesta.drive.estado === 'simulado' && ' (modo simulado)'}
                </p>
                {detalle.respuesta.drive.enlace && (
                  <a
                    href={detalle.respuesta.drive.enlace}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs underline"
                  >
                    Abrir en Google Drive <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="break-all text-xs text-gray-500">{detalle.respuesta.nombre_archivo}</p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            <Button icon={<Download size={17} />} onClick={onDescargar}>
              Descargar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
