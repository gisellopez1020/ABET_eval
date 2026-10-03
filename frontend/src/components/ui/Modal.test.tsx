// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode, useState } from 'react';

import { Modal } from './Modal';
import { Dialog } from './Dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as any).checkVisibility;
});

/** Página mínima: un botón fuera abre el modal; otro botón fuera sirve para comprobar que Tab no escapa. */
function Pagina({ children, onCloseExtra }: { children?: ReactNode; onCloseExtra?: () => void }) {
  const [open, setOpen] = useState(false);
  const cerrar = () => {
    setOpen(false);
    onCloseExtra?.();
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      <button type="button">Fuera</button>
      <Modal open={open} onClose={cerrar} title="Editar">
        {children ?? (
          <>
            <input aria-label="Nombre" />
            <button type="button" onClick={cerrar}>Aceptar</button>
          </>
        )}
      </Modal>
    </>
  );
}

describe('Modal — foco atrapado', () => {
  it('al abrir, el foco entra al primer elemento enfocable del diálogo', async () => {
    const user = userEvent.setup();
    render(<Pagina />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  });

  it('Tab y Shift+Tab dan la vuelta dentro del diálogo sin llegar a lo que hay detrás', async () => {
    const user = userEvent.setup();
    render(<Pagina />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    const cerrarX = screen.getByRole('button', { name: 'Cerrar diálogo' });
    const nombre = screen.getByRole('textbox', { name: 'Nombre' });
    const aceptar = screen.getByRole('button', { name: 'Aceptar' });
    const fuera = screen.getByRole('button', { name: 'Fuera' });

    // Hacia adelante: X → Nombre → Aceptar → (vuelta) X
    const recorrido: Element[] = [];
    for (let i = 0; i < 6; i++) {
      await user.tab();
      recorrido.push(document.activeElement!);
    }
    expect(recorrido).toEqual([nombre, aceptar, cerrarX, nombre, aceptar, cerrarX]);

    // Hacia atrás desde X: (vuelta) Aceptar → Nombre → X
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(aceptar);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(nombre);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(cerrarX);

    expect(recorrido).not.toContain(fuera);
    expect(recorrido).not.toContain(screen.getByRole('button', { name: 'Abrir' }));
  });

  it('respeta un autoFocus del contenido en vez de mover el foco a la X', async () => {
    const user = userEvent.setup();
    render(
      <Pagina>
        <input aria-label="Nombre" autoFocus />
      </Pagina>
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Nombre' }));
  });

  it('ignora los enfocables ocultos (p. ej. el input de archivo con class="hidden")', async () => {
    // jsdom no implementa checkVisibility ni carga Tailwind: se simula lo que hace el navegador
    (HTMLElement.prototype as any).checkVisibility = function (this: HTMLElement) {
      return !this.classList.contains('hidden');
    };
    const user = userEvent.setup();
    render(
      <Pagina>
        <button type="button">Importar</button>
        <input type="file" aria-label="Archivo" className="hidden" />
      </Pagina>
    );
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.tab(); // X → Importar
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Importar' }));
    await user.tab(); // Importar es el último visible: vuelve a la X
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  });

  it('si el foco quedó fuera del panel (p. ej. en <body>), Tab lo devuelve al diálogo', async () => {
    const user = userEvent.setup();
    render(<Pagina />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar diálogo' }));
  });

  it('sin enfocables, el foco va al panel del diálogo', async () => {
    const user = userEvent.setup();
    function SinEnfocables() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Abrir</button>
          <Dialog open={open} onClose={() => setOpen(false)} labelledBy="t" overlayClassName="" panelClassName="">
            <p id="t">Solo texto</p>
          </Dialog>
        </>
      );
    }
    render(<SinEnfocables />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Solo texto' }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Solo texto' }));
  });
});

describe('Modal — devolución del foco al cerrar', () => {
  it.each([
    ['un botón del diálogo', async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('button', { name: 'Aceptar' }))],
    ['la X', async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('button', { name: 'Cerrar diálogo' }))],
    ['Esc', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['el fondo', async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(document.querySelector('[aria-hidden="true"]') as HTMLElement)],
  ])('al cerrar con %s, el foco vuelve al botón que lo abrió', async (_, cerrar) => {
    const user = userEvent.setup();
    render(<Pagina />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });

    await user.click(abrir);
    await user.tab(); // el foco se mueve dentro del diálogo antes de cerrar
    await cerrar(user);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('si el botón que lo abrió ya no existe (se navegó), no falla y no devuelve el foco', async () => {
    const user = userEvent.setup();
    function AbreYDesaparece() {
      const [open, setOpen] = useState(false);
      const [mostrarAbrir, setMostrarAbrir] = useState(true);
      return (
        <>
          {mostrarAbrir && <button type="button" onClick={() => setOpen(true)}>Abrir</button>}
          <Modal open={open} onClose={() => setOpen(false)} title="Detalle">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMostrarAbrir(false);
              }}
            >
              Evaluar
            </button>
          </Modal>
        </>
      );
    }
    render(<AbreYDesaparece />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Evaluar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Modal — diálogos apilados', () => {
  it('solo el diálogo de arriba responde a Esc y atrapa el Tab', async () => {
    const user = userEvent.setup();
    const cerrarAbajo = vi.fn();
    const cerrarArriba = vi.fn();
    render(
      <>
        <Modal open onClose={cerrarAbajo} title="Abajo">
          <button type="button">Botón de abajo</button>
        </Modal>
        <Modal open onClose={cerrarArriba} title="Arriba">
          <button type="button">Botón de arriba</button>
        </Modal>
      </>
    );

    const arriba = screen.getByRole('dialog', { name: 'Arriba' });
    expect(arriba.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(arriba.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard('{Escape}');
    expect(cerrarArriba).toHaveBeenCalledTimes(1);
    expect(cerrarAbajo).not.toHaveBeenCalled();
  });
});
