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

const storedUser = localStorage.getItem('auth_user');
const storedToken = localStorage.getItem('auth_token');
const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: storedUser ? JSON.parse(storedUser) : skipAuth ? demoUser : null,
  token: storedToken || (skipAuth ? 'mock-token' : null),
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
