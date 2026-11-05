// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

// La compatibilidad de tests/setup/requestConSenalDeJsdom.ts: Request acepta la señal
// de jsdom y abortarla aborta el Request (no se pierde la semántica de cancelación).
describe('Request con AbortSignal de jsdom', () => {
  it('acepta la señal de jsdom', () => {
    const controlador = new AbortController();
    expect(() => new Request('http://localhost/x', { signal: controlador.signal })).not.toThrow();
  });

  it('abortar la señal de jsdom aborta el Request, con el mismo motivo', () => {
    const controlador = new AbortController();
    const peticion = new Request('http://localhost/x', { signal: controlador.signal });
    expect(peticion.signal.aborted).toBe(false);
    controlador.abort('navegación cancelada');
    expect(peticion.signal.aborted).toBe(true);
    expect(peticion.signal.reason).toBe('navegación cancelada');
  });

  it('una señal ya abortada llega abortada', () => {
    const controlador = new AbortController();
    controlador.abort();
    expect(new Request('http://localhost/x', { signal: controlador.signal }).signal.aborted).toBe(true);
  });
});
