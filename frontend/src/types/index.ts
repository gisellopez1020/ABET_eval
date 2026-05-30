export interface Docente {
  email: string;
  nombre: string;
}

export interface Curso {
  id: number;
  nombre: string;
  codigo: string;
  periodo: string;
  docente_email: string;
  ra_abet: string[];
  activo: boolean;
  created_at: string;
}

export interface Seccion {
  id: number;
  nombre: string;
  curso_id: number;
  activo: boolean;
  num_estudiantes?: number;
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
