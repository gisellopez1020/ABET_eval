// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';

import { StudentOutcomesPage } from './StudentOutcomesPage';
import { catalogoRaAbetApi } from '../../api/catalogo';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn(), delete: vi.fn() } }));

const DETALLE_409 = "No se puede eliminar '2.1': lo usa el curso 'Ingeniería de Software'";

beforeEach(() => {
  vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([
    { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones de ingeniería',
      programa: 'Ingeniería', codigo_padre: null, peso: null },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('StudentOutcomesPage — eliminar del catálogo', () => {
  it('si catalogoRaAbetApi.delete responde 409, el modal sigue abierto y muestra el detalle del backend', async () => {
    vi.mocked(catalogoRaAbetApi.delete).mockRejectedValue({ response: { status: 409, data: { detail: DETALLE_409 } } });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    render(<StudentOutcomesPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar 2.1' }));
    expect(screen.getByText('¿Eliminar el Resultado de Aprendizaje "2.1" del catálogo?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    // El error del backend llega al modal…
    expect(await screen.findByText(DETALLE_409)).toBeTruthy();
    // …y el modal no se cerró
    expect(screen.getByRole('dialog', { name: 'Eliminar del catálogo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeTruthy();
    // La fila sigue en la tabla
    expect(screen.getByRole('button', { name: 'Eliminar 2.1' })).toBeTruthy();
    expect(catalogoRaAbetApi.delete).toHaveBeenCalledTimes(1);
    expect(catalogoRaAbetApi.delete).toHaveBeenCalledWith('2.1');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('si la eliminación tiene éxito, cierra el modal, quita la fila y muestra el mensaje', async () => {
    vi.mocked(catalogoRaAbetApi.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StudentOutcomesPage />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar 2.1' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('"2.1" eliminado.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Eliminar 2.1' })).toBeNull();
  });
});
