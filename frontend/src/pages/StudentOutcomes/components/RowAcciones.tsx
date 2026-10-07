import { PencilLine, Trash2 } from 'lucide-react';

import { RaAbet } from '../../../types';
import { ICON_BUTTON } from './estilos';

interface RowAccionesProps {
  ra: RaAbet;
  onEdit: (ra: RaAbet) => void;
  onDelete: (ra: RaAbet) => void;
}

// Editar / Eliminar de una fila del catálogo (RA o Criterio)
export function RowAcciones({ ra, onEdit, onDelete }: RowAccionesProps) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => onEdit(ra)}
        aria-label={`Editar ${ra.codigo}`}
        title="Editar"
        className={`${ICON_BUTTON} hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]`}
      >
        <PencilLine size={15} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(ra)}
        aria-label={`Eliminar ${ra.codigo}`}
        title="Eliminar"
        className={`${ICON_BUTTON} hover:border-red-300 hover:text-red-600`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
