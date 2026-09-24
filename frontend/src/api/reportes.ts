import apiClient from './client';
import { ReporteABETResponse, ReporteRA } from '../types';

export const reportesApi = {
  abet: async (cursoId: number, params?: { seccion_id?: number; actividad_id?: number }) => {
    const response = await apiClient.get<ReporteABETResponse>(`/reportes/abet/${cursoId}`, { params });
    return (response.data.resultados ?? []) as ReporteRA[];
  },
};
