import type { PieceSet } from '@/store/settings';

export type { PieceSet };

export const PIECE_SETS: Readonly<Record<PieceSet, { label: string; hint: string }>> = {
  classic: {
    label: 'Classic',
    hint: 'Colin M.L. Burnett’s figurines, the look most online players know.',
  },
  staunton: {
    label: 'Staunton',
    hint: 'Tournament shapes with a heavier line that stays crisp on a phone.',
  },
  bold: {
    label: 'Bold',
    hint: 'Big, simple shapes with a heavy outline — the quickest to tell apart.',
  },
  modern: { label: 'Modern', hint: 'Plain geometry with one line weight.' },
  pixel: { label: 'Pixel', hint: 'An 8-bit set with crisp edges, a match for the Retro sounds.' },
  letters: { label: 'Letters', hint: 'Each piece is its letter: K, Q, R, B, N and P.' },
};

/** Every set, in the order the pickers show them. */
export const PIECE_SET_IDS = Object.keys(PIECE_SETS) as PieceSet[];
