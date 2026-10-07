import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCheck, PencilLine } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { cursosApi } from '../../api/cursos';
import { useCourseStore } from '../../store/courseStore';
import { EvaluacionVacia } from './components/EvaluacionVacia';
import { ResumenEquipo } from './components/ResumenEquipo';
import { RubricaEquipo } from './components/RubricaEquipo';
import { SelectoresEvaluacion } from './components/SelectoresEvaluacion';
import { useSeleccionEvaluacion } from './hooks/useSeleccionEvaluacion';

export default function EvaluacionesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCourseId } = useCourseStore();

  const {
    courses,
    setCourses,
    curso,
    activities,
    selectedActivityId,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadingCourses,
    setLoadingCourses,
    loadingCourse,
    loading,
    loadError,
    setLoadError,
    aspectos,
    valores,
    selectCourse,
    handleCourseChange,
    handleActivityChange,
  } = useSeleccionEvaluacion();

  // Carga inicial: ?cursoId, si no la asignatura activa del Dashboard, si no la primera.
  // ?actividadId y ?projectId (desde "Evaluar Proyecto" en ProjectsPage) solo aplican aquí.
  useEffect(() => {
    let cancelado = false;

    const loadCourses = async () => {
      setLoadingCourses(true);
      try {
        const lista = await cursosApi.list();
        if (cancelado) return;
        setCourses(lista);

        const cursoParam = Number(searchParams.get('cursoId')) || null;
        const inicial =
          lista.find((c) => c.id === cursoParam) ??
          lista.find((c) => c.id === selectedCourseId) ??
          lista[0] ??
          null;

        void selectCourse(inicial, {
          actividadId: Number(searchParams.get('actividadId')) || undefined,
          projectId: Number(searchParams.get('projectId')) || undefined,
        });
      } catch (error) {
        if (cancelado) return;
        console.error('Error cargando asignaturas:', error);
        setLoadError('No se pudieron cargar las asignaturas.');
      } finally {
        if (!cancelado) setLoadingCourses(false);
      }
    };

    void loadCourses();

    return () => {
      cancelado = true;
    };
  }, [searchParams, selectedCourseId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  return (
    <AppLayout>
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-[1400px] p-0 shadow-sm">
          <div className="px-5 py-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Módulo de Evaluación</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {curso
                    ? `Evaluación bajo los criterios ABET del curso ${curso.nombre}`
                    : loadingCourses
                      ? 'Cargando proyectos...'
                      : 'Selecciona una asignatura para evaluar sus proyectos.'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate('/proyectos')}>
                ← Volver
              </Button>
            </div>

            <SelectoresEvaluacion
              courses={courses}
              curso={curso}
              onCourseChange={handleCourseChange}
              activities={activities}
              selectedActivityId={selectedActivityId}
              onActivityChange={handleActivityChange}
              projects={projects}
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
              loadingCourses={loadingCourses}
              loadingCourse={loadingCourse}
              loading={loading}
            />

            {!loading && selectedProject && (
              <>
                <div className="mb-5 inline-flex rounded-lg border border-[#e5e7eb] bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md bg-[#9E0B0F] px-4 py-2 text-sm font-medium text-white shadow-sm"
                  >
                    <CheckCheck size={15} />
                    Evaluación Grupal
                  </button>

                  {/* Pendiente de construir: hoy esta pantalla solo carga actividades grupales */}
                  <button
                    type="button"
                    disabled
                    title="Próximamente. Las actividades individuales se califican desde “Ir a calificar” de cada actividad."
                    className="flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-gray-400"
                  >
                    <PencilLine size={15} />
                    Evaluación Individual
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Próximamente
                    </span>
                  </button>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.6fr_0.7fr]">
                  <RubricaEquipo aspectos={aspectos} valores={valores} />

                  <ResumenEquipo
                    project={selectedProject}
                    aspectos={aspectos}
                    valores={valores}
                    onIrACalificar={() =>
                      navigate(
                        `/actividades/${selectedProject.actividadId}/calificar/${selectedProject.seccionId}`
                      )
                    }
                  />
                </div>
              </>
            )}

            {!loading && !selectedProject && (
              <EvaluacionVacia
                loadError={loadError}
                sinAsignaturas={courses.length === 0}
                sinActividades={activities.length === 0}
                onCrearEquipos={() => navigate(`/proyectos?actividadId=${selectedActivityId}`)}
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
