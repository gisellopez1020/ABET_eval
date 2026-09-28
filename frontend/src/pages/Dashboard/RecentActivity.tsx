import { useEffect, useState } from 'react';
import { User, Users } from 'lucide-react';

import { cursosApi } from '../../api/cursos';
import { Skeleton } from '../../components/ui/Skeleton';
import { ActividadReciente } from '../../types';
import { tiempoRelativo } from '../../utils/tiempoRelativo';

const LIMITE = 10;

interface RecentActivityProps {
  cursoId: number | null;
}

export function RecentActivity({
  cursoId,
}: RecentActivityProps) {
  const [items, setItems] = useState<ActividadReciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Refresca los "hace X minutos" aunque no se vuelva a consultar el backend
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setItems([]);
    setError(false);
    if (!cursoId) {
      setLoading(false);
      return;
    }

    let cancelado = false;
    setLoading(true);
    cursosApi
      .actividadReciente(cursoId, LIMITE)
      .then((data) => {
        if (!cancelado) {
          setItems(data);
          setAhora(new Date());
        }
      })
      .catch((err) => {
        console.error('Error cargando actividad reciente:', err);
        if (!cancelado) setError(true);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [cursoId]);

  let contenido;
  if (loading) {
    contenido = (
      <div className="space-y-2">
        <Skeleton className="h-7 w-full" count={4} />
      </div>
    );
  } else if (error) {
    contenido = (
      <p className="text-[10px] text-gray-400">No se pudo cargar la actividad reciente.</p>
    );
  } else if (!cursoId || items.length === 0) {
    contenido = <p className="text-[10px] text-gray-400">Ninguna información</p>;
  } else {
    contenido = (
      <ul className="divide-y divide-gray-100">
        {items.map((item) => {
          const Icono = item.tipo === 'equipo' ? Users : User;
          return (
            <li
              key={`${item.actividad_id}-${item.tipo}-${item.nombre}-${item.updated_at}`}
              className="flex items-center gap-2 py-1.5"
            >
              <Icono size={13} strokeWidth={1.7} className="shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-gray-800">{item.nombre}</p>
                <p className="truncate text-[10px] text-gray-500">{item.actividad_nombre}</p>
              </div>
              <time
                dateTime={item.updated_at}
                title={new Date(item.updated_at).toLocaleString('es')}
                className="shrink-0 text-[10px] text-gray-400"
              >
                {tiempoRelativo(item.updated_at, ahora)}
              </time>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <h2 className="mb-3 text-[12px] font-semibold text-gray-800">
        Actividad Reciente
      </h2>

      {contenido}
    </section>
  );
}
