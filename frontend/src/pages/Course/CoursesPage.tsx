import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { DataTable } from '../../components/ui/DataTable';

import { cursosApi } from '../../api/cursos';

import { Curso } from '../../types';
import { useCourseStore } from '../../store/courseStore';
import { CourseDetailsModal } from './components/CourseDetailsModal';
import { CourseFormModal } from './components/CourseFormModal';
import { CoursesToolbar } from './components/CoursesToolbar';
import { coursesColumns } from './components/coursesColumns';
import { ToggleActivoModal } from './components/ToggleActivoModal';
import { useCoursesData } from './hooks/useCoursesData';
import { StatusFilter } from './types';

export function CoursesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { selectedCourseId, setSelectedCourse } = useCourseStore();

  const { courses, setCourses, stats, loading, loadCourses } = useCoursesData();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('todos');

  const [showFilter, setShowFilter] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [courseToView, setCourseToView] = useState<Curso | null>(null);

  // Asignatura pendiente de cerrar/reactivar (modal de confirmación)
  const [toggling, setToggling] = useState<Curso | null>(null);
  const [toggleError, setToggleError] = useState('');
  const [toggleLoading, setToggleLoading] = useState(false);

  // /cursos/nueva redirige a /cursos?nueva=1: abre el modal y limpia el parámetro
  useEffect(() => {
    if (searchParams.get('nueva') === '1') {
      setShowCreateModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filteredCourses = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return courses.filter((course) => {
      const matchesSearch =
        normalizedSearch === '' ||
        course.nombre.toLowerCase().includes(normalizedSearch) ||
        course.codigo.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'activo' && course.activo) ||
        (statusFilter === 'cerrado' && !course.activo);

      return matchesSearch && matchesStatus;
    });
  }, [courses, search, statusFilter]);

  const handleView = (course: Curso) => {
    setCourseToView(course);
  };

  // Editar/cerrar no dependen ni cambian la asignatura activa del Dashboard (selectedCourseId)
  const handleEdit = (course: Curso) => {
    navigate(`/cursos/${course.id}`);
  };

  // Activa: cierra (archivar). Cerrada: la reactiva.
  const handleToggleActivo = (course: Curso) => {
    setToggling(course);
    setToggleError('');
  };

  const closeToggleModal = () => {
    // Mientras la petición está en curso, Esc / clic en el fondo no cierran el modal
    if (toggleLoading) return;
    setToggling(null);
    setToggleError('');
  };

  const confirmToggleActivo = async () => {
    if (!toggling) return;
    const course = toggling;
    const accion = course.activo ? 'cerrar' : 'reactivar';
    setToggleLoading(true);
    setToggleError('');

    try {
      if (course.activo) {
        await cursosApi.archivar(course.id);
      } else {
        await cursosApi.activar(course.id);
      }

      await loadCourses();
      setToggling(null);
    } catch (error) {
      console.error(`Error al ${accion} la asignatura:`, error);
      setToggleError(`No fue posible ${accion} la asignatura.`);
    } finally {
      setToggleLoading(false);
    }
  };

  // La validación, el POST y los errores viven en CourseFormModal
  const handleCourseCreated = (createdCourse: Curso) => {
    setCourses((prev) => [createdCourse, ...prev]);
    setSelectedCourse(createdCourse.id);
    setShowCreateModal(false);
    setSearch('');
    setStatusFilter('todos');
  };

  const columns = coursesColumns({
    stats,
    selectedCourseId,
    onView: handleView,
    onEdit: handleEdit,
    onToggleActivo: handleToggleActivo,
  });

  return (
    <AppLayout>
      <main className="p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Asignaturas</h1>
            <p className="mt-1 text-sm text-gray-500">
              {courses.length}{' '}
              {courses.length === 1 ? 'asignatura registrada' : 'asignaturas registradas'}
            </p>
          </div>
        </div>

        <CoursesToolbar
          search={search}
          onSearch={setSearch}
          showFilter={showFilter}
          onToggleFilter={() => setShowFilter((value) => !value)}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          onNew={() => setShowCreateModal(true)}
        />

        <DataTable
          columns={columns}
          data={loading ? [] : filteredCourses}
          getRowKey={(course) => course.id}
          empty={
            <div className="flex flex-col items-center">
              <BookOpen size={38} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">No se encontraron asignaturas</p>
              <p className="mt-1 text-sm text-gray-500">Intenta cambiar la búsqueda o el filtro.</p>
            </div>
          }
        />
      </main>

      {courseToView && (
        <CourseDetailsModal
          course={courseToView}
          stats={stats[courseToView.id] ?? { sections: [], students: 0 }}
          onClose={() => setCourseToView(null)}
          onEdit={handleEdit}
        />
      )}

      <CourseFormModal
        open={showCreateModal}
        mode="create"
        onClose={() => setShowCreateModal(false)}
        onSaved={handleCourseCreated}
      />

      {/* Modal cerrar / reactivar */}
      <ToggleActivoModal
        toggling={toggling}
        error={toggleError}
        loading={toggleLoading}
        onClose={closeToggleModal}
        onConfirm={confirmToggleActivo}
      />
    </AppLayout>
  );
}
