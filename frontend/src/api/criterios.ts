import apiClient from './client';
import { CriteriosResponse } from '../types';

export interface CriterioIn {
  texto: string;
  peso_porcentaje: number;
  orden: number;
}

export interface AspectoIn {
  nombre: string;
  orden: number;
  criterios: CriterioIn[];
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
};
