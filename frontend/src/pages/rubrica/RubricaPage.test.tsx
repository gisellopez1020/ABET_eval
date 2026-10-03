// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../../api/criterios', () => ({ criteriosApi: { get: vi.fn(), importarExcel: vi.fn() } }));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn() } }));

const ACTIVIDAD = {
  id: 100, nombre: 'Proyecto final', tipo: 'grupal' as const, peso_nota_final: 30, curso_id: 1,
  created_at: '2026-01-01', total_peso_criterios: '100.00',
};
const OTRA_ACTIVIDAD = { ...ACTIVIDAD, id: 200, nombre: 'Parcial' };

beforeEach(() => {
  vi.mocked(cursosApi.list).mockResolvedValue([
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  ]);
  vi.mocked(actividadesApi.get).mockResolvedValue(ACTIVIDAD);
  vi.mocked(actividadesApi.list).mockResolvedValue([ACTIVIDAD, OTRA_ACTIVIDAD]);
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
        <Route path="/cursos/:cursoId" element={<p>Página del curso</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('RubricaPage — eliminar aspecto', () => {
  it('un aspecto con criterios se confirma en el modal: Cancelar lo conserva y Eliminar lo quita del borrador', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar Diseño' }));
    expect(screen.getByRole('dialog', { name: 'Eliminar aspecto' })).toBeTruthy();
    expect(screen.getByText('¿Eliminar el aspecto "Diseño" y sus 2 criterios?')).toBeTruthy();

    // Cancelar cierra el modal sin tocar el borrador
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Diseño' })).toBeTruthy();

    // Confirmar lo quita del borrador
    await user.click(screen.getByRole('button', { name: 'Eliminar Diseño' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Vacío' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('un aspecto sin criterios se elimina directamente, sin modal', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar Vacío' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Vacío' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Diseño' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('RubricaPage — descartar cambios sin guardar', () => {
  const AVISO = 'Hay cambios sin guardar en la rúbrica. ¿Descartarlos?';
  const selectActividad = () => screen.getAllByRole('combobox')[1] as HTMLSelectElement;

  // Eliminar un aspecto sin criterios deja el borrador con cambios sin guardar, sin abrir ningún modal
  const ensuciarBorrador = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Eliminar Vacío' }));
  };

  it('sin cambios, cambiar de actividad no pide confirmación', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    await user.selectOptions(selectActividad(), '200');

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(criteriosApi.get).toHaveBeenLastCalledWith(200));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('con cambios, cambiar de actividad abre el modal: Cancelar no cambia nada y Descartar cambia de actividad', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();
    await ensuciarBorrador(user);

    await user.selectOptions(selectActividad(), '200');
    expect(screen.getByRole('dialog', { name: 'Cambios sin guardar' })).toBeTruthy();
    expect(screen.getByText(AVISO)).toBeTruthy();

    // Cancelar: sigue en la misma actividad y con el borrador intacto
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(selectActividad().value).toBe('100');
    expect(criteriosApi.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Eliminar Vacío' })).toBeNull();

    // Descartar: se ejecuta el cambio de actividad pendiente
    await user.selectOptions(selectActividad(), '200');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(criteriosApi.get).toHaveBeenLastCalledWith(200));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('con cambios, "Volver al curso" solo navega después de confirmar', async () => {
    const user = userEvent.setup();

    renderPage();
    await ensuciarBorrador(user);

    await user.click(screen.getByRole('button', { name: /volver al curso/i }));
    expect(screen.getByText(AVISO)).toBeTruthy();
    expect(screen.queryByText('Página del curso')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(await screen.findByText('Página del curso')).toBeTruthy();
  });

  it('con cambios, importar muestra el aviso dentro del modal de import (sin abrir un segundo modal)', async () => {
    vi.mocked(criteriosApi.importarExcel).mockResolvedValue({
      aspectos: [{ nombre: 'Importado', criterios: [{ texto: 'Criterio importado', peso_porcentaje: '100' }] }],
      total_peso: '100',
    });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    const { container } = renderPage();
    await ensuciarBorrador(user);

    await user.click(screen.getAllByRole('button', { name: /importar excel/i })[0]);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'rubrica.xlsx'));
    await user.click(await screen.findByRole('button', { name: 'Importar al borrador' }));

    // El aviso aparece dentro del modal de import, que sigue abierto; no hay modal de descarte encima
    expect(screen.getByText(AVISO)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Importar rúbrica desde Excel' })).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // Cancelar el aviso vuelve a los botones normales sin importar
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Importado' })).toBeNull();

    // Descartar e importar reemplaza el borrador y cierra el modal
    await user.click(screen.getByRole('button', { name: 'Importar al borrador' }));
    await user.click(screen.getByRole('button', { name: 'Descartar e importar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Importado' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
