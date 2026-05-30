import { create } from 'zustand';
import { Docente } from '../types';

interface AuthState {
  user: Docente | null;
  token: string | null;
  setAuth: (user: Docente, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

const storedUser = localStorage.getItem('auth_user');
const storedToken = localStorage.getItem('auth_token');

export const useAuthStore = create<AuthState>((set, get) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken,
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
    const { user, token } = get();
    return !!user && !!token;
  },
}));
