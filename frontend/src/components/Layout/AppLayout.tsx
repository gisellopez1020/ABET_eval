import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import { Sidebar } from './Sidebar';
import { Header } from './Header';

import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useLayoutStore } from '../../store/layoutStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated, user, csrfToken } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore();

  const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';
  const autenticado = skipAuth || isAuthenticated();

  // El docente guardado solo sirve para no parpadear al recargar: la fuente de
  // verdad es la cookie. Si /auth/me responde 401, el cliente redirige a /login.
  useEffect(() => {
    if (!skipAuth && autenticado && !csrfToken) {
      authApi.getMe().catch(() => undefined);
    }
  }, [skipAuth, autenticado, csrfToken]);

  if (!autenticado) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />

      {/* HEADER */}
      <Header
        sidebarCollapsed={sidebarCollapsed}
        userName={user?.nombre || 'Usuario'}
      />

      {/* CONTENIDO */}
      <main
        className={`min-h-screen pt-16 transition-all duration-300 ${
          sidebarCollapsed ? 'ml-20' : 'ml-60'
        }`}
      >
        {children}
      </main>
    </div>
  );
}