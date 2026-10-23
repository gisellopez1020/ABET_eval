// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

import { GradingSelectionPage } from './GradingSelectionPage';
import { actividadesApi } from '../../../api/actividades';
import { cursosApi } from '../../../api/cursos';
import { seccionesApi } from '../../../api/secciones';
import { equiposApi } from '../../../api/equipos';
import { Actividad } from '../../../types';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../../api/actividades', () => ({ actividadesApi: { get: vi.fn() } }));
vi.mock('../../../api/cursos', () => ({ cursosApi: { get: vi.fn() } }));
vi.mock('../../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../../api/equipos', () => ({ equiposApi: { modoCalificacion: vi.fn() } }));
vi.mock('../../../api/criterios', () => ({ criteriosApi: { get: vi.fn() } }));
vi.mock('../../../api/calificaciones', () => ({ calificacionesApi: { masivo: vi.fn() } }));

const ACTIVIDAD: Actividad = {
  id: 100, nombre: 'Taller B', tipo: 'individual', peso_nota_final: 20, curso_id: 1, created_at: '2026-01-01',
  total_peso_criterios: '100.00', aplica_todas_secciones: false, secciones_ids: [11],
};
const NO_APLICA = { response: { status: 404, data: { detail: 'Esta actividad no aplica a esta sección' } } };

beforeEach(() => {
  vi.mocked(actividadesApi.get).mockResolvedValue(ACTIVIDAD);
  vi.mocked(cursosApi.get).mockResolvedValue({ id: 1, nombre: 'Redes' } as any);
  vi.mocked(seccionesApi.list).mockResolvedValue([
    { id: 10, nombre: 'Grupo A', curso_id: 1, activo: true },
    { id: 11, nombre: 'Grupo B', curso_id: 1, activo: true },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Ubicacion() {
  const location = useLocation();
  return <p data-testid="ubicacion">{location.pathname}</p>;
}

// La URL directa a una sección: así se llega a una que no está en el alcance
const renderPage = (seccionId: number) =>
  render(
    <MemoryRouter initialEntries={[`/actividades/100/calificar/${seccionId}`]}>
      <Routes>
        <Route path="/actividades/:actividadId/calificar/:seccionId" element={<GradingSelectionPage />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>
  );

describe('GradingSelectionPage — carga', () => {
  it('lista los estudiantes de una sección del alcance', async () => {
    vi.mocked(equiposApi.modoCalificacion).mockResolvedValue({
      tipo: 'individual', total: 1, calificados: 0,
      items: [{ id: 7, nombre: 'Ana Pérez', miembros: [], calificado: false, nota_total: null }],
    });
    renderPage(11);

    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('una sección fuera del alcance muestra el error del backend y vuelve al curso', async () => {
    vi.mocked(equiposApi.modoCalificacion).mockRejectedValue(NO_APLICA);
    const user = userEvent.setup();
    renderPage(10);

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Esta actividad no aplica a esta sección');
    await user.click(screen.getByRole('button', { name: '← Volver al curso' }));
    expect(screen.getByTestId('ubicacion').textContent).toBe('/cursos/1');
  });

  it('si tampoco carga la actividad, vuelve a mis cursos', async () => {
    // Con la actividad inexistente, el backend responde lo mismo a las dos llamadas
    const noExiste = { response: { status: 404, data: { detail: 'Actividad no encontrada' } } };
    vi.mocked(actividadesApi.get).mockRejectedValue(noExiste);
    vi.mocked(equiposApi.modoCalificacion).mockRejectedValue(noExiste);
    const user = userEvent.setup();
    renderPage(10);

    expect((await screen.findByRole('alert')).textContent).toContain('Actividad no encontrada');
    await user.click(screen.getByRole('button', { name: '← Volver a mis cursos' }));
    expect(screen.getByTestId('ubicacion').textContent).toBe('/dashboard');
  });

  it('sin detalle del backend usa un mensaje genérico', async () => {
    vi.mocked(equiposApi.modoCalificacion).mockRejectedValue(new Error('Network Error'));
    renderPage(10);

    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar la calificación de esta sección');
  });
});
