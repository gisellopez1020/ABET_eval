import { Button } from '../../../components/ui/Button';
import { Estudiante } from '../../../types';

interface StudentsTableProps {
  estudiantes: Estudiante[];
  onEdit: (estudiante: Estudiante) => void;
  onDelete: (estudiante: Estudiante) => void;
}

// Estudiantes de la sección, o el aviso de que no hay ninguno
export function StudentsTable({ estudiantes, onEdit, onDelete }: StudentsTableProps) {
  if (estudiantes.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-gray-400">
        No hay estudiantes. Agrégalos manualmente o importa un CSV o Excel.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Correo</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {estudiantes.map((e, i) => (
            <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-4 py-3 text-gray-400">{i + 1}</td>
              <td className="px-4 py-3 font-medium text-gray-900">{e.nombre_completo}</td>
              <td className="px-4 py-3 text-gray-600">{e.codigo_estudiante}</td>
              <td className="px-4 py-3 text-gray-600" title={e.email ? undefined : 'Sin correo registrado'}>
                {e.email ?? '—'}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button variant="ghost" size="sm" onClick={() => onEdit(e)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(e)}
                  className="text-uao-accent hover:bg-red-50"
                >
                  Eliminar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
