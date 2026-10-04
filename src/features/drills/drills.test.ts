import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/random';
import { ENDGAME_DRILLS } from './endgameDrills';
import { canStillMate, countMaterial, generateMatePosition, isAttackedNow } from './positions';
import { adjudicatePosition, drillScore, requestedPosition } from './useDrillGame';
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

  it('starts from a random fixed position unless ?pos= names one', () => {
    const drill = ENDGAME_DRILLS.find((d) => d.id === 'kp-run');
    if (!drill || drill.positions === 'random') throw new Error('fixture');
    expect(requestedPosition(drill, null)).toBeUndefined();
    expect(requestedPosition(drill, '1')).toBe(drill.positions[1]);
    expect(requestedPosition(drill, '0')).toBe(drill.positions[0]);
    expect(requestedPosition(drill, '99')).toBeUndefined();
    expect(requestedPosition(drill, 'x')).toBeUndefined();
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

describe('drill adjudication', () => {
  type Pending = Parameters<typeof adjudicatePosition>[0]['pending'];
  const judge = (
    goal: 'mate' | 'promote' | 'hold' | 'capture',
    color: 'white' | 'black',
    startFen: string,
    fen: string,
    lastMover: 'white' | 'black',
    pending: Pending = null,
  ) => {
    const chess = new Chess(fen);
    return adjudicatePosition({
      goal,
      color,
      lastMover,
      fen,
      status: {
        over: chess.isGameOver(),
        reason: chess.isCheckmate() ? 'checkmate' : chess.isStalemate() ? 'stalemate' : null,
      },
      pending,
      startFen,
    });
  };
  const promoted = { to: 'e8', promotion: 'q', capture: false } as const;

  it('wins a promotion at once when nothing can take the new piece', () => {
    const start = '8/4P3/8/4K3/8/8/8/k7 w - - 0 1';
    expect(
      judge('promote', 'white', start, '4Q3/8/8/4K3/8/8/8/k7 b - - 0 1', 'white', promoted),
    ).toEqual({ outcome: 'won', reason: 'Promoted to a queen — and it is safe!' });
  });

  it('does not reward a promotion that is taken at once (e8=Q?? Rxe8)', () => {
    const start = '1r5k/4P3/6K1/8/8/8/R7/8 w - - 0 1';
    // The rook can take the new queen: no verdict until the reply.
    expect(
      judge('promote', 'white', start, '1r2Q2k/8/6K1/8/8/8/R7/8 b - - 0 1', 'white', promoted),
    ).toBeNull();
    const taken = judge(
      'promote',
      'white',
      start,
      '4r2k/8/6K1/8/8/8/R7/8 w - - 0 2',
      'black',
      promoted,
    );
    expect(taken?.outcome).toBe('lost');
    expect(taken?.reason).toMatch(/new queen was taken/);
    // With another pawn still on the board the drill goes on.
    const twoPawns = '1r5k/4P3/6K1/P7/8/8/8/8 w - - 0 1';
    expect(
      judge('promote', 'white', twoPawns, '4r2k/8/6K1/P7/8/8/8/8 w - - 0 2', 'black', promoted),
    ).toBeNull();
  });

  it('wins once an attacked promotion survives the reply', () => {
    const start = '1r6/4P3/8/8/8/8/8/K6k w - - 0 1';
    const pending = { to: 'e8', promotion: 'n', capture: false } as const;
    expect(
      judge('promote', 'white', start, '1r2N3/8/8/8/8/8/8/K6k b - - 0 1', 'white', pending),
    ).toBeNull();
    expect(
      judge('promote', 'white', start, '1r2N3/8/8/8/8/8/7k/K7 w - - 1 2', 'black', pending),
    ).toEqual({ outcome: 'won', reason: 'Promoted to a knight — and it survived!' });
  });

  it('loses a promotion drill with the last pawn, even with a rook left', () => {
    const start = '1r5k/4P3/6K1/8/8/8/R7/8 w - - 0 1';
    expect(judge('promote', 'white', start, '7k/4r3/6K1/8/8/8/R7/8 w - - 0 3', 'black')).toEqual({
      outcome: 'lost',
      reason: 'The pawn was captured.',
    });
  });

  it('keeps a holding drill going when the attacker promotes or trades', () => {
    const philidor = '4k3/R7/1r6/4PK2/8/8/8/8 b - - 0 1';
    // White queened: pawns and pieces still number two, so nothing is decided.
    expect(
      judge('hold', 'black', philidor, '1r2Q3/R7/5K2/8/8/8/8/7k b - - 0 20', 'white'),
    ).toBeNull();
    // Rooks traded: material went down on both sides, the balance is unchanged.
    expect(judge('hold', 'black', philidor, '8/8/8/2k1PK2/8/8/8/8 w - - 0 3', 'white')).toBeNull();
  });

  it('ends a holding drill when material is won and kept', () => {
    const philidor = '4k3/R7/1r6/4PK2/8/8/8/8 b - - 0 1';
    // The new queen is taken by a rook nothing can take back: the pawn is gone for good.
    expect(
      judge('hold', 'black', philidor, '4r3/R7/5K2/8/8/8/8/7k w - - 0 21', 'black', {
        to: 'e8',
        promotion: null,
        capture: true,
      }),
    ).toEqual({ outcome: 'won', reason: 'The pawn is gone — the draw is safe.' });
    // Rxe5 with the king beside it: the reply decides.
    const rxe5 = { to: 'e5', promotion: null, capture: true } as const;
    const taken = '4k3/R7/8/4rK2/8/8/8/8 w - - 0 2';
    expect(judge('hold', 'black', philidor, taken, 'black', rxe5)).toBeNull();
    expect(
      judge('hold', 'black', philidor, '4k3/R7/8/4K3/8/8/8/8 b - - 0 2', 'white', rxe5),
    ).toBeNull();
    expect(
      judge('hold', 'black', philidor, '4k3/R7/6K1/4r3/8/8/8/8 b - - 1 2', 'white', rxe5),
    ).toMatchObject({ outcome: 'won' });
    // One of two pawns falls: in this ending that is the draw.
    const twoPawns = '8/8/8/8/PP6/5k2/8/K3b3 b - - 0 1';
    expect(
      judge('hold', 'black', twoPawns, '8/8/8/8/Pb6/5k2/8/K7 w - - 0 2', 'black', {
        to: 'b4',
        promotion: null,
        capture: true,
      }),
    ).toEqual({ outcome: 'won', reason: 'You won a pawn — the draw is safe.' });
  });

  it('wins a capture drill with the last piece, and loses it with the queen', () => {
    const start = '1k6/1r6/2K5/8/8/8/8/4Q3 w - - 0 1';
    expect(
      judge('capture', 'white', start, 'k7/8/2K5/8/8/8/1Q6/8 b - - 0 5', 'white', {
        to: 'b2',
        promotion: null,
        capture: true,
      }),
    ).toEqual({ outcome: 'won', reason: 'Won the last piece — the rest is elementary.' });
    expect(judge('capture', 'white', start, '1k6/8/2K5/8/8/8/8/1r6 w - - 0 5', 'black')).toEqual({
      outcome: 'lost',
      reason: 'Your piece was lost.',
    });
  });

  it('lets the two-rooks drill continue with one rook, and ends it with no mating material', () => {
    const start = '8/8/8/3k4/8/8/R6R/4K3 w - - 0 1';
    const oneRook = '8/8/8/8/3k4/8/7R/4K3 w - - 0 2';
    expect(judge('mate', 'white', start, oneRook, 'black')).toBeNull();
    const bishopOnly = '8/8/8/8/3k4/8/7B/4K3 w - - 0 2';
    expect(judge('mate', 'white', start, bishopOnly, 'black')).toMatchObject({ outcome: 'lost' });
    expect(canStillMate('8/8/8/8/3k4/8/7R/4K3 w - - 0 2', 'white')).toBe(true);
    expect(canStillMate('8/8/8/8/3k4/8/2B1N3/4K3 w - - 0 2', 'white')).toBe(true);
    expect(canStillMate('8/8/8/8/3k4/8/2BB4/4K3 w - - 0 2', 'white')).toBe(true);
    expect(canStillMate('8/8/8/8/3k4/8/2B1B3/4K3 w - - 0 2', 'white')).toBe(false); // same colour
    expect(canStillMate('8/8/8/8/3k4/8/2N1N3/4K3 w - - 0 2', 'white')).toBe(false);
    expect(canStillMate('8/8/8/8/3k4/8/4P3/4K3 w - - 0 2', 'white')).toBe(true);
    expect(isAttackedNow('4Q3/3k4/8/4K3/8/8/8/8 b - - 0 1', 'e8')).toBe(true);
    expect(isAttackedNow('4Q3/3k1K2/8/8/8/8/8/8 b - - 0 1', 'e8')).toBe(false); // defended
    expect(isAttackedNow('4Q3/8/8/4K3/8/8/8/k7 b - - 0 1', 'e8')).toBe(false);
  });

  it('ends on the board result: mate wins, a draw wins only the holder', () => {
    const start = '8/8/8/3k4/8/8/4Q3/4K3 w - - 0 1';
    const mate = 'k1Q5/8/K7/8/8/8/8/8 b - - 0 1';
    expect(judge('mate', 'white', start, mate, 'white')).toMatchObject({ outcome: 'won' });
    const stalemate = 'k7/2Q5/K7/8/8/8/8/8 b - - 0 1';
    const drawn = judge('mate', 'white', start, stalemate, 'white');
    expect(drawn?.outcome).toBe('lost');
    expect(drawn?.reason).toMatch(/Stalemate/);
    expect(judge('hold', 'black', start, stalemate, 'white')).toMatchObject({ outcome: 'won' });
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
