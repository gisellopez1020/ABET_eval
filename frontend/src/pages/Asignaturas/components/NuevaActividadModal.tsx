import { Dispatch, SetStateAction } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { ActividadCreate } from '../../../api/actividades';

interface NuevaActividadModalProps {
  newActModal: boolean;
  setNewActModal: Dispatch<SetStateAction<boolean>>;
  newAct: ActividadCreate;
  setNewAct: Dispatch<SetStateAction<ActividadCreate>>;
  actError: string;
  newActLoading: boolean;
  handleCreateActividad: () => void;
}

// Crear una actividad: nombre, tipo (individual / grupal) y peso en la nota final
export function NuevaActividadModal({
  newActModal,
  setNewActModal,
  newAct,
  setNewAct,
  actError,
  newActLoading,
  handleCreateActividad,
}: NuevaActividadModalProps) {
  return (
      <Modal open={newActModal} onClose={() => setNewActModal(false)} title="Nueva actividad">
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={newAct.nombre}
            onChange={(e) => setNewAct((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Lab1: Cálculo de subredes"
          />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Tipo</label>
            <div className="flex gap-4">
              {(['individual', 'grupal'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={newAct.tipo === t}
                    onChange={() => setNewAct((f) => ({ ...f, tipo: t }))}
                    className="accent-[#9E0B0F]"
                  />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <Input
            label="Peso en nota final (%)"
            type="number"
            min={1}
            max={100}
            value={newAct.peso_nota_final}
            onChange={(e) => setNewAct((f) => ({ ...f, peso_nota_final: Number(e.target.value) }))}
          />
          {actError && <p className="text-sm text-uao-accent">{actError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewActModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateActividad} loading={newActLoading}>Crear</Button>
          </div>
        </div>
      </Modal>
  );
}
