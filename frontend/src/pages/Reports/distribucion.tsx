// Piezas compartidas por Reportes ABET (ReportsPage) y Estadísticas ABET (EstadisticasPage):
// series por rango, gráfica de barras apiladas, tabla por nivel y pestañas Criterio / RA.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { RangoCalificacion, ReporteCriterio, ReporteRA } from '../../types';
import { colorRango } from '../../utils/rangos';

export const SIN_CLASIFICAR = 'Sin clasificar';
const COLOR_SIN_CLASIFICAR = '#9CA3AF';

export type Nivel = 'criterios' | 'resultados';
export type Fila = ReporteCriterio | ReporteRA;

export const NIVELES: { id: Nivel; titulo: string; columna: string }[] = [
  { id: 'criterios', titulo: 'Por Criterio ABET', columna: 'Criterio ABET' },
  { id: 'resultados', titulo: 'Por Resultado de Aprendizaje', columna: 'Resultado de aprendizaje' },
];

/** Detalle bajo la descripción: RA padre del Criterio, o Criterios usados en el RA. */
export function detalle(fila: Fila): string {
  if ('criterios_con_evidencia' in fila) {
    const sin = fila.criterios_sin_evidencia.length
      ? ` · sin evidencia: ${fila.criterios_sin_evidencia.join(', ')}`
      : '';
    return `Calculado con ${fila.criterios_con_evidencia.join(', ')}${sin}`;
  }
  return fila.codigo_padre ? `RA ${fila.codigo_padre} · peso ${fila.peso}` : '';
}

export interface Serie {
  nombre: string;
  color: string;
  valor: (f: Fila) => number;
}

/** Una serie por rango del curso (más "Sin clasificar" si alguna fila lo tiene). */
export function seriesDe(filas: Fila[], rangos: RangoCalificacion[]): Serie[] {
  const conSinClasificar = filas.some((f) => f.sin_clasificar > 0);
  return [
    ...rangos.map((r, i) => ({
      nombre: r.etiqueta,
      color: colorRango(i, rangos.length),
      valor: (f: Fila) => f.rangos[r.etiqueta] ?? 0,
    })),
    ...(conSinClasificar
      ? [{ nombre: SIN_CLASIFICAR, color: COLOR_SIN_CLASIFICAR, valor: (f: Fila) => f.sin_clasificar }]
      : []),
  ];
}

/** Gráfica de barras apiladas; la usan la pantalla y la copia oculta que se exporta al PDF. */
export function GraficaDistribucion({
  filas,
  series,
  ancho = '100%',
  animar = true,
}: {
  filas: Fila[];
  series: Serie[];
  ancho?: number | `${number}%`;
  animar?: boolean;
}) {
  const descripcionDe = (codigo: string) => filas.find((f) => f.codigo === codigo)?.descripcion ?? '';

  return (
    <ResponsiveContainer width={ancho} height={Math.max(200, filas.length * 40 + 80)}>
      <BarChart data={filas} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="codigo" width={60} tick={{ fontSize: 12 }} />
        <Tooltip
          labelFormatter={(codigo: string) => `${codigo} · ${descripcionDe(codigo)}`}
          contentStyle={{ maxWidth: 360, whiteSpace: 'normal' }}
        />
        <Legend />
        {/* dataKey como función: las etiquetas con puntos ("0.0-2.9") se tomarían como rutas */}
        {series.map((s) => (
          <Bar
            key={s.nombre}
            name={s.nombre}
            dataKey={s.valor}
            stackId="rangos"
            fill={s.color}
            isAnimationActive={animar}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistribucionNivel({
  filas,
  rangos,
  columna,
}: {
  filas: Fila[];
  rangos: RangoCalificacion[];
  columna: string;
}) {
  const series = seriesDe(filas, rangos);

  return (
    <>
      {/* Gráfica */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-uao-dark mb-4">Distribución de estudiantes por rango</h3>
        <GraficaDistribucion filas={filas} series={series} />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{columna}</th>
                {series.map((s) => (
                  <th
                    key={s.nombre}
                    className="text-center px-4 py-3 font-medium whitespace-nowrap"
                    style={{ color: s.color }}
                  >
                    {s.nombre}
                  </th>
                ))}
                <th className="text-center px-4 py-3 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filas.map((fila, i) => (
                <tr key={fila.codigo} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3 max-w-md">
                    <div className="text-gray-800">
                      <span className="font-semibold">{fila.codigo}</span>
                      <span className="text-gray-600 line-clamp-2" title={fila.descripcion}>
                        {fila.descripcion}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{detalle(fila)}</div>
                  </td>
                  {series.map((s) => (
                    <td key={s.nombre} className="px-4 py-3 text-center font-semibold" style={{ color: s.color }}>
                      {s.valor(fila)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center text-gray-700 font-bold">{fila.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Pestañas Por Criterio ABET / Por Resultado de Aprendizaje, con la cantidad de filas de cada nivel. */
export function PestanasNivel({
  nivel,
  onChange,
  conteos,
}: {
  nivel: Nivel;
  onChange: (nivel: Nivel) => void;
  conteos: Record<Nivel, number>;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-gray-200 mb-6">
      {NIVELES.map((n) => (
        <button
          key={n.id}
          role="tab"
          aria-selected={nivel === n.id}
          onClick={() => onChange(n.id)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            nivel === n.id
              ? 'border-uao-accent text-uao-dark'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {n.titulo}
          <span className="ml-2 text-xs text-gray-400">{conteos[n.id]}</span>
        </button>
      ))}
    </div>
  );
}
