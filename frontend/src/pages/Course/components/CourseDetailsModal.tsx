import { BookOpen, CalendarDays, Layers3, Users, X } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Curso } from '../../../types';

interface CourseStats {
  sections: Array<{ id: number; nombre: string }>;
  students: number;
}

interface CourseDetailsModalProps {
  course: Curso | null;
  stats: CourseStats;
  onClose: () => void;
  onEdit: (course: Curso) => void;
}

export function CourseDetailsModal({ course, stats, onClose, onEdit }: CourseDetailsModalProps) {
  if (!course) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-[#fafafa] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9E0B0F]">Asignatura</p>
            <h2 className="mt-1 text-2xl font-semibold text-gray-900">{course.nombre}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800"
            aria-label="Cerrar detalle de asignatura"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <BookOpen size={16} className="text-[#9E0B0F]" />
                Código
              </div>
              <p className="text-lg font-medium text-gray-900">{course.codigo}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <CalendarDays size={16} className="text-[#9E0B0F]" />
                Período
              </div>
              <p className="text-lg font-medium text-gray-900">{course.periodo}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Layers3 size={16} className="text-[#9E0B0F]" />
                Secciones
              </div>
              <p className="text-lg font-medium text-gray-900">{stats.sections.length}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Users size={16} className="text-[#9E0B0F]" />
                Estudiantes
              </div>
              <p className="text-lg font-medium text-gray-900">{stats.students}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Secciones asociadas</p>

            {stats.sections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {stats.sections.map((section) => (
                  <span
                    key={section.id}
                    className="inline-flex rounded-full border border-[#9E0B0F]/20 bg-white px-3 py-1.5 text-sm font-medium text-[#9E0B0F]"
                  >
                    {section.nombre}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No hay secciones registradas todavía.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={() => onEdit(course)}>
            Editar asignatura
          </Button>
        </div>
      </div>
    </div>
  );
}
