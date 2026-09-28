import { describe, expect, it } from 'vitest';
import { Aspecto } from '../types';
import { valoresIniciales } from './valoresIniciales';

const aspecto = (id: number, criterioIds: number[]): Aspecto => ({
  id,
  nombre: `Aspecto ${id}`,
  orden: id,
  codigo_abet: null,
  criterios: criterioIds.map((cid, orden) => ({
    id: cid,
    texto: `Criterio ${cid}`,
    peso_porcentaje: 25,
    aspecto_id: id,
    orden,
  })),
});

const rubrica = [aspecto(1, [10, 11]), aspecto(2, [20, 21])];

describe('valoresIniciales', () => {
  it('ya calificado: carga los valores reales, no ceros', () => {
    const guardadas = [
      { criterio_id: 10, valor: 1 as const },
      { criterio_id: 11, valor: 0 as const },
      { criterio_id: 20, valor: 1 as const },
      { criterio_id: 21, valor: 1 as const },
    ];
    expect(valoresIniciales(rubrica, guardadas)).toEqual({ 10: 1, 11: 0, 20: 1, 21: 1 });
  });

  it('nunca calificado: todo arranca en 0', () => {
    expect(valoresIniciales(rubrica, [])).toEqual({ 10: 0, 11: 0, 20: 0, 21: 0 });
  });

  it('calificado a medias: valores reales y 0 solo en los que faltan', () => {
    const guardadas = [{ criterio_id: 11, valor: 1 as const }];
    expect(valoresIniciales(rubrica, guardadas)).toEqual({ 10: 0, 11: 1, 20: 0, 21: 0 });
  });

  it('ignora calificaciones de criterios que ya no están en la rúbrica', () => {
    const guardadas = [{ criterio_id: 99, valor: 1 as const }, { criterio_id: 20, valor: 1 as const }];
    expect(valoresIniciales(rubrica, guardadas)).toEqual({ 10: 0, 11: 0, 20: 1, 21: 0 });
  });

  it('rúbrica vacía', () => {
    expect(valoresIniciales([], [{ criterio_id: 10, valor: 1 }])).toEqual({});
  });
});
