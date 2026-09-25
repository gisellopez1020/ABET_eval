import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import jsPDF from 'jspdf';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { reportesApi } from '../../api/reportes';
import {
  Curso, Seccion, RangoCalificacion, ReporteABETResponse, ReporteCriterio, ReporteRA,
} from '../../types';
import { colorRango } from '../../utils/rangos';

const SIN_CLASIFICAR = 'Sin clasificar';
const COLOR_SIN_CLASIFICAR = '#9CA3AF';

type Nivel = 'criterios' | 'resultados';
type Fila = ReporteCriterio | ReporteRA;

const NIVELES: { id: Nivel; titulo: string; columna: string }[] = [
  { id: 'criterios', titulo: 'Por Criterio ABET', columna: 'Criterio ABET' },
  { id: 'resultados', titulo: 'Por Resultado de Aprendizaje', columna: 'Resultado de aprendizaje' },
];

/** Detalle bajo la descripción: RA padre del Criterio, o Criterios usados en el RA. */
function detalle(fila: Fila): string {
  if ('criterios_con_evidencia' in fila) {
    const sin = fila.criterios_sin_evidencia.length
      ? ` · sin evidencia: ${fila.criterios_sin_evidencia.join(', ')}`
      : '';
    return `Calculado con ${fila.criterios_con_evidencia.join(', ')}${sin}`;
  }
  return fila.codigo_padre ? `RA ${fila.codigo_padre} · peso ${fila.peso}` : '';
}

function DistribucionNivel({
  filas,
  rangos,
  columna,
}: {
  filas: Fila[];
  rangos: RangoCalificacion[];
  columna: string;
}) {
  const conSinClasificar = filas.some((f) => f.sin_clasificar > 0);
  const series = [
    ...rangos.map((r, i) => ({
      nombre: r.etiqueta,
      color: colorRango(i, rangos.length),
      valor: (f: Fila) => f.rangos[r.etiqueta] ?? 0,
    })),
    ...(conSinClasificar
      ? [{ nombre: SIN_CLASIFICAR, color: COLOR_SIN_CLASIFICAR, valor: (f: Fila) => f.sin_clasificar }]
      : []),
  ];
  const descripcionDe = (codigo: string) => filas.find((f) => f.codigo === codigo)?.descripcion ?? '';

  return (
    <>
      {/* Gráfica */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-uao-dark mb-4">Distribución de estudiantes por rango</h3>
        <ResponsiveContainer width="100%" height={Math.max(200, filas.length * 40 + 80)}>
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
              <Bar key={s.nombre} name={s.nombre} dataKey={s.valor} stackId="rangos" fill={s.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
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

/** Dibuja la tabla de un nivel en el PDF y devuelve la nueva posición vertical. */
function tablaPDF(doc: jsPDF, titulo: string, filas: Fila[], rangos: RangoCalificacion[], y: number): number {
  const conSinClasificar = filas.some((f) => f.sin_clasificar > 0);
  const columnas = [
    ...rangos.map((r) => ({ nombre: r.etiqueta, valor: (f: Fila) => f.rangos[r.etiqueta] ?? 0 })),
    ...(conSinClasificar ? [{ nombre: SIN_CLASIFICAR, valor: (f: Fila) => f.sin_clasificar }] : []),
    { nombre: 'Total', valor: (f: Fila) => f.total },
  ];
  const xDatos = 76;
  const ancho = (196 - xDatos) / columnas.length;
  const recortar = (texto: string, max: number) => doc.splitTextToSize(texto, max)[0] as string;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.setTextColor(31, 56, 100);
  doc.text(titulo, 14, y);
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y, 182, 7, 'F');
  doc.text('Código', 16, y + 5);
  columnas.forEach((c, i) => {
    doc.text(recortar(c.nombre, ancho - 1), xDatos + i * ancho + ancho / 2, y + 5, { align: 'center' });
  });
  y += 8;

  filas.forEach((fila, i) => {
    if (y > 275) { doc.addPage(); y = 20; }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(14, y, 182, 7, 'F');
    }
    doc.text(recortar(`${fila.codigo} ${fila.descripcion}`, xDatos - 18), 16, y + 5);
    columnas.forEach((c, j) => {
      doc.text(String(c.valor(fila)), xDatos + j * ancho + ancho / 2, y + 5, { align: 'center' });
    });
    y += 8;
  });
  return y + 6;
}

export function ReportsPage() {
  const { cursoId } = useParams<{ cursoId: string }>();
  const cid = Number(cursoId);
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Curso | null>(null);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [reporte, setReporte] = useState<ReporteABETResponse | null>(null);
  const [seccionId, setSeccionId] = useState<number | ''>('');
  const [nivel, setNivel] = useState<Nivel>('criterios');
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    Promise.all([
      cursosApi.get(cid),
      seccionesApi.list(cid),
      reportesApi.abet(cid),
    ]).then(([c, s, r]) => {
      setCurso(c);
      setSecciones(s);
      setReporte(r);
    }).finally(() => setLoading(false));
  }, [cid]);

  const handleFilter = async () => {
    setLoadingReport(true);
    try {
      setReporte(await reportesApi.abet(cid, seccionId ? { seccion_id: seccionId } : undefined));
    } finally {
      setLoadingReport(false);
    }
  };

  const handleExportPDF = () => {
    if (!curso || !reporte) return;
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-CO');
    const seccion = secciones.find((s) => s.id === seccionId);

    doc.setFontSize(16);
    doc.setTextColor(31, 56, 100);
    doc.text('Reporte ABET', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Curso: ${curso.nombre} (${curso.codigo})`, 14, 30);
    doc.text(`Período: ${curso.periodo}`, 14, 36);
    doc.text(`Docente: ${curso.docente_email}`, 14, 42);
    doc.text(`Sección: ${seccion?.nombre ?? 'Todas'} · Generado: ${fecha}`, 14, 48);

    let y = 60;
    y = tablaPDF(doc, 'Distribución por Criterio ABET', reporte.criterios, reporte.rangos, y);
    tablaPDF(doc, 'Distribución por Resultado de Aprendizaje', reporte.resultados, reporte.rangos, y);

    doc.save(`ABET_${curso.codigo}_${curso.periodo}.pdf`);
  };

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  const nivelActual = NIVELES.find((n) => n.id === nivel)!;
  const filas: Fila[] = reporte ? reporte[nivel] : [];
  const sinVinculos = !reporte || reporte.criterios.length === 0;

  return (
    <AppLayout>
      <Header
        crumbs={[
          { label: 'Mis cursos', to: '/dashboard' },
          { label: curso?.nombre ?? '', to: `/cursos/${cid}` },
          { label: 'Reportes ABET' },
        ]}
      />
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">Reportes ABET</h2>
            <p className="text-sm text-gray-500 mt-0.5">{curso?.nombre} · {curso?.periodo}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/cursos/${cid}`)}>
              ← Volver
            </Button>
            <Button onClick={handleExportPDF} disabled={sinVinculos}>
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Sección</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-uao-mid"
              value={seccionId}
              onChange={(e) => setSeccionId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Todas las secciones</option>
              {secciones.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleFilter} loading={loadingReport}>
            Aplicar filtros
          </Button>
        </div>

        {sinVinculos ? (
          <div className="text-center py-16 text-gray-400">
            <p>Ningún aspecto de las rúbricas del curso está vinculado a un Criterio ABET.</p>
            <p className="text-sm mt-1">Vincula los aspectos desde la rúbrica de cada actividad.</p>
          </div>
        ) : (
          <>
            {/* Pestañas */}
            <div role="tablist" className="flex gap-1 border-b border-gray-200 mb-6">
              {NIVELES.map((n) => (
                <button
                  key={n.id}
                  role="tab"
                  aria-selected={nivel === n.id}
                  onClick={() => setNivel(n.id)}
                  className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                    nivel === n.id
                      ? 'border-uao-accent text-uao-dark'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {n.titulo}
                  <span className="ml-2 text-xs text-gray-400">{reporte[n.id].length}</span>
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {nivel === 'criterios'
                ? 'Cada estudiante cuenta una vez por Criterio. Cada aspecto vinculado se evalúa en su propia escala de 0 a 5; si el Criterio se evalúa en varias actividades, se promedian por igual.'
                : 'Promedio de los Criterios del resultado, ponderado por su peso en el catálogo. Los Criterios sin evidencia se excluyen y el peso se renormaliza.'}
              {' '}En actividades grupales cada integrante recibe la nota de su equipo.
            </p>

            <DistribucionNivel filas={filas} rangos={reporte.rangos} columna={nivelActual.columna} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
