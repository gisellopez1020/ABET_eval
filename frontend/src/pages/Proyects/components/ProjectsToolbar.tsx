import { Filter, Plus, Search } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Curso, Seccion } from '../../../types';
import { ProjectStatusFilter } from '../types';

interface ProjectsToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  courses: Curso[];
  selectedCourse: number | null;
  onCourseChange: (value: string) => void;
  sections: Seccion[];
  /** null = Todas las secciones */
  sectionFilter: number | null;
  onSectionFilter: (seccionId: number | null) => void;
  statusFilter: ProjectStatusFilter;
  onStatusFilter: (value: ProjectStatusFilter) => void;
  onNew: () => void;
}

// Búsqueda, filtros (asignatura, sección, estado) y "Nuevo proyecto" de ProjectsPage.
// El botón "Filtrar" no tiene acción (como antes de extraerlo).
export function ProjectsToolbar({
  search,
  onSearch,
  courses,
  selectedCourse,
  onCourseChange,
  sections,
  sectionFilter,
  onSectionFilter,
  statusFilter,
  onStatusFilter,
  onNew,
}: ProjectsToolbarProps) {
  return (
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Búsqueda */}
        <div className="relative flex-1">
            <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
            type="text"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar proyecto..."
            className="
                w-full rounded-xl border border-gray-200
                bg-white py-2.5 pl-10 pr-4
                text-sm text-gray-700 shadow-sm
                outline-none transition
                focus:border-[#9E0B0F]
                focus:ring-2 focus:ring-[#9E0B0F]/10
            "
            />
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row">
            {/* Asignatura */}
            <div
            className="
                flex h-10 min-w-[220px] items-center gap-2
                rounded-xl border border-gray-200
                bg-white px-3
                text-sm text-gray-700 shadow-sm
                transition
                hover:border-[#9E0B0F]
                focus-within:border-[#9E0B0F]
                focus-within:ring-2
                focus-within:ring-[#9E0B0F]/10
            "
            >
            <label
                htmlFor="course-select"
                className="shrink-0 text-gray-500"
            >
                Asignatura
            </label>

            <select
                id="course-select"
                value={selectedCourse ?? ''}
                onChange={(event) => onCourseChange(event.target.value)}
                className="
                min-w-0 flex-1
                bg-transparent
                text-sm text-gray-700
                outline-none
                "
            >
                {courses.length === 0 && <option value="">Sin asignaturas</option>}
                {courses.map((course) => (
                <option key={course.id} value={course.id}>
                    {course.nombre} ({course.codigo} · {course.periodo})
                </option>
                ))}
            </select>
            </div>

            {/* Sección */}
            <div
            className="
                flex h-10 min-w-[220px] items-center gap-2
                rounded-xl border border-gray-200
                bg-white px-3
                text-sm text-gray-700 shadow-sm
                transition
                hover:border-[#9E0B0F]
                focus-within:border-[#9E0B0F]
                focus-within:ring-2
                focus-within:ring-[#9E0B0F]/10
            "
            >
            <label
                htmlFor="section-select"
                className="shrink-0 text-gray-500"
            >
                Sección
            </label>

            <select
                id="section-select"
                value={sectionFilter ?? ''}
                onChange={(event) =>
                onSectionFilter(event.target.value ? Number(event.target.value) : null)
                }
                className="
                min-w-0 flex-1
                bg-transparent
                text-sm text-gray-700
                outline-none
                "
            >
                <option value="">Todas las secciones</option>
                {sections.map((section) => (
                <option key={section.id} value={section.id}>
                    {section.nombre}
                </option>
                ))}
            </select>
            </div>

            {/* Estado */}
            <div
            className="
                flex h-10 min-w-[220px] items-center gap-2
                rounded-xl border border-gray-200
                bg-white px-3
                text-sm text-gray-700 shadow-sm
                transition
                hover:border-[#9E0B0F]
                focus-within:border-[#9E0B0F]
                focus-within:ring-2
                focus-within:ring-[#9E0B0F]/10
            "
            >
            <label
                htmlFor="status-select"
                className="shrink-0 text-gray-500"
            >
                Estado
            </label>

            <select
                id="status-select"
                value={statusFilter}
                onChange={(event) =>
                onStatusFilter(event.target.value as 'all' | 'pendiente' | 'en-evaluacion' | 'evaluado')
                }
                className="
                min-w-0 flex-1
                bg-transparent
                text-sm text-gray-700
                outline-none
                "
            >
                <option value="all">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="en-evaluacion">En evaluación</option>
                <option value="evaluado">Evaluado</option>
            </select>
            </div>

            {/* Filtrar */}
            <Button
            variant="outline"
            size="md"
            className="rounded-xl"
            >
            <Filter size={16} />
            Filtrar
            </Button>

            {/* Nuevo proyecto */}
            <Button
            variant="primary"
            size="md"
            onClick={onNew}
            className="rounded-xl whitespace-nowrap"
            >
            <Plus size={16} />
            Nuevo proyecto
            </Button>
        </div>
        </div>
  );
}
