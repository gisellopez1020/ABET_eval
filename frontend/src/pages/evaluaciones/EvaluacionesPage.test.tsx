// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

import EvaluacionesPage from './EvaluacionesPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi } from '../../api/actividades';
import { equiposApi } from '../../api/equipos';
import { criteriosApi } from '../../api/criterios';
import { calificacionesApi } from '../../api/calificaciones';
import { useCourseStore } from '../../store/courseStore';
import { Actividad, CalificacionOut, EquipoTrabajo, Seccion } from '../../types';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn() } }));
vi.mock('../../api/equipos', () => ({ equiposApi: { list: vi.fn() } }));
vi.mock('../../api/criterios', () => ({ criteriosApi: { get: vi.fn() } }));
vi.mock('../../api/calificaciones', () => ({ calificacionesApi: { equipo: vi.fn() } }));

// ── Datos ────────────────────────────────────────────────────────────────────

const curso = (id: number, nombre: string) => ({
  id, nombre, codigo: `C${id}`, periodo: '2026-2', docente_email: 'd@uao.edu.co',
  ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01',
});
const seccion = (id: number, nombre: string, curso_id: number): Seccion => ({ id, nombre, curso_id, activo: true });
const actividad = (id: number, nombre: string, curso_id: number, tipo: 'grupal' | 'individual' = 'grupal'): Actividad => ({
  id, nombre, tipo, peso_nota_final: 30, curso_id, created_at: '2026-01-01', total_peso_criterios: '100.00',
});
const equipo = (id: number, nombre: string, actividad_id: number, seccion_id: number, miembros: string[] = []): EquipoTrabajo => ({
  id, nombre, actividad_id, seccion_id, calificado: false, nota_total: null,
  criterios_calificados: 0, criterios_totales: 3,
  miembros: miembros.map((m, i) => ({ id: id * 10 + i, nombre_completo: m, codigo_estudiante: `${i}`, seccion_id })),
});
const calif = (criterio_id: number, valor: 0 | 1): CalificacionOut => ({
  id: criterio_id, criterio_id, valor, nota_calculada: 0, equipo_id: 1, estudiante_id: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
});

// Curso 1: Grupo A (10) y Grupo B (11); actividades 100 (grupal) y 101 (individual)
// Curso 2: Grupo BD (20); actividades 200 y 201 (grupales)
const SECCIONES: Record<number, Seccion[]> = {
  1: [seccion(10, 'Grupo A', 1), seccion(11, 'Grupo B', 1)],
  2: [seccion(20, 'Grupo BD', 2)],
};
const ACTIVIDADES: Record<number, Actividad[]> = {
  1: [actividad(100, 'Proyecto final', 1), actividad(101, 'Parcial', 1, 'individual')],
  2: [actividad(200, 'Taller BD', 2), actividad(201, 'Proyecto BD', 2)],
};
const EQUIPOS: Record<string, EquipoTrabajo[]> = {
  '100-10': [equipo(50, 'Equipo Alfa', 100, 10, ['Ana Pérez', 'Beto Ruiz'])],
  '100-11': [equipo(51, 'Equipo Beta', 100, 11, ['Caro Díaz'])],
  '200-20': [equipo(70, 'Equipo Taller', 200, 20)],
  '201-20': [equipo(71, 'Equipo Uno', 201, 20), equipo(72, 'Equipo Dos', 201, 20)],
};
// Rúbrica: aspecto A con 2 criterios (40 % y 30 %), aspecto B con 1 (30 %)
const RUBRICA = {
  aspectos: [
    { id: 1, nombre: 'Diseño', orden: 0, codigo_abet: null, criterios: [
      { id: 11, texto: 'Arquitectura clara', peso_porcentaje: 40, aspecto_id: 1, orden: 0 },
      { id: 12, texto: 'Modelo de datos', peso_porcentaje: 30, aspecto_id: 1, orden: 1 },
    ] },
    { id: 2, nombre: 'Presentación', orden: 1, codigo_abet: null, criterios: [
      { id: 21, texto: 'Exposición oral', peso_porcentaje: 30, aspecto_id: 2, orden: 0 },
    ] },
  ],
  total_peso: 100,
};

beforeEach(() => {
  useCourseStore.setState({ selectedCourseId: null });
  vi.mocked(cursosApi.list).mockResolvedValue([curso(1, 'Ingeniería de Software'), curso(2, 'Bases de Datos')]);
  vi.mocked(seccionesApi.list).mockImplementation(async (cursoId) => SECCIONES[cursoId] ?? []);
  vi.mocked(actividadesApi.list).mockImplementation(async (cursoId) => ACTIVIDADES[cursoId] ?? []);
  vi.mocked(equiposApi.list).mockImplementation(async (actId, secId) => EQUIPOS[`${actId}-${secId}`] ?? []);
  vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA as never);
  vi.mocked(calificacionesApi.equipo).mockResolvedValue([calif(11, 1), calif(12, 0)]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Ubicacion() {
  const location = useLocation();
  return <p data-testid="ubicacion">{location.pathname + location.search}</p>;
}

const renderPage = (url = '/evaluaciones') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/evaluaciones" element={<EvaluacionesPage />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>
  );

const sel = (nombre: string) => screen.getByRole('combobox', { name: nombre }) as HTMLSelectElement;
const opciones = (nombre: string) => within(sel(nombre)).getAllByRole('option').map((o) => o.textContent);
// Espera a que la rúbrica del proyecto elegido esté en pantalla
const conRubrica = () => screen.findByText('Arquitectura clara');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('EvaluacionesPage — selección inicial', () => {
  it('sin parámetros: primera asignatura, su primera actividad grupal y su primer equipo', async () => {
    renderPage();
    await conRubrica();

    expect(sel('Asignatura').value).toBe('1');
    // Solo actividades grupales
    expect(opciones('Actividad')).toEqual(['Proyecto final']);
    // Equipos de todas las secciones de la actividad
    expect(opciones('Proyecto a evaluar')).toEqual(['Equipo Alfa · Grupo A', 'Equipo Beta · Grupo B']);
    expect(sel('Proyecto a evaluar').value).toBe('50');
    expect(screen.getByText('Evaluación bajo los criterios ABET del curso Ingeniería de Software')).toBeTruthy();
    expect(criteriosApi.get).toHaveBeenCalledWith(100);
    expect(calificacionesApi.equipo).toHaveBeenCalledWith(100, 50);
  });

  it('sin parámetros usa la asignatura activa del Dashboard', async () => {
    useCourseStore.setState({ selectedCourseId: 2 });
    renderPage();
    await conRubrica();

    expect(sel('Asignatura').value).toBe('2');
    expect(sel('Actividad').value).toBe('200');
  });

  it('?cursoId, ?actividadId y ?projectId (desde "Evaluar Proyecto") preseleccionan todo', async () => {
    useCourseStore.setState({ selectedCourseId: 1 });
    renderPage('/evaluaciones?cursoId=2&actividadId=201&seccionId=20&projectId=72');
    await conRubrica();

    expect(sel('Asignatura').value).toBe('2');
    expect(sel('Actividad').value).toBe('201');
    expect(sel('Proyecto a evaluar').value).toBe('72');
    expect(calificacionesApi.equipo).toHaveBeenLastCalledWith(201, 72);
  });
});

describe('EvaluacionesPage — cambios de selección', () => {
  it('cambiar de asignatura carga sus actividades y equipos', async () => {
    const user = userEvent.setup();
    renderPage();
    await conRubrica();

    await user.selectOptions(sel('Asignatura'), '2');

    await waitFor(() => expect(sel('Proyecto a evaluar').value).toBe('70'));
    expect(opciones('Actividad')).toEqual(['Taller BD', 'Proyecto BD']);
    expect(screen.getByText('Evaluación bajo los criterios ABET del curso Bases de Datos')).toBeTruthy();
  });

  it('cambiar de actividad carga sus equipos', async () => {
    useCourseStore.setState({ selectedCourseId: 2 });
    const user = userEvent.setup();
    renderPage();
    await conRubrica();

    await user.selectOptions(sel('Actividad'), '201');

    await waitFor(() => expect(opciones('Proyecto a evaluar')).toEqual(['Equipo Uno · Grupo BD', 'Equipo Dos · Grupo BD']));
    expect(sel('Proyecto a evaluar').value).toBe('71');
  });

  it('cambiar de proyecto vuelve a cargar sus calificaciones', async () => {
    const user = userEvent.setup();
    renderPage();
    await conRubrica();
    vi.mocked(calificacionesApi.equipo).mockResolvedValue([]);

    await user.selectOptions(sel('Proyecto a evaluar'), '51');

    expect(calificacionesApi.equipo).toHaveBeenLastCalledWith(100, 51);
    await waitFor(() => expect(screen.getAllByText('Sin calificar')).toHaveLength(3));
    expect(screen.getByText('0 de 3 criterios calificados')).toBeTruthy();
  });

  it('una carga lenta de la asignatura anterior no pisa la nueva', async () => {
    let resolverViejo: (s: Seccion[]) => void = () => {};
    const user = userEvent.setup();
    renderPage();
    await conRubrica();
    vi.mocked(seccionesApi.list).mockImplementation((cursoId) =>
      cursoId === 1 ? new Promise((resolve) => { resolverViejo = resolve; }) : Promise.resolve(SECCIONES[cursoId])
    );

    await user.selectOptions(sel('Asignatura'), '1');   // vuelve a pedir el curso 1 (queda pendiente)
    await user.selectOptions(sel('Asignatura'), '2');
    await waitFor(() => expect(sel('Proyecto a evaluar').value).toBe('70'));

    resolverViejo(SECCIONES[1]);
    await new Promise((r) => setTimeout(r, 0));
    expect(sel('Asignatura').value).toBe('2');
    expect(opciones('Actividad')).toEqual(['Taller BD', 'Proyecto BD']);
    expect(sel('Proyecto a evaluar').value).toBe('70');
  });

  it('una carga lenta de equipos de la actividad anterior no pisa la nueva', async () => {
    useCourseStore.setState({ selectedCourseId: 2 });
    let resolverViejo: (e: EquipoTrabajo[]) => void = () => {};
    const user = userEvent.setup();
    renderPage();
    await conRubrica();
    vi.mocked(equiposApi.list).mockImplementation((actId, secId) =>
      actId === 200 ? new Promise((resolve) => { resolverViejo = resolve; }) : Promise.resolve(EQUIPOS[`${actId}-${secId}`] ?? [])
    );

    await user.selectOptions(sel('Actividad'), '200');  // queda pendiente
    await user.selectOptions(sel('Actividad'), '201');
    await waitFor(() => expect(sel('Proyecto a evaluar').value).toBe('71'));

    resolverViejo(EQUIPOS['200-20']);
    await new Promise((r) => setTimeout(r, 0));
    expect(opciones('Proyecto a evaluar')).toEqual(['Equipo Uno · Grupo BD', 'Equipo Dos · Grupo BD']);
  });

  it('una rúbrica lenta del proyecto anterior no pisa la del nuevo', async () => {
    let resolverViejo: (c: CalificacionOut[]) => void = () => {};
    const user = userEvent.setup();
    renderPage();
    await conRubrica();
    vi.mocked(calificacionesApi.equipo).mockImplementation((_a, equipoId) =>
      equipoId === 50 ? new Promise((resolve) => { resolverViejo = resolve; }) : Promise.resolve([])
    );

    await user.selectOptions(sel('Proyecto a evaluar'), '51');
    await user.selectOptions(sel('Proyecto a evaluar'), '50');  // queda pendiente
    await user.selectOptions(sel('Proyecto a evaluar'), '51');
    await waitFor(() => expect(screen.getAllByText('Sin calificar')).toHaveLength(3));

    resolverViejo([calif(11, 1), calif(12, 1), calif(21, 1)]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getAllByText('Sin calificar')).toHaveLength(3);
  });
});

describe('EvaluacionesPage — rúbrica y resumen del equipo', () => {
  it('muestra códigos, estados y pesos de cada criterio', async () => {
    renderPage();
    await conRubrica();

    const fila = (texto: string) => screen.getByText(texto).parentElement as HTMLElement;
    expect(within(fila('Arquitectura clara')).getByText('A.1')).toBeTruthy();
    expect(within(fila('Arquitectura clara')).getByText('Cumple')).toBeTruthy();
    expect(within(fila('Modelo de datos')).getByText('A.2')).toBeTruthy();
    expect(within(fila('Modelo de datos')).getByText('No cumple')).toBeTruthy();
    expect(within(fila('Exposición oral')).getByText('B.1')).toBeTruthy();
    expect(within(fila('Exposición oral')).getByText('Sin calificar')).toBeTruthy();

    const peso = within(fila('Arquitectura clara')).getByText('40.0%');
    expect(peso.getAttribute('title')).toBe('40%');
    expect(screen.getByText('2 criterios')).toBeTruthy();
    expect(screen.getByText('1 criterios')).toBeTruthy();
  });

  it('el resumen muestra el avance, si el equipo está calificado y sus integrantes', async () => {
    renderPage();
    await conRubrica();

    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByText('2 de 3 criterios calificados')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2 miembros')).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('Beto Ruiz')).toBeTruthy();
  });

  it('sin criterios en la rúbrica lo dice y el avance queda en 0 %', async () => {
    vi.mocked(criteriosApi.get).mockResolvedValue({ aspectos: [], total_peso: 0 } as never);
    vi.mocked(calificacionesApi.equipo).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No hay criterios definidos para esta actividad todavía.')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('0 de 0 criterios calificados')).toBeTruthy();
  });

  it('"Evaluación Individual" está deshabilitada y marcada como Próximamente', async () => {
    renderPage();
    await conRubrica();

    const individual = screen.getByRole('button', { name: /evaluación individual/i }) as HTMLButtonElement;
    expect(individual.disabled).toBe(true);
    expect(individual.textContent).toContain('Próximamente');
  });
});

describe('EvaluacionesPage — navegación', () => {
  it('"Ir a calificar" lleva a la calificación de la actividad y sección del equipo', async () => {
    const user = userEvent.setup();
    renderPage();
    await conRubrica();
    await user.selectOptions(sel('Proyecto a evaluar'), '51');

    await user.click(screen.getByRole('button', { name: /ir a calificar/i }));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/actividades/100/calificar/11');
  });

  it('"← Volver" lleva a proyectos', async () => {
    const user = userEvent.setup();
    renderPage();
    await conRubrica();

    await user.click(screen.getByRole('button', { name: '← Volver' }));

    expect(screen.getByTestId('ubicacion').textContent).toBe('/proyectos');
  });
});

describe('EvaluacionesPage — estados vacíos y errores', () => {
  it('sin asignaturas lo dice', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No tienes asignaturas registradas.')).toBeTruthy();
    expect(opciones('Asignatura')).toEqual(['Sin asignaturas']);
    expect(screen.getByText('Selecciona una asignatura para evaluar sus proyectos.')).toBeTruthy();
  });

  it('una asignatura sin actividades grupales lo explica', async () => {
    vi.mocked(actividadesApi.list).mockResolvedValue([actividad(101, 'Parcial', 1, 'individual')]);
    renderPage();

    expect(await screen.findByText(/Esta asignatura no tiene actividades grupales\./)).toBeTruthy();
    expect(opciones('Actividad')).toEqual(['Sin actividades grupales']);
  });

  it('una actividad sin equipos ofrece "Crear equipos" para esa actividad', async () => {
    vi.mocked(equiposApi.list).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Esta actividad no tiene equipos todavía.')).toBeTruthy();
    expect(opciones('Proyecto a evaluar')).toEqual(['Sin equipos']);
    await user.click(screen.getByRole('button', { name: 'Crear equipos' }));
    expect(screen.getByTestId('ubicacion').textContent).toBe('/proyectos?actividadId=100');
  });

  it.each([
    ['las asignaturas', () => vi.mocked(cursosApi.list).mockRejectedValue(new Error('x')), 'No se pudieron cargar las asignaturas.'],
    ['la asignatura', () => vi.mocked(seccionesApi.list).mockRejectedValue(new Error('x')), 'No se pudieron cargar las actividades de esta asignatura.'],
    ['los equipos', () => vi.mocked(equiposApi.list).mockRejectedValue(new Error('x')), 'No se pudieron cargar los equipos de esta actividad.'],
  ])('si fallan %s muestra el error', async (_nombre, fallar, mensaje) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fallar();
    renderPage();

    expect(await screen.findByText(mensaje)).toBeTruthy();
  });
});
