import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Curso } from '../../../types';

interface ToggleActivoModalProps {
  /** Asignatura pendiente de cerrar (si está activa) o reactivar; null = cerrado */
  toggling: Curso | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirmación de cerrar / reactivar una asignatura
export function ToggleActivoModal({ toggling, error, loading, onClose, onConfirm }: ToggleActivoModalProps) {
  return (
    <Modal
      open={toggling !== null}
      onClose={onClose}
      title={toggling?.activo ? 'Cerrar asignatura' : 'Reactivar asignatura'}
    >
      {toggling && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {`¿Deseas ${toggling.activo ? 'cerrar' : 'reactivar'} la asignatura "${toggling.nombre}"?`}
          </p>
          {error && <p className="text-sm text-uao-accent">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant={toggling.activo ? 'danger' : 'primary'}
              onClick={onConfirm}
              loading={loading}
            >
              {toggling.activo ? 'Cerrar' : 'Reactivar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
