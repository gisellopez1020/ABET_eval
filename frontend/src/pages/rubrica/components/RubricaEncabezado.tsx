import { useNavigate } from 'react-router-dom';
import { Plus, Save, Upload } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Actividad, Curso } from '../../../types';

interface RubricaEncabezadoProps {
  selectedActividad: Actividad | null;
  selectedCurso: Curso | null;
  selectedCursoId: number | null;
  bloqueada: boolean;
  /** Con cambios sin guardar, "Volver al curso" espera a que se confirme el descarte */
  requestDiscard: (accion: () => void) => void;
  openAspectoModal: () => void;
  openImportModal: (formato: 'csv' | 'excel') => void;
  saveRubrica: () => void;
  saving: boolean;
  canSave: boolean;
}

// Título, actividad activa y acciones de la rúbrica (volver, agregar, importar, guardar)
export function RubricaEncabezado({
  selectedActividad,
  selectedCurso,
  selectedCursoId,
  bloqueada,
  requestDiscard,
  openAspectoModal,
  openImportModal,
  saveRubrica,
  saving,
  canSave,
}: RubricaEncabezadoProps) {
  const navigate = useNavigate();

  return (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Rúbricas y Criterios ABET</h1>
              <p className="mt-1 text-sm text-gray-500">
                {selectedActividad
                  ? `${selectedCurso ? `${selectedCurso.nombre} · ` : ''}Actividad: ${selectedActividad.nombre}`
                  : 'Sin actividad activa'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCursoId && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => requestDiscard(() => navigate(`/cursos/${selectedCursoId}`))}
                >
                  ← Volver al curso
                </Button>
              )}
              <Button
                variant="outline"
                size="md"
                icon={<Plus size={16} />}
                onClick={() => openAspectoModal()}
                disabled={!selectedActividad || bloqueada}
              >
                Agregar aspecto
              </Button>
              <Button
                variant="outline"
                size="md"
                icon={<Upload size={16} />}
                onClick={() => openImportModal('csv')}
                disabled={!selectedActividad || bloqueada}
              >
                Importar CSV
              </Button>
              <Button
                variant="outline"
                size="md"
                icon={<Upload size={16} />}
                onClick={() => openImportModal('excel')}
                disabled={!selectedActividad || bloqueada}
              >
                Importar Excel
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Save size={16} />}
                className="rounded-xl bg-[#9E0B0F] hover:bg-[#82090d]"
                onClick={saveRubrica}
                loading={saving}
                disabled={!canSave}
                title={
                  bloqueada
                    ? 'La actividad ya tiene calificaciones: la rúbrica no se puede reemplazar'
                    : canSave
                      ? undefined
                      : 'La rúbrica debe sumar exactamente 100% y tener cambios sin guardar'
                }
              >
                Guardar rúbrica
              </Button>
            </div>
          </div>
  );
}
