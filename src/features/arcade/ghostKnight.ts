import type { Square } from 'chess.js';
import {
  ALL_SQUARES,
  between,
  fileOf,
  isAttacked,
  knightSquares,
  movePiece,
  type Piece,
  type Placement,
  placementField,
  rankOf,
  reach,
} from '@/chess/geometry';
import type { Fen } from '@/chess/types';

/**
 * Ghost Knight: an enemy knight moves unseen and shows itself every third
 * move. The hunters are ordinary pieces moving by the ordinary rules, one
 * move a turn; the knight moves by its rules too, never onto a square a
 * hunter attacks, and it takes any hunter left unprotected within its reach.
 *
 * Because the knight's rules are fixed, where it could be is known exactly:
 * from every square it might stand on, the squares it would jump to. That set
 * is what the board shades in the shaded mode — and what the unshaded mode
 * leaves to the player.
 */

export type HunterRole = 'q' | 'r' | 'b' | 'n';

export interface Squad {
  id: string;
  /** "Queen and rook". */
  name: string;
  pieces: readonly { type: HunterRole; square: Square }[];
  /** Your moves before the knight gets away. */
  budget: number;
}

/**
 * The five hunts of a run, hardest last. Budgets are set from simulated hunts
 * (a hunter that looks one move ahead): roughly the moves it needs in three
 * hunts out of four, and a few more.
 */
export const HUNTS: readonly Squad[] = [
  {
    id: 'rooks-bishop',
    name: 'Two rooks and a bishop',
    pieces: [
      { type: 'r', square: 'a1' },
      { type: 'r', square: 'h1' },
      { type: 'b', square: 'c1' },
    ],
    budget: 20,
  },
  {
    id: 'rooks-knight',
    name: 'Two rooks and a knight',
    pieces: [
      { type: 'r', square: 'a1' },
      { type: 'r', square: 'h1' },
      { type: 'n', square: 'g1' },
    ],
    budget: 24,
  },
  {
    id: 'rook-bishops',
    name: 'Rook and two bishops',
    pieces: [
      { type: 'r', square: 'a1' },
      { type: 'b', square: 'c1' },
      { type: 'b', square: 'f1' },
    ],
    budget: 24,
  },
  {
    id: 'bishops-knights',
    name: 'Two bishops and two knights',
    pieces: [
      { type: 'b', square: 'c1' },
      { type: 'b', square: 'f1' },
      { type: 'n', square: 'b1' },
      { type: 'n', square: 'g1' },
    ],
    budget: 28,
  },
  {
    id: 'rook-bishop-knight',
    name: 'Rook, bishop and knight',
    pieces: [
      { type: 'r', square: 'a1' },
      { type: 'b', square: 'c1' },
      { type: 'n', square: 'g1' },
    ],
    budget: 32,
  },
];

/** The knight shows itself after this many of its moves. */
export const SIGHTING_EVERY = 3;

const VALUES: Record<HunterRole, number> = { q: 9, r: 5, b: 3, n: 3 };

export type HuntOutcome = 'caught' | 'cornered' | 'escaped' | 'wiped-out';

/** Something worth a line in the hunt's log. */
export type HuntEvent =
  | { type: 'start'; square: Square }
  | { type: 'seen'; square: Square; turn: number }
  | { type: 'took'; square: Square; piece: HunterRole; turn: number }
  | { type: 'caught'; square: Square; turn: number; bumped: boolean }
  | { type: 'cornered'; square: Square; turn: number }
  | { type: 'escaped'; square: Square; turn: number };

export interface HuntState {
  squad: Squad;
  hunters: Placement;
  /** Where the knight really is. */
  ghost: Square;
  /** Every square it could be on, from what has been seen. */
  possible: Square[];
  /** Your moves so far. */
  turn: number;
  /** The knight's moves since it was last seen. */
  sinceSeen: number;
  /** Where it stands in plain view right now (a sighting, a capture, the end); null when hidden. */
  shown: Square | null;
  /** Where it was last seen. */
  lastSeen: Square;
  /** The last hunter move, for the board's highlight. */
  lastMove: [Square, Square] | null;
  outcome: HuntOutcome | null;
  events: HuntEvent[];
}

function hunterPlacement(squad: Squad): Placement {
  const placement: Placement = new Map();
  for (const { type, square } of squad.pieces) placement.set(square, { color: 'w', type });
  return placement;
}

/** Where each hunter may go: by its own movement, onto empty squares (the knight is unseen). */
export function hunterDests(hunters: Placement): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const [square] of hunters) {
    const targets = reach(hunters, square);
    if (targets.length) dests.set(square, targets);
  }
  return dests;
}

/** The squares a hunter's move passes over and lands on, in order. */
export function pathOf(from: Square, to: Square, type: HunterRole): Square[] {
  if (type === 'n') return [to];
  return [...(between(from, to) ?? []), to];
}

/**
 * The knight's choices from `from` with the hunters where they stand: the
 * unprotected hunters it can take, and the empty squares no hunter attacks.
 */
export function ghostOptions(
  hunters: Placement,
  from: Square,
): { captures: Square[]; safe: Square[] } {
  const captures: Square[] = [];
  const safe: Square[] = [];
  for (const to of knightSquares(from)) {
    if (hunters.has(to)) {
      const rest = new Map(hunters);
      rest.delete(to);
      if (!isAttacked(rest, to, 'w')) captures.push(to);
    } else if (!isAttacked(hunters, to, 'w')) {
      safe.push(to);
    }
  }
  return { captures, safe };
}

/** How far a square is from the edge: 0 on the rim, 3 in the centre. */
function centrality(square: Square): number {
  return Math.min(fileOf(square), 7 - fileOf(square), rankOf(square), 7 - rankOf(square));
}

function distance(a: Square, b: Square): number {
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

/**
 * The knight's move: take the most valuable unprotected hunter in reach;
 * otherwise jump to the safe square with the most safe squares after it,
 * preferring the centre and distance from the hunters, with a little chance
 * so it is never predictable. Null when it has no safe square: cornered.
 */
export function chooseGhostMove(
  hunters: Placement,
  from: Square,
  random: () => number,
): { to: Square; capture: boolean } | null {
  const { captures, safe } = ghostOptions(hunters, from);
  if (captures.length) {
    const best = [...captures].sort(
      (a, b) =>
        VALUES[(hunters.get(b)?.type ?? 'n') as HunterRole] -
        VALUES[(hunters.get(a)?.type ?? 'n') as HunterRole],
    )[0];
    if (best) return { to: best, capture: true };
  }
  let choice: Square | null = null;
  let top = -Infinity;
  for (const to of safe) {
    const onward = knightSquares(to).filter(
      (s) => !hunters.has(s) && !isAttacked(hunters, s, 'w'),
    ).length;
    const near = Math.min(...[...hunters.keys()].map((h) => distance(h, to)), 8);
    const score = 3 * onward + centrality(to) + 0.5 * near + 2 * random();
    if (score > top) {
      top = score;
      choice = to;
    }
  }
  return choice ? { to: choice, capture: false } : null;
}

/**
 * Where the knight could be after its move, from where it could have been:
 * from each such square, the safe squares it would choose among — unless a
 * hunter stood unprotected in its reach there, since it would have taken it.
 */
export function nextPossible(possible: readonly Square[], hunters: Placement): Square[] {
  const out = new Set<Square>();
  for (const square of possible) {
    const { captures, safe } = ghostOptions(hunters, square);
    if (captures.length) continue;
    for (const to of safe) out.add(to);
  }
  return [...out].sort();
}

/** A random starting square for the knight: in the far half, out of every hunter's reach. */
export function ghostStart(hunters: Placement, random: () => number): Square {
  const options = ALL_SQUARES.filter(
    (s) =>
      rankOf(s) >= 4 &&
      !hunters.has(s) &&
      !isAttacked(hunters, s, 'w') &&
      knightSquares(s).every((t) => !hunters.has(t)),
  );
  return options[Math.floor(random() * options.length)] ?? 'e6';
}

export function startHunt(squad: Squad, random: () => number = Math.random): HuntState {
  const hunters = hunterPlacement(squad);
  const ghost = ghostStart(hunters, random);
  return {
    squad,
    hunters,
    ghost,
    possible: [ghost],
    turn: 0,
    sinceSeen: 0,
    shown: ghost,
    lastSeen: ghost,
    lastMove: null,
    outcome: null,
    events: [{ type: 'start', square: ghost }],
  };
}

/**
 * Your move, and the knight's answer. Returns null for a move the hunter
 * cannot make. A slider that runs into the unseen knight stops on its square
 * and takes it — a move that was always legal, found by luck.
 */
export function playHunterMove(
  state: HuntState,
  from: Square,
  to: Square,
  random: () => number = Math.random,
): HuntState | null {
  if (state.outcome) return null;
  const piece = state.hunters.get(from);
  if (!piece || !(hunterDests(state.hunters).get(from) ?? []).includes(to)) return null;
  const type = piece.type as HunterRole;
  const path = pathOf(from, to, type);
  const turn = state.turn + 1;

  const bump = path.indexOf(state.ghost);
  if (bump >= 0) {
    return {
      ...state,
      hunters: movePiece(state.hunters, from, state.ghost),
      turn,
      shown: state.ghost,
      lastSeen: state.ghost,
      possible: [state.ghost],
      lastMove: [from, state.ghost],
      outcome: 'caught',
      events: [
        ...state.events,
        { type: 'caught', square: state.ghost, turn, bumped: state.ghost !== to },
      ],
    };
  }

  const hunters = movePiece(state.hunters, from, to);
  const possible = state.possible.filter((s) => !path.includes(s));
  const base = { ...state, hunters, turn, lastMove: [from, to] as [Square, Square] };

  const reply = chooseGhostMove(hunters, state.ghost, random);
  if (!reply) {
    return {
      ...base,
      shown: state.ghost,
      lastSeen: state.ghost,
      possible: [state.ghost],
      outcome: 'cornered',
      events: [...state.events, { type: 'cornered', square: state.ghost, turn }],
    };
  }

  if (reply.capture) {
    const taken = (hunters.get(reply.to)?.type ?? 'n') as HunterRole;
    const remaining = new Map(hunters);
    remaining.delete(reply.to);
    const events: HuntEvent[] = [
      ...state.events,
      { type: 'took', square: reply.to, piece: taken, turn },
    ];
    const wiped = remaining.size === 0;
    const escaped = !wiped && turn >= state.squad.budget;
    if (escaped) events.push({ type: 'escaped', square: reply.to, turn });
    return {
      ...base,
      hunters: remaining,
      ghost: reply.to,
      possible: [reply.to],
      sinceSeen: 0,
      shown: reply.to,
      lastSeen: reply.to,
      outcome: wiped ? 'wiped-out' : escaped ? 'escaped' : null,
      events,
    };
  }

  const ghost = reply.to;
  const sinceSeen = state.sinceSeen + 1;
  const sighting = sinceSeen >= SIGHTING_EVERY;
  const escaped = turn >= state.squad.budget;
  const events: HuntEvent[] = [...state.events];
  if (escaped) events.push({ type: 'escaped', square: ghost, turn });
  else if (sighting) events.push({ type: 'seen', square: ghost, turn });
  return {
    ...base,
    ghost,
    possible: sighting || escaped ? [ghost] : nextPossible(possible, hunters),
    sinceSeen: sighting ? 0 : sinceSeen,
    shown: sighting || escaped ? ghost : null,
    lastSeen: sighting ? ghost : state.lastSeen,
    outcome: escaped ? 'escaped' : null,
    events,
  };
}

/** Moves until the next sighting. */
export function movesToSighting(state: HuntState): number {
  return SIGHTING_EVERY - state.sinceSeen;
}

/** The board: the hunters, and the knight only where it shows itself. */
export function huntFen(state: HuntState): Fen {
  const pieces = new Map(state.hunters);
  if (state.shown && !(state.outcome === 'caught')) {
    pieces.set(state.shown, { color: 'b', type: 'n' } satisfies Piece);
  }
  return `${placementField(pieces)} w - - 0 1`;
}

export type HuntMode = 'shaded' | 'unshaded';

/**
 * Points for a hunt: ten for the catch and one for every move to spare; the
 * unshaded mode doubles them, since the knight is tracked in the head.
 */
export function huntPoints(state: HuntState, mode: HuntMode): number {
  if (state.outcome !== 'caught' && state.outcome !== 'cornered') return 0;
  const points = 10 + Math.max(0, state.squad.budget - state.turn);
  return mode === 'unshaded' ? points * 2 : points;
}

/** The arcade record's words for a run. */
export function describeGhostKnight(caught: number, points: number, mode: HuntMode): string {
  return `${caught} of ${HUNTS.length} hunts · ${points} points${mode === 'unshaded' ? ' · unshaded' : ''}`;
}

const HUNTER_NAMES: Record<HunterRole, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

/** What just happened, in a sentence: for the status line and screen readers. */
export function huntMessage(state: HuntState): string {
  const last = state.events[state.events.length - 1];
  const move = state.lastMove;
  // The piece that moved: still on its square, or just taken there by the knight.
  const moved: HunterRole | undefined = move
    ? ((state.hunters.get(move[1])?.type as HunterRole | undefined) ??
      (last?.type === 'took' && last.square === move[1] ? last.piece : undefined))
    : undefined;
  const yours =
    moved && move
      ? `${HUNTER_NAMES[moved].replace(/^./, (c) => c.toUpperCase())} ${move[0]}–${move[1]}. `
      : '';
  if (state.outcome === 'wiped-out') return 'The knight took your last piece.';
  switch (last?.type) {
    case 'start':
      if (state.turn === 0) {
        return `The knight is on ${last.square}. It vanishes when it moves and shows itself again after its third move.`;
      }
      break;
    case 'caught':
      return last.bumped
        ? `Your ${moved ? HUNTER_NAMES[moved] : 'piece'} ran into the knight on ${last.square} and took it.`
        : `Caught on ${last.square}.`;
    case 'cornered':
      return `${yours}Cornered on ${last.square}: every square it could jump to is covered.`;
    case 'escaped':
      return `${yours}Out of moves — the knight got away. It was on ${last.square}.`;
    case 'took':
      if (last.turn === state.turn) {
        return `${yours}The knight took your ${HUNTER_NAMES[last.piece]} on ${last.square}.`;
      }
      break;
    case 'seen':
      if (last.turn === state.turn) return `${yours}Seen: the knight is on ${last.square}.`;
      break;
    default:
      break;
  }
  const left = movesToSighting(state);
  return `${yours}The knight moved, unseen. It shows itself in ${left} move${left === 1 ? '' : 's'}.`;
}

/** The board before a hunt: the squad on its home squares. */
export function squadFen(squad: Squad): Fen {
  const pieces: Placement = new Map();
  for (const { type, square } of squad.pieces) pieces.set(square, { color: 'w', type });
  return `${placementField(pieces)} w - - 0 1`;
}
