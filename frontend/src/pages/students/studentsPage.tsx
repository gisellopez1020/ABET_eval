import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Filter, Eye, Pencil, Trash2, X } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { DataTable, DataTableColumn } from '../../components/ui/DataTable';
import { TableActionButton } from '../../components/ui/TableActionButton';


import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { useCourseStore } from '../../store/courseStore';
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
}

export default function StudentsPage() {
  const { selectedCourseId } = useCourseStore();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | StudentStatus>('todos');
  const [showFilter, setShowFilter] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [sectionOptions, setSectionOptions] = useState<Seccion[]>([]);
  const [selectedSeccionId, setSelectedSeccionId] = useState<number | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(1);

  const pageSize = 5;

  const refreshStudents = async (sectionId: number | null) => {
    if (!sectionId) {
      setStudents([]);
      return;
    }

    try {
      const estudiantes = await estudiantesApi.list(sectionId);
      const mappedStudents: StudentRow[] = estudiantes.map((estudiante) => ({
        id: estudiante.id,
        nombre: estudiante.nombre_completo,
        codigo: estudiante.codigo_estudiante,
        email: `${estudiante.codigo_estudiante.toLowerCase()}@uao.edu.co`,
        semestre: '—',
        promedio: 0,
        grupo: '—',
        estado: 'activo',
      }));

      setStudents(mappedStudents);
    } catch (error) {
      console.error('Error cargando estudiantes:', error);
      setStudents([]);
    }
  };

  useEffect(() => {
    const loadSections = async () => {
      try {
        const courses: Curso[] = await cursosApi.list();
        const courseIds = selectedCourseId
          ? [selectedCourseId]
          : courses.map((course) => course.id);

        const sectionsByCourse = await Promise.all(
          courseIds.map(async (courseId) => seccionesApi.list(courseId))
        );

        const allSections = sectionsByCourse.flat();
        setSectionOptions(allSections);

        if (allSections.length > 0 && (!selectedSeccionId || !allSections.some((section) => section.id === selectedSeccionId))) {
          setSelectedSeccionId(allSections[0].id);
        }

        if (allSections.length === 0) {
          setSelectedSeccionId(null);
          setStudents([]);
        }
      } catch (error) {
        console.error('Error cargando secciones:', error);
        setSectionOptions([]);
        setSelectedSeccionId(null);
        setStudents([]);
      }
    };

    loadSections();
  }, [selectedCourseId]);

  useEffect(() => {
    refreshStudents(selectedSeccionId);
  }, [selectedSeccionId]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const matchesSearch =
        query === '' ||
        student.nombre.toLowerCase().includes(query) ||
        student.codigo.toLowerCase().includes(query);

      const matchesStatus = status === 'todos' || student.estado === status;

      return matchesSearch && matchesStatus;
    });
  }, [students, search, status]);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedStudents = filteredStudents.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const handleCreateStudent = async () => {
    if (!newStudentName.trim()) {
      setCreateError('El nombre es obligatorio');
      return;
    }

    if (!newStudentCode.trim()) {
      setCreateError('El código es obligatorio');
      return;
    }

    if (!selectedSeccionId) {
      setCreateError('Debes seleccionar una sección');
      return;
    }

    setCreateLoading(true);
    setCreateError('');

    try {
      await estudiantesApi.create(selectedSeccionId, {
        nombre_completo: newStudentName.trim().toUpperCase(),
        codigo_estudiante: newStudentCode.trim(),
      });

      await refreshStudents(selectedSeccionId);
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
    { key: 'grupo', label: 'Grupo', align: 'center' },
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
              {filteredStudents.length}{' '}
              {filteredStudents.length === 1
                ? 'estudiante registrado'
                : 'estudiantes registrados'}
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

          <Button
              variant="outline"
              icon={<Filter size={17} />}
              onClick={() => setShowFilter((value) => !value)}
            >
              Filtrar
            </Button>

          <Button
          icon={<Plus size={18} />}
          onClick={() => setShowCreateModal(true)}
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
          empty="No se encontraron estudiantes."
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
                    value={selectedSeccionId ?? ''}
                    onChange={(event) => setSelectedSeccionId(Number(event.target.value))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                  >
                    <option value="">Selecciona una sección</option>
                    {sectionOptions.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.nombre}
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
