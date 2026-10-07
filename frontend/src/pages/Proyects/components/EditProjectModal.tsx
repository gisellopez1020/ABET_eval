import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Estudiante } from '../../../types';
import { estudiantesApi } from '../../../api/estudiantes';
import { apiErrorMessage } from '../../../api/errors';
import { ProjectRow } from '../types';
import { StudentPicker } from './StudentPicker';

interface EditProjectModalProps {
  /** Equipo a editar: el modal se monta al abrir, así que se precarga con sus datos actuales. */
  project: ProjectRow;
  onClose: () => void;
  onSave: (payload: { nombre: string; estudianteIds: number[] }) => Promise<void>;
}

export function EditProjectModal({ project, onClose, onSave }: EditProjectModalProps) {
  const [nombre, setNombre] = useState(project.nombre);
  // La sección y la actividad del equipo no se editan (PUT /equipos/{id} no las acepta)
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>(project.miembroIds);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;

    // A diferencia de crear, no se descartan integrantes ausentes de la lista: el equipo no
    // debe perder a nadie sin que el docente lo quite
    estudiantesApi
      .list(project.seccionId)
      .then((response) => {
        if (!cancelled) setEstudiantes(response);
      })
      .catch(() => {
        if (!cancelled) setEstudiantes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [project.seccionId]);

  const toggleStudent = (studentId: number) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((item) => item !== studentId)
        : [...current, studentId]
    );
  };

  const isReady = Boolean(nombre.trim()) && selectedStudentIds.length > 0;

  const handleSubmit = async () => {
    if (!isReady) {
      setError('Completa el nombre y selecciona al menos un estudiante.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onSave({ nombre: nombre.trim(), estudianteIds: selectedStudentIds });
      onClose();
    } catch (requestError) {
      // Las reglas de composición las valida el backend: su mensaje se muestra tal cual
      setError(apiErrorMessage(requestError, 'No se pudo guardar el equipo.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      // Esc no cierra mientras se guarda
      onClose={() => {
        if (!loading) onClose();
      }}
      labelledBy={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h3 id={titleId} className="text-xl font-semibold text-gray-900">Editar equipo</h3>
          <p className="text-sm text-gray-500">
            {project.actividadNombre} · {project.seccionNombre}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Cerrar diálogo"
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        <Input
          label="Nombre del proyecto"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          placeholder="Ej: Sistema de inventarios"
        />

        <StudentPicker
          estudiantes={estudiantes}
          selectedIds={selectedStudentIds}
          onToggle={toggleStudent}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="primary" loading={loading} onClick={handleSubmit} disabled={!isReady || loading}>
          Guardar cambios
        </Button>
      </div>
    </Dialog>
  );
}
