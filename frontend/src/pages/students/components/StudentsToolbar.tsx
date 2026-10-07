import { Download, Filter, Plus, Search } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Curso } from '../../../types';
import { SectionOption, StudentStatus } from '../types';

const SELECT_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

interface StudentsToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  courses: Curso[];
  courseFilter: number | null;
  onCourseFilter: (value: string) => void;
  /** Secciones que ofrece el filtro: las de la asignatura elegida, o todas */
  filterSections: SectionOption[];
  sectionFilter: number | null;
  onSectionFilter: (seccionId: number | null) => void;
  onToggleFilter: () => void;
  exporting: boolean;
  onExport: () => void;
  exportError: string;
  onNew: () => void;
  showFilter: boolean;
  status: 'todos' | StudentStatus;
  onStatus: (value: 'todos' | StudentStatus) => void;
}

// Búsqueda, filtros de asignatura y sección, "Filtrar" (panel de estado), exportar y
// "Nuevo estudiante" de StudentsPage
export function StudentsToolbar({
  search,
  onSearch,
  courses,
  courseFilter,
  onCourseFilter,
  filterSections,
  sectionFilter,
  onSectionFilter,
  onToggleFilter,
  exporting,
  onExport,
  exportError,
  onNew,
  showFilter,
  status,
  onStatus,
}: StudentsToolbarProps) {
  return (
    <>
        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Buscar por código o nombre del estudiante..."
              leftIcon={<Search size={18} />}
            />
          </div>

          <select
            value={courseFilter ?? ''}
            onChange={(event) => onCourseFilter(event.target.value)}
            aria-label="Filtrar por asignatura"
            className={`${SELECT_CLASS} md:w-56`}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.nombre} ({course.codigo} · {course.periodo})
              </option>
            ))}
          </select>

          <select
            value={sectionFilter ?? ''}
            onChange={(event) => onSectionFilter(event.target.value ? Number(event.target.value) : null)}
            aria-label="Filtrar por sección"
            className={`${SELECT_CLASS} md:w-56`}
          >
            <option value="">Sección: Todas</option>
            {filterSections.map((section) => (
              <option key={section.id} value={section.id}>
                {courseFilter === null ? `${section.cursoNombre} · ${section.nombre}` : section.nombre}
              </option>
            ))}
          </select>

          <Button
              variant="outline"
              icon={<Filter size={17} />}
              onClick={onToggleFilter}
            >
              Filtrar
            </Button>

          <Button
            variant="outline"
            icon={<Download size={17} />}
            onClick={onExport}
            loading={exporting}
            title="Exporta los estudiantes de la asignatura y sección filtradas"
          >
            Exportar Excel
          </Button>

          <Button
          icon={<Plus size={18} />}
          onClick={onNew}
        >
          Nuevo estudiante
        </Button>
        </div>

        {exportError && <p className="mb-4 text-sm text-red-600">{exportError}</p>}

        {showFilter && (
          <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-4">
            <button
              type="button"
              onClick={() => onStatus('todos')}
              className={`rounded-lg px-4 py-2 text-sm ${
                status === 'todos' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              onClick={() => onStatus('activo')}
              className={`rounded-lg px-4 py-2 text-sm ${
                status === 'activo' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Activos
            </button>

            <button
              type="button"
              onClick={() => onStatus('inactivo')}
              className={`rounded-lg px-4 py-2 text-sm ${
                status === 'inactivo' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Inactivos
            </button>
          </div>
        )}
    </>
  );
}
