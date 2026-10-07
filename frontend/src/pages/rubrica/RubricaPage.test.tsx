// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

import RubricaPage from './RubricaPage';
import { cursosApi } from '../../api/cursos';
import { actividadesApi } from '../../api/actividades';
import { criteriosApi } from '../../api/criterios';
import { catalogoRaAbetApi } from '../../api/catalogo';
import { useCourseStore } from '../../store/courseStore';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('../../api/criterios', () => ({
  criteriosApi: { get: vi.fn(), importarExcel: vi.fn(), save: vi.fn(), vincularAbet: vi.fn() },
}));
vi.mock('../../api/catalogo', () => ({ catalogoRaAbetApi: { list: vi.fn() } }));

const ACTIVIDAD = {
  id: 100, nombre: 'Proyecto final', tipo: 'grupal' as const, peso_nota_final: 30, curso_id: 1,
  created_at: '2026-01-01', total_peso_criterios: '100.00',
};
const OTRA_ACTIVIDAD = { ...ACTIVIDAD, id: 200, nombre: 'Parcial' };

beforeEach(() => {
  vi.mocked(cursosApi.list).mockResolvedValue([
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  ]);
  vi.mocked(actividadesApi.get).mockResolvedValue(ACTIVIDAD);
  vi.mocked(actividadesApi.list).mockResolvedValue([ACTIVIDAD, OTRA_ACTIVIDAD]);
  vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
  vi.mocked(criteriosApi.get).mockResolvedValue({
    aspectos: [
      { id: 1, nombre: 'Diseño', orden: 1, codigo_abet: null, criterios: [
        { id: 11, texto: 'Plantea el problema', peso_porcentaje: 60, aspecto_id: 1, orden: 1 },
        { id: 12, texto: 'Propone una solución', peso_porcentaje: 40, aspecto_id: 1, orden: 2 },
      ] },
      { id: 2, nombre: 'Vacío', orden: 2, codigo_abet: null, criterios: [] },
    ],
    total_peso: 100,
    tiene_calificaciones: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/actividades/100']}>
      <Routes>
        <Route path="/actividades/:actividadId" element={<RubricaPage />} />
        <Route path="/cursos/:cursoId" element={<p>Página del curso</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('RubricaPage — eliminar aspecto', () => {
  it('un aspecto con criterios se confirma en el modal: Cancelar lo conserva y Eliminar lo quita del borrador', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar Diseño' }));
    expect(screen.getByRole('dialog', { name: 'Eliminar aspecto' })).toBeTruthy();
    expect(screen.getByText('¿Eliminar el aspecto "Diseño" y sus 2 criterios?')).toBeTruthy();

    // Cancelar cierra el modal sin tocar el borrador
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Diseño' })).toBeTruthy();

    // Confirmar lo quita del borrador
    await user.click(screen.getByRole('button', { name: 'Eliminar Diseño' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Vacío' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('un aspecto sin criterios se elimina directamente, sin modal', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar Vacío' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Vacío' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Diseño' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('RubricaPage — descartar cambios sin guardar', () => {
  const AVISO = 'Hay cambios sin guardar en la rúbrica. ¿Descartarlos?';
  const selectActividad = () => screen.getAllByRole('combobox')[1] as HTMLSelectElement;

  // Eliminar un aspecto sin criterios deja el borrador con cambios sin guardar, sin abrir ningún modal
  const ensuciarBorrador = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Eliminar Vacío' }));
  };

  it('sin cambios, cambiar de actividad no pide confirmación', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    await user.selectOptions(selectActividad(), '200');

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(criteriosApi.get).toHaveBeenLastCalledWith(200));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('con cambios, cambiar de actividad abre el modal: Cancelar no cambia nada y Descartar cambia de actividad', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    renderPage();
    await ensuciarBorrador(user);

    await user.selectOptions(selectActividad(), '200');
    expect(screen.getByRole('dialog', { name: 'Cambios sin guardar' })).toBeTruthy();
    expect(screen.getByText(AVISO)).toBeTruthy();

    // Cancelar: sigue en la misma actividad y con el borrador intacto
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(selectActividad().value).toBe('100');
    expect(criteriosApi.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Eliminar Vacío' })).toBeNull();

    // Descartar: se ejecuta el cambio de actividad pendiente
    await user.selectOptions(selectActividad(), '200');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(criteriosApi.get).toHaveBeenLastCalledWith(200));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('con cambios, "Volver al curso" solo navega después de confirmar', async () => {
    const user = userEvent.setup();

    renderPage();
    await ensuciarBorrador(user);

    await user.click(screen.getByRole('button', { name: /volver al curso/i }));
    expect(screen.getByText(AVISO)).toBeTruthy();
    expect(screen.queryByText('Página del curso')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(await screen.findByText('Página del curso')).toBeTruthy();
  });

  it('con cambios, importar muestra el aviso dentro del modal de import (sin abrir un segundo modal)', async () => {
    vi.mocked(criteriosApi.importarExcel).mockResolvedValue({
      aspectos: [{ nombre: 'Importado', criterios: [{ texto: 'Criterio importado', peso_porcentaje: '100' }] }],
      total_peso: '100',
    });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    const { container } = renderPage();
    await ensuciarBorrador(user);

    await user.click(screen.getAllByRole('button', { name: /importar excel/i })[0]);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'rubrica.xlsx'));
    await user.click(await screen.findByRole('button', { name: 'Importar al borrador' }));

    // El aviso aparece dentro del modal de import, que sigue abierto; no hay modal de descarte encima
    expect(screen.getByText(AVISO)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Importar rúbrica desde Excel' })).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // Cancelar el aviso vuelve a los botones normales sin importar
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Importado' })).toBeNull();

    // Descartar e importar reemplaza el borrador y cierra el modal
    await user.click(screen.getByRole('button', { name: 'Importar al borrador' }));
    await user.click(screen.getByRole('button', { name: 'Descartar e importar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Importado' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

// ── Línea base antes de dividir RubricaPage ──────────────────────────────────

const CATALOGO_ABET = [
  { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones de ingeniería', programa: 'X', codigo_padre: null, peso: null },
  { codigo: '2.1.1', so: '2', competencia: 'Diseño', descripcion: 'Identifica requisitos del problema', programa: 'X', codigo_padre: '2.1', peso: 0.5 },
  { codigo: '2.1.2', so: '2', competencia: 'Diseño', descripcion: 'Evalúa alternativas', programa: 'X', codigo_padre: '2.1', peso: 0.5 },
];
// Rúbrica completa al 100 %: Diseño (60 + 40), sin aspectos vacíos
const RUBRICA_100 = {
  aspectos: [
    { id: 1, nombre: 'Diseño', orden: 0, codigo_abet: null, criterios: [
      { id: 11, texto: 'Plantea el problema', peso_porcentaje: 60, aspecto_id: 1, orden: 0 },
      { id: 12, texto: 'Propone una solución', peso_porcentaje: 40, aspecto_id: 1, orden: 1 },
    ] },
  ],
  total_peso: 100,
  tiene_calificaciones: false,
};

function Ubicacion() {
  const location = useLocation();
  return <p data-testid="ubicacion">{location.pathname + location.search}</p>;
}

// Con todas las rutas a las que navega la página, y un testigo de la URL actual
const renderEn = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/rubrica" element={<><RubricaPage /><Ubicacion /></>} />
        <Route path="/actividades/:actividadId" element={<><RubricaPage /><Ubicacion /></>} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>
  );

const combo = (i: 0 | 1) => screen.getAllByRole('combobox')[i] as HTMLSelectElement;
const resumen = () =>
  Array.from(screen.getByText('Resumen').parentElement!.querySelectorAll('.text-3xl')).map((n) => n.textContent);
const guardar = () => screen.getByRole('button', { name: /guardar rúbrica/i }) as HTMLButtonElement;
const dialogo = (nombre: string) => within(screen.getByRole('dialog', { name: nombre }));

describe('RubricaPage — carga', () => {
  it('/actividades/:id carga esa actividad y su asignatura, y la marca como activa', async () => {
    useCourseStore.setState({ selectedCourseId: null });
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    expect(combo(0).value).toBe('1');
    expect(combo(1).value).toBe('100');
    expect(useCourseStore.getState().selectedCourseId).toBe(1);
    expect(screen.getByText('Ingeniería de Software · Actividad: Proyecto final')).toBeTruthy();
    expect(resumen()).toEqual(['2', '2', '100%']);
    expect(screen.getByText('A.1')).toBeTruthy();
    expect(screen.getByText('A.2')).toBeTruthy();
    expect(screen.getByText('Sin criterios.')).toBeTruthy();
  });

  it('/rubrica usa la asignatura activa del Dashboard y su primera actividad', async () => {
    useCourseStore.setState({ selectedCourseId: 1 });
    renderEn('/rubrica');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    expect(actividadesApi.get).not.toHaveBeenCalled();
    expect(actividadesApi.list).toHaveBeenCalledWith(1);
    expect(criteriosApi.get).toHaveBeenCalledWith(100);
  });

  it('si la carga falla muestra el error del backend', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(criteriosApi.get).mockRejectedValue({ response: { data: { detail: 'Actividad no encontrada' } } });
    renderEn('/actividades/100');

    expect(await screen.findByText('Actividad no encontrada')).toBeTruthy();
  });

  it('una actividad sin rúbrica ofrece agregar aspecto o importar', async () => {
    vi.mocked(criteriosApi.get).mockResolvedValue({ aspectos: [], total_peso: 0, tiene_calificaciones: false });
    renderEn('/actividades/100');

    expect(await screen.findByText('Esta actividad aún no tiene rúbrica. Empieza agregando un aspecto.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /agregar aspecto/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /importar csv/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /importar excel/i })).toHaveLength(2);
  });

  it('cambiar de actividad actualiza la URL sin volver a cargar todo', async () => {
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    await user.selectOptions(combo(1), '200');

    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/actividades/200'));
    // Una sola lectura de la nueva actividad: la carga inicial no se repite por el cambio de URL
    expect(vi.mocked(criteriosApi.get).mock.calls).toEqual([[100], [200]]);
    expect(cursosApi.list).toHaveBeenCalledTimes(1);
  });

  it('cambiar de asignatura carga sus actividades y elige la primera', async () => {
    vi.mocked(cursosApi.list).mockResolvedValue([
      { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
        ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
      { id: 2, nombre: 'Bases de Datos', codigo: 'BD1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
        ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
    ]);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    vi.mocked(actividadesApi.list).mockResolvedValue([{ ...ACTIVIDAD, id: 300, nombre: 'Taller BD', curso_id: 2 }]);

    await user.selectOptions(combo(0), '2');

    await waitFor(() => expect(combo(1).value).toBe('300'));
    expect(actividadesApi.list).toHaveBeenLastCalledWith(2);
    expect(useCourseStore.getState().selectedCourseId).toBe(2);
    expect(screen.getByTestId('ubicacion').textContent).toBe('/actividades/300');
  });
});

describe('RubricaPage — editar el borrador', () => {
  it('agregar un aspecto lo deja vacío y avisa que necesita criterios', async () => {
    vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA_100);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    expect(guardar().disabled).toBe(true); // sin cambios

    await user.click(screen.getByRole('button', { name: /agregar aspecto/i }));
    const d = dialogo('Agregar aspecto');
    await user.click(d.getByRole('button', { name: 'Agregar' }));
    expect(d.getByText('El nombre del aspecto es obligatorio.')).toBeTruthy();
    await user.type(d.getByPlaceholderText('Ej: Identificación del problema'), 'Presentación');
    await user.click(d.getByRole('button', { name: 'Agregar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Agrega al menos un criterio a: Presentación.')).toBeTruthy();
    expect(guardar().disabled).toBe(true);
    expect(guardar().getAttribute('title')).toBe('La rúbrica debe sumar exactamente 100% y tener cambios sin guardar');
  });

  it('un criterio nuevo propone el peso restante y valida texto y peso', async () => {
    vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA_100);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    // Quitar el de 40 %: faltan 40
    await user.click(screen.getByRole('button', { name: 'Eliminar Propone una solución' }));
    expect(screen.getByText('Faltan 40% para completar el 100%.')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: /^criterio$/i })[0]);
    const d = dialogo('Agregar criterio');
    expect(d.getByText('Diseño')).toBeTruthy();
    const peso = d.getByPlaceholderText('20') as HTMLInputElement;
    expect(peso.value).toBe('40');

    await user.click(d.getByRole('button', { name: 'Agregar' }));
    expect(d.getByText('La descripción del criterio es obligatoria.')).toBeTruthy();
    await user.type(d.getByPlaceholderText(/Identifica y formula/), 'Justifica la solución');
    await user.clear(peso);
    await user.type(peso, '0');
    await user.click(d.getByRole('button', { name: 'Agregar' }));
    expect(d.getByText('El peso debe ser mayor que 0 y como máximo 100.')).toBeTruthy();

    await user.clear(peso);
    await user.type(peso, '50');
    await user.click(d.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByText('La suma excede el 100% por 10%.')).toBeTruthy();
    expect(resumen()).toEqual(['1', '2', '110%']);
  });

  it('editar un criterio y renombrar un aspecto actualizan el borrador', async () => {
    vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA_100);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    await user.click(screen.getByRole('button', { name: 'Editar Plantea el problema' }));
    const c = dialogo('Editar criterio');
    expect((c.getByPlaceholderText('20') as HTMLInputElement).value).toBe('60');
    await user.clear(c.getByPlaceholderText(/Identifica y formula/));
    await user.type(c.getByPlaceholderText(/Identifica y formula/), 'Define el problema');
    await user.click(c.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText('Define el problema')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Editar Diseño' }));
    const a = dialogo('Editar aspecto');
    await user.clear(a.getByPlaceholderText('Ej: Identificación del problema'));
    await user.type(a.getByPlaceholderText('Ej: Identificación del problema'), 'Análisis');
    await user.click(a.getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByRole('button', { name: 'Eliminar Análisis' })).toBeTruthy();
    expect(screen.getByText('Cambios sin guardar.')).toBeTruthy();
    expect(guardar().disabled).toBe(false);
  });

  it('vincular un aspecto a ABET pide RA y luego Criterio, y muestra la insignia', async () => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue(CATALOGO_ABET);
    vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA_100);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    await user.click(screen.getByRole('button', { name: 'Editar Diseño' }));
    const a = dialogo('Editar aspecto');
    expect(a.queryByText('2. Criterio de Evaluación')).toBeNull();
    await user.selectOptions(a.getAllByRole('combobox')[0], '2.1');
    await user.click(a.getByRole('button', { name: 'Aplicar' }));
    expect(a.getByText('Elige el Criterio del Resultado de Aprendizaje, o deja "Sin vincular".')).toBeTruthy();

    expect(a.getAllByRole('option').map((o) => o.textContent)).toContain('2.1.2 — Evalúa alternativas');
    await user.selectOptions(a.getAllByRole('combobox')[1], '2.1.1');
    expect(a.getByText('Identifica requisitos del problema')).toBeTruthy();
    await user.click(a.getByRole('button', { name: 'Aplicar' }));

    const insignia = screen.getByText('ABET 2.1.1');
    expect(insignia.closest('[title]')?.getAttribute('title')).toBe('Identifica requisitos del problema');

    // Al volver a editarlo, el paso 1 arranca en su RA
    await user.click(screen.getByRole('button', { name: 'Editar Diseño' }));
    expect((dialogo('Editar aspecto').getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('2.1');
  });

  it('sin catálogo ABET el modal enlaza a Student Outcomes', async () => {
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });

    await user.click(screen.getByRole('button', { name: 'Editar Diseño' }));

    expect(dialogo('Editar aspecto').getByRole('link', { name: 'Student Outcomes' }).getAttribute('href')).toBe('/student-outcomes');
  });
});

describe('RubricaPage — guardar', () => {
  beforeEach(() => {
    vi.mocked(criteriosApi.get).mockResolvedValue(RUBRICA_100);
  });

  const ensuciar = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Editar Diseño' }));
    const a = dialogo('Editar aspecto');
    await user.clear(a.getByPlaceholderText('Ej: Identificación del problema'));
    await user.type(a.getByPlaceholderText('Ej: Identificación del problema'), 'Análisis');
    await user.click(a.getByRole('button', { name: 'Aplicar' }));
  };

  it('envía la rúbrica completa con su orden, la recarga y ofrece ir a Proyectos (grupal)', async () => {
    vi.mocked(criteriosApi.save).mockResolvedValue({ ...RUBRICA_100, aspectos: [{ ...RUBRICA_100.aspectos[0], nombre: 'Análisis' }] });
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await ensuciar(user);

    await user.click(guardar());

    expect(await screen.findByText('Rúbrica guardada.')).toBeTruthy();
    expect(criteriosApi.save).toHaveBeenCalledWith(100, [
      { nombre: 'Análisis', orden: 0, codigo_abet: null, criterios: [
        { texto: 'Plantea el problema', peso_porcentaje: 60, orden: 0 },
        { texto: 'Propone una solución', peso_porcentaje: 40, orden: 1 },
      ] },
    ]);
    expect(guardar().disabled).toBe(true);
    expect(screen.queryByText('Cambios sin guardar.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Ir a Proyectos y Equipos' }));
    expect(screen.getByTestId('ubicacion').textContent).toBe('/proyectos?actividadId=100');
  });

  it('con aspectos vinculados, el mensaje lo menciona', async () => {
    vi.mocked(criteriosApi.save).mockResolvedValue({
      ...RUBRICA_100, aspectos: [{ ...RUBRICA_100.aspectos[0], codigo_abet: '2.1.1' }],
    });
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await ensuciar(user);

    await user.click(guardar());

    expect(await screen.findByText(
      'Rúbrica guardada. 1 aspecto(s) vinculado(s) a ABET; sus RA se agregaron a la asignatura si faltaban.'
    )).toBeTruthy();
  });

  it('si guardar falla, muestra el error y el borrador sigue con cambios', async () => {
    vi.mocked(criteriosApi.save).mockRejectedValue({ response: { data: { detail: 'Los pesos deben sumar 100' } } });
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await ensuciar(user);

    await user.click(guardar());

    expect(await screen.findByText('Los pesos deben sumar 100')).toBeTruthy();
    expect(screen.getByText('Cambios sin guardar.')).toBeTruthy();
  });
});

describe('RubricaPage — rúbrica bloqueada por calificaciones', () => {
  beforeEach(() => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue(CATALOGO_ABET);
    vi.mocked(criteriosApi.get).mockResolvedValue({ ...RUBRICA_100, tiene_calificaciones: true });
  });

  it('avisa, deshabilita la edición y solo permite vincular', async () => {
    renderEn('/actividades/100');
    expect(await screen.findByText(/Esta actividad ya tiene calificaciones: su rúbrica no se puede modificar\./)).toBeTruthy();

    for (const nombre of [/agregar aspecto/i, /importar csv/i, /importar excel/i]) {
      expect((screen.getByRole('button', { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(guardar().getAttribute('title')).toBe('La actividad ya tiene calificaciones: la rúbrica no se puede reemplazar');
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^criterio$/i })).toBeNull();
    // Las acciones de cada criterio siguen en el DOM pero invisibles
    expect(screen.getByRole('button', { name: 'Editar Plantea el problema' }).parentElement!.className).toContain('invisible');
    expect(screen.getByRole('button', { name: 'Vincular Diseño a Student Outcome' })).toBeTruthy();
  });

  it('guardar el vínculo lo envía al instante y muestra el mensaje', async () => {
    vi.mocked(criteriosApi.vincularAbet).mockResolvedValue({ ...RUBRICA_100.aspectos[0], codigo_abet: '2.1.2' });
    const user = userEvent.setup();
    renderEn('/actividades/100');

    await user.click(await screen.findByRole('button', { name: 'Vincular Diseño a Student Outcome' }));
    const a = dialogo('Vincular aspecto a Student Outcome');
    expect((a.getByPlaceholderText('Ej: Identificación del problema') as HTMLInputElement).disabled).toBe(true);
    expect(document.activeElement).toBe(a.getAllByRole('combobox')[0]);
    await user.selectOptions(a.getAllByRole('combobox')[0], '2.1');
    await user.selectOptions(a.getAllByRole('combobox')[1], '2.1.2');
    await user.click(a.getByRole('button', { name: 'Guardar vínculo' }));

    expect(await screen.findByText('"Diseño" vinculado a 2.1.2.')).toBeTruthy();
    expect(criteriosApi.vincularAbet).toHaveBeenCalledWith(100, 1, '2.1.2');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('ABET 2.1.2')).toBeTruthy();
  });

  it('desvincular y los errores del vínculo', async () => {
    vi.mocked(criteriosApi.get).mockResolvedValue({
      ...RUBRICA_100, tiene_calificaciones: true, aspectos: [{ ...RUBRICA_100.aspectos[0], codigo_abet: '2.1.1' }],
    });
    vi.mocked(criteriosApi.vincularAbet)
      .mockRejectedValueOnce({ response: { data: { detail: 'Límite de RA en la asignatura' } } })
      .mockResolvedValueOnce({ ...RUBRICA_100.aspectos[0], codigo_abet: null });
    const user = userEvent.setup();
    renderEn('/actividades/100');

    await user.click(await screen.findByRole('button', { name: 'Vincular Diseño a Student Outcome' }));
    const a = dialogo('Vincular aspecto a Student Outcome');
    await user.selectOptions(a.getAllByRole('combobox')[0], '');
    await user.click(a.getByRole('button', { name: 'Guardar vínculo' }));
    expect(await a.findByText('Límite de RA en la asignatura')).toBeTruthy();

    await user.click(a.getByRole('button', { name: 'Guardar vínculo' }));
    expect(await screen.findByText('"Diseño" desvinculado.')).toBeTruthy();
    expect(criteriosApi.vincularAbet).toHaveBeenLastCalledWith(100, 1, null);
  });
});

describe('RubricaPage — importar CSV / Excel', () => {
  const CSV = 'Aspecto,Criterio,Peso\nAnálisis,Lee el enunciado,30\nAnálisis,Plantea hipótesis,20\nSíntesis,Concluye,50';
  const inputArchivo = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  const abrir = async (user: ReturnType<typeof userEvent.setup>, formato: RegExp) => {
    await user.click(screen.getAllByRole('button', { name: formato })[0]);
  };

  it('CSV: muestra formato y vista previa con total, e importa al borrador', async () => {
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar csv/i);
    const d = dialogo('Importar rúbrica desde CSV');

    expect(d.getByText('Arrastra un CSV aquí o haz clic para seleccionar')).toBeTruthy();
    expect(d.getByText(/Formato: Aspecto,Criterio,Peso\[,CodigoABET\]/)).toBeTruthy();
    expect(inputArchivo().getAttribute('accept')).toBe('.csv');

    await user.upload(inputArchivo(), new File([CSV], 'rubrica.csv', { type: 'text/csv' }));

    expect(await d.findByText('Vista previa (2 aspectos, 3 criterios)')).toBeTruthy();
    expect(d.getByText('rubrica.csv')).toBeTruthy();
    expect(d.getByText('B.1')).toBeTruthy();
    expect(d.getByText('Reemplazará el borrador actual. Nada se guarda hasta pulsar "Guardar rúbrica".')).toBeTruthy();

    await user.click(d.getByRole('button', { name: 'Importar al borrador' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminar Análisis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar Síntesis' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminar Diseño' })).toBeNull();
    expect(resumen()).toEqual(['2', '3', '100%']);
    expect(guardar().disabled).toBe(false);
  });

  it('CSV: la vista previa avisa si el total no es 100 %', async () => {
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar csv/i);
    const d = dialogo('Importar rúbrica desde CSV');

    await user.upload(inputArchivo(), new File(['Aspecto,Criterio,Peso\nA,c1,70'], 'r.csv', { type: 'text/csv' }));

    expect(await d.findByText('(faltan 30%)')).toBeTruthy();
  });

  it('CSV inválido: muestra el error del parser y no deja importar', async () => {
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar csv/i);
    const d = dialogo('Importar rúbrica desde CSV');

    await user.upload(inputArchivo(), new File(['Nombre,Valor\nx,1'], 'malo.csv', { type: 'text/csv' }));

    expect(await d.findByText('El CSV debe tener las columnas Aspecto, Criterio y Peso (con encabezado).')).toBeTruthy();
    expect((d.getByRole('button', { name: 'Importar al borrador' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Excel: lo lee el backend, muestra "Leyendo el archivo…" y luego la vista previa', async () => {
    let resolver: (v: unknown) => void = () => {};
    vi.mocked(criteriosApi.importarExcel).mockReturnValue(new Promise((r) => { resolver = r; }) as never);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar excel/i);
    const d = dialogo('Importar rúbrica desde Excel');
    expect(d.getByText('Arrastra un Excel (.xlsx) aquí o haz clic para seleccionar')).toBeTruthy();
    expect(d.getByText(/Formato: Aspecto \| Criterio \| %Criterio/)).toBeTruthy();
    expect(inputArchivo().getAttribute('accept')).toBe('.xlsx');

    await user.upload(inputArchivo(), new File(['x'], 'rubrica.xlsx'));
    expect(d.getByText('Leyendo el archivo…')).toBeTruthy();
    expect(criteriosApi.importarExcel).toHaveBeenCalledWith(100, expect.any(File));

    resolver({ aspectos: [{ nombre: 'Del Excel', criterios: [{ texto: 'Uno', peso_porcentaje: '100' }] }], total_peso: '100' });
    expect(await d.findByText('Vista previa (1 aspecto, 1 criterio)')).toBeTruthy();
    expect(d.queryByText('Leyendo el archivo…')).toBeNull();
  });

  it('Excel: si se elige otro archivo, la respuesta del anterior se descarta', async () => {
    let resolverViejo: (v: unknown) => void = () => {};
    vi.mocked(criteriosApi.importarExcel)
      .mockReturnValueOnce(new Promise((r) => { resolverViejo = r; }) as never)
      .mockResolvedValueOnce({ aspectos: [{ nombre: 'Nuevo', criterios: [{ texto: 'N', peso_porcentaje: '100' }] }], total_peso: '100' });
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar excel/i);
    const d = dialogo('Importar rúbrica desde Excel');

    await user.upload(inputArchivo(), new File(['x'], 'viejo.xlsx'));
    await user.upload(inputArchivo(), new File(['y'], 'nuevo.xlsx'));
    expect(await d.findByText('Nuevo')).toBeTruthy();

    resolverViejo({ aspectos: [{ nombre: 'Viejo', criterios: [{ texto: 'V', peso_porcentaje: '100' }] }], total_peso: '100' });
    await new Promise((r) => setTimeout(r, 0));
    expect(d.queryByText('Viejo')).toBeNull();
    expect(d.getByText('nuevo.xlsx')).toBeTruthy();
  });

  it('Excel: cerrar el modal descarta una lectura en curso y lo deja limpio al reabrir', async () => {
    let resolver: (v: unknown) => void = () => {};
    vi.mocked(criteriosApi.importarExcel).mockReturnValue(new Promise((r) => { resolver = r; }) as never);
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar excel/i);
    await user.upload(inputArchivo(), new File(['x'], 'rubrica.xlsx'));

    await user.click(dialogo('Importar rúbrica desde Excel').getByRole('button', { name: 'Cancelar' }));
    resolver({ aspectos: [{ nombre: 'Tarde', criterios: [{ texto: 'T', peso_porcentaje: '100' }] }], total_peso: '100' });
    await new Promise((r) => setTimeout(r, 0));

    await abrir(user, /importar excel/i);
    const d = dialogo('Importar rúbrica desde Excel');
    expect(d.getByText('Arrastra un Excel (.xlsx) aquí o haz clic para seleccionar')).toBeTruthy();
    expect(d.queryByText('Tarde')).toBeNull();
    expect(d.queryByText('Leyendo el archivo…')).toBeNull();
    expect(inputArchivo().value).toBe('');
  });

  it('Excel: un error del backend se muestra en el modal', async () => {
    vi.mocked(criteriosApi.importarExcel).mockRejectedValue({ response: { data: { detail: 'Fila 3: peso vacío' } } });
    const user = userEvent.setup();
    renderEn('/actividades/100');
    await screen.findByRole('button', { name: 'Eliminar Diseño' });
    await abrir(user, /importar excel/i);

    await user.upload(inputArchivo(), new File(['x'], 'rubrica.xlsx'));

    expect(await dialogo('Importar rúbrica desde Excel').findByText('Fila 3: peso vacío')).toBeTruthy();
  });
});
