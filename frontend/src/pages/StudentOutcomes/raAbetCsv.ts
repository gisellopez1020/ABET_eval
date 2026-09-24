// Parseo client-side del CSV del catálogo RA ABET (Codigo,Competencia,Descripcion).
// Todo o nada: la primera fila inválida invalida el archivo completo.
import { normalizeHeader, readCsv } from '../../utils/csv';

export interface RaAbetCsvItem {
  codigo: string;
  so: string;
  competencia: string;
  descripcion: string;
}

export type RaAbetCsvResult =
  | { ok: true; items: RaAbetCsvItem[] }
  | { ok: false; error: string };

// Límite de la columna codigo en ra_abet_catalogo (competencia y descripcion son TEXT)
const MAX_CODIGO = 20;

/** El SO es la parte del código antes del primer punto: "2.1" -> "2" (igual que el backend). */
export const deducirSo = (codigo: string) => codigo.split('.', 1)[0].trim();

export function parseRaAbetCsv(input: string): RaAbetCsvResult {
  const rows = readCsv(input);
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  const header = rows[0].map(normalizeHeader);
  const colCodigo = header.findIndex((h) => h.startsWith('codigo'));
  const colCompetencia = header.findIndex((h) => h.startsWith('competencia'));
  const colDescripcion = header.findIndex((h) => h.startsWith('descripcion'));
  if (colCodigo === -1 || colCompetencia === -1 || colDescripcion === -1) {
    return {
      ok: false,
      error: 'El CSV debe tener las columnas Codigo, Competencia y Descripcion (con encabezado).',
    };
  }

  const items: RaAbetCsvItem[] = [];
  const filaPorCodigo = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const fila = i + 1; // la fila 1 es el encabezado
    const cells = rows[i];
    if (cells.every((c) => c.trim() === '')) continue;

    const codigo = (cells[colCodigo] ?? '').trim();
    const competencia = (cells[colCompetencia] ?? '').trim().replace(/\s+/g, ' ');
    const descripcion = (cells[colDescripcion] ?? '').trim();

    if (!codigo || !competencia || !descripcion) {
      return { ok: false, error: `Fila ${fila}: código, competencia o descripción vacío.` };
    }
    if (codigo.length > MAX_CODIGO) {
      return { ok: false, error: `Fila ${fila}: el código admite máximo ${MAX_CODIGO} caracteres.` };
    }
    const repetida = filaPorCodigo.get(codigo);
    if (repetida !== undefined) {
      return { ok: false, error: `Fila ${fila}: el código "${codigo}" ya aparece en la fila ${repetida}.` };
    }
    filaPorCodigo.set(codigo, fila);

    items.push({ codigo, so: deducirSo(codigo), competencia, descripcion });
  }

  if (items.length === 0) {
    return { ok: false, error: 'El archivo no contiene resultados de aprendizaje.' };
  }
  return { ok: true, items };
}
