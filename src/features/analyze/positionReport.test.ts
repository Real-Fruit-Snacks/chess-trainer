import { describe, expect, it } from 'vitest';
import { lessons } from '@/features/learn/lessons';
import { reportPosition } from './positionReport';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('position report', () => {
  it('reads the starting position as level and planless', () => {
    const report = reportPosition(START);
    expect(report.materialBalance).toBe(0);
    expect(report.items.map((i) => i.topic)).toEqual(['material']);
    expect(report.items[0]?.text).toBe('Material is level.');
    expect(report.plans.white[0]?.text).toMatch(/No structural target/);
    expect(report.phase).toBe('opening');
  });

  it('finds material imbalances and the bishop pair', () => {
    // White: a rook for a knight (up the exchange) and two bishops against one.
    const report = reportPosition(
      'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 6',
    );
    expect(report.materialBalance).toBe(0);
    const exchange = reportPosition('4k3/pppppppp/8/8/8/8/PPPPPPPP/4KB1R w K - 0 1');
    expect(exchange.items[0]?.text).toContain('White is far ahead');
    const pair = reportPosition('4k3/pppppppp/8/8/8/8/PPPPPPPP/2B1KB2 w - - 0 1');
    expect(pair.bishopPair).toBe('white');
    expect(pair.items.some((i) => i.text === 'White has the bishop pair.')).toBe(true);
    expect(pair.plans.white.some((p) => p.lesson === 'bishop-pair')).toBe(true);
    const up = reportPosition('4k3/pppppppp/8/8/8/8/PPPPPPPP/R3K3 w Q - 0 1');
    expect(up.items[0]?.text).toContain('ahead');
  });

  it('describes the pawn structure: isolated, doubled, backward, passed and majorities', () => {
    // White: isolated d-pawn; Black: doubled c-pawns.
    const iqp = reportPosition('r1bq1rk1/pp3ppp/2p2n2/8/3P4/2N2N2/PP3PPP/R2Q1RK1 w - - 0 12');
    expect(iqp.pawns.white.isolated).toEqual(['d4']);
    expect(iqp.items.find((i) => i.text.includes('isolated'))?.lesson).toBe('isolated-queens-pawn');
    expect(iqp.plans.white.some((p) => p.text.includes('isolated d-pawn'))).toBe(true);
    expect(iqp.plans.black.some((p) => p.text.includes('Blockade'))).toBe(true);
    const doubled = reportPosition('4k3/pp3ppp/2p5/2p5/8/8/PPP2PPP/4K3 w - - 0 1');
    expect(doubled.pawns.black.doubled).toEqual(['c6', 'c5']);
    // A passed pawn and a backward pawn.
    const passed = reportPosition('4k3/8/8/3P4/8/8/8/4K3 w - - 0 1');
    expect(passed.pawns.white.passed).toEqual(['d5']);
    expect(passed.plans.white.some((p) => p.text.includes('passed pawn on d5'))).toBe(true);
    expect(passed.plans.black.some((p) => p.text.includes('Blockade'))).toBe(true);
    // e6 lags behind c5 and d5 and cannot advance past the d4 pawn: backward.
    const backward = reportPosition('4k3/8/4p3/2pp4/3P4/8/8/4K3 w - - 0 1');
    expect(backward.pawns.black.backward).toEqual(['e6']);
    // d6 with both neighbours advanced and d5 covered by white pawns: the textbook case.
    const backward2 = reportPosition('4k3/8/3p4/2p1p3/2P1P3/8/8/4K3 w - - 0 1');
    expect(backward2.pawns.black.backward).toEqual(['d6']);
    // With the c-pawn still on c7 it can come to support d6, so d6 is not backward yet.
    const notYet = reportPosition('4k3/2p5/3p4/4pP2/4P3/8/8/4K3 w - - 0 1');
    expect(notYet.pawns.black.backward).toEqual([]);
    // Majorities: White three v two on the queenside, Black four v three on the kingside.
    const majority = reportPosition('4k3/1p2pppp/8/8/8/8/PPP1PPP1/4K3 w - - 0 1');
    expect(majority.pawns.white.queenside).toBe(3);
    expect(majority.pawns.black.queenside).toBe(1);
    expect(
      majority.items.some((i) => i.text.startsWith('White has a queenside pawn majority')),
    ).toBe(true);
    expect(majority.plans.white.some((p) => p.text.includes('queenside majority'))).toBe(true);
  });

  it('judges king safety, opposite-side castling and open files', () => {
    const castled = reportPosition('r4rk1/pppq1ppp/8/8/8/8/PPPQ1PPP/2KR3R w - - 0 15');
    // Two pawns in front, but the open d-file runs right past the king.
    expect(castled.kings.white).toMatchObject({ where: 'queenside', shield: 2, rating: 'loose' });
    expect(castled.kings.black.where).toBe('kingside');
    expect(castled.items.some((i) => i.text === 'The kings are castled on opposite sides.')).toBe(
      true,
    );
    expect(castled.openFiles).toEqual(['d', 'e']);
    expect(castled.plans.white.some((p) => p.lesson === 'opposite-side-castling')).toBe(true);
    // A king with no pawn cover next to an open file.
    const exposed = reportPosition(
      'r1bq1rk1/ppp2p2/2np4/4p3/2B1P3/2NP4/PPP2PPP/R2Q1RK1 b - - 0 12',
    );
    expect(exposed.kings.black.rating).toBe('exposed');
    const item = exposed.items.find((i) => i.topic === 'king' && i.side === 'black');
    expect(item?.text).toContain("Black's king on g8 is exposed");
    expect(exposed.plans.white.some((p) => p.text.startsWith("Attack Black's king"))).toBe(true);
    // Uncastled king in the centre with queens on: the attacker's plan says so.
    const centre = reportPosition(
      'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 6',
    );
    expect(centre.kings.black.where).toBe('centre');
  });

  it('spots outposts, loose pieces and bad bishops', () => {
    const outpost = reportPosition('4k3/pp3ppp/8/3N4/2P5/8/PP3PPP/4K3 w - - 0 1');
    expect(outpost.outposts.white).toEqual(['d5']);
    expect(outpost.looseP.black).toEqual([]);
    // Untouched pieces at home are not a finding; a knight out on c5 with no defender is.
    const home = reportPosition('4k3/8/8/8/8/8/8/R3K1N1 w Q - 0 1');
    expect(home.looseP.white).toEqual([]);
    const loose = reportPosition('4k3/8/8/2N5/8/8/8/4K3 w - - 0 1');
    expect(loose.looseP.white).toEqual(['c5']);
    expect(loose.items.find((i) => i.text.includes('undefended'))?.weakness).toBe(true);
    // A home-rank piece that is attacked is reported (and flagged as under attack).
    const hanging = reportPosition('4k1r1/8/8/8/8/8/8/4K1N1 w - - 0 1');
    expect(hanging.looseP.white).toEqual(['g1']);
    expect(hanging.items.find((i) => i.text.includes('undefended'))?.text).toContain(
      'under attack',
    );
    const bad = reportPosition('4k3/8/8/3p4/2pPp3/1pP1P3/1P6/2B1K3 w - - 0 1');
    expect(bad.items.some((i) => i.text.includes('bad bishop'))).toBe(true);
    expect(bad.plans.white.some((p) => p.lesson === 'good-and-bad-bishops')).toBe(true);
  });

  it('links every finding and plan to an existing lesson', () => {
    const ids = new Set(lessons.map((l) => l.id));
    for (const fen of [
      START,
      'r1bq1rk1/pp3ppp/2p2n2/8/3P4/2N2N2/PP3PPP/R2Q1RK1 w - - 0 12',
      'r4rk1/pppq1ppp/8/8/8/8/PPPQ1PPP/2KR3R w - - 0 15',
      '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1',
      '4k3/8/8/3p4/2pPp3/1pP1P3/1P6/2B1K3 w - - 0 1',
    ]) {
      const report = reportPosition(fen);
      for (const item of [...report.items, ...report.plans.white, ...report.plans.black]) {
        if (item.lesson) expect(ids.has(item.lesson), item.lesson).toBe(true);
      }
    }
  });
});

describe('king safety files', () => {
  it('counts the files the opponent’s rooks can use, not the king’s own missing pawns', () => {
    // White king on g1 behind f2 g2 h2; Black has no h-pawn, so the h-file is
    // half-open for Black: a lane towards the king. White lacks the a-pawn
    // (half-open for White) but that is no danger to White's own king.
    const report = reportPosition(
      'r1b1kb1r/1pp2pp1/p1np1n2/4p3/2BPP3/2N2N2/1PP2PPP/R1BQ1RK1 w kq - 0 9',
    );
    expect(report.halfOpen.black).toContain('h');
    expect(report.halfOpen.white).toContain('a');
    expect(report.kings.white.openFilesNear).toEqual(['h']);
    const item = report.items.find((i) => i.topic === 'king' && i.side === 'white');
    if (item) expect(item.text).toMatch(/half-open/);
    // Black's king on e8: no open or half-open-for-White file touches it (d, e, f all hold black pawns).
    expect(report.kings.black.openFilesNear).toEqual([]);
  });
});
