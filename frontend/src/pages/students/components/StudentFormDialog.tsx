import { useId } from 'react';
import { X } from 'lucide-react';

import { Dialog } from '../../../components/ui/Dialog';
import { SectionOption, StudentRow } from '../types';

interface StudentFormDialogProps {
  /** Estudiante que se edita (null = se crea uno nuevo) */
  editing: StudentRow | null;
  nombre: string;
  onNombre: (value: string) => void;
  codigo: string;
  onCodigo: (value: string) => void;
  email: string;
  onEmail: (value: string) => void;
  seccionId: number | null;
  onSeccion: (seccionId: number | null) => void;
  sectionOptions: SectionOption[];
  /** Guardó, pero el backend avisó algo (p. ej. correo no válido) */
  aviso: string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Crear o editar un estudiante (el mismo diálogo, precargado al editar). Esc no cierra
// mientras se guarda.
export function StudentFormDialog({
  editing,
  nombre,
  onNombre,
  codigo,
  onCodigo,
  email,
  onEmail,
  seccionId,
  onSeccion,
  sectionOptions,
  aviso,
  error,
  loading,
  onClose,
  onSubmit,
}: StudentFormDialogProps) {
  const titleId = useId();

  return (
          <Dialog
            open
            // Esc no cierra mientras se guarda
            onClose={() => {
              if (!loading) onClose();
            }}
            labelledBy={titleId}
            overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            panelClassName="w-full max-w-xl rounded-xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                  {editing ? 'Editar estudiante' : 'Nuevo estudiante'}
                </h2>
                <p className="text-sm text-gray-500">
                  {editing
                    ? 'Corrige el nombre, el código o el correo. Sus calificaciones y equipos no cambian.'
                    : 'Crea un estudiante en la sección seleccionada'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar diálogo"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Nombre completo</label>
                <input
                  value={nombre}
                  onChange={(event) => onNombre(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                  placeholder="Ej: Ana María López"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Código</label>
                <input
                  value={codigo}
                  onChange={(event) => onCodigo(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                  placeholder="Ej: 20241001"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Correo (opcional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => onEmail(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
                  placeholder="Ej: ana.lopez@uao.edu.co"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Sección</label>
                <select
                  value={seccionId ?? ''}
                  onChange={(event) => onSeccion(event.target.value ? Number(event.target.value) : null)}
                  disabled={editing !== null}
                  title={editing ? 'La sección no se puede cambiar al editar' : undefined}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">Selecciona una sección</option>
                  {sectionOptions.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.cursoNombre} · {section.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {aviso && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {aviso}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200
                border border-[#E73426]"
              >
                {editing && aviso ? 'Cerrar' : 'Cancelar'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onSubmit}
                className="rounded-lg bg-[#9E0B0F] px-4 py-2 text-sm font-medium text-white hover:bg-[#82090d] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {editing
                  ? loading ? 'Guardando...' : 'Guardar cambios'
                  : loading ? 'Creando...' : 'Crear estudiante'}
              </button>
            </div>
          </Dialog>
  );
}
