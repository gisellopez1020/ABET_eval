import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Loader2, UploadCloud,
} from 'lucide-react';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { actividadesApi } from '../../api/actividades';
import { cursosApi } from '../../api/cursos';
import { apiErrorMessage } from '../../api/errors';
import { reportesApi } from '../../api/reportes';
import { seccionesApi } from '../../api/secciones';
import { useCourseStore } from '../../store/courseStore';
import {
  Actividad, Curso, DetalleXlsxResponse, ReporteABETResponse, ReporteActividadResponse, Seccion,
} from '../../types';
import { MIME_XLSX, base64ABlob, descargarBlob } from '../../utils/descarga';
import { DistribucionNivel, NIVELES, Nivel, PestanasNivel } from '../Reports/distribucion';

const SELECT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10 disabled:bg-gray-50 disabled:text-gray-400';

const TOOLTIP_SIN_ACTIVIDAD = 'Elige una actividad específica (no "Todas") para exportar';

type EstadoDetalle =
  | { fase: 'generando' }
  | { fase: 'listo'; respuesta: DetalleXlsxResponse }
  | { fase: 'error'; mensaje: string };

// Análisis por actividad puntual. Con "Todas las actividades" muestra el reporte
// agregado del curso (el mismo de Reportes ABET); las exportaciones exigen una actividad.
export function EstadisticasPage() {
  const cursoActivo = useCourseStore((s) => s.selectedCourseId);

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cursoId, setCursoId] = useState<number | null>(null);
  const [seccionId, setSeccionId] = useState<number | ''>('');
  const [actividadId, setActividadId] = useState<number | ''>('');

  const [reporte, setReporte] = useState<ReporteABETResponse | ReporteActividadResponse | null>(null);
  const [nivel, setNivel] = useState<Nivel>('criterios');
  const [loadingCursos, setLoadingCursos] = useState(true);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exportandoResumen, setExportandoResumen] = useState(false);
  const [detalle, setDetalle] = useState<EstadoDetalle | null>(null);

  // Cursos del docente; se preselecciona el activo del Dashboard si existe
  useEffect(() => {
    cursosApi
      .list()
      .then((lista) => {
        setCursos(lista);
        if (cursoActivo && lista.some((c) => c.id === cursoActivo)) setCursoId(cursoActivo);
      })
      .catch((e) => setError(apiErrorMessage(e, 'No se pudieron cargar tus asignaturas.')))
      .finally(() => setLoadingCursos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cascada: al cambiar de asignatura se cargan sus secciones y actividades
  useEffect(() => {
    setSecciones([]);
    setActividades([]);
    if (!cursoId) return;
    let vigente = true;
    Promise.all([seccionesApi.list(cursoId), actividadesApi.list(cursoId)])
      .then(([s, a]) => {
        if (!vigente) return;
        setSecciones(s);
        setActividades(a);
      })
      .catch((e) => vigente && setError(apiErrorMessage(e, 'No se pudieron cargar las secciones y actividades.')));
    return () => {
      vigente = false;
    };
  }, [cursoId]);

  // Reporte: agregado del curso con "Todas", o acotado a la actividad elegida
  useEffect(() => {
    setReporte(null);
    if (!cursoId) return;
    let vigente = true;
    const params = seccionId ? { seccion_id: seccionId } : undefined;
    setLoadingReporte(true);
    setError(null);
    (actividadId ? reportesApi.actividad(cursoId, actividadId, params) : reportesApi.abet(cursoId, params))
      .then((r) => vigente && setReporte(r))
      .catch((e) => vigente && setError(apiErrorMessage(e, 'No se pudo cargar el reporte.')))
      .finally(() => vigente && setLoadingReporte(false));
    return () => {
      vigente = false;
    };
  }, [cursoId, seccionId, actividadId]);

  const handleCurso = (value: string) => {
    setCursoId(value ? Number(value) : null);
    setSeccionId('');
    setActividadId('');
  };

  const handleExportarResumen = async () => {
    if (!cursoId || !actividadId) return;
    setExportandoResumen(true);
    setError(null);
    try {
      const { blob, nombre } = await reportesApi.resumenXlsx(
        cursoId, actividadId, seccionId ? { seccion_id: seccionId } : undefined,
      );
      descargarBlob(blob, nombre);
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo generar el resumen en Excel.'));
    } finally {
      setExportandoResumen(false);
    }
  };

  const handleGenerarDetalle = async () => {
    if (!cursoId || !actividadId) return;
    setDetalle({ fase: 'generando' });
    try {
      const respuesta = await reportesApi.detalleXlsx(cursoId, actividadId, seccionId || undefined);
      setDetalle({ fase: 'listo', respuesta });
    } catch (e) {
      setDetalle({ fase: 'error', mensaje: apiErrorMessage(e, 'No se pudo generar el detalle.') });
    }
  };

  const handleDescargarDetalle = () => {
    if (detalle?.fase !== 'listo') return;
    const { archivo_base64, nombre_archivo } = detalle.respuesta;
    descargarBlob(base64ABlob(archivo_base64, MIME_XLSX), nombre_archivo);
  };

  const cerrarDetalle = () => {
    if (detalle?.fase !== 'generando') setDetalle(null);
  };

  const actividad = actividades.find((a) => a.id === actividadId);
  const sinActividad = !actividad;
  const filas = reporte ? reporte[nivel] : [];
  const nivelActual = NIVELES.find((n) => n.id === nivel)!;

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f3f3f3] p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-uao-dark">Estadísticas ABET</h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Distribución de estudiantes por Criterio ABET y por Resultado de Aprendizaje en una actividad.
              </p>
            </div>
            <div className="flex gap-2">
              <span title={sinActividad ? TOOLTIP_SIN_ACTIVIDAD : undefined} className="inline-flex">
                <Button
                  variant="outline"
                  icon={<FileSpreadsheet size={17} />}
                  onClick={handleExportarResumen}
                  loading={exportandoResumen}
                  disabled={sinActividad || exportandoResumen}
                >
                  Exportar resumen
                </Button>
              </span>
              <span title={sinActividad ? TOOLTIP_SIN_ACTIVIDAD : undefined} className="inline-flex">
                <Button
                  icon={<UploadCloud size={17} />}
                  onClick={handleGenerarDetalle}
                  disabled={sinActividad || detalle?.fase === 'generando'}
                >
                  Generar detalle
                </Button>
              </span>
            </div>
          </div>

          {/* Selectores en cascada: Asignatura -> Sección / Actividad */}
          <div className="mb-5 grid gap-4 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-3">
            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Asignatura</span>
              <select
                value={cursoId ?? ''}
                onChange={(e) => handleCurso(e.target.value)}
                className={SELECT_CLASS}
                disabled={loadingCursos}
              >
                <option value="">{loadingCursos ? 'Cargando asignaturas…' : 'Selecciona una asignatura'}</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.codigo} · {c.periodo})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Sección</span>
              <select
                value={seccionId}
                onChange={(e) => setSeccionId(e.target.value ? Number(e.target.value) : '')}
                className={SELECT_CLASS}
                disabled={!cursoId}
              >
                <option value="">Todas las secciones</option>
                {secciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              <span className="mb-2 block">Actividad</span>
              <select
                value={actividadId}
                onChange={(e) => setActividadId(e.target.value ? Number(e.target.value) : '')}
                className={SELECT_CLASS}
                disabled={!cursoId}
              >
                <option value="">Todas las actividades</option>
                {actividades.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} ({a.tipo === 'grupal' ? 'grupal' : 'individual'})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {!cursoId ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400">
              Selecciona una asignatura para ver sus estadísticas.
            </div>
          ) : loadingReporte || !reporte ? (
            <div className="h-64 animate-pulse rounded-xl bg-gray-200" />
          ) : reporte.criterios.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400">
              <p>
                {actividad
                  ? 'Ningún aspecto de la rúbrica de esta actividad está vinculado a un Criterio ABET.'
                  : 'Ningún aspecto de las rúbricas del curso está vinculado a un Criterio ABET.'}
              </p>
              <p className="mt-1 text-sm">Vincula los aspectos desde la rúbrica de la actividad.</p>
            </div>
          ) : (
            <>
              <PestanasNivel
                nivel={nivel}
                onChange={setNivel}
                conteos={{ criterios: reporte.criterios.length, resultados: reporte.resultados.length }}
              />

              <p className="mb-4 text-xs text-gray-500">
                {actividad ? (
                  <>
                    <span className="font-semibold text-gray-700">{actividad.nombre}</span>
                    {nivel === 'criterios'
                      ? ': cada aspecto vinculado se evalúa en su propia escala de 0 a 5.'
                      : ': promedio ponderado de los Criterios vinculados en esta actividad; los demás Criterios del resultado se excluyen y el peso se renormaliza.'}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-gray-700">Todas las actividades</span>
                    {' '}(mismo cálculo que Reportes ABET).
                  </>
                )}
                {' '}En actividades grupales cada integrante recibe la nota de su equipo.
              </p>

              <DistribucionNivel filas={filas} rangos={reporte.rangos} columna={nivelActual.columna} />
            </>
          )}
        </div>
      </div>

      <Modal open={detalle !== null} onClose={cerrarDetalle} title="Detalle de la actividad">
        {detalle?.fase === 'generando' && (
          <div className="flex items-center gap-3 py-6 text-sm text-gray-700" role="status">
            <Loader2 size={22} className="animate-spin text-uao-mid" />
            Generando y sincronizando con tu Drive...
          </div>
        )}

        {detalle?.fase === 'error' && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{detalle.mensaje}</span>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={cerrarDetalle}>Cerrar</Button>
            </div>
          </div>
        )}

        {detalle?.fase === 'listo' && (
          <div className="space-y-4 py-2">
            {detalle.respuesta.drive.estado === 'error' ? (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">No se pudo sincronizar con Drive, pero puedes descargar el archivo.</p>
                  {detalle.respuesta.drive.detalle && (
                    <p className="mt-1 text-xs text-amber-700">{detalle.respuesta.drive.detalle}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">
                    Detalle sincronizado en tu Drive
                    {detalle.respuesta.drive.estado === 'simulado' && ' (modo simulado)'}
                  </p>
                  {detalle.respuesta.drive.enlace && (
                    <a
                      href={detalle.respuesta.drive.enlace}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs underline"
                    >
                      Abrir en Google Drive <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            )}

            <p className="break-all text-xs text-gray-500">{detalle.respuesta.nombre_archivo}</p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={cerrarDetalle}>Cerrar</Button>
              <Button icon={<Download size={17} />} onClick={handleDescargarDetalle}>
                Descargar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
