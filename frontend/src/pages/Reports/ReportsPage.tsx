import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { reportesApi } from '../../api/reportes';
import { Curso, Seccion, RangoCalificacion, ReporteABETResponse } from '../../types';
import {
  DistribucionNivel, Fila, GraficaDistribucion, NIVELES, Nivel, PestanasNivel, SIN_CLASIFICAR, seriesDe,
} from './distribucion';

// Página A4 vertical (mm): márgenes del contenido
const PDF_X = 14;
const PDF_ANCHO = 182;
const PDF_Y_INICIO = 20;
const PDF_Y_FIN = 285;
// Ancho fijo de la gráfica que se captura: el PDF sale igual sin importar la ventana
const ANCHO_GRAFICA_PDF = 900;

/**
 * Dibuja el título de la sección y la gráfica capturada, a todo el ancho y con su
 * proporción. Pasa a otra página si no cabe; si es más alta que una página, la reduce.
 * Devuelve la nueva posición vertical.
 */
function imagenPDF(doc: jsPDF, titulo: string, canvas: HTMLCanvasElement, y: number): number {
  const altoTitulo = 6;
  const altoMax = PDF_Y_FIN - PDF_Y_INICIO - altoTitulo;
  let ancho = PDF_ANCHO;
  let alto = (canvas.height / canvas.width) * ancho;
  if (alto > altoMax) {
    ancho *= altoMax / alto;
    alto = altoMax;
  }
  if (y + altoTitulo + alto > PDF_Y_FIN) { doc.addPage(); y = PDF_Y_INICIO; }

  doc.setFontSize(12);
  doc.setTextColor(31, 56, 100);
  doc.text(titulo, PDF_X, y);
  y += altoTitulo;

  doc.addImage(canvas, 'PNG', PDF_X + (PDF_ANCHO - ancho) / 2, y, ancho, alto);
  return y + alto + 4;
}

/**
 * Dibuja la tabla de un nivel en el PDF y devuelve la nueva posición vertical.
 * Sin título cuando ya lo dibujó imagenPDF encima de la gráfica.
 */
function tablaPDF(doc: jsPDF, titulo: string | null, filas: Fila[], rangos: RangoCalificacion[], y: number): number {
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
  if (titulo) {
    doc.setFontSize(12);
    doc.setTextColor(31, 56, 100);
    doc.text(titulo, 14, y);
    y += 6;
  }

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
  const [exporting, setExporting] = useState(false);
  const graficasPDF = useRef<HTMLDivElement>(null);

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

  const capturarGrafica = (nivelGrafica: Nivel) => {
    const nodo = graficasPDF.current?.querySelector<HTMLElement>(`[data-grafica="${nivelGrafica}"]`);
    if (!nodo) throw new Error(`No se encontró la gráfica "${nivelGrafica}" para exportar`);
    return html2canvas(nodo, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      // En el documento clonado se trae el contenedor oculto a la vista para que se dibuje
      onclone: (docClonado) => {
        const contenedor = docClonado.querySelector<HTMLElement>('[data-graficas-pdf]');
        if (contenedor) contenedor.style.left = '0';
      },
    });
  };

  const handleExportPDF = async () => {
    if (!curso || !reporte) return;
    setExporting(true);
    try {
      const [canvasCriterios, canvasResultados] = await Promise.all([
        capturarGrafica('criterios'),
        capturarGrafica('resultados'),
      ]);

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
      y = imagenPDF(doc, 'Distribución por Criterio ABET', canvasCriterios, y);
      y = tablaPDF(doc, null, reporte.criterios, reporte.rangos, y);
      y = imagenPDF(doc, 'Distribución por Resultado de Aprendizaje', canvasResultados, y);
      tablaPDF(doc, null, reporte.resultados, reporte.rangos, y);

      doc.save(`ABET_${curso.codigo}_${curso.periodo}.pdf`);
    } catch (error) {
      console.error('Error exportando el PDF del reporte ABET:', error);
    } finally {
      setExporting(false);
    }
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
            <Button onClick={handleExportPDF} loading={exporting} disabled={sinVinculos || exporting}>
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
            <PestanasNivel
              nivel={nivel}
              onChange={setNivel}
              conteos={{ criterios: reporte.criterios.length, resultados: reporte.resultados.length }}
            />

            <p className="text-xs text-gray-500 mb-4">
              {nivel === 'criterios'
                ? 'Cada estudiante cuenta una vez por Criterio. Cada aspecto vinculado se evalúa en su propia escala de 0 a 5; si el Criterio se evalúa en varias actividades, se promedian por igual.'
                : 'Promedio de los Criterios del resultado, ponderado por su peso en el catálogo. Los Criterios sin evidencia se excluyen y el peso se renormaliza.'}
              {' '}En actividades grupales cada integrante recibe la nota de su equipo.
            </p>

            <DistribucionNivel filas={filas} rangos={reporte.rangos} columna={nivelActual.columna} />

            {/* Copia de las dos gráficas solo para exportar: siempre montada, fuera de la vista
                (no display:none, Recharts mediría 0), ancho fijo y sin animación. */}
            <div
              ref={graficasPDF}
              data-graficas-pdf
              aria-hidden
              {...{ inert: '' }}
              className="fixed top-0 bg-white"
              style={{ left: -10000, width: ANCHO_GRAFICA_PDF }}
            >
              {NIVELES.map((n) => (
                <div key={n.id} data-grafica={n.id} className="bg-white">
                  <GraficaDistribucion
                    filas={reporte[n.id]}
                    series={seriesDe(reporte[n.id], reporte.rangos)}
                    ancho={ANCHO_GRAFICA_PDF}
                    animar={false}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
