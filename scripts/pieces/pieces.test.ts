// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORS, pieceCss, ROLES, SETS } from './index.mjs';
import { MASKS } from './pixel.mjs';

const BOARD = join(process.cwd(), 'src', 'components', 'board');

/** The elements of an SVG, checked to open and close in order. */
function elements(svg: string): string[] {
  const stack: string[] = [];
  const seen: string[] = [];
  for (const [, close, name, , selfClosing] of svg.matchAll(/<(\/?)([a-z]+)([^<>]*?)(\/?)>/g)) {
    if (close) {
      expect(stack.pop()).toBe(name);
    } else {
      seen.push(name ?? '');
      if (!selfClosing) stack.push(name ?? '');
    }
  }
  expect(stack).toEqual([]);
  return seen;
}

describe('piece sets', () => {
  it('match the sets the app offers, and the app loads every one', () => {
    const settings = readFileSync(join(process.cwd(), 'src', 'store', 'settings.ts'), 'utf8');
    const ids = /PIECE_SET_IDS = \[([^\]]+)\]/.exec(settings)?.[1]?.match(/[a-z]+/g);
    expect(ids).toEqual(SETS.map((set) => set.id));
    const main = readFileSync(join(process.cwd(), 'src', 'main.tsx'), 'utf8');
    for (const { id } of SETS) expect(main).toContain(`@/components/board/pieces-${id}.css`);
  });

  it('are written out: the stylesheets match the drawings (run npm run pieces:generate)', () => {
    for (const set of SETS) {
      expect(readFileSync(join(BOARD, `pieces-${set.id}.css`), 'utf8'), set.id).toBe(pieceCss(set));
    }
  });

  it('draw every piece in both colours as a well-formed SVG', () => {
    for (const set of SETS) {
      if (!set.draw) continue;
      const drawings = new Set<string>();
      for (const color of COLORS) {
        for (const role of ROLES) {
          const svg: string = set.draw(role, color);
          const where = `${set.id} ${color} ${role}`;
          expect(svg, where).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
          expect(svg, where).not.toMatch(/NaN|undefined|Infinity|'/);
          expect(elements(svg)[0], where).toBe('svg');
          drawings.add(svg);
        }
      }
      // Twelve different pictures: no piece borrows another's.
      expect(drawings.size, set.id).toBe(12);
    }
  });

  it("keep the pixel set on its grid, every outline but the knight's symmetric", () => {
    for (const [role, rows] of Object.entries(MASKS)) {
      expect(rows, role).toHaveLength(16);
      for (const row of rows) expect(row, role).toMatch(/^[.#x]{16}$/);
      if (role === 'knight') continue;
      // The bishop's slit runs one way; the outline itself is mirror-symmetric.
      for (const row of rows.map((r) => r.replace(/x/g, '#'))) {
        expect([...row].reverse().join(''), role).toBe(row);
      }
    }
  });
});
