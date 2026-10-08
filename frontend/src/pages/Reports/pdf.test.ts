// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cargarLogo, conTextoAlineado } from './pdf';

/**
 * jsdom no decodifica imágenes: este Image dispara onload con unas medidas fijas (u onerror si
 * la ruta contiene "no-existe"). La decodificación real y que jsPDF acepte el canvas no se
 * prueban aquí; el bug del decodificador de jsPDF queda fijado en pdf.jspdf.test.ts.
 */
class ImagenFalsa {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  constructor(private medidas: { ancho: number; alto: number }) {}
  set src(ruta: string) {
    queueMicrotask(() => {
      if (ruta.includes('no-existe')) return this.onerror?.();
      this.naturalWidth = this.medidas.ancho;
      this.naturalHeight = this.medidas.alto;
      this.onload?.();
    });
  }
}

describe('cargarLogo', () => {
  let imagenes: ImagenFalsa[];
  let drawImage: ReturnType<typeof vi.fn>;

  const usarImagen = (ancho: number, alto: number) => {
    vi.stubGlobal('Image', class extends ImagenFalsa {
      constructor() {
        super({ ancho, alto });
        imagenes.push(this);
      }
    });
  };

  beforeEach(() => {
    imagenes = [];
    drawImage = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    usarImagen(514, 213);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dibuja el logo en un canvas de su tamaño natural', async () => {
    const logo = await cargarLogo('/logo-uao.png');
    expect(logo).toMatchObject({ ancho: 514, alto: 213 });
    expect(logo!.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([logo!.canvas.width, logo!.canvas.height]).toEqual([514, 213]);
    expect(drawImage).toHaveBeenCalledWith(imagenes[0], 0, 0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('si la imagen no carga (404, red, HTML de respaldo) devuelve null y solo avisa', async () => {
    expect(await cargarLogo('/no-existe.png')).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('sin contexto 2D devuelve null', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(await cargarLogo()).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('una imagen sin dimensiones devuelve null', async () => {
    usarImagen(0, 0);
    expect(await cargarLogo()).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('conTextoAlineado', () => {
  const parche = () => document.head.querySelector('style[data-parche-html2canvas]');

  it('aplica img inline-block solo mientras dura la captura', async () => {
    let durante: string | null | undefined;
    const resultado = await conTextoAlineado(async () => {
      durante = parche()?.textContent;
      return 'canvas';
    });
    expect(resultado).toBe('canvas');
    expect(durante).toBe('img { display: inline-block; }');
    expect(parche()).toBeNull();
  });

  it('quita el estilo aunque la captura falle', async () => {
    await expect(conTextoAlineado(() => Promise.reject(new Error('falló')))).rejects.toThrow('falló');
    expect(parche()).toBeNull();
  });
});
