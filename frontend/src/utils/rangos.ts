import { RangoCalificacion } from '../types';

// Espejo de la validación del backend (schemas/curso.py) para dar feedback
// inmediato en el formulario; el backend sigue siendo la fuente de verdad.
export const NOTA_MIN = 0;
export const NOTA_MAX = 5;
export const MAX_RANGOS = 10;

export const RANGOS_CALIFICACION_DEFAULT: RangoCalificacion[] = [
  { etiqueta: '0.0-2.9', minimo: 0, maximo: 2.9 },
  { etiqueta: '3.0-3.9', minimo: 3, maximo: 3.9 },
  { etiqueta: '4.0-5.0', minimo: 4, maximo: 5 },
];

/** Fila del editor: los números se editan como texto y se convierten al validar. */
export interface RangoForm {
  etiqueta: string;
  minimo: string;
  maximo: string;
}

export const rangoToForm = (r: RangoCalificacion): RangoForm => ({
  etiqueta: r.etiqueta,
  minimo: String(r.minimo),
  maximo: String(r.maximo),
});

const parseNumero = (s: string): number | null => {
  const limpio = s.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
};

export type RangosResult =
  | { ok: true; rangos: RangoCalificacion[] }
  | { ok: false; error: string };

/**
 * Valida y convierte las filas: etiqueta no vacía y única, 0 <= mínimo < máximo <= 5,
 * de 1 a 10 rangos y sin solapamiento (intervalos cerrados). Se permiten huecos.
 * Devuelve los rangos ordenados por mínimo.
 */
export function validarRangos(filas: RangoForm[]): RangosResult {
  if (filas.length === 0) return { ok: false, error: 'Debe definir al menos un rango de calificación.' };
  if (filas.length > MAX_RANGOS) return { ok: false, error: `Máximo ${MAX_RANGOS} rangos de calificación.` };

  const rangos: RangoCalificacion[] = [];
  for (const [i, fila] of filas.entries()) {
    const etiqueta = fila.etiqueta.trim();
    const nombre = etiqueta ? `"${etiqueta}"` : `${i + 1}`;
    if (!etiqueta) return { ok: false, error: `Rango ${i + 1}: la etiqueta es obligatoria.` };
    const minimo = parseNumero(fila.minimo);
    const maximo = parseNumero(fila.maximo);
    if (minimo === null || maximo === null) {
      return { ok: false, error: `Rango ${nombre}: mínimo y máximo deben ser números.` };
    }
    if (minimo < NOTA_MIN || maximo > NOTA_MAX) {
      return { ok: false, error: `Rango ${nombre}: los límites deben estar entre ${NOTA_MIN} y ${NOTA_MAX}.` };
    }
    if (minimo >= maximo) {
      return { ok: false, error: `Rango ${nombre}: el mínimo debe ser menor que el máximo.` };
    }
    rangos.push({ etiqueta, minimo, maximo });
  }

  const etiquetas = rangos.map((r) => r.etiqueta.toLowerCase());
  if (new Set(etiquetas).size !== etiquetas.length) {
    return { ok: false, error: 'Las etiquetas de los rangos no pueden repetirse.' };
  }

  const ordenados = [...rangos].sort((a, b) => a.minimo - b.minimo);
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1];
    const actual = ordenados[i];
    if (actual.minimo <= anterior.maximo) {
      return { ok: false, error: `Los rangos "${anterior.etiqueta}" y "${actual.etiqueta}" se solapan.` };
    }
  }
  return { ok: true, rangos: ordenados };
}
