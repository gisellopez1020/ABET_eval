import { Aspecto } from '../../types';

export interface DraftCriterio {
  key: string;
  texto: string;
  peso: number;
}

export interface DraftAspecto {
  key: string;
  /** id en el backend (null si aún no se ha guardado); lo usa el PATCH del vínculo ABET */
  id: number | null;
  nombre: string;
  criterios: DraftCriterio[];
  codigo_abet: string | null;
}

export interface CriterioForm {
  aspectoKey: string;
  criterioKey: string | null; // null = crear, string = editar
  texto: string;
  peso: string;
}

export interface AspectoForm {
  aspectoKey: string | null; // null = crear, string = renombrar
  nombre: string;
  /** Paso 1 del vínculo: Resultado de Aprendizaje elegido ('' = sin vincular) */
  raPadre: string;
  /** Paso 2: Criterio de ese RA (el valor que se guarda en codigo_abet) */
  codigoAbet: string | null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function toDraft(aspectos: Aspecto[]): DraftAspecto[] {
  return aspectos.map((aspecto) => ({
    key: `a${aspecto.id}`,
    id: aspecto.id,
    nombre: aspecto.nombre,
    codigo_abet: aspecto.codigo_abet ?? null,
    criterios: aspecto.criterios.map((criterio) => ({
      key: `c${criterio.id}`,
      texto: criterio.texto,
      peso: Number(criterio.peso_porcentaje),
    })),
  }));
}

export const truncar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

export function buildCodeName(aspectoIndex: number, criterioIndex: number) {
  return `${String.fromCharCode(65 + aspectoIndex)}.${criterioIndex + 1}`;
}
