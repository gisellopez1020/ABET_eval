import apiClient from './client';
import { Curso } from '../types';

export interface CursoCreate {
  nombre: string;
  codigo: string;
  periodo: string;
  ra_abet: string[];
}

export const cursosApi = {
  list: () => apiClient.get<Curso[]>('/cursos').then((r) => r.data),
  get: (id: number) => apiClient.get<Curso>(`/cursos/${id}`).then((r) => r.data),
  create: (data: CursoCreate) =>
    apiClient.post<Curso>('/cursos', data).then((r) => r.data),
  update: (id: number, data: Partial<CursoCreate>) =>
    apiClient.put<Curso>(`/cursos/${id}`, data).then((r) => r.data),
  archivar: (id: number) =>
    apiClient.patch(`/cursos/${id}/archivar`).then((r) => r.data),
};
