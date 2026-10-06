import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ProjectRow } from '../types';

interface DeleteProjectModalProps {
  /** Equipo pendiente de eliminar; null = cerrado */
  project: ProjectRow | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirmación de eliminar un equipo (se abre sobre el detalle)
export function DeleteProjectModal({ project, error, loading, onClose, onConfirm }: DeleteProjectModalProps) {
  return (
      <Modal open={project !== null} onClose={onClose} title="Eliminar equipo">
        {project && (
          <div className="space-y-4">
            <p className="whitespace-pre-line text-sm text-gray-700">
              {`¿Deseas eliminar el equipo "${project.nombre}"?

` +
                'Sus integrantes no se eliminan: quedan libres para formar parte de otro equipo de esta actividad. Esta acción no se puede deshacer.'}
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
