
import { Link } from 'react-router-dom';

interface Crumb {
  label: string;
  to?: string;
}

interface HeaderProps {
  crumbs?: Crumb[];
  userName?: string;
  userPhoto?: string;
  sidebarCollapsed?: boolean;
}

export function Header({
  crumbs = [],
  userName = 'Usuario',
  userPhoto,
  sidebarCollapsed = false,
}: HeaderProps) {
  // Obtiene la primera letra del nombre para mostrarla
  // cuando el usuario no tenga una foto de perfil.
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header
  className={`fixed right-0 top-0 z-30 h-14 border-b border-gray-200 bg-white transition-all duration-300 ${
    sidebarCollapsed ? 'left-20' : 'left-60'
  }`}
>
      <div className="flex h-full items-center justify-between px-8">

        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-1 text-sm"
          aria-label="Breadcrumb"
        >
          {crumbs.map((crumb, i) => (
            <span
              key={`${crumb.label}-${i}`}
              className="flex items-center gap-1"
            >
              {i > 0 && (
                <span className="text-gray-300">
                  /
                </span>
              )}

              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-400">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Usuario */}
        <div className="flex items-center gap-3">

          {/* Foto o inicial del usuario */}
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#6B1F1F] text-sm font-semibold text-white">
            {userPhoto ? (
              <img
                src={userPhoto}
                alt={`Foto de perfil de ${userName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              userInitial
            )}
          </div>

          {/* Información del usuario */}
          <div className="leading-tight">
            <p className="text-[9px] uppercase tracking-wide text-gray-400">
              Profesor
            </p>

            <p className="text-xs font-medium text-gray-700">
              {userName}
            </p>
          </div>

          {/* Menú */}
          <button
            type="button"
            aria-label="Abrir menú de usuario"
            className="flex items-center justify-center"
          >
           
          </button>
        </div>
      </div>
    </header>
  );
}
