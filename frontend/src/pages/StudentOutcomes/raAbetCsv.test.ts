import { describe, expect, it } from 'vitest';
import { CatalogoExistente, deducirSo, parsePesoCriterio, parseRaAbetCsv, resumenPesos } from './raAbetCsv';

const H = 'Codigo,Competencia,Descripcion,CodigoPadre,Peso\n';

describe('parseRaAbetCsv: un nivel (compatibilidad)', () => {
  it('lee el formato básico sin CodigoPadre/Peso y deduce el SO', () => {
    const r = parseRaAbetCsv(
      'Codigo,Competencia,Descripcion\n2.1,Diseño,Diseña soluciones\n4.2,Ética,Reconoce responsabilidades\n'
    );
    expect(r).toEqual({
      ok: true,
      items: [
        { codigo: '2.1', so: '2', competencia: 'Diseño', descripcion: 'Diseña soluciones', codigo_padre: null, peso: null },
        { codigo: '4.2', so: '4', competencia: 'Ética', descripcion: 'Reconoce responsabilidades', codigo_padre: null, peso: null },
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

  it('falla si falta una columna obligatoria', () => {
    const r = parseRaAbetCsv('Codigo,Descripcion\n1.1,B\n');
    expect(!r.ok && r.error).toMatch(/Codigo, Competencia y Descripcion/);
  });

  it('falla con descripción vacía indicando la fila', () => {
    const r = parseRaAbetCsv('Codigo,Competencia,Descripcion\n1.1,A,B\n1.2,A,\n');
    expect(!r.ok && r.error).toBe('Fila 3: código o descripción vacío.');
  });

  it('un RA sin competencia falla', () => {
    const r = parseRaAbetCsv('Codigo,Competencia,Descripcion\n1.1,A,B\n1.2,,C\n');
    expect(!r.ok && r.error).toBe('Fila 3: la competencia es obligatoria en un Resultado de Aprendizaje.');
  });

  it('falla con códigos repetidos dentro del archivo', () => {
    const r = parseRaAbetCsv('Codigo,Competencia,Descripcion\n1.1,A,B\n2.1,A,B\n1.1,A,C\n');
    expect(!r.ok && r.error).toBe('Fila 4: el código "1.1" ya aparece en la fila 2.');
  });

  it('falla si el código excede el largo de la columna', () => {
    const r = parseRaAbetCsv(`Codigo,Competencia,Descripcion\n${'9'.repeat(21)},A,B\n`);
    expect(!r.ok && r.error).toMatch(/máximo 20 caracteres/);
  });

  it('acepta competencias largas (la redacción oficial supera 200 caracteres)', () => {
    const competencia = 'x'.repeat(280);
    const r = parseRaAbetCsv(`Codigo,Competencia,Descripcion\n1.1,${competencia},B\n`);
    expect(r.ok && r.items[0].competencia).toBe(competencia);
  });

  it('falla si no hay filas de datos', () => {
    expect(parseRaAbetCsv('Codigo,Competencia,Descripcion\n').ok).toBe(false);
    expect(parseRaAbetCsv('').ok).toBe(false);
  });
});

describe('parseRaAbetCsv: dos niveles', () => {
  it('lee RA y Criterios; el Criterio sin competencia hereda la de su RA', () => {
    const r = parseRaAbetCsv(`${H}2.1,Diseño,Diseña,,\n2.1.1,,Requisitos,2.1,0.6\n2.1.2,Propia,Interfaz,2.1,40%\n`);
    expect(r.ok && r.items.map((i) => [i.codigo, i.codigo_padre, i.peso, i.competencia, i.so])).toEqual([
      ['2.1', null, null, 'Diseño', '2'],
      ['2.1.1', '2.1', 0.6, 'Diseño', '2'],
      ['2.1.2', '2.1', 0.4, 'Propia', '2'],
    ]);
  });

  it('acepta un Criterio antes que su RA en el archivo', () => {
    const r = parseRaAbetCsv(`${H}2.1.1,,Requisitos,2.1,1\n2.1,Diseño,Diseña,,\n`);
    expect(r.ok && r.items[0]).toMatchObject({ codigo: '2.1.1', codigo_padre: '2.1', competencia: 'Diseño' });
  });

  it('encuentra "Codigo" aunque "CodigoPadre" venga antes en el encabezado', () => {
    const r = parseRaAbetCsv('Codigo Padre;Peso;Código;Competencia;Descripción\n;;2.1;Diseño;D\n2.1;0,5;2.1.1;;C\n');
    expect(r.ok && r.items.map((i) => [i.codigo, i.codigo_padre, i.peso])).toEqual([
      ['2.1', null, null],
      ['2.1.1', '2.1', 0.5],
    ]);
  });

  it('acepta pesos que no suman 1.0 (el caso real del RA "1.2")', () => {
    const r = parseRaAbetCsv(`${H}1.2,C,D,,\n1.2.1,,A,1.2,0.3\n1.2.2,,B,1.2,0.3\n`);
    expect(r.ok).toBe(true);
  });

  it('padre en el catálogo pero no en el archivo: se acepta y hereda su competencia', () => {
    const catalogo: CatalogoExistente = [{ codigo: '2.1', codigo_padre: null, competencia: 'Diseño' }];
    const r = parseRaAbetCsv(`${H}2.1.1,,Requisitos,2.1,1\n`, catalogo);
    expect(r.ok && r.items[0].competencia).toBe('Diseño');
  });

  it('padre inexistente (ni en el archivo ni en el catálogo): error con la fila', () => {
    const r = parseRaAbetCsv(`${H}2.1,Diseño,D,,\n1.9.1,,X,1.9,1\n`);
    expect(!r.ok && r.error).toBe('Fila 3: el RA padre "1.9" no existe ni en el archivo ni en el catálogo.');
  });

  it('padre que es Criterio en el archivo: error (solo 2 niveles)', () => {
    const r = parseRaAbetCsv(`${H}2.1,Diseño,D,,\n2.1.1,,X,2.1,1\n2.1.1.1,,Y,2.1.1,1\n`);
    expect(!r.ok && r.error).toMatch(/^Fila 4: el padre "2.1.1" es un Criterio/);
  });

  it('padre que es Criterio en el catálogo: error', () => {
    const catalogo: CatalogoExistente = [
      { codigo: '2.1', codigo_padre: null, competencia: 'D' },
      { codigo: '2.1.1', codigo_padre: '2.1', competencia: 'D' },
    ];
    const r = parseRaAbetCsv(`${H}2.1.1.1,,Y,2.1.1,1\n`, catalogo);
    expect(!r.ok && r.error).toMatch(/es un Criterio/);
  });

  it('un código no puede cambiar de nivel respecto al catálogo', () => {
    const catalogo: CatalogoExistente = [
      { codigo: '2.1', codigo_padre: null, competencia: 'D' },
      { codigo: '2.2', codigo_padre: null, competencia: 'D' },
    ];
    const r = parseRaAbetCsv(`${H}2.2,,X,2.1,1\n`, catalogo);
    expect(!r.ok && r.error).toBe('Fila 2: "2.2" ya existe como Resultado de Aprendizaje y no puede cambiar de nivel.');
  });

  it('propio padre: error', () => {
    const r = parseRaAbetCsv(`${H}2.1,,X,2.1,1\n`);
    expect(!r.ok && r.error).toMatch(/su propio padre/);
  });

  it.each([
    ['2.1,', 'CodigoPadre y Peso van juntos'],
    [',0.5', 'CodigoPadre y Peso van juntos'],
    ['2.1,40', '¿quiso decir 40%?'],
    ['2.1,abc', 'no es un número válido'],
    ['2.1,0', 'mayor que 0'],
    ['2.1,150%', 'mayor que 0 y como máximo 1'],
  ])('fila de Criterio inválida (%s)', (padrePeso, error) => {
    const r = parseRaAbetCsv(`${H}2.1,Diseño,D,,\n2.1.1,,X,${padrePeso}\n`);
    expect(!r.ok && r.error).toContain(error);
  });
});

describe('parsePesoCriterio', () => {
  it.each([
    ['0.4', 0.4],
    ['0,4', 0.4],
    ['40%', 0.4],
    ['7 %', 0.07],
    ['1', 1],
    ['100%', 1],
    ['.25', 0.25],
  ])('%s -> %s', (raw, peso) => {
    expect(parsePesoCriterio(raw)).toEqual({ ok: true, peso });
  });

  it('rechaza 40 sin % con una pista', () => {
    const r = parsePesoCriterio('40');
    expect(!r.ok && r.error).toContain('¿quiso decir 40%?');
  });
});

describe('resumenPesos', () => {
  it('detecta 1.0 sin errores de coma flotante', () => {
    expect(resumenPesos([0.1, 0.2, 0.7])).toEqual({ suma: 1, completo: true });
    expect(resumenPesos([0.3, 0.3])).toEqual({ suma: 0.6, completo: false });
  });
});

describe('deducirSo', () => {
  it.each([
    ['2.1', '2'],
    ['2.1.1', '2'],
    ['10.3.1', '10'],
    ['SO5', 'SO5'],
  ])('%s -> %s', (codigo, so) => {
    expect(deducirSo(codigo)).toBe(so);
  });
});
