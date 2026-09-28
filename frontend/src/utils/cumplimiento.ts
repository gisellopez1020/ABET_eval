import { ReporteABETResponse } from '../types';

/** Nota mínima de un rango para que cuente como cumplimiento (misma regla del Dashboard). */
export const MINIMO_CUMPLE = 3;

export interface CumplimientoRA {
  codigo: string;
  descripcion: string | null;
  /** 0-100, o null si el RA no tiene estudiantes evaluados. */
  porcentaje: number | null;
  /** false: el RA tiene datos en el reporte pero no está en curso.ra_abet. */
  seleccionado: boolean;
}

/** Orden natural de códigos: "2.1" antes de "2.10" (espejo de _orden_codigo del backend). */
export function compararCodigos(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : NaN;
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : NaN;
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else if (Number.isNaN(na) !== Number.isNaN(nb)) {
      return Number.isNaN(na) ? 1 : -1;
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * % de cumplimiento por Resultado de Aprendizaje: estudiantes en rangos con
 * mínimo >= 3 sobre el total del RA. Primero los RA del curso (curso.ra_abet),
 * luego los que tienen datos en el reporte sin estar seleccionados en el curso.
 */
export function cumplimientoPorRA(
  raCurso: string[],
  reporte: ReporteABETResponse | null
): CumplimientoRA[] {
  const etiquetasCumplen = (reporte?.rangos ?? [])
    .filter((r) => r.minimo >= MINIMO_CUMPLE)
    .map((r) => r.etiqueta);
  const resultados = new Map((reporte?.resultados ?? []).map((r) => [r.codigo, r]));

  const calcular = (codigo: string, seleccionado: boolean): CumplimientoRA => {
    const ra = resultados.get(codigo);
    if (!ra || ra.total === 0) {
      return { codigo, descripcion: ra?.descripcion ?? null, porcentaje: null, seleccionado };
    }
    const cumplen = etiquetasCumplen.reduce((sum, etiqueta) => sum + (ra.rangos[etiqueta] ?? 0), 0);
    return {
      codigo,
      descripcion: ra.descripcion,
      porcentaje: Math.round((cumplen / ra.total) * 100),
      seleccionado,
    };
  };

  const seleccionados = [...new Set(raCurso)].sort(compararCodigos);
  const extras = [...resultados.values()]
    .filter((r) => !seleccionados.includes(r.codigo) && r.total > 0)
    .map((r) => r.codigo)
    .sort(compararCodigos);

  return [
    ...seleccionados.map((codigo) => calcular(codigo, true)),
    ...extras.map((codigo) => calcular(codigo, false)),
  ];
}
