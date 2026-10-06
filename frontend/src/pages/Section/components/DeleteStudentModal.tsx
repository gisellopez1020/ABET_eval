import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';

interface DeleteStudentModalProps {
  open: boolean;
  error: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirmación de eliminar un estudiante de la sección
export function DeleteStudentModal({ open, error, loading, onClose, onConfirm }: DeleteStudentModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Eliminar estudiante">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">¿Eliminar este estudiante?</p>
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
    </Modal>
  );
}
