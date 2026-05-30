import apiClient from './client';
import { Seccion } from '../types';

export interface SeccionCreate {
  nombre: string;
}

export const seccionesApi = {
  list: (cursoId: number) =>
    apiClient.get<Seccion[]>(`/cursos/${cursoId}/secciones`).then((r) => r.data),
  create: (cursoId: number, data: SeccionCreate) =>
    apiClient.post<Seccion>(`/cursos/${cursoId}/secciones`, data).then((r) => r.data),
  update: (id: number, data: SeccionCreate) =>
    apiClient.put<Seccion>(`/secciones/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/secciones/${id}`).then((r) => r.data),
};
