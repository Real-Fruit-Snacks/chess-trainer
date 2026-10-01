import type { Fen } from '@/chess/types';

export interface Opening {
  eco: string;
  name: string;
}

type OpeningTable = Record<string, [eco: string, name: string]>;

let tablePromise: Promise<OpeningTable> | null = null;

/** The first four FEN fields: enough to identify a position regardless of move counters. */
export function epdOf(fen: Fen): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** Lazily downloads (and then caches) the ECO opening table. */
export function loadOpenings(): Promise<OpeningTable> {
  tablePromise ??= fetch(`${import.meta.env.BASE_URL}openings/openings.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<OpeningTable>;
    })
    .catch((err: unknown) => {
      tablePromise = null;
      throw err;
    });
  return tablePromise;
}

/**
 * Names the opening reached by a sequence of positions: the deepest position
 * in `fens` that appears in the table wins, so transpositions are handled and
 * the name sticks once the game leaves book.
 */
export function findOpening(table: OpeningTable, fens: readonly Fen[]): Opening | null {
  for (let i = fens.length - 1; i >= 0; i--) {
    const fen = fens[i];
    if (!fen) continue;
    const hit = table[epdOf(fen)];
    if (hit) return { eco: hit[0], name: hit[1] };
  }
  return null;
}
