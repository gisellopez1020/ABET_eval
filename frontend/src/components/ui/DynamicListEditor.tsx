import { ReactNode, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface DynamicListEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Crea el valor de una fila nueva al pulsar "Agregar". */
  createItem: () => T;
  /** Renderiza el contenido editable de una fila; `update` reemplaza el valor de esa fila. */
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  addLabel?: string;
  emptyText?: string;
  maxItems?: number;
}

/**
 * Lista dinámica controlada con "Agregar" y "Quitar" por fila.
 * Las keys de React son estables (generadas al agregar filas), no el índice:
 * al quitar una fila intermedia las demás conservan su DOM, foco y contenido.
 */
export function DynamicListEditor<T>({
  items,
  onChange,
  createItem,
  renderItem,
  addLabel = 'Agregar',
  emptyText = 'Sin elementos.',
  maxItems,
}: DynamicListEditorProps<T>) {
  const seq = useRef(0);
  const keys = useRef<string[]>([]);
  const nextKey = () => `row-${++seq.current}`;

  // Si la lista cambió desde fuera (p. ej. al reiniciar el formulario), sincroniza las keys.
  if (keys.current.length !== items.length) {
    keys.current = items.map((_, i) => keys.current[i] ?? nextKey());
  }

  const canAdd = maxItems === undefined || items.length < maxItems;

  const add = () => {
    if (!canAdd) return;
    keys.current = [...keys.current, nextKey()];
    onChange([...items, createItem()]);
  };

  const remove = (index: number) => {
    keys.current = keys.current.filter((_, i) => i !== index);
    onChange(items.filter((_, i) => i !== index));
  };

  const update = (index: number, next: T) => {
    onChange(items.map((item, i) => (i === index ? next : item)));
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-500">
          {emptyText}
        </p>
      ) : (
        items.map((item, index) => (
          <div key={keys.current[index]} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{renderItem(item, (next) => update(index, next), index)}</div>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Quitar fila ${index + 1}`}
              title="Quitar"
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-red-300 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={add}
        disabled={!canAdd}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} />
        {addLabel}
        {maxItems !== undefined && (
          <span className="text-gray-400">
            ({items.length}/{maxItems})
          </span>
        )}
      </button>
    </div>
  );
}
