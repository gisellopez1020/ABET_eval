import { describe, expect, it } from 'vitest';
import { ReporteABETResponse, ReporteRA } from '../types';
import { compararCodigos, cumplimientoPorRA } from './cumplimiento';

const ra = (codigo: string, rangos: Record<string, number>, sin_clasificar = 0): ReporteRA => ({
  codigo,
  descripcion: `Descripción ${codigo}`,
  rangos,
  sin_clasificar,
  total: Object.values(rangos).reduce((a, b) => a + b, 0) + sin_clasificar,
  criterios_con_evidencia: [],
  criterios_sin_evidencia: [],
});

const reporte = (resultados: ReporteRA[]): ReporteABETResponse => ({
  curso_id: 1,
  curso_nombre: 'Redes',
  curso_codigo: 'R-1',
  periodo: '2026-2',
  docente_email: 'x@uao.edu.co',
  rangos: [
    { etiqueta: 'Bajo', minimo: 0, maximo: 2.9 },
    { etiqueta: 'Medio', minimo: 3, maximo: 3.9 },
    { etiqueta: 'Alto', minimo: 4, maximo: 5 },
  ],
  criterios: [],
  resultados,
});

describe('compararCodigos', () => {
  it('ordena de forma natural', () => {
    expect(['2.10', '4.2', '2.1', '2.2', '10.1'].sort(compararCodigos)).toEqual([
      '2.1', '2.2', '2.10', '4.2', '10.1',
    ]);
  });
});

describe('cumplimientoPorRA', () => {
  it('calcula el % por RA con rangos de mínimo >= 3, incluyendo sin clasificar en el total', () => {
    const r = reporte([ra('2.1', { Bajo: 1, Medio: 1, Alto: 2 }), ra('4.2', { Bajo: 2, Medio: 0, Alto: 1 }, 1)]);
    expect(cumplimientoPorRA(['4.2', '2.1'], r)).toEqual([
      { codigo: '2.1', descripcion: 'Descripción 2.1', porcentaje: 75, seleccionado: true },
      { codigo: '4.2', descripcion: 'Descripción 4.2', porcentaje: 25, seleccionado: true },
    ]);
  });

  it('marca sin datos los RA del curso que no están en el reporte o tienen total 0', () => {
    const r = reporte([ra('2.1', { Bajo: 0, Medio: 0, Alto: 0 })]);
    expect(cumplimientoPorRA(['2.1', '3.1'], r).map((x) => [x.codigo, x.porcentaje])).toEqual([
      ['2.1', null],
      ['3.1', null],
    ]);
  });

  it('agrega al final, no seleccionados, los RA con datos que no están en el curso', () => {
    const r = reporte([ra('5.1', { Bajo: 0, Medio: 1, Alto: 0 }), ra('1.1', { Bajo: 1, Medio: 0, Alto: 0 }), ra('6.1', {})]);
    expect(cumplimientoPorRA(['2.1'], r).map((x) => [x.codigo, x.porcentaje, x.seleccionado])).toEqual([
      ['2.1', null, true],
      ['1.1', 0, false],
      ['5.1', 100, false],
    ]);
  });

  it('sin RA ni reporte devuelve lista vacía', () => {
    expect(cumplimientoPorRA([], null)).toEqual([]);
  });
});
