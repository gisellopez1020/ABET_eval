import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../../components/Layout/AppLayout';
import { Header } from '../../../components/Layout/Header';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';
import { Toggle } from '../../../components/ui/Toggle';
import { actividadesApi } from '../../../api/actividades';
import { cursosApi } from '../../../api/cursos';
import { seccionesApi } from '../../../api/secciones';
import { equiposApi } from '../../../api/equipos';
import { criteriosApi } from '../../../api/criterios';
import { calificacionesApi, ValorCriterio } from '../../../api/calificaciones';
import { Actividad, ModoCalificacionResponse, ModoCalificacionItem, Aspecto } from '../../../types';

export function GradingSelectionPage() {
  const { actividadId, seccionId } = useParams<{ actividadId: string; seccionId: string }>();
  const actId = Number(actividadId);
  const secId = Number(seccionId);
  const navigate = useNavigate();

  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [cursoNombre, setCursoNombre] = useState('');
  const [seccionNombre, setSeccionNombre] = useState('');
  const [modo, setModo] = useState<ModoCalificacionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [soloSinCalificar, setSoloSinCalificar] = useState(false);

  const [masivoModal, setMasivoModal] = useState(false);
  const [aspectos, setAspectos] = useState<Aspecto[]>([]);
  const [valoresMasivos, setValoresMasivos] = useState<Record<number, 0 | 1>>({});
  const [masivoLoading, setMasivoLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      actividadesApi.get(actId),
      equiposApi.modoCalificacion(actId, secId),
    ]).then(([a, m]) => {
      setActividad(a);
      setModo(m);
      cursosApi.get(a.curso_id).then((c) => setCursoNombre(c.nombre));
      seccionesApi.list(a.curso_id).then((ss) => {
        const s = ss.find((x) => x.id === secId);
        if (s) setSeccionNombre(s.nombre);
      });
    }).finally(() => setLoading(false));
  }, [actId, secId]);

  const openMasivo = async () => {
    const resp = await criteriosApi.get(actId);
    setAspectos(resp.aspectos);
    const init: Record<number, 0 | 1> = {};
    resp.aspectos.forEach((asp) => asp.criterios.forEach((c) => { init[c.id] = 0; }));
    setValoresMasivos(init);
    setMasivoModal(true);
  };

  const handleMasivo = async () => {
    setMasivoLoading(true);
    try {
      const criterios: ValorCriterio[] = Object.entries(valoresMasivos).map(([id, valor]) => ({
        criterio_id: Number(id),
        valor,
      }));
      await calificacionesApi.masivo(actId, criterios, secId);
      const m = await equiposApi.modoCalificacion(actId, secId);
      setModo(m);
      setMasivoModal(false);
    } finally {
      setMasivoLoading(false);
    }
  };

  const items = modo?.items ?? [];
  const filtered = items.filter((item) => {
    const matchSearch = item.nombre.toLowerCase().includes(search.toLowerCase()) ||
      item.miembros.some((m) => m.nombre_completo.toLowerCase().includes(search.toLowerCase()));
    const matchFiltro = soloSinCalificar ? !item.calificado : true;
    return matchSearch && matchFiltro;
  });

  const goToTemplate = (item: ModoCalificacionItem, index: number) => {
    navigate(`/actividades/${actId}/calificar/${secId}/${item.id}`, {
      state: { items, currentIndex: index, tipo: modo?.tipo },
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]} />
        <div className="p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  const esGrupal = modo?.tipo === 'grupal';
  const sinCalificar = items.filter((i) => !i.calificado).length;

  return (
    <AppLayout>
      <Header
        crumbs={[
          { label: 'Mis cursos', to: '/dashboard' },
          { label: cursoNombre, to: `/cursos/${actividad?.curso_id}` },
          { label: actividad?.nombre || '' },
          { label: seccionNombre },
        ]}
      />
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">{actividad?.nombre}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{seccionNombre} · {esGrupal ? 'Actividad grupal' : 'Actividad individual'}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/cursos/${actividad?.curso_id}`)}>
            ← Volver
          </Button>
        </div>

        {/* Progreso */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progreso de calificación</span>
            <span className="text-sm font-bold text-uao-dark">
              {modo?.calificados ?? 0} / {modo?.total ?? 0} calificados
            </span>
          </div>
          <ProgressBar value={modo?.calificados ?? 0} max={modo?.total ?? 1} />
        </div>

        {/* Controles */}
        <div className="flex gap-3 mb-4">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-uao-mid"
            placeholder={`Buscar ${esGrupal ? 'equipo o integrante' : 'estudiante'}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!esGrupal && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={soloSinCalificar}
                onChange={(e) => setSoloSinCalificar(e.target.checked)}
                className="rounded"
              />
              Solo pendientes
            </label>
          )}
          {esGrupal && sinCalificar > 0 && (
            <Button variant="secondary" size="sm" onClick={openMasivo}>
              Aplicar a todos los equipos
            </Button>
          )}
        </div>

        {/* Lista */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="text-center py-10 text-sm text-gray-400">Sin resultados</p>
          )}
          {filtered.map((item) => {
            const originalIndex = items.findIndex((x) => x.id === item.id);
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{item.nombre}</span>
                    <Badge variant={item.calificado ? 'success' : 'warning'}>
                      {item.calificado ? `✓ ${Number(item.nota_total ?? 0).toFixed(2)}` : 'Pendiente'}
                    </Badge>
                  </div>
                  {esGrupal && item.miembros.length > 0 && (
                    <p className="text-xs text-gray-500">
                      {item.miembros.map((m) => m.nombre_completo).join(' · ')}
                    </p>
                  )}
                  {!esGrupal && item.miembros[0] && (
                    <p className="text-xs text-gray-500">{item.miembros[0].codigo_estudiante}</p>
                  )}
                </div>
                <Button
                  variant={item.calificado ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => goToTemplate(item, originalIndex)}
                >
                  {item.calificado ? 'Revisar' : 'Calificar'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal masivo */}
      <Modal open={masivoModal} onClose={() => setMasivoModal(false)} title="Aplicar calificación masiva" maxWidth="max-w-2xl">
        <p className="text-sm text-gray-500 mb-4">
          Esta calificación se aplicará a todos los equipos que aún no han sido calificados.
        </p>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {aspectos.map((asp) => (
            <div key={asp.id}>
              <p className="text-sm font-semibold text-uao-dark mb-2">{asp.nombre}</p>
              <div className="space-y-2">
                {asp.criterios.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <Toggle
                      value={valoresMasivos[c.id] ?? 0}
                      onChange={(v) => setValoresMasivos((prev) => ({ ...prev, [c.id]: v }))}
                    />
                    <span className="text-sm text-gray-700 flex-1">{c.texto}</span>
                    <span className="text-xs text-gray-400">{Number(c.peso_porcentaje)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="ghost" onClick={() => setMasivoModal(false)}>Cancelar</Button>
          <Button onClick={handleMasivo} loading={masivoLoading}>Aplicar</Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
