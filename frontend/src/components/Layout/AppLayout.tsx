import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { Sidebar } from './Sidebar';
import { Header } from './Header';

import { useAuthStore } from '../../store/authStore';
import { useLayoutStore } from '../../store/layoutStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated, user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore();

  const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';

  if (!skipAuth && !isAuthenticated()) {
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