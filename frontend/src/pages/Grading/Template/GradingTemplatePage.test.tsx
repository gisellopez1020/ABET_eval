// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

// ── Línea base antes de dividir GradingTemplatePage ──────────────────────────

// Rúbrica con dos criterios: 60 % y 40 %
const RUBRICA_2 = {
  aspectos: [
    { id: 1, nombre: 'Diseño', orden: 0, codigo_abet: null, criterios: [
      { id: 11, texto: 'Arquitectura clara', peso_porcentaje: 60, aspecto_id: 1, orden: 0 },
      { id: 12, texto: 'Modelo de datos', peso_porcentaje: 40, aspecto_id: 1, orden: 1 },
    ] },
  ],
  total_peso: 100,
};
const guardada = (criterio_id: number, valor: 0 | 1) => ({
  id: criterio_id, criterio_id, valor, nota_calculada: 0, equipo_id: 1, estudiante_id: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
});
const filaCriterio = (texto: string) => screen.getByText(texto).closest('tr') as HTMLElement;
const celdasDe = (texto: string) => Array.from(filaCriterio(texto).querySelectorAll('td')).map((td) => td.textContent);
const toggleDe = (texto: string) => within(filaCriterio(texto)).getByRole('button');

describe('GradingTemplatePage — encabezado y navegación entre ítems', () => {
  it('equipo: muestra tipo, nombre, integrantes y la posición; Anterior deshabilitado en el primero', async () => {
    const items = [{ ...ITEMS[0], miembros: [
      { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '1', seccion_id: 10 },
      { id: 8, nombre_completo: 'Beto Ruiz', codigo_estudiante: '2', seccion_id: 10 },
    ] }, ...ITEMS.slice(1)];
    const router = createMemoryRouter(
      [{ path: '/actividades/:actividadId/calificar/:seccionId/:itemId', element: <GradingTemplatePage /> }],
      { initialEntries: [{ pathname: '/actividades/100/calificar/10/1', state: { items, currentIndex: 0, tipo: 'grupal' } }] }
    );
    render(<RouterProvider router={router} />);
    await enItem('Equipo A');

    expect(screen.getByText('Equipo')).toBeTruthy();
    expect(screen.getByText('Ana Pérez · Beto Ruiz')).toBeTruthy();
    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect((screen.getByRole('button', { name: /anterior/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /siguiente/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('en el último ítem "Siguiente" está deshabilitado', async () => {
    renderEn(3);
    await enItem('Equipo D');

    expect(screen.getByText('4 / 4')).toBeTruthy();
    expect((screen.getByRole('button', { name: /siguiente/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Siguiente" y "Anterior" cambian de ítem reemplazando la entrada y conservando la lista', async () => {
    const user = userEvent.setup();
    const router = renderEn(1);
    await enItem('Equipo B');

    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    await enItem('Equipo C');
    expect(router.state.location.pathname).toBe('/actividades/100/calificar/10/3');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(navState(router)).toEqual({ items: ITEMS, currentIndex: 2, tipo: 'grupal' });
    // Cada ítem carga sus propias calificaciones guardadas
    expect(calificacionesApi.equipo).toHaveBeenLastCalledWith(100, 3);

    await user.click(screen.getByRole('button', { name: /anterior/i }));
    await user.click(screen.getByRole('button', { name: /anterior/i }));
    await enItem('Equipo A');
    expect(navState(router).currentIndex).toBe(0);
  });

  it('"← Volver a la lista" vuelve a la selección sin state', async () => {
    const user = userEvent.setup();
    const router = renderEn(1);
    await enItem('Equipo B');

    await user.click(screen.getByRole('button', { name: '← Volver a la lista' }));

    expect(await screen.findByText('Lista de calificación')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/actividades/100/calificar/10');
    expect(router.state.location.state).toBeNull();
  });

  it('abierta por URL directa (sin state): sin navegación, "Item N" como nombre, y guardar vuelve a la lista', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/actividades/:actividadId/calificar/:seccionId/:itemId', element: <GradingTemplatePage /> },
        { path: '/actividades/:actividadId/calificar/:seccionId', element: <p>Lista de calificación</p> },
      ],
      { initialEntries: ['/actividades/100/calificar/10/3'] }
    );
    render(<RouterProvider router={router} />);
    await enItem('Item 3');

    expect(screen.queryByRole('button', { name: /anterior/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));

    expect(await screen.findByText('Lista de calificación')).toBeTruthy();
    expect(calificacionesApi.save).toHaveBeenCalledWith({ actividad_id: 100, criterios: [{ criterio_id: 11, valor: 0 }], equipo_id: 3 });
  });

  it('guardar el último ítem sin pendientes vuelve a la lista', async () => {
    const user = userEvent.setup();
    renderEn(3);
    await enItem('Equipo D');

    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));

    expect(await screen.findByText('Lista de calificación')).toBeTruthy();
  });
});

describe('GradingTemplatePage — tabla de criterios y nota', () => {
  beforeEach(() => {
    vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA_2 as never);
  });

  it('arranca con las calificaciones guardadas y calcula puntajes y nota total', async () => {
    vi.mocked(calificacionesApi.equipo).mockResolvedValue([guardada(11, 1)]);
    renderEn(0);
    await enItem('Equipo A');

    expect(celdasDe('Arquitectura clara')).toEqual(['1', 'Diseño', 'Arquitectura clara', '60%', '', '3.0000']);
    expect(celdasDe('Modelo de datos')).toEqual(['2', '', 'Modelo de datos', '40%', '', '0.0000']);
    expect(toggleDe('Arquitectura clara').getAttribute('aria-label')).toBe('Cumple (1)');
    expect(toggleDe('Modelo de datos').getAttribute('aria-label')).toBe('No cumple (0)');
    expect(screen.getByText('3.00')).toBeTruthy();
    const total = screen.getByText('TOTAL').closest('tr') as HTMLElement;
    expect(Array.from(total.querySelectorAll('td')).map((td) => td.textContent)).toEqual(['TOTAL', '100%', '', '3.0000']);
  });

  it('cambiar un toggle recalcula la nota y guardar envía todos los criterios', async () => {
    const user = userEvent.setup();
    renderEn(0);
    await enItem('Equipo A');
    expect(screen.getByText('0.00')).toBeTruthy();

    await user.click(toggleDe('Modelo de datos'));
    expect(celdasDe('Modelo de datos')[5]).toBe('2.0000');
    expect(screen.getByText('2.00')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));
    expect(calificacionesApi.save).toHaveBeenCalledWith({
      actividad_id: 100,
      criterios: [{ criterio_id: 11, valor: 0 }, { criterio_id: 12, valor: 1 }],
      equipo_id: 1,
    });
  });

  it('la nota de 3 o más se pinta en verde; menos de 3, en el color de alerta', async () => {
    const user = userEvent.setup();
    renderEn(0);
    await enItem('Equipo A');
    expect(screen.getByText('0.00').className).toContain('text-uao-accent');

    await user.click(toggleDe('Arquitectura clara'));
    expect(screen.getByText('3.00').className).toContain('text-green-600');
  });

  it('si guardar falla, muestra el detalle y se queda en el ítem', async () => {
    vi.mocked(calificacionesApi.save).mockRejectedValue({ response: { data: { detail: 'Criterio de otra actividad' } } });
    const user = userEvent.setup();
    const router = renderEn(0);
    await enItem('Equipo A');

    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));

    expect(await screen.findByText('Criterio de otra actividad')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/actividades/100/calificar/10/1');
  });

  it('si no se pueden leer las calificaciones guardadas, avisa y no deja guardar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(calificacionesApi.equipo).mockRejectedValue(new Error('x'));
    renderEn(0);
    await enItem('Equipo A');

    expect(screen.getByText(/No se pudieron cargar las calificaciones guardadas\./)).toBeTruthy();
    expect((screen.getByRole('button', { name: /guardar calificación/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(toggleDe('Arquitectura clara').getAttribute('aria-label')).toBe('No cumple (0)');
  });

  it('si no se puede cargar la actividad, solo muestra el error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(actividadesApi.get).mockRejectedValue(new Error('x'));
    renderEn(0);

    expect(await screen.findByText('No se pudo cargar la actividad.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /guardar calificación/i })).toBeNull();
  });
});

describe('GradingTemplatePage — actividad individual', () => {
  it('el tipo sale de la actividad: muestra el código, lee y guarda como estudiante', async () => {
    vi.mocked(actividadesApi.get).mockResolvedValue({
      id: 100, nombre: 'Parcial', tipo: 'individual', peso_nota_final: 20, curso_id: 1,
      created_at: '2026-01-01', total_peso_criterios: '100.00',
    });
    vi.mocked(calificacionesApi.estudiante).mockResolvedValue([]);
    const estudiante = { id: 7, nombre: 'Ana Pérez', calificado: false, nota_total: null,
      miembros: [{ id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 }] };
    const router = createMemoryRouter(
      [
        { path: '/actividades/:actividadId/calificar/:seccionId/:itemId', element: <GradingTemplatePage /> },
        { path: '/actividades/:actividadId/calificar/:seccionId', element: <p>Lista de calificación</p> },
      ],
      // El state dice "grupal", pero manda la actividad
      { initialEntries: [{ pathname: '/actividades/100/calificar/10/7', state: { items: [estudiante], currentIndex: 0, tipo: 'grupal' } }] }
    );
    const user = userEvent.setup();
    render(<RouterProvider router={router} />);
    await enItem('Ana Pérez');

    expect(screen.getByText('Estudiante')).toBeTruthy();
    expect(screen.getByText('Código: 2210001')).toBeTruthy();
    expect(calificacionesApi.estudiante).toHaveBeenCalledWith(100, 7);
    expect(calificacionesApi.equipo).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /guardar calificación/i }));
    expect(calificacionesApi.save).toHaveBeenCalledWith({
      actividad_id: 100, criterios: [{ criterio_id: 11, valor: 0 }], estudiante_id: 7,
    });
    await waitFor(() => expect(router.state.location.state).toBeNull());
  });
});
