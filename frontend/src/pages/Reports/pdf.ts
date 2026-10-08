// Piezas del PDF del reporte ABET (ReportsPage).

type RGB = [number, number, number];

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
  canvas: HTMLCanvasElement;
  ancho: number;
  alto: number;
}

/**
 * Carga el logo con el navegador y lo dibuja en un canvas, que es lo que recibe addImage.
 * No se le pasan a jsPDF los bytes del archivo: su decodificador PNG falla (RangeError) con
 * paletas de 1/2/4 bits con transparencia parcial, que es justo el formato de logo-uao.png
 * (ver pdf.jspdf.test.ts). Si no carga (404, error de red o el index.html que devuelve el
 * servidor para rutas desconocidas: todos disparan onerror) devuelve null y el PDF se
 * genera sin logo.
 */
export async function cargarLogo(ruta: string = RUTA_LOGO): Promise<LogoPDF | null> {
  try {
    const imagen = new Image();
    await new Promise<void>((resolver, rechazar) => {
      imagen.onload = () => resolver();
      imagen.onerror = () => rechazar(new Error('la imagen no cargó'));
      imagen.src = ruta;
    });
    const ancho = imagen.naturalWidth;
    const alto = imagen.naturalHeight;
    if (!ancho || !alto) throw new Error('la imagen no tiene dimensiones');

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('sin contexto 2D');
    contexto.drawImage(imagen, 0, 0);
    return { canvas, ancho, alto };
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
