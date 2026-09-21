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
    <div className="min-h-screen bg-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] min-h-[580px]">

        {/* ── PANEL IZQUIERDO*/}
        <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 text-white overflow-hidden">

          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(160deg, #DC2626 0%, #7F1D1D 100%)',
              clipPath: 'polygon(0% 0%, 100% 0%, 78% 100%, 0% 100%)',
            }}
          />
          {/* Círculos */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-black/20 pointer-events-none" />

    
          <div className="relative z-10 max-w-[260px] xl:max-w-[300px] flex flex-col h-full">
            <span className="text-[11px] font-semibold tracking-widest text-white/70 uppercase">
              Plataforma institucional
            </span>

            <div className="flex-1 flex flex-col justify-center gap-4 py-9">
              <div className="flex justify-center">
              </div>
             
              <h2 className="text-3xl xl:text-5xl font-extrabold tracking-tight leading-tight">
                ¡Bienvenido!
              </h2>
              <p className="text-sm text-white/80 leading-relaxed">
                Sistema de evaluación por criterios ABET orientado al seguimiento de Student Outcomes del programa de Ingeniería.
              </p>
            </div>

            <span className="text-[11px] text-white/60 leading-snug">
              Universidad Autónoma de Occidente
            </span>
          </div>
        </div>

        {/* ── PANEL DERECHO*/}
        <div className="flex flex-col items-center justify-center p-8 sm:p-12">
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="space-y-1">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 bg-red-700 rounded-xl flex items-center justify-center shadow-lg shadow-red-700/30">
                  <span className="text-white text-2xl font-bold">UAO</span>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">ABET Eval</h1>
              <p className="text-gray-500 text-sm">
                Evaluación por criterios ABET · UAO
              </p>
            </div>

           

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

           <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-600"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
            )}
            <span className="text-sm font-medium text-gray-700">
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión con Google'}
            </span>
          </button>

            <p className="text-xs text-gray-400">
              Sistema de evaluación ABET
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}