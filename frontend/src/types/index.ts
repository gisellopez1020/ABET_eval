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

/** Entrada del catálogo global de Student Outcomes / RA ABET. */
export interface RaAbet {
  codigo: string;
  so: string | null;
  competencia: string;
  descripcion: string;
  programa: string;
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
}

export interface CriteriosResponse {
  aspectos: Aspecto[];
  total_peso: number;
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

export interface ReporteRA {
  ra: string;
  rangos: {
    '0.0-2.9': number;
    '3.0-3.9': number;
    '4.0-5.0': number;
  };
  total: number;
}

export interface ReporteABETResponse {
  curso_id: number;
  curso_nombre: string;
  curso_codigo: string;
  periodo: string;
  docente_email: string;
  resultados: ReporteRA[];
}
