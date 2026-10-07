import { useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { catalogoRaAbetApi, RaAbetCreate } from '../../api/catalogo';
import { apiErrorMessage } from '../../api/errors';
import { RaAbet } from '../../types';
import { AgregarMenu } from './components/AgregarMenu';
import { CatalogoTabla } from './components/CatalogoTabla';
import { DeleteRaModal } from './components/DeleteRaModal';
import { EditRow } from './components/EditRow';
import { ImportRaAbetModal } from './components/ImportRaAbetModal';
import { useImportarRaAbet } from './hooks/useImportarRaAbet';
import { deducirSo, parsePesoCriterio } from './raAbetCsv';
import { agruparPorPadre, EMPTY_DRAFT, Editing, Nivel, PROGRAMA_DEFAULT, RowDraft, toDraft } from './raAbetDraft';

// Catálogo global de Student Outcomes / RA ABET, compartido por todos los cursos.
// Dos niveles: Resultado de Aprendizaje (P.I., ej. "2.1") y Criterio de Evaluación
// (ej. "2.1.1", con peso dentro de su RA). Cada fila se guarda al instante
// (POST/PUT/DELETE); la importación CSV usa /importar (todo o nada).
// Que los pesos de un RA no sumen 1.0 es solo una advertencia, nunca bloquea.

export function StudentOutcomesPage() {
  const [catalogo, setCatalogo] = useState<RaAbet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<RowDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [addMenu, setAddMenu] = useState(false);

  const [deleting, setDeleting] = useState<RaAbet | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    try {
      setCatalogo(await catalogoRaAbetApi.list());
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo cargar el catálogo.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const raices = useMemo(() => catalogo.filter((ra) => ra.codigo_padre === null), [catalogo]);
  const hijosPorPadre = useMemo(() => agruparPorPadre(catalogo), [catalogo]);
  const porCodigo = useMemo(() => new Map(catalogo.map((ra) => [ra.codigo, ra])), [catalogo]);

  const resetMessages = () => {
    setError('');
    setMessage('');
  };

  // ── Edición en línea ─────────────────────────────────────────────────────
  const startAdd = (nivel: Nivel) => {
    resetMessages();
    setAddMenu(false);
    setEditing({ codigo: null, nivel });
    setDraft({ ...EMPTY_DRAFT, codigo_padre: nivel === 'criterio' ? raices[0]?.codigo ?? '' : '' });
  };

  const startEdit = (ra: RaAbet) => {
    resetMessages();
    setEditing({ codigo: ra.codigo, nivel: ra.codigo_padre === null ? 'ra' : 'criterio' });
    setDraft(toDraft(ra));
  };

  const cancelEdit = () => setEditing(null);

  const saveRow = async () => {
    if (!editing) return;
    resetMessages();
    const codigo = draft.codigo.trim();
    const competencia = draft.competencia.trim();
    const descripcion = draft.descripcion.trim();

    if (!codigo || !descripcion) {
      setError('Código y descripción son obligatorios.');
      return;
    }
    if (editing.nivel === 'ra' && !competencia) {
      setError('La competencia es obligatoria en un Resultado de Aprendizaje.');
      return;
    }

    const payload: Omit<RaAbetCreate, 'codigo'> = {
      descripcion,
      programa: draft.programa.trim() || PROGRAMA_DEFAULT,
      // Vacío: el backend lo deduce del código
      so: draft.so.trim() || (editing.codigo ? deducirSo(codigo) : undefined),
    };
    // En un Criterio, competencia vacía = heredar la del RA (al crear) o conservar la actual (al editar)
    if (competencia) payload.competencia = competencia;

    if (editing.nivel === 'criterio') {
      if (!draft.codigo_padre) {
        setError('Elige el Resultado de Aprendizaje padre del Criterio.');
        return;
      }
      const peso = parsePesoCriterio(draft.peso);
      if (!peso.ok) {
        setError(`Peso: ${peso.error}.`);
        return;
      }
      payload.codigo_padre = draft.codigo_padre;
      payload.peso = peso.peso;
    }

    setSaving(true);
    try {
      if (editing.codigo === null) {
        const created = await catalogoRaAbetApi.create({ codigo, ...payload });
        setMessage(`"${created.codigo}" agregado.`);
      } else {
        const updated = await catalogoRaAbetApi.update(editing.codigo, payload);
        setMessage(`"${updated.codigo}" actualizado.`);
      }
      await load();
      cancelEdit();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  };

  const {
    csvModal,
    setCsvModal,
    csvFile,
    csvPreview,
    csvError,
    csvLoading,
    fileRef,
    closeCsvModal,
    handleCsvSelect,
    previewGrupos,
    previewActualiza,
    previewNuevos,
    handleCsvImport,
  } = useImportarRaAbet(catalogo, porCodigo, hijosPorPadre, async (result) => {
    await load();
    resetMessages();
    setMessage(`Importación completa: ${result.creados} nuevo(s), ${result.actualizados} actualizado(s).`);
    cancelEdit();
  });

  // ── Eliminar (modal de confirmación) ─────────────────────────────────────
  const deleteRow = (ra: RaAbet) => {
    setDeleting(ra);
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
    const ra = deleting;
    resetMessages();
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await catalogoRaAbetApi.delete(ra.codigo);
      setCatalogo((prev) => prev.filter((item) => item.codigo !== ra.codigo));
      setMessage(`"${ra.codigo}" eliminado.`);
      setDeleting(null);
    } catch (err) {
      // 409 si tiene Criterios hijos o algún curso lo usa en su ra_abet; el modal sigue abierto
      setDeleteError(apiErrorMessage(err, 'No se pudo eliminar.'));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  // Una sola fila en edición a la vez: arriba si es nueva, o en lugar de la que se edita
  const editRow = editing ? (
    <EditRow
      key={editing.codigo ?? '__nuevo__'}
      editing={editing}
      draft={draft}
      setDraft={setDraft}
      raices={raices}
      porCodigo={porCodigo}
      saving={saving}
      onSave={saveRow}
      onCancel={cancelEdit}
    />
  ) : null;

  return (
    <AppLayout>
      <div className="min-h-screen bg-white p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Student Outcomes</h1>
              <p className="mt-1 text-sm text-gray-500">
                Catálogo de Resultados de Aprendizaje ABET del programa y sus Criterios de Evaluación, compartido por
                todas las asignaturas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="md" icon={<Upload size={16} />} onClick={() => setCsvModal(true)}>
                Importar CSV
              </Button>
              <AgregarMenu
                open={addMenu}
                onToggle={() => setAddMenu((v) => !v)}
                onClose={() => setAddMenu(false)}
                disabled={editing?.codigo === null}
                sinRaices={raices.length === 0}
                onAdd={startAdd}
              />
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {message && (
            <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <CatalogoTabla
            catalogo={catalogo}
            raices={raices}
            hijosPorPadre={hijosPorPadre}
            loading={loading}
            editing={editing}
            editRow={editRow}
            onEdit={startEdit}
            onDelete={deleteRow}
          />
        </div>
      </div>

      {/* Modal CSV */}
      <ImportRaAbetModal
        open={csvModal}
        onClose={closeCsvModal}
        file={csvFile}
        onFile={handleCsvSelect}
        fileRef={fileRef}
        preview={csvPreview}
        previewGrupos={previewGrupos}
        previewNuevos={previewNuevos}
        previewActualiza={previewActualiza}
        porCodigo={porCodigo}
        error={csvError}
        loading={csvLoading}
        onImport={handleCsvImport}
      />

      {/* Modal eliminar */}
      <DeleteRaModal
        deleting={deleting}
        error={deleteError}
        loading={deleteLoading}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
    </AppLayout>
  );
}
