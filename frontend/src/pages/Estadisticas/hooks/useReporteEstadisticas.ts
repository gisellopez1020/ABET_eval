import { useEffect, useState } from 'react';

import { actividadesApi } from '../../../api/actividades';
import { cursosApi } from '../../../api/cursos';
import { apiErrorMessage } from '../../../api/errors';
import { reportesApi } from '../../../api/reportes';
import { seccionesApi } from '../../../api/secciones';
import { useCourseStore } from '../../../store/courseStore';
import { Actividad, Curso, ReporteABETResponse, ReporteActividadResponse, Seccion } from '../../../types';

// Selección en cascada (Asignatura -> Sección / Actividad) y el reporte que le corresponde.
// Cada efecto descarta su respuesta si la selección cambió mientras tanto (bandera `vigente`)
export function useReporteEstadisticas() {
  const cursoActivo = useCourseStore((s) => s.selectedCourseId);

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cursoId, setCursoId] = useState<number | null>(null);
  const [seccionId, setSeccionId] = useState<number | ''>('');
  const [actividadId, setActividadId] = useState<number | ''>('');

  const [reporte, setReporte] = useState<ReporteABETResponse | ReporteActividadResponse | null>(null);
  const [loadingCursos, setLoadingCursos] = useState(true);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cursos del docente; se preselecciona el activo del Dashboard si existe
  useEffect(() => {
    cursosApi
      .list()
      .then((lista) => {
        setCursos(lista);
        if (cursoActivo && lista.some((c) => c.id === cursoActivo)) setCursoId(cursoActivo);
      })
      .catch((e) => setError(apiErrorMessage(e, 'No se pudieron cargar tus asignaturas.')))
      .finally(() => setLoadingCursos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cascada: al cambiar de asignatura se cargan sus secciones y actividades
  useEffect(() => {
    setSecciones([]);
    setActividades([]);
    if (!cursoId) return;
    let vigente = true;
    Promise.all([seccionesApi.list(cursoId), actividadesApi.list(cursoId)])
      .then(([s, a]) => {
        if (!vigente) return;
        setSecciones(s);
        setActividades(a);
      })
      .catch((e) => vigente && setError(apiErrorMessage(e, 'No se pudieron cargar las secciones y actividades.')));
    return () => {
      vigente = false;
    };
  }, [cursoId]);

  // Reporte: agregado del curso con "Todas", o acotado a la actividad elegida
  useEffect(() => {
    setReporte(null);
    if (!cursoId) return;
    let vigente = true;
    const params = seccionId ? { seccion_id: seccionId } : undefined;
    setLoadingReporte(true);
    setError(null);
    (actividadId ? reportesApi.actividad(cursoId, actividadId, params) : reportesApi.abet(cursoId, params))
      .then((r) => vigente && setReporte(r))
      .catch((e) => vigente && setError(apiErrorMessage(e, 'No se pudo cargar el reporte.')))
      .finally(() => vigente && setLoadingReporte(false));
    return () => {
      vigente = false;
    };
  }, [cursoId, seccionId, actividadId]);

  const handleCurso = (value: string) => {
    setCursoId(value ? Number(value) : null);
    setSeccionId('');
    setActividadId('');
  };

  return {
    cursos,
    secciones,
    actividades,
    cursoId,
    seccionId,
    setSeccionId,
    actividadId,
    setActividadId,
    handleCurso,
    reporte,
    loadingCursos,
    loadingReporte,
    // Las exportaciones de la página escriben en el mismo aviso de error
    error,
    setError,
  };
}
