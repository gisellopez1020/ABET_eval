import { create } from 'zustand';
import { Docente } from '../types';

interface AuthState {
  user: Docente | null;
  token: string | null;
  setAuth: (user: Docente, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

const demoUser: Docente = {
  email: 'docente@demo.edu.co',
  nombre: 'Docente demo',
};

const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';

const getInitialUser = () => {
  if (skipAuth) {
    return demoUser;
  }

  if (typeof window !== 'undefined') {
    const storedUser = window.localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        window.localStorage.removeItem('auth_user');
      }
    }
  }

  return null;
};

const getInitialToken = () => {
  if (skipAuth) {
    return 'mock-token';
  }

  if (typeof window !== 'undefined') {
    const storedToken = window.localStorage.getItem('auth_token');
    if (storedToken) {
      return storedToken;
    }
  }

  return null;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getInitialUser(),
  token: getInitialToken(),
  setAuth: (user, token) => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_token', token);
    set({ user, token });
  },
  clearAuth: () => {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
    set({ user: null, token: null });
  },
  isAuthenticated: () => {
    if (skipAuth) return true;
    const { user, token } = get();
    return !!user && !!token;
  },
}));
