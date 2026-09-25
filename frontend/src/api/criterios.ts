import apiClient from './client';
import { Aspecto, CriteriosResponse } from '../types';

export interface CriterioIn {
  texto: string;
  peso_porcentaje: number;
  orden: number;
}

export interface AspectoIn {
  nombre: string;
  orden: number;
  criterios: CriterioIn[];
  /** Criterio ABET del catálogo (ej. "2.1.1"); su RA se agrega al curso si falta. */
  codigo_abet?: string | null;
}

export const criteriosApi = {
  get: (actividadId: number) =>
    apiClient
      .get<CriteriosResponse>(`/actividades/${actividadId}/criterios`)
      .then((r) => r.data),
  save: (actividadId: number, aspectos: AspectoIn[]) =>
    apiClient
      .put<CriteriosResponse>(`/actividades/${actividadId}/criterios`, { aspectos })
      .then((r) => r.data),
  /**
   * Cambia solo el vínculo ABET de un aspecto (null lo desvincula), sin reconstruir la
   * rúbrica: funciona aunque la actividad ya tenga calificaciones.
   */
  vincularAbet: (actividadId: number, aspectoId: number, codigoAbet: string | null) =>
    apiClient
      .patch<Aspecto>(`/actividades/${actividadId}/aspectos/${aspectoId}/codigo-abet`, {
        codigo_abet: codigoAbet,
      })
      .then((r) => r.data),
};
