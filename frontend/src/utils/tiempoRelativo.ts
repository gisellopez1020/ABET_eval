const formato = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

const UNIDADES: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "hace 2 horas", "ayer", "hace 3 semanas"... Menos de un minuto (o fecha futura): "hace un momento". */
export function tiempoRelativo(fecha: string | Date, ahora: Date = new Date()): string {
  const segundos = Math.floor((ahora.getTime() - new Date(fecha).getTime()) / 1000);
  for (const [unidad, duracion] of UNIDADES) {
    if (segundos >= duracion) {
      return formato.format(-Math.floor(segundos / duracion), unidad);
    }
  }
  return 'hace un momento';
}
