import type { Square } from 'chess.js';

/** A typed answer in the coordinates drill: "E4", " e4 " → "e4"; anything else → null. */
export function parseTypedSquare(text: string): Square | null {
  const clean = text.trim().toLowerCase();
  return /^[a-h][1-8]$/.test(clean) ? (clean as Square) : null;
}
