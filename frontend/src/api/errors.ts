/**
 * Extrae un mensaje legible de un error de axios.
 * FastAPI devuelve `detail` como string (HTTPException) o como lista de
 * objetos {type, loc, msg, input} (errores de validación 422); renderizar
 * esa lista directamente en React lanza "Objects are not valid as a React child".
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as any)?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d?.msg ?? String(d)).join(' · ');
  }
  return fallback;
}
