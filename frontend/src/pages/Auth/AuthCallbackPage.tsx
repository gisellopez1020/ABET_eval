import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';

// El backend ya dejó la sesión en una cookie httpOnly al volver de Google;
// aquí solo se confirma contra /auth/me (que guarda el docente y su token CSRF).
export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    authApi
      .getMe()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm">Iniciando sesión…</p>
    </div>
  );
}
