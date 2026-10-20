import { Archive, ArchiveRestore, Eye, Pencil, Users } from 'lucide-react';

import { DataTableColumn } from '../../../components/ui/DataTable';
import { TableActionButton } from '../../../components/ui/TableActionButton';
import { Curso } from '../../../types';
import { CourseStats } from '../types';

interface CoursesColumnsOptions {
  stats: Record<number, CourseStats>;
  /** Asignatura activa en el Dashboard: solo se marca, no cambia las acciones */
  selectedCourseId: number | null;
  onView: (course: Curso) => void;
  onEdit: (course: Curso) => void;
  onToggleActivo: (course: Curso) => void;
}

// Columnas de la tabla de asignaturas de CoursesPage
export function coursesColumns({
  stats,
  selectedCourseId,
  onView,
  onEdit,
  onToggleActivo,
}: CoursesColumnsOptions): DataTableColumn<Curso>[] {
  const getGroups = (courseId: number) => {
    const courseStats = stats[courseId];

    if (!courseStats || courseStats.sections.length === 0) {
      return '—';
    }

    return courseStats.sections
      .map((section) => section.nombre)
      .join(', ');
  };

  const getStudentCount = (courseId: number) => {
    return stats[courseId]?.students ?? 0;
  };

  return [
    {
      key: 'codigo',
      label: 'Código',
      render: (course) => (
        <span className="font-medium text-gray-900">{course.codigo}</span>
      ),
    },
    {
      key: 'nombre',
      label: 'Nombre',
      render: (course) => (
        <div>
          <p className="font-medium text-gray-900">{course.nombre}</p>
          {/* Solo informativo: no habilita ni deshabilita acciones */}
          {selectedCourseId === course.id && (
            <span
              className="mt-1 inline-flex text-xs font-medium text-[#9E0B0F]"
              title="Asignatura activa en el Dashboard"
            >
              Seleccionada
            </span>
          )}
        </div>
      ),
    },
    { key: 'periodo', label: 'Periodo', align: 'center', render: (course) => course.periodo },
    {
      key: 'grupos',
      label: 'Grupo',
      align: 'center',
      render: (course) => getGroups(course.id),
    },
    {
      key: 'estudiantes',
      label: 'Estudiantes',
      align: 'center',
      render: (course) => (
        <div className="inline-flex items-center justify-center gap-1.5 text-sm text-gray-600">
          <Users size={15} />
          {getStudentCount(course.id)}
        </div>
      ),
    },
    {
      key: 'activo',
      label: 'Estado',
      align: 'center',
      render: (course) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            course.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {course.activo ? 'Activo' : 'Cerrado'}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      align: 'center',
      render: (course) => (
        <div className="flex items-center justify-center gap-2">
          <TableActionButton
            variant="primary"
            title="Ver información"
            onClick={() => onView(course)}
            icon={<Eye size={12} />}
          >
            Ver
          </TableActionButton>

          <TableActionButton
            variant="default"
            title="Editar asignatura"
            onClick={() => onEdit(course)}
            icon={<Pencil size={12} />}
          >
            Editar
          </TableActionButton>

          <TableActionButton
            variant="primary"
            title={course.activo ? 'Cerrar asignatura' : 'Reactivar asignatura'}
            onClick={() => onToggleActivo(course)}
            icon={course.activo ? <Archive size={12} /> : <ArchiveRestore size={12} />}
          >
            {course.activo ? 'Cerrar' : 'Activar'}
          </TableActionButton>
        </div>
      ),
    },
  ];
}
