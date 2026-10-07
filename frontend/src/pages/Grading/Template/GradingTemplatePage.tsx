import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AppLayout } from '../../../components/Layout/AppLayout';
import { Header } from '../../../components/Layout/Header';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { actividadesApi } from '../../../api/actividades';
import { criteriosApi } from '../../../api/criterios';
import { calificacionesApi, ValorCriterio } from '../../../api/calificaciones';
import { Actividad, Aspecto, ModoCalificacionItem } from '../../../types';
import { CriteriosTabla } from './components/CriteriosTabla';
import { EncabezadoItem } from './components/EncabezadoItem';
import { valoresIniciales } from '../../../utils/valoresIniciales';

interface LocationState {
  items: ModoCalificacionItem[];
  currentIndex: number;
  tipo: 'individual' | 'grupal';
}

export function GradingTemplatePage() {
  const { actividadId, seccionId, itemId } = useParams<{
    actividadId: string;
    seccionId: string;
    itemId: string;
  }>();
  const actId = Number(actividadId);
  const secId = Number(seccionId);
  const iid = Number(itemId);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [aspectos, setAspectos] = useState<Aspecto[]>([]);
  const [valores, setValores] = useState<Record<number, 0 | 1>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Si no se pudieron leer las calificaciones guardadas, no se permite guardar:
  // los toggles en 0 sobrescribirían las notas reales.
  const [loadError, setLoadError] = useState('');

  const items = state?.items ?? [];
  const currentIndex = state?.currentIndex ?? items.findIndex((i) => i.id === iid);
  // La actividad es la fuente fiable; state se pierde al recargar o abrir la URL directamente
  const tipo = actividad?.tipo ?? state?.tipo ?? 'individual';
  const currentItem = items[currentIndex] ?? null;

  const allCriterios = aspectos.flatMap((a) => a.criterios);

  // nota total calculada en tiempo real
  const notaTotal = allCriterios.reduce((sum, c) => {
    const v = valores[c.id] ?? 0;
    return sum + v * Number(c.peso_porcentaje) / 100 * 5;
  }, 0);

  // Depende también de iid: Anterior/Siguiente/Guardar navegan dentro de la misma ruta sin
  // desmontar la página, y cada ítem debe arrancar con sus propias calificaciones guardadas.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');

    const load = async () => {
      try {
        const [a, resp] = await Promise.all([
          actividadesApi.get(actId),
          criteriosApi.get(actId),
        ]);
        if (cancelado) return;
        setActividad(a);
        setAspectos(resp.aspectos);

        try {
          const guardadas = a.tipo === 'grupal'
            ? await calificacionesApi.equipo(actId, iid)
            : await calificacionesApi.estudiante(actId, iid);
          if (cancelado) return;
          setValores(valoresIniciales(resp.aspectos, guardadas));
        } catch (error) {
          if (cancelado) return;
          console.error('Error cargando calificaciones guardadas:', error);
          setValores(valoresIniciales(resp.aspectos, []));
          setLoadError(
            'No se pudieron cargar las calificaciones guardadas. Para no sobrescribirlas, el guardado está deshabilitado; recarga la página para intentarlo de nuevo.'
          );
        }
      } catch (error) {
        if (cancelado) return;
        console.error('Error cargando la actividad:', error);
        setActividad(null);
        setLoadError('No se pudo cargar la actividad.');
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelado = true;
    };
  }, [actId, iid]);

  // La lista de la sesión vive solo en location.state: quien la cambia (guardar) pasa la
  // nueva aquí, porque `items` es la del render actual y no se actualiza hasta navegar
  const goTo = (index: number, list: ModoCalificacionItem[] = items) => {
    if (index < 0 || index >= list.length) return;
    const item = list[index];
    navigate(`/actividades/${actId}/calificar/${secId}/${item.id}`, {
      state: { items: list, currentIndex: index, tipo },
      replace: true,
    });
  };

  const goNextPending = (list: ModoCalificacionItem[]) => {
    const nextPending = list.findIndex((item, i) => i > currentIndex && !item.calificado);
    if (nextPending !== -1) {
      goTo(nextPending, list);
    } else if (currentIndex < list.length - 1) {
      goTo(currentIndex + 1, list);
    } else {
      navigate(`/actividades/${actId}/calificar/${secId}`, { state: null });
    }
  };

  const handleSave = async () => {
    if (loadError) return;
    setSaveError('');
    setSaving(true);
    try {
      const criterios: ValorCriterio[] = Object.entries(valores).map(([id, val]) => ({
        criterio_id: Number(id),
        valor: val,
      }));
      const body = tipo === 'grupal'
        ? { actividad_id: actId, criterios, equipo_id: iid }
        : { actividad_id: actId, criterios, estudiante_id: iid };
      await calificacionesApi.save(body);
      // Marcar como calificado en la lista que viaja al siguiente ítem (sin mutar location.state)
      const updated = items.map((item) =>
        item.id === iid ? { ...item, calificado: true, nota_total: notaTotal } : item
      );
      goNextPending(updated);
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || 'Error al guardar la calificación');
    } finally {
      setSaving(false);
    }
  };

  const totalPeso = allCriterios.reduce((s, c) => s + Number(c.peso_porcentaje), 0);

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Calificando…' }]} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!actividad) {
    return loadError ? (
      <AppLayout>
        <Header crumbs={[{ label: 'Calificar' }]} />
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-uao-accent">
            {loadError}
          </div>
        </div>
      </AppLayout>
    ) : null;
  }

  return (
    <AppLayout>
      <Header
        crumbs={[
          { label: 'Mis cursos', to: '/dashboard' },
          { label: actividad.nombre, to: `/cursos/${actividad.curso_id}` },
          { label: currentItem?.nombre ?? `Item ${iid}` },
        ]}
      />
      <div className="p-6 max-w-4xl mx-auto">
        {/* Encabezado */}
        <EncabezadoItem
          tipo={tipo}
          currentItem={currentItem}
          iid={iid}
          notaTotal={notaTotal}
          items={items}
          currentIndex={currentIndex}
          goTo={goTo}
        />

        {loadError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-uao-accent">
            {loadError}
          </div>
        )}

        {/* Tabla de criterios */}
        <CriteriosTabla
          aspectos={aspectos}
          allCriterios={allCriterios}
          valores={valores}
          setValores={setValores}
          totalPeso={totalPeso}
          notaTotal={notaTotal}
        />

        {saveError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-uao-accent">
            {saveError}
          </div>
        )}

        <div className="flex justify-between">
          <Button
            variant="secondary"
            onClick={() => navigate(`/actividades/${actId}/calificar/${secId}`, { state: null })}
          >
            ← Volver a la lista
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={Boolean(loadError)} size="lg">
            Guardar calificación
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
