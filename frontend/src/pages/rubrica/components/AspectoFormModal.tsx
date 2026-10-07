import { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { RaAbet } from '../../../types';
import { AspectoForm, truncar } from '../rubricaDraft';
import { SELECT_CLASS } from './estilos';

interface AspectoFormModalProps {
  /** null = cerrado */
  aspectoForm: AspectoForm | null;
  setAspectoForm: Dispatch<SetStateAction<AspectoForm | null>>;
  /** Bloqueada: el nombre no se edita y "Guardar vínculo" lo guarda al instante */
  bloqueada: boolean;
  catalogo: RaAbet[];
  raicesAbet: RaAbet[];
  descripcionAbet: (codigo: string | null) => string | undefined;
  formError: string;
  vinculando: boolean;
  submitAspecto: () => void;
}

// Agregar / editar un aspecto y su vínculo ABET en dos pasos (RA -> Criterio de Evaluación)
export function AspectoFormModal({
  aspectoForm,
  setAspectoForm,
  bloqueada,
  catalogo,
  raicesAbet,
  descripcionAbet,
  formError,
  vinculando,
  submitAspecto,
}: AspectoFormModalProps) {
  return (
      <Modal
        open={aspectoForm !== null}
        onClose={() => setAspectoForm(null)}
        title={
          bloqueada ? 'Vincular aspecto a Student Outcome' : aspectoForm?.aspectoKey ? 'Editar aspecto' : 'Agregar aspecto'
        }
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <Input
            label="Nombre del aspecto"
            value={aspectoForm?.nombre ?? ''}
            onChange={(event) => setAspectoForm((prev) => (prev ? { ...prev, nombre: event.target.value } : prev))}
            placeholder="Ej: Identificación del problema"
            disabled={bloqueada}
            autoFocus={!bloqueada}
          />

          <div className="space-y-3 rounded-xl border border-gray-200 bg-[#fafafa] p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Vincular a Student Outcome (opcional)</p>
              <p className="text-xs text-gray-500">
                Si el Resultado de Aprendizaje aún no está en la asignatura, se agrega automáticamente al guardar.
              </p>
            </div>

            {catalogo.length === 0 ? (
              <p className="text-sm text-gray-500">
                El catálogo de Student Outcomes está vacío. Créalo o impórtalo en{' '}
                <Link to="/student-outcomes" className="font-medium text-[#9E0B0F] hover:underline">
                  Student Outcomes
                </Link>
                .
              </p>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700">
                  <span className="mb-1 block text-xs">1. Resultado de Aprendizaje</span>
                  <select
                    value={aspectoForm?.raPadre ?? ''}
                    onChange={(event) =>
                      setAspectoForm((prev) =>
                        prev ? { ...prev, raPadre: event.target.value, codigoAbet: null } : prev
                      )
                    }
                    autoFocus={bloqueada}
                    className={SELECT_CLASS}
                  >
                    <option value="">Sin vincular</option>
                    {raicesAbet.map((ra) => (
                      <option key={ra.codigo} value={ra.codigo}>
                        {ra.codigo} — {truncar(ra.descripcion, 80)}
                      </option>
                    ))}
                  </select>
                </label>

                {aspectoForm?.raPadre && (
                  <label className="block text-sm font-medium text-gray-700">
                    <span className="mb-1 block text-xs">2. Criterio de Evaluación</span>
                    <select
                      value={aspectoForm.codigoAbet ?? ''}
                      onChange={(event) =>
                        setAspectoForm((prev) => (prev ? { ...prev, codigoAbet: event.target.value || null } : prev))
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="">Elige un criterio</option>
                      {catalogo
                        .filter((c) => c.codigo_padre === aspectoForm.raPadre)
                        .map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.codigo} — {truncar(c.descripcion, 80)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                {aspectoForm?.codigoAbet && (
                  <p className="rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
                    <span className="font-semibold text-[#9E0B0F]">{aspectoForm.codigoAbet}</span>{' '}
                    {descripcionAbet(aspectoForm.codigoAbet)}
                  </p>
                )}
              </>
            )}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAspectoForm(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submitAspecto}
              loading={vinculando}
              className="bg-[#9E0B0F] hover:bg-[#82090d]"
            >
              {bloqueada ? 'Guardar vínculo' : aspectoForm?.aspectoKey ? 'Aplicar' : 'Agregar'}
            </Button>
          </div>
        </div>
      </Modal>
  );
}
