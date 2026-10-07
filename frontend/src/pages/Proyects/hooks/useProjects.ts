import { useRef, useState } from 'react';

import { cursosApi } from '../../../api/cursos';
import { seccionesApi } from '../../../api/secciones';
import { actividadesApi } from '../../../api/actividades';
import { equiposApi } from '../../../api/equipos';
import { Actividad, Seccion } from '../../../types';
import { ProjectRow, toProjectRow } from '../types';

// Secciones, actividades grupales y equipos de una asignatura. loadProjects recibe la
// asignatura como argumento (no la lee de un estado) y, junto con su contador loadRequest,
// descarta las respuestas de cargas anteriores. setProjects queda expuesto porque editar y
// eliminar cambian una sola fila sin recargar.
export function useProjects() {
  const [sections, setSections] = useState<Seccion[]>([]);
  const [activities, setActivities] = useState<Actividad[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Solo la última carga escribe el estado: si se cambia de asignatura mientras otra
  // carga sigue en curso, su respuesta (más lenta) se descarta.
  const loadRequest = useRef(0);

  const loadProjects = async (courseId: number | null) => {
    const request = ++loadRequest.current;
    const isStale = () => request !== loadRequest.current;

    if (!courseId) {
      setProjects([]);
      setSections([]);
      setActivities([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [courseList, courseSections, courseActivities] =
        await Promise.all([
          cursosApi.list(),
          seccionesApi.list(courseId),
          actividadesApi.list(courseId),
        ]);

      if (isStale()) return;

      const groupedActivities = courseActivities.filter(
        (activity) => activity.tipo === 'grupal'
      );

      const currentCourse = courseList.find(
        (course) => course.id === courseId
      );

      setSections(courseSections);
      setActivities(groupedActivities);

      if (groupedActivities.length === 0) {
        setProjects([]);
        return;
      }

      const projectResults: ProjectRow[] = [];

      for (const activity of groupedActivities) {
        for (const section of courseSections) {
          const teams = await equiposApi.list(
            activity.id,
            section.id
          );

          for (const team of teams) {
            projectResults.push(
              toProjectRow(team, {
                cursoId: courseId,
                cursoNombre: currentCourse?.nombre ?? 'Asignatura',
                seccionId: section.id,
                seccionNombre: section.nombre,
                actividadId: activity.id,
                actividadNombre: activity.nombre,
              })
            );
          }
        }
      }

      if (isStale()) return;

      setProjects(projectResults);
    } catch (error) {
      if (isStale()) return;
      console.error('Error cargando proyectos:', error);

      setProjects([]);
      setSections([]);
      setActivities([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  return { sections, activities, projects, setProjects, loading, setLoading, loadProjects };
}
