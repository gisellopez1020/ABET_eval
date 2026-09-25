import { describe, expect, it } from 'vitest';
import { parseDecimal } from './csv';

describe('parseDecimal', () => {
  it.each([
    ['0.4', { valor: 0.4, porcentaje: false, decimales: 1 }],
    ['0,4', { valor: 0.4, porcentaje: false, decimales: 1 }],
    ['40%', { valor: 40, porcentaje: true, decimales: 0 }],
    [' 87,5 % ', { valor: 87.5, porcentaje: true, decimales: 1 }],
    ['.25', { valor: 0.25, porcentaje: false, decimales: 2 }],
    ['10.555', { valor: 10.555, porcentaje: false, decimales: 3 }],
  ])('%j', (raw, esperado) => {
    expect(parseDecimal(raw)).toEqual(esperado);
  });

  it.each(['', 'abc', '-5', '1,2,3', '4%%', '%', '1 000'])('rechaza %j', (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });
});
