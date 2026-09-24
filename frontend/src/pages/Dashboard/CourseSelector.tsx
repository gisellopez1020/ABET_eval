import { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { Curso } from '../../types';
import { useCourseStore } from '../../store/courseStore';

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
  const { setSelectedCourse, clearSelectedCourse } = useCourseStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedCurso = useMemo(
    () => cursos.find((curso) => String(curso.id) === selectedCursoId) ?? null,
    [cursos, selectedCursoId]
  );

  const filteredCursos = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return cursos;
    }

    return cursos.filter((curso) => {
      return (
        curso.nombre.toLowerCase().includes(normalized) ||
        curso.codigo.toLowerCase().includes(normalized)
      );
    });
  }, [cursos, search]);

  const handleChange = (cursoId: string) => {
    onChange(cursoId);

    if (cursoId === '') {
      clearSelectedCourse();
      setSearch('');
      setOpen(false);
      return;
    }

    setSelectedCourse(Number(cursoId));
    setOpen(false);
    setSearch('');
  };

  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="px-2 text-[12px] font-medium text-gray-700">
          Evaluando actualmente
        </span>

        <div className="relative w-[240px]">
          <button
            type="button"
            onClick={() => !loading && setOpen((value) => !value)}
            disabled={loading}
            className="flex h-9 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 pr-8 text-left text-[12px] text-gray-700 transition hover:border-[#9E0B0F] focus:border-[#9E0B0F] focus:outline-none focus:ring-2 focus:ring-[#9E0B0F]/10"
          >
            <span className="truncate">
              {selectedCurso
                ? `${selectedCurso.nombre} — ${selectedCurso.codigo}`
                : loading
                  ? 'Cargando materias...'
                  : 'Selecciona la materia...'}
            </span>
            <ChevronDown
              size={11}
              strokeWidth={1.5}
              className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>

          {open && !loading && (
            <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center gap-2 border-b border-gray-200 px-2.5 py-2">
                <Search size={13} className="text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar asignatura..."
                  className="w-full border-0 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleChange('')}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-gray-600 transition hover:bg-gray-50"
                >
                  <span>Sin selección</span>
                </button>

                {filteredCursos.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-500">
                    No se encontraron asignaturas
                  </div>
                ) : (
                  filteredCursos.map((curso) => (
                    <button
                      key={curso.id}
                      type="button"
                      onClick={() => handleChange(String(curso.id))}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                        selectedCursoId === String(curso.id)
                          ? 'bg-[#9E0B0F]/5 text-[#9E0B0F]'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate">{curso.nombre}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-gray-500">{curso.codigo}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}