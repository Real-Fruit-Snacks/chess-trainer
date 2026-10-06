/**
 * "Letters": the piece's initial — K Q R B N P — as a heavy rounded letter drawn as paths
 * (no font, so it looks the same on every device). White letters are white with a dark
 * edge, black letters dark with a light edge; pawns are a size smaller.
 */
import { n } from './draw.mjs';

const WEIGHT = 12;
const EDGE = 3.8;

export const inks = {
  white: { body: '#ffffff', edge: '#1c1c1c' },
  black: { body: '#262626', edge: '#f2f2f2' },
};

/** Letter skeletons: the centre lines of the strokes, on the 100×100 box. */
const GLYPHS = {
  king: 'M34 25V75M66 25L36.5 52.5M46 44L67 75',
  queen:
    'M50 25C62 25 70 35.5 70 49.5C70 63.5 62 74 50 74C38 74 30 63.5 30 49.5C30 35.5 38 25 50 25ZM55 61L68 77',
  rook: 'M35 75V25H52C60 25 65.5 30.5 65.5 38C65.5 45.5 60 51 52 51H35M51 51L66 75',
  bishop:
    'M35 75V25H50.5C58 25 63 29.5 63 36.5C63 43.5 58 48.5 50.5 48.5H35M50.5 48.5H52.5C61 48.5 66.5 53.5 66.5 61.5C66.5 69.5 61 75 52.5 75H35',
  knight: 'M34 75V25L66 75V25',
  pawn: 'M38 72V34H52C58.5 34 63 38.5 63 45C63 51.5 58.5 56 52 56H38',
};

export function draw(role, color) {
  const ink = inks[color];
  const d = GLYPHS[role];
  const weight = role === 'pawn' ? WEIGHT * 0.9 : WEIGHT;
  const common = `fill="none" stroke-linecap="round" stroke-linejoin="round" d="${d}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path stroke="${ink.edge}" stroke-width="${n(weight + 2 * EDGE)}" ${common}/>` +
    `<path stroke="${ink.body}" stroke-width="${n(weight)}" ${common}/>` +
    `</svg>`
  );
}
