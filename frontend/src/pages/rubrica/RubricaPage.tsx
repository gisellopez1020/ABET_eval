import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Link2, Lock, PencilLine, Plus, Save, Trash2, Upload } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

import { actividadesApi } from '../../api/actividades';
import { catalogoRaAbetApi } from '../../api/catalogo';
import { criteriosApi } from '../../api/criterios';
import { cursosApi } from '../../api/cursos';
import { apiErrorMessage } from '../../api/errors';
import { useCourseStore } from '../../store/courseStore';
import { Actividad, Aspecto, Curso, RaAbet } from '../../types';
import { decodeCsvBytes, parseRubricaCsv, RubricaCsvAspecto } from './rubricaCsv';

// La rúbrica se edita como borrador local y se guarda completa de una sola vez:
// el backend (PUT /actividades/{id}/criterios) reemplaza todo y exige que los
// pesos sumen exactamente 100%. Cada aspecto puede vincularse a un Criterio ABET
// del catálogo (codigo_abet). Si la actividad ya tiene calificaciones la rúbrica
// queda bloqueada y solo se cambian esos vínculos, al instante, con PATCH.
interface DraftCriterio {
  key: string;
  texto: string;
  peso: number;
}

interface DraftAspecto {
  key: string;
  /** id en el backend (null si aún no se ha guardado); lo usa el PATCH del vínculo ABET */
  id: number | null;
  nombre: string;
  criterios: DraftCriterio[];
  codigo_abet: string | null;
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
  /** Paso 1 del vínculo: Resultado de Aprendizaje elegido ('' = sin vincular) */
  raPadre: string;
  /** Paso 2: Criterio de ese RA (el valor que se guarda en codigo_abet) */
  codigoAbet: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDraft(aspectos: Aspecto[]): DraftAspecto[] {
  return aspectos.map((aspecto) => ({
    key: `a${aspecto.id}`,
    id: aspecto.id,
    nombre: aspecto.nombre,
    codigo_abet: aspecto.codigo_abet ?? null,
    criterios: aspecto.criterios.map((criterio) => ({
      key: `c${criterio.id}`,
      texto: criterio.texto,
      peso: Number(criterio.peso_porcentaje),
    })),
  }));
}

const truncar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

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
  // Con calificaciones: la rúbrica no se puede reemplazar, solo cambiar vínculos ABET
  const [bloqueada, setBloqueada] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  // Catálogo ABET completo (RA y Criterios), no solo los RA del curso: el RA se agrega
  // al curso automáticamente al guardar el vínculo
  const [catalogo, setCatalogo] = useState<RaAbet[]>([]);

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
      setBloqueada(false);
      return;
    }
    const resp = await criteriosApi.get(activityId);
    setDraft(toDraft(resp.aspectos));
    setBloqueada(resp.tiene_calificaciones);
    setDirty(false);
  };

  useEffect(() => {
    catalogoRaAbetApi
      .list()
      .then(setCatalogo)
      .catch((err) => console.error('Error cargando el catálogo ABET:', err));
  }, []);

  const porCodigoAbet = useMemo(() => new Map(catalogo.map((ra) => [ra.codigo, ra])), [catalogo]);
  const raicesAbet = useMemo(() => catalogo.filter((ra) => ra.codigo_padre === null), [catalogo]);
  const descripcionAbet = (codigo: string | null) => (codigo ? porCodigoAbet.get(codigo)?.descripcion : undefined);

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
        setBloqueada(resp?.tiene_calificaciones ?? false);
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
    !!selectedActividadId &&
    !bloqueada &&
    dirty &&
    !saving &&
    totalPeso === 100 &&
    aspectosVacios.length === 0;

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
    const codigoAbet = aspecto?.codigo_abet ?? null;
    setAspectoForm({
      aspectoKey: aspecto?.key ?? null,
      nombre: aspecto?.nombre ?? '',
      // Al editar un aspecto ya vinculado, el paso 1 arranca en el RA padre de su código
      raPadre: (codigoAbet && porCodigoAbet.get(codigoAbet)?.codigo_padre) || '',
      codigoAbet,
    });
  };

  const submitAspecto = async () => {
    if (!aspectoForm) return;
    const nombre = aspectoForm.nombre.trim();
    if (!nombre) {
      setFormError('El nombre del aspecto es obligatorio.');
      return;
    }
    if (aspectoForm.raPadre && !aspectoForm.codigoAbet) {
      setFormError('Elige el Criterio del Resultado de Aprendizaje, o deja "Sin vincular".');
      return;
    }
    const codigoAbet = aspectoForm.raPadre ? aspectoForm.codigoAbet : null;

    if (bloqueada) {
      // Rúbrica con calificaciones: solo el vínculo, guardado al instante (sin reconstruir la rúbrica)
      const aspecto = draft.find((a) => a.key === aspectoForm.aspectoKey);
      if (!aspecto?.id || !selectedActividadId) return;
      setVinculando(true);
      setFormError('');
      try {
        const actualizado = await criteriosApi.vincularAbet(selectedActividadId, aspecto.id, codigoAbet);
        setDraft((prev) =>
          prev.map((a) => (a.key === aspecto.key ? { ...a, codigo_abet: actualizado.codigo_abet } : a))
        );
        setSavedMsg(
          actualizado.codigo_abet
            ? `"${aspecto.nombre}" vinculado a ${actualizado.codigo_abet}.`
            : `"${aspecto.nombre}" desvinculado.`
        );
        setAspectoForm(null);
      } catch (err) {
        setFormError(apiErrorMessage(err, 'No se pudo guardar el vínculo ABET.'));
      } finally {
        setVinculando(false);
      }
      return;
    }

    if (aspectoForm.aspectoKey === null) {
      updateDraft([...draft, { key: newKey('a'), id: null, nombre, criterios: [], codigo_abet: codigoAbet }]);
    } else {
      updateDraft(
        draft.map((a) => (a.key === aspectoForm.aspectoKey ? { ...a, nombre, codigo_abet: codigoAbet } : a))
      );
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
      // Con el catálogo se validan en el cliente los códigos ABET (el backend vuelve a validar)
      const result = parseRubricaCsv(decodeCsvBytes(e.target?.result as ArrayBuffer), catalogo);
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
        id: null,
        nombre: aspecto.nombre,
        codigo_abet: aspecto.codigo_abet,
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
        codigo_abet: aspecto.codigo_abet,
        criterios: aspecto.criterios.map((criterio, criterioIndex) => ({
          texto: criterio.texto,
          peso_porcentaje: criterio.peso,
          orden: criterioIndex,
        })),
      }));
      const response = await criteriosApi.save(selectedActividadId, payload);
      setDraft(toDraft(response.aspectos));
      setDirty(false);
      const vinculados = response.aspectos.filter((a) => a.codigo_abet).length;
      setSavedMsg(
        vinculados > 0
          ? `Rúbrica guardada. ${vinculados} aspecto(s) vinculado(s) a ABET; sus RA se agregaron a la asignatura si faltaban.`
          : 'Rúbrica guardada.'
      );
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo guardar la rúbrica.'));
    } finally {
      setSaving(false);
    }
  };

  const estadoGuardado = (() => {
    if (!selectedActividad || bloqueada) return null;
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
                disabled={!selectedActividad || bloqueada}
              >
                Agregar aspecto
              </Button>
              <Button
                variant="outline"
                size="md"
                icon={<Upload size={16} />}
                onClick={() => setCsvModal(true)}
                disabled={!selectedActividad || bloqueada}
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
                title={
                  bloqueada
                    ? 'La actividad ya tiene calificaciones: la rúbrica no se puede reemplazar'
                    : canSave
                      ? undefined
                      : 'La rúbrica debe sumar exactamente 100% y tener cambios sin guardar'
                }
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

          {bloqueada && selectedActividad && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <span>
                Esta actividad ya tiene calificaciones: su rúbrica no se puede modificar. Solo puedes cambiar el
                vínculo de cada aspecto con un Student Outcome (botón <Link2 size={13} className="inline" />), y se
                guarda al instante.
              </span>
            </div>
          )}
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <span>{savedMsg}</span>
              {/* Las actividades grupales necesitan equipos antes de calificar */}
              {selectedActividad?.tipo === 'grupal' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/proyectos?actividadId=${selectedActividad.id}`)}
                >
                  Ir a Proyectos y Equipos
                </Button>
              )}
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
                          {aspecto.codigo_abet && (
                            <span title={descripcionAbet(aspecto.codigo_abet)}>
                              <Badge variant="info">ABET {aspecto.codigo_abet}</Badge>
                            </span>
                          )}
                          <Badge variant="neutral">{subtotal}%</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {!bloqueada && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<Plus size={14} />}
                              onClick={() => openCriterioModal(aspecto)}
                            >
                              Criterio
                            </Button>
                          )}
                          <button
                            type="button"
                            aria-label={
                              bloqueada ? `Vincular ${aspecto.nombre} a Student Outcome` : `Editar ${aspecto.nombre}`
                            }
                            title={bloqueada ? 'Vincular a Student Outcome' : 'Editar aspecto'}
                            onClick={() => openAspectoModal(aspecto)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]"
                          >
                            {bloqueada ? <Link2 size={15} /> : <PencilLine size={15} />}
                          </button>
                          {!bloqueada && (
                            <button
                              type="button"
                              aria-label={`Eliminar ${aspecto.nombre}`}
                              onClick={() => deleteAspecto(aspecto)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
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
                                    <div className={`flex justify-end gap-2 ${bloqueada ? 'invisible' : ''}`}>
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
        title={
          bloqueada ? 'Vincular aspecto a Student Outcome' : aspectoForm?.aspectoKey ? 'Editar aspecto' : 'Agregar aspecto'
        }
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <Input
            label="Nombre del aspecto"
            value={aspectoForm?.nombre ?? ''}
            onChange={(event) => setAspectoForm((prev) => (prev ? { ...prev, nombre: event.target.value } : prev))}
            placeholder="Ej: Identificación del problema"
            disabled={bloqueada}
            autoFocus={!bloqueada}
          />

          <div className="space-y-3 rounded-xl border border-gray-200 bg-[#fafafa] p-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Vincular a Student Outcome (opcional)</p>
              <p className="text-xs text-gray-500">
                Si el Resultado de Aprendizaje aún no está en la asignatura, se agrega automáticamente al guardar.
              </p>
            </div>

            {catalogo.length === 0 ? (
              <p className="text-sm text-gray-500">
                El catálogo de Student Outcomes está vacío. Créalo o impórtalo en{' '}
                <Link to="/student-outcomes" className="font-medium text-[#9E0B0F] hover:underline">
                  Student Outcomes
                </Link>
                .
              </p>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700">
                  <span className="mb-1 block text-xs">1. Resultado de Aprendizaje</span>
                  <select
                    value={aspectoForm?.raPadre ?? ''}
                    onChange={(event) =>
                      setAspectoForm((prev) =>
                        prev ? { ...prev, raPadre: event.target.value, codigoAbet: null } : prev
                      )
                    }
                    autoFocus={bloqueada}
                    className={SELECT_CLASS}
                  >
                    <option value="">Sin vincular</option>
                    {raicesAbet.map((ra) => (
                      <option key={ra.codigo} value={ra.codigo}>
                        {ra.codigo} — {truncar(ra.descripcion, 80)}
                      </option>
                    ))}
                  </select>
                </label>

                {aspectoForm?.raPadre && (
                  <label className="block text-sm font-medium text-gray-700">
                    <span className="mb-1 block text-xs">2. Criterio de Evaluación</span>
                    <select
                      value={aspectoForm.codigoAbet ?? ''}
                      onChange={(event) =>
                        setAspectoForm((prev) => (prev ? { ...prev, codigoAbet: event.target.value || null } : prev))
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="">Elige un criterio</option>
                      {catalogo
                        .filter((c) => c.codigo_padre === aspectoForm.raPadre)
                        .map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.codigo} — {truncar(c.descripcion, 80)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                {aspectoForm?.codigoAbet && (
                  <p className="rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
                    <span className="font-semibold text-[#9E0B0F]">{aspectoForm.codigoAbet}</span>{' '}
                    {descripcionAbet(aspectoForm.codigoAbet)}
                  </p>
                )}
              </>
            )}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAspectoForm(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submitAspecto}
              loading={vinculando}
              className="bg-[#9E0B0F] hover:bg-[#82090d]"
            >
              {bloqueada ? 'Guardar vínculo' : aspectoForm?.aspectoKey ? 'Aplicar' : 'Agregar'}
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
            <p className="text-xs text-gray-400 mt-1">
              Formato: Aspecto,Criterio,Peso[,CodigoABET] (con encabezado). CodigoABET es opcional y debe ser el
              mismo en todas las filas de un aspecto.
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
                Vista previa ({csvPreview.length} aspecto{csvPreview.length !== 1 ? 's' : ''}, {csvCriterios} criterio
                {csvCriterios !== 1 ? 's' : ''})
              </p>
              <div className="max-h-64 overflow-y-auto border rounded-lg text-xs">
                {csvPreview.map((aspecto, aspectoIndex) => {
                  const subtotal = round2(aspecto.criterios.reduce((acc, c) => acc + c.peso, 0));
                  return (
                    <div key={aspectoIndex} className="border-b last:border-b-0">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 font-semibold text-gray-800">
                        <span className="flex items-center gap-2">
                          <span>
                            <span className="mr-2 text-[#9E0B0F]">{String.fromCharCode(65 + aspectoIndex)}</span>
                            {aspecto.nombre}
                          </span>
                          {aspecto.codigo_abet && (
                            <span title={descripcionAbet(aspecto.codigo_abet)}>
                              <Badge variant="info">ABET {aspecto.codigo_abet}</Badge>
                            </span>
                          )}
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
