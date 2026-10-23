import apiClient from './client';
import { Actividad } from '../types';

export interface ActividadCreate {
  nombre: string;
  tipo: 'individual' | 'grupal';
  peso_nota_final: number;
  /** false: solo aplica a secciones_ids (al menos una) */
  aplica_todas_secciones: boolean;
  secciones_ids: number[];
}

/** Campos editables: el tipo no se cambia. El alcance se envía completo o no se envía. */
export interface ActividadUpdate {
  nombre?: string;
  peso_nota_final?: number;
  aplica_todas_secciones?: boolean;
  secciones_ids?: number[];
}

export const actividadesApi = {
  list: (cursoId: number) =>
    apiClient.get<Actividad[]>(`/cursos/${cursoId}/actividades`).then((r) => r.data),
  get: (id: number) =>
    apiClient.get<Actividad>(`/actividades/${id}`).then((r) => r.data),
  create: (cursoId: number, data: ActividadCreate) =>
    apiClient.post<Actividad>(`/cursos/${cursoId}/actividades`, data).then((r) => r.data),
  update: (id: number, data: ActividadUpdate) =>
    apiClient.put<Actividad>(`/actividades/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/actividades/${id}`).then((r) => r.data),
};
