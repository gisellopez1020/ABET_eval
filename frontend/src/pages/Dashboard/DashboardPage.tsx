import { useEffect, useState } from 'react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { CourseSelector } from '../Dashboard/CourseSelector';
import { DashboardStats } from '../Dashboard/DashboardStats';
import { StudentOutcomeChart } from './StudentOutcomeChart.tsx';
import { RecentActivity } from '../Dashboard/RecentActivity';

import { cursosApi } from '../../api/cursos';
import { actividadesApi } from '../../api/actividades';
import { seccionesApi } from '../../api/secciones';
import { reportesApi } from '../../api/reportes';
import { Curso } from '../../types';
import { useCourseStore } from '../../store/courseStore';

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
  const [loadingCursos, setLoadingCursos] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData>(EMPTY_DATA);
  const { selectedCourseId, setSelectedCourse, clearSelectedCourse } = useCourseStore();

  useEffect(() => {
    const loadCursos = async () => {
      try {
        setLoadingCursos(true);
        const data = await cursosApi.list();
        setCursos(data);

        if (data.length > 0 && !selectedCourseId) {
          setSelectedCourse(data[0].id);
        }
      } catch (error) {
        console.error('Error cargando cursos:', error);
      } finally {
        setLoadingCursos(false);
      }
    };

    loadCursos();
  }, [selectedCourseId, setSelectedCourse]);

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!selectedCourseId) {
        setDashboardData({
          asignaturas: cursos.length,
          estudiantes: 0,
          evaluaciones: 0,
          cumplimiento: 0,
        });
        return;
      }

      try {
        const [secciones, actividades, reporte] = await Promise.all([
          seccionesApi.list(selectedCourseId),
          actividadesApi.list(selectedCourseId),
          reportesApi.abet(selectedCourseId),
        ]);

        const estudiantes = secciones.reduce(
          (total, seccion) => total + (seccion.total_estudiantes ?? 0),
          0
        );

        // Cumplimiento a nivel de Resultado de Aprendizaje: estudiantes en rangos
        // con mínimo >= 3.0 sobre el total (incluye los sin clasificar)
        const etiquetasCumplen = reporte.rangos
          .filter((r) => r.minimo >= 3)
          .map((r) => r.etiqueta);

        const totalRangos = reporte.resultados.reduce((total, item) => total + item.total, 0);

        const cumplimientoRango = reporte.resultados.reduce(
          (total, item) =>
            total + etiquetasCumplen.reduce((sum, etiqueta) => sum + (item.rangos[etiqueta] ?? 0), 0),
          0
        );

        setDashboardData({
          asignaturas: cursos.length,
          estudiantes,
          evaluaciones: actividades.length,
          cumplimiento: totalRangos > 0 ? Math.round((cumplimientoRango / totalRangos) * 100) : 0,
        });
      } catch (error) {
        console.error('Error cargando datos del dashboard:', error);
        setDashboardData({
          asignaturas: cursos.length,
          estudiantes: 0,
          evaluaciones: 0,
          cumplimiento: 0,
        });
      }
    };

    if (!loadingCursos) {
      loadDashboardData();
    }
  }, [cursos.length, loadingCursos, selectedCourseId]);

  const handleCursoChange = (cursoId: string) => {
    if (!cursoId) {
      clearSelectedCourse();
      setDashboardData({
        asignaturas: cursos.length,
        estudiantes: 0,
        evaluaciones: 0,
        cumplimiento: 0,
      });
      return;
    }

    setSelectedCourse(Number(cursoId));
  };

  const selectedCursoId = selectedCourseId ? String(selectedCourseId) : '';
  const hasSelectedCurso = Boolean(selectedCourseId);

  return (
    <AppLayout>
      <div className="px-5 py-3">
        <div className="mb-4">
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Panel general
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            Bienvenido
          </p>
        </div>

        <CourseSelector
          cursos={cursos}
          selectedCursoId={selectedCursoId}
          loading={loadingCursos}
          onChange={handleCursoChange}
        />

        <DashboardStats
          asignaturas={String(dashboardData.asignaturas)}
          estudiantes={String(dashboardData.estudiantes)}
          evaluaciones={String(dashboardData.evaluaciones)}
          cumplimiento={`${dashboardData.cumplimiento}%`}
        />

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