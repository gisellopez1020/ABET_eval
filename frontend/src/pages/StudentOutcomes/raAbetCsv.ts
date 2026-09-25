// Parseo client-side del CSV del catálogo RA ABET:
//   Codigo,Competencia,Descripcion[,CodigoPadre,Peso]
// Filas sin CodigoPadre/Peso = Resultado de Aprendizaje; con ambos = Criterio.
// Todo o nada: la primera fila inválida invalida el archivo completo. El backend
// vuelve a validar al importar (es la fuente de verdad).
import { normalizeHeader, parseDecimal, readCsv } from '../../utils/csv';

export interface RaAbetCsvItem {
  codigo: string;
  so: string;
  /** En un Criterio con la columna vacía, es la heredada de su RA. */
  competencia: string;
  descripcion: string;
  codigo_padre: string | null;
  peso: number | null;
}

export type RaAbetCsvResult =
  | { ok: true; items: RaAbetCsvItem[] }
  | { ok: false; error: string };

/** Lo mínimo del catálogo actual que se necesita para validar padres y niveles. */
export type CatalogoExistente = Pick<RaAbetCsvItem, 'codigo' | 'codigo_padre' | 'competencia'>[];

// Límite de la columna codigo en ra_abet_catalogo (competencia y descripcion son TEXT)
const MAX_CODIGO = 20;

/** El SO es la parte del código antes del primer punto: "2.1" -> "2" (igual que el backend). */
export const deducirSo = (codigo: string) => codigo.split('.', 1)[0].trim();

export type PesoResult = { ok: true; peso: number } | { ok: false; error: string };

/**
 * Peso de un Criterio dentro de su RA (0 < peso <= 1). Acepta "0,4", "0.4" o "40%"
 * (el % se divide entre 100). Un "40" sin % es ambiguo y se rechaza con una pista.
 */
export function parsePesoCriterio(raw: string): PesoResult {
  const d = parseDecimal(raw);
  if (!d) return { ok: false, error: `el peso "${raw.trim()}" no es un número válido` };
  const peso = d.porcentaje ? d.valor / 100 : d.valor;
  if (!d.porcentaje && d.valor > 1) {
    return { ok: false, error: `el peso "${raw.trim()}" debe estar entre 0 y 1 (¿quiso decir ${raw.trim()}%?)` };
  }
  if (!(peso > 0 && peso <= 1)) {
    return { ok: false, error: `el peso "${raw.trim()}" debe ser mayor que 0 y como máximo 1 (o 100%)` };
  }
  // Evita ruido de coma flotante (p. ej. 7% -> 0.07000000000000001)
  return { ok: true, peso: Number(peso.toFixed(6)) };
}

/** Suma de pesos redondeada a 4 decimales y si completa 1.0. */
export function resumenPesos(pesos: number[]): { suma: number; completo: boolean } {
  const suma = Math.round(pesos.reduce((acc, p) => acc + p, 0) * 10000) / 10000;
  return { suma, completo: suma === 1 };
}

/** Encabezado comparable: sin tildes, minúsculas, sin espacios, guiones ni guiones bajos. */
const clave = (h: string) => normalizeHeader(h).replace(/[\s_-]/g, '');

export function parseRaAbetCsv(input: string, catalogo: CatalogoExistente = []): RaAbetCsvResult {
  const rows = readCsv(input);
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  // Coincidencia exacta para "codigo": startsWith también atraparía "codigopadre"
  const header = rows[0].map(clave);
  const colCodigo = header.findIndex((h) => h === 'codigo');
  const colCompetencia = header.findIndex((h) => h.startsWith('competencia'));
  const colDescripcion = header.findIndex((h) => h.startsWith('descripcion'));
  const colPadre = header.findIndex((h) => h === 'codigopadre');
  const colPeso = header.findIndex((h) => h.startsWith('peso'));
  if (colCodigo === -1 || colCompetencia === -1 || colDescripcion === -1) {
    return {
      ok: false,
      error: 'El CSV debe tener las columnas Codigo, Competencia y Descripcion (con encabezado); CodigoPadre y Peso son opcionales.',
    };
  }
  const celda = (cells: string[], col: number) => (col === -1 ? '' : (cells[col] ?? '').trim());

  const items: RaAbetCsvItem[] = [];
  const filaPorCodigo = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const fila = i + 1; // la fila 1 es el encabezado
    const cells = rows[i];
    if (cells.every((c) => c.trim() === '')) continue;

    const codigo = celda(cells, colCodigo);
    const competencia = celda(cells, colCompetencia).replace(/\s+/g, ' ');
    const descripcion = celda(cells, colDescripcion);
    const padre = celda(cells, colPadre);
    const pesoRaw = celda(cells, colPeso);

    if (!codigo || !descripcion) {
      return { ok: false, error: `Fila ${fila}: código o descripción vacío.` };
    }
    if (codigo.length > MAX_CODIGO) {
      return { ok: false, error: `Fila ${fila}: el código admite máximo ${MAX_CODIGO} caracteres.` };
    }
    const repetida = filaPorCodigo.get(codigo);
    if (repetida !== undefined) {
      return { ok: false, error: `Fila ${fila}: el código "${codigo}" ya aparece en la fila ${repetida}.` };
    }
    filaPorCodigo.set(codigo, fila);

    let peso: number | null = null;
    if (!padre && !pesoRaw) {
      if (!competencia) {
        return { ok: false, error: `Fila ${fila}: la competencia es obligatoria en un Resultado de Aprendizaje.` };
      }
    } else if (!padre || !pesoRaw) {
      return { ok: false, error: `Fila ${fila}: CodigoPadre y Peso van juntos (un Criterio necesita ambos).` };
    } else {
      if (padre === codigo) {
        return { ok: false, error: `Fila ${fila}: "${codigo}" no puede ser su propio padre.` };
      }
      const r = parsePesoCriterio(pesoRaw);
      if (!r.ok) return { ok: false, error: `Fila ${fila}: ${r.error}.` };
      peso = r.peso;
    }

    items.push({
      codigo,
      so: deducirSo(codigo),
      competencia,
      descripcion,
      codigo_padre: padre || null,
      peso,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: 'El archivo no contiene resultados de aprendizaje.' };
  }

  // Segunda pasada: padres y niveles contra el archivo completo + el catálogo actual
  // (un Criterio puede aparecer antes que su RA en el archivo).
  const enArchivo = new Map(items.map((item) => [item.codigo, item]));
  const enCatalogo = new Map(catalogo.map((ra) => [ra.codigo, ra]));

  for (const item of items) {
    const fila = filaPorCodigo.get(item.codigo)!;
    const existente = enCatalogo.get(item.codigo);
    if (existente && (existente.codigo_padre === null) !== (item.codigo_padre === null)) {
      const nivel = existente.codigo_padre === null ? 'Resultado de Aprendizaje' : 'Criterio';
      return {
        ok: false,
        error: `Fila ${fila}: "${item.codigo}" ya existe como ${nivel} y no puede cambiar de nivel.`,
      };
    }
    if (item.codigo_padre === null) continue;

    const padre = enArchivo.get(item.codigo_padre) ?? enCatalogo.get(item.codigo_padre);
    if (!padre) {
      return {
        ok: false,
        error: `Fila ${fila}: el RA padre "${item.codigo_padre}" no existe ni en el archivo ni en el catálogo.`,
      };
    }
    if (padre.codigo_padre !== null) {
      return {
        ok: false,
        error: `Fila ${fila}: el padre "${item.codigo_padre}" es un Criterio (solo se permiten 2 niveles).`,
      };
    }
    if (!item.competencia) item.competencia = padre.competencia;
  }

  return { ok: true, items };
}
