import { useMemo } from 'react';

import { Input } from '../../../components/ui/Input';
import { Estudiante } from '../../../types';
import { normalizeHeader } from '../../../utils/csv';

interface StudentPickerProps {
  estudiantes: Estudiante[];
  selectedIds: number[];
  onToggle: (studentId: number) => void;
  /** Controlada por el modal: él decide cuándo se reinicia (p. ej. al cambiar de sección). */
  busqueda: string;
  onBusquedaChange: (value: string) => void;
}

// Lista de integrantes con buscador, compartida por los modales de crear y editar equipo
export function StudentPicker({ estudiantes, selectedIds, onToggle, busqueda, onBusquedaChange }: StudentPickerProps) {
  // Solo visual: lo seleccionado que el filtro oculte sigue en selectedIds
  const estudiantesFiltrados = useMemo(() => {
    const query = normalizeHeader(busqueda);
    if (!query) return estudiantes;
    return estudiantes.filter((student) => normalizeHeader(student.nombre_completo).includes(query));
  }, [estudiantes, busqueda]);

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">Integrantes</label>

      {estudiantes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-500">
          No hay estudiantes disponibles en la sección seleccionada.
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            value={busqueda}
            onChange={(event) => onBusquedaChange(event.target.value)}
            placeholder="Buscar estudiante..."
            aria-label="Buscar estudiante"
          />

          {estudiantesFiltrados.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-500">
              Ningún estudiante coincide con "{busqueda.trim()}".
            </div>
          ) : (
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
              {estudiantesFiltrados.map((student) => {
                const active = selectedIds.includes(student.id);

                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => onToggle(student.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                      active
                        ? 'border-[#9E0B0F] bg-[#9E0B0F]/5 text-[#9E0B0F]'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{student.nombre_completo}</span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em]">
                      {active ? 'Selec.' : 'No'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
