import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { RaAbet } from '../../../types';

interface DeleteRaModalProps {
  /** Entrada pendiente de eliminar; null = cerrado */
  deleting: RaAbet | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirmación de eliminar un RA o Criterio del catálogo (409 si está en uso)
export function DeleteRaModal({ deleting, error, loading, onClose, onConfirm }: DeleteRaModalProps) {
  return (
      <Modal open={deleting !== null} onClose={onClose} title="Eliminar del catálogo">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {`¿Eliminar ${deleting.codigo_padre === null ? 'el Resultado de Aprendizaje' : 'el Criterio'} "${deleting.codigo}" del catálogo?`}
            </p>

            {error && <p className="text-sm text-uao-accent">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={onConfirm} loading={loading}>
                Eliminar
              </Button>
            </div>
          </div>
        )}
      </Modal>
  );
}
