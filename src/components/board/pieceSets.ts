import type { PieceSet } from '@/store/settings';

export type { PieceSet };

export const PIECE_SETS: Readonly<Record<PieceSet, { label: string; hint: string }>> = {
  classic: { label: 'Classic', hint: 'The familiar figurine pieces (cburnett).' },
  modern: { label: 'Modern', hint: 'Flat silhouettes with a single outline weight.' },
  pixel: { label: 'Pixel', hint: 'An 8-bit set with crisp edges, a match for the Retro sounds.' },
  letters: {
    label: 'Letters',
    hint: 'Rounded tiles with the piece letter — very legible on small boards.',
  },
};

/** Every set, in the order the pickers show them. */
export const PIECE_SET_IDS = Object.keys(PIECE_SETS) as PieceSet[];

/**
 * Applies the piece set to <html>, where the piece CSS looks for it. A value
 * that is not a known set (an old or edited settings blob) falls back to the
 * classic set, which the piece CSS also shows while the attribute is missing.
 */
export function applyPieceSet(set: PieceSet, root: HTMLElement = document.documentElement): void {
  root.setAttribute('data-pieces', set in PIECE_SETS ? set : 'classic');
}
