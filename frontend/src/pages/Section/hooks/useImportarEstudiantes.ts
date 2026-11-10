import { useRef, useState } from 'react';

import { EstudianteOmitido, estudiantesApi } from '../../../api/estudiantes';
import { apiErrorMessage } from '../../../api/errors';
import { Estudiante } from '../../../types';
import { FilaVistaPrevia } from '../components/ImportStudentsModal';

// Estado y acciones del modal "Importar estudiantes desde CSV o Excel" de una sección.
// sid y onImportados llegan en cada render (no se memorizan), así que siempre son los
// actuales; previewSeq vive junto a previewArchivo para descartar vistas previas viejas.
export function useImportarEstudiantes(sid: number, onImportados: (lista: Estudiante[]) => void) {
  const [csvModal, setCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<FilaVistaPrevia[]>([]);
  // Filas que la importación saltará por código repetido (en la sección o en el archivo)
  const [csvOmitidos, setCsvOmitidos] = useState<EstudianteOmitido[]>([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // La vista previa (CSV y Excel) la calcula el backend con la misma lectura que la
  // importación: muestra el nombre ya combinado con los apellidos, y los avisos
  // (correo no válido, Grupo distinto de la sección) se ven antes de importar
  const previewSeq = useRef(0);

  const previewArchivo = async (file: File) => {
    const seq = ++previewSeq.current;
    try {
      const { estudiantes: filas, errores, omitidos = [] } = await estudiantesApi.vistaPrevia(sid, file);
      if (seq !== previewSeq.current) return;
      setCsvPreview(filas);
      setCsvOmitidos(omitidos);
      if (errores.length > 0) setCsvError(errores.join(' · '));
    } catch (e: any) {
      if (seq === previewSeq.current) setCsvError(apiErrorMessage(e, 'No se pudo leer el archivo'));
    }
  };

  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setCsvPreview([]);
    setCsvOmitidos([]);
    setCsvError('');
    previewArchivo(file);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    setCsvError('');
    try {
      const result = await estudiantesApi.importCsv(sid, csvFile);
      onImportados(await estudiantesApi.list(sid));
      // Si hubo omitidos por código repetido, uno de los avisos lo dice con la cantidad
      if (result.errores.length > 0) {
        setCsvError(`Importados: ${result.importados}. ${result.errores.join(' · ')}`);
        return;
      }
      setCsvModal(false);
      setCsvFile(null);
      setCsvPreview([]);
      setCsvOmitidos([]);
    } catch (e: any) {
      setCsvError(apiErrorMessage(e, 'Error al importar el archivo'));
    } finally {
      setCsvLoading(false);
    }
  };

  return {
    csvModal,
    setCsvModal,
    csvFile,
    csvPreview,
    csvOmitidos,
    csvLoading,
    csvError,
    fileRef,
    handleCsvSelect,
    handleCsvImport,
  };
}
