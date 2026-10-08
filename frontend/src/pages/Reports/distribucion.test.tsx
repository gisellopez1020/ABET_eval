// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import {
  ALTO_LINEA_LEYENDA, GraficaDistribucion, MARGEN_INFERIOR_PDF, Serie, altoGrafica, lineasLeyenda,
} from './distribucion';
import { ReporteCriterio } from '../../types';

const RANGOS_DEFAULT = ['0.0-2.9', '3.0-3.9', '4.0-5.0'];
// 10 rangos con etiquetas largas + "Sin clasificar": en la captura real a 900px son 4 líneas
const RANGOS_LARGOS = [
  ...Array.from({ length: 10 }, (_, i) => `Nivel ${i + 1} desempeño (${(i / 2).toFixed(1)}-${(i / 2 + 0.4).toFixed(1)})`),
  'Sin clasificar',
];
const altoAnterior = (filas: number) => Math.max(200, filas * 40 + 80);

describe('lineasLeyenda', () => {
  it('los 3 rangos por defecto caben en una línea', () => {
    expect(lineasLeyenda(RANGOS_DEFAULT, 860)).toBe(1);
  });

  it('10 rangos largos se parten en 4 líneas a 900px', () => {
    expect(lineasLeyenda(RANGOS_LARGOS, 860)).toBeGreaterThanOrEqual(4);
  });
});

describe('altoGrafica', () => {
  it('en pantalla (ancho en %) no cambia', () => {
    for (const filas of [1, 2, 6, 20]) {
      expect(altoGrafica(filas, RANGOS_LARGOS, '100%')).toBe(altoAnterior(filas));
    }
  });

  it('para exportar reserva el alto de toda la leyenda además del de las barras', () => {
    const alto = altoGrafica(6, RANGOS_LARGOS, 900);
    expect(alto).toBeGreaterThanOrEqual(altoAnterior(6) + 4 * ALTO_LINEA_LEYENDA + MARGEN_INFERIOR_PDF);
  });

  it('para exportar con 3 rangos reserva una línea', () => {
    expect(altoGrafica(2, RANGOS_DEFAULT, 900)).toBe(altoAnterior(2) + ALTO_LINEA_LEYENDA + MARGEN_INFERIOR_PDF);
  });
});

describe('GraficaDistribucion', () => {
  beforeAll(() => {
    // ResponsiveContainer observa el tamaño; jsdom no trae ResizeObserver
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(cleanup);

  const filas: ReporteCriterio[] = Array.from({ length: 6 }, (_, i) => ({
    codigo: `1.${i + 1}`, descripcion: 'd', codigo_padre: null, peso: null,
    rangos: {}, sin_clasificar: 0, total: 0,
  }));
  const series: Serie[] = RANGOS_LARGOS.map((nombre) => ({ nombre, color: '#000000', valor: () => 1 }));
  const renderizar = (ancho: number | `${number}%`) =>
    render(<GraficaDistribucion filas={filas} series={series} ancho={ancho} animar={false} />).container;

  it('la copia para exportar usa el alto con la leyenda, sin ResponsiveContainer', () => {
    const container = renderizar(900);
    expect(container.querySelector('.recharts-responsive-container')).toBeNull();
    const grafica = container.querySelector<HTMLElement>('.recharts-wrapper')!;
    expect(grafica.style.width).toBe('900px');
    expect(grafica.style.height).toBe(`${altoGrafica(6, RANGOS_LARGOS, 900)}px`);
  });

  it('la gráfica en pantalla sigue en un ResponsiveContainer con su alto de siempre', () => {
    const contenedor = renderizar('100%').querySelector<HTMLElement>('.recharts-responsive-container')!;
    expect(contenedor.style.height).toBe(`${altoAnterior(6)}px`);
  });
});
