import apiClient from './client';
import { RaAbet } from '../types';

export interface RaAbetCreate {
  codigo: string;
  /** Si se omite, el backend lo deduce del código ("2.1" -> "2"). */
  so?: string;
  /** Obligatoria en un RA; en un Criterio, si se omite, hereda la de su RA. */
  competencia?: string;
  descripcion: string;
  programa?: string;
  /** Solo Criterios: se envían juntos (0 < peso <= 1). */
  codigo_padre?: string;
  peso?: number;
}

/** El código no es editable ni el nivel (RA <-> Criterio); codigo_padre y peso van juntos. */
export type RaAbetUpdate = Partial<Omit<RaAbetCreate, 'codigo'>>;

export interface RaAbetImportResultado {
  creados: number;
  actualizados: number;
}

const base = '/catalogo/ra-abet';
const path = (codigo: string) => `${base}/${encodeURIComponent(codigo)}`;

export const catalogoRaAbetApi = {
  /** `soloRaiz`: solo Resultados de Aprendizaje, sin Criterios (p. ej. para el selector del curso). */
  list: ({ soloRaiz = false }: { soloRaiz?: boolean } = {}) =>
    apiClient
      .get<RaAbet[]>(base, { params: soloRaiz ? { solo_raiz: true } : undefined })
      .then((r) => r.data),
  create: (data: RaAbetCreate) => apiClient.post<RaAbet>(base, data).then((r) => r.data),
  update: (codigo: string, data: RaAbetUpdate) =>
    apiClient.put<RaAbet>(path(codigo), data).then((r) => r.data),
  delete: (codigo: string) => apiClient.delete(path(codigo)).then((r) => r.data),
  /** Crea los códigos nuevos y actualiza los existentes en una sola transacción. */
  importar: (items: RaAbetCreate[]) =>
    apiClient.post<RaAbetImportResultado>(`${base}/importar`, { items }).then((r) => r.data),
};
