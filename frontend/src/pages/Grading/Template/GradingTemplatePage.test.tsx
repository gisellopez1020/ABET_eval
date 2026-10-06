// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';

import { GradingTemplatePage } from './GradingTemplatePage';
import { actividadesApi } from '../../../api/actividades';
import { criteriosApi } from '../../../api/criterios';
import { calificacionesApi } from '../../../api/calificaciones';
import { ModoCalificacionItem } from '../../../types';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../../components/Layout/Header', () => ({ Header: () => null }));
vi.mock('../../../api/actividades', () => ({ actividadesApi: { get: vi.fn() } }));
vi.mock('../../../api/criterios', () => ({ criteriosApi: { get: vi.fn() } }));
vi.mock('../../../api/calificaciones', () => ({
  calificacionesApi: { equipo: vi.fn(), estudiante: vi.fn(), save: vi.fn() },
}));

const item = (id: number, nombre: string): ModoCalificacionItem => ({
  id, nombre, miembros: [], calificado: false, nota_total: null,
});
// Cuatro equipos sin calificar, en el orden en que los lista la pantalla de selección
const ITEMS = [item(1, 'Equipo A'), item(2, 'Equipo B'), item(3, 'Equipo C'), item(4, 'Equipo D')];

interface NavState {
  items: ModoCalificacionItem[];
  currentIndex: number;
  tipo: 'individual' | 'grupal';
}

beforeEach(() => {
  vi.mocked(actividadesApi.get).mockResolvedValue({
    id: 100, nombre: 'Proyecto final', tipo: 'grupal', peso_nota_final: 30, curso_id: 1,
    created_at: '2026-01-01', total_peso_criterios: '100.00',
  });
  vi.mocked(criteriosApi.get).mockResolvedValue({
    aspectos: [{
      id: 1, nombre: 'Diseño', orden: 0, codigo_abet: null,
      criterios: [{ id: 11, texto: 'Arquitectura clara', peso_porcentaje: 100, aspecto_id: 1, orden: 0 }],
    }],
    total_peso: 100,
  } as never);
  vi.mocked(calificacionesApi.equipo).mockResolvedValue([]);
  vi.mocked(calificacionesApi.save).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Router real en memoria: router.state.location.state es exactamente lo que viaja entre pantallas
const renderEn = (index: number) => {
  const router = createMemoryRouter(
    [
      { path: '/actividades/:actividadId/calificar/:seccionId/:itemId', element: <GradingTemplatePage /> },
      { path: '/actividades/:actividadId/calificar/:seccionId', element: <p>Lista de calificación</p> },
    ],
    {
      initialEntries: [{
        pathname: `/actividades/100/calificar/10/${ITEMS[index].id}`,
        state: { items: ITEMS, currentIndex: index, tipo: 'grupal' } satisfies NavState,
      }],
    }
  );
  render(<RouterProvider router={router} />);
  return router;
};

const navState = (router: ReturnType<typeof createMemoryRouter>) => router.state.location.state as NavState;

// Espera a que la página cargue el ítem indicado (la navegación interna no desmonta la página)
const enItem = async (nombre: string) => {
  expect(await screen.findByRole('heading', { name: nombre })).toBeTruthy();
};

describe('GradingTemplatePage — estado de navegación al guardar', () => {
  it('guardar un ítem que no es el primero lo marca como calificado en el state que viaja', async () => {
    const user = userEvent.setup();
    const router = renderEn(2); // Equipo C
    await enItem('Equipo C');

    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));
    await enItem('Equipo D');

    const state = navState(router);
    expect(state.currentIndex).toBe(3);
    expect(state.items.map((i) => i.calificado)).toEqual([false, false, true, false]);
    expect(state.items[2].nota_total).toBe(0);
  });

  it('al volver con "Anterior" y guardar, salta al siguiente realmente pendiente, no a uno ya calificado', async () => {
    const user = userEvent.setup();
    const router = renderEn(0);

    // Califica A y B en orden: llega a C
    await enItem('Equipo A');
    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));
    await enItem('Equipo B');
    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));
    await enItem('Equipo C');

    // Vuelve a A, lo corrige y guarda: B ya está calificado, el siguiente pendiente es C
    await user.click(screen.getByRole('button', { name: /anterior/i }));
    await enItem('Equipo B');
    await user.click(screen.getByRole('button', { name: /anterior/i }));
    await enItem('Equipo A');
    await user.click(screen.getByRole('button', { name: 'No cumple (0)' }));
    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));

    await enItem('Equipo C');
    const state = navState(router);
    expect(state.currentIndex).toBe(2);
    expect(state.items.map((i) => i.calificado)).toEqual([true, true, false, false]);
    // La nota de A es la de la corrección (1 en el único criterio, peso 100 %)
    expect(state.items[0].nota_total).toBe(5);
    await waitFor(() => expect(calificacionesApi.save).toHaveBeenCalledTimes(3));
  });
});
