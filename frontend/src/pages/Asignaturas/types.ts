import { Seccion } from '../../types';

/** Secciones y total de estudiantes de una asignatura (columnas Grupo y Estudiantes). */
export interface CourseStats {
  sections: Seccion[];
  students: number;
}

export type StatusFilter = 'todos' | 'activo' | 'cerrado';
