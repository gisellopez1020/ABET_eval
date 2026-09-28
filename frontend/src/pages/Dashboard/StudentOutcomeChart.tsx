import { useMemo } from 'react';

import { Curso, ReporteABETResponse } from '../../types';
import { cumplimientoPorRA } from '../../utils/cumplimiento';
import { EmptyState } from './EmptyState';

/** Reporte del curso al que pertenece; reporte null = falló la carga. */
export interface ReporteCurso {
  cursoId: number;
  reporte: ReporteABETResponse | null;
}

interface StudentOutcomeChartProps {
  curso: Curso | null;
  reporteCurso: ReporteCurso | null;
}

const MARCAS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

export function StudentOutcomeChart({
  curso,
  reporteCurso,
}: StudentOutcomeChartProps) {
  // Mientras se carga el reporte del curso recién seleccionado, reporteCurso aún es del anterior
  const cargando = Boolean(curso) && reporteCurso?.cursoId !== curso?.id;
  const reporte = cargando ? null : reporteCurso?.reporte ?? null;

  const items = useMemo(
    () => (curso ? cumplimientoPorRA(curso.ra_abet ?? [], reporte) : []),
    [curso, reporte]
  );
  const hayDatos = items.some((item) => item.porcentaje !== null);
  const hayExtras = items.some((item) => !item.seleccionado);

  let vacio: string | null = null;
  if (!curso) {
    vacio = 'Seleccione una materia para visualizar la información.';
  } else if (cargando) {
    vacio = 'Cargando cumplimiento...';
  } else if (!reporte) {
    vacio = 'No se pudo cargar el reporte ABET de este curso.';
  } else if (items.length === 0) {
    vacio = 'Este curso no tiene Resultados de Aprendizaje seleccionados.';
  } else if (!hayDatos) {
    vacio = 'Aún no hay calificaciones vinculadas a los Resultados de Aprendizaje de este curso.';
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-8 text-[12px] font-semibold text-gray-800">
        Cumplimiento por Student Outcome
      </h2>

      {vacio ? (
        <EmptyState message={vacio} />
      ) : (
        <>
          <div className="relative ml-5 h-[190px] border-l border-b border-gray-200">
            <div className="absolute inset-0 flex flex-col justify-between">
              {MARCAS.map((value) => (
                <div
                  key={value}
                  className="relative w-full border-t border-dashed border-gray-200"
                >
                  <span className="absolute -left-5 -top-[5px] text-[9px] text-gray-400">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="absolute inset-0 flex items-end gap-2 px-4">
              {items.map((item) => (
                <div
                  key={item.codigo}
                  className="flex h-full flex-1 flex-col items-center justify-end"
                  title={
                    `${item.codigo}${item.descripcion ? ` — ${item.descripcion}` : ''}\n` +
                    (item.porcentaje === null
                      ? 'Sin estudiantes evaluados'
                      : `${item.porcentaje}% de cumplimiento`) +
                    (item.seleccionado ? '' : '\nNo está seleccionado en el curso')
                  }
                >
                  {item.porcentaje === null ? (
                    <span className="mb-1 whitespace-nowrap text-[8px] text-gray-400">
                      sin datos
                    </span>
                  ) : (
                    <>
                      <span
                        className={`mb-0.5 text-[9px] font-medium ${
                          item.seleccionado ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {item.porcentaje}%
                      </span>
                      <div
                        className={`w-full max-w-[32px] rounded-t ${
                          item.seleccionado ? 'bg-[#9E0B0F]' : 'bg-[#9E0B0F]/25'
                        }`}
                        style={{ height: `${item.porcentaje}%` }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="absolute -bottom-4 left-0 right-0 flex gap-2 px-4">
              {items.map((item) => (
                <span
                  key={item.codigo}
                  className={`flex-1 text-center text-[9px] ${
                    item.seleccionado ? 'text-gray-500' : 'italic text-gray-400'
                  }`}
                >
                  {item.codigo}
                </span>
              ))}
            </div>
          </div>

          {hayExtras && (
            <p className="mt-7 text-[9px] text-gray-400">
              En gris claro: Resultados de Aprendizaje con calificaciones que no están
              seleccionados en el curso.
            </p>
          )}
        </>
      )}
    </section>
  );
}
