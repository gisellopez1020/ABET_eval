import { Link } from 'react-router-dom';
import { SyncStatus } from '../SyncStatus/SyncStatus';

interface Crumb {
  label: string;
  to?: string;
}

interface HeaderProps {
  crumbs?: Crumb[];
  syncEstado?: 'sincronizado' | 'sincronizando' | 'error';
}

export function Header({ crumbs = [], syncEstado = 'sincronizado' }: HeaderProps) {
  return (
    <header className="fixed top-0 left-60 right-0 h-16 bg-white border-b border-gray-200 flex items-center px-6 z-30">
      <nav className="flex-1 flex items-center gap-1 text-sm" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-400">›</span>}
            {crumb.to ? (
              <Link to={crumb.to} className="text-uao-mid hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-gray-700 font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      <SyncStatus estado={syncEstado} />
    </header>
  );
}
