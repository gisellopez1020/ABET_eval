import apiClient from './client';
import { EquipoTrabajo, ModoCalificacionResponse } from '../types';

export interface EquipoCreate {
  nombre: string;
  estudiante_ids: number[];
}

export const equiposApi = {
  list: (actividadId: number, seccionId: number) =>
    apiClient
      .get<EquipoTrabajo[]>(`/actividades/${actividadId}/secciones/${seccionId}/equipos`)
      .then((r) => r.data),
  create: (actividadId: number, seccionId: number, equipos: EquipoCreate[]) =>
    apiClient
      .post<EquipoTrabajo[]>(
        `/actividades/${actividadId}/secciones/${seccionId}/equipos`,
        { equipos }
      )
      .then((r) => r.data),
  update: (equipoId: number, data: { nombre?: string; estudiante_ids?: number[] }) =>
    apiClient.put<EquipoTrabajo>(`/equipos/${equipoId}`, data).then((r) => r.data),
  modoCalificacion: (actividadId: number, seccionId: number) =>
    apiClient
      .get<ModoCalificacionResponse>(
        `/actividades/${actividadId}/modo-calificacion/${seccionId}`
      )
      .then((r) => r.data),
};
