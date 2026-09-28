import { Aspecto, CalificacionOut } from '../types';

/**
 * Valores iniciales de los toggles al abrir la pantalla de calificar: el valor
 * guardado de cada criterio de la rúbrica, o 0 si todavía no tiene calificación.
 * Las calificaciones de criterios que ya no están en la rúbrica se ignoran para
 * no reenviarlas al guardar.
 */
export function valoresIniciales(
  aspectos: Aspecto[],
  calificaciones: Pick<CalificacionOut, 'criterio_id' | 'valor'>[]
): Record<number, 0 | 1> {
  const guardados = new Map(calificaciones.map((c) => [c.criterio_id, c.valor]));
  const valores: Record<number, 0 | 1> = {};
  for (const aspecto of aspectos) {
    for (const criterio of aspecto.criterios) {
      valores[criterio.id] = guardados.get(criterio.id) ?? 0;
    }
  }
  return valores;
}
