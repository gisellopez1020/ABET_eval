// Utilidades de CSV compartidas por las importaciones client-side
// (rúbrica, catálogo de RA ABET).

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

/** Normaliza un encabezado: sin tildes, minúsculas, sin espacios alrededor. */
export const normalizeHeader = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Excel con configuración regional en español exporta con ';'. */
export function detectDelimiter(texto: string): ',' | ';' {
  const header = texto.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => header.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/** Parser CSV mínimo con soporte de campos entre comillas dobles ("" escapa comillas). */
export function parseCsvRows(texto: string, delimiter: string): string[][] {
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

/** Quita el BOM, detecta el separador y devuelve las filas (la primera es el encabezado). */
export function readCsv(input: string): string[][] {
  const texto = input.replace(/^﻿/, '');
  return parseCsvRows(texto, detectDelimiter(texto));
}
