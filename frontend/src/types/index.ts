export interface Docente {
  email: string;
  nombre: string;
}

/** Rango del reporte ABET: intervalo cerrado [minimo, maximo] en la escala 0-5. */
export interface RangoCalificacion {
  etiqueta: string;
  minimo: number;
  maximo: number;
}

/**
 * Entrada del catálogo global de Student Outcomes / RA ABET. Dos niveles:
 * - Resultado de Aprendizaje (P.I., ej. "2.1"): codigo_padre y peso en null.
 * - Criterio de Evaluación (ej. "2.1.1"): codigo_padre = su RA, 0 < peso <= 1.
 */
export interface RaAbet {
  codigo: string;
  so: string | null;
  competencia: string;
  descripcion: string;
  programa: string;
  codigo_padre: string | null;
  peso: number | null;
}

export interface Curso {
  id: number;
  nombre: string;
  codigo: string;
  periodo: string;
  docente_email: string;
  /** Códigos del catálogo RA ABET (ej. ["2.1", "4.2"]) */
  ra_abet: string[];
  rangos_calificacion: RangoCalificacion[];
  activo: boolean;
  created_at: string;
}

export interface Seccion {
  id: number;
  nombre: string;
  curso_id: number;
  activo: boolean;
  num_estudiantes?: number;
  total_estudiantes?: number;
}

export interface Estudiante {
  id: number;
  nombre_completo: string;
  codigo_estudiante: string;
  seccion_id: number;
}

export interface Actividad {
  id: number;
  nombre: string;
  tipo: 'individual' | 'grupal';
  peso_nota_final: number;
  curso_id: number;
  created_at: string;
  /** Suma de pesos de la rúbrica. El backend lo envía como Decimal serializado ("100.00"). */
  total_peso_criterios: number | string;
}

export function rubricaCompleta(a: Actividad): boolean {
  return Number(a.total_peso_criterios) === 100;
}

export interface Criterio {
  id: number;
  texto: string;
  peso_porcentaje: number;
  aspecto_id: number;
  orden: number;
}

export interface Aspecto {
  id: number;
  nombre: string;
  orden: number;
  criterios: Criterio[];
  /** Criterio de Evaluación del catálogo ABET vinculado (ej. "2.1.1"), opcional. */
  codigo_abet: string | null;
}

export interface CriteriosResponse {
  aspectos: Aspecto[];
  total_peso: number;
  /** Con calificaciones la rúbrica no se puede reemplazar; solo cambiar vínculos ABET. */
  tiene_calificaciones: boolean;
}

export interface EquipoTrabajo {
  id: number;
  nombre: string;
  actividad_id: number;
  seccion_id: number;
  miembros: Estudiante[];
  calificado: boolean;
  nota_total: number | null;
}

export interface ModoCalificacionItem {
  id: number;
  nombre: string;
  miembros: Estudiante[];
  calificado: boolean;
  nota_total: number | null;
}

export interface ModoCalificacionResponse {
  tipo: 'individual' | 'grupal';
  items: ModoCalificacionItem[];
  total: number;
  calificados: number;
}

export interface ResumenCalificacion {
  equipo_id: number | null;
  estudiante_id: number | null;
  nombre: string;
  nota_total: number | null;
  calificado: boolean;
  criterios_calificados: number;
  criterios_totales: number;
}

export interface CalificacionOut {
  id: number;
  criterio_id: number;
  valor: 0 | 1;
  nota_calculada: number;
  equipo_id: number | null;
  estudiante_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Distribución de estudiantes por rango del curso ({etiqueta: cantidad}). */
interface ReporteDistribucion {
  codigo: string;
  descripcion: string;
  rangos: Record<string, number>;
  /** Notas que caen en un hueco entre rangos */
  sin_clasificar: number;
  total: number;
}

/** Nivel Criterio ABET (ej. "2.1.1"). */
export interface ReporteCriterio extends ReporteDistribucion {
  codigo_padre: string | null;
  peso: number | null;
}

/** Nivel Resultado de Aprendizaje (ej. "2.1"). */
export interface ReporteRA extends ReporteDistribucion {
  criterios_con_evidencia: string[];
  criterios_sin_evidencia: string[];
}

export interface ReporteABETResponse {
  curso_id: number;
  curso_nombre: string;
  curso_codigo: string;
  periodo: string;
  docente_email: string;
  /** Rangos del curso, ordenados por mínimo */
  rangos: RangoCalificacion[];
  criterios: ReporteCriterio[];
  resultados: ReporteRA[];
}
