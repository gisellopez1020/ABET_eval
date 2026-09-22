import apiClient from './client';
import { Docente } from '../types';

export const authApi = {
  getMe: () => apiClient.get<Docente>('/auth/me').then((r) => r.data),
};
