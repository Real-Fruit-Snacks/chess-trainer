import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  discoveredTargets,
  explainMove,
  materialSwing,
  MOTIF_HELP,
  staticExchange,
} from './commentary';
import { lessons } from '@/features/learn/lessons';

const cp = (value: number) => ({ type: 'cp' as const, value });
const mate = (value: number) => ({ type: 'mate' as const, value });

describe('static exchange evaluation', () => {
  it('values captures by what the exchanges leave behind', () => {
    // A pawn attacked by a queen and defended by a pawn: taking loses the queen.
    expect(staticExchange('4k3/3p4/2p5/8/8/8/8/2Q1K3 w - - 0 1', 'c6', 'w')).toBe(0);
    // An undefended knight: taking it wins three pawns.
    expect(staticExchange('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'd5', 'w')).toBe(3);
    // Rook takes a defended knight, gets recaptured: nothing gained.
    expect(staticExchange('4k3/8/2p5/3n4/8/8/8/3RK3 w - - 0 1', 'd5', 'w')).toBe(0);
    expect(staticExchange('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e5', 'w')).toBe(0);
  });

  it('counts an en passant capture as winning the pawn', () => {
    // Black just played ...d5 next to White's e5 pawn: exd6 wins a pawn for nothing.
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
    expect(staticExchange(fen, 'd6', 'w')).toBe(1);
    // No en passant right: an empty square is worth nothing.
    expect(staticExchange('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 2', 'd6', 'w')).toBe(0);
  });
});

describe('discovered attacks', () => {
  it('finds the slider whose ray runs through the vacated square', () => {
    // White knight left d4; the bishop on b2 now looks through d4 at the rook on h8.
    const chess = new Chess('4k2r/8/8/8/8/8/1B6/4K3 w - - 0 1');
    const targets = discoveredTargets(chess, 'd4', 'w');
    expect(targets.map((t) => `${t.from}>${t.square}`)).toEqual(['b2>h8']);
    // Nothing behind an occupied square.
    expect(discoveredTargets(new Chess('4k2r/8/8/8/3N4/8/1B6/4K3 w - - 0 1'), 'd4', 'w')).toEqual(
      [],
    );
  });
});

describe('material swing along a line', () => {
  it('reads the balance after an even number of plies', () => {
    // Queen takes a free knight, Black makes a quiet move: +3.
    const fen = '4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1';
    expect(materialSwing(fen, ['d1c1', 'e8e7'])).toBe(0);
    expect(materialSwing(fen, ['d1d5', 'e8e7'])).toBe(3);
    // Nothing legal: no swing.
    expect(materialSwing(fen, ['a1a2'])).toBe(0);
  });
});

describe('explaining judged moves', () => {
  it('is silent about good moves', () => {
    expect(
      explainMove({
        fen: new Chess().fen(),
        san: 'e4',
        judgement: 'best',
        bestUci: null,
        scoreBefore: cp(30),
        scoreAfter: cp(-30),
      }),
    ).toBeNull();
  });

  it('names a hanging piece and the capture that wins it', () => {
    // The knight jumps to e5 where the pawn on d6 takes it for free.
    const explained = explainMove({
      fen: '4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1',
      san: 'Ne5',
      judgement: 'blunder',
      bestUci: 'f3d4',
      replyUci: 'd6e5',
      scoreBefore: cp(0),
      scoreAfter: cp(-300),
    });
    expect(explained?.motif).toBe('hanging-piece');
    expect(explained?.text).toMatch(/knight/);
    expect(explained?.keyMove).toBe('dxe5');
  });

  it('spots a fork the reply creates', () => {
    // A pawn move ignores the knight, which jumps to c2 forking king and rook.
    const fen = '3k4/8/8/8/3n4/8/7P/R3K3 w - - 0 1';
    const explained = explainMove({
      fen,
      san: 'h3',
      judgement: 'blunder',
      bestUci: 'a1a4',
      replyUci: 'd4c2',
      scoreBefore: cp(500),
      scoreAfter: cp(0),
    });
    expect(explained?.motif).toBe('fork');
    expect(explained?.text).toMatch(/fork/);
    expect(explained?.text).toMatch(/Nc2/);
  });

  it('spots a pin the reply creates', () => {
    // White's queen steps in front of the king on the e-file; ...Re8 pins it.
    const fen = '4r1k1/8/8/8/8/8/8/4K2Q w - - 0 1';
    const explained = explainMove({
      fen,
      san: 'Qe4',
      judgement: 'blunder',
      bestUci: 'h1h2',
      replyUci: 'e8e7',
      scoreBefore: cp(800),
      scoreAfter: cp(-100),
    });
    expect(explained?.motif).toBe('pin');
    expect(explained?.text).toMatch(/pinning the queen/);
  });

  it('names a pawn hung to en passant', () => {
    // ...d5?? next to the e5 pawn: exd6 takes it.
    const explained = explainMove({
      fen: '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1',
      san: 'd5',
      judgement: 'inaccuracy',
      bestUci: 'd7d6',
      replyUci: 'e5d6',
      scoreBefore: cp(0),
      scoreAfter: cp(-100),
    });
    expect(explained?.motif).toBe('hanging-piece');
    expect(explained?.text).toMatch(/pawn/);
    expect(explained?.keyMove).toBe('exd6');
  });

  it('spots a discovered attack the reply unleashes', () => {
    // The queen stays on the d-file behind Black's knight; the knight jumps away
    // and the rook on d8 hits the queen through the square it vacated.
    const fen = '3rk3/8/8/3n4/8/8/8/3QK3 w - - 0 1';
    const explained = explainMove({
      fen,
      san: 'Qd2',
      judgement: 'blunder',
      bestUci: 'd1b1',
      replyUci: 'd5c3',
      scoreBefore: cp(0),
      scoreAfter: cp(-600),
    });
    expect(explained?.motif).toBe('discovered-attack');
    expect(explained?.text).toMatch(/Nc3, uncovering an attack on the queen on d2/);
  });

  it('reports missed and allowed mates even for moves judged good', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const missed = explainMove({
      fen,
      san: 'Kf1',
      judgement: 'good',
      bestUci: 'a1a8',
      scoreBefore: mate(1),
      scoreAfter: cp(500),
    });
    expect(missed?.motif).toBe('missed-mate');
    expect(
      explainMove({
        fen,
        san: 'Kf1',
        judgement: 'good',
        bestUci: 'a1a8',
        scoreBefore: cp(500),
        scoreAfter: cp(450),
      }),
    ).toBeNull();
  });

  it('reports missed and allowed mates from the scores', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const missed = explainMove({
      fen,
      san: 'Kf1',
      judgement: 'blunder',
      bestUci: 'a1a8',
      scoreBefore: mate(1),
      scoreAfter: cp(500),
    });
    expect(missed?.motif).toBe('missed-mate');
    expect(missed?.text).toContain('Ra8');
    const allowed = explainMove({
      fen: 'r5k1/8/8/8/8/8/5PPP/6K1 w - - 0 1',
      san: 'h3',
      judgement: 'blunder',
      bestUci: null,
      scoreBefore: cp(-500),
      scoreAfter: mate(-1),
      replyUci: 'a8a1',
    });
    expect(allowed?.motif).toBe('allows-mate');
  });

  it('points out what the best move would have won', () => {
    // The queen could have taken a free rook; the played move retreats instead.
    const fen = '4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1';
    const explained = explainMove({
      fen,
      san: 'Qc1',
      judgement: 'mistake',
      bestUci: 'd1d5',
      bestPv: ['d1d5', 'e8e7'],
      scoreBefore: cp(500),
      scoreAfter: cp(0),
    });
    expect(explained?.motif).toBe('missed-material');
    expect(explained?.text).toMatch(/Qxd5/);
  });

  it('falls back to naming the punishing reply', () => {
    const explained = explainMove({
      fen: new Chess().fen(),
      san: 'a3',
      judgement: 'inaccuracy',
      bestUci: 'e2e4',
      replyUci: 'e7e5',
      scoreBefore: cp(30),
      scoreAfter: cp(-10),
    });
    expect(explained?.motif).toBe('generic');
    expect(explained?.text).toContain('e5');
    expect(explained?.text).toContain('e4');
  });

  it('links every motif to an existing lesson', () => {
    const ids = new Set(lessons.map((l) => l.id));
    for (const help of Object.values(MOTIF_HELP)) expect(ids.has(help.lesson)).toBe(true);
  });
});
