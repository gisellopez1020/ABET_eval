import { FolderKanban } from 'lucide-react';

import { ProjectRow } from '../types';
import { ProjectCard } from './ProjectCard';

interface ProjectsListProps {
  loading: boolean;
  /** Proyectos ya filtrados por búsqueda, sección y estado */
  filteredProjects: ProjectRow[];
  openProjectModal: (project: ProjectRow) => void;
}

// Contenido de ProjectsPage: esqueleto de carga, estado vacío o las tarjetas
export function ProjectsList({ loading, filteredProjects, openProjectModal }: ProjectsListProps) {
  const noProjects =
    !loading && filteredProjects.length === 0;

  return loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="
                  rounded-2xl border border-gray-200
                  bg-white p-5 shadow-sm
                "
              >
                <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />

                <div className="mt-4 h-3 w-full animate-pulse rounded bg-gray-100" />

                <div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : noProjects ? (
          <div
            className="
              rounded-2xl border 
              border-gray-300 bg-white
              p-10 text-center shadow-sm
            "
          >
            <FolderKanban
              size={42}
              className="mx-auto mb-3 text-gray-300"
            />

            <p className="text-base font-semibold text-gray-700">
              No hay proyectos disponibles
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Crea un equipo o una actividad grupal para ver
              los proyectos aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenDetails={openProjectModal}
              />
            ))}
          </div>
        );
}
