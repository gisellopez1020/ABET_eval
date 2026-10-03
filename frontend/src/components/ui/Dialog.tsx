import { ReactNode, useEffect, useRef } from 'react';

// Diálogo modal accesible sin estilos propios: el contenedor y el panel usan las clases que
// recibe, así cada modal conserva su aspecto. Se encarga de la semántica (role, aria-modal,
// aria-labelledby), de atrapar el foco con Tab/Shift+Tab, de llevar el foco al abrir y
// devolverlo al cerrar, y de Esc. Modal.tsx es este componente más el encabezado estándar.

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** id del título del diálogo (lo pone el consumidor en su propio encabezado). */
  labelledBy: string;
  overlayClassName: string;
  panelClassName: string;
  /** Si se indica, se renderiza un fondo aparte (decorativo) dentro del contenedor. */
  backdropClassName?: string;
  /** Clic en el fondo cierra el diálogo (solo con backdropClassName). */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

const getFocusable = (panel: HTMLElement) =>
  Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // checkVisibility descarta los ocultos (p. ej. el <input type="file" class="hidden"> de los
    // imports); donde no existe (jsdom) se consideran visibles
    (el) => el.tabIndex >= 0 && (el.checkVisibility?.() ?? true)
  );

// Diálogos abiertos, el último es el de arriba: solo ese responde a Tab y Esc
const stack: object[] = [];

export function Dialog({
  open,
  onClose,
  labelledBy,
  overlayClassName,
  panelClassName,
  backdropClassName,
  closeOnBackdrop = false,
  closeOnEscape = true,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose suele ser una función nueva en cada render: con refs el efecto no se reinicia
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;

  // Elemento que tenía el foco antes de abrir. Se lee en el render, antes de que el commit
  // aplique un autoFocus dentro del panel (que ya habría movido el foco cuando corre el efecto)
  const openerRef = useRef<HTMLElement | null>(null);
  if (!open) {
    openerRef.current = null;
  } else if (openerRef.current === null && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const token = {};
    stack.push(token);
    // Se copia aquí: al cerrar, el render con open=false limpia openerRef antes de esta limpieza
    const opener = openerRef.current;

    // Foco inicial: se respeta un autoFocus del contenido; si no, el primer enfocable o el panel
    if (!panel.contains(document.activeElement)) {
      (getFocusable(panel)[0] ?? panel).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        if (closeOnEscapeRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = getFocusable(panel);
      const active = document.activeElement;
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // Foco fuera del panel (p. ej. en <body> porque el botón enfocado se deshabilitó)
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      // Se devuelve el foco solo si quien abrió sigue en la página (no si se navegó a otra)
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={overlayClassName}>
      {backdropClassName && (
        <div
          className={backdropClassName}
          aria-hidden="true"
          onClick={closeOnBackdrop ? onClose : undefined}
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
}
