import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  BookOpen,
  Users,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

import { AppLayout } from '../../components/Layout/AppLayout';
import { DataTable, DataTableColumn } from '../../components/ui/DataTable';
import { TableActionButton } from '../../components/ui/TableActionButton';

import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';

import { Curso, Seccion } from '../../types';
import { useCourseStore } from '../../store/courseStore';
import { CourseDetailsModal } from './components/CourseDetailsModal';
import { CourseFormModal } from './components/CourseFormModal';

interface CourseStats {
  sections: Seccion[];
  students: number;
}

type StatusFilter = 'todos' | 'activo' | 'cerrado';

export function CoursesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { selectedCourseId, setSelectedCourse } = useCourseStore();

  const [courses, setCourses] = useState<Curso[]>([]);
  const [stats, setStats] = useState<Record<number, CourseStats>>({});

  const [loading, setLoading] = useState(true);
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

  const loadCourses = async () => {
    try {
      setLoading(true);

      const data = await cursosApi.list();

      setCourses(data);

      const statsMap: Record<number, CourseStats> = {};

      await Promise.all(
        data.map(async (course) => {
          try {
            const sections = await seccionesApi.list(course.id);

            let students = 0;

            await Promise.all(
              sections.map(async (section) => {
                try {
                  const sectionStudents = await estudiantesApi.list(
                    section.id
                  );

                  students += sectionStudents.length;
                } catch {
                  
                }
              })
            );

            statsMap[course.id] = {
              sections,
              students,
            };
          } catch {
            statsMap[course.id] = {
              sections: [],
              students: 0,
            };
          }
        })
      );

      setStats(statsMap);
    } catch (error) {
      console.error('Error cargando asignaturas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

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

  const getGroups = (courseId: number) => {
    const courseStats = stats[courseId];

    if (!courseStats || courseStats.sections.length === 0) {
      return '—';
    }

    return courseStats.sections
      .map((section) => section.nombre)
      .join(', ');
  };

  const getStudentCount = (courseId: number) => {
    return stats[courseId]?.students ?? 0;
  };

  const columns: DataTableColumn<Curso>[] = [
    {
      key: 'codigo',
      label: 'Código',
      render: (course) => (
        <span className="font-medium text-gray-900">{course.codigo}</span>
      ),
    },
    {
      key: 'nombre',
      label: 'Nombre',
      render: (course) => (
        <div>
          <p className="font-medium text-gray-900">{course.nombre}</p>
          {/* Solo informativo: no habilita ni deshabilita acciones */}
          {selectedCourseId === course.id && (
            <span
              className="mt-1 inline-flex text-xs font-medium text-[#9E0B0F]"
              title="Asignatura activa en el Dashboard"
            >
              Seleccionada
            </span>
          )}
        </div>
      ),
    },
    { key: 'periodo', label: 'Periodo', align: 'center', render: (course) => course.periodo },
    {
      key: 'grupos',
      label: 'Grupo',
      align: 'center',
      render: (course) => getGroups(course.id),
    },
    {
      key: 'estudiantes',
      label: 'Estudiantes',
      align: 'center',
      render: (course) => (
        <div className="inline-flex items-center justify-center gap-1.5 text-sm text-gray-600">
          <Users size={15} />
          {getStudentCount(course.id)}
        </div>
      ),
    },
    {
      key: 'activo',
      label: 'Estado',
      align: 'center',
      render: (course) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            course.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {course.activo ? 'Activo' : 'Cerrado'}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      align: 'center',
      render: (course) => (
        <div className="flex items-center justify-center gap-2">
          <TableActionButton
            variant="primary"
            title="Ver información"
            onClick={() => handleView(course)}
            icon={<Eye size={12} />}
          >
            Ver
          </TableActionButton>

          <TableActionButton
            variant="default"
            title="Editar asignatura"
            onClick={() => handleEdit(course)}
            icon={<Pencil size={12} />}
          >
            Editar
          </TableActionButton>

          <TableActionButton
            variant="primary"
            title={course.activo ? 'Cerrar asignatura' : 'Reactivar asignatura'}
            onClick={() => handleToggleActivo(course)}
            icon={course.activo ? <Trash2 size={12} /> : <RotateCcw size={12} />}
          >
            {course.activo ? 'Eliminar' : 'Activar'}
          </TableActionButton>
        </div>
      ),
    },
  ];

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

        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código o nombre de asignatura..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
            />
          </div>

          <Button
            variant="secondary"
            size="md"
            icon={<Filter size={17} />}
            onClick={() => setShowFilter((value) => !value)}
          >
            Filtrar
          </Button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9E0B0F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#82090d]"
          >
            <Plus size={18} />
            Nueva asignatura
          </button>
        </div>

        {showFilter && (
          <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-4">
            <button
              type="button"
              onClick={() => setStatusFilter('todos')}
              className={`rounded-lg px-4 py-2 text-sm ${
                statusFilter === 'todos' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('activo')}
              className={`rounded-lg px-4 py-2 text-sm ${
                statusFilter === 'activo' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Activos
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('cerrado')}
              className={`rounded-lg px-4 py-2 text-sm ${
                statusFilter === 'cerrado' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Cerrados
            </button>
          </div>
        )}

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
      <Modal
        open={toggling !== null}
        onClose={closeToggleModal}
        title={toggling?.activo ? 'Cerrar asignatura' : 'Reactivar asignatura'}
      >
        {toggling && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {`¿Deseas ${toggling.activo ? 'cerrar' : 'reactivar'} la asignatura "${toggling.nombre}"?`}
            </p>
            {toggleError && <p className="text-sm text-uao-accent">{toggleError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeToggleModal} disabled={toggleLoading}>
                Cancelar
              </Button>
              <Button
                variant={toggling.activo ? 'danger' : 'primary'}
                onClick={confirmToggleActivo}
                loading={toggleLoading}
              >
                {toggling.activo ? 'Cerrar' : 'Reactivar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}