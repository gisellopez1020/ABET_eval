import { Filter, Plus, Search } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { StatusFilter } from '../types';

interface CoursesToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  showFilter: boolean;
  onToggleFilter: () => void;
  statusFilter: StatusFilter;
  onStatusFilter: (value: StatusFilter) => void;
  onNew: () => void;
}

// Búsqueda, "Filtrar" (panel de estado) y "Nueva asignatura" de CoursesPage
export function CoursesToolbar({
  search,
  onSearch,
  showFilter,
  onToggleFilter,
  statusFilter,
  onStatusFilter,
  onNew,
}: CoursesToolbarProps) {
  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar por código o nombre de asignatura..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
          />
        </div>

        <Button
          variant="secondary"
          size="md"
          icon={<Filter size={17} />}
          onClick={onToggleFilter}
        >
          Filtrar
        </Button>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9E0B0F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#82090d]"
        >
          <Plus size={18} />
          Nueva asignatura
        </button>
      </div>

      {showFilter && (
        <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={() => onStatusFilter('todos')}
            className={`rounded-lg px-4 py-2 text-sm ${
              statusFilter === 'todos' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Todos
          </button>

          <button
            type="button"
            onClick={() => onStatusFilter('activo')}
            className={`rounded-lg px-4 py-2 text-sm ${
              statusFilter === 'activo' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Activos
          </button>

          <button
            type="button"
            onClick={() => onStatusFilter('cerrado')}
            className={`rounded-lg px-4 py-2 text-sm ${
              statusFilter === 'cerrado' ? 'bg-[#9E0B0F] text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Cerrados
          </button>
        </div>
      )}
    </>
  );
}
