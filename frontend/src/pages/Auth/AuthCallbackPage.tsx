import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    localStorage.setItem('auth_token', token);
    authApi
      .getMe()
      .then((user) => {
        setAuth(user, token);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        localStorage.removeItem('auth_token');
        navigate('/login', { replace: true });
      });
  }, [navigate, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm">Iniciando sesión…</p>
    </div>
  );
}
