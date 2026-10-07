import { Dispatch, SetStateAction } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { CriterioForm, DraftAspecto } from '../rubricaDraft';

interface CriterioFormModalProps {
  /** null = cerrado */
  criterioForm: CriterioForm | null;
  setCriterioForm: Dispatch<SetStateAction<CriterioForm | null>>;
  /** Para mostrar el nombre del aspecto al que pertenece */
  draft: DraftAspecto[];
  formError: string;
  submitCriterio: () => void;
}

// Agregar / editar un criterio de un aspecto (solo cambia el borrador)
export function CriterioFormModal({
  criterioForm,
  setCriterioForm,
  draft,
  formError,
  submitCriterio,
}: CriterioFormModalProps) {
  return (
      <Modal
        open={criterioForm !== null}
        onClose={() => setCriterioForm(null)}
        title={criterioForm?.criterioKey ? 'Editar criterio' : 'Agregar criterio'}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Aspecto: <span className="font-medium text-gray-700">
              {draft.find((a) => a.key === criterioForm?.aspectoKey)?.nombre}
            </span>
          </p>

          <Input
            label="Descripción del criterio"
            value={criterioForm?.texto ?? ''}
            onChange={(event) => setCriterioForm((prev) => (prev ? { ...prev, texto: event.target.value } : prev))}
            placeholder="Ej: Identifica y formula claramente el problema de ingeniería..."
            autoFocus
          />

          <Input
            label="Peso (%)"
            type="number"
            min={0.01}
            max={100}
            step="0.01"
            value={criterioForm?.peso ?? ''}
            onChange={(event) => setCriterioForm((prev) => (prev ? { ...prev, peso: event.target.value } : prev))}
            placeholder="20"
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCriterioForm(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitCriterio} className="bg-[#9E0B0F] hover:bg-[#82090d]">
              {criterioForm?.criterioKey ? 'Aplicar' : 'Agregar'}
            </Button>
          </div>
        </div>
      </Modal>
  );
}
