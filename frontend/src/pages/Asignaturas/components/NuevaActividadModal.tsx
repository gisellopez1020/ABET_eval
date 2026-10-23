import { Dispatch, SetStateAction } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { ActividadCreate } from '../../../api/actividades';
import { Seccion } from '../../../types';

interface NuevaActividadModalProps {
  newActModal: boolean;
  setNewActModal: Dispatch<SetStateAction<boolean>>;
  newAct: ActividadCreate;
  setNewAct: Dispatch<SetStateAction<ActividadCreate>>;
  /** Secciones del curso: con dos o más se elige si la actividad aplica a todas o a algunas */
  secciones: Seccion[];
  actError: string;
  newActLoading: boolean;
  handleCreateActividad: () => void;
}

// Crear una actividad: nombre, tipo (individual / grupal), peso en la nota final y,
// si el curso tiene varias secciones, a cuáles aplica. Con una sola no se pregunta:
// "todas" incluye también las secciones que se creen después.
export function NuevaActividadModal({
  newActModal,
  setNewActModal,
  newAct,
  setNewAct,
  secciones,
  actError,
  newActLoading,
  handleCreateActividad,
}: NuevaActividadModalProps) {
  const eligeAlcance = secciones.length > 1;
  const sinSecciones = eligeAlcance && !newAct.aplica_todas_secciones && newAct.secciones_ids.length === 0;

  const toggleSeccion = (seccionId: number) =>
    setNewAct((f) => ({
      ...f,
      secciones_ids: f.secciones_ids.includes(seccionId)
        ? f.secciones_ids.filter((sid) => sid !== seccionId)
        : [...f.secciones_ids, seccionId],
    }));

  return (
      <Modal open={newActModal} onClose={() => setNewActModal(false)} title="Nueva actividad">
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={newAct.nombre}
            onChange={(e) => setNewAct((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Lab1: Cálculo de subredes"
          />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Tipo</label>
            <div className="flex gap-4">
              {(['individual', 'grupal'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={newAct.tipo === t}
                    onChange={() => setNewAct((f) => ({ ...f, tipo: t }))}
                    className="accent-[#9E0B0F]"
                  />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <Input
            label="Peso en nota final (%)"
            type="number"
            min={1}
            max={100}
            value={newAct.peso_nota_final}
            onChange={(e) => setNewAct((f) => ({ ...f, peso_nota_final: Number(e.target.value) }))}
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
                      checked={newAct.aplica_todas_secciones === todas}
                      onChange={() => setNewAct((f) => ({ ...f, aplica_todas_secciones: todas }))}
                      className="accent-[#9E0B0F]"
                    />
                    <span className="text-sm">{etiqueta}</span>
                  </label>
                ))}
              </div>
              {!newAct.aplica_todas_secciones && (
                <div className="mt-3 space-y-1.5">
                  {secciones.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newAct.secciones_ids.includes(s.id)}
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
          {actError && <p className="text-sm text-uao-accent">{actError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary"  className="rounded-xl border border-gray-200 bg-white text-gray-800 transition hover:border-[#9E0B0F] hover:bg-white"
             onClick={() => setNewActModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateActividad} loading={newActLoading} disabled={sinSecciones}>Crear</Button>
          </div>
        </div>
      </Modal>
  );
}
