import { DynamicListEditor } from '../../../components/ui/DynamicListEditor';
import { MAX_RANGOS, RangoForm } from '../../../utils/rangos';

interface RangosCalificacionEditorProps {
  value: RangoForm[];
  onChange: (value: RangoForm[]) => void;
  emptyText?: string;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10';

export function RangosCalificacionEditor({
  value,
  onChange,
  emptyText = 'Sin rangos: al crear la asignatura se usarán los 3 rangos por defecto.',
}: RangosCalificacionEditorProps) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_5.5rem_5.5rem_2.5rem] gap-2 text-xs font-medium text-gray-500">
        <span>Etiqueta</span>
        <span>Mínimo</span>
        <span>Máximo</span>
        <span />
      </div>
      <DynamicListEditor
        items={value}
        onChange={onChange}
        createItem={() => ({ etiqueta: '', minimo: '', maximo: '' })}
        addLabel="Agregar rango"
        emptyText={emptyText}
        maxItems={MAX_RANGOS}
        renderItem={(rango, update, index) => (
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2">
            <input
              value={rango.etiqueta}
              onChange={(e) => update({ ...rango, etiqueta: e.target.value })}
              placeholder="Ej: 3.0-3.9"
              aria-label={`Etiqueta del rango ${index + 1}`}
              className={INPUT_CLASS}
            />
            <input
              value={rango.minimo}
              onChange={(e) => update({ ...rango, minimo: e.target.value })}
              inputMode="decimal"
              placeholder="0.0"
              aria-label={`Mínimo del rango ${index + 1}`}
              className={INPUT_CLASS}
            />
            <input
              value={rango.maximo}
              onChange={(e) => update({ ...rango, maximo: e.target.value })}
              inputMode="decimal"
              placeholder="5.0"
              aria-label={`Máximo del rango ${index + 1}`}
              className={INPUT_CLASS}
            />
          </div>
        )}
      />
      <p className="mt-2 text-xs text-gray-400">
        Escala 0–5, límites inclusivos. Los rangos no pueden solaparse; puede haber huecos.
      </p>
    </div>
  );
}
