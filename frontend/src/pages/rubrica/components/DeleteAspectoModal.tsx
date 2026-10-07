import { Dispatch, SetStateAction } from 'react';

import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { DraftAspecto } from '../rubricaDraft';

interface DeleteAspectoModalProps {
  /** Aspecto con criterios pendiente de eliminar; null = cerrado */
  aspectoAEliminar: DraftAspecto | null;
  setAspectoAEliminar: Dispatch<SetStateAction<DraftAspecto | null>>;
  confirmDeleteAspecto: () => void;
}

// Confirmación de eliminar un aspecto con criterios (solo afecta al borrador)
export function DeleteAspectoModal({ aspectoAEliminar, setAspectoAEliminar, confirmDeleteAspecto }: DeleteAspectoModalProps) {
  return (
      <Modal open={aspectoAEliminar !== null} onClose={() => setAspectoAEliminar(null)} title="Eliminar aspecto">
        {aspectoAEliminar && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {`¿Eliminar el aspecto "${aspectoAEliminar.nombre}" y sus ${aspectoAEliminar.criterios.length} criterios?`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAspectoAEliminar(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmDeleteAspecto}>
                Eliminar
              </Button>
            </div>
          </div>
        )}
      </Modal>
  );
}
