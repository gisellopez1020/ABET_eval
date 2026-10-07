import { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/Button';
import { Seccion } from '../../../types';

interface SeccionesPanelProps {
  /** id del curso (para "Gestionar") */
  id: number;
  secciones: Seccion[];
  estudiantesCount: Record<number, number>;
  /** Sección con la que "Calificar" abre cada actividad */
  selectedSeccion: number | null;
  setSelectedSeccion: Dispatch<SetStateAction<number | null>>;
  setSeccionError: Dispatch<SetStateAction<string>>;
  setNewSeccionModal: Dispatch<SetStateAction<boolean>>;
}

// Panel "Secciones" del curso: elegir la sección activa, gestionarla o crear una nueva
export function SeccionesPanel({
  id,
  secciones,
  estudiantesCount,
  selectedSeccion,
  setSelectedSeccion,
  setSeccionError,
  setNewSeccionModal,
}: SeccionesPanelProps) {
  const navigate = useNavigate();

  return (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">Secciones</h3>
              <Button size="sm" variant="secondary" onClick={() => { setSeccionError(''); setNewSeccionModal(true); }}>
                + Nueva sección
              </Button>
            </div>
            <div className="divide-y">
              {secciones.length === 0 && (
                <p className="px-5 py-8 text-sm text-center text-gray-400">
                  No hay secciones. Crea la primera.
                </p>
              )}
              {secciones.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSeccion(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSeccion(s.id); } }}
                  className={`cursor-pointer w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors ${selectedSeccion === s.id ? 'bg-red-100 border-l-4 border-[#9E0B0F]' : ''}`}
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{s.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {estudiantesCount[s.id] ?? 0} estudiante{(estudiantesCount[s.id] ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); navigate(`/cursos/${id}/secciones/${s.id}`); }}
                    >
                      Gestionar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
  );
}
