import { EquipoTrabajo } from '../../types';

export type ProjectStatusFilter = 'all' | 'pendiente' | 'en-evaluacion' | 'evaluado';

export interface ProjectRow {
  id: number;
  nombre: string;
  cursoId: number;
  cursoNombre: string;
  seccionId: number;
  seccionNombre: string;
  actividadId: number;
  actividadNombre: string;
  miembros: string[];
  /** Para precargar la edición del equipo con sus integrantes actuales. */
  miembroIds: number[];
  /** Porcentaje de criterios calificados (0 si la actividad aún no tiene rúbrica). */
  avance: number;
  criteriosTotales: number;
  calificado: boolean;
  notaTotal: number | null;
}

export interface CreateProjectPayload {
  nombre: string;
  seccionId: number;
  actividadId: number;
  estudianteIds: number[];
}

// Fila de la lista a partir de un equipo: la usan la carga y la edición, así el avance
// se calcula igual en ambas
export function toProjectRow(
  team: EquipoTrabajo,
  context: Pick<ProjectRow, 'cursoId' | 'cursoNombre' | 'seccionId' | 'seccionNombre' | 'actividadId' | 'actividadNombre'>
): ProjectRow {
  const members = team.miembros.map(
    (member) => member.nombre_completo
  );

  // Proporción real de criterios calificados; sin rúbrica no hay nada que calificar todavía
  const avance = team.criterios_totales > 0
    ? Math.min(100, Math.round((team.criterios_calificados / team.criterios_totales) * 100))
    : 0;

  return {
    id: team.id,
    nombre: team.nombre,
    // Campo a campo: al editar, context es la fila anterior y no debe pisar nada más
    cursoId: context.cursoId,
    cursoNombre: context.cursoNombre,
    seccionId: context.seccionId,
    seccionNombre: context.seccionNombre,
    actividadId: context.actividadId,
    actividadNombre: context.actividadNombre,
    miembros: members,
    miembroIds: team.miembros.map((member) => member.id),
    avance,
    criteriosTotales: team.criterios_totales,
    calificado: team.calificado,
    notaTotal: team.nota_total,
  };
}
