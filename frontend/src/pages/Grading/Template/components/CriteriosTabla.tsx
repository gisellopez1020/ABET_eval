import { Dispatch, SetStateAction } from 'react';

import { Toggle } from '../../../../components/ui/Toggle';
import { Aspecto, Criterio } from '../../../../types';

interface CriteriosTablaProps {
  aspectos: Aspecto[];
  allCriterios: Criterio[];
  valores: Record<number, 0 | 1>;
  setValores: Dispatch<SetStateAction<Record<number, 0 | 1>>>;
  totalPeso: number;
  notaTotal: number;
}

// Rúbrica con un toggle Cumple / No cumple por criterio, su puntaje y el total
export function CriteriosTabla({ aspectos, allCriterios, valores, setValores, totalPeso, notaTotal }: CriteriosTablaProps) {
  return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Aspecto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Criterio</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 w-16">Peso</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-24">Valor</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 w-20">Puntaje</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {aspectos.map((asp) =>
                  asp.criterios.map((c, ci) => {
                    const val = valores[c.id] ?? 0;
                    const puntaje = val * Number(c.peso_porcentaje) / 100 * 5;
                    const globalIndex = allCriterios.findIndex((x) => x.id === c.id);
                    return (
                      <tr key={c.id} className={globalIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{globalIndex + 1}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-medium align-top">
                          {ci === 0 ? asp.nombre : ''}
                        </td>
                        <td className="px-4 py-3 text-gray-800 leading-snug">{c.texto}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{Number(c.peso_porcentaje)}%</td>
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            value={val}
                            onChange={(v) => setValores((prev) => ({ ...prev, [c.id]: v }))}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-800">
                          {puntaje.toFixed(4)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700 text-right">
                    TOTAL
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{totalPeso}%</td>
                  <td />
                  <td className="px-4 py-3 text-right font-bold text-uao-dark">
                    {notaTotal.toFixed(4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
  );
}
