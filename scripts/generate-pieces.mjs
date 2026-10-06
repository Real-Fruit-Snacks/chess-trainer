#!/usr/bin/env node
/**
 * Writes the app's piece sets as CSS with the SVG inline, so nothing extra is downloaded or
 * precached. The drawings live in scripts/pieces/:
 *
 *   pieces-classic.css   – cburnett, taken from the Chessground package
 *   pieces-staunton.css  – tournament shapes with a heavier line (staunton.mjs)
 *   pieces-bold.css      – big, simple shapes with a heavy outline (bold.mjs)
 *   pieces-modern.css    – plain geometry with one line weight (modern.mjs)
 *   pieces-pixel.css     – 8-bit figurines on a 16×16 grid (pixel.mjs)
 *   pieces-letters.css   – the piece's initial, drawn as paths (letters.mjs)
 *
 * Every set uses the same selectors: `[data-pieces='<set>']` on <html> picks the set for the
 * whole app, and `.piece-preview.pieces-<set>` (more specific) shows one set inside a preview
 * whatever the app-wide choice. The classic set is also the default for any board without a
 * chosen set.
 *
 * Usage: node scripts/generate-pieces.mjs [--svg <dir>]
 *   --svg <dir>   also write every piece as <dir>/<set>/<color>-<role>.svg, to look at or measure
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, pieceCss, ROLES, SETS } from './pieces/index.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'board');

const svgDir = process.argv.includes('--svg')
  ? process.argv[process.argv.indexOf('--svg') + 1]
  : null;
if (process.argv.includes('--svg') && !svgDir) throw new Error('--svg needs a directory');

for (const set of SETS) {
  writeFileSync(join(OUT, `pieces-${set.id}.css`), pieceCss(set));
  if (svgDir && set.draw) {
    mkdirSync(join(svgDir, set.id), { recursive: true });
    for (const color of COLORS) {
      for (const role of ROLES) {
        writeFileSync(join(svgDir, set.id, `${color}-${role}.svg`), set.draw(role, color));
      }
    }
  }
}
console.log(`Wrote ${SETS.map((s) => `pieces-${s.id}.css`).join(', ')}`);
