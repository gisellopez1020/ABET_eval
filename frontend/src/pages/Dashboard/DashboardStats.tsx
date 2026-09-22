import {
  BookOpen,
  Users,
  ClipboardList,
  ChartNoAxesCombined,
} from 'lucide-react';

import { StatCard } from '../../components/ui/StatCard';

interface DashboardStatsProps {
  asignaturas: string;
  estudiantes: string;
  evaluaciones: string;
  cumplimiento: string;
}

export function DashboardStats({
  asignaturas,
  estudiantes,
  evaluaciones,
  cumplimiento,
}: DashboardStatsProps) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 ]">
      <StatCard
        title="Asignaturas activas"
        value={asignaturas}
        icon={<BookOpen size={20} strokeWidth={1.7} />}
      />

      <StatCard
        title="Estudiantes Matriculados"
        value={estudiantes}
        icon={<Users size={20} strokeWidth={1.7} />}
      />

      <StatCard
        title="Evaluaciones pendientes"
        value={evaluaciones}
        icon={<ClipboardList size={20} strokeWidth={1.7} />}
      />

      <StatCard
        title="Cumplimiento SO promedio"
        value={cumplimiento}
        icon={<ChartNoAxesCombined size={20} strokeWidth={1.7} />}
      />
    </div>
  );
}