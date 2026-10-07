import { Dispatch, RefObject, SetStateAction } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { FileDropZone } from '../../../components/ui/FileDropZone';
import { Modal } from '../../../components/ui/Modal';
import { buildCodeName, round2 } from '../rubricaDraft';
import { RubricaCsvAspecto } from '../rubricaCsv';

interface ImportRubricaModalProps {
  csvModal: boolean;
  closeCsvModal: () => void;
  importFormato: 'csv' | 'excel';
  csvFile: File | null;
  fileRef: RefObject<HTMLInputElement>;
  handleFileSelect: (file: File) => void;
  csvPreview: RubricaCsvAspecto[];
  csvCriterios: number;
  csvTotal: number;
  descripcionAbet: (codigo: string | null) => string | undefined;
  excelLoading: boolean;
  csvError: string;
  /** Con cambios sin guardar, el aviso de descarte va dentro de este mismo modal */
  csvConfirmDiscard: boolean;
  setCsvConfirmDiscard: Dispatch<SetStateAction<boolean>>;
  handleCsvImport: () => void;
}

// Importar la rúbrica desde CSV (se lee en el navegador) o Excel (lo lee el backend).
// Solo rellena el borrador: nada se guarda hasta "Guardar rúbrica".
export function ImportRubricaModal({
  csvModal,
  closeCsvModal,
  importFormato,
  csvFile,
  fileRef,
  handleFileSelect,
  csvPreview,
  csvCriterios,
  csvTotal,
  descripcionAbet,
  excelLoading,
  csvError,
  csvConfirmDiscard,
  setCsvConfirmDiscard,
  handleCsvImport,
}: ImportRubricaModalProps) {
  return (
      <Modal
        open={csvModal}
        onClose={closeCsvModal}
        title={importFormato === 'excel' ? 'Importar rúbrica desde Excel' : 'Importar rúbrica desde CSV'}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <FileDropZone
            fileName={csvFile?.name}
            placeholder={`Arrastra un ${importFormato === 'excel' ? 'Excel (.xlsx)' : 'CSV'} aquí o haz clic para seleccionar`}
            accept={importFormato === 'excel' ? '.xlsx' : '.csv'}
            onFile={handleFileSelect}
            inputRef={fileRef}
          >
            {importFormato === 'excel' ? (
              <p className="text-xs text-gray-400 mt-1">
                Formato: Aspecto | Criterio | %Criterio en las tres primeras columnas (con encabezado). El aspecto
                puede ir en celdas combinadas. El vínculo a Student Outcomes se hace después, aspecto por aspecto.
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Formato: Aspecto,Criterio,Peso[,CodigoABET] (con encabezado). CodigoABET es opcional y debe ser el
                mismo en todas las filas de un aspecto.
              </p>
            )}
          </FileDropZone>

          {csvPreview.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Vista previa ({csvPreview.length} aspecto{csvPreview.length !== 1 ? 's' : ''}, {csvCriterios} criterio
                {csvCriterios !== 1 ? 's' : ''})
              </p>
              <div className="max-h-64 overflow-y-auto border rounded-lg text-xs">
                {csvPreview.map((aspecto, aspectoIndex) => {
                  const subtotal = round2(aspecto.criterios.reduce((acc, c) => acc + c.peso, 0));
                  return (
                    <div key={aspectoIndex} className="border-b last:border-b-0">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 font-semibold text-gray-800">
                        <span className="flex items-center gap-2">
                          <span>
                            <span className="mr-2 text-[#9E0B0F]">{String.fromCharCode(65 + aspectoIndex)}</span>
                            {aspecto.nombre}
                          </span>
                          {aspecto.codigo_abet && (
                            <span title={descripcionAbet(aspecto.codigo_abet)}>
                              <Badge variant="info">ABET {aspecto.codigo_abet}</Badge>
                            </span>
                          )}
                        </span>
                        <span className="text-gray-500">{subtotal}%</span>
                      </div>
                      {aspecto.criterios.map((criterio, criterioIndex) => (
                        <div key={criterioIndex} className="flex items-start justify-between gap-4 px-3 py-2">
                          <span className="text-gray-700">
                            <span className="mr-2 font-medium text-[#9E0B0F]">
                              {buildCodeName(aspectoIndex, criterioIndex)}
                            </span>
                            {criterio.texto}
                          </span>
                          <span className="shrink-0 font-medium text-gray-700">{criterio.peso}%</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div
                className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                  csvTotal === 100 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                <span>
                  Total
                  {csvTotal < 100 && <span className="ml-2 font-normal">(faltan {round2(100 - csvTotal)}%)</span>}
                  {csvTotal > 100 && <span className="ml-2 font-normal">(excede {round2(csvTotal - 100)}%)</span>}
                </span>
                <span>{csvTotal}%</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Reemplazará el borrador actual. Nada se guarda hasta pulsar "Guardar rúbrica".
              </p>
            </div>
          )}

          {excelLoading && <p className="text-sm text-gray-500">Leyendo el archivo…</p>}
          {csvError && <p className="text-sm text-uao-accent">{csvError}</p>}

          {csvConfirmDiscard ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-sm text-amber-800">Hay cambios sin guardar en la rúbrica. ¿Descartarlos?</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCsvConfirmDiscard(false)}>Cancelar</Button>
                <Button variant="danger" onClick={handleCsvImport}>
                  Descartar e importar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeCsvModal}>Cancelar</Button>
              <Button onClick={handleCsvImport} disabled={csvPreview.length === 0}>
                Importar al borrador
              </Button>
            </div>
          )}
        </div>
      </Modal>
  );
}
