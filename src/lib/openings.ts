import type { Fen } from '@/chess/types';

export interface Opening {
  eco: string;
  name: string;
}

type OpeningTable = Record<string, [eco: string, name: string]>;

let tablePromise: Promise<OpeningTable> | null = null;

/**
 * An opening name as the app writes it, in British English with curly
 * apostrophes ("Centre Game", "King’s Indian Defence"): the opening table and
 * the Lichess explorer write "Center", "Defense" and "King's". For display only:
 * puzzle tags are built from the table's own names.
 */
export function displayOpeningName(name: string): string {
  return name
    .replace(/\bDefense\b/g, 'Defence')
    .replace(/\bCenter\b/g, 'Centre')
    .replace(/'/g, '’');
}

/**
 * Lower case with both spellings and both apostrophes folded together, for
 * matching what a learner types (a phone keyboard may type ’ for ').
 */
export function foldOpeningSpelling(text: string): string {
  return text
    .toLowerCase()
    .replace(/defense/g, 'defence')
    .replace(/center/g, 'centre')
    .replace(/[‘’]/g, "'");
}

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
