import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { cursosApi, CursoCreate } from '../../../api/cursos';
import { apiErrorMessage } from '../../../api/errors';
import { Curso } from '../../../types';
import { RANGOS_CALIFICACION_DEFAULT, RangoForm, rangoToForm, validarRangos } from '../../../utils/rangos';
import { RaAbetSelector } from './RaAbetSelector';
import { RangosCalificacionEditor } from './RangosCalificacionEditor';

interface CourseFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Curso a editar (obligatorio en modo edit). */
  course?: Curso | null;
  onClose: () => void;
  /** Recibe el curso creado o actualizado devuelto por el backend. */
  onSaved: (course: Curso) => void;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Formulario único de asignatura (crear y editar), con la sección "Configuración ABET (opcional)". */
export function CourseFormModal({ open, mode, course, onClose, onSaved }: CourseFormModalProps) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [rangos, setRangos] = useState<RangoForm[]>([]);
  const [raAbet, setRaAbet] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reinicia el formulario cada vez que se abre
  useEffect(() => {
    if (!open) return;
    setNombre(course?.nombre ?? '');
    setCodigo(course?.codigo ?? '');
    setPeriodo(course?.periodo ?? '');
    setRangos((mode === 'edit' && course ? course.rangos_calificacion : RANGOS_CALIFICACION_DEFAULT).map(rangoToForm));
    setRaAbet(mode === 'edit' && course ? course.ra_abet : []);
    setError('');
  }, [open, mode, course]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!nombre.trim()) return setError('El nombre es obligatorio');
    if (!codigo.trim()) return setError('El código es obligatorio');
    if (!periodo.trim()) return setError('El período es obligatorio');

    const data: Partial<CursoCreate> = {
      nombre: nombre.trim(),
      codigo: codigo.trim(),
      periodo: periodo.trim(),
    };

    // Sin rangos al crear: se omite el campo y el backend aplica los 3 por defecto
    if (rangos.length > 0 || mode === 'edit') {
      const result = validarRangos(rangos);
      if (!result.ok) return setError(result.error);
      data.rangos_calificacion = result.rangos;
    }

    if (mode === 'create') {
      data.ra_abet = raAbet;
    } else if (course && !sameList(raAbet, course.ra_abet)) {
      // Solo se envía si cambió: así un curso con valores antiguos (fuera del catálogo)
      // puede editarse sin que el backend los rechace.
      data.ra_abet = raAbet;
    }

    setSaving(true);
    setError('');
    try {
      const saved =
        mode === 'create'
          ? await cursosApi.create(data as CursoCreate)
          : await cursosApi.update(course!.id, data);
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, mode === 'create' ? 'No se pudo crear la asignatura' : 'No se pudo guardar la asignatura'));
    } finally {
      setSaving(false);
    }
  };

  const titulo = mode === 'create' ? 'Nueva asignatura' : 'Editar asignatura';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
            <p className="text-sm text-gray-500">
              {mode === 'create' ? 'Crea una asignatura sin salir de esta página' : course?.nombre}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={19} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Ej: Fundamentos de programación"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Código</label>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ej: FIS-101"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Período</label>
              <input
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ej: 2026-1"
              />
            </div>
          </div>

          <section className="space-y-4 rounded-xl border border-gray-200 bg-[#fafafa] p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Configuración ABET (opcional)</h3>
              <p className="text-xs text-gray-500">Puedes ajustarla después desde el detalle de la asignatura.</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Rangos de calificación del reporte</p>
              <RangosCalificacionEditor
                value={rangos}
                onChange={setRangos}
                emptyText={
                  mode === 'create'
                    ? 'Sin rangos: al crear la asignatura se usarán los 3 rangos por defecto.'
                    : 'Debe haber al menos un rango.'
                }
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Student Outcomes (RA ABET)</p>
              <RaAbetSelector value={raAbet} onChange={setRaAbet} />
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="rounded-lg bg-[#9E0B0F] px-4 py-2 text-sm font-medium text-white hover:bg-[#82090d] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving
              ? mode === 'create' ? 'Creando...' : 'Guardando...'
              : mode === 'create' ? 'Crear asignatura' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
