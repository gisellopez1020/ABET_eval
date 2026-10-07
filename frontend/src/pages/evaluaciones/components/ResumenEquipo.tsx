import { Save } from 'lucide-react';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Aspecto } from '../../../types';
import { ProjectOption } from '../types';
import { CIRCUNFERENCIA, RADIO_ANILLO } from '../utils';

interface ResumenEquipoProps {
  project: ProjectOption;
  aspectos: Aspecto[];
  valores: Record<number, 0 | 1>;
  onIrACalificar: () => void;
}

// Resumen lateral: avance de la calificación, integrantes y "Ir a calificar"
export function ResumenEquipo({ project, aspectos, valores, onIrACalificar }: ResumenEquipoProps) {
  const totalCriterios = aspectos.reduce((total, aspecto) => total + aspecto.criterios.length, 0);
  const criteriosCalificados = aspectos.reduce(
    (total, aspecto) => total + aspecto.criterios.filter((criterio) => criterio.id in valores).length,
    0
  );
  const progreso = totalCriterios > 0 ? Math.round((criteriosCalificados / totalCriterios) * 100) : 0;

  return (
                  <aside className="space-y-5">
                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Resumen del proyecto</span>
                      </div>

                      <div className="mb-5 flex flex-col items-center justify-center">
                        {/* % de criterios de la rúbrica con calificación guardada para este equipo */}
                        <div className="relative h-28 w-28">
                          <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
                            <circle cx="56" cy="56" r={RADIO_ANILLO} fill="none" stroke="#f6d4d4" strokeWidth="10" />
                            <circle
                              cx="56"
                              cy="56"
                              r={RADIO_ANILLO}
                              fill="none"
                              stroke="#9E0B0F"
                              strokeWidth="10"
                              strokeLinecap={progreso > 0 ? 'round' : 'butt'}
                              strokeDasharray={CIRCUNFERENCIA}
                              strokeDashoffset={CIRCUNFERENCIA * (1 - progreso / 100)}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[1.75rem] font-bold text-[#9E0B0F]">
                            {progreso}%
                          </span>
                        </div>
                        <span className="mt-2 text-[11px] text-gray-500">
                          {criteriosCalificados} de {totalCriterios} criterios calificados
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-green-50 p-3 text-center">
                          <div className="text-2xl font-bold text-green-700">{project.calificado ? 'Sí' : 'No'}</div>
                          <div className="text-[11px] font-medium text-green-700">Este equipo</div>
                        </div>
                        <div className="rounded-lg bg-red-50 p-3 text-center">
                          <div className="text-2xl font-bold text-red-700">{totalCriterios}</div>
                          <div className="text-[11px] font-medium text-red-700">Criterios</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Equipo</span>
                        <Badge variant="neutral">{project.miembros.length} miembros</Badge>
                      </div>

                      <div className="space-y-2">
                        {project.miembros.map((member, index) => (
                          <div key={`${member}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            {member}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <Button
                        variant="primary"
                        className="w-full justify-center rounded-lg bg-[#9E0B0F] py-3 font-semibold text-white hover:bg-[#82090d]"
                        onClick={onIrACalificar}
                      >
                        <Save size={16} />
                        Ir a calificar
                      </Button>
                    </div>
                  </aside>
  );
}
