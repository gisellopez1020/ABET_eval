// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';

import { ProjectsPage } from './ProjectsPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi } from '../../api/actividades';
import { equiposApi } from '../../api/equipos';
import { estudiantesApi } from '../../api/estudiantes';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('../../api/equipos', () => ({ equiposApi: { list: vi.fn(), create: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn() } }));

const DETALLE_400 = "El estudiante Ana Pérez ya está en el equipo 'Equipo 1' de esta actividad";

beforeEach(() => {
  vi.mocked(cursosApi.list).mockResolvedValue([
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  ]);
  vi.mocked(seccionesApi.list).mockResolvedValue([{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }]);
  vi.mocked(actividadesApi.list).mockResolvedValue([
    { id: 100, nombre: 'Proyecto final', tipo: 'grupal', peso_nota_final: 30, curso_id: 1,
      created_at: '2026-01-01', total_peso_criterios: '100.00' },
  ]);
  vi.mocked(equiposApi.list).mockResolvedValue([]);
  vi.mocked(estudiantesApi.list).mockResolvedValue([
    { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProjectsPage — crear proyecto', () => {
  it('si equiposApi.create responde 400, el modal sigue abierto y muestra el detalle del backend', async () => {
    vi.mocked(equiposApi.create).mockRejectedValue({ response: { status: 400, data: { detail: DETALLE_400 } } });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /nuevo proyecto/i }));
    await user.type(screen.getByPlaceholderText('Ej: Sistema de inventarios'), 'Equipo Alfa');
    await user.click(await screen.findByRole('button', { name: /ana pérez/i }));
    await user.click(screen.getByRole('button', { name: /crear proyecto/i }));

    // El error del backend llega al modal…
    expect(await screen.findByText(DETALLE_400)).toBeTruthy();
    // …y el modal no se cerró ni limpió el formulario
    expect(screen.getByRole('heading', { name: 'Nuevo proyecto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /crear proyecto/i })).toBeTruthy();
    expect((screen.getByPlaceholderText('Ej: Sistema de inventarios') as HTMLInputElement).value).toBe('Equipo Alfa');
    expect(equiposApi.create).toHaveBeenCalledTimes(1);
    expect(equiposApi.create).toHaveBeenCalledWith(100, 10, [{ nombre: 'Equipo Alfa', estudiante_ids: [7] }]);
  });
});
