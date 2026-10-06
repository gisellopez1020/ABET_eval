import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';

interface StudentFormModalProps {
  open: boolean;
  /** true = edita un estudiante existente; false = agrega uno nuevo */
  editing: boolean;
  nombre: string;
  onNombre: (value: string) => void;
  codigo: string;
  onCodigo: (value: string) => void;
  email: string;
  onEmail: (value: string) => void;
  /** Guardó, pero el backend avisó algo (p. ej. correo no válido) */
  aviso: string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Agregar o editar un estudiante de la sección (el mismo modal, precargado al editar)
export function StudentFormModal({
  open,
  editing,
  nombre,
  onNombre,
  codigo,
  onCodigo,
  email,
  onEmail,
  aviso,
  error,
  loading,
  onClose,
  onSubmit,
}: StudentFormModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar estudiante' : 'Agregar estudiante'}>
      <div className="space-y-4">
        <Input
          label="Nombre completo"
          value={nombre}
          onChange={(e) => onNombre(e.target.value)}
          placeholder="OSCAR EVELIO PRADA CEBALLOS"
        />
        <Input
          label="Código"
          value={codigo}
          onChange={(e) => onCodigo(e.target.value)}
          placeholder="2021001"
        />
        <Input
          label="Correo (opcional)"
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="oscar.prada@uao.edu.co"
        />
        {aviso && <p className="text-sm text-amber-700">{aviso}</p>}
        {error && <p className="text-sm text-uao-accent">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{editing && aviso ? 'Cerrar' : 'Cancelar'}</Button>
          <Button onClick={onSubmit} loading={loading}>{editing ? 'Guardar cambios' : 'Agregar'}</Button>
        </div>
      </div>
    </Modal>
  );
}
