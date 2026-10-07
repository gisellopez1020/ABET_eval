import { FolderKanban, Users, CheckCircle2 } from 'lucide-react';

import { ProjectRow } from '../types';
import { ESTADO_BADGE, ESTADO_LABEL, projectEstado } from '../projectEstado';

interface ProjectCardProps {
  project: ProjectRow;
  onOpenDetails: (project: ProjectRow) => void;
}

export function ProjectCard({ project, onOpenDetails }: ProjectCardProps) {
  const progressColor = project.avance >= 80 ? 'bg-emerald-500' : project.avance >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <article
      className="cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => onOpenDetails(project)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetails(project);
        }
      }}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#9E0B0F]/10 text-[#9E0B0F]">
            <FolderKanban size={16} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{project.nombre}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-600">
                {project.actividadNombre}
              </span>
              <span>{project.seccionNombre}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${
              ESTADO_BADGE[projectEstado(project)]
            }`}
          >
            {ESTADO_LABEL[projectEstado(project)]}
          </span>
          {/* Sin rúbrica no hay avance que medir: "0%" sugeriría que falta calificar */}
          <span className="text-sm font-semibold text-gray-700">
            {project.criteriosTotales === 0 ? 'Sin rúbrica' : `${project.avance}%`}
          </span>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-gray-400" />
          <span>{project.miembros.length} miembros</span>
        </div>

        {project.calificado && (
          <div className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 size={14} />
            <span>Nota final: {project.notaTotal ?? 0}</span>
          </div>
        )}
      </div>

      <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${project.avance}%` }} />
      </div>

      <div className="flex flex-wrap gap-2">
        {project.miembros.length > 0 ? (
          project.miembros.map((member, index) => (
            <span
              key={`${member}-${index}`}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
            >
              {member}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-500">Sin miembros asociados</span>
        )}
      </div>
    </article>
  );
}
