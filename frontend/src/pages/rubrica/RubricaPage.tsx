import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PencilLine, Plus, Save, Trash2, Upload } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

import { actividadesApi } from '../../api/actividades';
import { criteriosApi } from '../../api/criterios';
import { cursosApi } from '../../api/cursos';
import { apiErrorMessage } from '../../api/errors';
import { useCourseStore } from '../../store/courseStore';
import { Actividad, Aspecto, Curso } from '../../types';
import { decodeCsvBytes, parseRubricaCsv, RubricaCsvAspecto } from './rubricaCsv';

// La rúbrica se edita como borrador local y se guarda completa de una sola vez:
// el backend (PUT /actividades/{id}/criterios) reemplaza todo y exige que los
// pesos sumen exactamente 100%.
interface DraftCriterio {
  key: string;
  texto: string;
  peso: number;
}

interface DraftAspecto {
  key: string;
  nombre: string;
  criterios: DraftCriterio[];
}

interface CriterioForm {
  aspectoKey: string;
  criterioKey: string | null; // null = crear, string = editar
  texto: string;
  peso: string;
}

interface AspectoForm {
  aspectoKey: string | null; // null = crear, string = renombrar
  nombre: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDraft(aspectos: Aspecto[]): DraftAspecto[] {
  return aspectos.map((aspecto) => ({
    key: `a${aspecto.id}`,
    nombre: aspecto.nombre,
    criterios: aspecto.criterios.map((criterio) => ({
      key: `c${criterio.id}`,
      texto: criterio.texto,
      peso: Number(criterio.peso_porcentaje),
    })),
  }));
}

function buildCodeName(aspectoIndex: number, criterioIndex: number) {
  return `${String.fromCharCode(65 + aspectoIndex)}.${criterioIndex + 1}`;
}

const SELECT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

export default function RubricaPage() {
  const navigate = useNavigate();
  const { actividadId } = useParams<{ actividadId: string }>();
  const parsedRouteId = actividadId ? Number(actividadId) : NaN;
  const routeActId = Number.isFinite(parsedRouteId) ? parsedRouteId : null;
  const { setSelectedCourse } = useCourseStore();

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState<number | null>(null);
  const [selectedActividadId, setSelectedActividadId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftAspecto[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const [criterioForm, setCriterioForm] = useState<CriterioForm | null>(null);
  const [aspectoForm, setAspectoForm] = useState<AspectoForm | null>(null);
  const [formError, setFormError] = useState('');

  const [csvModal, setCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<RubricaCsvAspecto[]>([]);
  const [csvError, setCsvError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const keySeq = useRef(0);
  const newKey = (prefix: string) => `${prefix}-new-${++keySeq.current}`;

  const loadCriterios = async (activityId: number | null) => {
    if (!activityId) {
      setDraft([]);
      setDirty(false);
      return;
    }
    const resp = await criteriosApi.get(activityId);
    setDraft(toDraft(resp.aspectos));
    setDirty(false);
  };

  // Carga inicial. Si la URL trae actividadId se precarga esa actividad (y su curso);
  // si no (/rubrica), se usa el curso guardado en el store y su primera actividad.
  useEffect(() => {
    // Cambio de URL provocado por los selectores: el estado ya está cargado.
    if (routeActId !== null && routeActId === selectedActividadId) return;

    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setError('');
      setSavedMsg('');
      try {
        const cursosData = await cursosApi.list();

        let courseId: number | null;
        if (routeActId !== null) {
          const actividad = await actividadesApi.get(routeActId);
          courseId = actividad.curso_id;
        } else {
          courseId = useCourseStore.getState().selectedCourseId ?? cursosData[0]?.id ?? null;
        }

        const actividadesData = courseId ? await actividadesApi.list(courseId) : [];
        const activityId = routeActId ?? actividadesData[0]?.id ?? null;
        const resp = activityId ? await criteriosApi.get(activityId) : null;
        if (cancelled) return;

        setCursos(cursosData);
        setSelectedCursoId(courseId);
        if (courseId) setSelectedCourse(courseId);
        setActividades(actividadesData);
        setSelectedActividadId(activityId);
        setDraft(resp ? toDraft(resp.aspectos) : []);
        setDirty(false);
      } catch (err) {
        console.error('Error cargando rúbrica:', err);
        if (!cancelled) setError(apiErrorMessage(err, 'No se pudo cargar la rúbrica desde el backend.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeActId]);

  const totalPeso = useMemo(
    () => round2(draft.reduce((sum, a) => sum + a.criterios.reduce((acc, c) => acc + c.peso, 0), 0)),
    [draft]
  );
  const totalCriterios = draft.reduce((sum, a) => sum + a.criterios.length, 0);
  const aspectosVacios = draft.filter((a) => a.criterios.length === 0);
  const canSave =
    !!selectedActividadId && dirty && !saving && totalPeso === 100 && aspectosVacios.length === 0;

  const selectedActividad = actividades.find((item) => item.id === selectedActividadId) ?? null;
  const selectedCurso = cursos.find((item) => item.id === selectedCursoId) ?? null;

  const confirmDiscard = () =>
    !dirty || window.confirm('Hay cambios sin guardar en la rúbrica. ¿Descartarlos?');

  const selectActividad = async (activityId: number | null) => {
    setError('');
    setSavedMsg('');
    setSelectedActividadId(activityId);
    try {
      await loadCriterios(activityId);
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo cargar la rúbrica de la actividad.'));
    }
    navigate(activityId ? `/actividades/${activityId}` : '/rubrica', { replace: true });
  };

  const selectCurso = async (courseId: number) => {
    setSelectedCursoId(courseId);
    setSelectedCourse(courseId);
    try {
      const actividadesData = await actividadesApi.list(courseId);
      setActividades(actividadesData);
      await selectActividad(actividadesData[0]?.id ?? null);
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudieron cargar las actividades.'));
    }
  };

  const updateDraft = (next: DraftAspecto[]) => {
    setDraft(next);
    setDirty(true);
    setSavedMsg('');
  };

  // ── Aspectos ────────────────────────────────────────────────────────────
  const openAspectoModal = (aspecto?: DraftAspecto) => {
    setFormError('');
    setAspectoForm({ aspectoKey: aspecto?.key ?? null, nombre: aspecto?.nombre ?? '' });
  };

  const submitAspecto = () => {
    if (!aspectoForm) return;
    const nombre = aspectoForm.nombre.trim();
    if (!nombre) {
      setFormError('El nombre del aspecto es obligatorio.');
      return;
    }
    if (aspectoForm.aspectoKey === null) {
      updateDraft([...draft, { key: newKey('a'), nombre, criterios: [] }]);
    } else {
      updateDraft(draft.map((a) => (a.key === aspectoForm.aspectoKey ? { ...a, nombre } : a)));
    }
    setAspectoForm(null);
  };

  const deleteAspecto = (aspecto: DraftAspecto) => {
    if (
      aspecto.criterios.length > 0 &&
      !window.confirm(`¿Eliminar el aspecto "${aspecto.nombre}" y sus ${aspecto.criterios.length} criterios?`)
    ) {
      return;
    }
    updateDraft(draft.filter((a) => a.key !== aspecto.key));
  };

  // ── Criterios ───────────────────────────────────────────────────────────
  const openCriterioModal = (aspecto: DraftAspecto, criterio?: DraftCriterio) => {
    setFormError('');
    const restante = round2(100 - totalPeso);
    setCriterioForm({
      aspectoKey: aspecto.key,
      criterioKey: criterio?.key ?? null,
      texto: criterio?.texto ?? '',
      peso: criterio ? String(criterio.peso) : String(restante > 0 ? restante : ''),
    });
  };

  const submitCriterio = () => {
    if (!criterioForm) return;
    const texto = criterioForm.texto.trim();
    const peso = round2(Number(criterioForm.peso));

    if (!texto) {
      setFormError('La descripción del criterio es obligatoria.');
      return;
    }
    if (Number.isNaN(peso) || peso <= 0 || peso > 100) {
      setFormError('El peso debe ser mayor que 0 y como máximo 100.');
      return;
    }

    const next = draft.map((a) => {
      if (a.key !== criterioForm.aspectoKey) return a;
      const criterios =
        criterioForm.criterioKey === null
          ? [...a.criterios, { key: newKey('c'), texto, peso }]
          : a.criterios.map((c) => (c.key === criterioForm.criterioKey ? { ...c, texto, peso } : c));
      return { ...a, criterios };
    });
    updateDraft(next);
    setCriterioForm(null);
  };

  const deleteCriterio = (aspectoKey: string, criterioKey: string) => {
    updateDraft(
      draft.map((a) =>
        a.key === aspectoKey ? { ...a, criterios: a.criterios.filter((c) => c.key !== criterioKey) } : a
      )
    );
  };

  // ── Importar CSV (solo rellena el borrador; se guarda con "Guardar rúbrica") ──
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
      const result = parseRubricaCsv(decodeCsvBytes(e.target?.result as ArrayBuffer));
      if (result.ok) {
        setCsvPreview(result.aspectos);
      } else {
        setCsvError(result.error);
      }
    };
    reader.onerror = () => setCsvError('No se pudo leer el archivo.');
    reader.readAsArrayBuffer(file);
  };

  const handleCsvImport = () => {
    if (csvPreview.length === 0 || !confirmDiscard()) return;
    updateDraft(
      csvPreview.map((aspecto) => ({
        key: newKey('a'),
        nombre: aspecto.nombre,
        criterios: aspecto.criterios.map((c) => ({ key: newKey('c'), texto: c.texto, peso: c.peso })),
      }))
    );
    closeCsvModal();
  };

  const csvTotal = round2(
    csvPreview.reduce((sum, a) => sum + a.criterios.reduce((acc, c) => acc + c.peso, 0), 0)
  );
  const csvCriterios = csvPreview.reduce((sum, a) => sum + a.criterios.length, 0);

  // ── Guardar ─────────────────────────────────────────────────────────────
  const saveRubrica = async () => {
    if (!selectedActividadId || !canSave) return;
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const payload = draft.map((aspecto, aspectoIndex) => ({
        nombre: aspecto.nombre,
        orden: aspectoIndex,
        criterios: aspecto.criterios.map((criterio, criterioIndex) => ({
          texto: criterio.texto,
          peso_porcentaje: criterio.peso,
          orden: criterioIndex,
        })),
      }));
      const response = await criteriosApi.save(selectedActividadId, payload);
      setDraft(toDraft(response.aspectos));
      setDirty(false);
      setSavedMsg('Rúbrica guardada.');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo guardar la rúbrica.'));
    } finally {
      setSaving(false);
    }
  };

  const estadoGuardado = (() => {
    if (!selectedActividad) return null;
    if (aspectosVacios.length > 0) {
      return `Agrega al menos un criterio a: ${aspectosVacios.map((a) => a.nombre).join(', ')}.`;
    }
    if (totalPeso < 100) return `Faltan ${round2(100 - totalPeso)}% para completar el 100%.`;
    if (totalPeso > 100) return `La suma excede el 100% por ${round2(totalPeso - 100)}%.`;
    if (dirty) return 'Cambios sin guardar.';
    return null;
  })();

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#f3f3f3] p-6">
          <div className="mx-auto max-w-[1200px] rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f3f3f3] p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Rúbricas y Criterios ABET</h1>
              <p className="mt-1 text-sm text-gray-500">
                {selectedActividad
                  ? `${selectedCurso ? `${selectedCurso.nombre} · ` : ''}Actividad: ${selectedActividad.nombre}`
                  : 'Sin actividad activa'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCursoId && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    if (confirmDiscard()) navigate(`/cursos/${selectedCursoId}`);
                  }}
                >
                  ← Volver al curso
                </Button>
              )}
              <Button
                variant="outline"
                size="md"
                icon={<Plus size={16} />}
                onClick={() => openAspectoModal()}
                disabled={!selectedActividad}
              >
                Agregar aspecto
              </Button>
              <Button
                variant="outline"
                size="md"
                icon={<Upload size={16} />}
                onClick={() => setCsvModal(true)}
                disabled={!selectedActividad}
              >
                Importar CSV
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Save size={16} />}
                className="rounded-xl bg-[#9E0B0F] hover:bg-[#82090d]"
                onClick={saveRubrica}
                loading={saving}
                disabled={!canSave}
                title={canSave ? undefined : 'La rúbrica debe sumar exactamente 100% y tener cambios sin guardar'}
              >
                Guardar rúbrica
              </Button>
            </div>
          </div>

          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Asignatura</span>
              <select
                value={selectedCursoId ?? ''}
                onChange={(event) => {
                  const courseId = Number(event.target.value);
                  if (courseId && confirmDiscard()) void selectCurso(courseId);
                }}
                className={SELECT_CLASS}
              >
                <option value="">Selecciona una asignatura</option>
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Actividad</span>
              <select
                value={selectedActividadId ?? ''}
                onChange={(event) => {
                  const activityId = Number(event.target.value);
                  if (activityId && confirmDiscard()) void selectActividad(activityId);
                }}
                className={SELECT_CLASS}
              >
                <option value="">Selecciona una actividad</option>
                {actividades.map((actividad) => (
                  <option key={actividad.id} value={actividad.id}>
                    {actividad.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {savedMsg}
            </div>
          )}

          <div className="mb-5 overflow-hidden rounded-[20px] bg-[#9E0B0F] p-5 text-white shadow-sm">
            <div className="mb-2 text-sm uppercase tracking-[0.14em] text-red-100">Resumen</div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Aspectos</div>
                <div className="mt-2 text-3xl font-bold">{draft.length}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Criterios</div>
                <div className="mt-2 text-3xl font-bold">{totalCriterios}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Peso total</div>
                <div className="mt-2 text-3xl font-bold">{totalPeso}%</div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-800">Rúbrica</h2>
              <div className="flex items-center gap-3">
                {estadoGuardado && <span className="text-xs text-gray-500">{estadoGuardado}</span>}
                <Badge variant={totalPeso === 100 ? 'success' : 'warning'}>
                  {totalPeso === 100 ? '100% completo' : `${totalPeso}%`}
                </Badge>
              </div>
            </div>

            {!selectedActividad ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                Selecciona una actividad para editar su rúbrica.
              </p>
            ) : draft.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="mb-4 text-sm text-gray-500">
                  Esta actividad aún no tiene rúbrica. Empieza agregando un aspecto.
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => openAspectoModal()}>
                    Agregar aspecto
                  </Button>
                  <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => setCsvModal(true)}>
                    Importar CSV
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {draft.map((aspecto, aspectoIndex) => {
                  const subtotal = round2(aspecto.criterios.reduce((acc, c) => acc + c.peso, 0));
                  return (
                    <section key={aspecto.key}>
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f5f5f5] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded-md bg-[#9E0B0F]/10 px-2 py-1 text-xs font-semibold text-[#9E0B0F]">
                            {String.fromCharCode(65 + aspectoIndex)}
                          </span>
                          <span className="font-semibold text-gray-800">{aspecto.nombre}</span>
                          <Badge variant="neutral">{subtotal}%</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<Plus size={14} />}
                            onClick={() => openCriterioModal(aspecto)}
                          >
                            Criterio
                          </Button>
                          <button
                            type="button"
                            aria-label={`Renombrar ${aspecto.nombre}`}
                            onClick={() => openAspectoModal(aspecto)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]"
                          >
                            <PencilLine size={15} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar ${aspecto.nombre}`}
                            onClick={() => deleteAspecto(aspecto)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {aspecto.criterios.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-gray-500">Sin criterios.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse text-left text-sm">
                            <tbody>
                              {aspecto.criterios.map((criterio, criterioIndex) => (
                                <tr key={criterio.key} className="border-t border-[#e5e7eb] hover:bg-[#9E0B0F]/[0.02]">
                                  <td className="w-20 px-4 py-3 font-semibold text-[#9E0B0F]">
                                    {buildCodeName(aspectoIndex, criterioIndex)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{criterio.texto}</td>
                                  <td className="w-24 px-4 py-3 text-right font-semibold text-gray-700">
                                    {criterio.peso}%
                                  </td>
                                  <td className="w-28 px-4 py-3">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        aria-label={`Editar ${criterio.texto}`}
                                        onClick={() => openCriterioModal(aspecto, criterio)}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]"
                                      >
                                        <PencilLine size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Eliminar ${criterio.texto}`}
                                        onClick={() => deleteCriterio(aspecto.key, criterio.key)}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={aspectoForm !== null}
        onClose={() => setAspectoForm(null)}
        title={aspectoForm?.aspectoKey ? 'Renombrar aspecto' : 'Agregar aspecto'}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <Input
            label="Nombre del aspecto"
            value={aspectoForm?.nombre ?? ''}
            onChange={(event) => setAspectoForm((prev) => (prev ? { ...prev, nombre: event.target.value } : prev))}
            placeholder="Ej: Identificación del problema"
            autoFocus
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAspectoForm(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitAspecto} className="bg-[#9E0B0F] hover:bg-[#82090d]">
              {aspectoForm?.aspectoKey ? 'Aplicar' : 'Agregar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={criterioForm !== null}
        onClose={() => setCriterioForm(null)}
        title={criterioForm?.criterioKey ? 'Editar criterio' : 'Agregar criterio'}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Aspecto: <span className="font-medium text-gray-700">
              {draft.find((a) => a.key === criterioForm?.aspectoKey)?.nombre}
            </span>
          </p>

          <Input
            label="Descripción del criterio"
            value={criterioForm?.texto ?? ''}
            onChange={(event) => setCriterioForm((prev) => (prev ? { ...prev, texto: event.target.value } : prev))}
            placeholder="Ej: Identifica y formula claramente el problema de ingeniería..."
            autoFocus
          />

          <Input
            label="Peso (%)"
            type="number"
            min={0.01}
            max={100}
            step="0.01"
            value={criterioForm?.peso ?? ''}
            onChange={(event) => setCriterioForm((prev) => (prev ? { ...prev, peso: event.target.value } : prev))}
            placeholder="20"
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCriterioForm(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitCriterio} className="bg-[#9E0B0F] hover:bg-[#82090d]">
              {criterioForm?.criterioKey ? 'Aplicar' : 'Agregar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal CSV */}
      <Modal open={csvModal} onClose={closeCsvModal} title="Importar rúbrica desde CSV" maxWidth="max-w-xl">
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
            <p className="text-xs text-gray-400 mt-1">Formato: Aspecto,Criterio,Peso (con encabezado)</p>
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
                Vista previa ({csvPreview.length} aspecto{csvPreview.length !== 1 ? 's' : ''}, {csvCriterios} criterio
                {csvCriterios !== 1 ? 's' : ''})
              </p>
              <div className="max-h-64 overflow-y-auto border rounded-lg text-xs">
                {csvPreview.map((aspecto, aspectoIndex) => {
                  const subtotal = round2(aspecto.criterios.reduce((acc, c) => acc + c.peso, 0));
                  return (
                    <div key={aspectoIndex} className="border-b last:border-b-0">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 font-semibold text-gray-800">
                        <span>
                          <span className="mr-2 text-[#9E0B0F]">{String.fromCharCode(65 + aspectoIndex)}</span>
                          {aspecto.nombre}
                        </span>
                        <span className="text-gray-500">{subtotal}%</span>
                      </div>
                      {aspecto.criterios.map((criterio, criterioIndex) => (
                        <div key={criterioIndex} className="flex items-start justify-between gap-4 px-3 py-2">
                          <span className="text-gray-700">
                            <span className="mr-2 font-medium text-[#9E0B0F]">
                              {buildCodeName(aspectoIndex, criterioIndex)}
                            </span>
                            {criterio.texto}
                          </span>
                          <span className="shrink-0 font-medium text-gray-700">{criterio.peso}%</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div
                className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                  csvTotal === 100 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                <span>
                  Total
                  {csvTotal < 100 && <span className="ml-2 font-normal">(faltan {round2(100 - csvTotal)}%)</span>}
                  {csvTotal > 100 && <span className="ml-2 font-normal">(excede {round2(csvTotal - 100)}%)</span>}
                </span>
                <span>{csvTotal}%</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Reemplazará el borrador actual. Nada se guarda hasta pulsar "Guardar rúbrica".
              </p>
            </div>
          )}

          {csvError && <p className="text-sm text-uao-accent">{csvError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeCsvModal}>Cancelar</Button>
            <Button onClick={handleCsvImport} disabled={csvPreview.length === 0}>
              Importar al borrador
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
