// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';

import { SectionPage } from './SectionPage';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { descargarBlob } from '../../utils/descarga';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/cursos', () => ({ cursosApi: { get: vi.fn() } }));
vi.mock('../../api/secciones', () => ({ seccionesApi: { list: vi.fn() } }));
vi.mock('../../api/estudiantes', () => ({
  estudiantesApi: {
    list: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn(),
    vistaPrevia: vi.fn(), importCsv: vi.fn(), exportarExcel: vi.fn(),
  },
}));
vi.mock('../../utils/descarga', () => ({ descargarBlob: vi.fn() }));

const DETALLE_409 = 'No se puede eliminar al estudiante: tiene calificaciones registradas';

beforeEach(() => {
  vi.mocked(cursosApi.get).mockResolvedValue(
    { id: 1, nombre: 'Ingeniería de Software', codigo: 'IS1', periodo: '2026-2', docente_email: 'd@uao.edu.co',
      ra_abet: [], rangos_calificacion: [], activo: true, created_at: '2026-01-01' },
  );
  vi.mocked(seccionesApi.list).mockResolvedValue([{ id: 10, nombre: 'Grupo A', curso_id: 1, activo: true }]);
  vi.mocked(estudiantesApi.list).mockResolvedValue([
    { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/cursos/1/secciones/10']}>
      <Routes>
        <Route path="/cursos/:cursoId/secciones/:seccionId" element={<SectionPage />} />
      </Routes>
    </MemoryRouter>
  );

// La fila y el modal tienen un botón "Eliminar": se acota la búsqueda al diálogo
const modal = () => within(screen.getByRole('dialog', { name: 'Eliminar estudiante' }));

describe('SectionPage — eliminar estudiante', () => {
  it('si estudiantesApi.delete falla, el modal sigue abierto y muestra el detalle del backend', async () => {
    vi.mocked(estudiantesApi.delete).mockRejectedValue({ response: { status: 409, data: { detail: DETALLE_409 } } });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(modal().getByText('¿Eliminar este estudiante?')).toBeTruthy();
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    // El error del backend llega al modal…
    expect(await modal().findByText(DETALLE_409)).toBeTruthy();
    // …el modal no se cerró y la fila sigue en la tabla
    expect(modal().getByRole('button', { name: 'Eliminar' })).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(estudiantesApi.delete).toHaveBeenCalledTimes(1);
    expect(estudiantesApi.delete).toHaveBeenCalledWith(7);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('sin detail del backend, muestra el mensaje por defecto dentro del modal', async () => {
    vi.mocked(estudiantesApi.delete).mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    expect(await modal().findByText('No se pudo eliminar')).toBeTruthy();
  });

  it('si la eliminación tiene éxito, cierra el modal y quita la fila', async () => {
    vi.mocked(estudiantesApi.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(modal().getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Ana Pérez')).toBeNull();
  });
});

// ── Línea base antes de dividir SectionPage ──────────────────────────────────

const ANA = { id: 7, nombre_completo: 'Ana Pérez', codigo_estudiante: '2210001', seccion_id: 10 };
const filaDe = (nombre: string) => screen.getByRole('row', { name: new RegExp(nombre) });
const dialogo = (nombre: string) => within(screen.getByRole('dialog', { name: nombre }));
const inputArchivo = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const archivo = (nombre: string) => new File(['Nombre,Codigo\nX,1'], nombre, { type: 'text/csv' });

describe('SectionPage — listado', () => {
  it('muestra sección, curso y la tabla con "—" para quien no tiene correo', async () => {
    vi.mocked(estudiantesApi.list).mockResolvedValue([
      ANA,
      { id: 8, nombre_completo: 'Beto Ruiz', codigo_estudiante: '2210002', seccion_id: 10, email: 'beto@uao.edu.co' },
    ]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Grupo A' })).toBeTruthy();
    expect(screen.getByText('Ingeniería de Software', { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Estudiantes (2)' })).toBeTruthy();
    const sinCorreo = within(filaDe('Ana Pérez')).getByText('—');
    expect(sinCorreo.getAttribute('title')).toBe('Sin correo registrado');
    expect(within(filaDe('Beto Ruiz')).getByText('beto@uao.edu.co')).toBeTruthy();
  });

  it('sin estudiantes lo dice', async () => {
    vi.mocked(estudiantesApi.list).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No hay estudiantes. Agrégalos manualmente o importa un CSV o Excel.')).toBeTruthy();
  });
});

describe('SectionPage — agregar y editar', () => {
  const abrirAgregar = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: '+ Agregar' }));
    return dialogo('Agregar estudiante');
  };

  it('valida nombre y código antes de llamar al backend', async () => {
    const user = userEvent.setup();
    renderPage();
    const d = await abrirAgregar(user);

    await user.click(d.getByRole('button', { name: 'Agregar' }));

    expect(d.getByText('Nombre y código son obligatorios')).toBeTruthy();
    expect(estudiantesApi.create).not.toHaveBeenCalled();
  });

  it('agregar guarda el nombre en mayúsculas, agrega la fila y cierra', async () => {
    vi.mocked(estudiantesApi.create).mockResolvedValue({
      id: 9, nombre_completo: 'CARLOS RUIZ', codigo_estudiante: '2210009', seccion_id: 10, email: null,
    });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirAgregar(user);

    await user.type(d.getByPlaceholderText('OSCAR EVELIO PRADA CEBALLOS'), ' carlos ruiz ');
    await user.type(d.getByPlaceholderText('2021001'), ' 2210009 ');
    await user.click(d.getByRole('button', { name: 'Agregar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(estudiantesApi.create).toHaveBeenCalledWith(10, {
      nombre_completo: 'CARLOS RUIZ', codigo_estudiante: '2210009', email: null,
    });
    expect(filaDe('CARLOS RUIZ')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Estudiantes (2)' })).toBeTruthy();
  });

  it('con aviso del backend, agrega pero deja el modal abierto con los campos vacíos', async () => {
    vi.mocked(estudiantesApi.create).mockResolvedValue({
      id: 9, nombre_completo: 'CARLOS RUIZ', codigo_estudiante: '2210009', seccion_id: 10, email: null,
      aviso: 'El correo no es válido y quedó en blanco',
    });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirAgregar(user);

    await user.type(d.getByPlaceholderText('OSCAR EVELIO PRADA CEBALLOS'), 'Carlos Ruiz');
    await user.type(d.getByPlaceholderText('2021001'), '2210009');
    await user.type(d.getByPlaceholderText('oscar.prada@uao.edu.co'), 'malo@');
    await user.click(d.getByRole('button', { name: 'Agregar' }));

    expect(await d.findByText('Estudiante agregado. El correo no es válido y quedó en blanco.')).toBeTruthy();
    expect((d.getByPlaceholderText('OSCAR EVELIO PRADA CEBALLOS') as HTMLInputElement).value).toBe('');
    expect((d.getByPlaceholderText('2021001') as HTMLInputElement).value).toBe('');
    expect(filaDe('CARLOS RUIZ')).toBeTruthy();
  });

  it('si agregar falla, muestra el detalle del backend en el modal', async () => {
    vi.mocked(estudiantesApi.create).mockRejectedValue({ response: { data: { detail: 'Código repetido' } } });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirAgregar(user);

    await user.type(d.getByPlaceholderText('OSCAR EVELIO PRADA CEBALLOS'), 'Carlos');
    await user.type(d.getByPlaceholderText('2021001'), '1');
    await user.click(d.getByRole('button', { name: 'Agregar' }));

    expect(await d.findByText('Código repetido')).toBeTruthy();
  });

  it('editar precarga los datos, guarda y conserva el promedio de la fila', async () => {
    vi.mocked(estudiantesApi.list).mockResolvedValue([{ ...ANA, email: 'ana@uao.edu.co', promedio: 4.2 } as never]);
    vi.mocked(estudiantesApi.update).mockResolvedValue({
      id: 7, nombre_completo: 'ANA PÉREZ GÓMEZ', codigo_estudiante: '2210001', seccion_id: 10, email: 'ana@uao.edu.co',
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await screen.findByRole('row', { name: /ana pérez/i })).getByRole('button', { name: 'Editar' }));
    const d = dialogo('Editar estudiante');
    const nombre = d.getByPlaceholderText('OSCAR EVELIO PRADA CEBALLOS') as HTMLInputElement;
    expect(nombre.value).toBe('Ana Pérez');
    expect((d.getByPlaceholderText('oscar.prada@uao.edu.co') as HTMLInputElement).value).toBe('ana@uao.edu.co');

    await user.clear(nombre);
    await user.type(nombre, 'ana pérez gómez');
    await user.click(d.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(estudiantesApi.update).toHaveBeenCalledWith(7, {
      nombre_completo: 'ANA PÉREZ GÓMEZ', codigo_estudiante: '2210001', email: 'ana@uao.edu.co',
    });
    expect(filaDe('ANA PÉREZ GÓMEZ')).toBeTruthy();

    // Al cerrar la edición, "Agregar" se abre vacío
    const agregar = await abrirAgregar(user);
    expect((agregar.getByPlaceholderText('OSCAR EVELIO PRADA CEBALLOS') as HTMLInputElement).value).toBe('');
  });

  it('editar con aviso: guarda, muestra el correo real y el botón pasa a "Cerrar"', async () => {
    vi.mocked(estudiantesApi.update).mockResolvedValue({
      id: 7, nombre_completo: 'ANA PÉREZ', codigo_estudiante: '2210001', seccion_id: 10, email: null,
      aviso: 'El correo no es válido; se conservó el anterior',
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await screen.findByRole('row', { name: /ana pérez/i })).getByRole('button', { name: 'Editar' }));
    const d = dialogo('Editar estudiante');
    await user.type(d.getByPlaceholderText('oscar.prada@uao.edu.co'), 'malo@');
    await user.click(d.getByRole('button', { name: 'Guardar cambios' }));

    expect(await d.findByText('Cambios guardados. El correo no es válido; se conservó el anterior.')).toBeTruthy();
    expect((d.getByPlaceholderText('oscar.prada@uao.edu.co') as HTMLInputElement).value).toBe('');
    expect(d.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });
});

describe('SectionPage — importar CSV / Excel', () => {
  const abrirImportar = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Importar CSV / Excel' }));
    return dialogo('Importar estudiantes desde CSV o Excel');
  };

  it('sin archivo, "Importar" está deshabilitado y el área pide uno', async () => {
    const user = userEvent.setup();
    renderPage();
    const d = await abrirImportar(user);

    expect(d.getByText('Arrastra un CSV o Excel (.xlsx) aquí o haz clic para seleccionar')).toBeTruthy();
    expect((d.getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(inputArchivo().getAttribute('accept')).toBe('.csv,.xlsx');
  });

  it('al elegir un archivo muestra su nombre, la vista previa y los avisos del backend', async () => {
    vi.mocked(estudiantesApi.vistaPrevia).mockResolvedValue({
      estudiantes: [
        { nombre: 'CARLOS RUIZ', codigo: '2210009', email: 'carlos@uao.edu.co' },
        { nombre: 'DANI LOPEZ', codigo: '2210010', email: null },
      ],
      errores: ['Fila 4: correo no válido'],
    });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirImportar(user);

    await user.upload(inputArchivo(), archivo('lista.csv'));

    expect(d.getByText('lista.csv')).toBeTruthy();
    expect(await d.findByText('Vista previa (2 estudiantes)')).toBeTruthy();
    expect(d.getByText('carlos@uao.edu.co')).toBeTruthy();
    expect(d.getByText('Fila 4: correo no válido')).toBeTruthy();
    expect(estudiantesApi.vistaPrevia).toHaveBeenCalledWith(10, expect.any(File));
  });

  it('también acepta el archivo arrastrado al área', async () => {
    vi.mocked(estudiantesApi.vistaPrevia).mockResolvedValue({
      estudiantes: [{ nombre: 'CARLOS RUIZ', codigo: '2210009', email: null }], errores: [],
    });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirImportar(user);

    const area = d.getByText('Arrastra un CSV o Excel (.xlsx) aquí o haz clic para seleccionar').parentElement!;
    fireEvent.drop(area, { dataTransfer: { files: [archivo('arrastrado.csv')] } });

    expect(await d.findByText('Vista previa (1 estudiante)')).toBeTruthy();
    expect(d.getByText('arrastrado.csv')).toBeTruthy();
  });

  it('si se elige otro archivo antes de que responda la vista previa, gana el último', async () => {
    let resolverPrimero: (v: { estudiantes: { nombre: string; codigo: string }[]; errores: string[] }) => void = () => {};
    vi.mocked(estudiantesApi.vistaPrevia)
      .mockImplementationOnce(() => new Promise((resolve) => { resolverPrimero = resolve; }))
      .mockResolvedValueOnce({ estudiantes: [{ nombre: 'SEGUNDO', codigo: '2' }], errores: [] });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirImportar(user);

    await user.upload(inputArchivo(), archivo('primero.csv'));
    await user.upload(inputArchivo(), archivo('segundo.csv'));
    expect(await d.findByText('SEGUNDO')).toBeTruthy();

    resolverPrimero({ estudiantes: [{ nombre: 'PRIMERO', codigo: '1' }], errores: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(d.queryByText('PRIMERO')).toBeNull();
  });

  it('importar recarga la lista y cierra el modal', async () => {
    vi.mocked(estudiantesApi.vistaPrevia).mockResolvedValue({ estudiantes: [{ nombre: 'CARLOS RUIZ', codigo: '2210009' }], errores: [] });
    vi.mocked(estudiantesApi.importCsv).mockResolvedValue({ importados: 1, errores: [] });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirImportar(user);
    await user.upload(inputArchivo(), archivo('lista.csv'));
    await d.findByText('Vista previa (1 estudiante)');
    vi.mocked(estudiantesApi.list).mockResolvedValue([
      ANA, { id: 9, nombre_completo: 'CARLOS RUIZ', codigo_estudiante: '2210009', seccion_id: 10 },
    ]);

    await user.click(d.getByRole('button', { name: 'Importar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(estudiantesApi.importCsv).toHaveBeenCalledWith(10, expect.any(File));
    expect(screen.getByRole('heading', { name: 'Estudiantes (2)' })).toBeTruthy();
  });

  it('importar con filas rechazadas recarga la lista pero deja el modal con el resumen', async () => {
    vi.mocked(estudiantesApi.vistaPrevia).mockResolvedValue({ estudiantes: [{ nombre: 'CARLOS RUIZ', codigo: '2210009' }], errores: [] });
    vi.mocked(estudiantesApi.importCsv).mockResolvedValue({ importados: 1, errores: ['Fila 3: código repetido'] });
    const user = userEvent.setup();
    renderPage();
    const d = await abrirImportar(user);
    await user.upload(inputArchivo(), archivo('lista.csv'));
    await d.findByText('Vista previa (1 estudiante)');

    await user.click(d.getByRole('button', { name: 'Importar' }));

    expect(await d.findByText('Importados: 1. Fila 3: código repetido')).toBeTruthy();
    expect(estudiantesApi.list).toHaveBeenCalledTimes(2);
  });
});

describe('SectionPage — exportar', () => {
  it('"Exportar Excel" descarga la lista de la sección', async () => {
    const blob = new Blob(['x']);
    vi.mocked(estudiantesApi.exportarExcel).mockResolvedValue({ blob, nombre: 'Grupo_A.xlsx' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Exportar Excel' }));

    expect(estudiantesApi.exportarExcel).toHaveBeenCalledWith({ seccion_id: 10 });
    await waitFor(() => expect(descargarBlob).toHaveBeenCalledWith(blob, 'Grupo_A.xlsx'));
  });

  it('si exportar falla, muestra el error', async () => {
    vi.mocked(estudiantesApi.exportarExcel).mockRejectedValue({ response: { data: { detail: 'Sin estudiantes' } } });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Exportar Excel' }));

    expect(await screen.findByText('Sin estudiantes')).toBeTruthy();
  });
});
