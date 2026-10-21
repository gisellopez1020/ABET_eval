import { ReactNode } from 'react';
import { CornerDownRight } from 'lucide-react';

import { RaAbet } from '../../../types';
import { COLUMNAS, Editing, formatPeso } from '../raAbetDraft';
import { PesosBadge } from './PesosBadge';
import { RowAcciones } from './RowAcciones';

interface CatalogoTablaProps {
  catalogo: RaAbet[];
  raices: RaAbet[];
  hijosPorPadre: Map<string, RaAbet[]>;
  loading: boolean;
  programaSeleccionado: string;
  editing: Editing | null;
  /** La fila en edición (con su key), que se dibuja arriba (nueva) o en lugar de la editada */
  editRow: ReactNode;
  onEdit: (ra: RaAbet) => void;
  onDelete: (ra: RaAbet) => void;
}

// Tabla del catálogo: cada Resultado de Aprendizaje seguido de sus Criterios
export function CatalogoTabla({
  catalogo,
  raices,
  hijosPorPadre,
  loading,
  programaSeleccionado,
  editing,
  editRow,
  onEdit,
  onDelete,
}: CatalogoTablaProps) {
  const renderCriterio = (criterio: RaAbet, ra: RaAbet) =>
    editing?.codigo === criterio.codigo ? (
      editRow
    ) : (
      <tr key={criterio.codigo} className="border-b border-[#9E0B0F]/10 bg-gray-50/60 text-sm text-gray-700 last:border-b-0 hover:bg-[#9E0B0F]/[0.03]">
        <td className="py-3 pl-8 pr-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
            <CornerDownRight size={13} className="text-gray-400" />
            {criterio.codigo}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-500">{criterio.so}</td>
        <td className="px-4 py-3 text-gray-500">
          {criterio.competencia === ra.competencia ? (
            <span className="text-xs text-gray-400">(la del RA)</span>
          ) : (
            criterio.competencia
          )}
        </td>
        <td className="px-4 py-3 text-gray-700">{criterio.descripcion}</td>
        <td className="px-4 py-3 font-medium text-gray-700">{formatPeso(criterio.peso ?? 0)}</td>
        <td className="px-4 py-3 text-gray-500">{criterio.programa}</td>
        <td className="px-4 py-3"><RowAcciones ra={criterio} onEdit={onEdit} onDelete={onDelete} /></td>
      </tr>
    );

  const renderRa = (ra: RaAbet) => {
    const criterios = hijosPorPadre.get(ra.codigo) ?? [];
    return [
      editing?.codigo === ra.codigo ? (
        editRow
      ) : (
        <tr key={ra.codigo} className="border-b border-[#9E0B0F]/10 text-sm text-gray-700 last:border-b-0 hover:bg-[#9E0B0F]/[0.03]">
          <td className="px-4 py-3 font-semibold text-[#9E0B0F]">{ra.codigo}</td>
          <td className="px-4 py-3 text-gray-700">{ra.so}</td>
          <td className="px-4 py-3 text-gray-700">{ra.competencia}</td>
          <td className="px-4 py-3 text-gray-700">{ra.descripcion}</td>
          <td className="px-4 py-3">
            <PesosBadge pesos={criterios.map((c) => c.peso ?? 0)} />
          </td>
          <td className="px-4 py-3 text-gray-500">{ra.programa}</td>
          <td className="px-4 py-3"><RowAcciones ra={ra} onEdit={onEdit} onDelete={onDelete} /></td>
        </tr>
      ),
      ...criterios.map((criterio) => renderCriterio(criterio, ra)),
    ];
  };

  return (
          <div className="overflow-hidden rounded-xl border border-[#ED1D24]/50 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-[#fafafa]">
                  <tr className="border-b border-[#9E0B0F]/20 text-sm text-[#9E0B0F]">
                    <th className="w-32 px-4 py-3 font-semibold">Código</th>
                    <th className="w-20 px-4 py-3 font-semibold">SO</th>
                    <th className="w-56 px-4 py-3 font-semibold">Competencia</th>
                    <th className="px-4 py-3 font-semibold">Descripción</th>
                    <th className="w-36 px-4 py-3 font-semibold">Peso</th>
                    <th className="w-44 px-4 py-3 font-semibold">Programa</th>
                    <th className="w-28 px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {editing?.codigo === null && editRow}

                  {loading ? (
                    <tr>
                      <td colSpan={COLUMNAS} className="px-4 py-10 text-center text-sm text-gray-500">
                        Cargando…
                      </td>
                    </tr>
                  ) : !programaSeleccionado ? (
                    <tr>
                      <td colSpan={COLUMNAS} className="px-4 py-10 text-center text-sm text-gray-500">
                        Selecciona una carrera para ver sus Student Outcomes.
                      </td>
                    </tr>
                  ) : catalogo.length === 0 && editing?.codigo !== null ? (
                    <tr>
                      <td colSpan={COLUMNAS} className="px-4 py-10 text-center text-sm text-gray-500">
                        Esta carrera todavía no tiene Student Outcomes. Impórtalos desde un CSV o agrega los resultados
                        uno a uno.
                      </td>
                    </tr>
                  ) : (
                    raices.flatMap(renderRa)
                  )}
                </tbody>
              </table>
            </div>
          </div>
  );
}
