// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { RetroalimentacionPanel } from './RetroalimentacionPanel';
import { calificacionesApi } from '../../../../api/calificaciones';
import { RetroalimentacionOut } from '../../../../types';

vi.mock('../../../../api/calificaciones', () => ({
  calificacionesApi: { retroalimentacionEquipo: vi.fn(), retroalimentacionEstudiante: vi.fn() },
}));

const ASPECTOS = [
  { aspecto_id: 1, nombre: 'Diseño', cumplidos: ['Arquitectura clara'], por_reforzar: ['Justifica tecnologías'] },
  { aspecto_id: 2, nombre: 'Vacío', cumplidos: [], por_reforzar: [] },
];
const retro = (over: Partial<RetroalimentacionOut> = {}): RetroalimentacionOut => ({
  completa: true, fuente: 'estructurada', texto: null, aspectos: ASPECTOS, generada_en: null, ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RetroalimentacionPanel', () => {
  it('muestra el estado de carga mientras se genera', async () => {
    let resolver!: (r: RetroalimentacionOut) => void;
    vi.mocked(calificacionesApi.retroalimentacionEquipo).mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<RetroalimentacionPanel actividadId={100} tipo="grupal" itemId={7} />);

    expect(screen.getByRole('status').textContent).toContain('Generando retroalimentación');
    expect(calificacionesApi.retroalimentacionEquipo).toHaveBeenCalledWith(100, 7);

    resolver(retro({ fuente: 'ia', texto: 'Lograron lo principal.' }));
    expect(await screen.findByText('Lograron lo principal.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('con IA muestra el párrafo y no la lista', async () => {
    vi.mocked(calificacionesApi.retroalimentacionEstudiante).mockResolvedValue(
      retro({ fuente: 'ia', texto: 'Lograste lo principal.', generada_en: '2026-10-23T10:00:00Z' })
    );
    render(<RetroalimentacionPanel actividadId={100} tipo="individual" itemId={3} />);

    expect(await screen.findByText('Lograste lo principal.')).toBeTruthy();
    expect(calificacionesApi.retroalimentacionEstudiante).toHaveBeenCalledWith(100, 3);
    expect(screen.queryByText('Por reforzar')).toBeNull();
  });

  it('sin IA muestra la lista por aspecto, sin mensaje de error', async () => {
    vi.mocked(calificacionesApi.retroalimentacionEquipo).mockResolvedValue(retro());
    render(<RetroalimentacionPanel actividadId={100} tipo="grupal" itemId={7} />);

    expect(await screen.findByText('Arquitectura clara')).toBeTruthy();
    expect(screen.getByText('Diseño')).toBeTruthy();
    expect(screen.getByText('Logrado')).toBeTruthy();
    expect(screen.getByText('Por reforzar')).toBeTruthy();
    expect(screen.getByText('Justifica tecnologías')).toBeTruthy();
    // Un aspecto sin criterios no aparece
    expect(screen.queryByText('Vacío')).toBeNull();
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it('si el endpoint falla no muestra nada', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(calificacionesApi.retroalimentacionEquipo).mockRejectedValue(new Error('500'));
    const { container } = render(<RetroalimentacionPanel actividadId={100} tipo="grupal" itemId={7} />);

    await waitFor(() => expect(container.innerHTML).toBe(''));
    consola.mockRestore();
  });

  it('con la calificación incompleta no muestra nada', async () => {
    vi.mocked(calificacionesApi.retroalimentacionEquipo).mockResolvedValue(retro({ completa: false }));
    const { container } = render(<RetroalimentacionPanel actividadId={100} tipo="grupal" itemId={7} />);

    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
