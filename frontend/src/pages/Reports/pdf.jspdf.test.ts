import { beforeAll, describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';

// Regresión que documenta por qué cargarLogo (pdf.ts) pasa el logo por un canvas en vez de darle
// a addImage los bytes del archivo: el decodificador PNG de jsPDF falla con paletas de 1/2/4 bits
// con transparencia parcial (tRNS), que es el formato de logo-uao.png (decodePixels supone al menos
// 8 bits por píxel). Si esta prueba deja de pasar, jsPDF lo corrigió y se podría simplificar.
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

  it('addImage con los bytes crudos del PNG lanza RangeError', () => {
    expect(() => new jsPDF().addImage(logo, 'PNG', 0, 0, 10, 10)).toThrow(RangeError);
  });
});
