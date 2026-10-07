import { useState } from 'react';

import { estudiantesApi } from '../../../api/estudiantes';
import { apiErrorMessage } from '../../../api/errors';
import { StudentRow } from '../types';

// Estado y acciones del diálogo de crear / editar estudiante. sectionFilter (sección por
// defecto al crear) y loadAll (recarga tras guardar) llegan en cada render: no se
// memorizan, así que los handlers siempre usan los valores actuales.
export function useStudentForm(sectionFilter: number | null, loadAll: () => Promise<void>) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  // El estudiante se creó, pero el backend dejó el correo en blanco por no ser válido
  const [createAviso, setCreateAviso] = useState('');
  // Estudiante que se está editando en el modal (null = el modal crea uno nuevo)
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [createSeccionId, setCreateSeccionId] = useState<number | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const openCreateModal = () => {
    // Por defecto, la sección del filtro si hay una elegida
    setCreateSeccionId(sectionFilter);
    setCreateError('');
    setCreateAviso('');
    setShowCreateModal(true);
  };

  // El mismo modal, precargado con los datos actuales
  const openEditModal = (student: StudentRow) => {
    setEditingStudent(student);
    setNewStudentName(student.nombre);
    setNewStudentCode(student.codigo);
    setNewStudentEmail(student.email ?? '');
    setCreateSeccionId(student.seccionId);
    setCreateError('');
    setCreateAviso('');
    setShowCreateModal(true);
  };

  const closeStudentModal = () => {
    setShowCreateModal(false);
    setCreateError('');
    if (editingStudent) {
      // Que los datos del estudiante editado no aparezcan luego en "Nuevo estudiante"
      setEditingStudent(null);
      setNewStudentName('');
      setNewStudentCode('');
      setNewStudentEmail('');
    }
  };

  const handleUpdateStudent = async (student: StudentRow) => {
    setCreateLoading(true);
    setCreateError('');
    setCreateAviso('');

    try {
      const guardado = await estudiantesApi.update(student.id, {
        nombre_completo: newStudentName.trim().toUpperCase(),
        codigo_estudiante: newStudentCode.trim(),
        email: newStudentEmail.trim() || null,
      });

      await loadAll();
      if (guardado.aviso) {
        // Guardó el resto; el correo quedó como estaba: se muestra el que realmente hay
        setNewStudentEmail(guardado.email ?? '');
        setCreateAviso(`Cambios guardados. ${guardado.aviso}.`);
        return;
      }
      closeStudentModal();
    } catch (error) {
      setCreateError(apiErrorMessage(error, 'No se pudo guardar el estudiante.'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateStudent = async () => {
    if (!newStudentName.trim()) {
      setCreateError('El nombre es obligatorio');
      return;
    }

    if (!newStudentCode.trim()) {
      setCreateError('El código es obligatorio');
      return;
    }

    if (editingStudent) {
      await handleUpdateStudent(editingStudent);
      return;
    }

    if (!createSeccionId) {
      setCreateError('Debes seleccionar una sección');
      return;
    }

    setCreateLoading(true);
    setCreateError('');
    setCreateAviso('');

    try {
      const creado = await estudiantesApi.create(createSeccionId, {
        nombre_completo: newStudentName.trim().toUpperCase(),
        codigo_estudiante: newStudentCode.trim(),
        email: newStudentEmail.trim() || null,
      });

      await loadAll();
      // Se limpia siempre: el estudiante ya existe y un segundo clic lo duplicaría
      setNewStudentName('');
      setNewStudentCode('');
      setNewStudentEmail('');
      if (creado.aviso) {
        setCreateAviso(`Estudiante creado. ${creado.aviso}.`);
        return;
      }
      setShowCreateModal(false);
    } catch (error: any) {
      setCreateError(error?.response?.data?.detail || 'No se pudo crear el estudiante.');
    } finally {
      setCreateLoading(false);
    }
  };

  return {
    showCreateModal,
    newStudentName,
    setNewStudentName,
    newStudentCode,
    setNewStudentCode,
    newStudentEmail,
    setNewStudentEmail,
    createAviso,
    editingStudent,
    createSeccionId,
    setCreateSeccionId,
    createLoading,
    createError,
    openCreateModal,
    openEditModal,
    closeStudentModal,
    handleCreateStudent,
  };
}
