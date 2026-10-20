import { RefObject, useEffect, useState } from 'react';

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
  programa: string;
  onProgramaChange: (programa: string) => void;
  programas: string[];
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
  programa,
  onProgramaChange,
  programas,
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
  const [nuevaCarrera, setNuevaCarrera] = useState(false);
  const opcionNueva = '__nueva_carrera__';

  useEffect(() => {
    if (!open) setNuevaCarrera(false);
  }, [open]);

  return (
      <Modal open={open} onClose={onClose} title="Importar Student Outcomes desde CSV" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label htmlFor="import-programa" className="mb-2 block text-sm font-medium text-gray-700">
              Colección de Student Outcomes
            </label>
            <select
              id="import-programa"
              aria-label="Colección de Student Outcomes"
              value={nuevaCarrera ? opcionNueva : programa}
              onChange={(event) => {
                if (event.target.value === opcionNueva) {
                  setNuevaCarrera(true);
                  onProgramaChange('');
                } else {
                  setNuevaCarrera(false);
                  onProgramaChange(event.target.value);
                }
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
            >
              <option value="">Selecciona una colección cargada</option>
              {programas.map((item) => <option key={item} value={item}>{item}</option>)}
              <option value={opcionNueva}>Crear una nueva colección…</option>
            </select>
            {nuevaCarrera && (
              <input
                aria-label="Nombre de la nueva colección"
                value={programa}
                onChange={(event) => onProgramaChange(event.target.value)}
                maxLength={200}
                placeholder="Nombre de la nueva carrera"
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
              />
            )}
            <p className="mt-1 text-xs text-gray-500">
              Al elegir una colección cargada, el archivo actualizará únicamente sus Student Outcomes.
            </p>
          </div>
          <FileDropZone
            fileName={file?.name}
            placeholder="Arrastra un CSV aquí o haz clic para seleccionar"
            accept=".csv"
            onFile={onFile}
            inputRef={fileRef}
          >
            <p className="text-xs text-gray-400 mt-1">
              Formato: Codigo,Competencia,Descripcion,CodigoPadre,Peso (con encabezado). La carrera elegida se asignará
              a todos los resultados del archivo. CodigoPadre y Peso van vacíos en los Resultados de Aprendizaje; el peso
              acepta 0,4 o 40%.
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
                          {estadoBadge(porCodigo.get(item.codigo)?.programa === programa ? 'actualiza' : 'nuevo')}
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
            <Button onClick={onImport} loading={loading} disabled={preview.length === 0 || !programa.trim()}>
              Importar
            </Button>
          </div>
        </div>
      </Modal>
  );
}
