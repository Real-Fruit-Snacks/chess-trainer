export type PieceSet = 'classic' | 'letters';

export const PIECE_SETS: Readonly<Record<PieceSet, { label: string; hint: string }>> = {
  classic: { label: 'Classic', hint: 'The familiar figurine pieces (cburnett).' },
  letters: {
    label: 'Letters',
    hint: 'Rounded tiles with the piece letter — very legible on small boards.',
  },
};

/** Applies the piece set to <html>, where the piece CSS looks for it. */
export function applyPieceSet(set: PieceSet, root: HTMLElement = document.documentElement): void {
  if (set === 'classic') root.removeAttribute('data-pieces');
  else root.setAttribute('data-pieces', set);
}
