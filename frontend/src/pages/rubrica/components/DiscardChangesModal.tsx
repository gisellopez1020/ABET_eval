import { Dispatch, SetStateAction } from 'react';

import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';

interface DiscardChangesModalProps {
  /** Acción en espera de confirmar el descarte; null = cerrado */
  pendingDiscard: (() => void) | null;
  setPendingDiscard: Dispatch<SetStateAction<(() => void) | null>>;
  confirmPendingDiscard: () => void;
}

// "Cambios sin guardar": confirma antes de cambiar de curso/actividad o salir
export function DiscardChangesModal({ pendingDiscard, setPendingDiscard, confirmPendingDiscard }: DiscardChangesModalProps) {
  return (
      <Modal open={pendingDiscard !== null} onClose={() => setPendingDiscard(null)} title="Cambios sin guardar">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">Hay cambios sin guardar en la rúbrica. ¿Descartarlos?</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDiscard(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmPendingDiscard}>
              Descartar
            </Button>
          </div>
        </div>
      </Modal>
  );
}
