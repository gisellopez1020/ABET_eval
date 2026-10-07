import { RaAbet } from '../../types';

export type Nivel = 'ra' | 'criterio';

export interface RowDraft {
  codigo: string;
  so: string;
  competencia: string;
  descripcion: string;
  programa: string;
  codigo_padre: string;
  peso: string;
}

/** Fila en edición: `codigo` null = fila nueva. */
export interface Editing {
  codigo: string | null;
  nivel: Nivel;
}

export const PROGRAMA_DEFAULT = 'Ingeniería Informática';

export const EMPTY_DRAFT: RowDraft = {
  codigo: '',
  so: '',
  competencia: '',
  descripcion: '',
  programa: PROGRAMA_DEFAULT,
  codigo_padre: '',
  peso: '',
};

export const COLUMNAS = 7;

export const formatPeso = (n: number) => String(Number(n.toFixed(4)));

export const toDraft = (ra: RaAbet): RowDraft => ({
  codigo: ra.codigo,
  so: ra.so ?? '',
  competencia: ra.competencia,
  descripcion: ra.descripcion,
  programa: ra.programa,
  codigo_padre: ra.codigo_padre ?? '',
  peso: ra.peso !== null ? formatPeso(ra.peso) : '',
});

export function agruparPorPadre(items: RaAbet[]): Map<string, RaAbet[]> {
  const grupos = new Map<string, RaAbet[]>();
  for (const item of items) {
    if (item.codigo_padre === null) continue;
    grupos.set(item.codigo_padre, [...(grupos.get(item.codigo_padre) ?? []), item]);
  }
  return grupos;
}
