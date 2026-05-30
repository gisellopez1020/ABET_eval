import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { cursosApi, CursoCreate } from '../../api/cursos';
import { Curso } from '../../types';

function CourseCard({ curso, onClick }: { curso: Curso; onClick: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-uao-dark leading-tight">{curso.nombre}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{curso.codigo} · {curso.periodo}</p>
        </div>
        <Badge variant={curso.activo ? 'success' : 'neutral'}>
          {curso.activo ? 'Activo' : 'Archivado'}
        </Badge>
      </div>

      {curso.ra_abet.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {curso.ra_abet.slice(0, 3).map((ra, i) => (
            <span key={i} className="text-xs bg-blue-50 text-uao-mid px-2 py-0.5 rounded">
              {ra.split(':')[0] || ra}
            </span>
          ))}
          {curso.ra_abet.length > 3 && (
            <span className="text-xs text-gray-400">+{curso.ra_abet.length - 3} más</span>
          )}
        </div>
      )}

      <Button variant="secondary" size="sm" className="w-full mt-2">
        Abrir curso
      </Button>
    </div>
  );
}

function CreateCourseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Curso) => void;
}) {
  const [form, setForm] = useState<CursoCreate>({
    nombre: '',
    codigo: '',
    periodo: '',
    ra_abet: [],
  });
  const [raInput, setRaInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addRa = () => {
    const val = raInput.trim();
    if (!val || form.ra_abet.length >= 10) return;
    setForm((f) => ({ ...f, ra_abet: [...f.ra_abet, val] }));
    setRaInput('');
  };

  const removeRa = (i: number) =>
    setForm((f) => ({ ...f, ra_abet: f.ra_abet.filter((_, j) => j !== i) }));

  const handleSubmit = async () => {
    if (!form.nombre || !form.codigo || !form.periodo) {
      setError('Nombre, código y período son obligatorios');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const created = await cursosApi.create(form);
      onCreated(created);
      onClose();
      setForm({ nombre: '', codigo: '', periodo: '', ra_abet: [] });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al crear el curso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo curso">
      <div className="space-y-4">
        <Input
          label="Nombre del curso"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          placeholder="Ej: Redes de Computadoras"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Código"
            value={form.codigo}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
            placeholder="IS-402"
          />
          <Input
            label="Período"
            value={form.periodo}
            onChange={(e) => setForm((f) => ({ ...f, periodo: e.target.value }))}
            placeholder="2025-3B"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Resultados de aprendizaje ABET
          </label>
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-uao-mid"
              placeholder="Ej: RA1: Análisis de problemas"
              value={raInput}
              onChange={(e) => setRaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRa()}
            />
            <Button variant="secondary" size="sm" onClick={addRa} disabled={form.ra_abet.length >= 10}>
              +
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.ra_abet.map((ra, i) => (
              <span
                key={i}
                className="flex items-center gap-1 bg-blue-50 text-uao-mid text-xs px-2.5 py-1 rounded-full"
              >
                {ra}
                <button onClick={() => removeRa(i)} className="ml-1 text-uao-mid/60 hover:text-uao-accent">×</button>
              </span>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-uao-accent">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={loading}>Crear curso</Button>
        </div>
      </div>
    </Modal>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    cursosApi.list().then(setCursos).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <Header crumbs={[{ label: 'Mis cursos' }]} />
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">Mis cursos</h2>
            <p className="text-sm text-gray-500 mt-0.5">{cursos.length} curso{cursos.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : cursos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No tienes cursos aún.</p>
            <p className="text-sm mt-1">Crea tu primer curso con el botón +.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cursos.map((c) => (
              <CourseCard
                key={c.id}
                curso={c}
                onClick={() => navigate(`/cursos/${c.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setModalOpen(true)}
        className="fixed bottom-8 right-8 h-14 w-14 bg-uao-mid text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-uao-dark transition-colors focus:outline-none focus:ring-4 focus:ring-uao-mid/30"
        title="Nuevo curso"
      >
        +
      </button>

      <CreateCourseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => setCursos((prev) => [c, ...prev])}
      />
    </AppLayout>
  );
}
