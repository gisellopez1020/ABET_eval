import { Curso } from '../../types';
import { ChevronDown } from 'lucide-react';

interface CourseSelectorProps {
  cursos: Curso[];
  selectedCursoId: string;
  loading: boolean;
  onChange: (cursoId: string) => void;
}

export function CourseSelector({
  cursos,
  selectedCursoId,
  loading,
  onChange,
}: CourseSelectorProps) {
  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="px-2 text-[12px] font-medium text-gray-700">
          Evaluando actualmente
        </span>

        <div className="relative w-[170px]">
          <select
            id="curso"
            value={selectedCursoId}
            onChange={(event) => onChange(event.target.value)}
            disabled={loading}
            className="h-7 w-full appearance-none rounded-sm border border-gray-200 bg-white px-3 pr-7 text-[12px] text-gray-500 outline-none transition focus:border-[#9E0B0F]"
          >
            <option value="">
              {loading
                ? 'Cargando materias...'
                : 'Selecciona la materia...'}
            </option>

            {cursos.map((curso) => (
              <option
                key={curso.id}
                value={String(curso.id)}
              >
                {curso.nombre} — {curso.codigo}
              </option>
            ))}
          </select>

          <ChevronDown
            size={11}
            strokeWidth={1.5}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
          />
        </div>
      </div>
    </section>
  );
}