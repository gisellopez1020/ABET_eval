import { Link2, PencilLine, Plus, Trash2, Upload } from 'lucide-react';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Actividad } from '../../../types';
import { buildCodeName, DraftAspecto, DraftCriterio, round2 } from '../rubricaDraft';

interface RubricaTablaProps {
  selectedActividad: Actividad | null;
  draft: DraftAspecto[];
  /** Con calificaciones: solo se puede cambiar el vínculo ABET de cada aspecto */
  bloqueada: boolean;
  totalPeso: number;
  /** Qué falta para poder guardar, o null */
  estadoGuardado: string | null;
  descripcionAbet: (codigo: string | null) => string | undefined;
  openAspectoModal: (aspecto?: DraftAspecto) => void;
  openImportModal: (formato: 'csv' | 'excel') => void;
  openCriterioModal: (aspecto: DraftAspecto, criterio?: DraftCriterio) => void;
  deleteAspecto: (aspecto: DraftAspecto) => void;
  deleteCriterio: (aspectoKey: string, criterioKey: string) => void;
}

// Tarjeta "Rúbrica": estado del guardado, y cada aspecto con sus criterios (o los vacíos)
export function RubricaTabla({
  selectedActividad,
  draft,
  bloqueada,
  totalPeso,
  estadoGuardado,
  descripcionAbet,
  openAspectoModal,
  openImportModal,
  openCriterioModal,
  deleteAspecto,
  deleteCriterio,
}: RubricaTablaProps) {
  return (
          <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-800">Rúbrica</h2>
              <div className="flex items-center gap-3">
                {estadoGuardado && <span className="text-xs text-gray-500">{estadoGuardado}</span>}
                <Badge variant={totalPeso === 100 ? 'success' : 'warning'}>
                  {totalPeso === 100 ? '100% completo' : `${totalPeso}%`}
                </Badge>
              </div>
            </div>

            {!selectedActividad ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                Selecciona una actividad para editar su rúbrica.
              </p>
            ) : draft.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="mb-4 text-sm text-gray-500">
                  Esta actividad aún no tiene rúbrica. Empieza agregando un aspecto.
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => openAspectoModal()}>
                    Agregar aspecto
                  </Button>
                  <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => openImportModal('csv')}>
                    Importar CSV
                  </Button>
                  <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => openImportModal('excel')}>
                    Importar Excel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {draft.map((aspecto, aspectoIndex) => {
                  const subtotal = round2(aspecto.criterios.reduce((acc, c) => acc + c.peso, 0));
                  return (
                    <section key={aspecto.key}>
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f5f5f5] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded-md bg-[#9E0B0F]/10 px-2 py-1 text-xs font-semibold text-[#9E0B0F]">
                            {String.fromCharCode(65 + aspectoIndex)}
                          </span>
                          <span className="font-semibold text-gray-800">{aspecto.nombre}</span>
                          {aspecto.codigo_abet && (
                            <span title={descripcionAbet(aspecto.codigo_abet)}>
                              <Badge variant="info">ABET {aspecto.codigo_abet}</Badge>
                            </span>
                          )}
                          <Badge variant="neutral">{subtotal}%</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {!bloqueada && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<Plus size={14} />}
                              onClick={() => openCriterioModal(aspecto)}
                            >
                              Criterio
                            </Button>
                          )}
                          <button
                            type="button"
                            aria-label={
                              bloqueada ? `Vincular ${aspecto.nombre} a Student Outcome` : `Editar ${aspecto.nombre}`
                            }
                            title={bloqueada ? 'Vincular a Student Outcome' : 'Editar aspecto'}
                            onClick={() => openAspectoModal(aspecto)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]"
                          >
                            {bloqueada ? <Link2 size={15} /> : <PencilLine size={15} />}
                          </button>
                          {!bloqueada && (
                            <button
                              type="button"
                              aria-label={`Eliminar ${aspecto.nombre}`}
                              onClick={() => deleteAspecto(aspecto)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {aspecto.criterios.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-gray-500">Sin criterios.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse text-left text-sm">
                            <tbody>
                              {aspecto.criterios.map((criterio, criterioIndex) => (
                                <tr key={criterio.key} className="border-t border-[#e5e7eb] hover:bg-[#9E0B0F]/[0.02]">
                                  <td className="w-20 px-4 py-3 font-semibold text-[#9E0B0F]">
                                    {buildCodeName(aspectoIndex, criterioIndex)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{criterio.texto}</td>
                                  <td className="w-24 px-4 py-3 text-right font-semibold text-gray-700">
                                    {criterio.peso}%
                                  </td>
                                  <td className="w-28 px-4 py-3">
                                    <div className={`flex justify-end gap-2 ${bloqueada ? 'invisible' : ''}`}>
                                      <button
                                        type="button"
                                        aria-label={`Editar ${criterio.texto}`}
                                        onClick={() => openCriterioModal(aspecto, criterio)}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]"
                                      >
                                        <PencilLine size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Eliminar ${criterio.texto}`}
                                        onClick={() => deleteCriterio(aspecto.key, criterio.key)}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
  );
}
