// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
vi.mock('../../api/equipos', () => ({ equiposApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } }));
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

const EQUIPO = {
  id: 50, nombre: 'Equipo Alfa', actividad_id: 100, seccion_id: 10, calificado: false, nota_total: null,
  criterios_calificados: 0, criterios_totales: 5,
  miembros: [{ id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 }],
};

const renderConRutas = () =>
  render(
    <MemoryRouter initialEntries={['/proyectos']}>
      <Routes>
        <Route path="/proyectos" element={<ProjectsPage />} />
        <Route path="/evaluaciones" element={<p>Página de evaluaciones</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('ProjectsPage — detalle del proyecto', () => {
  beforeEach(() => {
    vi.mocked(equiposApi.list).mockResolvedValue([EQUIPO]);
  });

  it('es un diálogo accesible: atrapa el foco, cierra con Esc (no con el fondo) y devuelve el foco a la tarjeta', async () => {
    const user = userEvent.setup();
    renderConRutas();

    const tarjeta = await screen.findByRole('button', { name: /equipo alfa/i });
    await user.click(tarjeta);

    const dialog = screen.getByRole('dialog', { name: 'Detalle del Proyecto' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    // Clic en el fondo: no cierra (igual que antes de la migración)
    await user.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Detalle del Proyecto' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tarjeta);
  });

  it('"Evaluar Proyecto" cierra el diálogo y navega aunque la tarjeta que lo abrió ya no exista', async () => {
    const user = userEvent.setup();
    renderConRutas();

    await user.click(await screen.findByRole('button', { name: /equipo alfa/i }));
    await user.click(screen.getByRole('button', { name: 'Evaluar Proyecto' }));

    expect(await screen.findByText('Página de evaluaciones')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ProjectsPage — crear proyecto (CreateProjectModal como diálogo)', () => {
  const abrirModal = async (user: ReturnType<typeof userEvent.setup>) => {
    const boton = await screen.findByRole('button', { name: /nuevo proyecto/i });
    await user.click(boton);
    return boton;
  };

  it('atrapa el foco, cierra con Esc (no con el fondo), devuelve el foco y conserva lo escrito al reabrir', async () => {
    const user = userEvent.setup();
    renderConRutas();

    const abrir = await abrirModal(user);
    const dialog = screen.getByRole('dialog', { name: 'Nuevo proyecto' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.type(screen.getByPlaceholderText('Ej: Sistema de inventarios'), 'Equipo Alfa');
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Nuevo proyecto' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);

    // El componente no se desmonta al cerrarse: lo escrito sigue ahí al reabrir
    await abrirModal(user);
    expect((screen.getByPlaceholderText('Ej: Sistema de inventarios') as HTMLInputElement).value).toBe('Equipo Alfa');
  });

  it('mientras se crea el proyecto, Esc no cierra el diálogo', async () => {
    vi.mocked(equiposApi.create).mockReturnValue(new Promise(() => {})); // queda pendiente
    const user = userEvent.setup();
    renderConRutas();

    await abrirModal(user);
    await user.type(screen.getByPlaceholderText('Ej: Sistema de inventarios'), 'Equipo Alfa');
    await user.click(await screen.findByRole('button', { name: /ana pérez/i }));
    await user.click(screen.getByRole('button', { name: /crear proyecto/i }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Nuevo proyecto' })).toBeTruthy();
  });
});

describe('ProjectsPage — crear proyecto (buscador de integrantes)', () => {
  beforeEach(() => {
    vi.mocked(estudiantesApi.list).mockResolvedValue([
      { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 },
      { id: 8, nombre_completo: 'Andrés Gómez', codigo_estudiante: '2210002', seccion_id: 10 },
      { id: 9, nombre_completo: 'Carlos Ruiz', codigo_estudiante: '2210003', seccion_id: 10 },
    ]);
  });

  const abrirModal = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /nuevo proyecto/i }));
    await screen.findByRole('button', { name: /carlos ruiz/i });
  };

  it('filtra la lista por nombre sin distinguir mayúsculas ni tildes', async () => {
    const user = userEvent.setup();
    renderConRutas();
    await abrirModal(user);

    await user.type(screen.getByPlaceholderText('Buscar estudiante...'), 'PEREZ');

    expect(screen.getByRole('button', { name: /ana pérez/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /andrés gómez/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /carlos ruiz/i })).toBeNull();
  });

  it('un estudiante seleccionado sigue seleccionado aunque el filtro lo oculte', async () => {
    vi.mocked(equiposApi.create).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderConRutas();
    await abrirModal(user);

    await user.type(screen.getByPlaceholderText('Ej: Sistema de inventarios'), 'Equipo Alfa');
    const buscador = screen.getByPlaceholderText('Buscar estudiante...');
    await user.type(buscador, 'ana');
    await user.click(screen.getByRole('button', { name: /ana pérez/i }));

    // Con otro filtro Ana queda oculta…
    await user.clear(buscador);
    await user.type(buscador, 'carlos');
    expect(screen.queryByRole('button', { name: /ana pérez/i })).toBeNull();

    // …y al borrar la búsqueda sigue marcada
    await user.clear(buscador);
    expect(screen.getByRole('button', { name: /ana pérez/i }).textContent).toContain('Selec.');

    // Se envía aunque esté oculta en el momento de crear
    await user.type(buscador, 'carlos');
    await user.click(screen.getByRole('button', { name: /crear proyecto/i }));
    expect(equiposApi.create).toHaveBeenCalledWith(100, 10, [{ nombre: 'Equipo Alfa', estudiante_ids: [7] }]);
  });

  it('si la búsqueda no encuentra a nadie, lo dice en vez de "No hay estudiantes disponibles"', async () => {
    const user = userEvent.setup();
    renderConRutas();
    await abrirModal(user);

    await user.type(screen.getByPlaceholderText('Buscar estudiante...'), 'zzz');

    expect(screen.getByText('Ningún estudiante coincide con "zzz".')).toBeTruthy();
    expect(screen.queryByText(/no hay estudiantes disponibles/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /ana pérez/i })).toBeNull();
  });
});

describe('ProjectsPage — editar equipo', () => {
  const ANA = { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 };
  const ANDRES = { id: 8, nombre_completo: 'Andrés Gómez', codigo_estudiante: '2210002', seccion_id: 10 };
  const DETALLE_OTRO_EQUIPO = "El estudiante Andrés Gómez ya está en el equipo 'Equipo Beta' de esta actividad";

  beforeEach(() => {
    vi.mocked(equiposApi.list).mockResolvedValue([EQUIPO]);
    vi.mocked(estudiantesApi.list).mockResolvedValue([ANA, ANDRES]);
  });

  // Desde la tarjeta: detalle → "Editar equipo", con la lista de la sección ya cargada
  const abrirEdicion = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /equipo alfa/i }));
    await user.click(screen.getByRole('button', { name: /editar equipo/i }));
    await screen.findByRole('button', { name: /andrés gómez/i });
    return screen.getByRole('dialog', { name: 'Editar equipo' });
  };

  it('se precarga con el nombre y los integrantes actuales del equipo', async () => {
    const user = userEvent.setup();
    renderConRutas();
    const dialog = await abrirEdicion(user);

    expect((within(dialog).getByPlaceholderText('Ej: Sistema de inventarios') as HTMLInputElement).value).toBe('Equipo Alfa');
    expect(within(dialog).getByRole('button', { name: /ana pérez/i }).textContent).toContain('Selec.');
    expect(within(dialog).getByRole('button', { name: /andrés gómez/i }).textContent).not.toContain('Selec.');
    expect(estudiantesApi.list).toHaveBeenCalledWith(10);
  });

  it('guardar sin cambios envía los integrantes actuales (el backend no los cuenta como de otro equipo)', async () => {
    vi.mocked(equiposApi.update).mockResolvedValue(EQUIPO);
    const user = userEvent.setup();
    renderConRutas();
    await abrirEdicion(user);

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(equiposApi.update).toHaveBeenCalledWith(50, { nombre: 'Equipo Alfa', estudiante_ids: [7] });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar equipo' })).toBeNull());
  });

  it('si el backend responde 400, muestra su mensaje tal cual dentro del modal sin cerrarlo', async () => {
    vi.mocked(equiposApi.update).mockRejectedValue({ response: { status: 400, data: { detail: DETALLE_OTRO_EQUIPO } } });
    const user = userEvent.setup();
    renderConRutas();
    const dialog = await abrirEdicion(user);

    const nombre = within(dialog).getByPlaceholderText('Ej: Sistema de inventarios');
    await user.clear(nombre);
    await user.type(nombre, 'Equipo Omega');
    await user.click(within(dialog).getByRole('button', { name: /andrés gómez/i }));
    await user.click(within(dialog).getByRole('button', { name: /guardar cambios/i }));

    expect(await within(dialog).findByText(DETALLE_OTRO_EQUIPO)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Editar equipo' })).toBeTruthy();
    expect((nombre as HTMLInputElement).value).toBe('Equipo Omega');
    expect(equiposApi.update).toHaveBeenCalledWith(50, { nombre: 'Equipo Omega', estudiante_ids: [7, 8] });
    // La tarjeta no cambió
    expect(screen.queryByText('Equipo Omega')).toBeNull();
  });

  it('al guardar con éxito actualiza la tarjeta y el detalle sin recargar la lista', async () => {
    vi.mocked(equiposApi.update).mockResolvedValue({ ...EQUIPO, nombre: 'Equipo Omega', miembros: [ANA, ANDRES] });
    const user = userEvent.setup();
    renderConRutas();
    const dialog = await abrirEdicion(user);

    const nombre = within(dialog).getByPlaceholderText('Ej: Sistema de inventarios');
    await user.clear(nombre);
    await user.type(nombre, 'Equipo Omega');
    await user.click(within(dialog).getByRole('button', { name: /andrés gómez/i }));
    await user.click(within(dialog).getByRole('button', { name: /guardar cambios/i }));

    // Se cierra la edición y el detalle (que sigue abierto) muestra los datos nuevos
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar equipo' })).toBeNull());
    const detalle = screen.getByRole('dialog', { name: 'Detalle del Proyecto' });
    expect(within(detalle).getByRole('heading', { name: 'Equipo Omega' })).toBeTruthy();
    expect(within(detalle).getByText('Andrés Gómez')).toBeTruthy();

    // La tarjeta también, y la lista de equipos solo se pidió en la carga inicial
    await user.keyboard('{Escape}');
    const tarjeta = screen.getByRole('button', { name: /equipo omega/i });
    expect(tarjeta.textContent).toContain('2 miembros');
    expect(tarjeta.textContent).toContain('Andrés Gómez');
    expect(equiposApi.list).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectsPage — avance de la calificación', () => {
  const integrante = (id: number, nombre: string) =>
    ({ id, nombre_completo: nombre, codigo_estudiante: String(2210000 + id), seccion_id: 10 });
  const CUATRO = [integrante(1, 'Ana'), integrante(2, 'Beto'), integrante(3, 'Caro'), integrante(4, 'Dani')];

  const tarjeta = async (nombre: RegExp) => (await screen.findByRole('button', { name: nombre })).textContent ?? '';

  it('un equipo de 4 integrantes sin calificaciones muestra 0% y Pendiente, no 80%', async () => {
    vi.mocked(equiposApi.list).mockResolvedValue([
      { ...EQUIPO, nombre: 'Equipo Grande', miembros: CUATRO, criterios_calificados: 0, criterios_totales: 5 },
    ]);
    renderConRutas();

    const texto = await tarjeta(/equipo grande/i);
    expect(texto).toContain('0%');
    expect(texto).not.toContain('80%');
    expect(texto).toContain('Pendiente');
  });

  it('el avance sale de los criterios calificados, no del tamaño del equipo', async () => {
    // 1 integrante y 2 de 5 criterios: la fórmula anterior daba 25 %
    vi.mocked(equiposApi.list).mockResolvedValue([
      { ...EQUIPO, nombre: 'Equipo Chico', criterios_calificados: 2, criterios_totales: 5 },
    ]);
    renderConRutas();

    const texto = await tarjeta(/equipo chico/i);
    expect(texto).toContain('40%');
    expect(texto).toContain('En evaluación');
  });

  it('un solo criterio calificado ya cuenta como "En evaluación" (también en el filtro)', async () => {
    vi.mocked(equiposApi.list).mockResolvedValue([
      { ...EQUIPO, id: 51, nombre: 'Empezado', criterios_calificados: 1, criterios_totales: 5 },
      { ...EQUIPO, id: 52, nombre: 'Sin empezar', criterios_calificados: 0, criterios_totales: 5 },
    ]);
    const user = userEvent.setup();
    renderConRutas();

    expect(await tarjeta(/empezado/i)).toContain('20%');
    await user.selectOptions(screen.getByLabelText('Estado'), 'en-evaluacion');

    expect(screen.getByRole('button', { name: /^empezado/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sin empezar/i })).toBeNull();
  });

  it('una actividad sin rúbrica muestra "Sin rúbrica" en la tarjeta y en el detalle, no un porcentaje', async () => {
    vi.mocked(equiposApi.list).mockResolvedValue([
      { ...EQUIPO, miembros: CUATRO, criterios_calificados: 0, criterios_totales: 0 },
    ]);
    const user = userEvent.setup();
    renderConRutas();

    const card = await screen.findByRole('button', { name: /equipo alfa/i });
    expect(card.textContent).toContain('Sin rúbrica');
    expect(card.textContent).not.toMatch(/\d+%/);

    await user.click(card);
    const detalle = screen.getByRole('dialog', { name: 'Detalle del Proyecto' });
    expect(within(detalle).getByText('Sin rúbrica')).toBeTruthy();
  });
});

describe('ProjectsPage — eliminar equipo', () => {
  const DETALLE_409 = "No se puede eliminar el equipo 'Equipo Alfa' porque ya tiene calificaciones registradas.";

  beforeEach(() => {
    vi.mocked(equiposApi.list).mockResolvedValue([
      EQUIPO,
      { ...EQUIPO, id: 51, nombre: 'Equipo Beta', miembros: [] },
    ]);
  });

  // Desde la tarjeta: detalle → "Eliminar equipo" → confirmación
  const abrirConfirmacion = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /equipo alfa/i }));
    await user.click(screen.getByRole('button', { name: /eliminar equipo/i }));
    return screen.getByRole('dialog', { name: 'Eliminar equipo' });
  };

  it('al confirmar, quita la tarjeta y cierra el detalle sin recargar la lista', async () => {
    vi.mocked(equiposApi.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderConRutas();
    const confirmacion = await abrirConfirmacion(user);

    expect(confirmacion.textContent).toContain('Sus integrantes no se eliminan');
    await user.click(within(confirmacion).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(equiposApi.delete).toHaveBeenCalledWith(50);
    expect(screen.queryByRole('button', { name: /equipo alfa/i })).toBeNull();
    expect(screen.getByRole('button', { name: /equipo beta/i })).toBeTruthy();
    expect(equiposApi.list).toHaveBeenCalledTimes(1);
  });

  it('si el backend responde 409, muestra su mensaje en la confirmación y la tarjeta sigue', async () => {
    vi.mocked(equiposApi.delete).mockRejectedValue({ response: { status: 409, data: { detail: DETALLE_409 } } });
    const user = userEvent.setup();
    renderConRutas();
    const confirmacion = await abrirConfirmacion(user);

    await user.click(within(confirmacion).getByRole('button', { name: 'Eliminar' }));

    expect(await within(confirmacion).findByText(DETALLE_409)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Eliminar equipo' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Detalle del Proyecto' })).toBeTruthy();

    // Al cancelar vuelve al detalle y la tarjeta sigue en la lista
    await user.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Eliminar equipo' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /equipo alfa/i })).toBeTruthy();
  });
});
