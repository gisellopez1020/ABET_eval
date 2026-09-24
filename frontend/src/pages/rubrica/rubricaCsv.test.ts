import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, parseRubricaCsv } from './rubricaCsv';

const EJEMPLO = `Aspecto,Criterio,Peso
Diseño,Cumple los requisitos funcionales,40
Diseño,Interfaz clara y usable,20
Implementación,Código organizado y comentado,25
Implementación,Manejo correcto de errores,15
`;

describe('parseRubricaCsv', () => {
  it('agrupa el ejemplo por aspecto', () => {
    const r = parseRubricaCsv(EJEMPLO);
    expect(r).toEqual({
      ok: true,
      aspectos: [
        {
          nombre: 'Diseño',
          criterios: [
            { texto: 'Cumple los requisitos funcionales', peso: 40 },
            { texto: 'Interfaz clara y usable', peso: 20 },
          ],
        },
        {
          nombre: 'Implementación',
          criterios: [
            { texto: 'Código organizado y comentado', peso: 25 },
            { texto: 'Manejo correcto de errores', peso: 15 },
          ],
        },
      ],
    });
  });

  it('agrupa por nombre aunque las filas no sean consecutivas (sin distinguir mayúsculas/espacios)', () => {
    const r = parseRubricaCsv('Aspecto,Criterio,Peso\nDiseño,A,40\nImplementación,B,25\n diseño ,C,35\n');
    expect(r.ok && r.aspectos.map((a) => [a.nombre, a.criterios.length])).toEqual([
      ['Diseño', 2],
      ['Implementación', 1],
    ]);
  });

  it('acepta encabezados en minúscula, con tilde o con sufijo, BOM y CRLF', () => {
    const r = parseRubricaCsv('﻿aspecto,críterio,Peso (%)\r\nX,Y,100\r\n');
    expect(r).toEqual({ ok: true, aspectos: [{ nombre: 'X', criterios: [{ texto: 'Y', peso: 100 }] }] });
  });

  it('respeta comas dentro de campos entre comillas', () => {
    const r = parseRubricaCsv('Aspecto,Criterio,Peso\nCódigo,"Organizado, comentado y ""limpio""",100\n');
    expect(r.ok && r.aspectos[0].criterios[0].texto).toBe('Organizado, comentado y "limpio"');
  });

  it('acepta separador ; con coma decimal y peso con %', () => {
    const r = parseRubricaCsv('Aspecto;Criterio;Peso\nA;x;12,5\nA;y;87,5%\n');
    expect(r.ok && r.aspectos[0].criterios.map((c) => c.peso)).toEqual([12.5, 87.5]);
  });

  it('ignora líneas vacías', () => {
    const r = parseRubricaCsv('Aspecto,Criterio,Peso\n\nA,x,100\n,,\n');
    expect(r.ok && r.aspectos[0].criterios).toHaveLength(1);
  });

  it('falla si falta una columna', () => {
    const r = parseRubricaCsv('Aspecto,Criterio\nA,x\n');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Aspecto, Criterio y Peso/);
  });

  it.each(['abc', '0', '-5', '101', '10.555', ''])('falla con peso inválido %j', (peso) => {
    const r = parseRubricaCsv(`Aspecto,Criterio,Peso\nA,x,${peso}\n`);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Fila 2: el peso/);
  });

  it('falla si el aspecto o el criterio están vacíos', () => {
    const r = parseRubricaCsv('Aspecto,Criterio,Peso\nA,x,50\n,y,50\n');
    expect(!r.ok && r.error).toBe('Fila 3: aspecto o criterio vacío.');
  });

  it('falla si no hay filas de datos', () => {
    expect(parseRubricaCsv('Aspecto,Criterio,Peso\n')).toEqual({ ok: false, error: 'El archivo no contiene criterios.' });
    expect(parseRubricaCsv('').ok).toBe(false);
  });
});

describe('decodeCsvBytes', () => {
  it('decodifica UTF-8', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('Diseño').buffer as ArrayBuffer)).toBe('Diseño');
  });

  it('cae a Windows-1252 si no es UTF-8 válido', () => {
    // "Diseño" en Windows-1252: ñ = 0xF1
    const bytes = new Uint8Array([0x44, 0x69, 0x73, 0x65, 0xf1, 0x6f]);
    expect(decodeCsvBytes(bytes.buffer)).toBe('Diseño');
  });
});
