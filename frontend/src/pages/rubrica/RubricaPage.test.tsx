// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';

import RubricaPage from './RubricaPage';
import { cursosApi } from '../../api/cursos';
import { actividadesApi } from '../../api/actividades';
import { criteriosApi } from '../../api/criterios';
import { catalogoRaAbetApi } from '../../api/catalogo';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('../../api/criterios', () => ({ criteriosApi: { get: vi.fn() } }));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn() } }));

const ACTIVIDAD = {
  id: 100, nombre: 'Proyecto final', tipo: 'grupal' as const, peso_nota_final: 30, curso_id: 1,
  created_at: '2026-01-01', total_peso_criterios: '100.00',
};

beforeEach(() => {
  vi.mocked(cursosApi.list).mockResolvedValue([
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  ]);
  vi.mocked(actividadesApi.get).mockResolvedValue(ACTIVIDAD);
  vi.mocked(actividadesApi.list).mockResolvedValue([ACTIVIDAD]);
  vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
  vi.mocked(criteriosApi.get).mockResolvedValue({
    aspectos: [
      { id: 1, nombre: 'Diseño', orden: 1, codigo_abet: null, criterios: [
        { id: 11, texto: 'Plantea el problema', peso_porcentaje: 60, aspecto_id: 1, orden: 1 },
        { id: 12, texto: 'Propone una solución', peso_porcentaje: 40, aspecto_id: 1, orden: 2 },
      ] },
      { id: 2, nombre: 'Vacío', orden: 2, codigo_abet: null, criterios: [] },
    ],
    total_peso: 100,
    tiene_calificaciones: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/actividades/100']}>
      <Routes>
        <Route path="/actividades/:actividadId" element={<RubricaPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('RubricaPage — eliminar aspecto', () => {
  it('un aspecto con criterios se confirma en el modal: Cancelar lo conserva y Eliminar lo quita del borrador', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar Diseño' }));
    expect(screen.getByRole('heading', { name: 'Eliminar aspecto' })).toBeTruthy();
    expect(screen.getByText('¿Eliminar el aspecto "Diseño" y sus 2 criterios?')).toBeTruthy();

    // Cancelar cierra el modal sin tocar el borrador
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('heading', { name: 'Eliminar aspecto' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Diseño' })).toBeTruthy();

    // Confirmar lo quita del borrador
    await user.click(screen.getByRole('button', { name: 'Eliminar Diseño' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.queryByRole('heading', { name: 'Eliminar aspecto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Vacío' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('un aspecto sin criterios se elimina directamente, sin modal', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar Vacío' }));

    expect(screen.queryByRole('heading', { name: 'Eliminar aspecto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Vacío' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Diseño' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
