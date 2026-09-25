import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CornerDownRight, PencilLine, Plus, Trash2, Upload, X } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { catalogoRaAbetApi, RaAbetCreate } from '../../api/catalogo';
import { apiErrorMessage } from '../../api/errors';
import { RaAbet } from '../../types';
import { decodeCsvBytes } from '../../utils/csv';
import { deducirSo, parsePesoCriterio, parseRaAbetCsv, RaAbetCsvItem, resumenPesos } from './raAbetCsv';

// Catálogo global de Student Outcomes / RA ABET, compartido por todos los cursos.
// Dos niveles: Resultado de Aprendizaje (P.I., ej. "2.1") y Criterio de Evaluación
// (ej. "2.1.1", con peso dentro de su RA). Cada fila se guarda al instante
// (POST/PUT/DELETE); la importación CSV usa /importar (todo o nada).
// Que los pesos de un RA no sumen 1.0 es solo una advertencia, nunca bloquea.

type Nivel = 'ra' | 'criterio';

interface RowDraft {
  codigo: string;
  so: string;
  competencia: string;
  descripcion: string;
  programa: string;
  codigo_padre: string;
  peso: string;
}

/** Fila en edición: `codigo` null = fila nueva. */
interface Editing {
  codigo: string | null;
  nivel: Nivel;
}

const PROGRAMA_DEFAULT = 'Ingeniería Informática';

const EMPTY_DRAFT: RowDraft = {
  codigo: '',
  so: '',
  competencia: '',
  descripcion: '',
  programa: PROGRAMA_DEFAULT,
  codigo_padre: '',
  peso: '',
};

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

const ICON_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition';

const COLUMNAS = 7;

const formatPeso = (n: number) => String(Number(n.toFixed(4)));

const toDraft = (ra: RaAbet): RowDraft => ({
  codigo: ra.codigo,
  so: ra.so ?? '',
  competencia: ra.competencia,
  descripcion: ra.descripcion,
  programa: ra.programa,
  codigo_padre: ra.codigo_padre ?? '',
  peso: ra.peso !== null ? formatPeso(ra.peso) : '',
});

/** Suma de pesos de los Criterios de un RA: advertencia si no es 1.0 (no bloquea nada). */
function PesosBadge({ pesos }: { pesos: number[] }) {
  if (pesos.length === 0) return null;
  const { suma, completo } = resumenPesos(pesos);
  return completo ? (
    <span className="text-xs text-gray-400" title="Los pesos de sus criterios suman 1.0">
      Σ 1.0
    </span>
  ) : (
    <span title="Los pesos de sus criterios no suman 1.0">
      <Badge variant="warning">Pesos: {formatPeso(suma)}/1.0</Badge>
    </span>
  );
}

function agruparPorPadre(items: RaAbet[]): Map<string, RaAbet[]> {
  const grupos = new Map<string, RaAbet[]>();
  for (const item of items) {
    if (item.codigo_padre === null) continue;
    grupos.set(item.codigo_padre, [...(grupos.get(item.codigo_padre) ?? []), item]);
  }
  return grupos;
}

export function StudentOutcomesPage() {
  const [catalogo, setCatalogo] = useState<RaAbet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<RowDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [addMenu, setAddMenu] = useState(false);

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

  const deleteRow = async (ra: RaAbet) => {
    const tipo = ra.codigo_padre === null ? 'el Resultado de Aprendizaje' : 'el Criterio';
    if (!window.confirm(`¿Eliminar ${tipo} "${ra.codigo}" del catálogo?`)) return;
    resetMessages();
    try {
      await catalogoRaAbetApi.delete(ra.codigo);
      setCatalogo((prev) => prev.filter((item) => item.codigo !== ra.codigo));
      setMessage(`"${ra.codigo}" eliminado.`);
    } catch (err) {
      // 409 si tiene Criterios hijos o algún curso lo usa en su ra_abet
      setError(apiErrorMessage(err, 'No se pudo eliminar.'));
    }
  };

  // ── Importar CSV ─────────────────────────────────────────────────────────
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
      // Se valida contra el catálogo actual: padres existentes y que nadie cambie de nivel
      const result = parseRaAbetCsv(decodeCsvBytes(e.target?.result as ArrayBuffer), catalogo);
      if (result.ok) {
        setCsvPreview(result.items);
      } else {
        setCsvError(result.error);
      }
    };
    reader.onerror = () => setCsvError('No se pudo leer el archivo.');
    reader.readAsArrayBuffer(file);
  };

  /** Vista previa agrupada por RA (del archivo o ya existente), con los pesos finales tras importar. */
  const previewGrupos = useMemo(() => {
    const enArchivo = new Map(csvPreview.map((item) => [item.codigo, item]));
    const orden: string[] = [];
    for (const item of csvPreview) {
      const ra = item.codigo_padre ?? item.codigo;
      if (!orden.includes(ra)) orden.push(ra);
    }
    return orden.map((codigoRa) => {
      const delArchivo = enArchivo.get(codigoRa);
      const existente = porCodigo.get(codigoRa);
      const criterios = csvPreview.filter((item) => item.codigo_padre === codigoRa);
      // Pesos tras importar: los del archivo + los Criterios existentes de ese RA que el archivo no toca
      const pesosFinales = [
        ...criterios.map((c) => c.peso ?? 0),
        ...(hijosPorPadre.get(codigoRa) ?? []).filter((c) => !enArchivo.has(c.codigo)).map((c) => c.peso ?? 0),
      ];
      return {
        codigo: codigoRa,
        descripcion: delArchivo?.descripcion ?? existente?.descripcion ?? '',
        estado: delArchivo ? (existente ? 'actualiza' : 'nuevo') : 'existente',
        criterios,
        pesosFinales,
      } as const;
    });
  }, [csvPreview, porCodigo, hijosPorPadre]);

  const previewActualiza = csvPreview.filter((item) => porCodigo.has(item.codigo)).length;
  const previewNuevos = csvPreview.length - previewActualiza;

  const handleCsvImport = async () => {
    if (csvPreview.length === 0) return;
    setCsvLoading(true);
    setCsvError('');
    try {
      const result = await catalogoRaAbetApi.importar(
        csvPreview.map((item) => ({
          codigo: item.codigo,
          so: item.so,
          competencia: item.competencia,
          descripcion: item.descripcion,
          ...(item.codigo_padre !== null ? { codigo_padre: item.codigo_padre, peso: item.peso ?? undefined } : {}),
        }))
      );
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
  const estadoBadge = (estado: 'nuevo' | 'actualiza' | 'existente') =>
    estado === 'nuevo' ? (
      <Badge variant="success">nuevo</Badge>
    ) : estado === 'actualiza' ? (
      <Badge variant="warning">actualiza</Badge>
    ) : (
      <Badge variant="neutral">ya en el catálogo</Badge>
    );

  const renderEditRow = () => {
    if (!editing) return null;
    const esNuevo = editing.codigo === null;
    const esCriterio = editing.nivel === 'criterio';
    const padre = esCriterio ? porCodigo.get(draft.codigo_padre) : undefined;

    return (
      <tr key={editing.codigo ?? '__nuevo__'} className="border-t border-[#e5e7eb] bg-[#9E0B0F]/[0.03]">
        <td className="px-3 py-2 align-top">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            {esCriterio ? 'Criterio' : 'Resultado de Aprendizaje'}
          </p>
          {esNuevo ? (
            <input
              value={draft.codigo}
              onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))}
              placeholder={esCriterio ? 'Ej: 2.1.1' : 'Ej: 2.1'}
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
            placeholder={esCriterio ? padre?.competencia ?? 'Hereda la del RA' : ''}
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
          {esCriterio ? (
            <div className="space-y-1.5">
              <select
                value={draft.codigo_padre}
                onChange={(e) => setDraft((d) => ({ ...d, codigo_padre: e.target.value }))}
                aria-label="RA padre"
                className={INPUT_CLASS}
              >
                {raices.map((ra) => (
                  <option key={ra.codigo} value={ra.codigo}>
                    RA {ra.codigo}
                  </option>
                ))}
              </select>
              <input
                value={draft.peso}
                onChange={(e) => setDraft((d) => ({ ...d, peso: e.target.value }))}
                inputMode="decimal"
                placeholder="0.4 o 40%"
                aria-label="Peso"
                className={INPUT_CLASS}
              />
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )}
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
      </tr>
    );
  };

  const renderAcciones = (ra: RaAbet) => (
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
  );

  const renderCriterio = (criterio: RaAbet, ra: RaAbet) =>
    editing?.codigo === criterio.codigo ? (
      renderEditRow()
    ) : (
      <tr key={criterio.codigo} className="border-t border-[#f0f0f0] bg-gray-50/60 hover:bg-[#9E0B0F]/[0.02]">
        <td className="py-2.5 pl-6 pr-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
            <CornerDownRight size={13} className="text-gray-400" />
            {criterio.codigo}
          </span>
        </td>
        <td className="px-3 py-2.5 text-gray-500">{criterio.so}</td>
        <td className="px-3 py-2.5 text-gray-500">
          {criterio.competencia === ra.competencia ? (
            <span className="text-xs text-gray-400">(la del RA)</span>
          ) : (
            criterio.competencia
          )}
        </td>
        <td className="px-3 py-2.5 text-gray-700">{criterio.descripcion}</td>
        <td className="px-3 py-2.5 font-medium text-gray-700">{formatPeso(criterio.peso ?? 0)}</td>
        <td className="px-3 py-2.5 text-gray-500">{criterio.programa}</td>
        <td className="px-3 py-2.5">{renderAcciones(criterio)}</td>
      </tr>
    );

  const renderRa = (ra: RaAbet) => {
    const criterios = hijosPorPadre.get(ra.codigo) ?? [];
    return [
      editing?.codigo === ra.codigo ? (
        renderEditRow()
      ) : (
        <tr key={ra.codigo} className="border-t border-[#e5e7eb] hover:bg-[#9E0B0F]/[0.02]">
          <td className="px-3 py-3 font-semibold text-[#9E0B0F]">{ra.codigo}</td>
          <td className="px-3 py-3 text-gray-700">{ra.so}</td>
          <td className="px-3 py-3 text-gray-700">{ra.competencia}</td>
          <td className="px-3 py-3 text-gray-700">{ra.descripcion}</td>
          <td className="px-3 py-3">
            <PesosBadge pesos={criterios.map((c) => c.peso ?? 0)} />
          </td>
          <td className="px-3 py-3 text-gray-500">{ra.programa}</td>
          <td className="px-3 py-3">{renderAcciones(ra)}</td>
        </tr>
      ),
      ...criterios.map((criterio) => renderCriterio(criterio, ra)),
    ];
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f3f3f3] p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Student Outcomes</h1>
              <p className="mt-1 text-sm text-gray-500">
                Catálogo de Resultados de Aprendizaje ABET del programa y sus Criterios de Evaluación, compartido por
                todas las asignaturas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="md" icon={<Upload size={16} />} onClick={() => setCsvModal(true)}>
                Importar CSV
              </Button>
              <div className="relative">
                <Button
                  variant="primary"
                  size="md"
                  icon={<Plus size={16} />}
                  onClick={() => setAddMenu((v) => !v)}
                  disabled={editing?.codigo === null}
                  aria-haspopup="menu"
                  aria-expanded={addMenu}
                  className="rounded-xl bg-[#9E0B0F] hover:bg-[#82090d]"
                >
                  Agregar
                  <ChevronDown size={14} />
                </Button>
                {addMenu && (
                  <>
                    {/* Capa invisible para cerrar el menú al hacer clic fuera */}
                    <div className="fixed inset-0 z-10" onClick={() => setAddMenu(false)} />
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => startAdd('ra')}
                        className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="block text-sm font-medium text-gray-900">Resultado de Aprendizaje</span>
                        <span className="block text-xs text-gray-500">Nivel superior (P.I.), ej. 2.1</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => startAdd('criterio')}
                        disabled={raices.length === 0}
                        className="block w-full border-t border-gray-100 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="block text-sm font-medium text-gray-900">Criterio de Evaluación</span>
                        <span className="block text-xs text-gray-500">
                          {raices.length === 0
                            ? 'Primero crea un Resultado de Aprendizaje'
                            : 'Dentro de un RA, con su peso, ej. 2.1.1'}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
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
                    <th className="w-32 px-3 py-3 font-semibold">Código</th>
                    <th className="w-20 px-3 py-3 font-semibold">SO</th>
                    <th className="w-56 px-3 py-3 font-semibold">Competencia</th>
                    <th className="px-3 py-3 font-semibold">Descripción</th>
                    <th className="w-36 px-3 py-3 font-semibold">Peso</th>
                    <th className="w-44 px-3 py-3 font-semibold">Programa</th>
                    <th className="w-28 px-3 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {editing?.codigo === null && renderEditRow()}

                  {loading ? (
                    <tr>
                      <td colSpan={COLUMNAS} className="px-4 py-10 text-center text-gray-400">
                        Cargando…
                      </td>
                    </tr>
                  ) : catalogo.length === 0 && editing?.codigo !== null ? (
                    <tr>
                      <td colSpan={COLUMNAS} className="px-4 py-10 text-center text-gray-500">
                        El catálogo está vacío. Impórtalo desde un CSV (Codigo,Competencia,Descripcion,CodigoPadre,Peso)
                        o agrega los resultados uno a uno.
                      </td>
                    </tr>
                  ) : (
                    raices.flatMap(renderRa)
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
            <p className="text-xs text-gray-400 mt-1">
              Formato: Codigo,Competencia,Descripcion,CodigoPadre,Peso (con encabezado). CodigoPadre y Peso van vacíos
              en los Resultados de Aprendizaje; el peso acepta 0,4 o 40%.
            </p>
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
              <div className="max-h-80 overflow-y-auto border rounded-lg text-xs">
                {previewGrupos.map((grupo) => (
                  <div key={grupo.codigo} className="border-b last:border-b-0">
                    <div className="flex items-start justify-between gap-3 bg-gray-50 px-3 py-2">
                      <span className="text-gray-800">
                        <span className="mr-2 font-semibold text-[#9E0B0F]">{grupo.codigo}</span>
                        {grupo.descripcion}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <PesosBadge pesos={grupo.pesosFinales} />
                        {estadoBadge(grupo.estado)}
                      </span>
                    </div>
                    {grupo.criterios.map((item) => (
                      <div key={item.codigo} className="flex items-start justify-between gap-4 py-2 pl-7 pr-3">
                        <span className="text-gray-700">
                          <span className="mr-2 font-medium text-gray-800">{item.codigo}</span>
                          {item.descripcion}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-medium text-gray-700">{formatPeso(item.peso ?? 0)}</span>
                          {estadoBadge(porCodigo.has(item.codigo) ? 'actualiza' : 'nuevo')}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {previewActualiza > 0 && 'Los códigos marcados "actualiza" ya existen: se reemplazarán sus datos. '}
                Si los pesos de un RA no suman 1.0 se importa igual; solo verás la advertencia.
              </p>
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
