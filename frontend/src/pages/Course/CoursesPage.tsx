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
} from 'lucide-react';


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

  const handleEdit = (course: Curso) => {
    setSelectedCourse(course.id);
    navigate(`/cursos/${course.id}`);
  };

  const handleArchive = async (course: Curso) => {
    if (selectedCourseId !== course.id) {
      return;
    }

    const confirmed = window.confirm(
      `¿Deseas cerrar la asignatura "${course.nombre}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await cursosApi.archivar(course.id);

      await loadCourses();
    } catch (error) {
      console.error('Error cerrando asignatura:', error);
      window.alert('No fue posible cerrar la asignatura.');
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
          {selectedCourseId === course.id && (
            <span className="mt-1 inline-flex text-xs font-medium text-[#9E0B0F]">
              Seleccionada
            </span>
          )}
        </div>
      ),
    },
    { key: 'creditos', label: 'Crédito(s)', align: 'center', render: () => '—' },
    { key: 'semestre', label: 'Semestre', align: 'center', render: () => '—' },
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
      render: (course) => {
        const isSelected = selectedCourseId === course.id;

        return (
          <div className="flex items-center justify-center gap-2">
            <TableActionButton
              title={isSelected ? 'Ver información completa' : 'Ver información básica'}
              onClick={() => handleView(course)}
              icon={<Eye size={12} />}
            >
              Ver
            </TableActionButton>

            <TableActionButton
              title={isSelected ? 'Editar asignatura' : 'Selecciona esta asignatura en el Dashboard para editarla'}
              onClick={() => handleEdit(course)}
              className={!isSelected ? 'cursor-not-allowed opacity-50' : ''}
              disabled={!isSelected}
              icon={<Pencil size={12} />}
            >
              Editar
            </TableActionButton>

            <TableActionButton
              title={isSelected ? 'Cerrar asignatura' : 'Selecciona esta asignatura en el Dashboard para cerrarla'}
              onClick={() => handleArchive(course)}
              className={!isSelected ? 'cursor-not-allowed opacity-50' : ''}
              disabled={!isSelected}
              icon={<Trash2 size={12} />}
            >
              Eliminar
            </TableActionButton>
          </div>
        );
      },
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

          <button
            type="button"
            onClick={() => setShowFilter((value) => !value)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              showFilter
                ? 'border-[#9E0B0F] bg-[#9E0B0F]/5 text-[#9E0B0F]'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter size={17} />
            Filtrar
          </button>
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

        {selectedCourseId !== null && (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#9E0B0F]/20 bg-[#9E0B0F]/5 px-4 py-3">
            <BookOpen size={18} className="shrink-0 text-[#9E0B0F]" />
            <p className="text-sm text-gray-700">
              La asignatura seleccionada para trabajar es{' '}
              <strong>{courses.find((course) => course.id === selectedCourseId)?.nombre ?? '—'}</strong>.
              Solo esta asignatura puede editarse o cerrarse.
            </p>
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
    </AppLayout>
  );
}