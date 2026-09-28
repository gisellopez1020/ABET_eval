import apiClient from './client';
import { CalificacionOut, ResumenCalificacion } from '../types';

export interface ValorCriterio {
  criterio_id: number;
  valor: 0 | 1;
}

export interface CalificacionCreate {
  actividad_id: number;
  criterios: ValorCriterio[];
  equipo_id?: number;
  estudiante_id?: number;
}

export const calificacionesApi = {
  resumen: (actividadId: number, seccionId: number) =>
    apiClient
      .get<ResumenCalificacion[]>(`/actividades/${actividadId}/calificaciones/${seccionId}`)
      .then((r) => r.data),
  /** Calificaciones guardadas de un equipo (una por criterio calificado). */
  equipo: (actividadId: number, equipoId: number) =>
    apiClient
      .get<CalificacionOut[]>(`/actividades/${actividadId}/equipos/${equipoId}/calificaciones`)
      .then((r) => r.data),
  /** Calificaciones individuales guardadas de un estudiante (no incluye las de sus equipos). */
  estudiante: (actividadId: number, estudianteId: number) =>
    apiClient
      .get<CalificacionOut[]>(`/actividades/${actividadId}/estudiantes/${estudianteId}/calificaciones`)
      .then((r) => r.data),
  save: (data: CalificacionCreate) =>
    apiClient.post<CalificacionOut[]>('/calificaciones', data).then((r) => r.data),
  update: (id: number, valor: 0 | 1) =>
    apiClient.patch<CalificacionOut>(`/calificaciones/${id}`, { valor }).then((r) => r.data),
  masivo: (
    actividadId: number,
    criterios: ValorCriterio[],
    seccion_id: number
  ) =>
    apiClient
      .post<CalificacionOut[]>(`/actividades/${actividadId}/calificaciones/masivo`, {
        criterios,
        seccion_id,
      })
      .then((r) => r.data),
};
