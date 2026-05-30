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
import { actividadesApi } from '../../api/actividades';
import { reportesApi } from '../../api/reportes';
import { Curso, Seccion, Actividad, ReporteRA } from '../../types';

const RANGO_COLORS = {
  '0.0-2.9': '#C8102E',
  '3.0-3.9': '#FFB300',
  '4.0-5.0': '#2E7D32',
};

export function ReportsPage() {
  const { cursoId } = useParams<{ cursoId: string }>();
  const cid = Number(cursoId);
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Curso | null>(null);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [reporte, setReporte] = useState<ReporteRA[]>([]);
  const [seccionId, setSeccionId] = useState<number | ''>('');
  const [actividadId, setActividadId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    Promise.all([
      cursosApi.get(cid),
      seccionesApi.list(cid),
      actividadesApi.list(cid),
    ]).then(([c, s, a]) => {
      setCurso(c);
      setSecciones(s);
      setActividades(a);
      return reportesApi.abet(cid);
    }).then(setReporte).finally(() => setLoading(false));
  }, [cid]);

  const handleFilter = async () => {
    setLoadingReport(true);
    try {
      const params: Record<string, number> = {};
      if (seccionId) params.seccion_id = seccionId;
      if (actividadId) params.actividad_id = actividadId as number;
      const r = await reportesApi.abet(cid, params);
      setReporte(r);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleExportPDF = () => {
    if (!curso) return;
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-CO');

    doc.setFontSize(16);
    doc.setTextColor(31, 56, 100);
    doc.text('Reporte ABET', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Curso: ${curso.nombre} (${curso.codigo})`, 14, 30);
    doc.text(`Período: ${curso.periodo}`, 14, 36);
    doc.text(`Docente: ${curso.docente_email}`, 14, 42);
    doc.text(`Generado: ${fecha}`, 14, 48);

    doc.setFontSize(12);
    doc.setTextColor(31, 56, 100);
    doc.text('Distribución por resultado de aprendizaje', 14, 58);

    let y = 66;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    // Header tabla
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y, 182, 7, 'F');
    doc.text('Resultado de aprendizaje', 16, y + 5);
    doc.text('0.0-2.9', 110, y + 5);
    doc.text('3.0-3.9', 130, y + 5);
    doc.text('4.0-5.0', 150, y + 5);
    doc.text('Total', 170, y + 5);
    y += 8;

    reporte.forEach((ra, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(14, y, 182, 7, 'F');
      }
      doc.setTextColor(0, 0, 0);
      const label = ra.ra.length > 45 ? ra.ra.slice(0, 44) + '…' : ra.ra;
      doc.text(label, 16, y + 5);
      doc.text(String(ra.rangos['0.0-2.9']), 115, y + 5);
      doc.text(String(ra.rangos['3.0-3.9']), 135, y + 5);
      doc.text(String(ra.rangos['4.0-5.0']), 155, y + 5);
      doc.text(String(ra.total), 172, y + 5);
      y += 8;
    });

    const filename = `ABET_${curso.codigo}_${curso.periodo}.pdf`;
    doc.save(filename);
  };

  const chartData = reporte.map((ra) => ({
    name: ra.ra.split(':')[0] ?? ra.ra,
    'Bajo (0.0-2.9)': ra.rangos['0.0-2.9'],
    'Medio (3.0-3.9)': ra.rangos['3.0-3.9'],
    'Alto (4.0-5.0)': ra.rangos['4.0-5.0'],
  }));

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
            <Button onClick={handleExportPDF} disabled={reporte.length === 0}>
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
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Actividad</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-uao-mid"
              value={actividadId}
              onChange={(e) => setActividadId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Todas las actividades</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleFilter} loading={loadingReport}>
            Aplicar filtros
          </Button>
        </div>

        {reporte.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>No hay datos de calificaciones para mostrar.</p>
            <p className="text-sm mt-1">Califica algunas actividades primero.</p>
          </div>
        ) : (
          <>
            {/* Gráfica */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <h3 className="font-semibold text-uao-dark mb-4">
                Distribución por resultado de aprendizaje
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Bajo (0.0-2.9)" fill={RANGO_COLORS['0.0-2.9']} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Medio (3.0-3.9)" fill={RANGO_COLORS['3.0-3.9']} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Alto (4.0-5.0)" fill={RANGO_COLORS['4.0-5.0']} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">
                        Resultado de aprendizaje
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-uao-accent">0.0 – 2.9</th>
                      <th className="text-center px-4 py-3 font-medium text-yellow-600">3.0 – 3.9</th>
                      <th className="text-center px-4 py-3 font-medium text-green-700">4.0 – 5.0</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reporte.map((ra, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-3 text-gray-800 font-medium">{ra.ra}</td>
                        <td className="px-4 py-3 text-center text-uao-accent font-semibold">
                          {ra.rangos['0.0-2.9']}
                        </td>
                        <td className="px-4 py-3 text-center text-yellow-600 font-semibold">
                          {ra.rangos['3.0-3.9']}
                        </td>
                        <td className="px-4 py-3 text-center text-green-700 font-semibold">
                          {ra.rangos['4.0-5.0']}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 font-bold">
                          {ra.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
