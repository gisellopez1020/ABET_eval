// Parseo client-side del CSV de rúbrica (Aspecto,Criterio,Peso[,CodigoABET]).
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
  /** Criterio de Evaluación ABET (ej. "2.1.1") o null si el aspecto no se vincula. */
  codigo_abet: string | null;
}

export type RubricaCsvResult =
  | { ok: true; aspectos: RubricaCsvAspecto[] }
  | { ok: false; error: string };

/** Lo mínimo del catálogo ABET para validar códigos: existencia y nivel. */
export type CatalogoAbet = { codigo: string; codigo_padre: string | null }[];

const normalizeAspectoKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Encabezado comparable: sin tildes, minúsculas, sin espacios, guiones ni guiones bajos. */
const clave = (h: string) => normalizeHeader(h).replace(/[\s_-]/g, '');

/** Peso de rúbrica en escala 0-100: el "%" es opcional y no cambia el valor ("40" = "40%"). */
function parsePeso(raw: string): number | null {
  const d = parseDecimal(raw);
  if (!d || d.decimales > 2) return null;
  return d.valor > 0 && d.valor <= 100 ? d.valor : null;
}

const mostrarCodigo = (codigo: string | null) => (codigo ? `"${codigo}"` : 'vacío');

/**
 * Error si el código no es un Criterio del catálogo (mismo mensaje que el backend
 * para un RA). Sin catálogo no se valida aquí; el backend lo hará al guardar.
 */
function validarCodigoAbet(codigo: string, catalogo: CatalogoAbet | undefined): string | null {
  if (!catalogo) return null;
  const entrada = catalogo.find((ra) => ra.codigo === codigo);
  if (!entrada) return `el código ABET "${codigo}" no existe en el catálogo de Student Outcomes`;
  if (entrada.codigo_padre === null) {
    return `"${codigo}" es un Resultado de Aprendizaje, no un Criterio — usa un código como ${codigo}.1`;
  }
  return null;
}

export function parseRubricaCsv(input: string, catalogo?: CatalogoAbet): RubricaCsvResult {
  const rows = readCsv(input);
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  const header = rows[0].map(normalizeHeader);
  const colAspecto = header.findIndex((h) => h.startsWith('aspecto'));
  const colCriterio = header.findIndex((h) => h.startsWith('criterio'));
  const colPeso = header.findIndex((h) => h.startsWith('peso'));
  // Opcional: "CodigoABET", "Código ABET", "codigo_abet"...
  const colAbet = rows[0].map(clave).findIndex((h) => h === 'codigoabet');
  if (colAspecto === -1 || colCriterio === -1 || colPeso === -1) {
    return { ok: false, error: 'El CSV debe tener las columnas Aspecto, Criterio y Peso (con encabezado).' };
  }

  // Agrupa por nombre de aspecto (sin distinguir mayúsculas/espacios), en orden de primera aparición.
  const aspectos: RubricaCsvAspecto[] = [];
  const porNombre = new Map<string, RubricaCsvAspecto>();
  // Fila donde apareció por primera vez cada aspecto (para el error de código inconsistente)
  const primeraFila = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const fila = i + 1; // la fila 1 es el encabezado
    const cells = rows[i];
    if (cells.every((c) => c.trim() === '')) continue;

    const nombre = (cells[colAspecto] ?? '').trim().replace(/\s+/g, ' ');
    const texto = (cells[colCriterio] ?? '').trim();
    const pesoRaw = (cells[colPeso] ?? '').trim();
    const codigoAbet = colAbet === -1 ? null : (cells[colAbet] ?? '').trim() || null;

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
      if (codigoAbet) {
        const error = validarCodigoAbet(codigoAbet, catalogo);
        if (error) return { ok: false, error: `Fila ${fila}: ${error}.` };
      }
      aspecto = { nombre, criterios: [], codigo_abet: codigoAbet };
      porNombre.set(key, aspecto);
      primeraFila.set(key, fila);
      aspectos.push(aspecto);
    } else if (aspecto.codigo_abet !== codigoAbet) {
      // Todas las filas de un aspecto traen el mismo código (o todas vacío)
      return {
        ok: false,
        error:
          `Fila ${fila}: el aspecto "${aspecto.nombre}" trae el código ABET ${mostrarCodigo(codigoAbet)}, ` +
          `pero en la fila ${primeraFila.get(key)} trae ${mostrarCodigo(aspecto.codigo_abet)}.`,
      };
    }
    aspecto.criterios.push({ texto, peso });
  }

  if (aspectos.length === 0) {
    return { ok: false, error: 'El archivo no contiene criterios.' };
  }
  return { ok: true, aspectos };
}
