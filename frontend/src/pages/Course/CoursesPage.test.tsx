// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';

import { CoursesPage } from './CoursesPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { Curso } from '../../types';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn(), archivar: vi.fn(), activar: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn() } }));

const curso = (activo: boolean): Curso => ({
  id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
  ra_abet: [], rangos_calificacion: [], activo, created_at: '2026-01-01',
});

beforeEach(() => {
  vi.mocked(seccionesApi.list).mockResolvedValue([]);
  vi.mocked(estudiantesApi.list).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <CoursesPage />
    </MemoryRouter>
  );

describe('CoursesPage — cerrar / reactivar asignatura', () => {
  it('si cursosApi.archivar falla, el modal sigue abierto y muestra el mensaje de error', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([curso(true)]);
    vi.mocked(cursosApi.archivar).mockRejectedValue({ response: { status: 500 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderPage();

    // El botón de la fila de una asignatura activa dice "Eliminar" (cierra/archiva)
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(screen.getByText('¿Deseas cerrar la asignatura "Ingeniería de Software"?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    // El error llega al modal…
    expect(await screen.findByText('No fue posible cerrar la asignatura.')).toBeTruthy();
    // …y el modal no se cerró
    expect(screen.getByRole('dialog', { name: 'Cerrar asignatura' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
    expect(cursosApi.archivar).toHaveBeenCalledTimes(1);
    expect(cursosApi.archivar).toHaveBeenCalledWith(1);
    expect(cursosApi.activar).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('si cursosApi.activar falla, muestra el mensaje de reactivar dentro del modal', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([curso(false)]);
    vi.mocked(cursosApi.activar).mockRejectedValue({ response: { status: 500 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Activar' }));
    expect(screen.getByText('¿Deseas reactivar la asignatura "Ingeniería de Software"?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByText('No fue posible reactivar la asignatura.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Reactivar asignatura' })).toBeTruthy();
  });

  it('si la acción tiene éxito, recarga la lista y cierra el modal', async () => {
    vi.mocked(cursosApi.list).mockResolvedValueOnce([curso(false)]).mockResolvedValue([curso(true)]);
    vi.mocked(cursosApi.activar).mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Activar' }));
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cursosApi.activar).toHaveBeenCalledWith(1);
    expect(cursosApi.list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Activo')).toBeTruthy();
  });
});

describe('CoursesPage — detalle de asignatura (CourseDetailsModal)', () => {
  it('es un diálogo accesible: atrapa el foco, cierra con Esc (no con el fondo) y devuelve el foco a "Ver"', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([curso(true)]);
    const user = userEvent.setup();

    renderPage();
    const ver = await screen.findByRole('button', { name: 'Ver' });
    await user.click(ver);

    const dialog = screen.getByRole('dialog', { name: 'Ingeniería de Software' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    // Clic en el fondo: no cierra (igual que antes de la migración)
    await user.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Ingeniería de Software' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(ver);
  });
});
