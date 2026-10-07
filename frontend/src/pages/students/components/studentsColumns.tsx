import { PencilLine, Trash2 } from 'lucide-react';

import { DataTableColumn } from '../../../components/ui/DataTable';
import { TableActionButton } from '../../../components/ui/TableActionButton';
import { StudentRow } from '../types';

// Columnas de la tabla de StudentsPage
export function studentsColumns(
  onEdit: (student: StudentRow) => void,
  onDelete: (student: StudentRow) => void,
): DataTableColumn<StudentRow>[] {
  return [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (student) => (
        <span className="font-medium text-gray-900">{student.nombre}</span>
      ),
    },
    { key: 'codigo', label: 'Código' },
    {
      key: 'email',
      label: 'Correo',
      render: (student) => (
        <span title={student.email ? undefined : 'Sin correo registrado'}>{student.email ?? '—'}</span>
      ),
    },
    { key: 'periodo', label: 'Periodo' },
    {
      key: 'promedio',
      label: 'Promedio',
      align: 'center',
      render: (student) => (
        <span title={student.promedio === null ? 'Sin actividades calificadas' : undefined}>
          {student.promedio === null ? '—' : student.promedio.toFixed(1)}
        </span>
      ),
    },
    {
      key: 'grupo',
      label: 'Grupo',
      align: 'center',
      render: (student) => <span title={student.cursoNombre}>{student.grupo}</span>,
    },
    {
      key: 'estado',
      label: 'Estado',
      align: 'center',
      render: (student) => (
        <span
          className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${
            student.estado === 'activo'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {student.estado}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Acciones',
      align: 'center',
      render: (student) => (
        <div className="flex items-center justify-center gap-2">
          <TableActionButton
            title="Editar estudiante"
            onClick={() => onEdit(student)}
            icon={<PencilLine size={12} />}
          >
            Editar
          </TableActionButton>
          <TableActionButton
            variant="danger"
            title="Eliminar estudiante"
            onClick={() => onDelete(student)}
            icon={<Trash2 size={12} />}
          >
            Eliminar
          </TableActionButton>
        </div>
      ),
    },
  ];
}
