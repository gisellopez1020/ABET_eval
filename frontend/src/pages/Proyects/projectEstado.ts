export type ProjectEstado = 'pendiente' | 'en-evaluacion' | 'evaluado';

// Estado de un equipo según su avance real: en evaluación desde el primer criterio calificado.
// Lo comparten la tarjeta, el detalle y el filtro de estado de ProjectsPage
export function projectEstado(project: { calificado: boolean; avance: number }): ProjectEstado {
  if (project.calificado) return 'evaluado';
  return project.avance > 0 ? 'en-evaluacion' : 'pendiente';
}

export const ESTADO_LABEL: Record<ProjectEstado, string> = {
  evaluado: 'Evaluado',
  'en-evaluacion': 'En evaluación',
  pendiente: 'Pendiente',
};

export const ESTADO_BADGE: Record<ProjectEstado, string> = {
  evaluado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'en-evaluacion': 'border-amber-200 bg-amber-50 text-amber-700',
  pendiente: 'border-red-200 bg-red-50 text-red-700',
};
