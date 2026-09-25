// Parseo client-side del CSV de rúbrica (Aspecto,Criterio,Peso).
// Solo rellena el borrador local de RubricaPage; no llama al backend.
import { normalizeHeader, parseDecimal, readCsv } from '../../utils/csv';

// Re-export: RubricaPage importa decodeCsvBytes desde aquí.
export { decodeCsvBytes } from '../../utils/csv';

export interface RubricaCsvCriterio {
  texto: string;
  peso: number;
}

export interface RubricaCsvAspecto {
  nombre: string;
  criterios: RubricaCsvCriterio[];
}

export type RubricaCsvResult =
  | { ok: true; aspectos: RubricaCsvAspecto[] }
  | { ok: false; error: string };

const normalizeAspectoKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Peso de rúbrica en escala 0-100: el "%" es opcional y no cambia el valor ("40" = "40%"). */
function parsePeso(raw: string): number | null {
  const d = parseDecimal(raw);
  if (!d || d.decimales > 2) return null;
  return d.valor > 0 && d.valor <= 100 ? d.valor : null;
}

export function parseRubricaCsv(input: string): RubricaCsvResult {
  const rows = readCsv(input);
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  const header = rows[0].map(normalizeHeader);
  const colAspecto = header.findIndex((h) => h.startsWith('aspecto'));
  const colCriterio = header.findIndex((h) => h.startsWith('criterio'));
  const colPeso = header.findIndex((h) => h.startsWith('peso'));
  if (colAspecto === -1 || colCriterio === -1 || colPeso === -1) {
    return { ok: false, error: 'El CSV debe tener las columnas Aspecto, Criterio y Peso (con encabezado).' };
  }

  // Agrupa por nombre de aspecto (sin distinguir mayúsculas/espacios), en orden de primera aparición.
  const aspectos: RubricaCsvAspecto[] = [];
  const porNombre = new Map<string, RubricaCsvAspecto>();

  for (let i = 1; i < rows.length; i++) {
    const fila = i + 1; // la fila 1 es el encabezado
    const cells = rows[i];
    if (cells.every((c) => c.trim() === '')) continue;

    const nombre = (cells[colAspecto] ?? '').trim().replace(/\s+/g, ' ');
    const texto = (cells[colCriterio] ?? '').trim();
    const pesoRaw = (cells[colPeso] ?? '').trim();

    if (!nombre || !texto) {
      return { ok: false, error: `Fila ${fila}: aspecto o criterio vacío.` };
    }
    const peso = parsePeso(pesoRaw);
    if (peso === null) {
      return {
        ok: false,
        error: `Fila ${fila}: el peso "${pesoRaw}" no es válido (número mayor que 0 y hasta 100, máximo 2 decimales).`,
      };
    }

    const key = normalizeAspectoKey(nombre);
    let aspecto = porNombre.get(key);
    if (!aspecto) {
      aspecto = { nombre, criterios: [] };
      porNombre.set(key, aspecto);
      aspectos.push(aspecto);
    }
    aspecto.criterios.push({ texto, peso });
  }

  if (aspectos.length === 0) {
    return { ok: false, error: 'El archivo no contiene criterios.' };
  }
  return { ok: true, aspectos };
}
