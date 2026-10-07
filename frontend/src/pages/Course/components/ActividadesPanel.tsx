import { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Actividad, rubricaCompleta } from '../../../types';

function estadoActividad(a: Actividad): { label: string; variant: 'neutral' | 'warning' | 'info' | 'success' } {
  return { label: a.tipo === 'grupal' ? 'Grupal' : 'Individual', variant: 'info' };
}

interface ActividadesPanelProps {
  actividades: Actividad[];
  /** Sin sección elegida no se ofrece "Calificar" */
  selectedSeccion: number | null;
  setNewActModal: Dispatch<SetStateAction<boolean>>;
}

// Panel "Actividades" del curso: abrir la rúbrica, calificar en la sección elegida o crear una nueva
export function ActividadesPanel({ actividades, selectedSeccion, setNewActModal }: ActividadesPanelProps) {
  const navigate = useNavigate();

  return (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">Actividades</h3>
              <Button size="sm" variant="secondary" onClick={() => setNewActModal(true)}>
                + Nueva actividad
              </Button>
            </div>
            <div className="divide-y">
              {actividades.length === 0 && (
                <p className="px-5 py-8 text-sm text-center text-gray-400">
                  No hay actividades. Crea la primera.
                </p>
              )}
              {actividades.map((a) => {
                const { label, variant } = estadoActividad(a);
                const tieneRubrica = rubricaCompleta(a);
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/actividades/${a.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/actividades/${a.id}`); } }}
                    className="cursor-pointer w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{a.nombre}</p>
                      <p className="text-xs text-gray-500">Peso: {Number(a.peso_nota_final)}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!tieneRubrica && <Badge variant="warning">Sin rúbrica</Badge>}
                      <Badge variant={variant}>{label}</Badge>
                      {selectedSeccion && (
                        <span
                          onClick={(e) => e.stopPropagation()}
                          title={tieneRubrica ? undefined : 'Define la rúbrica (100%) antes de calificar'}
                        >
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!tieneRubrica}
                            onClick={() => navigate(`/actividades/${a.id}/calificar/${selectedSeccion}`)}
                          >
                            Calificar
                          </Button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
  );
}
