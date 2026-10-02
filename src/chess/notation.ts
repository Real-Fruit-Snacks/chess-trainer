import type { Notation } from '@/store/settings';

/**
 * Move notation. Moves are stored and exported as plain SAN ("Nf3"); the
 * figurine setting only changes how they are shown. The pure parts live here;
 * the components that draw a figurine from the piece set are in San.tsx.
 */
export const PIECE_ROLES = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
} as const;
export type PieceLetter = keyof typeof PIECE_ROLES;

/** The Unicode figurines, for places that must be plain text (titles, exported prose). */
export const FIGURINES: Record<PieceLetter, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
};

/**
 * A SAN move inside running text: a piece move ("Nf3", "Rxe8+", "Qh4#"), a pawn
 * move or capture with an optional promotion ("e4", "exd5", "e8=Q+"), or
 * castling. Bounded so the "B" in "Bb5" matches and the "B" in "Be careful" does not.
 */
export const SAN_IN_TEXT =
  /(?<![\w♔♕♖♗♘])(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?(?![\w=])/g;

export interface SanPart {
  /** Set when this part is a piece letter to draw as a figurine. */
  piece?: PieceLetter;
  text: string;
}

/** Splits one SAN move into its piece letters and the rest, in order. */
export function sanParts(san: string): SanPart[] {
  const parts: SanPart[] = [];
  let text = '';
  for (let i = 0; i < san.length; i++) {
    const ch = san.charAt(i);
    const isPiece = (i === 0 || san.charAt(i - 1) === '=') && ch in PIECE_ROLES;
    if (isPiece) {
      if (text) parts.push({ text });
      text = '';
      parts.push({ piece: ch as PieceLetter, text: ch });
    } else {
      text += ch;
    }
  }
  if (text) parts.push({ text });
  return parts;
}

/** "Nf3" → "♘f3", "e8=Q+" → "e8=♕+": the plain-text figurine form of one move. */
export function figurineSan(san: string): string {
  return sanParts(san)
    .map((p) => (p.piece ? FIGURINES[p.piece] : p.text))
    .join('');
}

/** Every move in a piece of text in figurines, or the text unchanged for letters. */
export function notateText(text: string, notation: Notation): string {
  if (notation === 'letters') return text;
  return text.replace(SAN_IN_TEXT, (san) => figurineSan(san));
}
