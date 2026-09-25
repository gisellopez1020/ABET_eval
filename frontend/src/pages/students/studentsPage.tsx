import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Filter, Eye, Pencil, Trash2, X } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { DataTable, DataTableColumn } from '../../components/ui/DataTable';
import { TableActionButton } from '../../components/ui/TableActionButton';


import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { Curso, Seccion } from '../../types';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

type StudentStatus = 'activo' | 'inactivo';

interface StudentRow {
  id: number;
  nombre: string;
  codigo: string;
  email: string;
  semestre: string;
  promedio: number;
  grupo: string;
  estado: StudentStatus;
  cursoId: number;
  cursoNombre: string;
  seccionId: number;
}

/** Sección con el nombre de su asignatura (los nombres de sección se repiten entre cursos). */
interface SectionOption extends Seccion {
  cursoNombre: string;
}

const SELECT_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

// Pantalla independiente de la asignatura activa del Dashboard (selectedCourseId):
// carga los estudiantes de todas las secciones de todos los cursos del docente y
// filtra en memoria por Asignatura/Sección, búsqueda y estado.
export default function StudentsPage() {
  const [courses, setCourses] = useState<Curso[]>([]);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | StudentStatus>('todos');
  const [courseFilter, setCourseFilter] = useState<number | null>(null); // null = Todas
  const [sectionFilter, setSectionFilter] = useState<number | null>(null); // null = Todas
  const [showFilter, setShowFilter] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [createSeccionId, setCreateSeccionId] = useState<number | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(1);

  const pageSize = 5;

  // Recorrido cursos -> secciones -> estudiantes por sección (mismo patrón que ProjectsPage),
  // con las peticiones de cada nivel en paralelo.
  const loadAll = async () => {
    try {
      const cursos = await cursosApi.list();
      const seccionesPorCurso = await Promise.all(
        cursos.map(async (curso) => {
          const secciones = await seccionesApi.list(curso.id);
          return secciones.map((seccion): SectionOption => ({ ...seccion, cursoNombre: curso.nombre }));
        })
      );
      const secciones = seccionesPorCurso.flat();

      const estudiantesPorSeccion = await Promise.all(
        secciones.map(async (seccion) => {
          const estudiantes = await estudiantesApi.list(seccion.id);
          return estudiantes.map((estudiante): StudentRow => ({
            id: estudiante.id,
            nombre: estudiante.nombre_completo,
            codigo: estudiante.codigo_estudiante,
            email: `${estudiante.codigo_estudiante.toLowerCase()}@uao.edu.co`,
            semestre: '—',
            promedio: 0,
            grupo: seccion.nombre,
            estado: 'activo',
            cursoId: seccion.curso_id,
            cursoNombre: seccion.cursoNombre,
            seccionId: seccion.id,
          }));
        })
      );

      setCourses(cursos);
      setSectionOptions(secciones);
      setStudents(estudiantesPorSeccion.flat());
    } catch (error) {
      console.error('Error cargando estudiantes:', error);
      setCourses([]);
      setSectionOptions([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  // Secciones que ofrece el filtro: las de la asignatura elegida, o todas
  const filterSections = useMemo(
    () => (courseFilter === null ? sectionOptions : sectionOptions.filter((s) => s.curso_id === courseFilter)),
    [sectionOptions, courseFilter]
  );

  const handleCourseFilter = (value: string) => {
    const courseId = value ? Number(value) : null;
    setCourseFilter(courseId);
    // Si la sección elegida no es de la nueva asignatura, vuelve a "Todas"
    if (
      sectionFilter !== null &&
      courseId !== null &&
      !sectionOptions.some((s) => s.id === sectionFilter && s.curso_id === courseId)
    ) {
      setSectionFilter(null);
    }
  };

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const matchesSearch =
        query === '' ||
        student.nombre.toLowerCase().includes(query) ||
        student.codigo.toLowerCase().includes(query);

      const matchesStatus = status === 'todos' || student.estado === status;
      const matchesCourse = courseFilter === null || student.cursoId === courseFilter;
      const matchesSection = sectionFilter === null || student.seccionId === sectionFilter;

      return matchesSearch && matchesStatus && matchesCourse && matchesSection;
    });
  }, [students, search, status, courseFilter, sectionFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, status, courseFilter, sectionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedStudents = filteredStudents.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const openCreateModal = () => {
    // Por defecto, la sección del filtro si hay una elegida
    setCreateSeccionId(sectionFilter);
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateStudent = async () => {
    if (!newStudentName.trim()) {
      setCreateError('El nombre es obligatorio');
      return;
    }

    if (!newStudentCode.trim()) {
      setCreateError('El código es obligatorio');
      return;
    }

    if (!createSeccionId) {
      setCreateError('Debes seleccionar una sección');
      return;
    }

    setCreateLoading(true);
    setCreateError('');

    try {
      await estudiantesApi.create(createSeccionId, {
        nombre_completo: newStudentName.trim().toUpperCase(),
        codigo_estudiante: newStudentCode.trim(),
      });

      await loadAll();
      setNewStudentName('');
      setNewStudentCode('');
      setShowCreateModal(false);
    } catch (error: any) {
      setCreateError(error?.response?.data?.detail || 'No se pudo crear el estudiante.');
    } finally {
      setCreateLoading(false);
    }
  };

  const columns: DataTableColumn<StudentRow>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (student) => (
        <span className="font-medium text-gray-900">{student.nombre}</span>
      ),
    },
    { key: 'codigo', label: 'Código' },
    { key: 'email', label: 'Email' },
    { key: 'semestre', label: 'Semestre' },
    {
      key: 'promedio',
      label: 'Promedio',
      align: 'center',
      render: (student) => <span>{student.promedio.toFixed(1)}</span>,
    },
    {
      key: 'grupo',
      label: 'Grupo',
      align: 'center',
      render: (student) => <span title={student.cursoNombre}>{student.grupo}</span>,
    },
    {
      key: 'estado',
      label: 'Estado',
      align: 'center',
      render: (student) => (
        <span
          className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${
            student.estado === 'activo'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {student.estado}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Acciones',
      align: 'center',
      render: () => (
        <div className="flex items-center justify-center gap-2">
          <TableActionButton variant="default" icon={<Eye size={12} />}>
            Ver
          </TableActionButton>
          <TableActionButton variant="primary" icon={<Pencil size={12} />}>
            Editar
          </TableActionButton>
          <TableActionButton variant="danger" icon={<Trash2 size={12} />}>
            Eliminar
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
            <h1 className="text-2xl font-semibold text-gray-900">Estudiantes</h1>
            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? 'Cargando…'
                : `${filteredStudents.length} ${
                    filteredStudents.length === 1 ? 'estudiante registrado' : 'estudiantes registrados'
                  }`}
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código o nombre del estudiante..."
              leftIcon={<Search size={18} />}
            />
          </div>

          <select
            value={courseFilter ?? ''}
            onChange={(event) => handleCourseFilter(event.target.value)}
            aria-label="Filtrar por asignatura"
            className={`${SELECT_CLASS} md:w-56`}
          >
            <option value="">Asignatura: Todas</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.nombre}
              </option>
            ))}
          </select>

          <select
            value={sectionFilter ?? ''}
            onChange={(event) => setSectionFilter(event.target.value ? Number(event.target.value) : null)}
            aria-label="Filtrar por sección"
            className={`${SELECT_CLASS} md:w-56`}
          >
            <option value="">Sección: Todas</option>
            {filterSections.map((section) => (
              <option key={section.id} value={section.id}>
                {courseFilter === null ? `${section.cursoNombre} · ${section.nombre}` : section.nombre}
              </option>
            ))}
          </select>

          <Button
              variant="outline"
              icon={<Filter size={17} />}
              onClick={() => setShowFilter((value) => !value)}
            >
              Filtrar
            </Button>

          <Button
          icon={<Plus size={18} />}
          onClick={openCreateModal}
        >
          Nuevo estudiante
        </Button>
        </div>

        {showFilter && (
          <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-4">
            <button
              type="button"
              onClick={() => setStatus('todos')}
              className={`rounded-lg px-4 py-2 text-sm ${
                status === 'todos' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              onClick={() => setStatus('activo')}
              className={`rounded-lg px-4 py-2 text-sm ${
                status === 'activo' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Activos
            </button>

            <button
              type="button"
              onClick={() => setStatus('inactivo')}
              className={`rounded-lg px-4 py-2 text-sm ${
                status === 'inactivo' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Inactivos
            </button>
          </div>
        )}

        <DataTable
          columns={columns}
          data={paginatedStudents}
          getRowKey={(student) => student.id}
          empty={loading ? 'Cargando estudiantes…' : 'No se encontraron estudiantes.'}
        />

        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Nuevo estudiante</h2>
                  <p className="text-sm text-gray-500">Crea un estudiante en la sección seleccionada</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError('');
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Nombre completo</label>
                  <input
                    value={newStudentName}
                    onChange={(event) => setNewStudentName(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                    placeholder="Ej: Ana María López"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Código</label>
                  <input
                    value={newStudentCode}
                    onChange={(event) => setNewStudentCode(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                    placeholder="Ej: 20241001"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Sección</label>
                  <select
                    value={createSeccionId ?? ''}
                    onChange={(event) => setCreateSeccionId(event.target.value ? Number(event.target.value) : null)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                  >
                    <option value="">Selecciona una sección</option>
                    {sectionOptions.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.cursoNombre} · {section.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {createError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {createError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError('');
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={createLoading}
                  onClick={handleCreateStudent}
                  className="rounded-lg bg-[#9E0B0F] px-4 py-2 text-sm font-medium text-white hover:bg-[#82090d] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {createLoading ? 'Creando...' : 'Crear estudiante'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={safePage === 1}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>

          <span className="text-sm text-gray-600">
            Página {safePage} de {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={safePage === totalPages}
            className="rounded-lg bg-[#9E0B0F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#7C090C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </main>
    </AppLayout>
  );
}
