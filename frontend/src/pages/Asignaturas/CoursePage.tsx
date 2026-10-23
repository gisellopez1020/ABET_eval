import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { actividadesApi } from '../../api/actividades';
import { estudiantesApi } from '../../api/estudiantes';
import { Curso, Seccion, Actividad } from '../../types';
import { ActividadesPanel } from './components/ActividadesPanel';
import { ActividadFormModal } from './components/ActividadFormModal';
import { CourseFormModal } from './components/CourseFormModal';
import { NuevaSeccionModal } from './components/NuevaSeccionModal';
import { SeccionesPanel } from './components/SeccionesPanel';
import { apiErrorMessage } from '../../api/errors';

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
  const [editModal, setEditModal] = useState(false);

  const [newSeccionModal, setNewSeccionModal] = useState(false);
  const [newSeccionNombre, setNewSeccionNombre] = useState('');
  const [newSeccionLoading, setNewSeccionLoading] = useState(false);
  const [seccionError, setSeccionError] = useState('');

  // Modal de actividad: crear una nueva o editar una existente (null = cerrado)
  const [actividadModal, setActividadModal] = useState<
    { mode: 'create' } | { mode: 'edit'; actividad: Actividad } | null
  >(null);

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
    }).catch(() => {
      setCurso(null);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleCreateSeccion = async () => {
    if (!newSeccionNombre.trim()) return;
    setNewSeccionLoading(true);
    setSeccionError('');
    try {
      const s = await seccionesApi.create(id, { nombre: newSeccionNombre.trim() });
      setSecciones((prev) => [...prev, s]);
      setEstudiantesCount((prev) => ({ ...prev, [s.id]: 0 }));
      setSelectedSeccion(s.id);
      setNewSeccionModal(false);
      setNewSeccionNombre('');
    } catch (e) {
      setSeccionError(apiErrorMessage(e, 'No se pudo crear la sección'));
    } finally {
      setNewSeccionLoading(false);
    }
  };

  // La lista se actualiza con lo que devuelve el backend, sin recargar la página
  const handleActividadGuardada = (a: Actividad) => {
    setActividades((prev) =>
      prev.some((x) => x.id === a.id) ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a]
    );
    setActividadModal(null);
  };

  if (loading) {
    return (
      <AppLayout crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]}>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </AppLayout>
    );
  }

  if (!curso) return null;

  return (
    <AppLayout
      crumbs={[
        { label: 'Mis cursos', to: '/dashboard' },
        { label: curso.nombre },
      ]}
    >
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{curso.nombre}</h2>
            <p className="text-sm text-gray-500">{curso.codigo} · {curso.periodo}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" 
              className="rounded-lg border border-gray-200 bg-white text-gray-700 outline-none transition hover:border-[#9E0B0F] hover:bg-white active:bg-white focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
              icon={<Pencil size={14} />} onClick={() => setEditModal(true)}>
              Editar asignatura
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate(`/cursos/${id}/reportes`)}>
              Ver reportes ABET
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Secciones */}
          <SeccionesPanel
            id={id}
            secciones={secciones}
            estudiantesCount={estudiantesCount}
            selectedSeccion={selectedSeccion}
            setSelectedSeccion={setSelectedSeccion}
            setSeccionError={setSeccionError}
            setNewSeccionModal={setNewSeccionModal}
          />

          {/* Actividades */}
          <ActividadesPanel
            actividades={actividades}
            secciones={secciones}
            selectedSeccion={selectedSeccion}
            onNueva={() => setActividadModal({ mode: 'create' })}
            onEditar={(actividad) => setActividadModal({ mode: 'edit', actividad })}
          />
        </div>
      </div>

      {/* Modal nueva sección */}
      <NuevaSeccionModal
        newSeccionModal={newSeccionModal}
        setNewSeccionModal={setNewSeccionModal}
        newSeccionNombre={newSeccionNombre}
        setNewSeccionNombre={setNewSeccionNombre}
        seccionError={seccionError}
        newSeccionLoading={newSeccionLoading}
        handleCreateSeccion={handleCreateSeccion}
      />

      {/* Modal nueva actividad / editar actividad */}
      <ActividadFormModal
        open={actividadModal !== null}
        mode={actividadModal?.mode ?? 'create'}
        cursoId={id}
        actividad={actividadModal?.mode === 'edit' ? actividadModal.actividad : null}
        secciones={secciones}
        onClose={() => setActividadModal(null)}
        onSaved={handleActividadGuardada}
      />

      <CourseFormModal
        open={editModal}
        mode="edit"
        course={curso}
        onClose={() => setEditModal(false)}
        onSaved={(updated) => {
          setCurso(updated);
          setEditModal(false);
        }}
      />
    </AppLayout>
  );
}
