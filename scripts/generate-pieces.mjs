#!/usr/bin/env node
/**
 * Draws the app's own piece sets and writes them as CSS with inline SVG, so
 * nothing extra is downloaded or precached (the "Letters" set works the same way).
 *
 *   src/components/board/pieces-classic.css – cburnett, taken from the Chessground package
 *   src/components/board/pieces-pixel.css   – an 8-bit set on a 16×16 grid
 *   src/components/board/pieces-modern.css  – flat, geometric silhouettes
 *
 * Every set uses the same selectors: `[data-pieces='<set>']` on <html> picks the
 * set for the whole app, and `.piece-preview.pieces-<set>` (more specific) shows
 * one set inside a preview whatever the app-wide choice. The classic set is also
 * the default for any board without a chosen set.
 *
 * Usage: node scripts/generate-pieces.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src', 'components', 'board');

const ROLES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const COLORS = ['white', 'black'];

/* ------------------------------------------------------------------ */
/* Pixel: outlines drawn on a 16×16 grid; the inside is filled by a    */
/* flood fill from the edge, 'x' marks a detail pixel.                 */
/* ------------------------------------------------------------------ */
const PIXEL = {
  king: [
    '.......#........',
    '......###.......',
    '.......#........',
    '....##.#.##.....',
    '...#..###..#....',
    '...#.......#....',
    '...#.......#....',
    '....#.....#.....',
    '....#######.....',
    '....#.....#.....',
    '....#.....#.....',
    '...#.......#....',
    '...#.......#....',
    '...#########....',
    '................',
    '................',
  ],
  queen: [
    '................',
    '.......#........',
    '..#...#.#...#...',
    '.#.#..#.#..#.#..',
    '.#.#.#...#.#.#..',
    '..#.#.....#.#...',
    '..#.........#...',
    '...#...x...#....',
    '....#######.....',
    '....#.....#.....',
    '....#.....#.....',
    '...#.......#....',
    '...#.......#....',
    '...#########....',
    '................',
    '................',
  ],
  rook: [
    '................',
    '................',
    '...##..##..##...',
    '...#.##..##.#...',
    '...#........#...',
    '....#......#....',
    '.....######.....',
    '.....#....#.....',
    '.....#....#.....',
    '.....#....#.....',
    '.....#....#.....',
    '....#......#....',
    '...#........#...',
    '...##########...',
    '................',
    '................',
  ],
  bishop: [
    '................',
    '.......#........',
    '......#.#.......',
    '.......#........',
    '......#.#.......',
    '.....#...#......',
    '....#.....#.....',
    '....#..x..#.....',
    '....#.x...#.....',
    '....#.....#.....',
    '.....#...#......',
    '....#.....#.....',
    '...#.......#....',
    '...#########....',
    '................',
    '................',
  ],
  knight: [
    '................',
    '......##........',
    '.....#..##......',
    '....#.....#.....',
    '...#.......#....',
    '..#.........#...',
    '..#..x......#...',
    '..##........#...',
    '....#.......#...',
    '....#.......#...',
    '.....#......#...',
    '.....#......#...',
    '....#.......#...',
    '...#.........#..',
    '...###########..',
    '................',
  ],
  pawn: [
    '................',
    '................',
    '................',
    '......####......',
    '.....#....#.....',
    '.....#....#.....',
    '......####......',
    '.....#....#.....',
    '.....#....#.....',
    '......#..#......',
    '.....#....#.....',
    '....#......#....',
    '...#........#...',
    '...##########...',
    '................',
    '................',
  ],
};

const PIXEL_INK = {
  white: { fill: '#f6f6f1', outline: '#1c1c1c', detail: '#1c1c1c' },
  black: { fill: '#3d3d3d', outline: '#0e0e0e', detail: '#e4e4e4' },
};

/** Cells not reachable from the border through '.' are inside the piece. */
function interior(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const outside = Array.from({ length: h }, () => Array(w).fill(false));
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((y === 0 || y === h - 1 || x === 0 || x === w - 1) && rows[y][x] === '.') {
        stack.push([x, y]);
      }
    }
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || outside[y][x] || rows[y][x] !== '.') continue;
    outside[y][x] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return (x, y) => rows[y][x] === '.' && !outside[y][x];
}

/** Horizontal runs of cells that satisfy `test`, as one SVG path. */
function runs(rows, test) {
  let d = '';
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    while (x < rows[y].length) {
      if (!test(x, y)) {
        x++;
        continue;
      }
      let end = x;
      while (end < rows[y].length && test(end, y)) end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  }
  return d;
}

function pixelSvg(role, color) {
  const rows = PIXEL[role];
  const ink = PIXEL_INK[color];
  const inside = interior(rows);
  const fill = runs(rows, inside);
  const outline = runs(rows, (x, y) => rows[y][x] === '#');
  const detail = runs(rows, (x, y) => rows[y][x] === 'x');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
    `<path fill="${ink.fill}" d="${fill}"/>` +
    `<path fill="${ink.outline}" d="${outline}"/>` +
    (detail ? `<path fill="${ink.detail}" d="${detail}"/>` : '') +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* Modern: flat silhouettes on a 100×100 box.                          */
/* ------------------------------------------------------------------ */
const MODERN_INK = {
  white: { fill: '#f7f7f3', outline: '#242b27', detail: '#242b27' },
  black: { fill: '#2f3532', outline: '#0f1311', detail: '#aab3ad' },
};

const BASE = 'M24 82h52a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z';

const MODERN = {
  king: (ink) => [
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M46 8h8v8h8v8h-8v6h-8v-6h-8v-8h8z"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M33 52C33 30 67 30 67 52L64 80H36z"/>`,
    `<path fill="none" stroke="${ink.detail}" stroke-width="3" stroke-linecap="round" d="M40 58h20"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="${BASE}"/>`,
  ],
  queen: (ink) => [
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M31 52L27 28l12 15 11-21 11 21 12-15-4 24 2 28H36z"/>`,
    `<circle fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3" cx="27" cy="24" r="4"/>`,
    `<circle fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3" cx="50" cy="18" r="4"/>`,
    `<circle fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3" cx="73" cy="24" r="4"/>`,
    `<path fill="none" stroke="${ink.detail}" stroke-width="3" stroke-linecap="round" d="M38 58h24"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="${BASE}"/>`,
  ],
  rook: (ink) => [
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M30 16h10v8h8v-8h4v8h8v-8h10v22h-6v42h-28V38h-6z"/>`,
    `<path fill="none" stroke="${ink.detail}" stroke-width="3" stroke-linecap="round" d="M38 46h24M38 60h24"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="${BASE}"/>`,
  ],
  bishop: (ink) => [
    `<circle fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" cx="50" cy="15" r="5"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M50 22c16 12 20 30 12 46H38c-8-16-4-34 12-46z"/>`,
    `<path fill="none" stroke="${ink.detail}" stroke-width="3.5" stroke-linecap="round" d="M44 40l12 12"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M35 68h30l2 12H33z"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="${BASE}"/>`,
  ],
  knight: (ink) => [
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M30 80l3-18 8-9-6-4-10-3-1-8 9-9 10-7 4-12 7 5 8 5 10 12 4 20-2 28z"/>`,
    `<circle fill="${ink.detail}" cx="47" cy="31" r="2.6"/>`,
    `<path fill="none" stroke="${ink.detail}" stroke-width="3" stroke-linecap="round" d="M66 36l-4 16"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="${BASE}"/>`,
  ],
  pawn: (ink) => [
    `<circle fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" cx="50" cy="30" r="11"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="M42 46h16l8 34H34z"/>`,
    `<path fill="${ink.fill}" stroke="${ink.outline}" stroke-width="3.5" stroke-linejoin="round" d="${BASE}"/>`,
  ],
};

function modernSvg(role, color) {
  const ink = MODERN_INK[color];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    MODERN[role](ink).join('') +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* Classic: the cburnett set that ships with Chessground, re-emitted   */
/* with the shared selectors so previews can show it next to the rest. */
/* ------------------------------------------------------------------ */
const CBURNETT = readFileSync(
  join(ROOT, 'node_modules', '@lichess-org', 'chessground', 'assets', 'chessground.cburnett.css'),
  'utf8',
);

function classicUri(role, color) {
  const rule = new RegExp(
    `\\.cg-wrap piece\\.${role}\\.${color} \\{\\s*background-image: url\\('([^']+)'\\)`,
  );
  const match = CBURNETT.match(rule);
  if (!match) throw new Error(`cburnett: no image for ${color} ${role}`);
  return match[1];
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */
function css(set, uriOf, description, isDefault = false) {
  const rules = [];
  for (const color of COLORS) {
    for (const role of ROLES) {
      const selectors = [
        isDefault ? `.cg-wrap piece.${color}.${role}` : null,
        `[data-pieces='${set}'] piece.${color}.${role}`,
        `.piece-preview.pieces-${set} piece.${color}.${role}`,
      ].filter(Boolean);
      rules.push(
        `${selectors.join(',\n')} {\n  background-image: url('${uriOf(role, color)}');\n}`,
      );
    }
  }
  return (
    `/*\n * "${set[0].toUpperCase()}${set.slice(1)}" piece set: ${description}\n` +
    ` * Generated by scripts/generate-pieces.mjs — edit the script, not this file.\n` +
    ` * Selected with data-pieces="${set}" on <html> (see components/board/pieceSets.ts);\n` +
    ` * .piece-preview.pieces-${set} shows it inside one element.\n */\n` +
    rules.join('\n\n') +
    '\n'
  );
}

const dataUri = (draw) => (role, color) =>
  `data:image/svg+xml,${encodeURIComponent(draw(role, color))}`;

writeFileSync(
  join(OUT, 'pieces-classic.css'),
  css(
    'classic',
    classicUri,
    "Colin M.L. Burnett's figurines, from the Chessground package (see THIRD_PARTY_NOTICES.md).",
    true,
  ),
);
writeFileSync(
  join(OUT, 'pieces-pixel.css'),
  css(
    'pixel',
    dataUri(pixelSvg),
    'an original 8-bit set drawn on a 16×16 grid, with crisp edges at any size.',
  ),
);
writeFileSync(
  join(OUT, 'pieces-modern.css'),
  css('modern', dataUri(modernSvg), 'original flat silhouettes with a single outline weight.'),
);
console.log('Wrote pieces-classic.css, pieces-pixel.css and pieces-modern.css');
