import { Button } from '../../../components/ui/Button';

interface EvaluacionVaciaProps {
  loadError: string;
  sinAsignaturas: boolean;
  sinActividades: boolean;
  tipoEvaluacion?: 'grupal' | 'individual';
  onCrearEquipos: () => void;
}

// Sin proyecto que mostrar: error de carga, o por qué no hay nada que evaluar
export function EvaluacionVacia({
  loadError,
  sinAsignaturas,
  sinActividades,
  tipoEvaluacion = 'grupal',
  onCrearEquipos,
}: EvaluacionVaciaProps) {
  return (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                {loadError ? (
                  <p className="text-red-700">{loadError}</p>
                ) : sinAsignaturas ? (
                  <p>No tienes asignaturas registradas.</p>
                ) : sinActividades ? (
                  <p>
                    {tipoEvaluacion === 'grupal'
                      ? 'Esta asignatura no tiene actividades grupales. La evaluación por equipos solo aplica a actividades grupales.'
                      : 'Esta asignatura no tiene actividades individuales.'}
                  </p>
                ) : tipoEvaluacion === 'individual' ? (
                  <p>Esta actividad no tiene estudiantes en las secciones aplicables.</p>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <p>Esta actividad no tiene equipos todavía.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onCrearEquipos}
                    >
                      Crear equipos
                    </Button>
                  </div>
                )}
              </div>
  );
}
