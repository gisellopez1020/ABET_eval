import { describe, expect, it } from 'vitest';
import { deducirSo, parseRaAbetCsv } from './raAbetCsv';

describe('parseRaAbetCsv', () => {
  it('lee el formato básico y deduce el SO', () => {
    const r = parseRaAbetCsv(
      'Codigo,Competencia,Descripcion\n2.1,Diseño,Diseña soluciones\n4.2,Ética,Reconoce responsabilidades\n'
    );
    expect(r).toEqual({
      ok: true,
      items: [
        { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones' },
        { codigo: '4.2', so: '4', competencia: 'Ética', descripcion: 'Reconoce responsabilidades' },
      ],
    });
  });

  it('acepta encabezados con tilde, separador ; , BOM, CRLF y comillas', () => {
    const r = parseRaAbetCsv('﻿Código;COMPETENCIA;Descripción\r\n1.1;Problemas;"Identifica; formula y ""resuelve"""\r\n');
    expect(r.ok && r.items[0].descripcion).toBe('Identifica; formula y "resuelve"');
  });

  it('ignora líneas vacías', () => {
    const r = parseRaAbetCsv('Codigo,Competencia,Descripcion\n\n1.1,A,B\n,,\n');
    expect(r.ok && r.items).toHaveLength(1);
  });

  it('falla si falta una columna', () => {
    const r = parseRaAbetCsv('Codigo,Descripcion\n1.1,B\n');
    expect(!r.ok && r.error).toMatch(/Codigo, Competencia y Descripcion/);
  });

  it('falla con un campo vacío indicando la fila', () => {
    const r = parseRaAbetCsv('Codigo,Competencia,Descripcion\n1.1,A,B\n1.2,,C\n');
    expect(!r.ok && r.error).toBe('Fila 3: código, competencia o descripción vacío.');
  });

  it('falla con códigos repetidos dentro del archivo', () => {
    const r = parseRaAbetCsv('Codigo,Competencia,Descripcion\n1.1,A,B\n2.1,A,B\n1.1,A,C\n');
    expect(!r.ok && r.error).toBe('Fila 4: el código "1.1" ya aparece en la fila 2.');
  });

  it('falla si el código o la competencia exceden el largo de la columna', () => {
    expect(parseRaAbetCsv(`Codigo,Competencia,Descripcion\n${'9'.repeat(21)},A,B\n`).ok).toBe(false);
    expect(parseRaAbetCsv(`Codigo,Competencia,Descripcion\n1.1,${'x'.repeat(201)},B\n`).ok).toBe(false);
  });

  it('falla si no hay filas de datos', () => {
    expect(parseRaAbetCsv('Codigo,Competencia,Descripcion\n').ok).toBe(false);
    expect(parseRaAbetCsv('').ok).toBe(false);
  });
});

describe('deducirSo', () => {
  it.each([
    ['2.1', '2'],
    ['10.3.1', '10'],
    ['SO5', 'SO5'],
  ])('%s -> %s', (codigo, so) => {
    expect(deducirSo(codigo)).toBe(so);
  });
});
