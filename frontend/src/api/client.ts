import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { Sesion } from '../types';

/** Header donde el backend espera el token CSRF en las peticiones que modifican datos. */
export const CSRF_HEADER = 'X-CSRF-Token';

const METODOS_SEGUROS = new Set(['get', 'head', 'options']);
const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';

// La sesión viaja en una cookie httpOnly que el navegador adjunta solo.
const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/** Confirma la sesión contra el backend y guarda el docente y su token CSRF. */
export const confirmarSesion = () =>
  apiClient.get<Sesion>('/auth/me').then((r) => {
    useAuthStore.getState().setSesion(r.data);
    return r.data;
  });

// Si varias peticiones necesitan el token a la vez (p. ej. tras recargar), /auth/me se pide una sola vez.
let csrfPendiente: Promise<string | null> | null = null;

const obtenerCsrf = (): Promise<string | null> => {
  const actual = useAuthStore.getState().csrfToken;
  if (actual) return Promise.resolve(actual);
  csrfPendiente ??= confirmarSesion()
    .then((sesion) => sesion.csrf_token)
    .finally(() => {
      csrfPendiente = null;
    });
  return csrfPendiente;
};

apiClient.interceptors.request.use(async (config) => {
  const metodo = (config.method ?? 'get').toLowerCase();
  if (!skipAuth && !METODOS_SEGUROS.has(metodo)) {
    const csrf = await obtenerCsrf();
    if (csrf) config.headers.set(CSRF_HEADER, csrf);
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
