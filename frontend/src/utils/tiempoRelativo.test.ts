import { describe, expect, it } from 'vitest';
import { tiempoRelativo } from './tiempoRelativo';

const AHORA = new Date('2026-09-28T12:00:00Z');
const antes = (segundos: number) => new Date(AHORA.getTime() - segundos * 1000);

describe('tiempoRelativo', () => {
  it('menos de un minuto o en el futuro', () => {
    expect(tiempoRelativo(antes(30), AHORA)).toBe('hace un momento');
    expect(tiempoRelativo(antes(-120), AHORA)).toBe('hace un momento');
  });

  it('minutos, horas y días', () => {
    expect(tiempoRelativo(antes(5 * 60), AHORA)).toBe('hace 5 minutos');
    expect(tiempoRelativo(antes(2 * 3600 + 59), AHORA)).toBe('hace 2 horas');
    expect(tiempoRelativo(antes(3 * 86400), AHORA)).toBe('hace 3 días');
  });

  it('acepta cadenas ISO', () => {
    expect(tiempoRelativo('2026-09-28T11:00:00+00:00', AHORA)).toBe('hace 1 hora');
  });
});
