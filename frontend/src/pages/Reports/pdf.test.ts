// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cargarLogo, conTextoAlineado } from './pdf';

/** PNG mínimo: firma + cabecera IHDR con el ancho y alto dados (no hace falta que sea dibujable). */
function png(ancho: number, alto: number): ArrayBuffer {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const vista = new DataView(bytes.buffer);
  vista.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  vista.setUint32(16, ancho);
  vista.setUint32(20, alto);
  return bytes.buffer;
}

describe('cargarLogo', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('devuelve los bytes y las medidas del PNG', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png(514, 213))));
    const logo = await cargarLogo('/logo-uao.png');
    expect(logo).toMatchObject({ ancho: 514, alto: 213 });
    expect(logo!.datos.length).toBe(33);
    expect(fetch).toHaveBeenCalledWith('/logo-uao.png');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('sin archivo (404) devuelve null y solo avisa por consola', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect(await cargarLogo()).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('error de red: devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await cargarLogo()).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('el index.html que el servidor devuelve para rutas desconocidas no cuenta como logo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html><html></html>')));
    expect(await cargarLogo()).toBeNull();
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
