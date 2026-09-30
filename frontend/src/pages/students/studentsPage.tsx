import { useEffect, useMemo, useState } from 'react';
import { Download, PencilLine, Plus, Search, Filter, Trash2, X } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { DataTable, DataTableColumn } from '../../components/ui/DataTable';
import { TableActionButton } from '../../components/ui/TableActionButton';


import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { apiErrorMessage } from '../../api/errors';
import { descargarBlob } from '../../utils/descarga';
import { Curso, Seccion } from '../../types';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useCourseStore } from '../../store/courseStore';

type StudentStatus = 'activo' | 'inactivo';

interface StudentRow {
  id: number;
  nombre: string;
  codigo: string;
  email: string | null;
  periodo: string;
  promedio: number | null;
  grupo: string;
  estado: StudentStatus;
  cursoId: number;
  cursoNombre: string;
  seccionId: number;
}

/** Sección con el nombre y periodo de su asignatura (los nombres de sección se repiten entre cursos). */
interface SectionOption extends Seccion {
  cursoNombre: string;
  cursoPeriodo: string;
}

const SELECT_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

export default function StudentsPage() {
  const selectedCourseId = useCourseStore((state) => state.selectedCourseId);
  const [courses, setCourses] = useState<Curso[]>([]);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | StudentStatus>('todos');
  const [courseFilter, setCourseFilter] = useState<number | null>(selectedCourseId);
  const [sectionFilter, setSectionFilter] = useState<number | null>(null); // null = Todas
  const [showFilter, setShowFilter] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  // El estudiante se creó, pero el backend dejó el correo en blanco por no ser válido
  const [createAviso, setCreateAviso] = useState('');
  // Estudiante que se está editando en el modal (null = el modal crea uno nuevo)
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [createSeccionId, setCreateSeccionId] = useState<number | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const pageSize = 5;

  // Recorrido cursos -> secciones -> estudiantes por sección (mismo patrón que ProjectsPage),
  // con las peticiones de cada nivel en paralelo.
  const loadAll = async () => {
    try {
      const cursos = await cursosApi.list();
      const seccionesPorCurso = await Promise.all(
        cursos.map(async (curso) => {
          const secciones = await seccionesApi.list(curso.id);
          return secciones.map((seccion): SectionOption => ({
            ...seccion,
            cursoNombre: curso.nombre,
            cursoPeriodo: curso.periodo,
          }));
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
            email: estudiante.email ?? null,
            periodo: seccion.cursoPeriodo,
            promedio: estudiante.promedio ?? null,
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
      setCourseFilter((current) => {
        if (current !== null && cursos.some((curso) => curso.id === current)) {
          return current;
        }
        if (selectedCourseId !== null && cursos.some((curso) => curso.id === selectedCourseId)) {
          return selectedCourseId;
        }
        return cursos[0]?.id ?? null;
      });
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
    setCreateAviso('');
    setShowCreateModal(true);
  };

  // El mismo modal, precargado con los datos actuales
  const openEditModal = (student: StudentRow) => {
    setEditingStudent(student);
    setNewStudentName(student.nombre);
    setNewStudentCode(student.codigo);
    setNewStudentEmail(student.email ?? '');
    setCreateSeccionId(student.seccionId);
    setCreateError('');
    setCreateAviso('');
    setShowCreateModal(true);
  };

  const closeStudentModal = () => {
    setShowCreateModal(false);
    setCreateError('');
    if (editingStudent) {
      // Que los datos del estudiante editado no aparezcan luego en "Nuevo estudiante"
      setEditingStudent(null);
      setNewStudentName('');
      setNewStudentCode('');
      setNewStudentEmail('');
    }
  };

  const handleUpdateStudent = async (student: StudentRow) => {
    setCreateLoading(true);
    setCreateError('');
    setCreateAviso('');

    try {
      const guardado = await estudiantesApi.update(student.id, {
        nombre_completo: newStudentName.trim().toUpperCase(),
        codigo_estudiante: newStudentCode.trim(),
        email: newStudentEmail.trim() || null,
      });

      await loadAll();
      if (guardado.aviso) {
        // Guardó el resto; el correo quedó como estaba: se muestra el que realmente hay
        setNewStudentEmail(guardado.email ?? '');
        setCreateAviso(`Cambios guardados. ${guardado.aviso}.`);
        return;
      }
      closeStudentModal();
    } catch (error) {
      setCreateError(apiErrorMessage(error, 'No se pudo guardar el estudiante.'));
    } finally {
      setCreateLoading(false);
    }
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

    if (editingStudent) {
      await handleUpdateStudent(editingStudent);
      return;
    }

    if (!createSeccionId) {
      setCreateError('Debes seleccionar una sección');
      return;
    }

    setCreateLoading(true);
    setCreateError('');
    setCreateAviso('');

    try {
      const creado = await estudiantesApi.create(createSeccionId, {
        nombre_completo: newStudentName.trim().toUpperCase(),
        codigo_estudiante: newStudentCode.trim(),
        email: newStudentEmail.trim() || null,
      });

      await loadAll();
      // Se limpia siempre: el estudiante ya existe y un segundo clic lo duplicaría
      setNewStudentName('');
      setNewStudentCode('');
      setNewStudentEmail('');
      if (creado.aviso) {
        setCreateAviso(`Estudiante creado. ${creado.aviso}.`);
        return;
      }
      setShowCreateModal(false);
    } catch (error: any) {
      setCreateError(error?.response?.data?.detail || 'No se pudo crear el estudiante.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (student: StudentRow) => {
    const confirmed = window.confirm(
      `¿Deseas eliminar a "${student.nombre}"?\n\n` +
        'También se eliminarán sus calificaciones individuales y se retirará de los equipos a los que pertenece. Esta acción no se puede deshacer.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await estudiantesApi.delete(student.id);

      await loadAll();
    } catch (error) {
      console.error('Error eliminando estudiante:', error);
      window.alert('No fue posible eliminar al estudiante.');
    }
  };

  // Exporta lo que acotan los filtros de Asignatura y Sección (no la búsqueda ni el estado)
  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const { blob, nombre } = await estudiantesApi.exportarExcel({
        ...(courseFilter !== null ? { curso_id: courseFilter } : {}),
        ...(sectionFilter !== null ? { seccion_id: sectionFilter } : {}),
      });
      descargarBlob(blob, nombre);
    } catch (e) {
      setExportError(apiErrorMessage(e, 'No se pudo exportar la lista de estudiantes.'));
    } finally {
      setExporting(false);
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
    {
      key: 'email',
      label: 'Correo',
      render: (student) => (
        <span title={student.email ? undefined : 'Sin correo registrado'}>{student.email ?? '—'}</span>
      ),
    },
    { key: 'periodo', label: 'Periodo' },
    {
      key: 'promedio',
      label: 'Promedio',
      align: 'center',
      render: (student) => (
        <span title={student.promedio === null ? 'Sin actividades calificadas' : undefined}>
          {student.promedio === null ? '—' : student.promedio.toFixed(1)}
        </span>
      ),
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
      render: (student) => (
        <div className="flex items-center justify-center gap-2">
          <TableActionButton
            title="Editar estudiante"
            onClick={() => openEditModal(student)}
            icon={<PencilLine size={12} />}
          >
            Editar
          </TableActionButton>
          <TableActionButton
            variant="danger"
            title="Eliminar estudiante"
            onClick={() => handleDelete(student)}
            icon={<Trash2 size={12} />}
          >
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
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.nombre} ({course.codigo} · {course.periodo})
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
            variant="outline"
            icon={<Download size={17} />}
            onClick={handleExport}
            loading={exporting}
            title="Exporta los estudiantes de la asignatura y sección filtradas"
          >
            Exportar Excel
          </Button>

          <Button
          icon={<Plus size={18} />}
          onClick={openCreateModal}
        >
          Nuevo estudiante
        </Button>
        </div>

        {exportError && <p className="mb-4 text-sm text-red-600">{exportError}</p>}

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
                  <h2 className="text-lg font-semibold text-gray-900">
                    {editingStudent ? 'Editar estudiante' : 'Nuevo estudiante'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {editingStudent
                      ? 'Corrige el nombre, el código o el correo. Sus calificaciones y equipos no cambian.'
                      : 'Crea un estudiante en la sección seleccionada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStudentModal}
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
                  <label className="mb-2 block text-sm font-medium text-gray-700">Correo (opcional)</label>
                  <input
                    type="email"
                    value={newStudentEmail}
                    onChange={(event) => setNewStudentEmail(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                    placeholder="Ej: ana.lopez@uao.edu.co"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Sección</label>
                  <select
                    value={createSeccionId ?? ''}
                    onChange={(event) => setCreateSeccionId(event.target.value ? Number(event.target.value) : null)}
                    disabled={editingStudent !== null}
                    title={editingStudent ? 'La sección no se puede cambiar al editar' : undefined}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10 disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">Selecciona una sección</option>
                    {sectionOptions.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.cursoNombre} · {section.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {createAviso && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {createAviso}
                  </div>
                )}

                {createError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {createError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={closeStudentModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200
                  border border-[#E73426]"
                >
                  {editingStudent && createAviso ? 'Cerrar' : 'Cancelar'}
                </button>
                <button
                  type="button"
                  disabled={createLoading}
                  onClick={handleCreateStudent}
                  className="rounded-lg bg-[#9E0B0F] px-4 py-2 text-sm font-medium text-white hover:bg-[#82090d] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {editingStudent
                    ? createLoading ? 'Guardando...' : 'Guardar cambios'
                    : createLoading ? 'Creando...' : 'Crear estudiante'}
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