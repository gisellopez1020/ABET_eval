// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { useAuthStore } from '../../store/authStore';
import { useLayoutStore } from '../../store/layoutStore';

// Solo interesa el Header real: la barra lateral y /auth/me quedan fuera
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../api/auth', () => ({ authApi: { getMe: vi.fn().mockResolvedValue(undefined) } }));

const CRUMBS = [{ label: 'Mis cursos', to: '/dashboard' }, { label: 'Redes de datos' }];

beforeEach(() => {
  useAuthStore.setState({ user: { email: 'ana@uao.edu.co', nombre: 'Ana Docente' }, csrfToken: 'csrf' });
  useLayoutStore.setState({ sidebarCollapsed: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderLayout = () =>
  render(
    <MemoryRouter>
      <AppLayout crumbs={CRUMBS}>
        <p>contenido</p>
      </AppLayout>
    </MemoryRouter>
  );

describe('AppLayout — encabezado', () => {
  it('muestra el nombre del docente del store aunque reciba crumbs', () => {
    renderLayout();
    expect(screen.getByText('Ana Docente')).toBeTruthy();
    expect(screen.queryByText('Usuario')).toBeNull();
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it('pasa las migas al Header: la que tiene destino es un enlace', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toBe('Mis cursos/Redes de datos');
    expect(screen.getByRole('link', { name: 'Mis cursos' }).getAttribute('href')).toBe('/dashboard');
    expect(screen.queryByRole('link', { name: 'Redes de datos' })).toBeNull();
  });

  it('dibuja un solo encabezado', () => {
    const { container } = renderLayout();
    expect(container.querySelectorAll('header')).toHaveLength(1);
  });

  it('el encabezado se desplaza con la barra lateral colapsada', () => {
    useLayoutStore.setState({ sidebarCollapsed: true });
    const { container } = renderLayout();
    const header = container.querySelector('header')!;
    expect(header.className).toContain('left-20');
    expect(header.className).not.toContain('left-60');
  });
});
