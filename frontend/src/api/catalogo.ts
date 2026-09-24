import apiClient from './client';
import { RaAbet } from '../types';

export interface RaAbetCreate {
  codigo: string;
  /** Si se omite, el backend lo deduce del código ("2.1" -> "2"). */
  so?: string;
  competencia: string;
  descripcion: string;
  programa?: string;
}

/** El código no es editable (los cursos lo referencian en ra_abet). */
export type RaAbetUpdate = Partial<Omit<RaAbetCreate, 'codigo'>>;

export interface RaAbetImportResultado {
  creados: number;
  actualizados: number;
}

const base = '/catalogo/ra-abet';
const path = (codigo: string) => `${base}/${encodeURIComponent(codigo)}`;

export const catalogoRaAbetApi = {
  list: () => apiClient.get<RaAbet[]>(base).then((r) => r.data),
  create: (data: RaAbetCreate) => apiClient.post<RaAbet>(base, data).then((r) => r.data),
  update: (codigo: string, data: RaAbetUpdate) =>
    apiClient.put<RaAbet>(path(codigo), data).then((r) => r.data),
  delete: (codigo: string) => apiClient.delete(path(codigo)).then((r) => r.data),
  /** Crea los códigos nuevos y actualiza los existentes en una sola transacción. */
  importar: (items: RaAbetCreate[]) =>
    apiClient.post<RaAbetImportResultado>(`${base}/importar`, { items }).then((r) => r.data),
};
