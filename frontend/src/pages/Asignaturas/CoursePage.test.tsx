// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

import { CoursePage } from './CoursePage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi } from '../../api/actividades';
import { estudiantesApi } from '../../api/estudiantes';
import { catalogoRaAbetApi } from '../../api/catalogo';
import { Actividad, Curso } from '../../types';
import { RANGOS_CALIFICACION_DEFAULT } from '../../utils/rangos';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { get: vi.fn(), update: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn(), create: vi.fn() } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn(), create: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({ estudiantesApi: { list: vi.fn() } }));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn() } }));

const CURSO: Curso = {
  id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
  programa: 'Ingeniería Informática',
  ra_abet: [], rangos_calificacion: RANGOS_CALIFICACION_DEFAULT, activo: true, created_at: '2026-01-01',
};
const actividad = (id: number, nombre: string, tipo: 'grupal' | 'individual', total: string): Actividad => ({
  id, nombre, tipo, peso_nota_final: 30, curso_id: 1, created_at: '2026-01-01', total_peso_criterios: total, aplica_todas_secciones: true, secciones_ids: [],
});

beforeEach(() => {
  vi.mocked(cursosApi.get).mockResolvedValue(CURSO);
  vi.mocked(seccionesApi.list).mockResolvedValue([
    { id: 10, nombre: 'Grupo A', curso_id: 1, activo: true },
    { id: 11, nombre: 'Grupo B', curso_id: 1, activo: true },
  ]);
  vi.mocked(actividadesApi.list).mockResolvedValue([
    actividad(100, 'Proyecto final', 'grupal', '100.00'),
    actividad(101, 'Parcial', 'individual', '60.00'),
  ]);
  vi.mocked(estudiantesApi.list).mockImplementation(async (seccionId) =>
    Array.from({ length: seccionId === 10 ? 2 : 1 }, (_, i) =>
      ({ id: seccionId * 10 + i, nombre_completo: `E${i}`, codigo_estudiante: `${i}`, seccion_id: seccionId }))
  );
  vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Ubicacion() {
  const location = useLocation();
  return <p data-testid="ubicacion">{location.pathname}</p>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/cursos/1']}>
      <Routes>
        <Route path="/cursos/:cursoId" element={<CoursePage />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>
  );

// Fila (role=button) de una sección o actividad, por su nombre
const fila = (nombre: string) => screen.getByText(nombre).closest('[role="button"]') as HTMLElement;
const cargada = () => screen.findByRole('heading', { name: 'Ingeniería de Software' });

describe('CoursePage — carga', () => {
  it('muestra el curso, sus secciones con el conteo de estudiantes y la primera seleccionada', async () => {
    renderPage();
    await cargada();

    expect(screen.getByText('IS1 · 2026-2')).toBeTruthy();
    expect(within(fila('Grupo A')).getByText('2 estudiantes')).toBeTruthy();
    expect(within(fila('Grupo B')).getByText('1 estudiante')).toBeTruthy();
    expect(fila('Grupo A').className).toContain('bg-red-100');
    expect(fila('Grupo B').className).not.toContain('bg-red-100');
  });

  it('muestra las actividades con peso, tipo y si les falta rúbrica', async () => {
    renderPage();
    await cargada();

    const proyecto = fila('Proyecto final');
    expect(within(proyecto).getByText('Peso: 30%')).toBeTruthy();
    expect(within(proyecto).getByText('Grupal')).toBeTruthy();
    expect(within(proyecto).queryByText('Sin rúbrica')).toBeNull();
    const parcial = fila('Parcial');
    expect(within(parcial).getByText('Individual')).toBeTruthy();
    expect(within(parcial).getByText('Sin rúbrica')).toBeTruthy();
  });

  it('sin secciones ni actividades lo dice y no ofrece "Calificar"', async () => {
    vi.mocked(seccionesApi.list).mockResolvedValue([]);
    vi.mocked(actividadesApi.list).mockResolvedValue([actividad(100, 'Proyecto final', 'grupal', '100.00')]);
    renderPage();
    await cargada();

    expect(screen.getByText('No hay secciones. Crea la primera.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Calificar' })).toBeNull();

    cleanup();
    vi.mocked(actividadesApi.list).mockResolvedValue([]);
    renderPage();
    await cargada();
    expect(screen.getByText('No hay actividades. Crea la primera.')).toBeTruthy();
  });

  it('si falla la carga no muestra nada', async () => {
    vi.mocked(cursosApi.get).mockRejectedValue(new Error('x'));
    const { container } = renderPage();

    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});

describe('CoursePage — navegación', () => {
  it('"Calificar" usa la sección seleccionada y se deshabilita sin rúbrica completa', async () => {
    const user = userEvent.setup();
    renderPage();
    await cargada();

    const calificarParcial = within(fila('Parcial')).getByRole('button', { name: 'Calificar' }) as HTMLButtonElement;
    expect(calificarParcial.disabled).toBe(true);
    expect(calificarParcial.parentElement?.getAttribute('title')).toBe('Define la rúbrica (100%) antes de calificar');

    // Elegir otra sección (con teclado) cambia la sección de "Calificar"
    fila('Grupo B').focus();
    await user.keyboard('{Enter}');
    expect(fila('Grupo B').className).toContain('bg-red-100');
    await user.click(within(fila('Proyecto final')).getByRole('button', { name: 'Calificar' }));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/actividades/100/calificar/11');
  });

  it('"Calificar" se deshabilita si la actividad no aplica a la sección seleccionada', async () => {
    vi.mocked(actividadesApi.list).mockResolvedValue([
      { ...actividad(100, 'Proyecto final', 'grupal', '100.00'), aplica_todas_secciones: false, secciones_ids: [11] },
      { ...actividad(101, 'Sin secciones', 'grupal', '100.00'), aplica_todas_secciones: false, secciones_ids: [] },
    ]);
    const user = userEvent.setup();
    renderPage();
    await cargada();

    expect(within(fila('Proyecto final')).getByText('Secciones: Grupo B')).toBeTruthy();
    expect(within(fila('Sin secciones')).getByText('Sin secciones asignadas')).toBeTruthy();
    // Grupo A (la primera) está seleccionada y no es del alcance
    const calificar = within(fila('Proyecto final')).getByRole('button', { name: 'Calificar' }) as HTMLButtonElement;
    expect(calificar.disabled).toBe(true);
    expect(calificar.parentElement?.getAttribute('title')).toBe('Esta actividad no aplica a la sección seleccionada');

    await user.click(fila('Grupo B'));
    const enB = within(fila('Proyecto final')).getByRole('button', { name: 'Calificar' }) as HTMLButtonElement;
    expect(enB.disabled).toBe(false);
    await user.click(enB);
    expect(screen.getByTestId('ubicacion').textContent).toBe('/actividades/100/calificar/11');
  });

  it('las actividades de todas las secciones no muestran etiqueta de secciones', async () => {
    renderPage();
    await cargada();
    expect(screen.queryByText(/^Secciones:/)).toBeNull();
  });

  it('clic en una actividad abre su rúbrica', async () => {
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByText('Parcial'));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/actividades/101');
  });

  it('"Gestionar" abre la sección sin seleccionarla', async () => {
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(within(fila('Grupo B')).getByRole('button', { name: 'Gestionar' }));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/cursos/1/secciones/11');
  });

  it('"Ver reportes ABET" abre los reportes del curso', async () => {
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: 'Ver reportes ABET' }));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/cursos/1/reportes');
  });
});

describe('CoursePage — crear sección y actividad', () => {
  it('nueva sección: la agrega con 0 estudiantes y la deja seleccionada (Enter también crea)', async () => {
    vi.mocked(seccionesApi.create).mockResolvedValue({ id: 12, nombre: 'Grupo C', curso_id: 1, activo: true });
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva sección' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva sección' }));
    // Sin nombre no hace nada
    await user.click(d.getByRole('button', { name: 'Crear' }));
    expect(seccionesApi.create).not.toHaveBeenCalled();

    await user.type(d.getByPlaceholderText('Ej: Grupo A'), ' Grupo C {Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(seccionesApi.create).toHaveBeenCalledWith(1, { nombre: 'Grupo C' });
    expect(within(fila('Grupo C')).getByText('0 estudiantes')).toBeTruthy();
    expect(fila('Grupo C').className).toContain('bg-red-100');
  });

  it('si crear la sección falla, el error queda en el modal y al reabrir se limpia', async () => {
    vi.mocked(seccionesApi.create).mockRejectedValue({ response: { data: { detail: 'Ya existe la sección' } } });
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva sección' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva sección' }));
    await user.type(d.getByPlaceholderText('Ej: Grupo A'), 'Grupo A');
    await user.click(d.getByRole('button', { name: 'Crear' }));
    expect(await d.findByText('Ya existe la sección')).toBeTruthy();

    await user.click(d.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: '+ Nueva sección' }));
    expect(screen.queryByText('Ya existe la sección')).toBeNull();
  });

  it('nueva actividad: valida el nombre, envía tipo y peso, la agrega y reinicia el formulario', async () => {
    vi.mocked(actividadesApi.create).mockResolvedValue(actividad(102, 'Taller', 'grupal', '0'));
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    await user.click(d.getByRole('button', { name: 'Crear' }));
    expect(d.getByText('El nombre es obligatorio')).toBeTruthy();

    await user.type(d.getByPlaceholderText('Ej: Lab1: Cálculo de subredes'), 'Taller');
    await user.click(d.getByRole('radio', { name: 'grupal' }));
    const peso = d.getByRole('spinbutton') as HTMLInputElement;
    expect(peso.value).toBe('20');
    await user.clear(peso);
    await user.type(peso, '35');
    await user.click(d.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(actividadesApi.create).toHaveBeenCalledWith(1, {
      nombre: 'Taller', tipo: 'grupal', peso_nota_final: 35, aplica_todas_secciones: true, secciones_ids: [],
    });
    expect(within(fila('Taller')).getByText('Sin rúbrica')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const otra = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    expect((otra.getByPlaceholderText('Ej: Lab1: Cálculo de subredes') as HTMLInputElement).value).toBe('');
    expect((otra.getByRole('radio', { name: 'individual' }) as HTMLInputElement).checked).toBe(true);
  });

  it('nueva actividad en secciones específicas: exige elegir al menos una y las envía', async () => {
    vi.mocked(actividadesApi.create).mockResolvedValue(
      { ...actividad(102, 'Taller', 'individual', '0'), aplica_todas_secciones: false, secciones_ids: [11] }
    );
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    await user.type(d.getByPlaceholderText('Ej: Lab1: Cálculo de subredes'), 'Taller');
    expect((d.getByRole('radio', { name: 'Todas las secciones' }) as HTMLInputElement).checked).toBe(true);
    expect(d.queryByRole('checkbox')).toBeNull();

    await user.click(d.getByRole('radio', { name: 'Secciones específicas' }));
    expect((d.getByRole('button', { name: 'Crear' }) as HTMLButtonElement).disabled).toBe(true);
    expect(d.getByText('Elige al menos una sección.')).toBeTruthy();
    await user.click(d.getByRole('checkbox', { name: 'Grupo B' }));
    await user.click(d.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(actividadesApi.create).toHaveBeenCalledWith(1, {
      nombre: 'Taller', tipo: 'individual', peso_nota_final: 20, aplica_todas_secciones: false, secciones_ids: [11],
    });
    expect(within(fila('Taller')).getByText('Secciones: Grupo B')).toBeTruthy();

    // El formulario se reinicia a "Todas las secciones"
    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const otra = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    expect((otra.getByRole('radio', { name: 'Todas las secciones' }) as HTMLInputElement).checked).toBe(true);
  });

  it('con una sola sección no pregunta el alcance y la actividad aplica a todas', async () => {
    vi.mocked(seccionesApi.list).mockResolvedValue([{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }]);
    vi.mocked(actividadesApi.create).mockResolvedValue(actividad(102, 'Taller', 'individual', '0'));
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    expect(d.queryByText('Aplica a')).toBeNull();
    expect(d.queryByRole('radio', { name: 'Secciones específicas' })).toBeNull();
    await user.type(d.getByPlaceholderText('Ej: Lab1: Cálculo de subredes'), 'Taller');
    await user.click(d.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(actividadesApi.create).toHaveBeenCalledWith(1, expect.objectContaining({
      aplica_todas_secciones: true, secciones_ids: [],
    })));
  });

  it('un 422 de validación se muestra como texto', async () => {
    vi.mocked(actividadesApi.create).mockRejectedValue({ response: { data: { detail: [
      { type: 'value_error', loc: ['body'], msg: 'Value error, Elija al menos una sección', input: {} },
    ] } } });
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    await user.type(d.getByPlaceholderText('Ej: Lab1: Cálculo de subredes'), 'Taller');
    await user.click(d.getByRole('button', { name: 'Crear' }));

    expect(await d.findByText('Value error, Elija al menos una sección')).toBeTruthy();
  });

  it('si crear la actividad falla, muestra el detalle del backend', async () => {
    vi.mocked(actividadesApi.create).mockRejectedValue({ response: { data: { detail: 'La suma de pesos supera 100' } } });
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: '+ Nueva actividad' }));
    const d = within(screen.getByRole('dialog', { name: 'Nueva actividad' }));
    await user.type(d.getByPlaceholderText('Ej: Lab1: Cálculo de subredes'), 'Taller');
    await user.click(d.getByRole('button', { name: 'Crear' }));

    expect(await d.findByText('La suma de pesos supera 100')).toBeTruthy();
  });
});

describe('CoursePage — editar asignatura', () => {
  it('"Editar asignatura" abre el formulario y al guardar actualiza el encabezado', async () => {
    vi.mocked(cursosApi.update).mockResolvedValue({ ...CURSO, nombre: 'Ingeniería de Software II' });
    const user = userEvent.setup();
    renderPage();
    await cargada();

    await user.click(screen.getByRole('button', { name: /editar asignatura/i }));
    const d = within(screen.getByRole('dialog', { name: 'Editar asignatura' }));
    const nombre = d.getByDisplayValue('Ingeniería de Software');
    await user.clear(nombre);
    await user.type(nombre, 'Ingeniería de Software II');
    await user.click(d.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('heading', { name: 'Ingeniería de Software II' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
