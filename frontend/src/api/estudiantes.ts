import apiClient from './client';
import { Estudiante } from '../types';

export interface EstudianteCreate {
  nombre_completo: string;
  codigo_estudiante: string;
}

export const estudiantesApi = {
  list: (seccionId: number) =>
    apiClient.get<Estudiante[]>(`/secciones/${seccionId}/estudiantes`).then((r) => r.data),
  create: (seccionId: number, data: EstudianteCreate) =>
    apiClient
      .post<Estudiante>(`/secciones/${seccionId}/estudiantes`, data)
      .then((r) => r.data),
  importCsv: (seccionId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post<Estudiante[]>(`/secciones/${seccionId}/estudiantes/csv`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  delete: (id: number) =>
    apiClient.delete(`/estudiantes/${id}`).then((r) => r.data),
};
