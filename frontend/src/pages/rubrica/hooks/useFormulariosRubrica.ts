import { Dispatch, SetStateAction, useState } from 'react';

import { criteriosApi } from '../../../api/criterios';
import { apiErrorMessage } from '../../../api/errors';
import { RaAbet } from '../../../types';
import { AspectoForm, CriterioForm, DraftAspecto, DraftCriterio, round2 } from '../rubricaDraft';

interface FormulariosRubricaOpciones {
  draft: DraftAspecto[];
  /** Reemplaza el borrador y lo marca con cambios sin guardar */
  updateDraft: (next: DraftAspecto[]) => void;
  /** Solo para el vínculo ABET de una rúbrica bloqueada (se guarda al instante, sin ensuciar) */
  setDraft: Dispatch<SetStateAction<DraftAspecto[]>>;
  bloqueada: boolean;
  selectedActividadId: number | null;
  porCodigoAbet: Map<string, RaAbet>;
  totalPeso: number;
  newKey: (prefix: string) => string;
  setSavedMsg: (msg: string) => void;
}

// Modales "Agregar / editar aspecto" (con su vínculo ABET) y "Agregar / editar criterio".
// El borrador es de la página: aquí llega en cada render (no se memoriza) y solo se cambia
// con updateDraft, o con setDraft(prev => …) tras guardar un vínculo.
export function useFormulariosRubrica({
  draft,
  updateDraft,
  setDraft,
  bloqueada,
  selectedActividadId,
  porCodigoAbet,
  totalPeso,
  newKey,
  setSavedMsg,
}: FormulariosRubricaOpciones) {
  const [vinculando, setVinculando] = useState(false);
  const [criterioForm, setCriterioForm] = useState<CriterioForm | null>(null);
  const [aspectoForm, setAspectoForm] = useState<AspectoForm | null>(null);
  const [formError, setFormError] = useState('');

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

  return {
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
  };
}
