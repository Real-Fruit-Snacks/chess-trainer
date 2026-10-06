// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORS, PIECES_DIR, pieceCss, pieceFile, ROLES, SETS, svgUri } from './index.mjs';

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), 'utf8');

describe('piece sets', () => {
  it('match the sets the app offers and loads', () => {
    const ids = SETS.map((set) => set.id);
    const settings = read('src', 'store', 'settings.ts');
    expect(/PIECE_SET_IDS = \[([^\]]+)\]/.exec(settings)?.[1]?.match(/[a-z]+/g)).toEqual(ids);
    // Classic is bundled; every other set has a loader for its stylesheet.
    expect(read('src', 'main.tsx')).toContain("import '@/components/board/pieces/classic.css';");
    const styles = read('src', 'components', 'board', 'pieceStyles.ts');
    for (const id of ids.slice(1)) {
      expect(styles).toContain(`${id}: () => import('./pieces/${id}.css')`);
    }
    // Each stylesheet in the folder is one of the sets: none is left over from a removed set.
    const sheets = readdirSync(PIECES_DIR).filter((file) => file.endsWith('.css'));
    expect(sheets.sort()).toEqual(ids.map((id) => `${id}.css`).sort());
  });

  it('are written out: the stylesheets match the SVGs (run npm run pieces:generate)', () => {
    for (const set of SETS) {
      expect(readFileSync(join(PIECES_DIR, `${set.id}.css`), 'utf8'), set.id).toBe(pieceCss(set));
    }
  });

  it('have all twelve pieces, each a plain SVG with nothing to fetch or run', () => {
    for (const set of SETS.filter((s) => s.id !== 'classic')) {
      const files = new Set<string>();
      for (const color of COLORS) {
        for (const role of ROLES) {
          const file = pieceFile(set.id, role, color);
          expect(existsSync(file), file).toBe(true);
          const svg = readFileSync(file, 'utf8');
          expect(svg, file).toMatch(/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
          expect(svg, file).not.toMatch(/<script|\son[a-z]+=|javascript:|href="(?!#)/i);
          files.add(svg);
        }
      }
      expect(files.size, set.id).toBe(12);
    }
  });

  it('credit every set with its licence, the non-commercial ones flagged', () => {
    const readme = read('src', 'components', 'board', 'pieces', 'README.md');
    const notices = read('THIRD_PARTY_NOTICES.md');
    const registry = read('src', 'components', 'board', 'pieceSets.ts');
    for (const set of SETS) {
      const name =
        set.id === 'mpchess' ? 'MPChess' : `${set.id[0]?.toUpperCase()}${set.id.slice(1)}`;
      expect(readme, set.id).toContain(`| ${name} `);
      expect(notices, set.id).toContain(name);
      expect(registry, set.id).toContain(`  ${set.id}: {`);
    }
    for (const set of SETS.filter((s) => s.description.includes('NC'))) {
      expect(set.description).toContain('non-commercial use only');
    }
    expect(readme).toContain('may not be used commercially');
  });

  it('escape what a CSS string or URL cannot hold', () => {
    expect(svgUri('<svg a="b"><path fill="#fff" d="M0 0\n"/></svg>')).toBe(
      'data:image/svg+xml,%3Csvg a="b"%3E%3Cpath fill="%23fff" d="M0 0%0A"/%3E%3C/svg%3E',
    );
    expect(() => svgUri("<svg a='b'/>")).toThrow(/single quotes/);
  });
});
