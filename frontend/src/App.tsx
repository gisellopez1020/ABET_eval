import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/Login/LoginPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { CoursePage } from './pages/Course/CoursePage';
import { SectionPage } from './pages/Section/SectionPage';
import { ActivityPage } from './pages/Activity/ActivityPage';
import { GradingSelectionPage } from './pages/Grading/Selection/GradingSelectionPage';
import { GradingTemplatePage } from './pages/Grading/Template/GradingTemplatePage';
import { ReportsPage } from './pages/Reports/ReportsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cursos/:cursoId" element={<CoursePage />} />
        <Route path="/cursos/:cursoId/secciones/:seccionId" element={<SectionPage />} />
        <Route path="/actividades/:actividadId" element={<ActivityPage />} />
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
