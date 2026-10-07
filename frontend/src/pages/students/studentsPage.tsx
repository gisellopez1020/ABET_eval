import { useEffect, useMemo, useState } from 'react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { DataTable } from '../../components/ui/DataTable';

import { estudiantesApi } from '../../api/estudiantes';
import { apiErrorMessage } from '../../api/errors';
import { descargarBlob } from '../../utils/descarga';
import { DeleteStudentModal } from './components/DeleteStudentModal';
import { StudentFormDialog } from './components/StudentFormDialog';
import { StudentsPagination } from './components/StudentsPagination';
import { StudentsToolbar } from './components/StudentsToolbar';
import { studentsColumns } from './components/studentsColumns';
import { useStudentForm } from './hooks/useStudentForm';
import { useStudentsData } from './hooks/useStudentsData';
import { StudentRow, StudentStatus } from './types';

export default function StudentsPage() {

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | StudentStatus>('todos');
  const [sectionFilter, setSectionFilter] = useState<number | null>(null); // null = Todas
  const [showFilter, setShowFilter] = useState(false);

  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const pageSize = 5;

  const { courses, sectionOptions, students, loading, loadAll, courseFilter, setCourseFilter } =
    useStudentsData();

  const {
    showCreateModal,
    newStudentName,
    setNewStudentName,
    newStudentCode,
    setNewStudentCode,
    newStudentEmail,
    setNewStudentEmail,
    createAviso,
    editingStudent,
    createSeccionId,
    setCreateSeccionId,
    createLoading,
    createError,
    openCreateModal,
    openEditModal,
    closeStudentModal,
    handleCreateStudent,
  } = useStudentForm(sectionFilter, loadAll);

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

  const handleDelete = (student: StudentRow) => {
    setDeleting(student);
    setDeleteError('');
  };

  const closeDeleteModal = () => {
    // Mientras la petición está en curso, Esc / clic en el fondo no cierran el modal
    if (deleteLoading) return;
    setDeleting(null);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await estudiantesApi.delete(deleting.id);

      await loadAll();
      setDeleting(null);
    } catch (error) {
      console.error('Error eliminando estudiante:', error);
      setDeleteError('No fue posible eliminar al estudiante.');
    } finally {
      setDeleteLoading(false);
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

  const columns = studentsColumns(openEditModal, handleDelete);

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

        <StudentsToolbar
          search={search}
          onSearch={setSearch}
          courses={courses}
          courseFilter={courseFilter}
          onCourseFilter={handleCourseFilter}
          filterSections={filterSections}
          sectionFilter={sectionFilter}
          onSectionFilter={setSectionFilter}
          onToggleFilter={() => setShowFilter((value) => !value)}
          exporting={exporting}
          onExport={handleExport}
          exportError={exportError}
          onNew={openCreateModal}
          showFilter={showFilter}
          status={status}
          onStatus={setStatus}
        />

        <DataTable
          columns={columns}
          data={paginatedStudents}
          getRowKey={(student) => student.id}
          empty={loading ? 'Cargando estudiantes…' : 'No se encontraron estudiantes.'}
        />

        {showCreateModal && (
          <StudentFormDialog
            editing={editingStudent}
            nombre={newStudentName}
            onNombre={setNewStudentName}
            codigo={newStudentCode}
            onCodigo={setNewStudentCode}
            email={newStudentEmail}
            onEmail={setNewStudentEmail}
            seccionId={createSeccionId}
            onSeccion={setCreateSeccionId}
            sectionOptions={sectionOptions}
            aviso={createAviso}
            error={createError}
            loading={createLoading}
            onClose={closeStudentModal}
            onSubmit={handleCreateStudent}
          />
        )}

        {/* Modal eliminar */}
        <DeleteStudentModal
          deleting={deleting}
          error={deleteError}
          loading={deleteLoading}
          onClose={closeDeleteModal}
          onConfirm={confirmDelete}
        />

        <StudentsPagination
          safePage={safePage}
          totalPages={totalPages}
          onPrevious={() => setPage((prev) => Math.max(prev - 1, 1))}
          onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
        />
      </main>
    </AppLayout>
  );
}