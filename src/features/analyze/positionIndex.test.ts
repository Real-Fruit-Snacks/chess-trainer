import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/chess/helpers';
import {
  buildPositionIndex,
  cachedPositionIndex,
  gamesSignature,
  nextMoves,
  positionKey,
  rememberPositionIndex,
} from './positionIndex';

/** The position after `sans` from the start. */
function fenAfter(...sans: string[]): string {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
}

const GAMES = [
  { id: 'g1', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 *' },
  // The same position by another road, with other move numbers in its FEN on the way.
  { id: 'g2', pgn: '1. Nf3 Nc6 2. e4 e5 3. Bc4 *' },
  { id: 'g3', pgn: '1. d4 d5 *' },
  // Not a game: left out.
  { id: 'g4', pgn: '1. e4 e5 2. Ke3 *' },
  // Back where it started: the start position counts once, where the game began.
  { id: 'g5', pgn: '1. Nf3 Nf6 2. Ng1 Ng8 3. e4 *' },
];

describe('positionKey', () => {
  it('is the placement and the side to move, whatever the castling rights and counters', () => {
    expect(positionKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
    expect(positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 7 30')).toBe(
      positionKey(START_FEN),
    );
    expect(positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')).not.toBe(
      positionKey(START_FEN),
    );
  });
});

describe('buildPositionIndex', () => {
  it('finds every game that reached a position, with the move played next', async () => {
    const index = await buildPositionIndex(GAMES);
    expect(index.games).toBe(4);
    const italianish = index.find(fenAfter('e4', 'e5', 'Nf3', 'Nc6'));
    expect(italianish).toEqual([
      { gameId: 'g1', ply: 4, next: 'Bb5', nextLabel: '3.' },
      { gameId: 'g2', ply: 4, next: 'Bc4', nextLabel: '3.' },
    ]);
    expect(index.find(START_FEN).map((h) => [h.gameId, h.ply, h.next])).toEqual([
      ['g1', 0, 'e4'],
      ['g2', 0, 'Nf3'],
      ['g3', 0, 'd4'],
      ['g5', 0, 'Nf3'],
    ]);
    // Where a game ended there is no next move.
    expect(index.find(fenAfter('d4', 'd5'))).toEqual([
      { gameId: 'g3', ply: 2, next: null, nextLabel: '2.' },
    ]);
    expect(index.find(fenAfter('e4'))[0]).toMatchObject({
      gameId: 'g1',
      next: 'e5',
      nextLabel: '1…',
    });
    expect(index.find(fenAfter('h4'))).toEqual([]);
  });

  it('numbers the moves of a game that starts with Black to move', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const index = await buildPositionIndex([
      { id: 'b1', pgn: `[SetUp "1"]\n[FEN "${fen}"]\n\n1... c5 2. Nf3 *` },
    ]);
    expect(index.find(fen)[0]).toMatchObject({ ply: 0, next: 'c5', nextLabel: '1…' });
    expect(index.find(fenAfter('e4', 'c5'))[0]).toMatchObject({
      ply: 1,
      next: 'Nf3',
      nextLabel: '2.',
    });
  });

  it('gives the page a turn between slices of work, reporting how far it got', async () => {
    const onProgress = vi.fn();
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    await buildPositionIndex(GAMES, { sliceMs: 0, onProgress });
    expect(timeout).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(1, 5);
    expect(onProgress).toHaveBeenLastCalledWith(5, 5);
    timeout.mockRestore();
  });

  it('stops when asked to', async () => {
    const controller = new AbortController();
    const build = buildPositionIndex(GAMES, {
      sliceMs: 0,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(build).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('the next moves and the cache', () => {
  it('tallies the moves played next, most frequent first, the end of a game last', () => {
    expect(
      nextMoves([
        { gameId: 'a', ply: 4, next: 'Bc4', nextLabel: '3.' },
        { gameId: 'b', ply: 4, next: null, nextLabel: '3.' },
        { gameId: 'c', ply: 4, next: 'Bb5', nextLabel: '3.' },
        { gameId: 'd', ply: 4, next: 'Bb5', nextLabel: '3.' },
      ]),
    ).toEqual([
      { san: 'Bb5', count: 2 },
      { san: 'Bc4', count: 1 },
      { san: null, count: 1 },
    ]);
  });

  it('keeps the last index for the same games only', async () => {
    const signature = gamesSignature(GAMES);
    const index = await buildPositionIndex(GAMES);
    rememberPositionIndex(signature, index);
    expect(cachedPositionIndex(signature)).toBe(index);
    expect(cachedPositionIndex(gamesSignature(GAMES.slice(1)))).toBeNull();
  });
});
