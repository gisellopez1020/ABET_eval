import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';

import { Badge } from '../../../components/ui/Badge';
import { Aspecto } from '../../../types';
import { codigoCriterio, letraAspecto } from '../utils';

interface RubricaEquipoProps {
  aspectos: Aspecto[];
  /** {criterio_id: valor} de las calificaciones guardadas del equipo; sin clave = sin calificar */
  valores: Record<number, 0 | 1>;
}

// Rúbrica de la actividad en modo lectura, con el estado de cada criterio para el equipo
export function RubricaEquipo({ aspectos, valores }: RubricaEquipoProps) {
  return (
                  <div className="space-y-5">
                    {aspectos.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                        No hay criterios definidos para esta actividad todavía.
                      </div>
                    ) : (
                      aspectos.map((aspecto, index) => (
                        <section key={aspecto.id} className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                          <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="rounded-md bg-[#9E0B0F]/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9E0B0F]">
                                {letraAspecto(index)}
                              </div>
                              <span className="text-[15px] font-semibold text-gray-800">{aspecto.nombre}</span>
                            </div>

                            <Badge variant="neutral">{aspecto.criterios.length} criterios</Badge>
                          </div>

                          <div className="divide-y divide-[#e5e7eb]">
                            {aspecto.criterios.map((criterio, criterioIndex) => {
                              const valor = valores[criterio.id];
                              const calificado = valor !== undefined;
                              return (
                                <div
                                  key={criterio.id}
                                  className={`flex items-center gap-4 px-4 py-3 ${calificado ? '' : 'bg-gray-50/60'}`}
                                >
                                  <div className="flex min-w-[60px] items-center gap-2 text-sm font-medium text-gray-800">
                                    <span>{codigoCriterio(index, criterioIndex)}</span>
                                  </div>

                                  <div className="flex-1 text-sm text-gray-800">{criterio.texto}</div>

                                  <div
                                    className={`flex w-[110px] items-center gap-1.5 text-xs font-medium ${
                                      !calificado ? 'text-gray-400' : valor === 1 ? 'text-green-700' : 'text-red-600'
                                    }`}
                                  >
                                    {!calificado ? (
                                      <CircleDashed size={15} />
                                    ) : valor === 1 ? (
                                      <CircleCheck size={15} />
                                    ) : (
                                      <CircleX size={15} />
                                    )}
                                    {!calificado ? 'Sin calificar' : valor === 1 ? 'Cumple' : 'No cumple'}
                                  </div>

                                  <div
                                    className="w-[60px] text-right text-xs font-medium text-gray-600"
                                    title={`${Number(criterio.peso_porcentaje)}%`}
                                  >
                                    {Number(criterio.peso_porcentaje).toFixed(1)}%
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
  );
}
