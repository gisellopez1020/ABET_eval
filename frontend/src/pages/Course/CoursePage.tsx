import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi, ActividadCreate } from '../../api/actividades';
import { estudiantesApi } from '../../api/estudiantes';
import { Curso, Seccion, Actividad } from '../../types';

function estadoActividad(a: Actividad): { label: string; variant: 'neutral' | 'warning' | 'info' | 'success' } {
  return { label: a.tipo === 'grupal' ? 'Grupal' : 'Individual', variant: 'info' };
}

export function CoursePage() {
  const { cursoId } = useParams<{ cursoId: string }>();
  const id = Number(cursoId);
  const isCreateMode = !cursoId || Number.isNaN(id);
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Curso | null>(null);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [estudiantesCount, setEstudiantesCount] = useState<Record<number, number>>({});
  const [selectedSeccion, setSelectedSeccion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [newCourse, setNewCourse] = useState({
    nombre: '',
    codigo: '',
    periodo: '',
    activo: true,
  });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const [newSeccionModal, setNewSeccionModal] = useState(false);
  const [newSeccionNombre, setNewSeccionNombre] = useState('');
  const [newSeccionLoading, setNewSeccionLoading] = useState(false);

  const [newActModal, setNewActModal] = useState(false);
  const [newAct, setNewAct] = useState<ActividadCreate>({ nombre: '', tipo: 'individual', peso_nota_final: 20 });
  const [newActLoading, setNewActLoading] = useState(false);
  const [actError, setActError] = useState('');

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false);
      return;
    }

    Promise.all([
      cursosApi.get(id),
      seccionesApi.list(id),
      actividadesApi.list(id),
    ]).then(([c, s, a]) => {
      setCurso(c);
      setSecciones(s);
      setActividades(a);
      if (s.length > 0) setSelectedSeccion(s[0].id);
      return s;
    }).then((s) =>
      Promise.all(s.map((sec) =>
        estudiantesApi.list(sec.id).then((est) => ({ id: sec.id, count: est.length }))
      ))
    ).then((counts) => {
      const map: Record<number, number> = {};
      counts.forEach(({ id, count }) => { map[id] = count; });
      setEstudiantesCount(map);
    }).catch(() => {
      setCurso(null);
    }).finally(() => setLoading(false));
  }, [id, isCreateMode]);

  const handleCreateSeccion = async () => {
    if (!newSeccionNombre.trim()) return;
    setNewSeccionLoading(true);
    try {
      const s = await seccionesApi.create(id, { nombre: newSeccionNombre.trim() });
      setSecciones((prev) => [...prev, s]);
      setEstudiantesCount((prev) => ({ ...prev, [s.id]: 0 }));
      setSelectedSeccion(s.id);
      setNewSeccionModal(false);
      setNewSeccionNombre('');
    } finally {
      setNewSeccionLoading(false);
    }
  };

  const handleCreateActividad = async () => {
    if (!newAct.nombre.trim()) { setActError('El nombre es obligatorio'); return; }
    setNewActLoading(true);
    setActError('');
    try {
      const a = await actividadesApi.create(id, newAct);
      setActividades((prev) => [...prev, a]);
      setNewActModal(false);
      setNewAct({ nombre: '', tipo: 'individual', peso_nota_final: 20 });
    } catch (e: any) {
      setActError(e?.response?.data?.detail || 'Error al crear actividad');
    } finally {
      setNewActLoading(false);
    }
  };

  const handleCreateCurso = async () => {
    if (!newCourse.nombre.trim()) {
      setCreateError('El nombre es obligatorio');
      return;
    }
    if (!newCourse.codigo.trim()) {
      setCreateError('El código es obligatorio');
      return;
    }
    if (!newCourse.periodo.trim()) {
      setCreateError('El período es obligatorio');
      return;
    }

    setCreateLoading(true);
    setCreateError('');

    try {
      const created = await cursosApi.create({
        nombre: newCourse.nombre.trim(),
        codigo: newCourse.codigo.trim(),
        periodo: newCourse.periodo.trim(),
        ra_abet: [],
      });

      navigate(`/cursos/${created.id}`);
    } catch (e: any) {
      setCreateError(e?.response?.data?.detail || 'No se pudo crear la asignatura');
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </AppLayout>
    );
  }

  if (isCreateMode) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Nueva asignatura</h2>
                <p className="text-sm text-gray-500">Completa la información de la asignatura</p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/cursos')}>
                Volver
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Nombre"
                value={newCourse.nombre}
                onChange={(e) => setNewCourse((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Fundamentos de programación"
              />
              <Input
                label="Código"
                value={newCourse.codigo}
                onChange={(e) => setNewCourse((prev) => ({ ...prev, codigo: e.target.value }))}
                placeholder="Ej: FIS-101"
              />
              <Input
                label="Período"
                value={newCourse.periodo}
                onChange={(e) => setNewCourse((prev) => ({ ...prev, periodo: e.target.value }))}
                placeholder="Ej: 2026-1"
              />
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">Estado</label>
                <div className="flex items-center gap-6 rounded-lg border border-gray-300 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="curso-estado"
                      checked={newCourse.activo}
                      onChange={() => setNewCourse((prev) => ({ ...prev, activo: true }))}
                    />
                    Activa
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="curso-estado"
                      checked={!newCourse.activo}
                      onChange={() => setNewCourse((prev) => ({ ...prev, activo: false }))}
                    />
                    Inactiva
                  </label>
                </div>
              </div>
            </div>

            {createError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => navigate('/cursos')}>
                Cancelar
              </Button>
              <Button onClick={handleCreateCurso} loading={createLoading}>
                Crear asignatura
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!curso) return null;

  return (
    <AppLayout>
      <Header
        crumbs={[
          { label: 'Mis cursos', to: '/dashboard' },
          { label: curso.nombre },
        ]}
      />
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">{curso.nombre}</h2>
            <p className="text-sm text-gray-500">{curso.codigo} · {curso.periodo}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/cursos/${id}/reportes`)}>
            Ver reportes ABET
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Secciones */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-uao-dark">Secciones</h3>
              <Button size="sm" variant="secondary" onClick={() => setNewSeccionModal(true)}>
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
                  className={`cursor-pointer w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors ${selectedSeccion === s.id ? 'bg-blue-50 border-l-4 border-uao-mid' : ''}`}
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

          {/* Actividades */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-uao-dark">Actividades</h3>
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
                      <Badge variant={variant}>{label}</Badge>
                      {selectedSeccion && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/actividades/${a.id}/calificar/${selectedSeccion}`);
                          }}
                        >
                          Calificar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal nueva sección */}
      <Modal open={newSeccionModal} onClose={() => setNewSeccionModal(false)} title="Nueva sección">
        <div className="space-y-4">
          <Input
            label="Nombre de la sección"
            value={newSeccionNombre}
            onChange={(e) => setNewSeccionNombre(e.target.value)}
            placeholder="Ej: Grupo A"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSeccion()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewSeccionModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateSeccion} loading={newSeccionLoading}>Crear</Button>
          </div>
        </div>
      </Modal>

      {/* Modal nueva actividad */}
      <Modal open={newActModal} onClose={() => setNewActModal(false)} title="Nueva actividad">
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={newAct.nombre}
            onChange={(e) => setNewAct((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Lab1: Cálculo de subredes"
          />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Tipo</label>
            <div className="flex gap-4">
              {(['individual', 'grupal'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={newAct.tipo === t}
                    onChange={() => setNewAct((f) => ({ ...f, tipo: t }))}
                    className="text-uao-mid"
                  />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <Input
            label="Peso en nota final (%)"
            type="number"
            min={1}
            max={100}
            value={newAct.peso_nota_final}
            onChange={(e) => setNewAct((f) => ({ ...f, peso_nota_final: Number(e.target.value) }))}
          />
          {actError && <p className="text-sm text-uao-accent">{actError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewActModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateActividad} loading={newActLoading}>Crear</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
