
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Filter,
  FolderKanban,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi } from '../../api/actividades';
import { equiposApi } from '../../api/equipos';
import { useCourseStore } from '../../store/courseStore';
import {
  Actividad,
  Curso,
  EquipoTrabajo,
  Seccion,
} from '../../types';

import { ProjectCard } from './components/ProjectCard';
import { CreateProjectModal } from '../Proyects/components/CreateProjectModal';
import { EditProjectModal } from './components/EditProjectModal';

export interface ProjectRow {
  id: number;
  nombre: string;
  cursoId: number;
  cursoNombre: string;
  seccionId: number;
  seccionNombre: string;
  actividadId: number;
  actividadNombre: string;
  miembros: string[];
  /** Para precargar la edición del equipo con sus integrantes actuales. */
  miembroIds: number[];
  avance: number;
  calificado: boolean;
  notaTotal: number | null;
}

interface CreateProjectPayload {
  nombre: string;
  seccionId: number;
  actividadId: number;
  estudianteIds: number[];
}

// Fila de la lista a partir de un equipo: la usan la carga y la edición, así el avance
// se calcula igual en ambas
function toProjectRow(
  team: EquipoTrabajo,
  context: Pick<ProjectRow, 'cursoId' | 'cursoNombre' | 'seccionId' | 'seccionNombre' | 'actividadId' | 'actividadNombre'>
): ProjectRow {
  const members = team.miembros.map(
    (member) => member.nombre_completo
  );

  const avance = team.calificado
    ? 100
    : Math.max(
        25,
        Math.min(90, members.length * 20)
      );

  return {
    id: team.id,
    nombre: team.nombre,
    // Campo a campo: al editar, context es la fila anterior y no debe pisar nada más
    cursoId: context.cursoId,
    cursoNombre: context.cursoNombre,
    seccionId: context.seccionId,
    seccionNombre: context.seccionNombre,
    actividadId: context.actividadId,
    actividadNombre: context.actividadNombre,
    miembros: members,
    miembroIds: team.miembros.map((member) => member.id),
    avance,
    calificado: team.calificado,
    notaTotal: team.nota_total,
  };
}

export function ProjectsPage() {

  const navigate = useNavigate();
  const { selectedCourseId } = useCourseStore();
  // ?actividadId=… (p. ej. desde RubricaPage): usa el curso de esa actividad y la preselecciona al crear equipo
  const [searchParams] = useSearchParams();
  const actividadIdParam = Number(searchParams.get('actividadId')) || null;

  const [sections, setSections] = useState<Seccion[]>([]);
  const [activities, setActivities] = useState<Actividad[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null);
  // Se abre sobre el detalle: al cerrarse, el detalle sigue ahí con los datos nuevos
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const detalleTitleId = useId();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendiente' | 'en-evaluacion' | 'evaluado'>('all');
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  // Selección propia de esta pantalla: no escribe en el store del Dashboard
  const [courses, setCourses] = useState<Curso[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [sectionFilter, setSectionFilter] = useState<number | null>(null); // null = Todas

  // Solo la última carga escribe el estado: si se cambia de asignatura mientras otra
  // carga sigue en curso, su respuesta (más lenta) se descarta.
  const loadRequest = useRef(0);

  const loadProjects = async (courseId: number | null) => {
    const request = ++loadRequest.current;
    const isStale = () => request !== loadRequest.current;

    if (!courseId) {
      setProjects([]);
      setSections([]);
      setActivities([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [courseList, courseSections, courseActivities] =
        await Promise.all([
          cursosApi.list(),
          seccionesApi.list(courseId),
          actividadesApi.list(courseId),
        ]);

      if (isStale()) return;

      const groupedActivities = courseActivities.filter(
        (activity) => activity.tipo === 'grupal'
      );

      const currentCourse = courseList.find(
        (course) => course.id === courseId
      );

      setSections(courseSections);
      setActivities(groupedActivities);

      if (groupedActivities.length === 0) {
        setProjects([]);
        return;
      }

      const projectResults: ProjectRow[] = [];

      for (const activity of groupedActivities) {
        for (const section of courseSections) {
          const teams = await equiposApi.list(
            activity.id,
            section.id
          );

          for (const team of teams) {
            projectResults.push(
              toProjectRow(team, {
                cursoId: courseId,
                cursoNombre: currentCourse?.nombre ?? 'Asignatura',
                seccionId: section.id,
                seccionNombre: section.nombre,
                actividadId: activity.id,
                actividadNombre: activity.nombre,
              })
            );
          }
        }
      }

      if (isStale()) return;

      setProjects(projectResults);
    } catch (error) {
      if (isStale()) return;
      console.error('Error cargando proyectos:', error);

      setProjects([]);
      setSections([]);
      setActivities([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialCourse = async () => {
      try {
        const courseList = await cursosApi.list();
        setCourses(courseList);

        let effectiveCourseId =
          selectedCourseId ??
          courseList[0]?.id ??
          null;

        if (actividadIdParam) {
          try {
            const actividad = await actividadesApi.get(actividadIdParam);
            effectiveCourseId = actividad.curso_id;
          } catch (error) {
            console.error('Actividad de la URL no disponible:', error);
          }
        }

        setSelectedCourse(effectiveCourseId);
        setSectionFilter(null);

        await loadProjects(effectiveCourseId);
      } catch (error) {
        console.error('Error cargando asignaturas:', error);
        setLoading(false);
      }
    };

    void loadInitialCourse();
  }, [selectedCourseId, actividadIdParam]);

  const handleCourseChange = (value: string) => {
    const courseId = value ? Number(value) : null;
    setSelectedCourse(courseId);
    // Las secciones son de la asignatura anterior: vuelve a "Todas"
    setSectionFilter(null);
    void loadProjects(courseId);
  };

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesSearch = !normalizedSearch || [
        project.nombre,
        project.actividadNombre,
        project.seccionNombre,
      ].some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );

      const estado = project.calificado
        ? 'evaluado'
        : project.avance >= 50
          ? 'en-evaluacion'
          : 'pendiente';

      const matchesStatus = statusFilter === 'all' || estado === statusFilter;
      const matchesSection = sectionFilter === null || project.seccionId === sectionFilter;

      return matchesSearch && matchesStatus && matchesSection;
    });
  }, [projects, search, statusFilter, sectionFilter]);

  const handleCreateProject = async (
    payload: CreateProjectPayload
  ) => {
    // Los errores se propagan: CreateProjectModal los muestra y no se cierra
    if (!payload.seccionId || !payload.actividadId) {
      throw new Error('Selecciona la sección y la actividad.');
    }

    await equiposApi.create(
      payload.actividadId,
      payload.seccionId,
      [
        {
          nombre: payload.nombre,
          estudiante_ids: payload.estudianteIds,
        },
      ]
    );

    if (selectedCourse) {
      await loadProjects(selectedCourse);
    }

    setCreateModalOpen(false);
  };

  const handleEditProject = async (
    project: ProjectRow,
    payload: { nombre: string; estudianteIds: number[] }
  ) => {
    // Los errores se propagan: EditProjectModal los muestra y no se cierra
    const team = await equiposApi.update(project.id, {
      nombre: payload.nombre,
      estudiante_ids: payload.estudianteIds,
    });

    // Solo cambia esta fila: no hace falta recargar todos los equipos
    const updated = toProjectRow(team, project);
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
    setSelectedProject((current) =>
      current?.id === updated.id ? updated : current
    );
  };

  const openProjectModal = (project: ProjectRow) => {
    setSelectedProject(project);
  };

  const handleEvaluateProject = (project: ProjectRow) => {
    const params = new URLSearchParams({
      cursoId: String(project.cursoId),
      actividadId: String(project.actividadId),
      seccionId: String(project.seccionId),
      projectId: String(project.id),
    });

    navigate(`/evaluaciones?${params.toString()}`);
  };

  const noProjects =
    !loading && filteredProjects.length === 0;

  return (
    <AppLayout>
      <div className="p-6">
        {/* Encabezado */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Proyectos
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Gestión de seguimiento de proyectos grupales por
              asignatura
            </p>
          </div>
        </div>


        {/* Barra de herramientas */}
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Búsqueda */}
        <div className="relative flex-1">
            <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar proyecto..."
            className="
                w-full rounded-xl border border-gray-200
                bg-white py-2.5 pl-10 pr-4
                text-sm text-gray-700 shadow-sm
                outline-none transition
                focus:border-[#9E0B0F]
                focus:ring-2 focus:ring-[#9E0B0F]/10
            "
            />
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row">
            {/* Asignatura */}
            <div
            className="
                flex h-10 min-w-[220px] items-center gap-2
                rounded-xl border border-gray-200
                bg-white px-3
                text-sm text-gray-700 shadow-sm
                transition
                hover:border-[#9E0B0F]
                focus-within:border-[#9E0B0F]
                focus-within:ring-2
                focus-within:ring-[#9E0B0F]/10
            "
            >
            <label
                htmlFor="course-select"
                className="shrink-0 text-gray-500"
            >
                Asignatura
            </label>

            <select
                id="course-select"
                value={selectedCourse ?? ''}
                onChange={(event) => handleCourseChange(event.target.value)}
                className="
                min-w-0 flex-1
                bg-transparent
                text-sm text-gray-700
                outline-none
                "
            >
                {courses.length === 0 && <option value="">Sin asignaturas</option>}
                {courses.map((course) => (
                <option key={course.id} value={course.id}>
                    {course.nombre} ({course.codigo} · {course.periodo})
                </option>
                ))}
            </select>
            </div>

            {/* Sección */}
            <div
            className="
                flex h-10 min-w-[220px] items-center gap-2
                rounded-xl border border-gray-200
                bg-white px-3
                text-sm text-gray-700 shadow-sm
                transition
                hover:border-[#9E0B0F]
                focus-within:border-[#9E0B0F]
                focus-within:ring-2
                focus-within:ring-[#9E0B0F]/10
            "
            >
            <label
                htmlFor="section-select"
                className="shrink-0 text-gray-500"
            >
                Sección
            </label>

            <select
                id="section-select"
                value={sectionFilter ?? ''}
                onChange={(event) =>
                setSectionFilter(event.target.value ? Number(event.target.value) : null)
                }
                className="
                min-w-0 flex-1
                bg-transparent
                text-sm text-gray-700
                outline-none
                "
            >
                <option value="">Todas las secciones</option>
                {sections.map((section) => (
                <option key={section.id} value={section.id}>
                    {section.nombre}
                </option>
                ))}
            </select>
            </div>

            {/* Estado */}
            <div
            className="
                flex h-10 min-w-[220px] items-center gap-2
                rounded-xl border border-gray-200
                bg-white px-3
                text-sm text-gray-700 shadow-sm
                transition
                hover:border-[#9E0B0F]
                focus-within:border-[#9E0B0F]
                focus-within:ring-2
                focus-within:ring-[#9E0B0F]/10
            "
            >
            <label
                htmlFor="status-select"
                className="shrink-0 text-gray-500"
            >
                Estado
            </label>

            <select
                id="status-select"
                value={statusFilter}
                onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | 'pendiente' | 'en-evaluacion' | 'evaluado')
                }
                className="
                min-w-0 flex-1
                bg-transparent
                text-sm text-gray-700
                outline-none
                "
            >
                <option value="all">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="en-evaluacion">En evaluación</option>
                <option value="evaluado">Evaluado</option>
            </select>
            </div>

            {/* Filtrar */}
            <Button
            variant="outline"
            size="md"
            className="rounded-xl"
            >
            <Filter size={16} />
            Filtrar
            </Button>

            {/* Nuevo proyecto */}
            <Button
            variant="primary"
            size="md"
            onClick={() => setCreateModalOpen(true)}
            className="rounded-xl whitespace-nowrap"
            >
            <Plus size={16} />
            Nuevo proyecto
            </Button>
        </div>
        </div>


        {/* Contenido */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="
                  rounded-2xl border border-gray-200
                  bg-white p-5 shadow-sm
                "
              >
                <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />

                <div className="mt-4 h-3 w-full animate-pulse rounded bg-gray-100" />

                <div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : noProjects ? (
          <div
            className="
              rounded-2xl border 
              border-gray-300 bg-white
              p-10 text-center shadow-sm
            "
          >
            <FolderKanban
              size={42}
              className="mx-auto mb-3 text-gray-300"
            />

            <p className="text-base font-semibold text-gray-700">
              No hay proyectos disponibles
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Crea un equipo o una actividad grupal para ver
              los proyectos aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenDetails={openProjectModal}
              />
            ))}
          </div>
        )}
      </div>

      {selectedProject && (
        <Dialog
          open
          onClose={() => setSelectedProject(null)}
          labelledBy={detalleTitleId}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          panelClassName="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 id={detalleTitleId} className="text-2xl font-semibold text-gray-900">Detalle del Proyecto</h3>
            <button
              type="button"
              onClick={() => setSelectedProject(null)}
              className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${
                selectedProject.calificado
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : selectedProject.avance >= 50
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {selectedProject.calificado
                ? 'Evaluado'
                : selectedProject.avance >= 50
                  ? 'En evaluación'
                  : 'Pendiente'}
            </span>

            <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-700">
              {selectedProject.seccionNombre}
            </span>
          </div>

          <h4 className="mb-3 text-3xl font-bold leading-tight text-gray-900">
            {selectedProject.nombre}
          </h4>

          <p className="mb-5 text-base text-gray-700">
            Curso: {selectedProject.cursoNombre} · Actividad: {selectedProject.actividadNombre}
          </p>

          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h5 className="mb-3 text-lg font-semibold text-gray-800">Integrantes del grupo</h5>
            <div className="space-y-2">
              {selectedProject.miembros.length > 0 ? (
                selectedProject.miembros.map((member, index) => (
                  <div
                    key={`${member}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#9E0B0F] text-xs font-bold text-white">
                      {member
                        .split(' ')
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? '')
                        .join('') || 'U'}
                    </span>
                    <span className="text-base font-medium text-gray-800">{member}</span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-gray-500">Sin miembros asociados</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSelectedProject(null)}>
              Cerrar
            </Button>
            <Button variant="outline" onClick={() => setEditingProject(selectedProject)}>
              <Pencil size={16} />
              Editar equipo
            </Button>
            <Button variant="primary" onClick={() => {
              setSelectedProject(null);
              handleEvaluateProject(selectedProject);
            }}>
              Evaluar Proyecto
            </Button>
          </div>
        </Dialog>
      )}

      {/* Modal de edición (sobre el detalle) */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(payload) => handleEditProject(editingProject, payload)}
        />
      )}

      {/* Modal de creación */}
      <CreateProjectModal
        open={createModalOpen}
        sections={sections}
        activities={activities}
        initialActividadId={
          activities.some((activity) => activity.id === actividadIdParam)
            ? actividadIdParam ?? undefined
            : undefined
        }
        initialSeccionId={sectionFilter ?? undefined}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </AppLayout>
  );
}

export default ProjectsPage;
