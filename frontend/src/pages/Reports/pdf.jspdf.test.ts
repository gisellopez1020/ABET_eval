import { beforeAll, describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';

// Documenta el formato del logo y cómo lo trata jsPDF. Hasta jsPDF 2.x, addImage con los bytes
// crudos de logo-uao.png lanzaba RangeError: su decodificador PNG no soportaba paletas de 1/2/4
// bits con transparencia parcial (tRNS). Desde jsPDF 3 (decodificador fast-png) los acepta.
// cargarLogo (pdf.ts) sigue pasando el logo por un canvas a propósito: así el PDF del reporte
// sale idéntico al de antes de la actualización (misma imagen RGBA y compresión 'FAST').
describe('jsPDF con el logo real', () => {
  let logo: Uint8Array;

  beforeAll(async () => {
    // Import dinámico con tipo mínimo: el proyecto no incluye @types/node
    const fs = (await import('node:fs' as string)) as { readFileSync(ruta: URL): Uint8Array };
    logo = new Uint8Array(fs.readFileSync(new URL('../../../public/logo-uao.png', import.meta.url)));
  });

  it('el logo del repo es un PNG de paleta de 4 bits con transparencia parcial', () => {
    const texto = (desde: number, hasta: number) => String.fromCharCode(...logo.subarray(desde, hasta));
    expect(texto(1, 4)).toBe('PNG');
    expect([logo[24], logo[25]]).toEqual([4, 3]); // IHDR: profundidad 4, tipo de color 3 (paleta)

    const i = texto(0, logo.length).indexOf('tRNS');
    const largo = new DataView(logo.buffer, logo.byteOffset).getUint32(i - 4);
    const alfas = [...logo.subarray(i + 4, i + 4 + largo)];
    expect(alfas.some((a) => a > 0 && a < 255)).toBe(true);
  });

  it('addImage ya acepta los bytes crudos del PNG (jsPDF >= 3)', () => {
    expect(() => new jsPDF().addImage(logo, 'PNG', 0, 0, 10, 10)).not.toThrow();
  });
});
