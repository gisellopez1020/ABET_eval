import { RefObject } from 'react';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { FileDropZone } from '../../../components/ui/FileDropZone';
import { Modal } from '../../../components/ui/Modal';
import { RaAbet } from '../../../types';
import { RaAbetCsvItem } from '../raAbetCsv';
import { formatPeso } from '../raAbetDraft';
import { PesosBadge } from './PesosBadge';

export interface GrupoVistaPrevia {
  codigo: string;
  descripcion: string;
  estado: 'nuevo' | 'actualiza' | 'existente';
  criterios: RaAbetCsvItem[];
  /** Pesos del RA tras importar (los del archivo + los existentes que no toca) */
  pesosFinales: number[];
}

interface ImportRaAbetModalProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  onFile: (file: File) => void;
  fileRef: RefObject<HTMLInputElement>;
  preview: RaAbetCsvItem[];
  previewGrupos: readonly GrupoVistaPrevia[];
  previewNuevos: number;
  previewActualiza: number;
  porCodigo: Map<string, RaAbet>;
  error: string;
  loading: boolean;
  onImport: () => void;
}

const estadoBadge = (estado: 'nuevo' | 'actualiza' | 'existente') =>
  estado === 'nuevo' ? (
    <Badge variant="success">nuevo</Badge>
  ) : estado === 'actualiza' ? (
    <Badge variant="warning">actualiza</Badge>
  ) : (
    <Badge variant="neutral">ya en el catálogo</Badge>
  );

// Importar el catálogo desde CSV: vista previa agrupada por RA antes de enviar (todo o nada)
export function ImportRaAbetModal({
  open,
  onClose,
  file,
  onFile,
  fileRef,
  preview,
  previewGrupos,
  previewNuevos,
  previewActualiza,
  porCodigo,
  error,
  loading,
  onImport,
}: ImportRaAbetModalProps) {
  return (
      <Modal open={open} onClose={onClose} title="Importar Student Outcomes desde CSV" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <FileDropZone
            fileName={file?.name}
            placeholder="Arrastra un CSV aquí o haz clic para seleccionar"
            accept=".csv"
            onFile={onFile}
            inputRef={fileRef}
          >
            <p className="text-xs text-gray-400 mt-1">
              Formato: Codigo,Competencia,Descripcion,CodigoPadre,Peso (con encabezado). CodigoPadre y Peso van vacíos
              en los Resultados de Aprendizaje; el peso acepta 0,4 o 40%.
            </p>
          </FileDropZone>

          {preview.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Vista previa: {previewNuevos} nuevo{previewNuevos !== 1 ? 's' : ''}, {previewActualiza} actualiza
                {previewActualiza !== 1 ? 'n' : ''}
              </p>
              <div className="max-h-80 overflow-y-auto border rounded-lg text-xs">
                {previewGrupos.map((grupo) => (
                  <div key={grupo.codigo} className="border-b last:border-b-0">
                    <div className="flex items-start justify-between gap-3 bg-gray-50 px-3 py-2">
                      <span className="text-gray-800">
                        <span className="mr-2 font-semibold text-[#9E0B0F]">{grupo.codigo}</span>
                        {grupo.descripcion}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <PesosBadge pesos={grupo.pesosFinales} />
                        {estadoBadge(grupo.estado)}
                      </span>
                    </div>
                    {grupo.criterios.map((item) => (
                      <div key={item.codigo} className="flex items-start justify-between gap-4 py-2 pl-7 pr-3">
                        <span className="text-gray-700">
                          <span className="mr-2 font-medium text-gray-800">{item.codigo}</span>
                          {item.descripcion}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-medium text-gray-700">{formatPeso(item.peso ?? 0)}</span>
                          {estadoBadge(porCodigo.has(item.codigo) ? 'actualiza' : 'nuevo')}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {previewActualiza > 0 && 'Los códigos marcados "actualiza" ya existen: se reemplazarán sus datos. '}
                Si los pesos de un RA no suman 1.0 se importa igual; solo verás la advertencia.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-uao-accent">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={onImport} loading={loading} disabled={preview.length === 0}>
              Importar
            </Button>
          </div>
        </div>
      </Modal>
  );
}
