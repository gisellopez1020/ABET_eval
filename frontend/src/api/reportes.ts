import apiClient from './client';
import { DetalleXlsxResponse, ReporteABETResponse, ReporteActividadResponse } from '../types';
import { nombreDesdeContentDisposition } from '../utils/descarga';

const base = (cursoId: number, actividadId: number) => `/reportes/abet/${cursoId}/actividad/${actividadId}`;

export const reportesApi = {
  abet: async (cursoId: number, params?: { seccion_id?: number }) => {
    const response = await apiClient.get<ReporteABETResponse>(`/reportes/abet/${cursoId}`, { params });
    return response.data;
  },

  /** Los dos niveles acotados a una actividad (Estadísticas ABET). */
  actividad: async (cursoId: number, actividadId: number, params?: { seccion_id?: number }) => {
    const response = await apiClient.get<ReporteActividadResponse>(base(cursoId, actividadId), { params });
    return response.data;
  },

  /** Libro con la hoja Conteo; descarga directa, no toca Drive. */
  resumenXlsx: async (cursoId: number, actividadId: number, params?: { seccion_id?: number }) => {
    const response = await apiClient.get<Blob>(`${base(cursoId, actividadId)}/resumen-xlsx`, {
      params,
      responseType: 'blob',
    });
    const nombre = nombreDesdeContentDisposition(response.headers['content-disposition'], 'ABET_resumen.xlsx');
    return { blob: response.data, nombre };
  },

  /** Genera el detalle y lo sube a Drive; el archivo llega aunque la sincronización falle. */
  detalleXlsx: async (cursoId: number, actividadId: number, seccionId?: number) => {
    const response = await apiClient.post<DetalleXlsxResponse>(`${base(cursoId, actividadId)}/detalle-xlsx`, {
      seccion_id: seccionId ?? null,
    });
    return response.data;
  },
};
