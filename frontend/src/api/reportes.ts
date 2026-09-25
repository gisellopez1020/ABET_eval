import apiClient from './client';
import { ReporteABETResponse } from '../types';

export const reportesApi = {
  abet: async (cursoId: number, params?: { seccion_id?: number }) => {
    const response = await apiClient.get<ReporteABETResponse>(`/reportes/abet/${cursoId}`, { params });
    return response.data;
  },
};
