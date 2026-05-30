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
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Curso | null>(null);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [estudiantesCount, setEstudiantesCount] = useState<Record<number, number>>({});
  const [selectedSeccion, setSelectedSeccion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [newSeccionModal, setNewSeccionModal] = useState(false);
  const [newSeccionNombre, setNewSeccionNombre] = useState('');
  const [newSeccionLoading, setNewSeccionLoading] = useState(false);

  const [newActModal, setNewActModal] = useState(false);
  const [newAct, setNewAct] = useState<ActividadCreate>({ nombre: '', tipo: 'individual', peso_nota_final: 20 });
  const [newActLoading, setNewActLoading] = useState(false);
  const [actError, setActError] = useState('');

  useEffect(() => {
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
    }).finally(() => setLoading(false));
  }, [id]);

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
                <button
                  key={s.id}
                  onClick={() => setSelectedSeccion(s.id)}
                  className={`w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors ${selectedSeccion === s.id ? 'bg-blue-50 border-l-4 border-uao-mid' : ''}`}
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
                </button>
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
                  <button
                    key={a.id}
                    onClick={() => navigate(`/actividades/${a.id}`)}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
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
                  </button>
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
