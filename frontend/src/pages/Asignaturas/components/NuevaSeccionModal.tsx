import { Dispatch, SetStateAction } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';

interface NuevaSeccionModalProps {
  newSeccionModal: boolean;
  setNewSeccionModal: Dispatch<SetStateAction<boolean>>;
  newSeccionNombre: string;
  setNewSeccionNombre: Dispatch<SetStateAction<string>>;
  seccionError: string;
  newSeccionLoading: boolean;
  handleCreateSeccion: () => void;
}

// Crear una sección del curso (Enter también crea)
export function NuevaSeccionModal({
  newSeccionModal,
  setNewSeccionModal,
  newSeccionNombre,
  setNewSeccionNombre,
  seccionError,
  newSeccionLoading,
  handleCreateSeccion,
}: NuevaSeccionModalProps) {
  return (
      <Modal open={newSeccionModal} onClose={() => setNewSeccionModal(false)} title="Nueva sección">
        <div className="space-y-4">
          <Input
            label="Nombre de la sección"
            value={newSeccionNombre}
            onChange={(e) => setNewSeccionNombre(e.target.value)}
            placeholder="Ej: Grupo A"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSeccion()}
          />
          {seccionError && <p className="text-sm text-uao-accent">{seccionError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewSeccionModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateSeccion} loading={newSeccionLoading}>Crear</Button>
          </div>
        </div>
      </Modal>
  );
}
