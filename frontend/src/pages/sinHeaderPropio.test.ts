import { describe, expect, it } from 'vitest';

/**
 * AppLayout dibuja el único <Header> (con el nombre del docente del store); una
 * página que pinte el suyo lo tapa con "Usuario". Las migas van en <AppLayout crumbs>.
 */
const paginas = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('páginas', () => {
  it('se encontraron las páginas', () => {
    expect(Object.keys(paginas)).toContain('./Course/CoursePage.tsx');
  });

  it('ninguna importa el Header del layout', () => {
    const conHeader = Object.entries(paginas)
      .filter(([, codigo]) => /from\s+['"][./]*components\/Layout\/Header['"]/.test(codigo))
      .map(([ruta]) => ruta);
    expect(conHeader).toEqual([]);
  });
});
