interface StudentsPaginationProps {
  safePage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

// Anterior / "Página X de Y" / Siguiente de la tabla de estudiantes
export function StudentsPagination({ safePage, totalPages, onPrevious, onNext }: StudentsPaginationProps) {
  return (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrevious}
            disabled={safePage === 1}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>

          <span className="text-sm text-gray-600">
            Página {safePage} de {totalPages}
          </span>

          <button
            type="button"
            onClick={onNext}
            disabled={safePage === totalPages}
            className="rounded-lg bg-[#9E0B0F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#7C090C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
  );
}
