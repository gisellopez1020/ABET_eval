// Piezas del PDF del reporte ABET (ReportsPage) que no dependen de React.

type RGB = [number, number, number];

// Colores de la "piel" del documento: el granate de marca de la app (barra lateral, botones,
// encabezados de DataTable) y los grises de Tailwind. La escala de rangos no se toca: va
// dentro de la imagen capturada de la gráfica.
export const COLOR_MARCA: RGB = [158, 11, 15];
export const FONDO_ENCABEZADO_TABLA: RGB = [245, 231, 231];
export const BORDE_ENCABEZADO_TABLA: RGB = [226, 182, 183];
export const COLOR_TEXTO: RGB = [55, 65, 81];
export const COLOR_METADATOS: RGB = [75, 85, 99];

/**
 * Logo de la UAO: archivo fijo frontend/public/logo-uao.png, servido en la raíz de la app.
 * Se pide en tiempo de ejecución (sin import) para que el build no dependa de que exista.
 */
export const RUTA_LOGO = `${import.meta.env.BASE_URL}logo-uao.png`;

export interface LogoPDF {
  datos: Uint8Array;
  ancho: number;
  alto: number;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Descarga el logo y lee sus medidas de la cabecera PNG. Si no está (404, error de red o
 * una respuesta que no es PNG, como el index.html que devuelve el servidor para rutas
 * desconocidas) devuelve null y el PDF se genera sin logo.
 */
export async function cargarLogo(ruta: string = RUTA_LOGO): Promise<LogoPDF | null> {
  try {
    const resp = await fetch(ruta);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const datos = new Uint8Array(await resp.arrayBuffer());
    if (datos.length < 24 || FIRMA_PNG.some((b, i) => datos[i] !== b)) throw new Error('no es un PNG');
    const cabecera = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
    return { datos, ancho: cabecera.getUint32(16), alto: cabecera.getUint32(20) };
  } catch (error) {
    console.warn(`No se pudo cargar el logo (${ruta}); el PDF se exporta sin logo.`, error);
    return null;
  }
}

/**
 * Corre las capturas de html2canvas con `img { display: inline-block }` en el documento.
 * html2canvas 1.4.1 ubica la línea base del texto midiendo un <img> en línea dentro del
 * documento original, y el preflight de Tailwind (`img { display: block }`) rompe esa medida:
 * todo el texto HTML (la leyenda de Recharts) sale corrido hacia abajo y se corta en el borde.
 */
export async function conTextoAlineado<T>(capturar: () => Promise<T>): Promise<T> {
  const estilo = document.createElement('style');
  estilo.dataset.parcheHtml2canvas = '';
  estilo.textContent = 'img { display: inline-block; }';
  document.head.appendChild(estilo);
  try {
    return await capturar();
  } finally {
    estilo.remove();
  }
}
