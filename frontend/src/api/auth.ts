import apiClient from './client';
import { Docente } from '../types';

export const authApi = {
  getMe: () => apiClient.get<Docente>('/auth/me').then((r) => r.data),
  login: (access_token: string) =>
    apiClient
      .post<Docente>('/auth/token', { access_token })
      .then((r) => r.data),
};
