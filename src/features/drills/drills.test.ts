import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import { ENDGAME_DRILLS } from './endgameDrills';
import { countMaterial, generateMatePosition } from './positions';
import { drillScore } from './useDrillGame';
import { generateMovesTask, generateRecallTask, taskFromPuzzle, trackPieces } from './vision';

describe('endgame drills', () => {
  it('have legal, distinct starting positions', () => {
    for (const drill of ENDGAME_DRILLS) {
      if (drill.positions === 'random') continue;
      expect(new Set(drill.positions).size).toBe(drill.positions.length);
      for (const fen of drill.positions) {
        const chess = new Chess(fen);
        expect(chess.isGameOver()).toBe(false);
        // A drill should start with a plan, not with a check to answer.
        expect(chess.inCheck(), `${drill.id}: ${fen} starts in check`).toBe(false);
        // The side that just "moved" may not have left its king in check.
        const parts = fen.split(' ');
        parts[1] = parts[1] === 'w' ? 'b' : 'w';
        parts[3] = '-';
        expect(new Chess(parts.join(' ')).inCheck(), `${drill.id}: ${fen} is illegal`).toBe(false);
      }
    }
  });

  it('generates legal mate positions for every material set', () => {
    const random = seededRandom(7);
    for (const material of ['Q', 'R', 'BB', 'BN']) {
      for (let i = 0; i < 25; i++) {
        const fen = generateMatePosition(material, random);
        const chess = new Chess(fen);
        expect(chess.turn()).toBe('w');
        expect(chess.isCheck()).toBe(false);
        expect(chess.isGameOver()).toBe(false);
        const black = chess.fen().replace(' w ', ' b ');
        expect(new Chess(black).isCheck()).toBe(false);
        expect(countMaterial(fen).white).toBe(material.length);
        if (material === 'BB') {
          const bishops = chess
            .board()
            .flat()
            .filter((p) => p?.type === 'b' && p.color === 'w')
            .map((p) => (p ? p.square : ''));
          const colours = bishops.map(
            (sq) => ('abcdefgh'.indexOf(sq[0] ?? 'a') + Number(sq[1])) % 2,
          );
          expect(new Set(colours).size).toBe(2);
        }
      }
    }
  });

  it('scores fewer moves higher and holds as a flat success', () => {
    const mate = ENDGAME_DRILLS.find((d) => d.goal === 'mate');
    const hold = ENDGAME_DRILLS.find((d) => d.goal === 'hold');
    if (!mate || !hold) throw new Error('missing drills');
    expect(drillScore(mate, 10, true)).toBeGreaterThan(drillScore(mate, 20, true));
    expect(drillScore(mate, 10, false)).toBe(0);
    expect(drillScore(hold, 30, true)).toBe(100);
  });
});

describe('vision tasks', () => {
  it('builds piece-movement tasks with the right targets', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 20; i++) {
      const task = generateMovesTask(random);
      const chess = new Chess(task.fen);
      expect(task.piece).not.toBeNull();
      const expected = new Set(
        chess.moves({ square: task.piece ?? 'a1', verbose: true }).map((m) => m.to),
      );
      expect(task.targets).toEqual(expected);
      expect(task.targets.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('extracts captures and checks from a puzzle position', () => {
    const puzzle = {
      id: 'test',
      // After 1...Nc6 (setup), White to move: Bxf7+ and Nxe5 etc.
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      moves: 'b8c6 c4f7 e8f7 f3e5',
      rating: 1000,
      rd: 50,
      popularity: 90,
      plays: 1000,
      themes: 'fork',
      url: '',
    };
    const captures = taskFromPuzzle(puzzle, 'captures');
    expect(captures?.targets.has('c4f7')).toBe(true);
    expect(captures?.targets.has('f3e5')).toBe(true);
    const checks = taskFromPuzzle(puzzle, 'checks');
    expect(checks?.targets).toEqual(new Set(['c4f7']));
  });
});

describe('recall tasks', () => {
  it('tracks pieces through captures, castling and en passant', () => {
    const { pieces } = trackPieces(
      'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bg4 h3 Bxf3 Qxf3 c6 Bd2 e6 O-O-O'.split(' '),
    );
    const at = (origin: string) => pieces.find((p) => p.origin === origin);
    expect(at('d8')?.answer).toBe('a5');
    expect(at('d8')?.moved).toBe(2);
    expect(at('e2')?.answer).toBeNull(); // the e-pawn was captured on d5
    expect(at('c8')?.answer).toBeNull(); // the bishop was captured on f3
    expect(at('g1')?.answer).toBeNull(); // the knight was captured on f3
    expect(at('d1')?.answer).toBe('f3');
    expect(at('e1')?.answer).toBe('c1');
    expect(at('a1')?.answer).toBe('d1');
    expect(at('a1')?.moved).toBe(1);
    const ep = trackPieces('e4 a6 e5 d5 exd6'.split(' ')).pieces;
    expect(ep.find((p) => p.origin === 'd7')?.answer).toBeNull();
    expect(ep.find((p) => p.origin === 'e2')?.answer).toBe('d6');
  });

  it('generates recall tasks with answerable questions', () => {
    const random = seededRandom(3);
    const lines = ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'];
    for (let i = 0; i < 20; i++) {
      const task = generateRecallTask(lines, random);
      expect(task.mode).toBe('recall');
      expect(task.moves?.length).toBeGreaterThanOrEqual(6);
      expect(task.moves?.length).toBeLessThanOrEqual(12);
      expect(task.questions?.length).toBe(3);
      const board = new Chess(task.fen);
      for (const q of task.questions ?? []) {
        if (q.answer === null) continue;
        const piece = board.get(q.answer);
        expect(piece?.color).toBe(q.color === 'white' ? 'w' : 'b');
        expect(piece?.type).toBe(q.role === 'knight' ? 'n' : q.role[0]);
      }
      // Pieces that moved twice or were captured come first, when there are any.
      const tricky = trackPieces(task.moves ?? []).pieces.filter(
        (p) => p.answer === null || p.moved >= 2,
      );
      const [first] = task.questions ?? [];
      if (tricky.length > 0) {
        expect(first && (first.answer === null || first.moved >= 2)).toBe(true);
      }
    }
  });
});

describe('endgame ladder', () => {
  it('orders every drill by difficulty and counts climbed rungs', async () => {
    const { buildEndgameLadder, describeLadder, ladderOrder } = await import('./endgameLadder');
    const order = ladderOrder();
    expect(order).toHaveLength(ENDGAME_DRILLS.length);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]?.difficulty ?? 0).toBeGreaterThanOrEqual(order[i - 1]?.difficulty ?? 0);
    }
    const empty = buildEndgameLadder({});
    expect(empty.done).toBe(0);
    expect(empty.total).toBeGreaterThanOrEqual(40);
    expect(empty.next?.rung).toBe(1);
    expect(describeLadder(empty)).toBe(`0 of ${empty.total} rungs climbed`);

    const first = order[0];
    const second = order[1];
    if (!first || !second) throw new Error('missing drills');
    const ladder = buildEndgameLadder({
      [first.id]: { best: 90, attempts: 1, lastAt: 1 },
      [second.id]: { best: 0, attempts: 2, lastAt: 1 },
    });
    expect(ladder.done).toBe(1);
    expect(ladder.next?.drill.id).toBe(second.id);
    expect(ladder.groups.reduce((n, g) => n + g.total, 0)).toBe(ladder.total);
    expect(ladder.groups.find((g) => g.group === first.group)?.done).toBe(1);
  });

  it('links every drill to an existing lesson', async () => {
    const { getLessonMeta } = await import('@/features/learn/lessonMeta');
    for (const drill of ENDGAME_DRILLS) {
      expect(drill.lessonId, `${drill.id} has no lesson`).toBeTruthy();
      expect(getLessonMeta(drill.lessonId ?? ''), `${drill.id}: ${drill.lessonId}`).toBeDefined();
    }
  });

  it('counts material for either side', async () => {
    const { materialFor } = await import('./positions');
    const count = countMaterial('7K/8/k1P5/7p/8/8/8/8 w - - 0 1');
    expect(count).toEqual({ white: 1, black: 1, whitePawns: 1, blackPawns: 1 });
    expect(materialFor(count, 'white')).toEqual({ own: 1, ownPawns: 1, opp: 1, oppPawns: 1 });
    const rook = countMaterial('R7/8/8/8/8/2p5/1k6/7K b - - 0 1');
    expect(materialFor(rook, 'black')).toEqual({ own: 1, ownPawns: 1, opp: 1, oppPawns: 0 });
  });
});
