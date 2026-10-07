import { useNavigate } from 'react-router-dom';
import { Link2, Lock } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Actividad } from '../../../types';

interface RubricaAvisosProps {
  bloqueada: boolean;
  selectedActividad: Actividad | null;
  error: string;
  savedMsg: string;
}

// Avisos sobre la rúbrica: bloqueada por calificaciones, error, y "guardada" (con el
// acceso a Proyectos y Equipos en las actividades grupales)
export function RubricaAvisos({ bloqueada, selectedActividad, error, savedMsg }: RubricaAvisosProps) {
  const navigate = useNavigate();

  return (
    <>
          {bloqueada && selectedActividad && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <span>
                Esta actividad ya tiene calificaciones: su rúbrica no se puede modificar. Solo puedes cambiar el
                vínculo de cada aspecto con un Student Outcome (botón <Link2 size={13} className="inline" />), y se
                guarda al instante.
              </span>
            </div>
          )}
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <span>{savedMsg}</span>
              {/* Las actividades grupales necesitan equipos antes de calificar */}
              {selectedActividad?.tipo === 'grupal' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/proyectos?actividadId=${selectedActividad.id}`)}
                >
                  Ir a Proyectos y Equipos
                </Button>
              )}
            </div>
          )}
    </>
  );
}
