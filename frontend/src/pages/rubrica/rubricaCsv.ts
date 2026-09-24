// Parseo client-side del CSV de rúbrica (Aspecto,Criterio,Peso).
// Solo rellena el borrador local de RubricaPage; no llama al backend.

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

/**
 * Decodifica el archivo: UTF-8 si es válido, si no Windows-1252
 * (Excel en español suele guardar así y las tildes llegarían rotas).
 */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const normalizeHeader = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const normalizeAspectoKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Excel con configuración regional en español exporta con ';'. */
function detectDelimiter(texto: string): ',' | ';' {
  const header = texto.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => header.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/** Parser CSV mínimo con soporte de campos entre comillas dobles ("" escapa comillas). */
function parseRows(texto: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (inQuotes) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parsePeso(raw: string): number | null {
  const limpio = raw.trim().replace(/\s*%$/, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(limpio)) return null;
  const peso = Number(limpio.replace(',', '.'));
  return peso > 0 && peso <= 100 ? peso : null;
}

export function parseRubricaCsv(input: string): RubricaCsvResult {
  const texto = input.replace(/^﻿/, '');
  const rows = parseRows(texto, detectDelimiter(texto));
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
