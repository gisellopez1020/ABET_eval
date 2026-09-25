import { describe, expect, it } from 'vitest';
import { base64ABlob, nombreDesdeContentDisposition } from './descarga';

describe('nombreDesdeContentDisposition', () => {
  it('prefiere filename* en UTF-8', () => {
    const header = `attachment; filename="ABET_R-1_Diseno.xlsx"; filename*=UTF-8''ABET_R-1_Dise%C3%B1o.xlsx`;
    expect(nombreDesdeContentDisposition(header, 'x.xlsx')).toBe('ABET_R-1_Diseño.xlsx');
  });

  it('usa filename si no hay filename*', () => {
    expect(nombreDesdeContentDisposition('attachment; filename="a.xlsx"', 'x.xlsx')).toBe('a.xlsx');
  });

  it('usa el nombre por defecto sin cabecera', () => {
    expect(nombreDesdeContentDisposition(undefined, 'x.xlsx')).toBe('x.xlsx');
  });
});

describe('base64ABlob', () => {
  it('conserva los bytes y el tipo', async () => {
    const blob = base64ABlob(btoa('PK\u0003\u0004'), 'application/zip');
    expect(blob.type).toBe('application/zip');
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([0x50, 0x4b, 3, 4]);
  });
});
