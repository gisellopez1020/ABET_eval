import { create } from 'zustand';
import { Docente, Sesion } from '../types';

// La autenticación vive en la cookie httpOnly que pone el backend: aquí solo se
// guarda el docente (para no perderlo visualmente al recargar) y, en memoria,
// el token CSRF que devuelve /auth/me. Ningún token se guarda en localStorage.
interface AuthState {
  user: Docente | null;
  csrfToken: string | null;
  setSesion: (sesion: Sesion) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

const USER_KEY = 'auth_user';
// Clave de la versión anterior (JWT en localStorage); se borra si quedó guardada.
const LEGACY_TOKEN_KEY = 'auth_token';

const demoUser: Docente = {
  email: 'docente@demo.edu.co',
  nombre: 'Docente demo',
};

const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';

const getInitialUser = (): Docente | null => {
  if (skipAuth) {
    return demoUser;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    const storedUser = window.localStorage.getItem(USER_KEY);
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        window.localStorage.removeItem(USER_KEY);
      }
    }
  }

  return null;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getInitialUser(),
  csrfToken: null,
  setSesion: ({ email, nombre, csrf_token }) => {
    const user = { email, nombre };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, csrfToken: csrf_token });
  },
  clearAuth: () => {
    localStorage.removeItem(USER_KEY);
    set({ user: null, csrfToken: null });
  },
  isAuthenticated: () => {
    if (skipAuth) return true;
    return !!get().user;
  },
}));
