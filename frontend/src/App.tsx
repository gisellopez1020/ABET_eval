import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/Login/LoginPage';
import { AuthCallbackPage } from './pages/Auth/AuthCallbackPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { CoursePage } from './pages/Course/CoursePage';
import { CoursesPage } from './pages/Course/CoursesPage';
import { SectionPage } from './pages/Section/SectionPage';
import StudentsPage from './pages/students/studentsPage';
import { GradingSelectionPage } from './pages/Grading/Selection/GradingSelectionPage';
import { GradingTemplatePage } from './pages/Grading/Template/GradingTemplatePage';
import { ReportsPage } from './pages/Reports/ReportsPage';
import { ProjectsPage } from './pages/Proyects/ProjectsPage';
import EvaluacionesPage from './pages/evaluaciones/EvaluacionesPage';
import RubricaPage from './pages/rubrica/RubricaPage';
import { StudentOutcomesPage } from './pages/StudentOutcomes/StudentOutcomesPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cursos" element={<CoursesPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/proyectos" element={<ProjectsPage />} />
        <Route path="/rubrica" element={<RubricaPage />} />
        <Route path="/evaluaciones" element={<EvaluacionesPage />} />
        <Route path="/evaluaciones" element={<EvaluacionesPage />} />
        <Route path="/cursos/nueva" element={<Navigate to="/cursos?nueva=1" replace />} />
        <Route path="/student-outcomes" element={<StudentOutcomesPage />} />
        <Route path="/cursos/:cursoId" element={<CoursePage />} />
        <Route path="/cursos/:cursoId/secciones/:seccionId" element={<SectionPage />} />
       
        <Route path="/actividades/:actividadId" element={<RubricaPage />} />
        <Route
          path="/actividades/:actividadId/calificar/:seccionId"
          element={<GradingSelectionPage />}
        />
        <Route
          path="/actividades/:actividadId/calificar/:seccionId/:itemId"
          element={<GradingTemplatePage />}
        />
        <Route path="/cursos/:cursoId/reportes" element={<ReportsPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
