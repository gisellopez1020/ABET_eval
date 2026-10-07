import { useMemo, useRef, useState } from 'react';

import { catalogoRaAbetApi, RaAbetImportResultado } from '../../../api/catalogo';
import { apiErrorMessage } from '../../../api/errors';
import { RaAbet } from '../../../types';
import { decodeCsvBytes } from '../../../utils/csv';
import { parseRaAbetCsv, RaAbetCsvItem } from '../raAbetCsv';

// Estado y acciones del modal "Importar Student Outcomes desde CSV". El catálogo y
// onImportado (recargar, avisar y salir de la edición) llegan en cada render: no se
// memorizan, así que siempre son los actuales.
export function useImportarRaAbet(
  catalogo: RaAbet[],
  porCodigo: Map<string, RaAbet>,
  hijosPorPadre: Map<string, RaAbet[]>,
  onImportado: (result: RaAbetImportResultado) => Promise<void>,
) {
  const [csvModal, setCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<RaAbetCsvItem[]>([]);
  const [csvError, setCsvError] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const closeCsvModal = () => {
    setCsvModal(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setCsvPreview([]);
    setCsvError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      // Se valida contra el catálogo actual: padres existentes y que nadie cambie de nivel
      const result = parseRaAbetCsv(decodeCsvBytes(e.target?.result as ArrayBuffer), catalogo);
      if (result.ok) {
        setCsvPreview(result.items);
      } else {
        setCsvError(result.error);
      }
    };
    reader.onerror = () => setCsvError('No se pudo leer el archivo.');
    reader.readAsArrayBuffer(file);
  };

  /** Vista previa agrupada por RA (del archivo o ya existente), con los pesos finales tras importar. */
  const previewGrupos = useMemo(() => {
    const enArchivo = new Map(csvPreview.map((item) => [item.codigo, item]));
    const orden: string[] = [];
    for (const item of csvPreview) {
      const ra = item.codigo_padre ?? item.codigo;
      if (!orden.includes(ra)) orden.push(ra);
    }
    return orden.map((codigoRa) => {
      const delArchivo = enArchivo.get(codigoRa);
      const existente = porCodigo.get(codigoRa);
      const criterios = csvPreview.filter((item) => item.codigo_padre === codigoRa);
      // Pesos tras importar: los del archivo + los Criterios existentes de ese RA que el archivo no toca
      const pesosFinales = [
        ...criterios.map((c) => c.peso ?? 0),
        ...(hijosPorPadre.get(codigoRa) ?? []).filter((c) => !enArchivo.has(c.codigo)).map((c) => c.peso ?? 0),
      ];
      return {
        codigo: codigoRa,
        descripcion: delArchivo?.descripcion ?? existente?.descripcion ?? '',
        estado: delArchivo ? (existente ? 'actualiza' : 'nuevo') : 'existente',
        criterios,
        pesosFinales,
      } as const;
    });
  }, [csvPreview, porCodigo, hijosPorPadre]);

  const previewActualiza = csvPreview.filter((item) => porCodigo.has(item.codigo)).length;
  const previewNuevos = csvPreview.length - previewActualiza;

  const handleCsvImport = async () => {
    if (csvPreview.length === 0) return;
    setCsvLoading(true);
    setCsvError('');
    try {
      const result = await catalogoRaAbetApi.importar(
        csvPreview.map((item) => ({
          codigo: item.codigo,
          so: item.so,
          competencia: item.competencia,
          descripcion: item.descripcion,
          ...(item.codigo_padre !== null ? { codigo_padre: item.codigo_padre, peso: item.peso ?? undefined } : {}),
        }))
      );
      await onImportado(result);
      closeCsvModal();
    } catch (err) {
      setCsvError(apiErrorMessage(err, 'No se pudo importar el catálogo.'));
    } finally {
      setCsvLoading(false);
    }
  };

  return {
    csvModal,
    setCsvModal,
    csvFile,
    csvPreview,
    csvError,
    csvLoading,
    fileRef,
    closeCsvModal,
    handleCsvSelect,
    previewGrupos,
    previewActualiza,
    previewNuevos,
    handleCsvImport,
  };
}
