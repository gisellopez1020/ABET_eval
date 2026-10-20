// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';

import { StudentOutcomesPage } from './StudentOutcomesPage';
import { catalogoRaAbetApi } from '../../api/catalogo';

// El layout real exige sesión y monta Sidebar/Header: aquí solo interesa la página
vi.mock('../../components/Layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../api/catalogo', () => ({
  catalogoRaAbetApi: { list: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn(), importar: vi.fn() },
}));

const DETALLE_409 = "No se puede eliminar '2.1': lo usa el curso 'Ingeniería de Software'";

beforeEach(() => {
  vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([
    { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones de ingeniería',
      programa: 'Ingeniería', codigo_padre: null, peso: null },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('StudentOutcomesPage — eliminar del catálogo', () => {
  it('si catalogoRaAbetApi.delete responde 409, el modal sigue abierto y muestra el detalle del backend', async () => {
    vi.mocked(catalogoRaAbetApi.delete).mockRejectedValue({ response: { status: 409, data: { detail: DETALLE_409 } } });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();

    render(<StudentOutcomesPage />);
    await conCatalogo('Ingeniería');

    await user.click(await screen.findByRole('button', { name: 'Eliminar 2.1' }));
    expect(screen.getByText('¿Eliminar el Resultado de Aprendizaje "2.1" del catálogo?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    // El error del backend llega al modal…
    expect(await screen.findByText(DETALLE_409)).toBeTruthy();
    // …y el modal no se cerró
    expect(screen.getByRole('dialog', { name: 'Eliminar del catálogo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeTruthy();
    // La fila sigue en la tabla
    expect(screen.getByRole('button', { name: 'Eliminar 2.1' })).toBeTruthy();
    expect(catalogoRaAbetApi.delete).toHaveBeenCalledTimes(1);
    expect(catalogoRaAbetApi.delete).toHaveBeenCalledWith('2.1', 'Ingeniería');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('si la eliminación tiene éxito, cierra el modal, quita la fila y muestra el mensaje', async () => {
    vi.mocked(catalogoRaAbetApi.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StudentOutcomesPage />);
    await conCatalogo('Ingeniería');

    await user.click(await screen.findByRole('button', { name: 'Eliminar 2.1' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('"2.1" eliminado.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Eliminar 2.1' })).toBeNull();
  });
});

// ── Línea base antes de dividir StudentOutcomesPage ──────────────────────────

const ra = (codigo: string, competencia: string, descripcion: string) =>
  ({ codigo, so: codigo.split('.')[0], competencia, descripcion, programa: 'Ingeniería Informática', codigo_padre: null, peso: null });
const crit = (codigo: string, padre: string, peso: number, competencia: string, descripcion: string) =>
  ({ codigo, so: codigo.split('.')[0], competencia, descripcion, programa: 'Ingeniería Informática', codigo_padre: padre, peso });

// 2.1 tiene dos criterios que suman 0.7 (advertencia); 3.1 uno que suma 1.0
const CATALOGO = [
  ra('2.1', 'Diseño', 'Diseña soluciones'),
  crit('2.1.1', '2.1', 0.4, 'Diseño', 'Identifica requisitos'),
  crit('2.1.2', '2.1', 0.3, 'Modelado', 'Modela el sistema'),
  ra('3.1', 'Comunicación', 'Comunica resultados'),
  crit('3.1.1', '3.1', 1, 'Comunicación', 'Expone oralmente'),
];

// Fila de la tabla cuya primera celda es el código
const fila = (codigo: string) =>
  screen.getAllByRole('row').find((tr) => tr.querySelector('td')?.textContent?.trim() === codigo) as HTMLElement;
const celdas = (codigo: string) => Array.from(fila(codigo).querySelectorAll('td')).map((td) => td.textContent);
const conCatalogo = async (programa = 'Ingeniería Informática') => {
  await screen.findByRole('combobox', { name: 'Selecciona la carrera' });
  await screen.findByRole('option', { name: programa });
  await userEvent.setup().selectOptions(
    screen.getByRole('combobox', { name: 'Selecciona la carrera' }),
    programa,
  );
  await screen.findByText(/Diseña soluciones/);
};

describe('StudentOutcomesPage — listado', () => {
  beforeEach(() => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue(CATALOGO);
  });

  it('muestra cada RA seguido de sus criterios, con pesos y "(la del RA)"', async () => {
    render(<StudentOutcomesPage />);
    await conCatalogo();

    const codigos = screen.getAllByRole('row').slice(1).map((tr) => tr.querySelector('td')?.textContent?.trim());
    expect(codigos).toEqual(['2.1', '2.1.1', '2.1.2', '3.1', '3.1.1']);
    expect(celdas('2.1.1').slice(2, 5)).toEqual(['(la del RA)', 'Identifica requisitos', '0.4']);
    expect(celdas('2.1.2')[2]).toBe('Modelado');
  });

  it('el RA advierte si los pesos de sus criterios no suman 1.0', async () => {
    render(<StudentOutcomesPage />);
    await conCatalogo();

    expect(within(fila('2.1')).getByText('Pesos: 0.7/1.0').closest('[title]')?.getAttribute('title'))
      .toBe('Los pesos de sus criterios no suman 1.0');
    expect(within(fila('3.1')).getByText('Σ 1.0').getAttribute('title')).toBe('Los pesos de sus criterios suman 1.0');
  });

  it('con el catálogo vacío lo explica', async () => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
    render(<StudentOutcomesPage />);

    expect(await screen.findByText('Selecciona una carrera para ver sus Student Outcomes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agregar' }).hasAttribute('disabled')).toBe(true);
  });

  it('filtra los resultados y criterios según la carrera seleccionada', async () => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([
      ...CATALOGO,
      { ...ra('8.1', 'Gestión', 'Gestiona procesos'), programa: 'Ingeniería Biomédica' },
      { ...crit('8.1.1', '8.1', 1, 'Gestión', 'Analiza procesos'), programa: 'Ingeniería Biomédica' },
    ]);
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();

    expect(screen.getByText('Diseña soluciones')).toBeTruthy();
    expect(screen.queryByText('Gestiona procesos')).toBeNull();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Selecciona la carrera' }), 'Ingeniería Biomédica');

    expect(screen.getByText('Gestiona procesos')).toBeTruthy();
    expect(screen.getByText('Analiza procesos')).toBeTruthy();
    expect(screen.queryByText('Diseña soluciones')).toBeNull();
  });

  it('si falla la carga muestra el error', async () => {
    vi.mocked(catalogoRaAbetApi.list).mockRejectedValue({ response: { data: { detail: 'Sin conexión' } } });
    render(<StudentOutcomesPage />);

    expect(await screen.findByText('Sin conexión')).toBeTruthy();
  });
});

describe('StudentOutcomesPage — agregar', () => {
  beforeEach(() => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue(CATALOGO);
  });

  describe('StudentOutcomesPage — importar por carrera', () => {
    it('asigna la carrera seleccionada a todos los Student Outcomes del CSV', async () => {
      vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
      vi.mocked(catalogoRaAbetApi.importar).mockResolvedValue({ creados: 1, actualizados: 0 });
      const user = userEvent.setup();
      render(<StudentOutcomesPage />);

      await user.click(screen.getByRole('button', { name: 'Importar CSV' }));
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Colección de Student Outcomes' }),
        '__nueva_carrera__',
      );
      await user.type(screen.getByLabelText('Nombre de la nueva colección'), 'Ingeniería Industrial');

      const file = new File(
        ['Codigo,Competencia,Descripcion\n5.1,Optimización,Optimiza procesos\n'],
        'outcomes.csv',
        { type: 'text/csv' },
      );
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input, file);
      await screen.findByText('5.1');
      await user.click(screen.getByRole('button', { name: 'Importar' }));

      await waitFor(() => expect(catalogoRaAbetApi.importar).toHaveBeenCalledWith([
        expect.objectContaining({
          codigo: '5.1',
          programa: 'Ingeniería Industrial',
        }),
      ]));
    });

    it('lista las colecciones existentes en el selector de importación', async () => {
      vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([
        { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña', programa: 'Ingeniería Informática', codigo_padre: null, peso: null },
        { codigo: '4.1', so: '4', competencia: 'Ética', descripcion: 'Actúa con ética', programa: 'Ingeniería Industrial', codigo_padre: null, peso: null },
      ]);
      const user = userEvent.setup();
      render(<StudentOutcomesPage />);

      await user.click(screen.getByRole('button', { name: 'Importar CSV' }));

      const selector = screen.getByRole('combobox', { name: 'Colección de Student Outcomes' });
      expect(within(selector).getByRole('option', { name: 'Ingeniería Informática' })).toBeTruthy();
      expect(within(selector).getByRole('option', { name: 'Ingeniería Industrial' })).toBeTruthy();
    });

    it('permite crear el mismo código en una colección distinta', async () => {
      vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([
        { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones', programa: 'Ingeniería Informática', codigo_padre: null, peso: null },
      ]);
      vi.mocked(catalogoRaAbetApi.importar).mockResolvedValue({ creados: 1, actualizados: 0 });
      const user = userEvent.setup();
      render(<StudentOutcomesPage />);
      await conCatalogo();
      await user.click(screen.getByRole('button', { name: 'Importar CSV' }));
      const modal = within(screen.getByRole('dialog', { name: 'Importar Student Outcomes desde CSV' }));
      await user.selectOptions(
        modal.getByRole('combobox', { name: 'Colección de Student Outcomes' }),
        '__nueva_carrera__',
      );
      await user.type(modal.getByLabelText('Nombre de la nueva colección'), 'Ingeniería Industrial');
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(
        input,
        new File(['Codigo,Competencia,Descripcion\n2.1,Diseño,Otro resultado\n'], 'outcomes.csv', { type: 'text/csv' }),
      );
      await modal.findByText('Vista previa: 1 nuevo, 0 actualizan');

      await user.click(modal.getByRole('button', { name: 'Importar' }));

      await waitFor(() => expect(catalogoRaAbetApi.importar).toHaveBeenCalledWith([
        expect.objectContaining({
          codigo: '2.1',
          programa: 'Ingeniería Industrial',
          descripcion: 'Otro resultado',
        }),
      ]));
      expect(await screen.findByText('Importación completa: 1 nuevo(s), 0 actualizado(s).')).toBeTruthy();
    });
  });

  const abrirMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /agregar/i }));
    return screen.getByRole('menu');
  };

  it('requiere seleccionar una carrera antes de agregar resultados', async () => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue([]);
    render(<StudentOutcomesPage />);
    expect(await screen.findByText('Selecciona una carrera para ver sus Student Outcomes.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /agregar/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('un RA nuevo valida código, descripción y competencia', async () => {
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    await user.click(within(await abrirMenu(user)).getByRole('menuitem', { name: /resultado de aprendizaje/i }));

    // Mientras se agrega, "Agregar" queda deshabilitado
    expect((screen.getByRole('button', { name: /agregar/i }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Código y descripción son obligatorios.')).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: 'Código' }), '4.1');
    await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Trabaja en equipo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('La competencia es obligatoria en un Resultado de Aprendizaje.')).toBeTruthy();
    expect(catalogoRaAbetApi.create).not.toHaveBeenCalled();
  });

  it('guardar un RA nuevo lo crea, recarga y muestra el mensaje', async () => {
    vi.mocked(catalogoRaAbetApi.create).mockResolvedValue(ra('4.1', 'Equipo', 'Trabaja en equipo'));
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    await user.click(within(await abrirMenu(user)).getByRole('menuitem', { name: /resultado de aprendizaje/i }));

    const codigo = screen.getByRole('textbox', { name: 'Código' });
    expect(document.activeElement).toBe(codigo);
    await user.type(codigo, ' 4.1 ');
    expect(screen.getByRole('textbox', { name: 'SO' }).getAttribute('placeholder')).toBe('4');
    await user.type(screen.getByRole('textbox', { name: 'Competencia' }), 'Equipo');
    await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Trabaja en equipo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('"4.1" agregado.')).toBeTruthy();
    expect(catalogoRaAbetApi.create).toHaveBeenCalledWith({
      codigo: '4.1', descripcion: 'Trabaja en equipo', programa: 'Ingeniería Informática', so: undefined, competencia: 'Equipo',
    });
    expect(catalogoRaAbetApi.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('textbox', { name: 'Código' })).toBeNull();
  });

  it('un criterio nuevo usa el primer RA como padre, convierte el peso y hereda la competencia', async () => {
    vi.mocked(catalogoRaAbetApi.create).mockResolvedValue(crit('3.1.2', '3.1', 0.25, 'Comunicación', 'Escribe'));
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    await user.click(within(await abrirMenu(user)).getByRole('menuitem', { name: /criterio de evaluación/i }));

    const padre = screen.getByRole('combobox', { name: 'RA padre' }) as HTMLSelectElement;
    expect(padre.value).toBe('2.1');
    expect(screen.getByRole('textbox', { name: 'Competencia' }).getAttribute('placeholder')).toBe('Diseño');
    await user.selectOptions(padre, '3.1');
    expect(screen.getByRole('textbox', { name: 'Competencia' }).getAttribute('placeholder')).toBe('Comunicación');

    await user.type(screen.getByRole('textbox', { name: 'Código' }), '3.1.2');
    await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Escribe');
    await user.type(screen.getByRole('textbox', { name: 'Peso' }), '40');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText(/^Peso: el peso "40" debe estar entre 0 y 1/)).toBeTruthy();

    await user.clear(screen.getByRole('textbox', { name: 'Peso' }));
    await user.type(screen.getByRole('textbox', { name: 'Peso' }), '25%');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('"3.1.2" agregado.')).toBeTruthy();
    expect(catalogoRaAbetApi.create).toHaveBeenCalledWith({
      codigo: '3.1.2', descripcion: 'Escribe', programa: 'Ingeniería Informática', so: undefined,
      codigo_padre: '3.1', peso: 0.25,
    });
  });

  it('si guardar falla, muestra el detalle del backend y la fila sigue en edición', async () => {
    vi.mocked(catalogoRaAbetApi.create).mockRejectedValue({ response: { data: { detail: "El código '4.1' ya existe" } } });
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    await user.click(within(await abrirMenu(user)).getByRole('menuitem', { name: /resultado de aprendizaje/i }));
    await user.type(screen.getByRole('textbox', { name: 'Código' }), '4.1');
    await user.type(screen.getByRole('textbox', { name: 'Competencia' }), 'Equipo');
    await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Trabaja en equipo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText("El código '4.1' ya existe")).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Código' })).toBeTruthy();
  });
});

describe('StudentOutcomesPage — editar', () => {
  beforeEach(() => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue(CATALOGO);
  });

  it('editar un criterio lo precarga en su lugar, sin código editable, y deduce el SO si se vacía', async () => {
    vi.mocked(catalogoRaAbetApi.update).mockResolvedValue(crit('2.1.2', '2.1', 0.6, 'Modelado', 'Modela el sistema'));
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();

    await user.click(screen.getByRole('button', { name: 'Editar 2.1.2' }));

    // La fila editada queda en la posición del criterio
    const filas = screen.getAllByRole('row').slice(1);
    expect(filas[2].querySelector('input[aria-label="Peso"]')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Código' })).toBeNull();
    expect(within(filas[2]).getByText('2.1.2')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Peso' }) as HTMLInputElement).value).toBe('0.3');

    await user.clear(screen.getByRole('textbox', { name: 'SO' }));
    await user.clear(screen.getByRole('textbox', { name: 'Peso' }));
    await user.type(screen.getByRole('textbox', { name: 'Peso' }), '0,6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('"2.1.2" actualizado.')).toBeTruthy();
    expect(catalogoRaAbetApi.update).toHaveBeenCalledWith('2.1.2', 'Ingeniería Informática', {
      descripcion: 'Modela el sistema', programa: 'Ingeniería Informática', so: '2', competencia: 'Modelado',
      codigo_padre: '2.1', peso: 0.6,
    });
  });

  it('"Cancelar" descarta la edición', async () => {
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();

    await user.click(screen.getByRole('button', { name: 'Editar 2.1' }));
    await user.clear(screen.getByRole('textbox', { name: 'Descripción' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('textbox', { name: 'Descripción' })).toBeNull();
    expect(screen.getByText('Diseña soluciones')).toBeTruthy();
    expect(catalogoRaAbetApi.update).not.toHaveBeenCalled();
  });
});

describe('StudentOutcomesPage — importar CSV', () => {
  beforeEach(() => {
    vi.mocked(catalogoRaAbetApi.list).mockResolvedValue(CATALOGO);
  });

  const CSV = [
    'Codigo,Competencia,Descripcion,CodigoPadre,Peso',
    '2.1,Diseño,Diseña soluciones nuevas,,',
    '2.1.3,,Valida el diseño,2.1,0.3',
    '5.1,Ética,Actúa con ética,,',
    '5.1.1,,Reconoce dilemas,5.1,100%',
  ].join('\n');
  const archivo = (contenido: string, nombre = 'catalogo.csv') => new File([contenido], nombre, { type: 'text/csv' });
  const abrirImportar = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /importar csv/i }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Colección de Student Outcomes' }),
      'Ingeniería Informática',
    );
    return within(screen.getByRole('dialog', { name: 'Importar Student Outcomes desde CSV' }));
  };
  const inputArchivo = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it('sin archivo pide uno y "Importar" está deshabilitado', async () => {
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    const d = await abrirImportar(user);

    expect(d.getByText('Arrastra un CSV aquí o haz clic para seleccionar')).toBeTruthy();
    expect((d.getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(inputArchivo().getAttribute('accept')).toBe('.csv');
  });

  it('la vista previa cuenta nuevos y actualizados y los agrupa por RA con sus pesos finales', async () => {
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    const d = await abrirImportar(user);

    await user.upload(inputArchivo(), archivo(CSV));

    expect(await d.findByText('Vista previa: 3 nuevos, 1 actualiza')).toBeTruthy();
    expect(d.getByText('catalogo.csv')).toBeTruthy();
    // 2.1 ya existe: 2.1.3 (0.3) + los existentes que no se tocan (0.4 + 0.3) = 1.0
    const grupo21 = d.getByText('Diseña soluciones nuevas').closest('div') as HTMLElement;
    expect(within(grupo21).getByText('Σ 1.0')).toBeTruthy();
    expect(within(grupo21).getByText('actualiza')).toBeTruthy();
    const grupo51 = d.getByText('Actúa con ética').closest('div') as HTMLElement;
    expect(within(grupo51).getByText('nuevo')).toBeTruthy();
    expect(d.getByText(/Los códigos marcados "actualiza" ya existen/)).toBeTruthy();
  });

  it('un CSV inválido muestra el error y no permite importar', async () => {
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    const d = await abrirImportar(user);

    await user.upload(inputArchivo(), archivo(''));

    expect(await d.findByText('El archivo está vacío.')).toBeTruthy();
    expect((d.getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('importar envía los items, recarga, muestra el resumen y cierra; al reabrir está vacío', async () => {
    vi.mocked(catalogoRaAbetApi.importar).mockResolvedValue({ creados: 3, actualizados: 1 } as never);
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    const d = await abrirImportar(user);
    await user.upload(inputArchivo(), archivo(CSV));
    await d.findByText('Vista previa: 3 nuevos, 1 actualiza');

    await user.click(d.getByRole('button', { name: 'Importar' }));

    expect(await screen.findByText('Importación completa: 3 nuevo(s), 1 actualizado(s).')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(catalogoRaAbetApi.importar).toHaveBeenCalledWith([
      { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones nuevas', programa: 'Ingeniería Informática' },
      { codigo: '2.1.3', so: '2', competencia: 'Diseño', descripcion: 'Valida el diseño', programa: 'Ingeniería Informática', codigo_padre: '2.1', peso: 0.3 },
      { codigo: '5.1', so: '5', competencia: 'Ética', descripcion: 'Actúa con ética', programa: 'Ingeniería Informática' },
      { codigo: '5.1.1', so: '5', competencia: 'Ética', descripcion: 'Reconoce dilemas', programa: 'Ingeniería Informática', codigo_padre: '5.1', peso: 1 },
    ]);
    expect(catalogoRaAbetApi.list).toHaveBeenCalledTimes(2);

    const reabierto = await abrirImportar(user);
    expect(reabierto.getByText('Arrastra un CSV aquí o haz clic para seleccionar')).toBeTruthy();
    expect(inputArchivo().value).toBe('');
  });

  it('si importar falla, el error queda en el modal', async () => {
    vi.mocked(catalogoRaAbetApi.importar).mockRejectedValue({ response: { data: { detail: 'Código duplicado: 2.1' } } });
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    const d = await abrirImportar(user);
    await user.upload(inputArchivo(), archivo(CSV));
    await d.findByText('Vista previa: 3 nuevos, 1 actualiza');

    await user.click(d.getByRole('button', { name: 'Importar' }));

    expect(await d.findByText('Código duplicado: 2.1')).toBeTruthy();
  });

  it('también acepta el archivo arrastrado al área', async () => {
    const user = userEvent.setup();
    render(<StudentOutcomesPage />);
    await conCatalogo();
    const d = await abrirImportar(user);

    const area = d.getByText('Arrastra un CSV aquí o haz clic para seleccionar').parentElement!;
    fireEvent.drop(area, { dataTransfer: { files: [archivo(CSV, 'arrastrado.csv')] } });

    expect(await d.findByText('Vista previa: 3 nuevos, 1 actualiza')).toBeTruthy();
    expect(d.getByText('arrastrado.csv')).toBeTruthy();
  });
});
