import { useEffect, useState } from 'react';

import { cursosApi } from '../../../api/cursos';
import { seccionesApi } from '../../../api/secciones';
import { estudiantesApi } from '../../../api/estudiantes';
import { useCourseStore } from '../../../store/courseStore';
import { Curso } from '../../../types';
import { SectionOption, StudentRow } from '../types';

// Asignaturas, secciones y estudiantes del docente, más el filtro de asignatura: loadAll
// lo ajusta (con el valor actual vía setCourseFilter(current => …)) para que siempre apunte
// a una asignatura que exista. La página llama a loadAll para recargar tras crear, editar
// o eliminar; se recrea en cada render, así que lee el selectedCourseId vigente.
export function useStudentsData() {
  const selectedCourseId = useCourseStore((state) => state.selectedCourseId);
  const [courses, setCourses] = useState<Curso[]>([]);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState<number | null>(selectedCourseId);

  // Recorrido cursos -> secciones -> estudiantes por sección (mismo patrón que ProjectsPage),
  // con las peticiones de cada nivel en paralelo.
  const loadAll = async () => {
    try {
      const cursos = await cursosApi.list();
      const seccionesPorCurso = await Promise.all(
        cursos.map(async (curso) => {
          const secciones = await seccionesApi.list(curso.id);
          return secciones.map((seccion): SectionOption => ({
            ...seccion,
            cursoNombre: curso.nombre,
            cursoPeriodo: curso.periodo,
          }));
        })
      );
      const secciones = seccionesPorCurso.flat();

      const estudiantesPorSeccion = await Promise.all(
        secciones.map(async (seccion) => {
          const estudiantes = await estudiantesApi.list(seccion.id);
          return estudiantes.map((estudiante): StudentRow => ({
            id: estudiante.id,
            nombre: estudiante.nombre_completo,
            codigo: estudiante.codigo_estudiante,
            email: estudiante.email ?? null,
            periodo: seccion.cursoPeriodo,
            promedio: estudiante.promedio ?? null,
            grupo: seccion.nombre,
            estado: 'activo',
            cursoId: seccion.curso_id,
            cursoNombre: seccion.cursoNombre,
            seccionId: seccion.id,
          }));
        })
      );

      setCourses(cursos);
      setSectionOptions(secciones);
      setStudents(estudiantesPorSeccion.flat());
      setCourseFilter((current) => {
        if (current !== null && cursos.some((curso) => curso.id === current)) {
          return current;
        }
        if (selectedCourseId !== null && cursos.some((curso) => curso.id === selectedCourseId)) {
          return selectedCourseId;
        }
        return cursos[0]?.id ?? null;
      });
    } catch (error) {
      console.error('Error cargando estudiantes:', error);
      setCourses([]);
      setSectionOptions([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  return { courses, sectionOptions, students, loading, loadAll, courseFilter, setCourseFilter };
}
