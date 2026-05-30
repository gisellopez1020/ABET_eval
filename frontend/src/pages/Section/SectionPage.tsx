import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/Layout/AppLayout';
import { Header } from '../../components/Layout/Header';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { cursosApi } from '../../api/cursos';
import { seccionesApi } from '../../api/secciones';
import { estudiantesApi } from '../../api/estudiantes';
import { Curso, Seccion, Estudiante } from '../../types';

export function SectionPage() {
  const { cursoId, seccionId } = useParams<{ cursoId: string; seccionId: string }>();
  const cid = Number(cursoId);
  const sid = Number(seccionId);
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Curso | null>(null);
  const [seccion, setSeccion] = useState<Seccion | null>(null);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [addNombre, setAddNombre] = useState('');
  const [addCodigo, setAddCodigo] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const [csvModal, setCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ nombre: string; codigo: string }[]>([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      cursosApi.get(cid),
      seccionesApi.list(cid).then((ss) => ss.find((s) => s.id === sid) ?? null),
      estudiantesApi.list(sid),
    ]).then(([c, s, e]) => {
      setCurso(c);
      setSeccion(s);
      setEstudiantes(e);
    }).finally(() => setLoading(false));
  }, [cid, sid]);

  const handleAdd = async () => {
    if (!addNombre.trim() || !addCodigo.trim()) {
      setAddError('Nombre y código son obligatorios');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      const e = await estudiantesApi.create(sid, {
        nombre_completo: addNombre.trim().toUpperCase(),
        codigo_estudiante: addCodigo.trim(),
      });
      setEstudiantes((prev) => [...prev, e]);
      setAddModal(false);
      setAddNombre('');
      setAddCodigo('');
    } catch (err: any) {
      setAddError(err?.response?.data?.detail || 'Error al agregar estudiante');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este estudiante?')) return;
    try {
      await estudiantesApi.delete(id);
      setEstudiantes((prev) => prev.filter((e) => e.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  const parseCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const rows = lines.slice(1).map((l) => {
        const [nombre, codigo] = l.split(',').map((s) => s.trim());
        return { nombre: nombre || '', codigo: codigo || '' };
      }).filter((r) => r.nombre && r.codigo);
      setCsvPreview(rows);
    };
    reader.readAsText(file);
  };

  const handleCsvSelect = (file: File) => {
    setCsvFile(file);
    setCsvPreview([]);
    setCsvError('');
    parseCsv(file);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    setCsvError('');
    try {
      const result = await estudiantesApi.importCsv(sid, csvFile);
      setEstudiantes((prev) => [...prev, ...result]);
      setCsvModal(false);
      setCsvFile(null);
      setCsvPreview([]);
    } catch (e: any) {
      setCsvError(e?.response?.data?.detail || 'Error al importar CSV');
    } finally {
      setCsvLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <Header crumbs={[{ label: 'Mis cursos', to: '/dashboard' }, { label: '…' }]} />
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header
        crumbs={[
          { label: 'Mis cursos', to: '/dashboard' },
          { label: curso?.nombre || '', to: `/cursos/${cid}` },
          { label: seccion?.nombre || '' },
        ]}
      />
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-uao-dark">{seccion?.nombre}</h2>
            <p className="text-sm text-gray-500">{curso?.nombre}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/cursos/${cid}`)}>
            ← Volver al curso
          </Button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="font-semibold text-uao-dark">
              Estudiantes ({estudiantes.length})
            </h3>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCsvModal(true)}>
                Importar CSV
              </Button>
              <Button size="sm" onClick={() => setAddModal(true)}>
                + Agregar
              </Button>
            </div>
          </div>

          {estudiantes.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">
              No hay estudiantes. Agrégalos manualmente o importa un CSV.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estudiantes.map((e, i) => (
                    <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{e.nombre_completo}</td>
                      <td className="px-4 py-3 text-gray-600">{e.codigo_estudiante}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(e.id)}
                          className="text-uao-accent hover:bg-red-50"
                        >
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal agregar */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Agregar estudiante">
        <div className="space-y-4">
          <Input
            label="Nombre completo"
            value={addNombre}
            onChange={(e) => setAddNombre(e.target.value)}
            placeholder="OSCAR EVELIO PRADA CEBALLOS"
          />
          <Input
            label="Código"
            value={addCodigo}
            onChange={(e) => setAddCodigo(e.target.value)}
            placeholder="2021001"
          />
          {addError && <p className="text-sm text-uao-accent">{addError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddModal(false)}>Cancelar</Button>
            <Button onClick={handleAdd} loading={addLoading}>Agregar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal CSV */}
      <Modal open={csvModal} onClose={() => setCsvModal(false)} title="Importar estudiantes desde CSV">
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-uao-mid transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleCsvSelect(f);
            }}
          >
            <p className="text-sm text-gray-500">
              {csvFile ? csvFile.name : 'Arrastra un CSV aquí o haz clic para seleccionar'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Formato: Nombre,Codigo (con encabezado)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvSelect(f); }}
            />
          </div>

          {csvPreview.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Vista previa ({csvPreview.length} estudiante{csvPreview.length !== 1 ? 's' : ''})
              </p>
              <div className="max-h-40 overflow-y-auto border rounded-lg divide-y text-xs">
                {csvPreview.map((r, i) => (
                  <div key={i} className="flex gap-4 px-3 py-2">
                    <span className="font-medium">{r.nombre}</span>
                    <span className="text-gray-500">{r.codigo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {csvError && <p className="text-sm text-uao-accent">{csvError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCsvModal(false)}>Cancelar</Button>
            <Button onClick={handleCsvImport} loading={csvLoading} disabled={!csvFile}>
              Importar
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
