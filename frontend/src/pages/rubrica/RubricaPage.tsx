import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AppLayout } from '../../components/Layout/AppLayout';
import { actividadesApi } from '../../api/actividades';
import { catalogoRaAbetApi } from '../../api/catalogo';
import { criteriosApi } from '../../api/criterios';
import { cursosApi } from '../../api/cursos';
import { apiErrorMessage } from '../../api/errors';
import { useCourseStore } from '../../store/courseStore';
import { Actividad, Curso, RaAbet } from '../../types';
import { AspectoFormModal } from './components/AspectoFormModal';
import { CriterioFormModal } from './components/CriterioFormModal';
import { DeleteAspectoModal } from './components/DeleteAspectoModal';
import { DiscardChangesModal } from './components/DiscardChangesModal';
import { ImportRubricaModal } from './components/ImportRubricaModal';
import { ResumenRubrica } from './components/ResumenRubrica';
import { RubricaAvisos } from './components/RubricaAvisos';
import { RubricaEncabezado } from './components/RubricaEncabezado';
import { RubricaSelectores } from './components/RubricaSelectores';
import { RubricaTabla } from './components/RubricaTabla';
import { useFormulariosRubrica } from './hooks/useFormulariosRubrica';
import { useRubricaImport } from './hooks/useRubricaImport';
import { DraftAspecto, round2, toDraft } from './rubricaDraft';

// La rúbrica se edita como borrador local y se guarda completa de una sola vez:
// el backend (PUT /actividades/{id}/criterios) reemplaza todo y exige que los
// pesos sumen exactamente 100%. Cada aspecto puede vincularse a un Criterio ABET
// del catálogo (codigo_abet). Si la actividad ya tiene calificaciones la rúbrica
// queda bloqueada y solo se cambian esos vínculos, al instante, con PATCH.
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

  // Catálogo ABET completo (RA y Criterios), no solo los RA del curso: el RA se agrega
  // al curso automáticamente al guardar el vínculo
  const [catalogo, setCatalogo] = useState<RaAbet[]>([]);

  // Aspecto con criterios pendiente de eliminar (modal de confirmación; solo afecta al borrador)
  const [aspectoAEliminar, setAspectoAEliminar] = useState<DraftAspecto | null>(null);
  // Acción (navegar / cambiar de curso o actividad) en espera de confirmar el descarte de cambios
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);

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

  // Guarda de cambios sin guardar: sin cambios, la acción corre de inmediato; con cambios,
  // queda pendiente hasta que el usuario la confirma en el modal (no puede bloquear como confirm())
  const requestDiscard = (accion: () => void) => {
    if (!dirty) {
      accion();
      return;
    }
    setPendingDiscard(() => accion);
  };

  const confirmPendingDiscard = () => {
    const accion = pendingDiscard;
    setPendingDiscard(null);
    accion?.();
  };

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

  const {
    aspectoForm,
    setAspectoForm,
    criterioForm,
    setCriterioForm,
    formError,
    vinculando,
    openAspectoModal,
    submitAspecto,
    openCriterioModal,
    submitCriterio,
  } = useFormulariosRubrica({
    draft,
    updateDraft,
    setDraft,
    bloqueada,
    selectedActividadId,
    porCodigoAbet,
    totalPeso,
    newKey,
    setSavedMsg,
  });

  // ── Aspectos ────────────────────────────────────────────────────────────

  const deleteAspecto = (aspecto: DraftAspecto) => {
    // Sin criterios se elimina directamente, como antes; con criterios se confirma en el modal
    if (aspecto.criterios.length > 0) {
      setAspectoAEliminar(aspecto);
      return;
    }
    updateDraft(draft.filter((a) => a.key !== aspecto.key));
  };

  const confirmDeleteAspecto = () => {
    if (!aspectoAEliminar) return;
    updateDraft(draft.filter((a) => a.key !== aspectoAEliminar.key));
    setAspectoAEliminar(null);
  };

  // ── Criterios ───────────────────────────────────────────────────────────

  const deleteCriterio = (aspectoKey: string, criterioKey: string) => {
    updateDraft(
      draft.map((a) =>
        a.key === aspectoKey ? { ...a, criterios: a.criterios.filter((c) => c.key !== criterioKey) } : a
      )
    );
  };

  // ── Importar CSV / Excel (solo rellena el borrador; se guarda con "Guardar rúbrica") ──
  const {
    csvModal,
    importFormato,
    csvFile,
    fileRef,
    csvPreview,
    csvCriterios,
    csvTotal,
    excelLoading,
    csvError,
    csvConfirmDiscard,
    setCsvConfirmDiscard,
    closeCsvModal,
    openImportModal,
    handleFileSelect,
    handleCsvImport,
  } = useRubricaImport(catalogo, selectedActividadId, dirty, (aspectos) =>
    updateDraft(
      aspectos.map((aspecto) => ({
        key: newKey('a'),
        id: null,
        nombre: aspecto.nombre,
        codigo_abet: aspecto.codigo_abet,
        criterios: aspecto.criterios.map((c) => ({ key: newKey('c'), texto: c.texto, peso: c.peso })),
      }))
    )
  );

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
      <div className="p-6">
        <div className="mx-auto max-w-[1280px]">
          <RubricaEncabezado
            selectedActividad={selectedActividad}
            selectedCurso={selectedCurso}
            selectedCursoId={selectedCursoId}
            bloqueada={bloqueada}
            requestDiscard={requestDiscard}
            openAspectoModal={openAspectoModal}
            openImportModal={openImportModal}
            saveRubrica={saveRubrica}
            saving={saving}
            canSave={canSave}
          />

          <RubricaSelectores
            cursos={cursos}
            actividades={actividades}
            selectedCursoId={selectedCursoId}
            selectedActividadId={selectedActividadId}
            onCurso={(courseId) => requestDiscard(() => void selectCurso(courseId))}
            onActividad={(activityId) => requestDiscard(() => void selectActividad(activityId))}
          />

          <RubricaAvisos bloqueada={bloqueada} selectedActividad={selectedActividad} error={error} savedMsg={savedMsg} />

          <ResumenRubrica totalAspectos={draft.length} totalCriterios={totalCriterios} totalPeso={totalPeso} />

          <RubricaTabla
            selectedActividad={selectedActividad}
            draft={draft}
            bloqueada={bloqueada}
            totalPeso={totalPeso}
            estadoGuardado={estadoGuardado}
            descripcionAbet={descripcionAbet}
            openAspectoModal={openAspectoModal}
            openImportModal={openImportModal}
            openCriterioModal={openCriterioModal}
            deleteAspecto={deleteAspecto}
            deleteCriterio={deleteCriterio}
          />
        </div>
      </div>

      <AspectoFormModal
        aspectoForm={aspectoForm}
        setAspectoForm={setAspectoForm}
        bloqueada={bloqueada}
        catalogo={catalogo}
        raicesAbet={raicesAbet}
        descripcionAbet={descripcionAbet}
        formError={formError}
        vinculando={vinculando}
        submitAspecto={submitAspecto}
      />

      <CriterioFormModal
        criterioForm={criterioForm}
        setCriterioForm={setCriterioForm}
        draft={draft}
        formError={formError}
        submitCriterio={submitCriterio}
      />

      {/* Modal CSV / Excel */}
      <ImportRubricaModal
        csvModal={csvModal}
        closeCsvModal={closeCsvModal}
        importFormato={importFormato}
        csvFile={csvFile}
        fileRef={fileRef}
        handleFileSelect={handleFileSelect}
        csvPreview={csvPreview}
        csvCriterios={csvCriterios}
        csvTotal={csvTotal}
        descripcionAbet={descripcionAbet}
        excelLoading={excelLoading}
        csvError={csvError}
        csvConfirmDiscard={csvConfirmDiscard}
        setCsvConfirmDiscard={setCsvConfirmDiscard}
        handleCsvImport={handleCsvImport}
      />

      {/* Modal eliminar aspecto */}
      <DeleteAspectoModal
        aspectoAEliminar={aspectoAEliminar}
        setAspectoAEliminar={setAspectoAEliminar}
        confirmDeleteAspecto={confirmDeleteAspecto}
      />

      {/* Modal descartar cambios sin guardar */}
      <DiscardChangesModal
        pendingDiscard={pendingDiscard}
        setPendingDiscard={setPendingDiscard}
        confirmPendingDiscard={confirmPendingDiscard}
      />
    </AppLayout>
  );
}
