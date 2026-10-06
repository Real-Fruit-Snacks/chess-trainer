#!/usr/bin/env node
/**
 * Writes the app's piece sets as CSS with the SVG inline, so a set needs no further downloads
 * once its stylesheet is in (src/components/board/pieces/<set>.css):
 *
 *   classic.css   – Colin M.L. Burnett's cburnett set, taken from the Chessground package;
 *                   bundled with the app, the default and the fallback
 *   <set>.css     – every other set, from the twelve SVGs in pieces/<set>/ (copied unchanged
 *                   from the Lichess repository; sources and licences in pieces/README.md),
 *                   loaded when the set is chosen or a picker shows it (pieceStyles.ts)
 *
 * Every set uses the same selectors: `[data-pieces='<set>']` on <html> picks the set for the
 * whole app, and `.piece-preview.pieces-<set>` (more specific) shows one set inside a preview
 * whatever the app-wide choice. The classic set is also the default for any board without a
 * chosen set.
 *
 * Usage: node scripts/generate-pieces.mjs
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PIECES_DIR, pieceCss, SETS } from './pieces/index.mjs';

for (const set of SETS) writeFileSync(join(PIECES_DIR, `${set.id}.css`), pieceCss(set));
console.log(`Wrote ${SETS.map((s) => `${s.id}.css`).join(', ')} in src/components/board/pieces/`);
