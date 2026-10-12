import type { Fen, San } from '@/chess/types';
import { mainLineOfPgn } from '@/features/games/gameStats';
import { moveNumberOfPly } from './timeUse';

/**
 * Position search over My games: which of the learner's games reached a
 * position, and what was played next. Each game's positions are read once
 * per page load (an id always names the same game), the index over all of
 * them is built in slices that give the page back between them, and the last
 * index is kept for as long as the same games are stored.
 */

/** A position as the search sees it: the piece placement and the side to move. */
export function positionKey(fen: Fen): string {
  const [placement = '', turn = 'w'] = fen.trim().split(/\s+/);
  return `${placement} ${turn}`;
}

/** A game that reached the position, the first time it did. */
export interface PositionHit {
  gameId: string;
  /** Plies played to reach it (0: the game's start). */
  ply: number;
  /** The move played next, or null when the game ended there. */
  next: San | null;
  /** The next move's number as the game counts it: "12." or "12…". */
  nextLabel: string;
}

export interface PositionIndex {
  /** The games that reached `fen`'s position, in the order the games were given. */
  find: (fen: Fen) => PositionHit[];
  /** Games searched (those that could not be read are left out). */
  games: number;
}

export interface IndexedGame {
  id: string;
  pgn: string;
}

interface GamePositions {
  keys: string[];
  sans: San[];
  startFen: Fen;
}

/** Each game's positions by id, read once: the games themselves never change under an id. */
const positionsById = new Map<string, GamePositions | null>();

function positionsOf(game: IndexedGame): GamePositions | null {
  const line = mainLineOfPgn(game.pgn);
  if (!line) return null;
  return { keys: line.fens.map(positionKey), sans: [...line.sans], startFen: line.startFen };
}

/** The time a slice of work may take before the page gets a turn. */
export const INDEX_SLICE_MS = 12;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Lets the page paint and handle input before the next slice of work. */
function yieldToPage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Indexes the games' positions without holding the page up: games are read a
 * slice at a time, with a pause for the page between slices. Rejects with an
 * AbortError when `signal` aborts.
 */
export async function buildPositionIndex(
  games: readonly IndexedGame[],
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    sliceMs?: number;
  } = {},
): Promise<PositionIndex> {
  const sliceMs = options.sliceMs ?? INDEX_SLICE_MS;
  let sliceStart = now();
  const checkAborted = () => {
    if (options.signal?.aborted) throw new DOMException('Indexing stopped', 'AbortError');
  };
  for (const [index, game] of games.entries()) {
    checkAborted();
    if (!positionsById.has(game.id)) positionsById.set(game.id, positionsOf(game));
    if (now() - sliceStart >= sliceMs) {
      options.onProgress?.(index + 1, games.length);
      await yieldToPage();
      sliceStart = now();
    }
  }
  checkAborted();
  // Games no longer stored need not be remembered.
  const ids = new Set(games.map((g) => g.id));
  for (const id of positionsById.keys()) if (!ids.has(id)) positionsById.delete(id);

  const byKey = new Map<string, PositionHit[]>();
  let indexed = 0;
  for (const game of games) {
    const positions = positionsById.get(game.id);
    if (!positions) continue;
    indexed += 1;
    const seen = new Set<string>();
    positions.keys.forEach((key, ply) => {
      // A repeated position counts once, where the game first reached it.
      if (seen.has(key)) return;
      seen.add(key);
      const nextPly = ply + 1;
      const hit: PositionHit = {
        gameId: game.id,
        ply,
        next: positions.sans[ply] ?? null,
        nextLabel: `${moveNumberOfPly(nextPly, positions.startFen)}${
          (nextPly % 2 === 1) === (positions.startFen.split(' ')[1] !== 'b') ? '.' : '…'
        }`,
      };
      const hits = byKey.get(key);
      if (hits) hits.push(hit);
      else byKey.set(key, [hit]);
    });
  }
  options.onProgress?.(games.length, games.length);
  return { find: (fen) => byKey.get(positionKey(fen)) ?? [], games: indexed };
}

/** The moves played next in the hits, most frequent first ("game ended" is a null move). */
export function nextMoves(hits: readonly PositionHit[]): { san: San | null; count: number }[] {
  const counts = new Map<San | null, number>();
  for (const hit of hits) counts.set(hit.next, (counts.get(hit.next) ?? 0) + 1);
  return [...counts.entries()]
    .map(([san, count]) => ({ san, count }))
    .sort((a, b) => b.count - a.count || (a.san === null ? 1 : b.san === null ? -1 : 0));
}

/** The games' identity for the cache: their ids (a game's text never changes under its id). */
export function gamesSignature(games: readonly IndexedGame[]): string {
  return games.map((g) => g.id).join('\n');
}

let lastIndex: { signature: string; index: PositionIndex } | null = null;

/** The index last built, when it was built for exactly these games. */
export function cachedPositionIndex(signature: string): PositionIndex | null {
  return lastIndex?.signature === signature ? lastIndex.index : null;
}

/** Keeps an index for the next visit (the page may be left and opened again). */
export function rememberPositionIndex(signature: string, index: PositionIndex): void {
  lastIndex = { signature, index };
}
