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

/** Rúbrica leída de un .xlsx, sin guardar (Decimal llega como string en JSON). */
export interface RubricaExcelPreview {
  aspectos: { nombre: string; criterios: { texto: string; peso_porcentaje: number | string }[] }[];
  total_peso: number | string;
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
   * Lee un .xlsx (Aspecto | Criterio | %Criterio) y devuelve la rúbrica sin guardarla;
   * se confirma con save(). 409 si la actividad ya tiene calificaciones.
   */
  importarExcel: (actividadId: number, file: File) => {
    const form = new FormData();
    form.append('archivo', file);
    return apiClient
      .post<RubricaExcelPreview>(`/actividades/${actividadId}/criterios/importar-excel`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
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
