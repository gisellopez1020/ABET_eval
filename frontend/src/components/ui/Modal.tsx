import { ReactNode, useId } from 'react';

import { Dialog } from './Dialog';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Obligatorio: es el nombre accesible del diálogo (aria-labelledby). */
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4"
      backdropClassName="absolute inset-0 bg-black/50"
      closeOnBackdrop
      panelClassName={`relative bg-white rounded-xl shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}
    >
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id={titleId} className="text-lg font-semibold text-uao-dark">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar diálogo"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </Dialog>
  );
}
