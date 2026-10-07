import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StudentRow } from '../types';

interface DeleteStudentModalProps {
  /** Estudiante pendiente de eliminar; null = cerrado */
  deleting: StudentRow | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirmación de eliminar un estudiante: avisa qué más se borra
export function DeleteStudentModal({ deleting, error, loading, onClose, onConfirm }: DeleteStudentModalProps) {
  return (
        <Modal open={deleting !== null} onClose={onClose} title="Eliminar estudiante">
          {deleting && (
            <div className="space-y-4">
              <p className="whitespace-pre-line text-sm text-gray-700">
                {`¿Deseas eliminar a "${deleting.nombre}"?\n\n` +
                  'También se eliminarán sus calificaciones individuales y se retirará de los equipos a los que pertenece. Esta acción no se puede deshacer.'}
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
