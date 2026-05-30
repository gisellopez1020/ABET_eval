import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { actividadesApi } from '../../api/actividades';
import { criteriosApi, AspectoIn } from '../../api/criterios';
import { cursosApi } from '../../api/cursos';
import { Actividad, CriteriosResponse } from '../../types';

interface AspectoDraft {
  id?: number;
  nombre: string;
  orden: number;
  criterios: CriterioDraft[];
}

interface CriterioDraft {
  id?: number;
  texto: string;
  peso_porcentaje: number;
  orden: number;
}

export function ActivityPage() {
  const { actividadId } = useParams<{ actividadId: string }>();
  const actId = Number(actividadId);
  const navigate = useNavigate();

  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [cursoNombre, setCursoNombre] = useState('');
  const [aspectos, setAspectos] = useState<AspectoDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const totalPeso = aspectos.flatMap((a) => a.criterios).reduce((s, c) => s + Number(c.peso_porcentaje), 0);

  useEffect(() => {
    actividadesApi.get(actId).then((a) => {
      setActividad(a);
      cursosApi.get(a.curso_id).then((c) => setCursoNombre(c.nombre));
      return criteriosApi.get(actId);
    }).then((resp: CriteriosResponse) => {
      if (resp.aspectos.length > 0) {
        setAspectos(
          resp.aspectos.map((asp, ai) => ({
            id: asp.id,
            nombre: asp.nombre,
            orden: asp.orden ?? ai,
            criterios: asp.criterios.map((c, ci) => ({
              id: c.id,
              texto: c.texto,
              peso_porcentaje: Number(c.peso_porcentaje),
              orden: c.orden ?? ci,
            })),
          }))
        );
      }
    }).finally(() => setLoading(false));
  }, [actId]);

  const addAspecto = () => {
    setAspectos((prev) => [
      ...prev,
      { nombre: '', orden: prev.length, criterios: [{ texto: '', peso_porcentaje: 0, orden: 0 }] },
    ]);
  };

  const updateAspecto = (ai: number, nombre: string) => {
    setAspectos((prev) => prev.map((a, i) => i === ai ? { ...a, nombre } : a));
  };

  const removeAspecto = (ai: number) => {
    setAspectos((prev) => prev.filter((_, i) => i !== ai));
  };

  const addCriterio = (ai: number) => {
    setAspectos((prev) =>
      prev.map((a, i) =>
        i === ai
          ? { ...a, criterios: [...a.criterios, { texto: '', peso_porcentaje: 0, orden: a.criterios.length }] }
          : a
      )
    );
  };

  const updateCriterio = (ai: number, ci: number, field: keyof CriterioDraft, value: string | number) => {
    setAspectos((prev) =>
      prev.map((a, i) =>
        i === ai
          ? {
              ...a,
              criterios: a.criterios.map((c, j) =>
                j === ci ? { ...c, [field]: value } : c
              ),
            }
          : a
      )
    );
  };

  const removeCriterio = (ai: number, ci: number) => {
    setAspectos((prev) =>
      prev.map((a, i) =>
        i === ai ? { ...a, criterios: a.criterios.filter((_, j) => j !== ci) } : a
      )
    );
  };

  const handleSave = async () => {
    setSaveError('');
    setSaveOk(false);
    if (Math.abs(totalPeso - 100) > 0.01) {
      setSaveError(`Los criterios suman ${totalPeso}%. Deben sumar exactamente 100%.`);
      return;
    }
    setSaving(true);
    try {
      const payload: AspectoIn[] = aspectos.map((a, ai) => ({
        nombre: a.nombre,
        orden: ai,
        criterios: a.criterios.map((c, ci) => ({
          texto: c.texto,
          peso_porcentaje: c.peso_porcentaje,
          orden: ci,
        })),
      }));
      await criteriosApi.save(actId, payload);
      setSaveOk(true);
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
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
          { label: cursoNombre, to: `/cursos/${actividad.curso_id}` },
          { label: actividad.nombre },
        ]}
      />
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">{actividad.nombre}</h2>
            <p className="text-sm text-gray-500 mt-1 capitalize">
              {actividad.tipo} · Peso: {Number(actividad.peso_nota_final)}% de la nota final
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/cursos/${actividad.curso_id}`)}>
            ← Volver
          </Button>
        </div>

        {/* Indicador de peso total */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Total de pesos</span>
            <span className={`text-sm font-bold ${Math.abs(totalPeso - 100) < 0.01 ? 'text-green-600' : 'text-uao-accent'}`}>
              {totalPeso}%
            </span>
          </div>
          <ProgressBar value={totalPeso} max={100} />
          {Math.abs(totalPeso - 100) > 0.01 && (
            <p className="text-xs text-uao-accent mt-1">
              {totalPeso < 100 ? `Faltan ${(100 - totalPeso).toFixed(2)}%` : `Exceden ${(totalPeso - 100).toFixed(2)}%`}
            </p>
          )}
        </div>

        {/* Aspectos */}
        <div className="space-y-4">
          {aspectos.map((asp, ai) => (
            <div key={ai} className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-gray-50 rounded-t-xl">
                <input
                  className="flex-1 bg-transparent font-semibold text-uao-dark text-sm focus:outline-none"
                  placeholder="Nombre del aspecto"
                  value={asp.nombre}
                  onChange={(e) => updateAspecto(ai, e.target.value)}
                />
                <button
                  onClick={() => removeAspecto(ai)}
                  className="text-gray-400 hover:text-uao-accent transition-colors text-lg leading-none"
                  title="Eliminar aspecto"
                >
                  ×
                </button>
              </div>

              <div className="divide-y">
                {asp.criterios.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs text-gray-400 w-5">{ci + 1}</span>
                    <input
                      className="flex-1 text-sm border-0 focus:outline-none focus:ring-0 text-gray-800"
                      placeholder="Descripción del criterio"
                      value={c.texto}
                      onChange={(e) => updateCriterio(ai, ci, 'texto', e.target.value)}
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-16 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-uao-mid"
                        value={c.peso_porcentaje}
                        onChange={(e) => updateCriterio(ai, ci, 'peso_porcentaje', Number(e.target.value))}
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    <button
                      onClick={() => removeCriterio(ai, ci)}
                      className="text-gray-300 hover:text-uao-accent transition-colors"
                      title="Eliminar criterio"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="px-4 py-2 border-t">
                <button
                  onClick={() => addCriterio(ai)}
                  className="text-sm text-uao-mid hover:text-uao-dark transition-colors"
                >
                  + Agregar criterio
                </button>
              </div>
            </div>
          ))}

          <Button variant="secondary" onClick={addAspecto} className="w-full">
            + Agregar aspecto
          </Button>
        </div>

        {saveError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-uao-accent">
            {saveError}
          </div>
        )}
        {saveOk && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
            Criterios guardados correctamente.
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={Math.abs(totalPeso - 100) > 0.01 || aspectos.length === 0}
          >
            Guardar criterios
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
