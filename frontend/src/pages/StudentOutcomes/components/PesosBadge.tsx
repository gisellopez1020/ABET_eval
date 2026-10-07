import { Badge } from '../../../components/ui/Badge';
import { formatPeso } from '../raAbetDraft';
import { resumenPesos } from '../raAbetCsv';

/** Suma de pesos de los Criterios de un RA: advertencia si no es 1.0 (no bloquea nada). */
export function PesosBadge({ pesos }: { pesos: number[] }) {
  if (pesos.length === 0) return null;
  const { suma, completo } = resumenPesos(pesos);
  return completo ? (
    <span className="text-xs text-gray-400" title="Los pesos de sus criterios suman 1.0">
      Σ 1.0
    </span>
  ) : (
    <span title="Los pesos de sus criterios no suman 1.0">
      <Badge variant="warning">Pesos: {formatPeso(suma)}/1.0</Badge>
    </span>
  );
}
