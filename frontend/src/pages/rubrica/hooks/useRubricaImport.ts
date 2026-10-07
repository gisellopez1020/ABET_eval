import { useRef, useState } from 'react';

import { criteriosApi } from '../../../api/criterios';
import { apiErrorMessage } from '../../../api/errors';
import { RaAbet } from '../../../types';
import { round2 } from '../rubricaDraft';
import { decodeCsvBytes, parseRubricaCsv, RubricaCsvAspecto } from '../rubricaCsv';

// Estado y acciones del modal de import (CSV o Excel) de RubricaPage. catalogo,
// selectedActividadId y dirty llegan en cada render (no se memorizan), así que los
// handlers siempre usan los valores actuales; excelSeq vive junto a handleExcelSelect y
// closeCsvModal para descartar lecturas de Excel viejas. onApply reemplaza el borrador:
// el borrador y su `dirty` siguen siendo de la página.
export function useRubricaImport(
  catalogo: RaAbet[],
  selectedActividadId: number | null,
  dirty: boolean,
  onApply: (aspectos: RubricaCsvAspecto[]) => void,
) {
  const [csvModal, setCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<RubricaCsvAspecto[]>([]);
  const [csvError, setCsvError] = useState('');
  // El modal de import sirve para CSV (parseo en el navegador) y Excel (lo lee el backend)
  const [importFormato, setImportFormato] = useState<'csv' | 'excel'>('csv');
  const [excelLoading, setExcelLoading] = useState(false);
  // Importar con cambios sin guardar: el aviso se muestra dentro del modal de import
  // (un segundo modal encima compartiría el Esc y cerraría los dos)
  const [csvConfirmDiscard, setCsvConfirmDiscard] = useState(false);
  const excelSeq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Importar CSV (solo rellena el borrador; se guarda con "Guardar rúbrica") ──
  const closeCsvModal = () => {
    excelSeq.current++;
    setExcelLoading(false);
    setCsvModal(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvError('');
    setCsvConfirmDiscard(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setCsvPreview([]);
    setCsvError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      // Con el catálogo se validan en el cliente los códigos ABET (el backend vuelve a validar)
      const result = parseRubricaCsv(decodeCsvBytes(e.target?.result as ArrayBuffer), catalogo);
      if (result.ok) {
        setCsvPreview(result.aspectos);
      } else {
        setCsvError(result.error);
      }
    };
    reader.onerror = () => setCsvError('No se pudo leer el archivo.');
    reader.readAsArrayBuffer(file);
  };

  const openImportModal = (formato: 'csv' | 'excel') => {
    setImportFormato(formato);
    setCsvModal(true);
  };

  // Excel: el backend lo parsea (excel_parser.py) y devuelve la vista previa sin guardar
  const handleExcelSelect = async (file: File) => {
    if (!selectedActividadId) return;
    const seq = ++excelSeq.current;
    setCsvFile(file);
    setCsvPreview([]);
    setCsvError('');
    setExcelLoading(true);
    try {
      const preview = await criteriosApi.importarExcel(selectedActividadId, file);
      if (seq !== excelSeq.current) return;
      setCsvPreview(
        preview.aspectos.map((a) => ({
          nombre: a.nombre,
          // El formato Excel no trae CodigoABET: se vincula después en la pantalla
          codigo_abet: null,
          criterios: a.criterios.map((c) => ({ texto: c.texto, peso: Number(c.peso_porcentaje) })),
        }))
      );
    } catch (e) {
      if (seq === excelSeq.current) setCsvError(apiErrorMessage(e, 'No se pudo leer el archivo Excel.'));
    } finally {
      if (seq === excelSeq.current) setExcelLoading(false);
    }
  };

  const handleFileSelect = (file: File) => {
    // Otro archivo: el aviso de descarte vuelve a pedirse al importar
    setCsvConfirmDiscard(false);
    return importFormato === 'excel' ? handleExcelSelect(file) : handleCsvSelect(file);
  };

  const handleCsvImport = () => {
    if (csvPreview.length === 0) return;
    if (dirty && !csvConfirmDiscard) {
      setCsvConfirmDiscard(true);
      return;
    }
    onApply(csvPreview);
    closeCsvModal();
  };

  const csvTotal = round2(
    csvPreview.reduce((sum, a) => sum + a.criterios.reduce((acc, c) => acc + c.peso, 0), 0)
  );
  const csvCriterios = csvPreview.reduce((sum, a) => sum + a.criterios.length, 0);

  return {
    csvModal,
    importFormato,
    csvFile,
    fileRef,
    csvPreview,
    csvCriterios,
    csvTotal,
    excelLoading,
    csvError,
    csvConfirmDiscard,
    setCsvConfirmDiscard,
    closeCsvModal,
    openImportModal,
    handleFileSelect,
    handleCsvImport,
  };
}
