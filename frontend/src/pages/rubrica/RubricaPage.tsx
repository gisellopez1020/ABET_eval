import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Trash2 } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

import { actividadesApi } from '../../api/actividades';
import { criteriosApi } from '../../api/criterios';
import { cursosApi } from '../../api/cursos';
import { useCourseStore } from '../../store/courseStore';
import { Actividad, Aspecto, Curso } from '../../types';

interface FormState {
  aspectoId: number | null;
  texto: string;
  peso_porcentaje: string;
}

const EMPTY_FORM: FormState = {
  aspectoId: null,
  texto: '',
  peso_porcentaje: '20',
};

function buildCodeName(aspectoIndex: number, criterioIndex: number) {
  return `${String.fromCharCode(65 + aspectoIndex)}.${criterioIndex + 1}`;
}

export default function RubricaPage() {
  const { selectedCourseId, setSelectedCourse } = useCourseStore();

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [aspectos, setAspectos] = useState<Aspecto[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState<number | null>(selectedCourseId);
  const [selectedActividadId, setSelectedActividadId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    const loadCursos = async () => {
      setLoading(true);
      try {
        const data = await cursosApi.list();
        setCursos(data);

        const courseId = selectedCourseId ?? data[0]?.id ?? null;
        if (!courseId) {
          setSelectedCursoId(null);
          setSelectedActividadId(null);
          setActividades([]);
          setAspectos([]);
          return;
        }

        setSelectedCursoId(courseId);
        setSelectedCourse(courseId);

        const actividadesData = await actividadesApi.list(courseId);
        setActividades(actividadesData);

        const activityId = actividadesData[0]?.id ?? null;
        setSelectedActividadId(activityId);

        if (activityId) {
          const criterioResp = await criteriosApi.get(activityId);
          setAspectos(criterioResp.aspectos);
          if (criterioResp.aspectos.length > 0) {
            setForm((prev) => ({ ...prev, aspectoId: criterioResp.aspectos[0].id }));
          }
        } else {
          setAspectos([]);
        }
      } catch (err) {
        console.error('Error cargando rúbrica:', err);
        setError('No se pudo cargar la rúbrica desde el backend.');
      } finally {
        setLoading(false);
      }
    };

    loadCursos();
  }, [selectedCourseId, setSelectedCourse]);

  const totalPeso = useMemo(
    () => aspectos.reduce((sum, aspecto) => sum + aspecto.criterios.reduce((acc, criterio) => acc + Number(criterio.peso_porcentaje), 0), 0),
    [aspectos]
  );

  const selectedActividad = actividades.find((item) => item.id === selectedActividadId) ?? null;

  const saveAspectos = async (nextAspectos: Aspecto[]) => {
    if (!selectedActividadId) {
      setError('Debe seleccionar una actividad para guardar la rúbrica.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = nextAspectos.map((aspecto, aspectoIndex) => ({
        nombre: aspecto.nombre,
        orden: aspecto.orden ?? aspectoIndex,
        criterios: aspecto.criterios.map((criterio, criterioIndex) => ({
          texto: criterio.texto,
          peso_porcentaje: Number(criterio.peso_porcentaje),
          orden: criterio.orden ?? criterioIndex,
        })),
      }));

      const response = await criteriosApi.save(selectedActividadId, payload);
      setAspectos(response.aspectos);
      setForm((prev) => ({ ...prev, texto: '', peso_porcentaje: '20' }));
      setModalOpen(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'No se pudo guardar el criterio.';
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCriterion = async () => {
    if (!selectedActividadId) {
      setError('No hay una actividad activa para guardar criterios.');
      return;
    }

    const texto = form.texto.trim();
    const peso = Number(form.peso_porcentaje);

    if (!texto) {
      setError('La descripción del criterio es obligatoria.');
      return;
    }

    if (Number.isNaN(peso) || peso <= 0) {
      setError('El porcentaje debe ser mayor a 0.');
      return;
    }

    const aspectoIndex = aspectos.findIndex((aspecto) => aspecto.id === form.aspectoId);
    if (aspectoIndex === -1) {
      setError('Debe seleccionar un aspecto válido.');
      return;
    }

    const nextAspectos = aspectos.map((aspecto, index) => ({
      ...aspecto,
      orden: aspecto.orden ?? index,
      criterios: [...aspecto.criterios],
    }));

    const nextPesoTotal = nextAspectos.reduce((sum, aspecto) => sum + aspecto.criterios.reduce((acc, criterio) => acc + Number(criterio.peso_porcentaje), 0), 0) + peso;
    if (nextPesoTotal > 100) {
      setError(`La suma total supera el 100%. Actualmente va en ${nextPesoTotal}%.`);
      return;
    }

    const targetAspecto = nextAspectos[aspectoIndex];
    targetAspecto.criterios.push({
      id: Date.now(),
      texto,
      peso_porcentaje: peso,
      aspecto_id: targetAspecto.id,
      orden: targetAspecto.criterios.length,
    });

    await saveAspectos(nextAspectos);
  };

  const handleDeleteCriterion = async (criterioId: number) => {
    const nextAspectos = aspectos.map((aspecto) => ({
      ...aspecto,
      criterios: aspecto.criterios.filter((criterio) => criterio.id !== criterioId),
    }));

    await saveAspectos(nextAspectos);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#f3f3f3] p-6">
          <div className="mx-auto max-w-[1200px] rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f3f3f3] p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Rúbricas y Criterios ABET</h1>
              <p className="mt-1 text-sm text-gray-500">
                {selectedActividad ? `Actividad: ${selectedActividad.nombre}` : 'Sin actividad activa'}
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              icon={<Plus size={16} />}
              className="rounded-xl bg-[#9E0B0F] hover:bg-[#82090d]"
              onClick={() => {
                setError('');
                setForm({
                  aspectoId: aspectos[0]?.id ?? null,
                  texto: '',
                  peso_porcentaje: '20',
                });
                setModalOpen(true);
              }}
              disabled={!selectedActividad}
            >
              Nuevo criterio
            </Button>
          </div>

          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Asignatura</span>
              <select
                value={selectedCursoId ?? ''}
                onChange={async (event) => {
                  const courseId = Number(event.target.value);
                  setSelectedCursoId(courseId);
                  setSelectedCourse(courseId);
                  const actividadesData = await actividadesApi.list(courseId);
                  setActividades(actividadesData);
                  const nextActivityId = actividadesData[0]?.id ?? null;
                  setSelectedActividadId(nextActivityId);
                  if (nextActivityId) {
                    const resp = await criteriosApi.get(nextActivityId);
                    setAspectos(resp.aspectos);
                    if (resp.aspectos[0]) {
                      setForm((prev) => ({ ...prev, aspectoId: resp.aspectos[0].id }));
                    }
                  } else {
                    setAspectos([]);
                  }
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
              >
                <option value="">Selecciona una asignatura</option>
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Actividad</span>
              <select
                value={selectedActividadId ?? ''}
                onChange={async (event) => {
                  const activityId = Number(event.target.value);
                  setSelectedActividadId(activityId);
                  if (!activityId) {
                    setAspectos([]);
                    return;
                  }
                  const resp = await criteriosApi.get(activityId);
                  setAspectos(resp.aspectos);
                  if (resp.aspectos[0]) {
                    setForm((prev) => ({ ...prev, aspectoId: resp.aspectos[0].id }));
                  }
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
              >
                <option value="">Selecciona una actividad</option>
                {actividades.map((actividad) => (
                  <option key={actividad.id} value={actividad.id}>
                    {actividad.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-5 overflow-hidden rounded-[20px] bg-[#9E0B0F] p-5 text-white shadow-sm">
            <div className="mb-2 text-sm uppercase tracking-[0.14em] text-red-100">Resumen</div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Aspectos</div>
                <div className="mt-2 text-3xl font-bold">{aspectos.length}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Criterios</div>
                <div className="mt-2 text-3xl font-bold">
                  {aspectos.reduce((sum, aspect) => sum + aspect.criterios.length, 0)}
                </div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Peso total</div>
                <div className="mt-2 text-3xl font-bold">{totalPeso}%</div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-800">Criterios guardados</h2>
              <Badge variant={totalPeso === 100 ? 'success' : 'warning'}>
                {totalPeso === 100 ? '100% completo' : `${totalPeso}%`}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-[#f5f5f5] text-[#9E0B0F]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Aspecto</th>
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 font-semibold">Descripción</th>
                    <th className="px-4 py-3 font-semibold text-right">Peso</th>
                    <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {aspectos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                        No hay criterios creados para esta actividad.
                      </td>
                    </tr>
                  ) : (
                    aspectos.flatMap((aspecto, aspectoIndex) =>
                      aspecto.criterios.length === 0 ? (
                        <tr key={`empty-${aspecto.id}`}>
                          <td className="px-4 py-3 font-medium text-gray-700">{aspecto.nombre}</td>
                          <td className="px-4 py-3 text-gray-500" colSpan={4}>Sin criterios</td>
                        </tr>
                      ) : (
                        aspecto.criterios.map((criterio, criterioIndex) => (
                          <tr key={criterio.id} className="border-t border-[#e5e7eb] hover:bg-[#9E0B0F]/[0.02]">
                            <td className="px-4 py-3 font-medium text-gray-700">{aspecto.nombre}</td>
                            <td className="px-4 py-3 font-semibold text-[#9E0B0F]">
                              {buildCodeName(aspectoIndex, criterioIndex)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{criterio.texto}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-700">
                              {criterio.peso_porcentaje}%
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  aria-label={`Editar ${criterio.texto}`}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-[#9E0B0F]/40 hover:text-[#9E0B0F]"
                                >
                                  <PencilLine size={15} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Eliminar ${criterio.texto}`}
                                  onClick={() => handleDeleteCriterion(criterio.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Crear criterio"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            <span className="mb-2 block">Aspecto</span>
            <select
              value={form.aspectoId ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, aspectoId: Number(event.target.value) || null }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
            >
              {aspectos.length === 0 ? (
                <option value="">No hay aspectos disponibles</option>
              ) : (
                aspectos.map((aspecto) => (
                  <option key={aspecto.id} value={aspecto.id}>
                    {aspecto.nombre}
                  </option>
                ))
              )}
            </select>
          </label>

          <Input
            label="Descripción del criterio"
            value={form.texto}
            onChange={(event) => setForm((prev) => ({ ...prev, texto: event.target.value }))}
            placeholder="Ej: Identifica y formula claramente el problema de ingeniería..."
          />

          <Input
            label="Peso (%)"
            type="number"
            min={1}
            max={100}
            value={form.peso_porcentaje}
            onChange={(event) => setForm((prev) => ({ ...prev, peso_porcentaje: event.target.value }))}
            placeholder="20"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateCriterion}
              loading={saving}
              className="bg-[#9E0B0F] hover:bg-[#82090d]"
            >
              Guardar criterio
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
