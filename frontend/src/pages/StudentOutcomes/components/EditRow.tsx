import { Dispatch, SetStateAction } from 'react';
import { Check, X } from 'lucide-react';

import { RaAbet } from '../../../types';
import { deducirSo } from '../raAbetCsv';
import { Editing, RowDraft } from '../raAbetDraft';
import { ICON_BUTTON } from './estilos';

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

interface EditRowProps {
  editing: Editing;
  draft: RowDraft;
  setDraft: Dispatch<SetStateAction<RowDraft>>;
  /** Resultados de Aprendizaje: opciones de "RA padre" de un Criterio */
  raices: RaAbet[];
  porCodigo: Map<string, RaAbet>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

// Fila en edición (nueva, o en el lugar de la fila que se edita). Quien la usa le pone
// la key: editing.codigo ?? '__nuevo__'
export function EditRow({ editing, draft, setDraft, raices, porCodigo, saving, onSave, onCancel }: EditRowProps) {
    const esNuevo = editing.codigo === null;
    const esCriterio = editing.nivel === 'criterio';
    const padre = esCriterio ? porCodigo.get(draft.codigo_padre) : undefined;

    return (
      <tr key={editing.codigo ?? '__nuevo__'} className="border-t border-[#e5e7eb] bg-[#9E0B0F]/[0.03]">
        <td className="px-3 py-2 align-top">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            {esCriterio ? 'Criterio' : 'Resultado de Aprendizaje'}
          </p>
          {esNuevo ? (
            <input
              value={draft.codigo}
              onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))}
              placeholder={esCriterio ? 'Ej: 2.1.1' : 'Ej: 2.1'}
              aria-label="Código"
              maxLength={20}
              className={INPUT_CLASS}
              autoFocus
            />
          ) : (
            <span className="font-semibold text-[#9E0B0F]">{draft.codigo}</span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <input
            value={draft.so}
            onChange={(e) => setDraft((d) => ({ ...d, so: e.target.value }))}
            placeholder={deducirSo(draft.codigo) || 'Auto'}
            aria-label="SO"
            maxLength={20}
            className={INPUT_CLASS}
          />
        </td>
        <td className="px-3 py-2 align-top">
          <textarea
            value={draft.competencia}
            onChange={(e) => setDraft((d) => ({ ...d, competencia: e.target.value }))}
            placeholder={esCriterio ? padre?.competencia ?? 'Hereda la del RA' : ''}
            aria-label="Competencia"
            rows={2}
            className={INPUT_CLASS}
          />
        </td>
        <td className="px-3 py-2 align-top">
          <textarea
            value={draft.descripcion}
            onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
            aria-label="Descripción"
            rows={2}
            className={INPUT_CLASS}
          />
        </td>
        <td className="px-3 py-2 align-top">
          {esCriterio ? (
            <div className="space-y-1.5">
              <select
                value={draft.codigo_padre}
                onChange={(e) => setDraft((d) => ({ ...d, codigo_padre: e.target.value }))}
                aria-label="RA padre"
                className={INPUT_CLASS}
              >
                {raices.map((ra) => (
                  <option key={ra.codigo} value={ra.codigo}>
                    RA {ra.codigo}
                  </option>
                ))}
              </select>
              <input
                value={draft.peso}
                onChange={(e) => setDraft((d) => ({ ...d, peso: e.target.value }))}
                inputMode="decimal"
                placeholder="0.4 o 40%"
                aria-label="Peso"
                className={INPUT_CLASS}
              />
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <input
            value={draft.programa}
            onChange={(e) => setDraft((d) => ({ ...d, programa: e.target.value }))}
            aria-label="Programa"
            maxLength={200}
            className={INPUT_CLASS}
          />
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              aria-label="Guardar"
              title="Guardar"
              className={`${ICON_BUTTON} hover:border-green-300 hover:text-green-700 disabled:opacity-50`}
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancelar"
              title="Cancelar"
              className={`${ICON_BUTTON} hover:border-gray-300 hover:text-gray-900`}
            >
              <X size={15} />
            </button>
          </div>
        </td>
      </tr>
    );
}
