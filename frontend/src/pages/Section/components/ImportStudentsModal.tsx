import { RefObject } from 'react';

import { EstudianteOmitido } from '../../../api/estudiantes';
import { Button } from '../../../components/ui/Button';
import { FileDropZone } from '../../../components/ui/FileDropZone';
import { Modal } from '../../../components/ui/Modal';

export interface FilaVistaPrevia {
  nombre: string;
  codigo: string;
  email?: string | null;
}

interface ImportStudentsModalProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  onFile: (file: File) => void;
  fileRef: RefObject<HTMLInputElement>;
  preview: FilaVistaPrevia[];
  /** Filas que no se importarán por código repetido (vacío si no hay). */
  omitidos?: EstudianteOmitido[];
  error: string;
  loading: boolean;
  onImport: () => void;
}

// Por qué se omite una fila y, si el nombre no coincide, cuál se conserva
export function motivoOmitido(o: EstudianteOmitido): string {
  const otroNombre = o.nombre_conservado !== o.nombre;
  if (o.motivo === 'en_seccion') {
    return otroNombre
      ? `ya está en la sección como ${o.nombre_conservado}; se conserva ese`
      : 'ya está en la sección';
  }
  return otroNombre
    ? `repite el código de la fila ${o.fila_conservada} (${o.nombre_conservado}); se conserva esa`
    : `repite el código de la fila ${o.fila_conservada}`;
}

// Importar estudiantes desde CSV o Excel: la vista previa la calcula el backend
export function ImportStudentsModal({
  open,
  onClose,
  file,
  onFile,
  fileRef,
  preview,
  omitidos = [],
  error,
  loading,
  onImport,
}: ImportStudentsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Importar estudiantes desde CSV o Excel">
      <div className="space-y-4">
        <FileDropZone
          fileName={file?.name}
          placeholder="Arrastra un CSV o Excel (.xlsx) aquí o haz clic para seleccionar"
          accept=".csv,.xlsx"
          onFile={onFile}
          inputRef={fileRef}
        >
          <p className="text-xs text-gray-400 mt-1">
            Formato: columnas Nombre y Codigo (o Código), con encabezado. En Excel, en la primera hoja.
            Opcional: una columna Email (o Correo). También sirve la lista institucional: Nombre,
            Apellido(s), Número de ID, Dirección de correo y Grupo (la que descarga "Exportar Excel").
          </p>
        </FileDropZone>

        {preview.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Vista previa ({preview.length} estudiante{preview.length !== 1 ? 's' : ''})
              {omitidos.length > 0 && (
                <span className="font-normal text-gray-500">
                  {' '}· {omitidos.length} se omitirá{omitidos.length !== 1 ? 'n' : ''} por código repetido
                </span>
              )}
            </p>
            <div className="max-h-40 overflow-y-auto border rounded-lg divide-y text-xs">
              {preview.map((r, i) => (
                <div key={i} className="flex gap-4 px-3 py-2">
                  <span className="font-medium">{r.nombre}</span>
                  <span className="text-gray-500">{r.codigo}</span>
                  {r.email && <span className="text-gray-500">{r.email}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {omitidos.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              No se importará{omitidos.length !== 1 ? 'n' : ''} ({omitidos.length}, código repetido)
            </p>
            <div className="max-h-32 overflow-y-auto border rounded-lg divide-y text-xs bg-gray-50">
              {omitidos.map((o) => (
                <div key={o.fila} className="flex flex-wrap gap-x-4 px-3 py-2 text-gray-500">
                  <span>Fila {o.fila}</span>
                  <span className="font-medium line-through">{o.nombre}</span>
                  <span>{o.codigo}</span>
                  <span>{motivoOmitido(o)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-uao-accent">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={onImport} loading={loading} disabled={!file}>
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
