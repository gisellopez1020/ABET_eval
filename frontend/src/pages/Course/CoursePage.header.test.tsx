// @vitest-environment jsdom
/**
 * Regresión: las páginas dibujaban un segundo <Header> (sin userName) dentro de
 * AppLayout y, como es fixed, tapaba el del layout con "Usuario". Aquí AppLayout y
 * Header son los reales (CoursePage.test.tsx los reemplaza para todo su archivo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CoursePage } from './CoursePage';
import { cursosApi } from '../../api/cursos';
import { useAuthStore } from '../../store/authStore';
import { Curso } from '../../types';
import { RANGOS_CALIFICACION_DEFAULT } from '../../utils/rangos';

vi.mock('../../components/Layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../api/auth', () => ({ authApi: { getMe: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../../api/cursos', () => ({ cursosApi: { get: vi.fn(), update: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn().mockResolvedValue([]) } }));

const CURSO: Curso = {
  id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'ana@uao.edu.co',
  ra_abet: [], rangos_calificacion: RANGOS_CALIFICACION_DEFAULT, activo: true, created_at: '2026-01-01',
};

beforeEach(() => {
  useAuthStore.setState({ user: { email: 'ana@uao.edu.co', nombre: 'Ana Docente' }, csrfToken: 'csrf' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/cursos/1']}>
      <Routes>
        <Route path="/cursos/:cursoId" element={<CoursePage />} />
      </Routes>
    </MemoryRouter>
  );

const migas = () => screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent;

describe('CoursePage — encabezado', () => {
  it('con el curso cargado: nombre del docente, sin "Usuario" y un solo encabezado', async () => {
    vi.mocked(cursosApi.get).mockResolvedValue(CURSO);
    const { container } = renderPage();
    await screen.findByRole('heading', { name: 'Ingeniería de Software' });

    expect(screen.getByText('Ana Docente')).toBeTruthy();
    expect(screen.queryByText('Usuario')).toBeNull();
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(migas()).toBe('Mis cursos/Ingeniería de Software');
  });

  it('mientras carga: nombre del docente, sin "Usuario" y un solo encabezado', () => {
    vi.mocked(cursosApi.get).mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    expect(screen.getByText('Ana Docente')).toBeTruthy();
    expect(screen.queryByText('Usuario')).toBeNull();
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(migas()).toBe('Mis cursos/…');
  });
});
