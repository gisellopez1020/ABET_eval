import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { loginRequest, SKIP_AUTH } from '../../auth/msalConfig';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
export function LoginPage() {
  const { instance } = useMsal();
  const { setAuth, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated()) return <Navigate to="/dashboard" replace />;

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      let token = 'mock-token';
      if (!SKIP_AUTH) {
        const result = await instance.loginPopup(loginRequest);
        token = result.accessToken;
      }
      localStorage.setItem('auth_token', token);
      const user = await authApi.login(token);
      setAuth(user, token);
      navigate('/dashboard');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Error al iniciar sesión';
      setError(msg);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-uao-dark rounded-xl flex items-center justify-center">
              <span className="text-white text-2xl font-bold">UAO</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-uao-dark">ABET Eval</h1>
          <p className="text-gray-500 text-sm">
            Evaluación por criterios ABET · UAO
          </p>
        </div>

        {SKIP_AUTH && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-xs text-yellow-700">
            Modo desarrollo — autenticación omitida
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-uao-mid"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
          )}
          <span className="text-sm font-medium text-gray-700">
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión con Microsoft'}
          </span>
        </button>

        <p className="text-xs text-gray-400">
          Universidad Autónoma de Occidente · Sistema de evaluación ABET
        </p>
      </div>
    </div>
  );
}
