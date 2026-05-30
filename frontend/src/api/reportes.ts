import apiClient from './client';
import { ReporteRA } from '../types';

export const reportesApi = {
  abet: (cursoId: number, params?: { seccion_id?: number; actividad_id?: number }) =>
    apiClient
      .get<ReporteRA[]>(`/reportes/abet/${cursoId}`, { params })
      .then((r) => r.data),
};
