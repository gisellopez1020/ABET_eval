// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';

import StudentsPage from './studentsPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { descargarBlob } from '../../utils/descarga';
import { useCourseStore } from '../../store/courseStore';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({
  estudiantesApi: { list: vi.fn(), delete: vi.fn(), update: vi.fn(), create: vi.fn(), exportarExcel: vi.fn() },
}));
vi.mock('../../utils/descarga', () => ({ descargarBlob: vi.fn() }));

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

describe('StudentsPage — crear/editar estudiante como diálogo', () => {
  it.each([
    ['Nuevo estudiante', 'Nuevo estudiante'],
    ['Editar', 'Editar estudiante'],
  ])('al abrir con "%s": atrapa el foco, cierra con Esc (no con el fondo) y devuelve el foco', async (boton, titulo) => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('Ana Pérez');

    const abrir = screen.getByRole('button', { name: boton });
    await user.click(abrir);

    const dialog = screen.getByRole('dialog', { name: titulo });
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: titulo })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('mientras se guarda, Esc no cierra el diálogo', async () => {
    vi.mocked(estudiantesApi.update).mockReturnValue(new Promise(() => {})); // queda pendiente
    const user = userEvent.setup();
    render(<StudentsPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(estudiantesApi.update).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Editar estudiante' })).toBeTruthy();
  });
});

// ── Línea base antes de dividir studentsPage ─────────────────────────────────

const CURSO = (id: number, nombre: string, periodo = '2026-2') => ({
  id, nombre, codigo: `C${id}`, periodo, docente_email: 'd@uao.edu.co',
  ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01',
});
const est = (id: number, nombre: string, seccion_id: number, extra: object = {}) =>
  ({ id, nombre_completo: nombre, codigo_estudiante: `22100${id}`, seccion_id, ...extra });

// Curso 1: Grupo A (6 estudiantes) y Grupo B (1). Curso 2: otro "Grupo A" (1).
const ESTUDIANTES: Record<number, ReturnType<typeof est>[]> = {
  10: [1, 2, 3, 4, 5, 6].map((i) => est(i, `Alumno ${i}`, 10)),
  11: [est(20, 'Beatriz Gómez', 11, { email: 'bea@uao.edu.co', promedio: 4.25 })],
  30: [est(30, 'Carlos Ruiz', 30)],
};

const sel = (nombre: string) => screen.getByRole('combobox', { name: nombre }) as HTMLSelectElement;
const nombresEnTabla = () =>
  screen.queryAllByRole('row').slice(1).map((tr) => tr.querySelector('td')?.textContent).filter(Boolean);

describe('StudentsPage — carga, filtros y paginación', () => {
  beforeEach(() => {
    useCourseStore.setState({ selectedCourseId: null });
    vi.mocked(cursosApi.list).mockResolvedValue([CURSO(1, 'Ingeniería de Software'), CURSO(2, 'Bases de Datos', '2026-1')]);
    vi.mocked(seccionesApi.list).mockImplementation(async (cursoId) =>
      cursoId === 1
        ? [{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }, { id: 11, nombre: 'Grupo B', curso_id: 1, activo: true }]
        : [{ id: 30, nombre: 'Grupo A', curso_id: 2, activo: true }]
    );
    vi.mocked(estudiantesApi.list).mockImplementation(async (seccionId) => ESTUDIANTES[seccionId] ?? []);
  });

  it('sin asignatura activa filtra por la primera y cuenta los estudiantes filtrados', async () => {
    render(<StudentsPage />);

    expect(await screen.findByText('7 estudiantes registrados')).toBeTruthy();
    expect(sel('Filtrar por asignatura').value).toBe('1');
    expect(screen.getByText('Página 1 de 2')).toBeTruthy();
  });

  it('con asignatura activa en el Dashboard, empieza filtrando por ella', async () => {
    useCourseStore.setState({ selectedCourseId: 2 });
    render(<StudentsPage />);

    expect(await screen.findByText('1 estudiante registrado')).toBeTruthy();
    expect(sel('Filtrar por asignatura').value).toBe('2');
    expect(nombresEnTabla()).toEqual(['Carlos Ruiz']);
  });

  it('pagina de a 5; Anterior/Siguiente se deshabilitan en los extremos', async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('Página 1 de 2');

    expect(nombresEnTabla()).toHaveLength(5);
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
    expect(nombresEnTabla()).toEqual(['Alumno 6', 'Beatriz Gómez']);
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('la búsqueda por nombre o código vuelve a la página 1', async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('Página 1 de 2');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await user.type(screen.getByPlaceholderText('Buscar por código o nombre del estudiante...'), 'BEATRIZ');
    expect(nombresEnTabla()).toEqual(['Beatriz Gómez']);
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('Buscar por código o nombre del estudiante...'));
    await user.type(screen.getByPlaceholderText('Buscar por código o nombre del estudiante...'), '221003');
    expect(nombresEnTabla()).toEqual(['Alumno 3']);
  });

  it('las secciones del filtro son las de la asignatura; cambiar de asignatura vuelve a "Todas"', async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('7 estudiantes registrados');

    expect(within(sel('Filtrar por sección')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Sección: Todas', 'Grupo A', 'Grupo B']);
    await user.selectOptions(sel('Filtrar por sección'), '11');
    expect(nombresEnTabla()).toEqual(['Beatriz Gómez']);

    await user.selectOptions(sel('Filtrar por asignatura'), '2');
    expect(sel('Filtrar por sección').value).toBe('');
    expect(nombresEnTabla()).toEqual(['Carlos Ruiz']);
  });

  it('"Filtrar" muestra el filtro de estado; "Inactivos" deja la tabla vacía', async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('7 estudiantes registrados');

    await user.click(screen.getByRole('button', { name: /filtrar/i }));
    await user.click(screen.getByRole('button', { name: 'Inactivos' }));
    expect(screen.getByText('No se encontraron estudiantes.')).toBeTruthy();
    expect(screen.getByText('0 estudiantes registrados')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Activos' }));
    expect(screen.getByText('7 estudiantes registrados')).toBeTruthy();
  });

  it('las columnas muestran correo, promedio con un decimal y el grupo con su asignatura', async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('7 estudiantes registrados');
    await user.selectOptions(sel('Filtrar por sección'), '11');

    const celdas = Array.from(screen.getByRole('row', { name: /beatriz/i }).querySelectorAll('td'));
    expect(celdas.slice(0, 7).map((td) => td.textContent))
      .toEqual(['Beatriz Gómez', '2210020', 'bea@uao.edu.co', '2026-2', '4.3', 'Grupo B', 'activo']);
    expect(celdas[5].querySelector('span')?.getAttribute('title')).toBe('Ingeniería de Software');

    await user.selectOptions(sel('Filtrar por sección'), '10');
    const sinDatos = Array.from(screen.getByRole('row', { name: /alumno 1/i }).querySelectorAll('td'));
    expect(sinDatos[2].querySelector('span')?.getAttribute('title')).toBe('Sin correo registrado');
    expect(sinDatos[4].querySelector('span')?.getAttribute('title')).toBe('Sin actividades calificadas');
    expect(sinDatos[4].textContent).toBe('—');
  });

  it('"Exportar Excel" usa los filtros de asignatura y sección', async () => {
    const blob = new Blob(['x']);
    vi.mocked(estudiantesApi.exportarExcel).mockResolvedValue({ blob, nombre: 'estudiantes.xlsx' });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('7 estudiantes registrados');
    await user.selectOptions(sel('Filtrar por sección'), '11');

    await user.click(screen.getByRole('button', { name: /exportar excel/i }));

    expect(estudiantesApi.exportarExcel).toHaveBeenCalledWith({ curso_id: 1, seccion_id: 11 });
    await waitFor(() => expect(descargarBlob).toHaveBeenCalledWith(blob, 'estudiantes.xlsx'));
  });

  it('si exportar falla, muestra el error', async () => {
    vi.mocked(estudiantesApi.exportarExcel).mockRejectedValue({ response: { data: { detail: 'Sin datos' } } });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('7 estudiantes registrados');

    await user.click(screen.getByRole('button', { name: /exportar excel/i }));

    expect(await screen.findByText('Sin datos')).toBeTruthy();
  });
});

describe('StudentsPage — crear y editar', () => {
  beforeEach(() => {
    useCourseStore.setState({ selectedCourseId: null });
  });

  const dialogo = (titulo: string) => within(screen.getByRole('dialog', { name: titulo }));

  it('valida en orden nombre, código y sección', async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo estudiante' }));
    const d = dialogo('Nuevo estudiante');

    await user.click(d.getByRole('button', { name: 'Crear estudiante' }));
    expect(d.getByText('El nombre es obligatorio')).toBeTruthy();
    await user.type(d.getByPlaceholderText('Ej: Ana María López'), 'Carlos');
    await user.click(d.getByRole('button', { name: 'Crear estudiante' }));
    expect(d.getByText('El código es obligatorio')).toBeTruthy();
    await user.type(d.getByPlaceholderText('Ej: 20241001'), '1');
    await user.click(d.getByRole('button', { name: 'Crear estudiante' }));
    expect(d.getByText('Debes seleccionar una sección')).toBeTruthy();
    expect(estudiantesApi.create).not.toHaveBeenCalled();
  });

  it('la sección por defecto es la del filtro; crear recarga la lista y cierra', async () => {
    vi.mocked(estudiantesApi.create).mockResolvedValue({ ...est(9, 'CARLOS RUIZ', 10), email: null });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await screen.findByText('Ana Pérez');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por sección' }), '10');

    await user.click(screen.getByRole('button', { name: 'Nuevo estudiante' }));
    const d = dialogo('Nuevo estudiante');
    expect((d.getByRole('combobox') as HTMLSelectElement).value).toBe('10');
    expect(d.getByRole('option', { name: 'Ingeniería de Software · Grupo A' })).toBeTruthy();
    await user.type(d.getByPlaceholderText('Ej: Ana María López'), ' carlos ruiz ');
    await user.type(d.getByPlaceholderText('Ej: 20241001'), '2210009');
    await user.click(d.getByRole('button', { name: 'Crear estudiante' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(estudiantesApi.create).toHaveBeenCalledWith(10, {
      nombre_completo: 'CARLOS RUIZ', codigo_estudiante: '2210009', email: null,
    });
    expect(estudiantesApi.list).toHaveBeenCalledTimes(2);
  });

  it('crear con aviso deja el modal abierto con los campos vacíos', async () => {
    vi.mocked(estudiantesApi.create).mockResolvedValue({ ...est(9, 'CARLOS', 10), aviso: 'El correo no es válido' });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo estudiante' }));
    const d = dialogo('Nuevo estudiante');
    await user.type(d.getByPlaceholderText('Ej: Ana María López'), 'Carlos');
    await user.type(d.getByPlaceholderText('Ej: 20241001'), '9');
    await user.selectOptions(d.getByRole('combobox'), '10');
    await user.click(d.getByRole('button', { name: 'Crear estudiante' }));

    expect(await d.findByText('Estudiante creado. El correo no es válido.')).toBeTruthy();
    expect((d.getByPlaceholderText('Ej: Ana María López') as HTMLInputElement).value).toBe('');
  });

  it('si crear falla, muestra el detalle del backend', async () => {
    vi.mocked(estudiantesApi.create).mockRejectedValue({ response: { data: { detail: 'Código repetido' } } });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo estudiante' }));
    const d = dialogo('Nuevo estudiante');
    await user.type(d.getByPlaceholderText('Ej: Ana María López'), 'Carlos');
    await user.type(d.getByPlaceholderText('Ej: 20241001'), '9');
    await user.selectOptions(d.getByRole('combobox'), '10');
    await user.click(d.getByRole('button', { name: 'Crear estudiante' }));

    expect(await d.findByText('Código repetido')).toBeTruthy();
  });

  it('editar precarga los datos con la sección bloqueada, guarda y cierra', async () => {
    vi.mocked(estudiantesApi.update).mockResolvedValue({ ...ANA, nombre_completo: 'ANA PÉREZ GÓMEZ', email: null });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const d = dialogo('Editar estudiante');

    const nombre = d.getByPlaceholderText('Ej: Ana María López') as HTMLInputElement;
    expect(nombre.value).toBe('Ana Pérez');
    const seccion = d.getByRole('combobox') as HTMLSelectElement;
    expect(seccion.value).toBe('10');
    expect(seccion.disabled).toBe(true);
    expect(seccion.getAttribute('title')).toBe('La sección no se puede cambiar al editar');

    await user.clear(nombre);
    await user.type(nombre, 'ana pérez gómez');
    await user.click(d.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(estudiantesApi.update).toHaveBeenCalledWith(7, {
      nombre_completo: 'ANA PÉREZ GÓMEZ', codigo_estudiante: '2210001', email: null,
    });

    // Cerrada la edición, "Nuevo estudiante" se abre vacío
    await user.click(screen.getByRole('button', { name: 'Nuevo estudiante' }));
    expect((dialogo('Nuevo estudiante').getByPlaceholderText('Ej: Ana María López') as HTMLInputElement).value).toBe('');
  });

  it('editar con aviso muestra el correo real y el botón pasa a "Cerrar"', async () => {
    vi.mocked(estudiantesApi.update).mockResolvedValue({ ...ANA, email: null, aviso: 'Se conservó el correo anterior' });
    const user = userEvent.setup();
    render(<StudentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const d = dialogo('Editar estudiante');
    await user.type(d.getByPlaceholderText('Ej: ana.lopez@uao.edu.co'), 'malo@');
    await user.click(d.getByRole('button', { name: 'Guardar cambios' }));

    expect(await d.findByText('Cambios guardados. Se conservó el correo anterior.')).toBeTruthy();
    expect((d.getByPlaceholderText('Ej: ana.lopez@uao.edu.co') as HTMLInputElement).value).toBe('');
    expect(d.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });
});
