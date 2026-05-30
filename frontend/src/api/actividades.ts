import apiClient from './client';
import { Actividad } from '../types';

export interface ActividadCreate {
  nombre: string;
  tipo: 'individual' | 'grupal';
  peso_nota_final: number;
}

export const actividadesApi = {
  list: (cursoId: number) =>
    apiClient.get<Actividad[]>(`/cursos/${cursoId}/actividades`).then((r) => r.data),
  get: (id: number) =>
    apiClient.get<Actividad>(`/actividades/${id}`).then((r) => r.data),
  create: (cursoId: number, data: ActividadCreate) =>
    apiClient.post<Actividad>(`/cursos/${cursoId}/actividades`, data).then((r) => r.data),
  update: (id: number, data: Partial<ActividadCreate>) =>
    apiClient.put<Actividad>(`/actividades/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/actividades/${id}`).then((r) => r.data),
};
