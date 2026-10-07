import { useId } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { ESTADO_BADGE, ESTADO_LABEL, projectEstado } from '../projectEstado';
import { ProjectRow } from '../types';

interface ProjectDetailDialogProps {
  project: ProjectRow;
  onClose: () => void;
  /** Abre la confirmación de eliminar encima del detalle */
  onDelete: () => void;
  /** Abre la edición encima del detalle */
  onEdit: () => void;
  /** Cierra el detalle y navega a evaluaciones */
  onEvaluate: () => void;
}

// Detalle de solo lectura de un equipo, con sus acciones
export function ProjectDetailDialog({ project, onClose, onDelete, onEdit, onEvaluate }: ProjectDetailDialogProps) {
  const titleId = useId();

  return (
        <Dialog
          open
          onClose={onClose}
          labelledBy={titleId}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          panelClassName="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 id={titleId} className="text-2xl font-semibold text-gray-900">Detalle del Proyecto</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${
                ESTADO_BADGE[projectEstado(project)]
              }`}
            >
              {ESTADO_LABEL[projectEstado(project)]}
            </span>

            {project.criteriosTotales === 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">
                Sin rúbrica
              </span>
            )}

            <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-700">
              {project.seccionNombre}
            </span>
          </div>

          <h4 className="mb-3 text-3xl font-bold leading-tight text-gray-900">
            {project.nombre}
          </h4>

          <p className="mb-5 text-base text-gray-700">
            Curso: {project.cursoNombre} · Actividad: {project.actividadNombre}
          </p>

          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h5 className="mb-3 text-lg font-semibold text-gray-800">Integrantes del grupo</h5>
            <div className="space-y-2">
              {project.miembros.length > 0 ? (
                project.miembros.map((member, index) => (
                  <div
                    key={`${member}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#9E0B0F] text-xs font-bold text-white">
                      {member
                        .split(' ')
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? '')
                        .join('') || 'U'}
                    </span>
                    <span className="text-base font-medium text-gray-800">{member}</span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-gray-500">Sin miembros asociados</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="danger"
              className="sm:mr-auto"
              onClick={onDelete}
            >
              <Trash2 size={16} />
              Eliminar equipo
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="outline" onClick={onEdit}>
              <Pencil size={16} />
              Editar equipo
            </Button>
            <Button variant="primary" onClick={onEvaluate}>
              Evaluar Proyecto
            </Button>
          </div>
        </Dialog>
  );
}
