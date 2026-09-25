export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Nombre del archivo desde Content-Disposition; prefiere filename* (UTF-8) sobre filename. */
export function nombreDesdeContentDisposition(header: string | undefined, porDefecto: string): string {
  if (!header) return porDefecto;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      // cae al filename simple
    }
  }
  const simple = /filename="?([^";]+)"?/i.exec(header);
  return simple ? simple[1].trim() : porDefecto;
}

/** Convierte el base64 que envía el backend en un Blob descargable. */
export function base64ABlob(base64: string, mime: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Dispara la descarga del Blob en el navegador con un enlace temporal. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Liberar después de que el navegador tome la descarga
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
