import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { apiErrorMessage } from '../../api/errors';
import { descargarBlob } from '../../utils/descarga';
import { Curso, Seccion, Estudiante } from '../../types';
import { DeleteStudentModal } from './components/DeleteStudentModal';
import { ImportStudentsModal } from './components/ImportStudentsModal';
import { StudentFormModal } from './components/StudentFormModal';
import { StudentsTable } from './components/StudentsTable';
import { useImportarEstudiantes } from './hooks/useImportarEstudiantes';

export function SectionPage() {
  const { cursoId, seccionId } = useParams<{ cursoId: string; seccionId: string }>();
  const cid = Number(cursoId);
  const sid = Number(seccionId);
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Curso | null>(null);
  const [seccion, setSeccion] = useState<Seccion | null>(null);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [addNombre, setAddNombre] = useState('');
  const [addCodigo, setAddCodigo] = useState('');
  const [addEmail, setAddEmail] = useState('');
  // El estudiante se creó, pero el backend dejó el correo en blanco por no ser válido
  const [addAviso, setAddAviso] = useState('');
  // Estudiante que se está editando en el modal (null = el modal agrega uno nuevo)
  const [editing, setEditing] = useState<Estudiante | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const {
    csvModal,
    setCsvModal,
    csvFile,
    csvPreview,
    csvLoading,
    csvError,
    fileRef,
    handleCsvSelect,
    handleCsvImport,
  } = useImportarEstudiantes(sid, setEstudiantes);

  const [deleting, setDeleting] = useState<Estudiante | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      cursosApi.get(cid),
      seccionesApi.list(cid).then((ss) => ss.find((s) => s.id === sid) ?? null),
      estudiantesApi.list(sid),
    ]).then(([c, s, e]) => {
      setCurso(c);
      setSeccion(s);
      setEstudiantes(e);
    }).finally(() => setLoading(false));
  }, [cid, sid]);

  const openAddModal = () => {
    setAddAviso('');
    setAddError('');
    setAddModal(true);
  };

  // El mismo modal, precargado con los datos actuales
  const openEditModal = (e: Estudiante) => {
    setEditing(e);
    setAddNombre(e.nombre_completo);
    setAddCodigo(e.codigo_estudiante);
    setAddEmail(e.email ?? '');
    setAddAviso('');
    setAddError('');
    setAddModal(true);
  };

  const closeAddModal = () => {
    setAddModal(false);
    if (editing) {
      // Que los datos del estudiante editado no aparezcan luego en "Agregar estudiante"
      setEditing(null);
      setAddNombre('');
      setAddCodigo('');
      setAddEmail('');
    }
  };

  const handleUpdate = async (actual: Estudiante) => {
    setAddLoading(true);
    setAddError('');
    setAddAviso('');
    try {
      const { aviso, ...guardado } = await estudiantesApi.update(actual.id, {
        nombre_completo: addNombre.trim().toUpperCase(),
        codigo_estudiante: addCodigo.trim(),
        email: addEmail.trim() || null,
      });
      // La respuesta no trae el promedio del listado: se conserva el que ya se mostraba
      setEstudiantes((prev) => prev.map((e) => (e.id === actual.id ? { ...e, ...guardado } : e)));
      if (aviso) {
        // Guardó el resto; el correo quedó como estaba: se muestra el que realmente hay
        setAddEmail(guardado.email ?? '');
        setAddAviso(`Cambios guardados. ${aviso}.`);
        return;
      }
      closeAddModal();
    } catch (err: any) {
      setAddError(apiErrorMessage(err, 'No se pudo guardar el estudiante'));
    } finally {
      setAddLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!addNombre.trim() || !addCodigo.trim()) {
      setAddError('Nombre y código son obligatorios');
      return;
    }
    if (editing) {
      await handleUpdate(editing);
      return;
    }
    setAddLoading(true);
    setAddError('');
    setAddAviso('');
    try {
      const { aviso, ...e } = await estudiantesApi.create(sid, {
        nombre_completo: addNombre.trim().toUpperCase(),
        codigo_estudiante: addCodigo.trim(),
        email: addEmail.trim() || null,
      });
      setEstudiantes((prev) => [...prev, e]);
      // Se limpia siempre: el estudiante ya existe y un segundo clic lo duplicaría
      setAddNombre('');
      setAddCodigo('');
      setAddEmail('');
      if (aviso) {
        setAddAviso(`Estudiante agregado. ${aviso}.`);
        return;
      }
      setAddModal(false);
    } catch (err: any) {
      setAddError(err?.response?.data?.detail || 'Error al agregar estudiante');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = (estudiante: Estudiante) => {
    setDeleting(estudiante);
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
    const id = deleting.id;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await estudiantesApi.delete(id);
      setEstudiantes((prev) => prev.filter((e) => e.id !== id));
      setDeleting(null);
    } catch (e: any) {
      setDeleteError(e?.response?.data?.detail || 'No se pudo eliminar');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const { blob, nombre } = await estudiantesApi.exportarExcel({ seccion_id: sid });
      descargarBlob(blob, nombre);
    } catch (e: any) {
      setExportError(apiErrorMessage(e, 'No se pudo exportar la lista de estudiantes'));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header
        crumbs={[
          { label: 'Mis cursos', to: '/dashboard' },
          { label: curso?.nombre || '', to: `/cursos/${cid}` },
          { label: seccion?.nombre || '' },
        ]}
      />
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">{seccion?.nombre}</h2>
            <p className="text-sm text-gray-500">{curso?.nombre}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/cursos/${cid}`)}>
            ← Volver al curso
          </Button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="font-semibold text-uao-dark">
              Estudiantes ({estudiantes.length})
            </h3>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCsvModal(true)}>
                Importar CSV / Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting}>
                Exportar Excel
              </Button>
              <Button size="sm" onClick={openAddModal}>
                + Agregar
              </Button>
            </div>
          </div>
          {exportError && <p className="px-5 pt-3 text-sm text-uao-accent">{exportError}</p>}

          <StudentsTable estudiantes={estudiantes} onEdit={openEditModal} onDelete={handleDelete} />
        </div>
      </div>

      {/* Modal agregar */}
      <StudentFormModal
        open={addModal}
        editing={editing !== null}
        nombre={addNombre}
        onNombre={setAddNombre}
        codigo={addCodigo}
        onCodigo={setAddCodigo}
        email={addEmail}
        onEmail={setAddEmail}
        aviso={addAviso}
        error={addError}
        loading={addLoading}
        onClose={closeAddModal}
        onSubmit={handleAdd}
      />

      {/* Modal CSV */}
      <ImportStudentsModal
        open={csvModal}
        onClose={() => setCsvModal(false)}
        file={csvFile}
        onFile={handleCsvSelect}
        fileRef={fileRef}
        preview={csvPreview}
        error={csvError}
        loading={csvLoading}
        onImport={handleCsvImport}
      />

      {/* Modal eliminar */}
      <DeleteStudentModal
        open={deleting !== null}
        error={deleteError}
        loading={deleteLoading}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
    </AppLayout>
  );
}
