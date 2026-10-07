import { Seccion } from '../../types';

export type StudentStatus = 'activo' | 'inactivo';

export interface StudentRow {
  id: number;
  nombre: string;
  codigo: string;
  email: string | null;
  periodo: string;
  promedio: number | null;
  grupo: string;
  estado: StudentStatus;
  cursoId: number;
  cursoNombre: string;
  seccionId: number;
}

/** Sección con el nombre y periodo de su asignatura (los nombres de sección se repiten entre cursos). */
export interface SectionOption extends Seccion {
  cursoNombre: string;
  cursoPeriodo: string;
}
