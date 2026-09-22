import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  FolderKanban,
  ClipboardCheck,
  ChartNoAxesCombined,
  UserCheck,
  CircleHelp,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { useAuthStore } from '../../store/authStore';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  {
    to: '/dashboard',
    label: 'Inicio',
    icon: LayoutDashboard,
  },
  {
    to: '/asignaturas',
    label: 'Asignaturas',
    icon: BookOpen,
  },
  {
    to: '/estudiantes',
    label: 'Estudiantes',
    icon: Users,
  },
  {
    to: '/proyectos',
    label: 'Proyectos y equipos',
    icon: FolderKanban,
  },
  {
    to: '/evaluacion-grupal',
    label: 'Evaluación grupal',
    icon: ClipboardCheck,
  },
  {
    to: '/estadisticas',
    label: 'Estadísticas ABET',
    icon: ChartNoAxesCombined,
  },
  {
    to: '/evaluacion-individual',
    label: 'Evaluación individual',
    icon: UserCheck,
  },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col bg-[#9E0B0F] text-white transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div
        className={`flex h-16 items-center ${
          collapsed ? 'justify-center' : 'gap-3 px-5'
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#9E0B0F]">
          A
        </div>

        {!collapsed && (
          <span className="text-lg font-semibold tracking-wide">
            APEC
          </span>
        )}
      </div>

      {/* Botón para minimizar / expandir */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir menú' : 'Minimizar menú'}
        className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/20 bg-[#9E0B0F] text-white shadow-md transition-colors hover:bg-[#7F090C]"
      >
        {collapsed ? (
          <ChevronRight size={14} strokeWidth={2} />
        ) : (
          <ChevronLeft size={14} strokeWidth={2} />
        )}
      </button>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg py-2.5 text-sm transition-colors ${
                  collapsed
                    ? 'justify-center px-2'
                    : 'gap-2.5 px-2.5'
                } ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={18} strokeWidth={1.8} />

              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Acciones inferiores */}
      <div className="space-y-1 border-t border-white/10 px-3 py-4">
        <button
          type="button"
          title={collapsed ? 'Ayuda' : undefined}
          className={`flex w-full items-center rounded-lg py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
            collapsed
              ? 'justify-center px-2'
              : 'gap-2.5 px-2.5'
          }`}
        >
          <CircleHelp size={18} strokeWidth={1.8} />

          {!collapsed && <span>Ayuda</span>}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`flex w-full items-center rounded-lg py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
            collapsed
              ? 'justify-center px-2'
              : 'gap-2.5 px-2.5'
          }`}
        >
          <LogOut size={18} strokeWidth={1.8} />

          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}