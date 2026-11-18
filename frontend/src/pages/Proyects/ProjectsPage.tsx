
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AppLayout } from '../../components/Layout/AppLayout';
import { cursosApi } from '../../api/cursos';
import { actividadesApi } from '../../api/actividades';
import { equiposApi } from '../../api/equipos';
import { apiErrorMessage } from '../../api/errors';
import { useCourseStore } from '../../store/courseStore';
import { Curso, aplicaEnSeccion } from '../../types';

import { CreateProjectModal } from '../Proyects/components/CreateProjectModal';
import { DeleteProjectModal } from './components/DeleteProjectModal';
import { EditProjectModal } from './components/EditProjectModal';
import { ProjectDetailDialog } from './components/ProjectDetailDialog';
import { ProjectsList } from './components/ProjectsList';
import { ProjectsToolbar } from './components/ProjectsToolbar';
import { useProjects } from './hooks/useProjects';
import { projectEstado } from './projectEstado';
import { CreateProjectPayload, ProjectRow, ProjectStatusFilter, toProjectRow } from './types';

export function ProjectsPage() {

  const navigate = useNavigate();
  const { selectedCourseId } = useCourseStore();
  // ?actividadId=… (p. ej. desde RubricaPage): usa el curso de esa actividad y la preselecciona al crear equipo
  const [searchParams] = useSearchParams();
  const actividadIdParam = Number(searchParams.get('actividadId')) || null;

  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null);
  // Se abre sobre el detalle: al cerrarse, el detalle sigue ahí con los datos nuevos
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  // Confirmación de eliminar, también sobre el detalle
  const [deletingProject, setDeletingProject] = useState<ProjectRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  // Selección propia de esta pantalla: no escribe en el store del Dashboard
  const [courses, setCourses] = useState<Curso[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [sectionFilter, setSectionFilter] = useState<number | null>(null); // null = Todas
  // null = Todas. Con ?actividadId= empieza en esa actividad; solo filtra mientras esté en
  // filterActivities (ver activeActivity), así que se aplica cuando las actividades terminan de cargar
  const [activityFilter, setActivityFilter] = useState<number | null>(null);

  const { sections, activities, projects, setProjects, loading, setLoading, loadProjects } = useProjects();

  // Con una sección elegida solo se ofrecen las actividades que aplican a ella (como en el
  // backend y en CreateProjectModal): las demás nunca tendrían equipos en esa sección
  const filterActivities = useMemo(
    () => (sectionFilter === null ? activities : activities.filter((a) => aplicaEnSeccion(a, sectionFilter))),
    [activities, sectionFilter]
  );
  // Una actividad que no está en la lista (aún cargando, de otra asignatura o individual) no filtra
  const activeActivity = filterActivities.find((activity) => activity.id === activityFilter) ?? null;

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
        setActivityFilter(actividadIdParam);

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
    // Las secciones y las actividades son de la asignatura anterior: vuelven a "Todas"
    setSectionFilter(null);
    setActivityFilter(null);
    void loadProjects(courseId);
  };

  const handleSectionFilter = (seccionId: number | null) => {
    setSectionFilter(seccionId);
    // Si la actividad elegida no aplica a la nueva sección, vuelve a "Todas las actividades"
    // (si no, reaparecería al volver a "Todas las secciones")
    const actividad = activities.find((activity) => activity.id === activityFilter);
    if (seccionId !== null && actividad && !aplicaEnSeccion(actividad, seccionId)) {
      setActivityFilter(null);
    }
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

      const matchesStatus = statusFilter === 'all' || projectEstado(project) === statusFilter;
      const matchesSection = sectionFilter === null || project.seccionId === sectionFilter;
      const matchesActivity = activeActivity === null || project.actividadId === activeActivity.id;

      return matchesSearch && matchesStatus && matchesSection && matchesActivity;
    });
  }, [projects, search, statusFilter, sectionFilter, activeActivity]);

  // Vacío porque la actividad elegida no tiene equipos (en la sección elegida, si hay una),
  // sin contar búsqueda ni estado. Los demás vacíos conservan el texto general de ProjectsList.
  const emptyMessage = useMemo(() => {
    if (!activeActivity) return undefined;
    const tieneEquipos = projects.some(
      (project) =>
        project.actividadId === activeActivity.id &&
        (sectionFilter === null || project.seccionId === sectionFilter)
    );
    if (tieneEquipos) return undefined;
    const seccion = sections.find((section) => section.id === sectionFilter);
    return {
      title: `La actividad «${activeActivity.nombre}» aún no tiene equipos${seccion ? ` en ${seccion.nombre}` : ''}`,
      hint: 'Créalos con «Nuevo proyecto».',
    };
  }, [activeActivity, projects, sectionFilter, sections]);

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

  const closeDeleteModal = () => {
    // Mientras se elimina, Esc / clic en el fondo no cierran la confirmación
    if (deleteLoading) return;
    setDeletingProject(null);
    setDeleteError('');
  };

  const confirmDeleteProject = async () => {
    if (!deletingProject) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await equiposApi.delete(deletingProject.id);

      // Solo desaparece esta fila: no hace falta recargar todos los equipos
      setProjects((current) => current.filter((item) => item.id !== deletingProject.id));
      setDeletingProject(null);
      setSelectedProject(null);
    } catch (error) {
      // P. ej. 409 si el equipo ya tiene calificaciones: el mensaje del backend tal cual
      setDeleteError(apiErrorMessage(error, 'No se pudo eliminar el equipo.'));
    } finally {
      setDeleteLoading(false);
    }
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

  return (
    <AppLayout>
      <div className="p-6">
        {/* Encabezado */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#9E0B0F]">
              Proyectos
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Gestión de seguimiento de proyectos grupales por
              asignatura
            </p>
          </div>
        </div>


        {/* Barra de herramientas */}
        <ProjectsToolbar
          search={search}
          onSearch={setSearch}
          courses={courses}
          selectedCourse={selectedCourse}
          onCourseChange={handleCourseChange}
          sections={sections}
          sectionFilter={sectionFilter}
          onSectionFilter={handleSectionFilter}
          activities={filterActivities}
          activityFilter={activeActivity?.id ?? null}
          onActivityFilter={setActivityFilter}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          onNew={() => setCreateModalOpen(true)}
        />


        {/* Contenido */}
        <ProjectsList
          loading={loading}
          filteredProjects={filteredProjects}
          openProjectModal={openProjectModal}
          emptyMessage={emptyMessage}
        />
      </div>

      {selectedProject && (
        <ProjectDetailDialog
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onDelete={() => {
            setDeleteError('');
            setDeletingProject(selectedProject);
          }}
          onEdit={() => setEditingProject(selectedProject)}
          onEvaluate={() => {
            setSelectedProject(null);
            handleEvaluateProject(selectedProject);
          }}
        />
      )}

      {/* Modal de edición (sobre el detalle) */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(payload) => handleEditProject(editingProject, payload)}
        />
      )}

      {/* Confirmación de eliminar (sobre el detalle) */}
      <DeleteProjectModal
        project={deletingProject}
        error={deleteError}
        loading={deleteLoading}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteProject}
      />

      {/* Modal de creación */}
      <CreateProjectModal
        open={createModalOpen}
        sections={sections}
        activities={activities}
        // La actividad del filtro y, sin filtro, la de ?actividadId= (como antes)
        initialActividadId={
          activeActivity?.id ??
          (activities.some((activity) => activity.id === actividadIdParam)
            ? actividadIdParam ?? undefined
            : undefined)
        }
        initialSeccionId={sectionFilter ?? undefined}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </AppLayout>
  );
}

export default ProjectsPage;
