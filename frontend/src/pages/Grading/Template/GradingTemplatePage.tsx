import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AppLayout } from '../../../components/Layout/AppLayout';
import { Header } from '../../../components/Layout/Header';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { Skeleton } from '../../../components/ui/Skeleton';
import { actividadesApi } from '../../../api/actividades';
import { criteriosApi } from '../../../api/criterios';
import { calificacionesApi, ValorCriterio } from '../../../api/calificaciones';
import { Actividad, Aspecto, ModoCalificacionItem } from '../../../types';

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

  const items = state?.items ?? [];
  const currentIndex = state?.currentIndex ?? items.findIndex((i) => i.id === iid);
  const tipo = state?.tipo ?? 'individual';
  const currentItem = items[currentIndex] ?? null;

  const allCriterios = aspectos.flatMap((a) => a.criterios);

  // nota total calculada en tiempo real
  const notaTotal = allCriterios.reduce((sum, c) => {
    const v = valores[c.id] ?? 0;
    return sum + v * Number(c.peso_porcentaje) / 100 * 5;
  }, 0);

  useEffect(() => {
    Promise.all([
      actividadesApi.get(actId),
      criteriosApi.get(actId),
    ]).then(([a, resp]) => {
      setActividad(a);
      setAspectos(resp.aspectos);
      const init: Record<number, 0 | 1> = {};
      resp.aspectos.forEach((asp) => asp.criterios.forEach((c) => { init[c.id] = 0; }));
      setValores(init);
    }).finally(() => setLoading(false));
  }, [actId]);

  const goTo = (index: number) => {
    if (index < 0 || index >= items.length) return;
    const item = items[index];
    navigate(`/actividades/${actId}/calificar/${secId}/${item.id}`, {
      state: { items, currentIndex: index, tipo },
      replace: true,
    });
  };

  const goNextPending = () => {
    const nextPending = items.findIndex((item, i) => i > currentIndex && !item.calificado);
    if (nextPending !== -1) {
      goTo(nextPending);
    } else if (currentIndex < items.length - 1) {
      goTo(currentIndex + 1);
    } else {
      navigate(`/actividades/${actId}/calificar/${secId}`, { state: null });
    }
  };

  const handleSave = async () => {
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
      // Marcar como calificado en la lista local
      if (state) {
        const updated = items.map((item) =>
          item.id === iid ? { ...item, calificado: true, nota_total: notaTotal } : item
        );
        state.items = updated;
      }
      goNextPending();
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

  if (!actividad) return null;

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
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                {tipo === 'grupal' ? 'Equipo' : 'Estudiante'}
              </p>
              <h2 className="text-xl font-bold text-uao-dark mt-0.5">
                {currentItem?.nombre ?? `Item ${iid}`}
              </h2>
              {tipo === 'grupal' && currentItem?.miembros?.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {currentItem.miembros.map((m) => m.nombre_completo).join(' · ')}
                </p>
              )}
              {tipo === 'individual' && currentItem?.miembros?.[0] && (
                <p className="text-sm text-gray-500 mt-1">
                  Código: {currentItem.miembros[0].codigo_estudiante}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Nota total</p>
              <p className={`text-4xl font-bold ${notaTotal >= 3 ? 'text-green-600' : 'text-uao-accent'}`}>
                {notaTotal.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">/ 5.00</p>
            </div>
          </div>

          {items.length > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
              >
                ← Anterior
              </Button>
              <span className="text-sm text-gray-500">
                {currentIndex + 1} / {items.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goTo(currentIndex + 1)}
                disabled={currentIndex === items.length - 1}
              >
                Siguiente →
              </Button>
            </div>
          )}
        </div>

        {/* Tabla de criterios */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Aspecto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Criterio</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 w-16">Peso</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-24">Valor</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 w-20">Puntaje</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {aspectos.map((asp) =>
                  asp.criterios.map((c, ci) => {
                    const val = valores[c.id] ?? 0;
                    const puntaje = val * Number(c.peso_porcentaje) / 100 * 5;
                    const globalIndex = allCriterios.findIndex((x) => x.id === c.id);
                    return (
                      <tr key={c.id} className={globalIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{globalIndex + 1}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-medium align-top">
                          {ci === 0 ? asp.nombre : ''}
                        </td>
                        <td className="px-4 py-3 text-gray-800 leading-snug">{c.texto}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{Number(c.peso_porcentaje)}%</td>
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            value={val}
                            onChange={(v) => setValores((prev) => ({ ...prev, [c.id]: v }))}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-800">
                          {puntaje.toFixed(4)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-semibold text-gray-700 text-right">
                    TOTAL
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{totalPeso}%</td>
                  <td />
                  <td className="px-4 py-3 text-right font-bold text-uao-dark">
                    {notaTotal.toFixed(4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

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
          <Button onClick={handleSave} loading={saving} size="lg">
            Guardar calificación
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
