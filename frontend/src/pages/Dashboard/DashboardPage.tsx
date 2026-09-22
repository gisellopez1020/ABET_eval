import { useEffect, useState } from 'react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { CourseSelector } from '../Dashboard/CourseSelector';
import { DashboardStats } from '../Dashboard/DashboardStats';
import { StudentOutcomeChart } from './StudentOutcomeChart.tsx';
import { RecentActivity } from '../Dashboard/RecentActivity';

import { cursosApi } from '../../api/cursos';
import { Curso } from '../../types';

interface DashboardData {
  asignaturas: number;
  estudiantes: number;
  evaluaciones: number;
  cumplimiento: number;
}

const EMPTY_DATA: DashboardData = {
  asignaturas: 0,
  estudiantes: 0,
  evaluaciones: 0,
  cumplimiento: 0,
};

export function DashboardPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState('');
  const [loadingCursos, setLoadingCursos] = useState(true);

  const [dashboardData, setDashboardData] =
    useState<DashboardData>(EMPTY_DATA);

  useEffect(() => {
    const loadCursos = async () => {
      try {
        setLoadingCursos(true);

        const data = await cursosApi.list();

        setCursos(data);
      } catch (error) {
        console.error('Error cargando cursos:', error);
      } finally {
        setLoadingCursos(false);
      }
    };

    loadCursos();
  }, []);

  const handleCursoChange = (cursoId: string) => {
    setSelectedCursoId(cursoId);

    if (!cursoId) {
      setDashboardData(EMPTY_DATA);
      return;
    }

    // Temporal.
    // Posteriormente estos datos vendrán del backend.
    setDashboardData({
      asignaturas: 1,
      estudiantes: 35,
      evaluaciones: 28,
      cumplimiento: 82,
    });
  };

  const hasSelectedCurso = Boolean(selectedCursoId);

  return (
    <AppLayout>
      <div className="px-5 py-3">
        {/* Encabezado */}
        <div className="mb-4">
          <p className="text-[11px] text-gray-400">
            Inicio
          </p>

          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            Panel general
          </h1>

          <p className="mt-1 text-[11px] text-gray-600">
            Bienvenido
          </p>
        </div>

        {/* Materia actual */}
        <CourseSelector
          cursos={cursos}
          selectedCursoId={selectedCursoId}
          loading={loadingCursos}
          onChange={handleCursoChange}
        />

        {/* Estadísticas */}
        <DashboardStats
          asignaturas={
            hasSelectedCurso
              ? String(dashboardData.asignaturas)
              : '0'
          }
          estudiantes={
            hasSelectedCurso
              ? String(dashboardData.estudiantes)
              : '0'
          }
          evaluaciones={
            hasSelectedCurso
              ? String(dashboardData.evaluaciones)
              : '0'
          }
          cumplimiento={
            hasSelectedCurso
              ? String(dashboardData.cumplimiento)
              : '0'
          }
        />

        {/* Gráfico y actividad */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
          <StudentOutcomeChart
            hasSelectedCurso={hasSelectedCurso}
          />

          <RecentActivity
            hasSelectedCurso={hasSelectedCurso}
          />
        </div>
      </div>
    </AppLayout>
  );
}