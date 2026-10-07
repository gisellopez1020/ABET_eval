// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

import { CoursesPage } from './CoursesPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { catalogoRaAbetApi } from '../../api/catalogo';
import { Curso } from '../../types';
import { useCourseStore } from '../../store/courseStore';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({
  cursosApi: { list: vi.fn(), archivar: vi.fn(), activar: vi.fn(), create: vi.fn() },
}));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn() } }));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn() } }));

const curso = (activo: boolean): Curso => ({
  id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
  ra_abet: [], rangos_calificacion: [], activo, created_at: '2026-01-01',
});

beforeEach(() => {
  vi.mocked(seccionesApi.list).mockResolvedValue([]);
  vi.mocked(estudiantesApi.list).mockResolvedValue([]);
  vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
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

    // La fila y el modal tienen un botón "Cerrar": el de confirmar se busca dentro del diálogo
    await user.click(await screen.findByRole('button', { name: 'Cerrar' }));
    expect(screen.getByText('¿Deseas cerrar la asignatura "Ingeniería de Software"?')).toBeTruthy();
    const dialog = screen.getByRole('dialog', { name: 'Cerrar asignatura' });
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    // El error llega al modal…
    expect(await screen.findByText('No fue posible cerrar la asignatura.')).toBeTruthy();
    // …y el modal no se cerró
    expect(screen.getByRole('dialog', { name: 'Cerrar asignatura' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeTruthy();
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

describe('CoursesPage — nueva asignatura (CourseFormModal como diálogo)', () => {
  it('atrapa el foco, cierra con Esc (no con el fondo) y devuelve el foco a "Nueva asignatura"', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([curso(true)]);
    const user = userEvent.setup();

    renderPage();
    const abrir = await screen.findByRole('button', { name: /nueva asignatura/i });
    await user.click(abrir);

    const dialog = screen.getByRole('dialog', { name: 'Nueva asignatura' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Nueva asignatura' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('mientras se guarda, Esc no cierra el diálogo', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([curso(true)]);
    vi.mocked(cursosApi.create).mockReturnValue(new Promise(() => {})); // queda pendiente
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /nueva asignatura/i }));
    await user.type(screen.getByPlaceholderText('Ej: Fundamentos de programación'), 'Cálculo');
    await user.type(screen.getByPlaceholderText('Ej: FIS-101'), 'MAT-1');
    await user.type(screen.getByPlaceholderText('Ej: 2026-1'), '2026-2');
    await user.click(screen.getByRole('button', { name: 'Crear asignatura' }));
    expect(cursosApi.create).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Nueva asignatura' })).toBeTruthy();
  });
});

// ── Línea base antes de dividir CoursesPage ──────────────────────────────────

const asignatura = (id: number, nombre: string, codigo: string, activo = true): Curso => ({
  ...curso(activo), id, nombre, codigo,
});
const CURSOS = [
  asignatura(1, 'Ingeniería de Software', 'IS1'),
  asignatura(2, 'Bases de Datos', 'BD1'),
  asignatura(3, 'Cálculo Integral', 'MAT2', false),
];

// Muestra la ruta actual: para comprobar navegaciones y que ?nueva=1 se limpie
function Ubicacion() {
  const location = useLocation();
  return <p data-testid="ubicacion">{location.pathname + location.search}</p>;
}

const renderConRutas = (inicial = '/cursos') =>
  render(
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/cursos" element={<><CoursesPage /><Ubicacion /></>} />
        <Route path="/cursos/:id" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>
  );

const fila = (nombre: string) => screen.getByRole('row', { name: new RegExp(nombre) });
// Nombres de las filas visibles, en orden (la columna Nombre es la segunda)
const nombresVisibles = () =>
  screen.queryAllByRole('row').slice(1).map((tr) => tr.querySelectorAll('td')[1]?.querySelector('p')?.textContent);

describe('CoursesPage — listado, búsqueda y filtro', () => {
  beforeEach(() => {
    useCourseStore.setState({ selectedCourseId: 2 });
    vi.mocked(cursosApi.list).mockResolvedValue(CURSOS);
  });

  it('el encabezado cuenta las asignaturas en singular o plural', async () => {
    renderConRutas();
    expect(await screen.findByText('3 asignaturas registradas')).toBeTruthy();

    cleanup();
    vi.mocked(cursosApi.list).mockResolvedValue([CURSOS[0]]);
    renderConRutas();
    expect(await screen.findByText('1 asignatura registrada')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre o código sin distinguir mayúsculas', async () => {
    const user = userEvent.setup();
    renderConRutas();
    await screen.findByText('Bases de Datos');
    const buscador = screen.getByPlaceholderText('Buscar por código o nombre de asignatura...');

    await user.type(buscador, 'BASES');
    expect(nombresVisibles()).toEqual(['Bases de Datos']);

    await user.clear(buscador);
    await user.type(buscador, 'mat2');
    expect(nombresVisibles()).toEqual(['Cálculo Integral']);

    await user.clear(buscador);
    await user.type(buscador, 'zzz');
    expect(screen.getByText('No se encontraron asignaturas')).toBeTruthy();
    expect(screen.getByText('Intenta cambiar la búsqueda o el filtro.')).toBeTruthy();
  });

  it('"Filtrar" muestra el filtro de estado: Activos, Cerrados y Todos', async () => {
    const user = userEvent.setup();
    renderConRutas();
    await screen.findByText('Bases de Datos');
    expect(screen.queryByRole('button', { name: 'Activos' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /filtrar/i }));
    await user.click(screen.getByRole('button', { name: 'Cerrados' }));
    expect(nombresVisibles()).toEqual(['Cálculo Integral']);

    await user.click(screen.getByRole('button', { name: 'Activos' }));
    expect(nombresVisibles()).toEqual(['Ingeniería de Software', 'Bases de Datos']);

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(nombresVisibles()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /filtrar/i }));
    expect(screen.queryByRole('button', { name: 'Activos' })).toBeNull();
  });

  it('marca como "Seleccionada" solo la asignatura activa del Dashboard', async () => {
    renderConRutas();
    await screen.findByText('Bases de Datos');

    expect(within(fila('Bases de Datos')).getByTitle('Asignatura activa en el Dashboard').textContent).toBe('Seleccionada');
    expect(screen.getAllByText('Seleccionada')).toHaveLength(1);
  });

  it('las columnas Grupo y Estudiantes suman las secciones del curso; sin secciones muestran "—" y 0', async () => {
    vi.mocked(seccionesApi.list).mockImplementation(async (cursoId) => {
      if (cursoId === 2) throw new Error('falla');
      return cursoId === 1
        ? [{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }, { id: 11, nombre: 'Grupo B', curso_id: 1, activo: true }]
        : [];
    });
    vi.mocked(estudiantesApi.list).mockImplementation(async (seccionId) =>
      Array.from({ length: seccionId === 10 ? 3 : 2 }, (_, i) =>
        ({ id: seccionId * 100 + i, nombre_completo: `E${i}`, codigo_estudiante: `${i}`, seccion_id: seccionId }))
    );
    renderConRutas();
    await screen.findByText('Grupo A, Grupo B');

    const celdas = (nombre: string) => Array.from(fila(nombre).querySelectorAll('td')).map((td) => td.textContent);
    expect(celdas('Ingeniería de Software').slice(2, 6)).toEqual(['2026-2', 'Grupo A, Grupo B', '5', 'Activo']);
    // Si fallan las secciones de un curso, su fila sigue: sin grupos ni estudiantes
    expect(celdas('Bases de Datos').slice(3, 5)).toEqual(['—', '0']);
    expect(celdas('Cálculo Integral').slice(3, 6)).toEqual(['—', '0', 'Cerrado']);
  });
});

describe('CoursesPage — acciones y navegación', () => {
  beforeEach(() => {
    useCourseStore.setState({ selectedCourseId: null });
    vi.mocked(cursosApi.list).mockResolvedValue(CURSOS);
  });

  it('"Editar" navega a la asignatura sin cambiar la activa del Dashboard', async () => {
    const user = userEvent.setup();
    renderConRutas();
    await screen.findByText('Bases de Datos');

    await user.click(within(fila('Bases de Datos')).getByRole('button', { name: 'Editar' }));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/cursos/2');
    expect(useCourseStore.getState().selectedCourseId).toBeNull();
  });

  it('?nueva=1 abre el modal de nueva asignatura y limpia el parámetro', async () => {
    renderConRutas('/cursos?nueva=1');

    expect(await screen.findByRole('dialog', { name: 'Nueva asignatura' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/cursos'));
  });

  it('al crear, la asignatura aparece primero, queda activa en el Dashboard y se limpian búsqueda y filtro', async () => {
    vi.mocked(cursosApi.create).mockResolvedValue(asignatura(9, 'Física I', 'FIS-1'));
    const user = userEvent.setup();
    renderConRutas();
    await screen.findByText('Bases de Datos');

    // Búsqueda y filtro activos antes de crear
    await user.type(screen.getByPlaceholderText('Buscar por código o nombre de asignatura...'), 'calculo');
    await user.click(screen.getByRole('button', { name: /filtrar/i }));
    await user.click(screen.getByRole('button', { name: 'Cerrados' }));

    await user.click(screen.getByRole('button', { name: /nueva asignatura/i }));
    await user.type(screen.getByPlaceholderText('Ej: Fundamentos de programación'), 'Física I');
    await user.type(screen.getByPlaceholderText('Ej: FIS-101'), 'FIS-1');
    await user.type(screen.getByPlaceholderText('Ej: 2026-1'), '2026-2');
    await user.click(screen.getByRole('button', { name: 'Crear asignatura' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(nombresVisibles()).toEqual(['Física I', 'Ingeniería de Software', 'Bases de Datos', 'Cálculo Integral']);
    expect((screen.getByPlaceholderText('Buscar por código o nombre de asignatura...') as HTMLInputElement).value).toBe('');
    expect(useCourseStore.getState().selectedCourseId).toBe(9);
    expect(screen.getByText('4 asignaturas registradas')).toBeTruthy();
    // No recarga la lista: la nueva se agrega localmente
    expect(cursosApi.list).toHaveBeenCalledTimes(1);
  });

  it('"Ver" abre el detalle con las secciones de esa asignatura', async () => {
    vi.mocked(seccionesApi.list).mockImplementation(async (cursoId) =>
      cursoId === 1 ? [{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }] : []
    );
    const user = userEvent.setup();
    renderConRutas();
    await screen.findByText('Grupo A');

    await user.click(within(fila('Ingeniería de Software')).getByRole('button', { name: 'Ver' }));

    const dialog = screen.getByRole('dialog', { name: 'Ingeniería de Software' });
    expect(within(dialog).getByText('Grupo A')).toBeTruthy();
  });
});
