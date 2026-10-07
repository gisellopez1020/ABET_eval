import apiClient, { confirmarSesion } from './client';
import { useAuthStore } from '../store/authStore';

export const authApi = {
  getMe: confirmarSesion,
  /** Pide al backend borrar la cookie de sesión; el estado local se limpia aunque falle. */
  logout: () =>
    apiClient
      .post('/auth/logout')
      .catch(() => undefined)
      .finally(() => useAuthStore.getState().clearAuth()),
};
