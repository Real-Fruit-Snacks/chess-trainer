import type { Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { movePiece, parsePlacement } from '@/chess/geometry';
import { seededRandom } from '@/lib/random';
import {
  chooseGhostMove,
  describeGhostKnight,
  ghostOptions,
  ghostStart,
  type HunterRole,
  hunterDests,
  HUNTS,
  huntFen,
  huntMessage,
  huntPoints,
  type HuntState,
  movesToSighting,
  nextPossible,
  pathOf,
  playHunterMove,
  SIGHTING_EVERY,
  type Squad,
  squadFen,
  startHunt,
} from './ghostKnight';

const SQUAD: Squad = {
  id: 'test',
  name: 'Two rooks',
  pieces: [
    { type: 'r', square: 'a1' },
    { type: 'r', square: 'h1' },
  ],
  budget: 10,
};

/** A hunt with the knight placed by hand. */
function hunt(ghost: Square, squad: Squad = SQUAD): HuntState {
  const state = startHunt(squad, () => 0);
  return { ...state, ghost, possible: [ghost], shown: ghost, lastSeen: ghost, events: [] };
}

describe('the hunters', () => {
  it('move by their own rules onto empty squares, the knight unseen', () => {
    const dests = hunterDests(parsePlacement('8/8/8/8/8/8/8/R1B4R w - - 0 1'));
    expect(dests.get('a1')).toContain('a8');
    expect(dests.get('a1')).toContain('b1');
    expect(dests.get('a1')).not.toContain('c1');
    expect(dests.get('c1')?.sort()).toEqual(['a3', 'b2', 'd2', 'e3', 'f4', 'g5', 'h6']);
  });

  it('pass over the squares between, a knight only its landing square', () => {
    expect(pathOf('a1', 'a4', 'r')).toEqual(['a2', 'a3', 'a4']);
    expect(pathOf('c1', 'e3', 'b')).toEqual(['d2', 'e3']);
    expect(pathOf('g1', 'f3', 'n')).toEqual(['f3']);
  });
});

describe('the knight', () => {
  it('takes only unprotected hunters and goes only where no hunter attacks', () => {
    // Rooks on a1 and d3: the knight on b4 reaches d3 (protected? no) and a2, c2, d5, c6, a6.
    const hunters = parsePlacement('8/8/8/8/8/3R4/8/R7 w - - 0 1');
    const { captures, safe } = ghostOptions(hunters, 'b4');
    expect(captures).toEqual(['d3']);
    // a2 and a6 are on the a-file rook's line, c2 is not attacked, d5 is on the d-file.
    expect(safe.sort()).toEqual(['c2', 'c6']);
    // With the d3 rook protected along the third rank, it is not taken.
    const guarded = parsePlacement('8/8/8/8/8/R2R4/8/8 w - - 0 1');
    expect(ghostOptions(guarded, 'b4').captures).toEqual([]);
  });

  it('takes the most valuable piece it can, and is cornered with no safe square', () => {
    // From d4 it reaches the bishop on b3 and the rook on f5; neither guards the other.
    const hunters = parsePlacement('8/8/8/5R2/8/1B6/8/8 w - - 0 1');
    expect(ghostOptions(hunters, 'd4').captures.sort()).toEqual(['b3', 'f5']);
    expect(chooseGhostMove(hunters, 'd4', () => 0.5)).toEqual({ to: 'f5', capture: true });
    // A guarded piece is left alone: the queen guards the rook, nothing guards the queen.
    const pair = parsePlacement('8/8/8/8/8/1Q6/2R5/8 w - - 0 1');
    expect(ghostOptions(pair, 'a1').captures).toEqual(['b3']);
    // A knight on a8 with b6 and c7 covered by the rooks on the b- and c-files.
    const net = parsePlacement('8/8/8/8/8/8/8/1RR5 w - - 0 1');
    expect(ghostOptions(net, 'a8')).toEqual({ captures: [], safe: [] });
    expect(chooseGhostMove(net, 'a8', () => 0.5)).toBeNull();
  });

  it('prefers squares with room to run', () => {
    // From b1: c3 has eight onward squares, d2 six and a3 four.
    const hunters = parsePlacement('7R/8/8/8/8/8/8/8 w - - 0 1');
    expect(chooseGhostMove(hunters, 'b1', () => 0)).toEqual({ to: 'c3', capture: false });
  });

  it('starts in the far half, out of every hunter’s reach', () => {
    const random = seededRandom(9);
    for (const squad of HUNTS) {
      const state = startHunt(squad, random);
      for (let i = 0; i < 30; i++) {
        const square = ghostStart(state.hunters, random);
        expect(Number(square[1])).toBeGreaterThanOrEqual(5);
        expect(ghostOptions(state.hunters, square).captures).toEqual([]);
      }
    }
  });
});

describe('where the knight could be', () => {
  it('follows every square it could jump to, minus those it would never choose', () => {
    // From g8 it could go to e7, f6 or h6; the rook on the 6th rank rules out f6 and h6.
    const hunters = parsePlacement('8/8/R7/8/8/8/8/8 w - - 0 1');
    expect(nextPossible(['g8'], hunters)).toEqual(['e7']);
    // From a square where an unprotected hunter was in reach, it would have taken it.
    const bait = parsePlacement('8/8/8/8/8/8/2R5/8 w - - 0 1');
    expect(nextPossible(['b4', 'h8'], bait)).toEqual(['f7', 'g6']);
  });

  it('always holds the knight’s real square, in hunt after hunt', () => {
    const random = seededRandom(21);
    for (const squad of HUNTS) {
      for (let game = 0; game < 12; game++) {
        let state = startHunt(squad, random);
        while (!state.outcome) {
          const moves = [...hunterDests(state.hunters)].flatMap(([from, tos]) =>
            tos.map((to) => [from, to] as const),
          );
          const [from, to] = moves[Math.floor(random() * moves.length)] ?? ['a1', 'a2'];
          const next = playHunterMove(state, from, to, random);
          if (!next) throw new Error('a listed move was refused');
          state = next;
          if (!state.outcome) {
            expect(state.possible).toContain(state.ghost);
            if (state.shown) expect(state.shown).toBe(state.ghost);
          }
        }
      }
    }
  });
});

describe('a hunt', () => {
  it('shows the knight every third move, and hides it in between', () => {
    let state = hunt('e8');
    expect(movesToSighting(state)).toBe(SIGHTING_EVERY);
    // The rooks stay on the first rank, guarding each other, so nothing is ever taken.
    const moves: [Square, Square][] = [
      ['a1', 'b1'],
      ['h1', 'g1'],
      ['b1', 'a1'],
    ];
    moves.forEach(([from, to], i) => {
      const next = playHunterMove(state, from, to, seededRandom(i));
      if (!next) throw new Error('refused');
      state = next;
      if (i < 2) {
        expect(state.shown).toBeNull();
        expect(huntMessage(state)).toContain(`shows itself in ${2 - i} move`);
      }
    });
    expect(state.shown).toBe(state.ghost);
    expect(state.lastSeen).toBe(state.ghost);
    expect(state.possible).toEqual([state.ghost]);
    expect(huntMessage(state)).toBe(`Rook b1–a1. Seen: the knight is on ${state.ghost}.`);
    expect(huntFen(state)).toContain('n');
  });

  it('refuses a move a hunter cannot make, or any move once it is over', () => {
    const state = hunt('e8');
    expect(playHunterMove(state, 'a1', 'b2')).toBeNull();
    expect(playHunterMove(state, 'c3', 'c4')).toBeNull();
    expect(playHunterMove({ ...state, outcome: 'caught' }, 'a1', 'a2')).toBeNull();
  });

  it('catches the knight by landing on it, or by running into it on the way', () => {
    const landed = playHunterMove(hunt('a5'), 'a1', 'a5');
    expect(landed?.outcome).toBe('caught');
    expect(huntMessage(landed as HuntState)).toBe('Caught on a5.');
    const bumped = playHunterMove(hunt('a5'), 'a1', 'a8');
    expect(bumped?.outcome).toBe('caught');
    expect(bumped?.hunters.get('a5')).toEqual({ color: 'w', type: 'r' });
    expect(bumped?.hunters.has('a8')).toBe(false);
    expect(bumped?.lastMove).toEqual(['a1', 'a5']);
    expect(huntMessage(bumped as HuntState)).toBe(
      'Your rook ran into the knight on a5 and took it.',
    );
    // The board shows the hunter on the square, not the knight.
    expect(huntFen(bumped as HuntState).split(' ')[0]).not.toContain('n');
  });

  it('corners the knight when every square it could jump to is covered', () => {
    // Knight on a8: Rb1 then covers b6 while Rc1 covers c7.
    const squad: Squad = {
      ...SQUAD,
      pieces: [
        { type: 'r', square: 'a1' },
        { type: 'r', square: 'c1' },
      ],
    };
    const state = playHunterMove(hunt('a8', squad), 'a1', 'b1');
    expect(state?.outcome).toBe('cornered');
    expect(state?.shown).toBe('a8');
    expect(huntMessage(state as HuntState)).toBe(
      'Rook a1–b1. Cornered on a8: every square it could jump to is covered.',
    );
  });

  it('loses a hunter left unprotected in the knight’s reach, and shows where it struck', () => {
    // Knight on b6; a rook to a4 is within its reach and unprotected.
    const state = playHunterMove(hunt('b6'), 'a1', 'a4');
    expect(state?.hunters.has('a4')).toBe(false);
    expect(state?.ghost).toBe('a4');
    expect(state?.shown).toBe('a4');
    expect(state?.possible).toEqual(['a4']);
    expect(huntMessage(state as HuntState)).toBe('Rook a1–a4. The knight took your rook on a4.');
  });

  it('ends when the moves run out, with the knight shown', () => {
    const squad = { ...SQUAD, budget: 1 };
    const state = playHunterMove(hunt('e8', squad), 'a1', 'a2', () => 0.5);
    expect(state?.outcome).toBe('escaped');
    expect(state?.shown).toBe(state?.ghost);
    expect(huntMessage(state as HuntState)).toBe(
      `Rook a1–a2. Out of moves — the knight got away. It was on ${state?.ghost}.`,
    );
    expect(huntPoints(state as HuntState, 'shaded')).toBe(0);
  });

  it('ends when the knight has taken the last hunter', () => {
    const squad: Squad = { ...SQUAD, pieces: [{ type: 'r', square: 'a1' }] };
    const state = playHunterMove(hunt('b6', squad), 'a1', 'a4');
    expect(state?.outcome).toBe('wiped-out');
    expect(huntMessage(state as HuntState)).toBe('The knight took your last piece.');
  });

  it('scores ten for a catch and one per move to spare, doubled unshaded', () => {
    const caught = { ...hunt('e8'), outcome: 'caught' as const, turn: 4 };
    expect(huntPoints(caught, 'shaded')).toBe(16);
    expect(huntPoints(caught, 'unshaded')).toBe(32);
    expect(describeGhostKnight(3, 51, 'shaded')).toBe('3 of 5 hunts · 51 points');
    expect(describeGhostKnight(1, 30, 'unshaded')).toBe('1 of 5 hunts · 30 points · unshaded');
  });

  it('starts every squad on its home squares, with the knight in view', () => {
    expect(squadFen(HUNTS[0] as Squad)).toBe('8/8/8/8/8/8/8/R1B4R w - - 0 1');
    for (const squad of HUNTS) {
      const state = startHunt(squad, seededRandom(2));
      expect(state.hunters.size).toBe(squad.pieces.length);
      expect(state.shown).toBe(state.ghost);
      expect(huntMessage(state)).toBe(
        `The knight is on ${state.ghost}. It vanishes when it moves and shows itself again after its third move.`,
      );
    }
  });
});

/** A hunter that looks one move ahead: how often it catches the knight within each budget. */
function greedyMove(state: HuntState): [Square, Square] {
  let best: [Square, Square] = ['a1', 'a1'];
  let top = -Infinity;
  const size = state.possible.length;
  for (const [from, targets] of hunterDests(state.hunters)) {
    const type = state.hunters.get(from)?.type as HunterRole;
    for (const to of targets) {
      const path = pathOf(from, to, type);
      const hunters = movePiece(state.hunters, from, to);
      const rest = state.possible.filter((s) => !path.includes(s));
      let cornered = 0;
      let lost = 0;
      for (const square of rest) {
        const options = ghostOptions(hunters, square);
        if (options.captures.length) lost += 1;
        else if (!options.safe.length) cornered += 1;
      }
      const hit = size - rest.length;
      const score =
        ((hit + cornered) / size) * 100 - (lost / size) * 80 - nextPossible(rest, hunters).length;
      if (score > top) {
        top = score;
        best = [from, to];
      }
    }
  }
  return best;
}

describe('the five hunts', () => {
  it('can each be won within their budgets by a hunter that looks one move ahead', () => {
    const random = seededRandom(17);
    for (const squad of HUNTS) {
      let won = 0;
      const tries = 20;
      for (let i = 0; i < tries; i++) {
        let state = startHunt(squad, random);
        while (!state.outcome) {
          const [from, to] = greedyMove(state);
          state = playHunterMove(state, from, to, random) ?? { ...state, outcome: 'escaped' };
        }
        if (state.outcome === 'caught' || state.outcome === 'cornered') won += 1;
      }
      // The hardest hunt is meant to be hard, not hopeless.
      expect(won, squad.id).toBeGreaterThanOrEqual(squad === HUNTS[4] ? 4 : 8);
    }
    // Twenty hunts per squad, each move weighing every hunter move.
  }, 60_000);

  it('get harder: bigger budgets for smaller or slower squads', () => {
    for (let i = 1; i < HUNTS.length; i++) {
      expect(HUNTS[i]?.budget ?? 0).toBeGreaterThanOrEqual(HUNTS[i - 1]?.budget ?? 0);
    }
  });
});
