import { useEffect, useRef, useState } from 'react';

import { actividadesApi } from '../../../api/actividades';
import { calificacionesApi } from '../../../api/calificaciones';
import { criteriosApi } from '../../../api/criterios';
import { equiposApi } from '../../../api/equipos';
import { seccionesApi } from '../../../api/secciones';
import { Actividad, Aspecto, Curso, Seccion } from '../../../types';
import { ProjectOption } from '../types';

// Selección en cascada Asignatura -> Actividad grupal -> Equipo, y la rúbrica con las
// calificaciones guardadas del equipo elegido. selectCourse y selectActivity reciben lo
// que necesitan como argumentos (no lo leen del estado) y cada nivel descarta, con su
// contador courseRequest / activityRequest, las respuestas de selecciones anteriores.
// La carga inicial (lee la URL) vive en la página y llama a selectCourse.
export function useSeleccionEvaluacion() {
  // Selección propia de esta pantalla: no escribe en el store del Dashboard
  const [courses, setCourses] = useState<Curso[]>([]);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [sections, setSections] = useState<Seccion[]>([]);
  const [activities, setActivities] = useState<Actividad[]>([]); // solo grupales
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]); // equipos de la actividad elegida
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loading = loadingCourses || loadingCourse || loadingProjects;

  // Solo la última carga de cada nivel escribe el estado: si se cambia de asignatura o
  // de actividad mientras otra carga sigue en curso, su respuesta se descarta.
  const courseRequest = useRef(0);
  const activityRequest = useRef(0);
  const [aspectos, setAspectos] = useState<Aspecto[]>([]);
  // {criterio_id: valor} de las calificaciones guardadas del equipo; sin clave = sin calificar
  const [valores, setValores] = useState<Record<number, 0 | 1>>({});

  // Equipos de una actividad (todas las secciones en paralelo). preferProjectId: el de la URL, si aplica.
  const selectActivity = async (
    cursoActual: Curso,
    actividad: Actividad | null,
    secciones: Seccion[],
    preferProjectId?: number
  ) => {
    const request = ++activityRequest.current;
    const isStale = () => request !== activityRequest.current;

    setSelectedActivityId(actividad?.id ?? null);
    setProjects([]);
    setSelectedProjectId(null);
    if (!actividad) {
      setLoadingProjects(false);
      return;
    }

    setLoadingProjects(true);
    try {
      const porSeccion = await Promise.all(
        secciones.map(async (seccion) => {
          const equipos = await equiposApi.list(actividad.id, seccion.id);
          return equipos.map((equipo): ProjectOption => ({
            id: equipo.id,
            nombre: equipo.nombre,
            cursoId: cursoActual.id,
            cursoNombre: cursoActual.nombre,
            actividadId: actividad.id,
            actividadNombre: actividad.nombre,
            seccionId: seccion.id,
            seccionNombre: seccion.nombre,
            miembros: equipo.miembros.map((m) => m.nombre_completo),
            calificado: equipo.calificado,
            notaTotal: equipo.nota_total,
          }));
        })
      );
      if (isStale()) return;

      const resultados = porSeccion.flat();
      setProjects(resultados);
      const inicial = resultados.find((project) => project.id === preferProjectId) ?? resultados[0] ?? null;
      setSelectedProjectId(inicial?.id ?? null);
    } catch (error) {
      if (isStale()) return;
      console.error('Error cargando equipos de la actividad:', error);
      setLoadError('No se pudieron cargar los equipos de esta actividad.');
    } finally {
      if (!isStale()) setLoadingProjects(false);
    }
  };

  // Secciones y actividades grupales de una asignatura; luego los equipos de la actividad inicial.
  const selectCourse = async (
    cursoActual: Curso | null,
    prefer: { actividadId?: number; projectId?: number } = {}
  ) => {
    const request = ++courseRequest.current;
    const isStale = () => request !== courseRequest.current;
    activityRequest.current++; // invalida la carga de equipos de la asignatura anterior

    setCurso(cursoActual);
    setLoadError('');
    setSections([]);
    setActivities([]);
    setSelectedActivityId(null);
    setProjects([]);
    setSelectedProjectId(null);
    setLoadingProjects(false);
    if (!cursoActual) {
      setLoadingCourse(false);
      return;
    }

    setLoadingCourse(true);
    try {
      const [secciones, actividades] = await Promise.all([
        seccionesApi.list(cursoActual.id),
        actividadesApi.list(cursoActual.id),
      ]);
      if (isStale()) return;

      const grupales = actividades.filter((actividad) => actividad.tipo === 'grupal');
      setSections(secciones);
      setActivities(grupales);
      setLoadingCourse(false);

      const inicial = grupales.find((actividad) => actividad.id === prefer.actividadId) ?? grupales[0] ?? null;
      void selectActivity(cursoActual, inicial, secciones, prefer.projectId);
    } catch (error) {
      if (isStale()) return;
      console.error('Error cargando la asignatura:', error);
      setLoadError('No se pudieron cargar las actividades de esta asignatura.');
      setLoadingCourse(false);
    }
  };

  const handleCourseChange = (value: string) => {
    const nuevo = courses.find((c) => c.id === Number(value)) ?? null;
    void selectCourse(nuevo);
  };

  const handleActivityChange = (value: string) => {
    if (!curso) return;
    const actividad = activities.find((a) => a.id === Number(value)) ?? null;
    setLoadError('');
    void selectActivity(curso, actividad, sections);
  };

  useEffect(() => {
    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    setAspectos([]);
    setValores({});
    if (!selectedProject) {
      return;
    }

    // Si se cambia de proyecto antes de que responda, la respuesta anterior se descarta
    let cancelado = false;

    const loadCriterios = async () => {
      try {
        const [resp, calificaciones] = await Promise.all([
          criteriosApi.get(selectedProject.actividadId),
          calificacionesApi.equipo(selectedProject.actividadId, selectedProject.id),
        ]);
        if (cancelado) return;
        setAspectos(resp.aspectos);
        setValores(Object.fromEntries(calificaciones.map((c) => [c.criterio_id, c.valor])));
      } catch (error) {
        console.error('Error cargando rubrica del proyecto:', error);
      }
    };

    void loadCriterios();

    return () => {
      cancelado = true;
    };
  }, [projects, selectedProjectId]);

  return {
    courses,
    setCourses,
    curso,
    sections,
    activities,
    selectedActivityId,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    loadingCourses,
    setLoadingCourses,
    loadingCourse,
    loading,
    loadError,
    setLoadError,
    aspectos,
    valores,
    selectCourse,
    handleCourseChange,
    handleActivityChange,
  };
}
