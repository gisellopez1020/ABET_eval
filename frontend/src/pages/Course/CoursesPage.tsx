import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  Filter,
  BookOpen,
  Users,
  X,
} from 'lucide-react';


import { AppLayout } from '../../components/Layout/AppLayout';

import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';

import { Curso, Seccion } from '../../types';
import { useCourseStore } from '../../store/courseStore';

interface CourseStats {
  sections: Seccion[];
  students: number;
}

type StatusFilter = 'todos' | 'activo' | 'cerrado';

export function CoursesPage() {
  const navigate = useNavigate();

  const { selectedCourseId, setSelectedCourse } = useCourseStore();

  const [courses, setCourses] = useState<Curso[]>([]);
  const [stats, setStats] = useState<Record<number, CourseStats>>({});

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('todos');

  const [showFilter, setShowFilter] = useState(false);

  const [viewCourse, setViewCourse] = useState<Curso | null>(null);

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
  
    if (selectedCourseId === course.id) {
      navigate(`/cursos/${course.id}`);
      return;
    }

    setViewCourse(course);
  };

  const handleEdit = (course: Curso) => {
    if (selectedCourseId !== course.id) {
      return;
    }

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

  return (
    <AppLayout>

      <main className="p-6">
        {/* Encabezado */}
        <div className=" mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Asignaturas
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              {courses.length}{' '}
              {courses.length === 1
                ? 'asignatura registrada'
                : 'asignaturas registradas'}
            </p>
          </div>
        </div>

        {/* Barra de búsqueda y filtros */}
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
            onClick={() => navigate('/cursos/nueva')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9E0B0F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#82090d]"
          >
            <Plus size={18} />
            Nueva asignatura
          </button>
        </div>

        {/* Filtro de estado */}
        {showFilter && (
          <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-4">
            <button
              type="button"
              onClick={() => setStatusFilter('todos')}
              className={`rounded-lg px-4 py-2 text-sm ${
                statusFilter === 'todos'
                  ? 'bg-[#9E0B0F] text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('activo')}
              className={`rounded-lg px-4 py-2 text-sm ${
                statusFilter === 'activo'
                  ? 'bg-[#9E0B0F] text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Activos
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('cerrado')}
              className={`rounded-lg px-4 py-2 text-sm ${
                statusFilter === 'cerrado'
                  ? 'bg-[#9E0B0F] text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Cerrados
            </button>
          </div>
        )}

        {/* Información de selección */}
        {selectedCourseId !== null && (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#9E0B0F]/20 bg-[#9E0B0F]/5 px-4 py-3">
            <BookOpen
              size={18}
              className="shrink-0 text-[#9E0B0F]"
            />

            <p className="text-sm text-gray-700">
              La asignatura seleccionada para trabajar es{' '}
              <strong>
                {courses.find(
                  (course) => course.id === selectedCourseId
                )?.nombre ?? '—'}
              </strong>
              . Solo esta asignatura puede editarse o cerrarse.
            </p>
          </div>
        )}

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Código
                  </th>

                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Nombre
                  </th>

                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Crédito(s)
                  </th>

                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Semestre
                  </th>

                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Grupo
                  </th>

                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Estudiantes
                  </th>

                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Estado
                  </th>

                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-sm text-gray-500"
                    >
                      Cargando asignaturas...
                    </td>
                  </tr>
                ) : filteredCourses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center"
                    >
                      <div className="flex flex-col items-center">
                        <BookOpen
                          size={38}
                          className="mb-3 text-gray-300"
                        />

                        <p className="text-sm font-medium text-gray-700">
                          No se encontraron asignaturas
                        </p>

                        <p className="mt-1 text-sm text-gray-500">
                          Intenta cambiar la búsqueda o el filtro.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCourses.map((course) => {
                    const isSelected =
                      selectedCourseId === course.id;

                    return (
                      <tr
                        key={course.id}
                        className={`transition ${
                          isSelected
                            ? 'bg-[#9E0B0F]/5'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-5 py-4">
                          <span className="font-medium text-gray-900">
                            {course.codigo}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div>
                            <p className="font-medium text-gray-900">
                              {course.nombre}
                            </p>

                            {isSelected && (
                              <span className="mt-1 inline-flex text-xs font-medium text-[#9E0B0F]">
                                Seleccionada
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-center text-sm text-gray-500">
                          —
                        </td>

                        <td className="px-5 py-4 text-center text-sm text-gray-500">
                          —
                        </td>

                        <td className="px-5 py-4 text-center text-sm text-gray-600">
                          {getGroups(course.id)}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <div className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                            <Users size={15} />
                            {getStudentCount(course.id)}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              course.activo
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {course.activo ? 'Activo' : 'Cerrado'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1">
                            {/* Ver */}
                            <button
                              type="button"
                              title={
                                isSelected
                                  ? 'Ver información completa'
                                  : 'Ver información básica'
                              }
                              onClick={() => handleView(course)}
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                            >
                              <Eye size={17} />
                            </button>

                            {/* Editar */}
                            <button
                              type="button"
                              title={
                                isSelected
                                  ? 'Editar asignatura'
                                  : 'Selecciona esta asignatura en el Dashboard para editarla'
                              }
                              disabled={!isSelected}
                              onClick={() => handleEdit(course)}
                              className={`rounded-lg p-2 transition ${
                                isSelected
                                  ? 'text-gray-500 hover:bg-gray-100 hover:text-[#9E0B0F]'
                                  : 'cursor-not-allowed text-gray-300'
                              }`}
                            >
                              <Pencil size={17} />
                            </button>

                            {/* Eliminar / cerrar */}
                            <button
                              type="button"
                              title={
                                isSelected
                                  ? 'Cerrar asignatura'
                                  : 'Selecciona esta asignatura en el Dashboard para cerrarla'
                              }
                              disabled={!isSelected}
                              onClick={() => handleArchive(course)}
                              className={`rounded-lg p-2 transition ${
                                isSelected
                                  ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
                                  : 'cursor-not-allowed text-gray-300'
                              }`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal de información básica */}
      {viewCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Información de la asignatura
                </h2>

                <p className="text-sm text-gray-500">
                  Información básica
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewCourse(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <p className="text-xs font-medium uppercase text-gray-400">
                  Código
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {viewCourse.codigo}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400">
                  Nombre
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {viewCourse.nombre}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400">
                  Periodo
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {viewCourse.periodo}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400">
                  Estado
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {viewCourse.activo ? 'Activo' : 'Cerrado'}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400">
                  Resultado de aprendizaje ABET
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {viewCourse.ra_abet.length > 0 ? (
                    viewCourse.ra_abet.map((ra) => (
                      <span
                        key={ra}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                      >
                        {ra}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">
                      No registrados
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setViewCourse(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}