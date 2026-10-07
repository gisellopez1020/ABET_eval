import { ReactNode, RefObject, useRef } from 'react';

interface FileDropZoneProps {
  /** Nombre del archivo elegido; sin archivo se muestra `placeholder`. */
  fileName?: string | null;
  placeholder: string;
  accept: string;
  onFile: (file: File) => void;
  /**
   * Para que la pantalla limpie el input al cerrar su modal (fileRef.current.value = '').
   * Si no se pasa, el componente usa su propia ref.
   */
  inputRef?: RefObject<HTMLInputElement>;
  /** Explicación del formato, debajo del nombre (cada pantalla trae la suya). */
  children?: ReactNode;
}

// Área para arrastrar un archivo o hacer clic y elegirlo. La comparten los imports de
// estudiantes (SectionPage), rúbrica (RubricaPage) y Student Outcomes (StudentOutcomesPage)
export function FileDropZone({ fileName, placeholder, accept, onFile, inputRef, children }: FileDropZoneProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-uao-mid transition-colors"
      onClick={() => ref.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <p className="text-sm text-gray-500">
        {fileName ? fileName : placeholder}
      </p>
      {children}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}
