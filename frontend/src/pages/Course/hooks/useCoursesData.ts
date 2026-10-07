import { useEffect, useState } from 'react';

import { cursosApi } from '../../../api/cursos';
import { seccionesApi } from '../../../api/secciones';
import { estudiantesApi } from '../../../api/estudiantes';
import { Curso } from '../../../types';
import { CourseStats } from '../types';

// Asignaturas del docente con sus secciones y total de estudiantes. Se cargan al montar;
// la página llama a loadCourses para recargar (cerrar/reactivar) y usa setCourses para
// agregar una recién creada sin recargar.
export function useCoursesData() {
  const [courses, setCourses] = useState<Curso[]>([]);
  const [stats, setStats] = useState<Record<number, CourseStats>>({});
  const [loading, setLoading] = useState(true);

  const loadCourses = async () => {
    try {
      setLoading(true);

      const data = await cursosApi.list();

      setCourses(data);

      const statsMap: Record<number, CourseStats> = {};

      await Promise.all(
        data.map(async (course) => {
          try {
            const sections = await seccionesApi.list(course.id);

            let students = 0;

            await Promise.all(
              sections.map(async (section) => {
                try {
                  const sectionStudents = await estudiantesApi.list(
                    section.id
                  );

                  students += sectionStudents.length;
                } catch {

                }
              })
            );

            statsMap[course.id] = {
              sections,
              students,
            };
          } catch {
            statsMap[course.id] = {
              sections: [],
              students: 0,
            };
          }
        })
      );

      setStats(statsMap);
    } catch (error) {
      console.error('Error cargando asignaturas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  return { courses, setCourses, stats, loading, loadCourses };
}
