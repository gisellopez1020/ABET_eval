import { useEffect, useState } from 'react';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { calificacionesApi } from '../../../../api/calificaciones';
import { RetroalimentacionOut } from '../../../../types';

interface RetroalimentacionPanelProps {
  actividadId: number;
  tipo: 'individual' | 'grupal';
  /** Equipo (grupal) o estudiante (individual) */
  itemId: number;
}

// Retroalimentación según la calificación guardada: un párrafo si la redactó la IA o, si
// no está disponible, la lista por aspecto de lo logrado y lo por reforzar (no es un
// error, solo otra forma de mostrarla). Si el endpoint falla no se muestra nada: el
// resto de la página sigue funcionando.
export function RetroalimentacionPanel({ actividadId, tipo, itemId }: RetroalimentacionPanelProps) {
  const [retro, setRetro] = useState<RetroalimentacionOut | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setRetro(null);
    setCargando(true);
    const pedir = tipo === 'grupal'
      ? calificacionesApi.retroalimentacionEquipo(actividadId, itemId)
      : calificacionesApi.retroalimentacionEstudiante(actividadId, itemId);
    pedir
      .then((r) => { if (!cancelado) setRetro(r); })
      .catch((error) => { if (!cancelado) console.error('Error cargando la retroalimentación:', error); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => {
      cancelado = true;
    };
  }, [actividadId, tipo, itemId]);

  if (!cargando && (!retro || !retro.completa)) return null;

  const aspectos = retro?.aspectos.filter((a) => a.cumplidos.length > 0 || a.por_reforzar.length > 0) ?? [];

  return (
    <section aria-label="Retroalimentación" className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 className="text-base font-semibold text-uao-dark">Retroalimentación</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">Según la calificación guardada</p>

      {cargando ? (
        <div role="status" className="space-y-2">
          <p className="text-sm text-gray-500">Generando retroalimentación…</p>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : retro?.fuente === 'ia' && retro.texto ? (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{retro.texto}</p>
      ) : (
        <ul className="space-y-3">
          {aspectos.map((a) => (
            <li key={a.aspecto_id}>
              <p className="text-sm font-medium text-gray-800">{a.nombre}</p>
              {a.cumplidos.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs font-medium text-green-700">Logrado</p>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {a.cumplidos.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {a.por_reforzar.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs font-medium text-uao-accent">Por reforzar</p>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {a.por_reforzar.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
