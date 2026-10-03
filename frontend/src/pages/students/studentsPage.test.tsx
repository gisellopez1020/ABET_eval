// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';

import StudentsPage from './studentsPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn(), delete: vi.fn() } }));

const ANA = { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 };
const CONFIRMACION =
  '¿Deseas eliminar a "Ana Pérez"?\n\n' +
  'También se eliminarán sus calificaciones individuales y se retirará de los equipos a los que pertenece. Esta acción no se puede deshacer.';

beforeEach(() => {
  vi.mocked(cursosApi.list).mockResolvedValue([
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  ]);
  vi.mocked(seccionesApi.list).mockResolvedValue([{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }]);
  vi.mocked(estudiantesApi.list).mockResolvedValue([ANA]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// La fila y el modal tienen un botón "Eliminar": se acota la búsqueda al diálogo
const modal = () => within(screen.getByRole('dialog', { name: 'Eliminar estudiante' }));

describe('StudentsPage — eliminar estudiante', () => {
  it('si estudiantesApi.delete falla, el modal sigue abierto y muestra el mensaje de error', async () => {
    vi.mocked(estudiantesApi.delete).mockRejectedValue({ response: { status: 500 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    // Mismo texto que el confirm() anterior, salto de línea incluido
    expect(modal().getByText(/¿Deseas eliminar a "Ana Pérez"\?/).textContent).toBe(CONFIRMACION);
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    // El error llega al modal…
    expect(await modal().findByText('No fue posible eliminar al estudiante.')).toBeTruthy();
    // …el modal no se cerró y la fila sigue en la tabla
    expect(modal().getByRole('button', { name: 'Eliminar' })).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(estudiantesApi.delete).toHaveBeenCalledTimes(1);
    expect(estudiantesApi.delete).toHaveBeenCalledWith(7);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('si la eliminación tiene éxito, recarga la lista y cierra el modal', async () => {
    vi.mocked(estudiantesApi.list).mockResolvedValueOnce([ANA]).mockResolvedValue([]);
    vi.mocked(estudiantesApi.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Ana Pérez')).toBeNull();
    expect(estudiantesApi.list).toHaveBeenCalledTimes(2);
  });
});
