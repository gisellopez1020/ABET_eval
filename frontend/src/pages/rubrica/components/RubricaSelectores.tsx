import { Actividad, Curso } from '../../../types';
import { SELECT_CLASS } from './estilos';

interface RubricaSelectoresProps {
  cursos: Curso[];
  actividades: Actividad[];
  selectedCursoId: number | null;
  selectedActividadId: number | null;
  /** La página decide si pide confirmar el descarte de cambios antes de cambiar */
  onCurso: (courseId: number) => void;
  onActividad: (activityId: number) => void;
}

// Selectores de asignatura y actividad de RubricaPage
export function RubricaSelectores({
  cursos,
  actividades,
  selectedCursoId,
  selectedActividadId,
  onCurso,
  onActividad,
}: RubricaSelectoresProps) {
  return (
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Asignatura</span>
              <select
                value={selectedCursoId ?? ''}
                onChange={(event) => {
                  const courseId = Number(event.target.value);
                  if (courseId) onCurso(courseId);
                }}
                className={SELECT_CLASS}
              >
                <option value="">Selecciona una asignatura</option>
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nombre} ({curso.codigo} · {curso.periodo})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Actividad</span>
              <select
                value={selectedActividadId ?? ''}
                onChange={(event) => {
                  const activityId = Number(event.target.value);
                  if (activityId) onActividad(activityId);
                }}
                className={SELECT_CLASS}
              >
                <option value="">Selecciona una actividad</option>
                {actividades.map((actividad) => (
                  <option key={actividad.id} value={actividad.id}>
                    {actividad.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
  );
}
