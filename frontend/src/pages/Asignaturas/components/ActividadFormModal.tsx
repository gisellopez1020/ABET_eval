import { useEffect, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { actividadesApi, ActividadCreate, ActividadUpdate } from '../../../api/actividades';
import { apiErrorMessage } from '../../../api/errors';
import { Actividad, Seccion } from '../../../types';

interface ActividadFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  cursoId: number;
  /** Actividad a editar (obligatoria en modo edit). */
  actividad?: Actividad | null;
  /** Secciones activas del curso: con dos o más se elige si la actividad aplica a todas o a algunas */
  secciones: Seccion[];
  onClose: () => void;
  /** Recibe la actividad creada o actualizada devuelta por el backend. */
  onSaved: (actividad: Actividad) => void;
}

const mismasSecciones = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

// Formulario único de actividad (crear y editar): nombre, tipo (solo al crear), peso en la
// nota final y, si el curso tiene varias secciones, a cuáles aplica. Con una sola no se
// pregunta: "todas" incluye también las secciones que se creen después.
export function ActividadFormModal({
  open, mode, cursoId, actividad, secciones, onClose, onSaved,
}: ActividadFormModalProps) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<ActividadCreate['tipo']>('individual');
  const [peso, setPeso] = useState(20);
  const [aplicaTodas, setAplicaTodas] = useState(true);
  // En edición puede incluir secciones archivadas: no tienen casilla y se conservan
  const [seccionesIds, setSeccionesIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reinicia el formulario cada vez que se abre
  useEffect(() => {
    if (!open) return;
    const editando = mode === 'edit' && actividad;
    setNombre(editando ? actividad.nombre : '');
    setTipo(editando ? actividad.tipo : 'individual');
    setPeso(editando ? Number(actividad.peso_nota_final) : 20);
    setAplicaTodas(editando ? actividad.aplica_todas_secciones : true);
    setSeccionesIds(editando ? actividad.secciones_ids : []);
    setError('');
  }, [open, mode, actividad]);

  // Una actividad que ya tiene alcance específico lo muestra aunque quede una sola sección,
  // para poder volver a "Todas las secciones"
  const eligeAlcance = secciones.length > 1 || (mode === 'edit' && !!actividad && !actividad.aplica_todas_secciones);
  const sinSecciones = eligeAlcance && !aplicaTodas && seccionesIds.length === 0;

  const toggleSeccion = (seccionId: number) =>
    setSeccionesIds((ids) => (ids.includes(seccionId) ? ids.filter((id) => id !== seccionId) : [...ids, seccionId]));

  const handleSubmit = async () => {
    if (!nombre.trim()) return setError('El nombre es obligatorio');

    // Sin el control a la vista, la actividad aplica a todas
    const todas = !eligeAlcance || aplicaTodas;
    setSaving(true);
    setError('');
    try {
      let saved: Actividad;
      if (mode === 'create') {
        saved = await actividadesApi.create(cursoId, {
          nombre: nombre.trim(), tipo, peso_nota_final: peso,
          aplica_todas_secciones: todas, secciones_ids: todas ? [] : seccionesIds,
        });
      } else {
        const data: ActividadUpdate = { nombre: nombre.trim(), peso_nota_final: peso };
        // El alcance solo se envía si cambió: así no se toca el de una actividad
        // cuyas secciones no están todas a la vista (archivadas)
        const cambioAlcance = todas !== actividad!.aplica_todas_secciones
          || (!todas && !mismasSecciones(seccionesIds, actividad!.secciones_ids));
        if (cambioAlcance) {
          data.aplica_todas_secciones = todas;
          if (!todas) data.secciones_ids = seccionesIds;
        }
        saved = await actividadesApi.update(actividad!.id, data);
      }
      onSaved(saved);
    } catch (err) {
      // Incluye el 409 por quitar una sección con equipos o calificaciones: el backend nombra cuál
      setError(apiErrorMessage(err, mode === 'create' ? 'Error al crear actividad' : 'No se pudo guardar la actividad'));
    } finally {
      setSaving(false);
    }
  };

  return (
      <Modal open={open} onClose={() => { if (!saving) onClose(); }} title={mode === 'create' ? 'Nueva actividad' : 'Editar actividad'}>
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Lab1: Cálculo de subredes"
          />
          {mode === 'create' ? (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Tipo</label>
              <div className="flex gap-4">
                {(['individual', 'grupal'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={t}
                      checked={tipo === t}
                      onChange={() => setTipo(t)}
                      className="accent-[#9E0B0F]"
                    />
                    <span className="text-sm capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            // El tipo no es editable: cambiarlo dejaría sin sentido equipos o calificaciones
            <p className="text-sm text-gray-700">
              <span className="font-medium">Tipo:</span> <span className="capitalize">{tipo}</span>
              <span className="text-xs text-gray-500"> (no editable)</span>
            </p>
          )}
          <Input
            label="Peso en nota final (%)"
            type="number"
            min={1}
            max={100}
            value={peso}
            onChange={(e) => setPeso(Number(e.target.value))}
          />
          {eligeAlcance && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 block mb-2">Aplica a</legend>
              <div className="flex gap-4">
                {([[true, 'Todas las secciones'], [false, 'Secciones específicas']] as const).map(([todas, etiqueta]) => (
                  <label key={etiqueta} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="alcance-secciones"
                      checked={aplicaTodas === todas}
                      onChange={() => setAplicaTodas(todas)}
                      className="accent-[#9E0B0F]"
                    />
                    <span className="text-sm">{etiqueta}</span>
                  </label>
                ))}
              </div>
              {!aplicaTodas && (
                <div className="mt-3 space-y-1.5">
                  {secciones.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={seccionesIds.includes(s.id)}
                        onChange={() => toggleSeccion(s.id)}
                        className="accent-[#9E0B0F]"
                      />
                      <span className="text-sm">{s.nombre}</span>
                    </label>
                  ))}
                  {sinSecciones && <p className="text-xs text-gray-500">Elige al menos una sección.</p>}
                </div>
              )}
            </fieldset>
          )}
          {error && <p className="text-sm text-uao-accent">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary"  className="rounded-xl border border-gray-200 bg-white text-gray-800 transition hover:border-[#9E0B0F] hover:bg-white"
             onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={saving} disabled={sinSecciones}>
              {mode === 'create' ? 'Crear' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </Modal>
  );
}
