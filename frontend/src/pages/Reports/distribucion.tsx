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

// Leyenda de Recharts (DefaultLegendContent, fuente heredada de 16px): una línea mide 24px y
// cada ítem ocupa ícono 14 + 4 + margen 10 más el texto. El ancho por carácter es holgado a
// propósito: sobrestimar solo deja blanco, subestimar le quita alto a las barras.
const MARGEN_X_GRAFICA = 20;
export const ALTO_LINEA_LEYENDA = 24;
const ANCHO_CARACTER_LEYENDA = 9;
const EXTRA_ITEM_LEYENDA = 28;
// Aire bajo la leyenda en la copia exportada
export const MARGEN_INFERIOR_PDF = 8;

/** Líneas que ocupa la leyenda: los ítems se acomodan uno tras otro y saltan de línea al no caber. */
export function lineasLeyenda(nombres: string[], anchoDisponible: number): number {
  let lineas = 1;
  let usado = 0;
  for (const nombre of nombres) {
    const item = nombre.length * ANCHO_CARACTER_LEYENDA + EXTRA_ITEM_LEYENDA;
    if (usado > 0 && usado + item > anchoDisponible) {
      lineas++;
      usado = 0;
    }
    usado += item;
  }
  return lineas;
}

/**
 * Alto de la gráfica. En pantalla (ancho en %) es el de siempre y Recharts le descuenta la
 * leyenda a las barras. Para exportar (ancho fijo en px) se suma el alto estimado de la
 * leyenda, para que con muchos rangos las barras no queden aplastadas.
 */
export function altoGrafica(cantidadFilas: number, nombresSeries: string[], ancho: number | `${number}%`): number {
  const base = Math.max(200, cantidadFilas * 40 + 80);
  if (typeof ancho !== 'number') return base;
  const lineas = lineasLeyenda(nombresSeries, ancho - 2 * MARGEN_X_GRAFICA);
  return base + lineas * ALTO_LINEA_LEYENDA + MARGEN_INFERIOR_PDF;
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
  const paraPDF = typeof ancho === 'number';
  const alto = altoGrafica(filas.length, series.map((s) => s.nombre), ancho);
  const margen = {
    left: MARGEN_X_GRAFICA,
    right: MARGEN_X_GRAFICA,
    ...(paraPDF ? { bottom: MARGEN_INFERIOR_PDF } : {}),
  };

  const grafica = (
    <BarChart
      data={filas}
      layout="vertical"
      margin={margen}
      // Con ancho fijo (copia para el PDF)
      {...(paraPDF ? { width: ancho, height: alto } : {})}
    >
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
  );

  if (paraPDF) return grafica;
  return (
    <ResponsiveContainer width={ancho} height={alto}>
      {grafica}
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
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${nivel === n.id
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
