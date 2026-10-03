// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';

import { SectionPage } from './SectionPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { get: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn(), delete: vi.fn() } }));

const DETALLE_409 = 'No se puede eliminar al estudiante: tiene calificaciones registradas';

beforeEach(() => {
  vi.mocked(cursosApi.get).mockResolvedValue(
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  );
  vi.mocked(seccionesApi.list).mockResolvedValue([{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }]);
  vi.mocked(estudiantesApi.list).mockResolvedValue([
    { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/cursos/1/secciones/10']}>
      <Routes>
        <Route path="/cursos/:cursoId/secciones/:seccionId" element={<SectionPage />} />
      </Routes>
    </MemoryRouter>
  );

// La fila y el modal tienen un botón "Eliminar": se acota la búsqueda al panel del modal
const modal = () =>
  within(screen.getByRole('heading', { name: 'Eliminar estudiante' }).closest('.relative') as HTMLElement);

describe('SectionPage — eliminar estudiante', () => {
  it('si estudiantesApi.delete falla, el modal sigue abierto y muestra el detalle del backend', async () => {
    vi.mocked(estudiantesApi.delete).mockRejectedValue({ response: { status: 409, data: { detail: DETALLE_409 } } });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(modal().getByText('¿Eliminar este estudiante?')).toBeTruthy();
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    // El error del backend llega al modal…
    expect(await modal().findByText(DETALLE_409)).toBeTruthy();
    // …el modal no se cerró y la fila sigue en la tabla
    expect(modal().getByRole('button', { name: 'Eliminar' })).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(estudiantesApi.delete).toHaveBeenCalledTimes(1);
    expect(estudiantesApi.delete).toHaveBeenCalledWith(7);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('sin detail del backend, muestra el mensaje por defecto dentro del modal', async () => {
    vi.mocked(estudiantesApi.delete).mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    expect(await modal().findByText('No se pudo eliminar')).toBeTruthy();
  });

  it('si la eliminación tiene éxito, cierra el modal y quita la fila', async () => {
    vi.mocked(estudiantesApi.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Eliminar estudiante' })).toBeNull());
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });
});
