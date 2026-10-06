import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Actividad, Seccion, Estudiante } from '../../../types';
import { estudiantesApi } from '../../../api/estudiantes';
import { StudentPicker } from './StudentPicker';

interface CreateProjectModalProps {
  open: boolean;
  sections: Seccion[];
  activities: Actividad[];
  /** Actividad a preseleccionar (p. ej. desde /proyectos?actividadId=…) en vez de la primera. */
  initialActividadId?: number;
  /** Sección a preseleccionar (la del filtro de la pantalla) en vez de la primera. */
  initialSeccionId?: number;
  onClose: () => void;
  onCreate: (payload: {
    nombre: string;
    seccionId: number;
    actividadId: number;
    estudianteIds: number[];
  }) => Promise<void>;
}

export function CreateProjectModal({
  open,
  sections,
  activities,
  initialActividadId,
  initialSeccionId,
  onClose,
  onCreate,
}: CreateProjectModalProps) {
  const [nombre, setNombre] = useState('');
  const [seccionId, setSeccionId] = useState<number | ''>('');
  const [actividadId, setActividadId] = useState<number | ''>('');
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();

  // El modal no se desmonta al cerrarse y las listas cambian con la asignatura: al abrir se
  // prefiere la preselección; si no, se conserva la elegida mientras siga en la lista, o la primera.
  const wasOpen = useRef(false);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;

    if (!open) {
      return;
    }

    const pick = <T extends { id: number }>(items: T[], current: number | '', initial?: number) => {
      if (justOpened && initial && items.some((item) => item.id === initial)) return initial;
      if (current && items.some((item) => item.id === current)) return current;
      return items[0]?.id ?? '';
    };

    setSeccionId((current) => pick(sections, current, initialSeccionId));
    setActividadId((current) => pick(activities, current, initialActividadId));
  }, [open, sections, activities, initialSeccionId, initialActividadId]);

  useEffect(() => {
    // Con otra sección cambia la lista: un filtro anterior no aplica
    setBusqueda('');

    const loadStudents = async () => {
      if (!seccionId) {
        setEstudiantes([]);
        setSelectedStudentIds([]);
        return;
      }

      try {
        const response = await estudiantesApi.list(Number(seccionId));
        setEstudiantes(response);
        setSelectedStudentIds((current) => current.filter((studentId) => response.some((student) => student.id === studentId)));
      } catch {
        setEstudiantes([]);
        setSelectedStudentIds([]);
      }
    };

    void loadStudents();
  }, [seccionId]);

  const toggleStudent = (studentId: number) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((item) => item !== studentId)
        : [...current, studentId]
    );
  };

  const isReady = useMemo(
    () => Boolean(nombre.trim()) && Boolean(seccionId) && Boolean(actividadId) && selectedStudentIds.length > 0,
    [nombre, seccionId, actividadId, selectedStudentIds]
  );

  const handleSubmit = async () => {
    if (!isReady) {
      setError('Completa el nombre, selecciona la sección, la actividad y al menos un estudiante.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onCreate({
        nombre: nombre.trim(),
        seccionId: Number(seccionId),
        actividadId: Number(actividadId),
        estudianteIds: selectedStudentIds,
      });

      setNombre('');
      setSelectedStudentIds([]);
      setBusqueda('');
      setError('');
      onClose();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || 'No se pudo crear el proyecto.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog
      open
      // Esc no cierra mientras se crea el proyecto
      onClose={() => {
        if (!loading) onClose();
      }}
      labelledBy={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      panelClassName="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h3 id={titleId} className="text-xl font-semibold text-gray-900">Nuevo proyecto</h3>
          <p className="text-sm text-gray-500">Crea un equipo para una actividad grupal</p>
        </div>

        <button
          type="button"
          onClick={onClose}
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

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sección</label>
            <select
              value={seccionId}
              onChange={(event) => setSeccionId(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Actividad grupal</label>
            <select
              value={actividadId}
              onChange={(event) => setActividadId(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
            >
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

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
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" loading={loading} onClick={handleSubmit} disabled={!isReady || loading}>
          Crear proyecto
        </Button>
      </div>
    </Dialog>
  );
}
