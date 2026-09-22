import { ReactNode, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Sidebar } from './Sidebar';
import { Header } from './Header';

import { useAuthStore } from '../../store/authStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated } = useAuthStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (
    !isAuthenticated() &&
    import.meta.env.VITE_SKIP_AUTH !== 'true'
  ) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* HEADER */}
      <Header sidebarCollapsed={sidebarCollapsed} />

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