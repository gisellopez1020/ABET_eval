import { describe, expect, it } from 'vitest';
import { RANGOS_CALIFICACION_DEFAULT, rangoToForm, validarRangos } from './rangos';

const f = (etiqueta: string, minimo: string, maximo: string) => ({ etiqueta, minimo, maximo });

describe('validarRangos', () => {
  it('acepta los rangos por defecto', () => {
    const r = validarRangos(RANGOS_CALIFICACION_DEFAULT.map(rangoToForm));
    expect(r).toEqual({ ok: true, rangos: RANGOS_CALIFICACION_DEFAULT });
  });

  it('ordena por mínimo y acepta coma decimal', () => {
    const r = validarRangos([f('Alto', '4', '5'), f('Bajo', '0', '2,9')]);
    expect(r.ok && r.rangos.map((x) => [x.etiqueta, x.maximo])).toEqual([
      ['Bajo', 2.9],
      ['Alto', 5],
    ]);
  });

  it('permite huecos', () => {
    expect(validarRangos([f('A', '0', '2'), f('B', '4', '5')]).ok).toBe(true);
  });

  it('rechaza lista vacía y más de 10', () => {
    expect(validarRangos([]).ok).toBe(false);
    const once = Array.from({ length: 11 }, (_, i) => f(`R${i}`, String(i * 0.4), String(i * 0.4 + 0.3)));
    expect(validarRangos(once).ok).toBe(false);
  });

  it('rechaza solapamiento, incluso tocándose en un punto', () => {
    const r = validarRangos([f('A', '0', '3'), f('B', '3', '4')]);
    expect(!r.ok && r.error).toMatch(/se solapan/);
  });

  it.each([
    [f('', '0', '1'), /etiqueta es obligatoria/],
    [f('X', 'abc', '1'), /deben ser números/],
    [f('X', '', '1'), /deben ser números/],
    [f('X', '-1', '1'), /deben ser números/],
    [f('X', '0', '5.5'), /entre 0 y 5/],
    [f('X', '3', '3'), /menor que el máximo/],
  ])('rechaza fila inválida %j', (fila, error) => {
    const r = validarRangos([fila]);
    expect(!r.ok && r.error).toMatch(error);
  });

  it('rechaza etiquetas repetidas sin distinguir mayúsculas', () => {
    const r = validarRangos([f('Bajo', '0', '2'), f('bajo', '3', '5')]);
    expect(!r.ok && r.error).toMatch(/repetirse/);
  });
});
