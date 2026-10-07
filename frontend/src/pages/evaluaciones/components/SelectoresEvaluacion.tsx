import { Actividad, Curso } from '../../../types';
import { ProjectOption } from '../types';

const SELECT_CLASS =
  'w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10 disabled:bg-gray-50';

interface SelectoresEvaluacionProps {
  courses: Curso[];
  curso: Curso | null;
  onCourseChange: (value: string) => void;
  /** Solo actividades grupales */
  activities: Actividad[];
  selectedActivityId: number | null;
  onActivityChange: (value: string) => void;
  projects: ProjectOption[];
  selectedProjectId: number | null;
  onProjectChange: (projectId: number | null) => void;
  loadingCourses: boolean;
  loadingCourse: boolean;
  /** Cualquiera de las tres cargas en curso */
  loading: boolean;
}

// Selectores en cascada: Asignatura -> Actividad grupal -> Proyecto (equipo) a evaluar
export function SelectoresEvaluacion({
  courses,
  curso,
  onCourseChange,
  activities,
  selectedActivityId,
  onActivityChange,
  projects,
  selectedProjectId,
  onProjectChange,
  loadingCourses,
  loadingCourse,
  loading,
}: SelectoresEvaluacionProps) {
  return (
            <div className="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm md:grid-cols-3">
              <label className="w-full text-sm text-gray-700">
                <span className="mb-1 block text-gray-800">Asignatura</span>
                <select
                  value={curso?.id ?? ''}
                  onChange={(event) => onCourseChange(event.target.value)}
                  className={SELECT_CLASS}
                  disabled={loadingCourses || courses.length === 0}
                >
                  {loadingCourses ? (
                    <option value="">Cargando…</option>
                  ) : courses.length === 0 ? (
                    <option value="">Sin asignaturas</option>
                  ) : (
                    courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.nombre} ({course.codigo} · {course.periodo})
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="w-full text-sm text-gray-700">
                <span className="mb-1 block text-gray-800">Actividad</span>
                <select
                  value={selectedActivityId ?? ''}
                  onChange={(event) => onActivityChange(event.target.value)}
                  className={SELECT_CLASS}
                  disabled={loadingCourses || loadingCourse || activities.length === 0}
                >
                  {loadingCourses || loadingCourse ? (
                    <option value="">Cargando…</option>
                  ) : activities.length === 0 ? (
                    <option value="">Sin actividades grupales</option>
                  ) : (
                    activities.map((actividad) => (
                      <option key={actividad.id} value={actividad.id}>
                        {actividad.nombre}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="w-full text-sm text-gray-700">
                <span className="mb-1 block text-gray-800">Proyecto a evaluar</span>
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(event) => onProjectChange(Number(event.target.value) || null)}
                  className={SELECT_CLASS}
                  disabled={loading || projects.length === 0}
                >
                  {loading ? (
                    <option value="">Cargando…</option>
                  ) : projects.length === 0 ? (
                    <option value="">Sin equipos</option>
                  ) : (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.nombre} · {project.seccionNombre}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
  );
}
