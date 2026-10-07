// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';

import { EstadisticasPage } from './EstadisticasPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi } from '../../api/actividades';
import { reportesApi } from '../../api/reportes';
import { descargarBlob } from '../../utils/descarga';
import { useCourseStore } from '../../store/courseStore';
import { DetalleXlsxResponse, ReporteABETResponse } from '../../types';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { list: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/actividades', () => ({ actividadesApi: { list: vi.fn() } }));
vi.mock('../../api/reportes', () => ({
  reportesApi: { abet: vi.fn(), actividad: vi.fn(), resumenXlsx: vi.fn(), detalleXlsx: vi.fn() },
}));
vi.mock('../../utils/descarga', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/descarga')>()),
  descargarBlob: vi.fn(),
}));
// La gráfica (recharts) no se dibuja en jsdom: basta saber qué filas y columna recibe
vi.mock('../Reports/distribucion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../Reports/distribucion')>()),
  DistribucionNivel: ({ filas, columna }: { filas: { codigo: string }[]; columna: string }) => (
    <div data-testid="distribucion">{columna}: {filas.map((f) => f.codigo).join(', ')}</div>
  ),
}));

const TOOLTIP = 'Elige una actividad específica (no "Todas") para exportar';

const CURSOS = [
  { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
    ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  { id: 2, nombre: 'Bases de Datos', codigo: 'BD1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
    ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
];

const reporte = (criterios: string[] = [], resultados: string[] = []): ReporteABETResponse => ({
  curso_id: 1, curso_nombre: 'Ingeniería de Software', curso_codigo: 'IS1', periodo: '2026-2',
  docente_email: 'd@uao.edu.co', rangos: [],
  criterios: criterios.map((codigo) => ({ codigo, codigo_padre: null, peso: null }) as never),
  resultados: resultados.map((codigo) => ({ codigo, criterios_con_evidencia: [], criterios_sin_evidencia: [] }) as never),
});

const DETALLE: DetalleXlsxResponse = {
  nombre_archivo: 'ABET_detalle_Proyecto.xlsx',
  archivo_base64: 'UEsDBA==',
  drive: { estado: 'sincronizado', detalle: null, enlace: 'https://drive.google.com/x' },
};

beforeEach(() => {
  useCourseStore.setState({ selectedCourseId: 1 });
  vi.mocked(cursosApi.list).mockResolvedValue(CURSOS);
  vi.mocked(seccionesApi.list).mockImplementation(async (cursoId) =>
    cursoId === 1
      ? [{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }]
      : [{ id: 20, nombre: 'Grupo BD', curso_id: 2, activo: true }]
  );
  vi.mocked(actividadesApi.list).mockImplementation(async (cursoId) =>
    cursoId === 1
      ? [{ id: 100, nombre: 'Proyecto final', tipo: 'grupal', peso_nota_final: 30, curso_id: 1,
           created_at: '2026-01-01', total_peso_criterios: '100.00' }]
      : [{ id: 200, nombre: 'Parcial', tipo: 'individual', peso_nota_final: 20, curso_id: 2,
           created_at: '2026-01-01', total_peso_criterios: '100.00' }]
  );
  vi.mocked(reportesApi.abet).mockResolvedValue(reporte(['2.1.1'], ['2.1']));
  vi.mocked(reportesApi.actividad).mockResolvedValue({
    ...reporte(['4.1.1'], ['4.1']), actividad_id: 100, actividad_nombre: 'Proyecto final', actividad_tipo: 'grupal',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const select = (nombre: string) => screen.getByRole('combobox', { name: nombre }) as HTMLSelectElement;
const boton = (nombre: RegExp) => screen.getByRole('button', { name: nombre });

// Espera a que carguen las asignaturas y las opciones en cascada de la preseleccionada
const renderCargada = async () => {
  render(<EstadisticasPage />);
  await screen.findByRole('option', { name: /proyecto final/i });
  await screen.findByTestId('distribucion');
};

describe('EstadisticasPage — carga y selectores en cascada', () => {
  it('preselecciona la asignatura activa del Dashboard y carga el reporte agregado del curso', async () => {
    await renderCargada();

    expect(select('Asignatura').value).toBe('1');
    expect(screen.getByRole('option', { name: 'Grupo A' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Proyecto final (grupal)' })).toBeTruthy();
    expect(reportesApi.abet).toHaveBeenCalledWith(1, undefined);
    expect(screen.getByTestId('distribucion').textContent).toBe('Criterio ABET: 2.1.1');
    expect(screen.getByText(/mismo cálculo que Reportes ABET/)).toBeTruthy();
  });

  it('sin asignatura activa pide elegir una y no carga ningún reporte', async () => {
    useCourseStore.setState({ selectedCourseId: null });
    render(<EstadisticasPage />);

    expect(await screen.findByText('Selecciona una asignatura para ver sus estadísticas.')).toBeTruthy();
    await screen.findByRole('option', { name: /bases de datos/i });
    expect(select('Sección').disabled).toBe(true);
    expect(select('Actividad').disabled).toBe(true);
    expect(reportesApi.abet).not.toHaveBeenCalled();
  });

  it('cambiar de asignatura reinicia sección y actividad y carga las del nuevo curso', async () => {
    const user = userEvent.setup();
    await renderCargada();
    await user.selectOptions(select('Sección'), '10');
    await user.selectOptions(select('Actividad'), '100');

    await user.selectOptions(select('Asignatura'), '2');

    await screen.findByRole('option', { name: 'Parcial (individual)' });
    expect(select('Sección').value).toBe('');
    expect(select('Actividad').value).toBe('');
    expect(screen.queryByRole('option', { name: 'Grupo A' })).toBeNull();
    expect(reportesApi.abet).toHaveBeenLastCalledWith(2, undefined);
  });

  it('elegir actividad y sección acota el reporte a ellas', async () => {
    const user = userEvent.setup();
    await renderCargada();

    await user.selectOptions(select('Actividad'), '100');
    await waitFor(() => expect(reportesApi.actividad).toHaveBeenLastCalledWith(1, 100, undefined));
    await user.selectOptions(select('Sección'), '10');
    await waitFor(() => expect(reportesApi.actividad).toHaveBeenLastCalledWith(1, 100, { seccion_id: 10 }));

    expect((await screen.findByTestId('distribucion')).textContent).toBe('Criterio ABET: 4.1.1');
    expect(screen.getByText('Proyecto final')).toBeTruthy();
  });

  it('una respuesta lenta de la asignatura anterior no pisa el reporte de la nueva', async () => {
    let resolverViejo: (r: ReporteABETResponse) => void = () => {};
    vi.mocked(reportesApi.abet).mockImplementation((cursoId) =>
      cursoId === 1
        ? new Promise((resolve) => { resolverViejo = resolve; })
        : Promise.resolve(reporte(['9.9.9']))
    );
    const user = userEvent.setup();
    render(<EstadisticasPage />);
    await screen.findByRole('option', { name: /proyecto final/i });

    await user.selectOptions(select('Asignatura'), '2');
    expect((await screen.findByTestId('distribucion')).textContent).toBe('Criterio ABET: 9.9.9');

    resolverViejo(reporte(['2.1.1']));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('distribucion').textContent).toBe('Criterio ABET: 9.9.9');
  });

  it('si falla el reporte muestra el detalle del backend', async () => {
    vi.mocked(reportesApi.abet).mockRejectedValue({ response: { data: { detail: 'Curso sin rangos' } } });
    render(<EstadisticasPage />);

    expect(await screen.findByText('Curso sin rangos')).toBeTruthy();
  });
});

describe('EstadisticasPage — contenido del reporte', () => {
  it('sin aspectos vinculados muestra el aviso del curso o el de la actividad', async () => {
    vi.mocked(reportesApi.abet).mockResolvedValue(reporte());
    vi.mocked(reportesApi.actividad).mockResolvedValue({
      ...reporte(), actividad_id: 100, actividad_nombre: 'Proyecto final', actividad_tipo: 'grupal',
    });
    const user = userEvent.setup();
    render(<EstadisticasPage />);

    expect(await screen.findByText('Ningún aspecto de las rúbricas del curso está vinculado a un Criterio ABET.')).toBeTruthy();
    await screen.findByRole('option', { name: /proyecto final/i });
    await user.selectOptions(select('Actividad'), '100');
    expect(await screen.findByText('Ningún aspecto de la rúbrica de esta actividad está vinculado a un Criterio ABET.')).toBeTruthy();
  });

  it('las pestañas cambian entre Criterio ABET y Resultado de Aprendizaje', async () => {
    const user = userEvent.setup();
    await renderCargada();

    await user.click(screen.getByRole('tab', { name: /resultado de aprendizaje/i }));

    expect(screen.getByTestId('distribucion').textContent).toBe('Resultado de aprendizaje: 2.1');
  });
});

describe('EstadisticasPage — exportaciones', () => {
  it('con "Todas las actividades" las exportaciones están deshabilitadas y explican por qué', async () => {
    await renderCargada();

    for (const nombre of [/exportar resumen/i, /generar detalle/i]) {
      const b = boton(nombre) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.parentElement?.getAttribute('title')).toBe(TOOLTIP);
    }
  });

  it('"Exportar resumen" descarga el Excel de la actividad (y de la sección, si hay)', async () => {
    const blob = new Blob(['x']);
    vi.mocked(reportesApi.resumenXlsx).mockResolvedValue({ blob, nombre: 'ABET_resumen.xlsx' });
    const user = userEvent.setup();
    await renderCargada();
    await user.selectOptions(select('Actividad'), '100');
    await user.selectOptions(select('Sección'), '10');

    const exportar = boton(/exportar resumen/i) as HTMLButtonElement;
    expect(exportar.disabled).toBe(false);
    expect(exportar.parentElement?.getAttribute('title')).toBeNull();
    await user.click(exportar);

    expect(reportesApi.resumenXlsx).toHaveBeenCalledWith(1, 100, { seccion_id: 10 });
    await waitFor(() => expect(descargarBlob).toHaveBeenCalledWith(blob, 'ABET_resumen.xlsx'));
  });

  it('si "Exportar resumen" falla, muestra el error en la página', async () => {
    vi.mocked(reportesApi.resumenXlsx).mockRejectedValue({ response: { data: { detail: 'Sin calificaciones' } } });
    const user = userEvent.setup();
    await renderCargada();
    await user.selectOptions(select('Actividad'), '100');

    await user.click(boton(/exportar resumen/i));

    expect(await screen.findByText('Sin calificaciones')).toBeTruthy();
    expect(descargarBlob).not.toHaveBeenCalled();
  });
});

describe('EstadisticasPage — modal de detalle', () => {
  const abrirDetalle = async (user: ReturnType<typeof userEvent.setup>) => {
    await renderCargada();
    await user.selectOptions(select('Actividad'), '100');
    await user.click(boton(/generar detalle/i));
    return screen.getByRole('dialog', { name: 'Detalle de la actividad' });
  };

  it('mientras se genera, muestra el estado y Esc no cierra el modal', async () => {
    vi.mocked(reportesApi.detalleXlsx).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const dialog = await abrirDetalle(user);

    expect(within(dialog).getByRole('status').textContent).toContain('Generando y sincronizando con tu Drive...');
    expect((boton(/generar detalle/i) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Detalle de la actividad' })).toBeTruthy();
  });

  it('listo: muestra el enlace de Drive y "Descargar" baja el archivo', async () => {
    vi.mocked(reportesApi.detalleXlsx).mockResolvedValue(DETALLE);
    const user = userEvent.setup();
    const dialog = await abrirDetalle(user);

    expect(await within(dialog).findByText('Detalle sincronizado en tu Drive')).toBeTruthy();
    expect(reportesApi.detalleXlsx).toHaveBeenCalledWith(1, 100, undefined);
    expect(within(dialog).getByRole('link', { name: /abrir en google drive/i }).getAttribute('href'))
      .toBe('https://drive.google.com/x');
    expect(within(dialog).getByText('ABET_detalle_Proyecto.xlsx')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /descargar/i }));
    expect(descargarBlob).toHaveBeenCalledWith(expect.any(Blob), 'ABET_detalle_Proyecto.xlsx');

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('listo con Drive en error: avisa, pero el archivo se puede descargar', async () => {
    vi.mocked(reportesApi.detalleXlsx).mockResolvedValue({
      ...DETALLE, drive: { estado: 'error', detalle: 'Token vencido', enlace: null },
    });
    const user = userEvent.setup();
    const dialog = await abrirDetalle(user);

    expect(await within(dialog).findByText('No se pudo sincronizar con Drive, pero puedes descargar el archivo.')).toBeTruthy();
    expect(within(dialog).getByText('Token vencido')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /descargar/i })).toBeTruthy();
  });

  it('modo simulado lo indica en el título', async () => {
    vi.mocked(reportesApi.detalleXlsx).mockResolvedValue({
      ...DETALLE, drive: { estado: 'simulado', detalle: null, enlace: null },
    });
    const user = userEvent.setup();
    const dialog = await abrirDetalle(user);

    expect(await within(dialog).findByText('Detalle sincronizado en tu Drive (modo simulado)')).toBeTruthy();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it('si falla, muestra el error y "Cerrar" cierra el modal', async () => {
    vi.mocked(reportesApi.detalleXlsx).mockRejectedValue({ response: { data: { detail: 'Drive no configurado' } } });
    const user = userEvent.setup();
    const dialog = await abrirDetalle(user);

    expect(await within(dialog).findByText('Drive no configurado')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
