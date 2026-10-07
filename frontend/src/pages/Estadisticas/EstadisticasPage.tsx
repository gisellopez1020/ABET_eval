import { useState } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { apiErrorMessage } from '../../api/errors';
import { reportesApi } from '../../api/reportes';
import { MIME_XLSX, base64ABlob, descargarBlob } from '../../utils/descarga';
import { DistribucionNivel, NIVELES, Nivel, PestanasNivel } from '../Reports/distribucion';
import { DetalleActividadModal, EstadoDetalle } from './components/DetalleActividadModal';
import { FiltrosEstadisticas } from './components/FiltrosEstadisticas';
import { useReporteEstadisticas } from './hooks/useReporteEstadisticas';

const TOOLTIP_SIN_ACTIVIDAD = 'Elige una actividad específica (no "Todas") para exportar';

// Análisis por actividad puntual. Con "Todas las actividades" muestra el reporte
// agregado del curso (el mismo de Reportes ABET); las exportaciones exigen una actividad.
export function EstadisticasPage() {
  const {
    cursos,
    secciones,
    actividades,
    cursoId,
    seccionId,
    setSeccionId,
    actividadId,
    setActividadId,
    handleCurso,
    reporte,
    loadingCursos,
    loadingReporte,
    error,
    setError,
  } = useReporteEstadisticas();

  const [nivel, setNivel] = useState<Nivel>('criterios');
  const [exportandoResumen, setExportandoResumen] = useState(false);
  const [detalle, setDetalle] = useState<EstadoDetalle | null>(null);

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
      <div className="p-6">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-6 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Estadísticas ABET</h1>
              <p className="mt-1 text-sm text-gray-500">
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

          <FiltrosEstadisticas
            cursos={cursos}
            secciones={secciones}
            actividades={actividades}
            cursoId={cursoId}
            seccionId={seccionId}
            actividadId={actividadId}
            loadingCursos={loadingCursos}
            onCurso={handleCurso}
            onSeccion={setSeccionId}
            onActividad={setActividadId}
          />

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

      <DetalleActividadModal detalle={detalle} onClose={cerrarDetalle} onDescargar={handleDescargarDetalle} />
    </AppLayout>
  );
}
