import { Button } from '../../../../components/ui/Button';
import { ModoCalificacionItem } from '../../../../types';

interface EncabezadoItemProps {
  tipo: 'individual' | 'grupal';
  /**
   * Ítem actual de la lista de la sesión. Mismo tipo que infiere la página para
   * `items[currentIndex] ?? null`; al abrir por URL directa no existe, y el JSX ya lo
   * contempla con `currentItem?.`.
   */
  currentItem: ModoCalificacionItem;
  iid: number;
  notaTotal: number;
  /** Lista de la sesión (location.state): solo para la posición y Anterior/Siguiente */
  items: ModoCalificacionItem[];
  currentIndex: number;
  /** goTo de la página, tal cual: navega a otro ítem de la lista actual */
  goTo: (index: number) => void;
}

// Encabezado del ítem que se califica: equipo o estudiante, nota total en vivo y,
// con más de un ítem, Anterior / posición / Siguiente
export function EncabezadoItem({ tipo, currentItem, iid, notaTotal, items, currentIndex, goTo }: EncabezadoItemProps) {
  return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                {tipo === 'grupal' ? 'Equipo' : 'Estudiante'}
              </p>
              <h2 className="text-xl font-bold text-uao-dark mt-0.5">
                {currentItem?.nombre ?? `Item ${iid}`}
              </h2>
              {tipo === 'grupal' && currentItem?.miembros?.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {currentItem.miembros.map((m) => m.nombre_completo).join(' · ')}
                </p>
              )}
              {tipo === 'individual' && currentItem?.miembros?.[0] && (
                <p className="text-sm text-gray-500 mt-1">
                  Código: {currentItem.miembros[0].codigo_estudiante}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Nota total</p>
              <p className={`text-4xl font-bold ${notaTotal >= 3 ? 'text-green-600' : 'text-uao-accent'}`}>
                {notaTotal.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">/ 5.00</p>
            </div>
          </div>

          {items.length > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
              >
                ← Anterior
              </Button>
              <span className="text-sm text-gray-500">
                {currentIndex + 1} / {items.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goTo(currentIndex + 1)}
                disabled={currentIndex === items.length - 1}
              >
                Siguiente →
              </Button>
            </div>
          )}
        </div>
  );
}
