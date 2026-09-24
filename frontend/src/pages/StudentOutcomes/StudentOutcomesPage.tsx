import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, PencilLine, Plus, Trash2, Upload, X } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { catalogoRaAbetApi } from '../../api/catalogo';
import { apiErrorMessage } from '../../api/errors';
import { RaAbet } from '../../types';
import { decodeCsvBytes } from '../../utils/csv';
import { deducirSo, parseRaAbetCsv, RaAbetCsvItem } from './raAbetCsv';

// Catálogo global de Student Outcomes / RA ABET, compartido por todos los cursos.
// Cada fila se guarda al instante (POST/PUT/DELETE); la importación CSV usa /importar (todo o nada).

interface RowDraft {
  codigo: string;
  so: string;
  competencia: string;
  descripcion: string;
  programa: string;
}

const PROGRAMA_DEFAULT = 'Ingeniería Informática';

const EMPTY_DRAFT: RowDraft = { codigo: '', so: '', competencia: '', descripcion: '', programa: PROGRAMA_DEFAULT };

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

const toDraft = (ra: RaAbet): RowDraft => ({
  codigo: ra.codigo,
  so: ra.so ?? '',
  competencia: ra.competencia,
  descripcion: ra.descripcion,
  programa: ra.programa,
});

const ICON_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition';

export function StudentOutcomesPage() {
  const [catalogo, setCatalogo] = useState<RaAbet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Edición en línea: una fila a la vez (existente por código, o la fila nueva)
  const [editingCodigo, setEditingCodigo] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [csvModal, setCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<RaAbetCsvItem[]>([]);
  const [csvError, setCsvError] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const resetMessages = () => {
    setError('');
    setMessage('');
  };

  // ── Edición en línea ─────────────────────────────────────────────────────
  const startEdit = (ra: RaAbet) => {
    resetMessages();
    setAdding(false);
    setEditingCodigo(ra.codigo);
    setDraft(toDraft(ra));
  };

  const startAdd = () => {
    resetMessages();
    setEditingCodigo(null);
    setAdding(true);
    setDraft(EMPTY_DRAFT);
  };

  const cancelEdit = () => {
    setEditingCodigo(null);
    setAdding(false);
  };

  const saveRow = async () => {
    resetMessages();
    const codigo = draft.codigo.trim();
    if (!codigo || !draft.competencia.trim() || !draft.descripcion.trim()) {
      setError('Código, competencia y descripción son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        so: draft.so.trim() || undefined, // vacío: el backend lo deduce del código
        competencia: draft.competencia.trim(),
        descripcion: draft.descripcion.trim(),
        programa: draft.programa.trim() || PROGRAMA_DEFAULT,
      };
      if (adding) {
        const created = await catalogoRaAbetApi.create({ codigo, ...payload });
        setCatalogo((prev) => [...prev, created].sort((a, b) => a.codigo.localeCompare(b.codigo)));
        setMessage(`"${created.codigo}" agregado.`);
      } else if (editingCodigo) {
        const updated = await catalogoRaAbetApi.update(editingCodigo, {
          ...payload,
          so: payload.so ?? deducirSo(editingCodigo),
        });
        setCatalogo((prev) => prev.map((ra) => (ra.codigo === updated.codigo ? updated : ra)));
        setMessage(`"${updated.codigo}" actualizado.`);
      }
      cancelEdit();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo guardar el resultado de aprendizaje.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (ra: RaAbet) => {
    if (!window.confirm(`¿Eliminar "${ra.codigo}" del catálogo?`)) return;
    resetMessages();
    try {
      await catalogoRaAbetApi.delete(ra.codigo);
      setCatalogo((prev) => prev.filter((item) => item.codigo !== ra.codigo));
      setMessage(`"${ra.codigo}" eliminado.`);
    } catch (err) {
      // 409 si algún curso lo usa en su ra_abet
      setError(apiErrorMessage(err, 'No se pudo eliminar el resultado de aprendizaje.'));
    }
  };

  // ── Importar CSV ─────────────────────────────────────────────────────────
  const existentes = useMemo(() => new Set(catalogo.map((ra) => ra.codigo)), [catalogo]);

  const previewGrupos = useMemo(() => {
    const porCompetencia = new Map<string, RaAbetCsvItem[]>();
    for (const item of csvPreview) {
      porCompetencia.set(item.competencia, [...(porCompetencia.get(item.competencia) ?? []), item]);
    }
    return [...porCompetencia.entries()];
  }, [csvPreview]);

  const previewActualiza = csvPreview.filter((item) => existentes.has(item.codigo)).length;
  const previewNuevos = csvPreview.length - previewActualiza;

  const closeCsvModal = () => {
    setCsvModal(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setCsvPreview([]);
    setCsvError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseRaAbetCsv(decodeCsvBytes(e.target?.result as ArrayBuffer));
      if (result.ok) {
        setCsvPreview(result.items);
      } else {
        setCsvError(result.error);
      }
    };
    reader.onerror = () => setCsvError('No se pudo leer el archivo.');
    reader.readAsArrayBuffer(file);
  };

  const handleCsvImport = async () => {
    if (csvPreview.length === 0) return;
    setCsvLoading(true);
    setCsvError('');
    try {
      const result = await catalogoRaAbetApi.importar(csvPreview);
      await load();
      resetMessages();
      setMessage(`Importación completa: ${result.creados} nuevo(s), ${result.actualizados} actualizado(s).`);
      cancelEdit();
      closeCsvModal();
    } catch (err) {
      setCsvError(apiErrorMessage(err, 'No se pudo importar el catálogo.'));
    } finally {
      setCsvLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const renderEditCells = (isNew: boolean) => (
    <>
      <td className="px-3 py-2 align-top">
        {isNew ? (
          <input
            value={draft.codigo}
            onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))}
            placeholder="Ej: 2.1"
            aria-label="Código"
            maxLength={20}
            className={INPUT_CLASS}
            autoFocus
          />
        ) : (
          <span className="font-semibold text-[#9E0B0F]">{draft.codigo}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <input
          value={draft.so}
          onChange={(e) => setDraft((d) => ({ ...d, so: e.target.value }))}
          placeholder={deducirSo(draft.codigo) || 'Auto'}
          aria-label="SO"
          maxLength={20}
          className={INPUT_CLASS}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <textarea
          value={draft.competencia}
          onChange={(e) => setDraft((d) => ({ ...d, competencia: e.target.value }))}
          aria-label="Competencia"
          rows={2}
          className={INPUT_CLASS}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <textarea
          value={draft.descripcion}
          onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
          aria-label="Descripción"
          rows={2}
          className={INPUT_CLASS}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <input
          value={draft.programa}
          onChange={(e) => setDraft((d) => ({ ...d, programa: e.target.value }))}
          aria-label="Programa"
          maxLength={200}
          className={INPUT_CLASS}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={saveRow}
            disabled={saving}
            aria-label="Guardar"
            title="Guardar"
            className={`${ICON_BUTTON} hover:border-green-300 hover:text-green-700 disabled:opacity-50`}
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            aria-label="Cancelar"
            title="Cancelar"
            className={`${ICON_BUTTON} hover:border-gray-300 hover:text-gray-900`}
          >
            <X size={15} />
          </button>
        </div>
      </td>
    </>
  );

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f3f3f3] p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Student Outcomes</h1>
              <p className="mt-1 text-sm text-gray-500">
                Catálogo de resultados de aprendizaje ABET del programa, compartido por todas las asignaturas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="md" icon={<Upload size={16} />} onClick={() => setCsvModal(true)}>
                Importar CSV
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Plus size={16} />}
                onClick={startAdd}
                disabled={adding}
                className="rounded-xl bg-[#9E0B0F] hover:bg-[#82090d]"
              >
                Agregar
              </Button>
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

          <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-[#f5f5f5] text-[#9E0B0F]">
                  <tr>
                    <th className="w-28 px-3 py-3 font-semibold">Código</th>
                    <th className="w-24 px-3 py-3 font-semibold">SO</th>
                    <th className="w-56 px-3 py-3 font-semibold">Competencia</th>
                    <th className="px-3 py-3 font-semibold">Descripción</th>
                    <th className="w-52 px-3 py-3 font-semibold">Programa</th>
                    <th className="w-28 px-3 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {adding && <tr className="border-t border-[#e5e7eb] bg-[#9E0B0F]/[0.03]">{renderEditCells(true)}</tr>}

                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                        Cargando…
                      </td>
                    </tr>
                  ) : catalogo.length === 0 && !adding ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                        El catálogo está vacío. Impórtalo desde un CSV (Codigo,Competencia,Descripcion) o agrega los
                        resultados uno a uno.
                      </td>
                    </tr>
                  ) : (
                    catalogo.map((ra) =>
                      editingCodigo === ra.codigo ? (
                        <tr key={ra.codigo} className="border-t border-[#e5e7eb] bg-[#9E0B0F]/[0.03]">
                          {renderEditCells(false)}
                        </tr>
                      ) : (
                        <tr key={ra.codigo} className="border-t border-[#e5e7eb] hover:bg-[#9E0B0F]/[0.02]">
                          <td className="px-3 py-3 font-semibold text-[#9E0B0F]">{ra.codigo}</td>
                          <td className="px-3 py-3 text-gray-700">{ra.so}</td>
                          <td className="px-3 py-3 text-gray-700">{ra.competencia}</td>
                          <td className="px-3 py-3 text-gray-700">{ra.descripcion}</td>
                          <td className="px-3 py-3 text-gray-500">{ra.programa}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(ra)}
                                aria-label={`Editar ${ra.codigo}`}
                                title="Editar"
                                className={`${ICON_BUTTON} hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]`}
                              >
                                <PencilLine size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(ra)}
                                aria-label={`Eliminar ${ra.codigo}`}
                                title="Eliminar"
                                className={`${ICON_BUTTON} hover:border-red-300 hover:text-red-600`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal CSV */}
      <Modal open={csvModal} onClose={closeCsvModal} title="Importar Student Outcomes desde CSV" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-uao-mid transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleCsvSelect(f);
            }}
          >
            <p className="text-sm text-gray-500">
              {csvFile ? csvFile.name : 'Arrastra un CSV aquí o haz clic para seleccionar'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Formato: Codigo,Competencia,Descripcion (con encabezado)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvSelect(f); }}
            />
          </div>

          {csvPreview.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Vista previa: {previewNuevos} nuevo{previewNuevos !== 1 ? 's' : ''}, {previewActualiza} actualiza
                {previewActualiza !== 1 ? 'n' : ''}
              </p>
              <div className="max-h-72 overflow-y-auto border rounded-lg text-xs">
                {previewGrupos.map(([competencia, items]) => (
                  <div key={competencia} className="border-b last:border-b-0">
                    <div className="bg-gray-50 px-3 py-2 font-semibold text-gray-800">{competencia}</div>
                    {items.map((item) => (
                      <div key={item.codigo} className="flex items-start justify-between gap-4 px-3 py-2">
                        <span className="text-gray-700">
                          <span className="mr-2 font-medium text-[#9E0B0F]">{item.codigo}</span>
                          {item.descripcion}
                        </span>
                        {existentes.has(item.codigo) ? (
                          <Badge variant="warning">actualiza</Badge>
                        ) : (
                          <Badge variant="success">nuevo</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {previewActualiza > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Los códigos marcados "actualiza" ya existen: se reemplazarán su competencia, descripción y SO.
                </p>
              )}
            </div>
          )}

          {csvError && <p className="text-sm text-uao-accent">{csvError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeCsvModal}>Cancelar</Button>
            <Button onClick={handleCsvImport} loading={csvLoading} disabled={csvPreview.length === 0}>
              Importar
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
