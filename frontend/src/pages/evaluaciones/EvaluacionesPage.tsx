import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCheck, PencilLine, Save } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { actividadesApi } from '../../api/actividades';
import { cursosApi } from '../../api/cursos';
import { criteriosApi } from '../../api/criterios';
import { equiposApi } from '../../api/equipos';
import { seccionesApi } from '../../api/secciones';
import { useCourseStore } from '../../store/courseStore';
import { Aspecto, Curso } from '../../types';

interface ProjectOption {
  id: number;
  nombre: string;
  cursoId: number;
  cursoNombre: string;
  actividadId: number;
  actividadNombre: string;
  seccionId: number;
  seccionNombre: string;
  miembros: string[];
  calificado: boolean;
  notaTotal: number | null;
}

export default function EvaluacionesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCourseId } = useCourseStore();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [aspectos, setAspectos] = useState<Aspecto[]>([]);
  const [activeTab, setActiveTab] = useState<'grupal' | 'individual'>('grupal');

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const cursoIdParam = Number(searchParams.get('cursoId') ?? selectedCourseId ?? 0);
        if (!cursoIdParam) {
          setProjects([]);
          setLoading(false);
          return;
        }

        const [cursoActual, secciones, actividades] = await Promise.all([
          cursosApi.get(cursoIdParam),
          seccionesApi.list(cursoIdParam),
          actividadesApi.list(cursoIdParam),
        ]);

        setCurso(cursoActual);

        const actividadesGrupales = actividades.filter((actividad) => actividad.tipo === 'grupal');
        const resultados: ProjectOption[] = [];

        for (const actividad of actividadesGrupales) {
          for (const seccion of secciones) {
            const equipos = await equiposApi.list(actividad.id, seccion.id);

            for (const equipo of equipos) {
              resultados.push({
                id: equipo.id,
                nombre: equipo.nombre,
                cursoId: cursoIdParam,
                cursoNombre: cursoActual.nombre,
                actividadId: actividad.id,
                actividadNombre: actividad.nombre,
                seccionId: seccion.id,
                seccionNombre: seccion.nombre,
                miembros: equipo.miembros.map((m) => m.nombre_completo),
                calificado: equipo.calificado,
                notaTotal: equipo.nota_total,
              });
            }
          }
        }

        setProjects(resultados);

        const projectId = Number(searchParams.get('projectId') ?? resultados[0]?.id ?? 0);
        const currentProject = resultados.find((project) => project.id === projectId) ?? resultados[0] ?? null;
        setSelectedProjectId(currentProject?.id ?? null);
      } catch (error) {
        console.error('Error cargando datos de evaluación:', error);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    void loadProjects();
  }, [searchParams, selectedCourseId]);

  useEffect(() => {
    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    if (!selectedProject) {
      setAspectos([]);
      return;
    }

    const loadCriterios = async () => {
      try {
        const resp = await criteriosApi.get(selectedProject.actividadId);
        setAspectos(resp.aspectos);
      } catch (error) {
        console.error('Error cargando rubrica del proyecto:', error);
        setAspectos([]);
      }
    };

    void loadCriterios();
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const totalCriterios = aspectos.reduce((total, aspecto) => total + aspecto.criterios.length, 0);

  return (
    <AppLayout>
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-[1400px] p-0 shadow-sm">
          <div className="px-5 py-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Módulo de Evaluación</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {curso ? `Evaluación bajo los criterios ABET del curso ${curso.nombre}` : 'Cargando proyectos...'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate('/proyectos')}>
                ← Volver
              </Button>
            </div>

            <div className="mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <label className="w-full text-sm text-gray-700">
                <span className="mb-1 block text-gray-800">Proyecto a evaluar</span>
                <div className="relative">
                  <select
                    value={selectedProjectId ?? ''}
                    onChange={(event) => setSelectedProjectId(Number(event.target.value) || null)}
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                    disabled={loading || projects.length === 0}
                  >
                    {!projects.length ? (
                      <option value="">No hay proyectos disponibles</option>
                    ) : (
                      projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.nombre} · {project.seccionNombre}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </label>
            </div>

            {!loading && selectedProject && (
              <>
                <div className="mb-5 inline-flex rounded-lg border border-[#e5e7eb] bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setActiveTab('grupal')}
                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                      activeTab === 'grupal'
                        ? 'bg-[#9E0B0F] text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <CheckCheck size={15} />
                    Evaluación Grupal
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('individual')}
                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                      activeTab === 'individual'
                        ? 'bg-[#9E0B0F] text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <PencilLine size={15} />
                    Evaluación Individual
                  </button>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.6fr_0.7fr]">
                  <div className="space-y-5">
                    {aspectos.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                        No hay criterios definidos para esta actividad todavía.
                      </div>
                    ) : (
                      aspectos.map((aspecto, index) => (
                        <section key={aspecto.id} className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                          <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="rounded-md bg-[#9E0B0F]/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9E0B0F]">
                                {index + 1}
                              </div>
                              <span className="text-[15px] font-semibold text-gray-800">{aspecto.nombre}</span>
                            </div>

                            <Badge variant="neutral">{aspecto.criterios.length} criterios</Badge>
                          </div>

                          <div className="divide-y divide-[#e5e7eb]">
                            {aspecto.criterios.map((criterio) => (
                              <div key={criterio.id} className="flex items-center gap-4 px-4 py-3">
                                <div className="flex min-w-[110px] items-center justify-between gap-2 text-sm font-medium text-gray-800">
                                  <span>{criterio.orden}</span>
                                </div>

                                <div className="flex-1 text-sm text-gray-800">{criterio.texto}</div>

                                <div className="flex items-center gap-3">
                                  <div className="w-[110px] text-right text-xs font-medium text-gray-600">
                                    {criterio.peso_porcentaje}%
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))
                    )}
                  </div>

                  <aside className="space-y-5">
                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Resumen del proyecto</span>
                      </div>

                      <div className="mb-5 flex items-center justify-center">
                        <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-[9px] border-[#f6d4d4] bg-[#fff]">
                          <div className="absolute inset-[9px] rounded-full border-[7px] border-transparent border-t-[#f6d4d4] border-r-[#f6d4d4]" />
                          <span className="text-[2rem] font-bold text-[#9E0B0F]">{selectedProject.calificado ? '100%' : '0%'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-green-50 p-3 text-center">
                          <div className="text-2xl font-bold text-green-700">{selectedProject.calificado ? 1 : 0}</div>
                          <div className="text-[11px] font-medium text-green-700">Calificado</div>
                        </div>
                        <div className="rounded-lg bg-red-50 p-3 text-center">
                          <div className="text-2xl font-bold text-red-700">{totalCriterios}</div>
                          <div className="text-[11px] font-medium text-red-700">Criterios</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Equipo</span>
                        <Badge variant="neutral">{selectedProject.miembros.length} miembros</Badge>
                      </div>

                      <div className="space-y-2">
                        {selectedProject.miembros.map((member, index) => (
                          <div key={`${member}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            {member}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                      <Button
                        variant="primary"
                        className="w-full justify-center rounded-lg bg-[#9E0B0F] py-3 font-semibold text-white hover:bg-[#82090d]"
                        onClick={() =>
                          navigate(
                            `/actividades/${selectedProject.actividadId}/calificar/${selectedProject.seccionId}`
                          )
                        }
                      >
                        <Save size={16} />
                        Ir a calificar
                      </Button>
                    </div>
                  </aside>
                </div>
              </>
            )}

            {!loading && !selectedProject && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                No hay proyectos reales para evaluar en este curso.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
