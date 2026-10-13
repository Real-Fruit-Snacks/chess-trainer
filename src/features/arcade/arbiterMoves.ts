import { Chess, type Move, type Square } from 'chess.js';
import {
  attackers,
  between,
  type Piece,
  type Placement,
  ROLE_NAMES,
  type Role,
  type Side,
  attacks,
  fileOf,
  kingSquare,
  kingSquares,
  knightSquares,
  lineStep,
  movePiece,
  offset,
  parsePlacement,
  pieceName,
  placementField,
  rankOf,
  reach,
  slides,
} from '@/chess/geometry';
import { moveLabel } from '@/chess/helpers';
import type { Fen, San } from '@/chess/types';

/**
 * Arbiter's illegal moves: for a real position from a classic game, moves
 * that break one rule each — a knight off its L, a pinned piece leaving its
 * line, castling through check — with the position they would leave and a
 * plain explanation of the rule they break. Every one is a move chess.js
 * refuses; the tests check that for each kind.
 */

export type IllegalKind =
  // Tier 1: a piece moving in a way it never can.
  | 'knight-shape'
  | 'bishop-straight'
  | 'rook-diagonal'
  | 'pawn-backwards'
  | 'pawn-straight-capture'
  | 'pawn-diagonal-step'
  | 'king-two-squares'
  | 'own-capture'
  // Tier 2: the right movement where it is not allowed.
  | 'jumps-over'
  | 'pawn-late-double'
  | 'pawn-blocked-double'
  | 'no-promotion'
  // Tier 3: what the king's safety and the move order forbid.
  | 'pinned-piece'
  | 'king-into-check'
  | 'ignores-check'
  | 'castle-through-check'
  | 'late-en-passant'
  | 'moves-twice';

export type Tier = 1 | 2 | 3;

export const KIND_TIER: Record<IllegalKind, Tier> = {
  'knight-shape': 1,
  'bishop-straight': 1,
  'rook-diagonal': 1,
  'pawn-backwards': 1,
  'pawn-straight-capture': 1,
  'pawn-diagonal-step': 1,
  'king-two-squares': 1,
  'own-capture': 1,
  'jumps-over': 2,
  'pawn-late-double': 2,
  'pawn-blocked-double': 2,
  'no-promotion': 2,
  'pinned-piece': 3,
  'king-into-check': 3,
  'ignores-check': 3,
  'castle-through-check': 3,
  'late-en-passant': 3,
  'moves-twice': 3,
};

/** What was wrong, as a heading: "A pinned piece moved". */
export const KIND_TITLES: Record<IllegalKind, string> = {
  'knight-shape': 'A knight left its L',
  'bishop-straight': 'A bishop moved straight',
  'rook-diagonal': 'A rook moved diagonally',
  'pawn-backwards': 'A pawn moved backwards',
  'pawn-straight-capture': 'A pawn took straight ahead',
  'pawn-diagonal-step': 'A pawn stepped diagonally without taking',
  'king-two-squares': 'A king moved two squares',
  'own-capture': 'A piece took one of its own',
  'jumps-over': 'A piece jumped over another',
  'pawn-late-double': 'A pawn made a late double step',
  'pawn-blocked-double': 'A pawn jumped a blocker',
  'no-promotion': 'A pawn reached the end and stayed a pawn',
  'pinned-piece': 'A pinned piece moved',
  'king-into-check': 'A king walked into check',
  'ignores-check': 'A check was ignored',
  'castle-through-check': 'Castling past an attack',
  'late-en-passant': 'En passant too late',
  'moves-twice': 'The same side moved twice',
};

export const ALL_KINDS = Object.keys(KIND_TIER) as IllegalKind[];

/** A move of the game being replayed. */
export interface PlayedMove {
  from: Square;
  to: Square;
  san: San;
  piece: Role;
  color: Side;
}

/** A position of the game being replayed, with how it was reached. */
export interface ArbiterPosition {
  fen: Fen;
  /** Every move that led here, oldest first. */
  history: readonly PlayedMove[];
}

export interface IllegalMove {
  kind: IllegalKind;
  from: Square;
  to: Square;
  /** The move as it would be written if it were allowed: "Nd3", "exd6", "O-O". */
  san: San;
  /** The side that made it. */
  color: Side;
  /** The position it leaves on the board. */
  fen: Fen;
  /** Why it is not allowed, in a sentence or two. */
  reason: string;
  /** Squares that show the reason (the pinning piece, the piece in the way…). */
  marks: Square[];
  /** Lines that show the reason (an attack, a pin), from → to. */
  arrows: [Square, Square][];
  /** Where the piece could have gone instead, when that teaches the rule (a knight's real squares). */
  hints: Square[];
}

const COLOR_NAMES: Record<Side, string> = { w: 'White', b: 'Black' };

function other(color: Side): Side {
  return color === 'w' ? 'b' : 'w';
}

function sideToMove(fen: Fen): Side {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** The piece's name with its square: "the knight on f6". */
function named(piece: Piece, square: Square): string {
  return `the ${ROLE_NAMES[piece.type]} on ${square}`;
}

/** Notation for a move as if it were allowed: no check sign, no disambiguation. */
function sanOf(piece: Piece, from: Square, to: Square, capture: boolean): San {
  if (piece.type === 'p') return capture ? `${from.charAt(0)}x${to}` : to;
  return `${piece.type.toUpperCase()}${capture ? 'x' : ''}${to}`;
}

/** The position after a move by `mover`, with the other side to move. */
function fenAfter(placement: Placement, mover: Side): Fen {
  return `${placementField(placement)} ${other(mover)} - - 0 1`;
}

/** The squares of `side`'s pieces of the given types. */
function piecesOf(placement: Placement, side: Side, types: readonly Role[]): [Square, Piece][] {
  return [...placement].filter(([, p]) => p.color === side && types.includes(p.type));
}

/** Whether `side` could land on `square`: empty, or an enemy piece that is not the king. */
function canLand(placement: Placement, square: Square, side: Side): boolean {
  const there = placement.get(square);
  return !there || (there.color !== side && there.type !== 'k');
}

interface Context {
  fen: Fen;
  placement: Placement;
  side: Side;
  enemy: Side;
  king: Square | null;
  inCheck: boolean;
  history: readonly PlayedMove[];
}

function context(position: ArbiterPosition): Context {
  const placement = parsePlacement(position.fen);
  const side = sideToMove(position.fen);
  const enemy = other(side);
  const king = kingSquare(placement, side);
  return {
    fen: position.fen,
    placement,
    side,
    enemy,
    king,
    inCheck: king ? attackers(placement, king, enemy).length > 0 : false,
    history: position.history,
  };
}

type Draft = Omit<IllegalMove, 'kind' | 'color' | 'marks' | 'arrows' | 'hints' | 'fen'> & {
  after: Placement;
  marks?: Square[];
  arrows?: [Square, Square][];
  hints?: Square[];
};

function finish(kind: IllegalKind, ctx: Context, draft: Draft, mover = ctx.side): IllegalMove {
  return {
    kind,
    from: draft.from,
    to: draft.to,
    san: draft.san,
    color: mover,
    fen: fenAfter(draft.after, mover),
    reason: draft.reason,
    marks: draft.marks ?? [],
    arrows: draft.arrows ?? [],
    hints: draft.hints ?? [],
  };
}

/** A plain move of the piece on `from` to `to` (taking what stands there), as a draft. */
function plainMove(ctx: Context, from: Square, to: Square, reason: string): Draft | null {
  const piece = ctx.placement.get(from);
  if (!piece) return null;
  const capture = ctx.placement.has(to);
  return {
    from,
    to,
    san: sanOf(piece, from, to, capture),
    after: movePiece(ctx.placement, from, to),
    reason,
  };
}

// ---------- Tier 1 ----------

function knightShape(ctx: Context): Draft[] {
  const out: Draft[] = [];
  for (const [from] of piecesOf(ctx.placement, ctx.side, ['n'])) {
    const real = knightSquares(from);
    for (let df = -2; df <= 2; df++) {
      for (let dr = -2; dr <= 2; dr++) {
        const to = offset(from, df, dr);
        if (!to || to === from || real.includes(to) || !canLand(ctx.placement, to, ctx.side)) {
          continue;
        }
        const draft = plainMove(
          ctx,
          from,
          to,
          `A knight moves in an L: two squares one way and one to the side. ${from} to ${to} is not an L — the marked squares are where it could have gone.`,
        );
        if (draft) out.push({ ...draft, hints: real });
      }
    }
  }
  return out;
}

/** Slides of up to three squares along `lines` that the piece's own movement does not allow. */
function wrongLineSlides(ctx: Context, type: Role, lines: readonly (readonly [number, number])[]) {
  const out: { from: Square; to: Square; straight: 'file' | 'rank' | 'diagonal' }[] = [];
  for (const [from] of piecesOf(ctx.placement, ctx.side, [type])) {
    for (const [df, dr] of lines) {
      for (let n = 1; n <= 3; n++) {
        const to = offset(from, df * n, dr * n);
        if (!to) break;
        if (!canLand(ctx.placement, to, ctx.side)) break;
        out.push({ from, to, straight: df === 0 ? 'file' : dr === 0 ? 'rank' : 'diagonal' });
        if (ctx.placement.has(to)) break;
      }
    }
  }
  return out;
}

function bishopStraight(ctx: Context): Draft[] {
  const lines = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  return wrongLineSlides(ctx, 'b', lines).flatMap(({ from, to, straight }) => {
    const draft = plainMove(
      ctx,
      from,
      to,
      `A bishop moves only diagonally, so it stays on squares of one colour all game. This one moved along the ${straight}.`,
    );
    return draft ? [draft] : [];
  });
}

function rookDiagonal(ctx: Context): Draft[] {
  const lines = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const;
  return wrongLineSlides(ctx, 'r', lines).flatMap(({ from, to }) => {
    const draft = plainMove(
      ctx,
      from,
      to,
      'A rook moves along ranks and files only, never diagonally.',
    );
    return draft ? [draft] : [];
  });
}

function forwardOf(side: Side): number {
  return side === 'w' ? 1 : -1;
}

function pawnBackwards(ctx: Context): Draft[] {
  const out: Draft[] = [];
  for (const [from] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    const to = offset(from, 0, -forwardOf(ctx.side));
    // Never back onto its own first rank, where no pawn can stand.
    if (!to || ctx.placement.has(to) || rankOf(to) === (ctx.side === 'w' ? 0 : 7)) continue;
    const draft = plainMove(ctx, from, to, 'Pawns never move backwards — not even one square.');
    if (draft) out.push(draft);
  }
  return out;
}

function pawnStraightCapture(ctx: Context): Draft[] {
  const out: Draft[] = [];
  for (const [from] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    const to = offset(from, 0, forwardOf(ctx.side));
    const victim = to ? ctx.placement.get(to) : undefined;
    if (!to || !victim || victim.color === ctx.side || victim.type === 'k') continue;
    // The last rank would add a promotion question to the picture.
    if (rankOf(to) === 0 || rankOf(to) === 7) continue;
    out.push({
      from,
      to,
      san: `${from.charAt(0)}x${to}`,
      after: movePiece(ctx.placement, from, to),
      reason: `A pawn takes diagonally, never straight ahead: ${named(victim, to)} only blocked it.`,
    });
  }
  return out;
}

/** The square an en passant capture would land on right now, if the last move allows one. */
function enPassantTarget(ctx: Context): Square | null {
  const last = ctx.history[ctx.history.length - 1];
  if (last?.piece !== 'p' || Math.abs(rankOf(last.to) - rankOf(last.from)) !== 2) {
    return null;
  }
  return offset(last.from, 0, last.color === 'w' ? 1 : -1);
}

function pawnDiagonalStep(ctx: Context): Draft[] {
  const out: Draft[] = [];
  const passed = enPassantTarget(ctx);
  for (const [from, piece] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    for (const to of attacks(ctx.placement, from, piece)) {
      if (ctx.placement.has(to) || to === passed || rankOf(to) === 0 || rankOf(to) === 7) continue;
      out.push({
        from,
        to,
        san: to,
        after: movePiece(ctx.placement, from, to),
        reason: `A pawn moves diagonally only to take a piece, and ${to} was empty.`,
      });
    }
  }
  return out;
}

function kingTwoSquares(ctx: Context): Draft[] {
  if (!ctx.king) return [];
  const from = ctx.king;
  const backRank = ctx.side === 'w' ? 0 : 7;
  const out: Draft[] = [];
  for (const [df, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const middle = offset(from, df, dr);
    const to = offset(from, 2 * df, 2 * dr);
    if (!middle || !to || ctx.placement.has(middle) || !canLand(ctx.placement, to, ctx.side)) {
      continue;
    }
    // Two squares along the back rank from the king's own square looks like castling.
    if (dr === 0 && rankOf(from) === backRank && fileOf(from) === 4) continue;
    const draft = plainMove(
      ctx,
      from,
      to,
      'The king moves one square at a time. Only castling moves it two, and only along its back rank, with a rook.',
    );
    if (draft) out.push(draft);
  }
  return out;
}

function ownCapture(ctx: Context): Draft[] {
  const out: Draft[] = [];
  for (const [from, piece] of ctx.placement) {
    if (piece.color !== ctx.side || piece.type === 'k') continue;
    for (const to of attacks(ctx.placement, from, piece)) {
      const victim = ctx.placement.get(to);
      if (victim?.color !== ctx.side || victim.type === 'k') continue;
      out.push({
        from,
        to,
        san: sanOf(piece, from, to, true),
        after: movePiece(ctx.placement, from, to),
        reason: `A piece can never take one of its own side, and ${named(victim, to)} was ${COLOR_NAMES[ctx.side]}’s own.`,
        marks: [to],
      });
    }
  }
  return out;
}

// ---------- Tier 2 ----------

function jumpsOver(ctx: Context): Draft[] {
  const out: Draft[] = [];
  for (const [from, piece] of ctx.placement) {
    if (piece.color !== ctx.side || !slides(piece.type)) continue;
    const lines: (readonly [number, number])[] = [];
    if (piece.type !== 'b') lines.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    if (piece.type !== 'r') lines.push([1, 1], [-1, 1], [1, -1], [-1, -1]);
    for (const [df, dr] of lines) {
      let blocker: Square | null = null;
      for (let n = 1; n < 8; n++) {
        const to = offset(from, df * n, dr * n);
        if (!to) break;
        if (!blocker) {
          if (ctx.placement.has(to)) blocker = to;
          continue;
        }
        if (!canLand(ctx.placement, to, ctx.side)) break;
        const blocking = ctx.placement.get(blocker);
        const draft = plainMove(
          ctx,
          from,
          to,
          `Only a knight can jump over pieces. The ${ROLE_NAMES[piece.type]} on ${from} went through ${blocker}, where ${blocking ? `the ${pieceName(blocking)}` : 'a piece'} stands.`,
        );
        if (draft) out.push({ ...draft, marks: [blocker] });
        if (ctx.placement.has(to)) break;
      }
    }
  }
  return out;
}

function pawnLateDouble(ctx: Context): Draft[] {
  const out: Draft[] = [];
  const startRank = ctx.side === 'w' ? 1 : 6;
  const forward = forwardOf(ctx.side);
  for (const [from] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    if (rankOf(from) === startRank) continue;
    const one = offset(from, 0, forward);
    const two = offset(from, 0, 2 * forward);
    if (!one || !two || ctx.placement.has(one) || ctx.placement.has(two)) continue;
    if (rankOf(two) === 0 || rankOf(two) === 7) continue;
    const draft = plainMove(
      ctx,
      from,
      two,
      'A pawn may move two squares only from its starting square, and this one had already left it.',
    );
    if (draft) out.push(draft);
  }
  return out;
}

function pawnBlockedDouble(ctx: Context): Draft[] {
  const out: Draft[] = [];
  const startRank = ctx.side === 'w' ? 1 : 6;
  const forward = forwardOf(ctx.side);
  for (const [from] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    if (rankOf(from) !== startRank) continue;
    const one = offset(from, 0, forward);
    const two = offset(from, 0, 2 * forward);
    const blocker = one ? ctx.placement.get(one) : undefined;
    if (!one || !two || !blocker || ctx.placement.has(two)) continue;
    const draft = plainMove(
      ctx,
      from,
      two,
      `Pawns cannot jump: the ${pieceName(blocker)} on ${one} was in the way.`,
    );
    if (draft) out.push({ ...draft, marks: [one] });
  }
  return out;
}

interface CastleShape {
  right: string;
  king: Square;
  rook: Square;
  kingTo: Square;
  rookTo: Square;
  /** Squares that must be empty. */
  empty: Square[];
  /** Squares the king stands on, crosses and lands on: none may be attacked. */
  path: Square[];
  san: 'O-O' | 'O-O-O';
}

function castleShapes(side: Side): CastleShape[] {
  const r = side === 'w' ? '1' : '8';
  const sq = (f: string) => `${f}${r}` as Square;
  return [
    {
      right: side === 'w' ? 'K' : 'k',
      king: sq('e'),
      rook: sq('h'),
      kingTo: sq('g'),
      rookTo: sq('f'),
      empty: [sq('f'), sq('g')],
      path: [sq('e'), sq('f'), sq('g')],
      san: 'O-O',
    },
    {
      right: side === 'w' ? 'Q' : 'q',
      king: sq('e'),
      rook: sq('a'),
      kingTo: sq('c'),
      rookTo: sq('d'),
      empty: [sq('b'), sq('c'), sq('d')],
      path: [sq('e'), sq('d'), sq('c')],
      san: 'O-O-O',
    },
  ];
}

/** Castling's pieces in place with the squares between empty (whatever the rights say). */
function castleReady(ctx: Context, shape: CastleShape): boolean {
  const king = ctx.placement.get(shape.king);
  const rook = ctx.placement.get(shape.rook);
  return (
    king?.type === 'k' &&
    king.color === ctx.side &&
    rook?.type === 'r' &&
    rook.color === ctx.side &&
    shape.empty.every((s) => !ctx.placement.has(s))
  );
}

function castled(ctx: Context, shape: CastleShape): Placement {
  const king = ctx.placement.get(shape.king);
  const rook = ctx.placement.get(shape.rook);
  const next = new Map(ctx.placement);
  next.delete(shape.king);
  next.delete(shape.rook);
  if (king) next.set(shape.kingTo, king);
  if (rook) next.set(shape.rookTo, rook);
  return next;
}

function noPromotion(ctx: Context): Draft[] {
  const out: Draft[] = [];
  const seventh = ctx.side === 'w' ? 6 : 1;
  for (const [from, piece] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    if (rankOf(from) !== seventh) continue;
    for (const to of reach(ctx.placement, from)) {
      const capture = ctx.placement.has(to);
      if (capture && ctx.placement.get(to)?.type === 'k') continue;
      out.push({
        from,
        to,
        san: sanOf(piece, from, to, capture),
        after: movePiece(ctx.placement, from, to),
        reason:
          'A pawn that reaches the last rank must be promoted at once — to a queen, a rook, a bishop or a knight. It cannot stay a pawn.',
      });
    }
  }
  return out;
}

// ---------- Tier 3 ----------

/** Pieces of the side to move pinned to their king, with the pinning piece. */
function pins(ctx: Context): { pinned: Square; by: Square }[] {
  if (!ctx.king) return [];
  const king = ctx.king;
  const out: { pinned: Square; by: Square }[] = [];
  for (const [square, piece] of ctx.placement) {
    if (piece.color !== ctx.enemy || !slides(piece.type)) continue;
    const step = lineStep(square, king);
    if (!step) continue;
    const diagonal = step[0] !== 0 && step[1] !== 0;
    if ((diagonal && piece.type === 'r') || (!diagonal && piece.type === 'b')) continue;
    const inBetween = (between(square, king) ?? []).filter((s) => ctx.placement.has(s));
    const only = inBetween[0];
    if (inBetween.length !== 1 || !only) continue;
    if (ctx.placement.get(only)?.color === ctx.side) out.push({ pinned: only, by: square });
  }
  return out;
}

function pinnedPiece(ctx: Context): Draft[] {
  if (!ctx.king || ctx.inCheck) return [];
  const king = ctx.king;
  const out: Draft[] = [];
  for (const { pinned, by } of pins(ctx)) {
    const piece = ctx.placement.get(pinned);
    const pinner = ctx.placement.get(by);
    if (!piece || !pinner) continue;
    const line = new Set<Square>([by, ...(between(by, king) ?? [])]);
    for (const to of reach(ctx.placement, pinned)) {
      if (line.has(to) || ctx.placement.get(to)?.type === 'k') continue;
      // A promotion would add a question; a pawn reaching the end is left out.
      if (piece.type === 'p' && (rankOf(to) === 0 || rankOf(to) === 7)) continue;
      const draft = plainMove(
        ctx,
        pinned,
        to,
        `The ${ROLE_NAMES[piece.type]} on ${pinned} was pinned: ${named(pinner, by)} stands behind it on the line to the ${ctx.side === 'w' ? 'white' : 'black'} king on ${king}. Leaving that line puts the king in check.`,
      );
      if (draft) out.push({ ...draft, marks: [by], arrows: [[by, king]] });
    }
  }
  return out;
}

function kingIntoCheck(ctx: Context): Draft[] {
  if (!ctx.king || ctx.inCheck) return [];
  const from = ctx.king;
  const out: Draft[] = [];
  for (const to of kingSquares(from)) {
    if (!canLand(ctx.placement, to, ctx.side)) continue;
    const after = movePiece(ctx.placement, from, to);
    const by = attackers(after, to, ctx.enemy);
    const first = by[0];
    if (!first) continue;
    const attacker = after.get(first);
    if (!attacker) continue;
    const reason =
      attacker.type === 'k'
        ? `Kings can never stand next to each other: ${to} touches the other king on ${first}.`
        : `The king walked into check: ${to} is attacked by ${named(attacker, first)}.`;
    out.push({
      from,
      to,
      san: sanOf({ color: ctx.side, type: 'k' }, from, to, ctx.placement.has(to)),
      after,
      reason,
      marks: [first],
      arrows: [[first, to]],
    });
  }
  return out;
}

function ignoresCheck(ctx: Context): Draft[] {
  if (!ctx.king || !ctx.inCheck) return [];
  const king = ctx.king;
  const checkers = attackers(ctx.placement, king, ctx.enemy);
  const checker = checkers[0];
  const checking = checker ? ctx.placement.get(checker) : undefined;
  if (!checker || !checking) return [];
  const out: Draft[] = [];
  for (const [from, piece] of ctx.placement) {
    if (piece.color !== ctx.side || piece.type === 'k') continue;
    for (const to of reach(ctx.placement, from)) {
      if (ctx.placement.get(to)?.type === 'k') continue;
      if (piece.type === 'p' && (rankOf(to) === 0 || rankOf(to) === 7)) continue;
      const after = movePiece(ctx.placement, from, to);
      if (attackers(after, king, ctx.enemy).length === 0) continue;
      const draft = plainMove(
        ctx,
        from,
        to,
        `${COLOR_NAMES[ctx.side]} was in check from ${named(checking, checker)}, and a move must answer a check. This one left the king in check.`,
      );
      if (draft) out.push({ ...draft, marks: [checker], arrows: [[checker, king]] });
    }
  }
  return out;
}

function castleThroughCheck(ctx: Context): Draft[] {
  const rights = ctx.fen.split(' ')[2] ?? '-';
  const out: Draft[] = [];
  for (const shape of castleShapes(ctx.side)) {
    if (!rights.includes(shape.right) || !castleReady(ctx, shape)) continue;
    const [stand, cross, land] = shape.path;
    if (!stand || !cross || !land) continue;
    const hit = (square: Square) => attackers(ctx.placement, square, ctx.enemy)[0];
    const at = (square: Square) => {
      const by = hit(square);
      const piece = by ? ctx.placement.get(by) : undefined;
      return by && piece ? { by, piece } : null;
    };
    const inCheck = at(stand);
    const crossing = at(cross);
    const landing = at(land);
    let reason: string;
    let attack: { by: Square; target: Square };
    if (inCheck) {
      reason = `Castling out of check is not allowed: the king was in check from ${named(inCheck.piece, inCheck.by)}.`;
      attack = { by: inCheck.by, target: stand };
    } else if (crossing) {
      reason = `When castling, the king may not cross an attacked square, and ${cross} is attacked by ${named(crossing.piece, crossing.by)}.`;
      attack = { by: crossing.by, target: cross };
    } else if (landing) {
      reason = `Castling may not put the king in check, and ${land} is attacked by ${named(landing.piece, landing.by)}.`;
      attack = { by: landing.by, target: land };
    } else {
      continue;
    }
    out.push({
      from: shape.king,
      to: shape.kingTo,
      san: shape.san,
      after: castled(ctx, shape),
      reason,
      marks: [attack.by],
      arrows: [[attack.by, attack.target]],
    });
  }
  return out;
}

function lateEnPassant(ctx: Context): Draft[] {
  const out: Draft[] = [];
  const fifth = ctx.side === 'w' ? 4 : 3;
  const passed = enPassantTarget(ctx);
  for (const [from] of piecesOf(ctx.placement, ctx.side, ['p'])) {
    if (rankOf(from) !== fifth) continue;
    for (const df of [-1, 1]) {
      const beside = offset(from, df, 0);
      const to = offset(from, df, forwardOf(ctx.side));
      const victim = beside ? ctx.placement.get(beside) : undefined;
      if (!beside || !to || victim?.type !== 'p' || victim.color === ctx.side) continue;
      if (ctx.placement.has(to) || to === passed) continue;
      const after = movePiece(ctx.placement, from, to);
      after.delete(beside);
      out.push({
        from,
        to,
        san: `${from.charAt(0)}x${to}`,
        after,
        reason: `En passant is allowed only straight after the enemy pawn’s double step past it. The pawn on ${beside} did not just arrive with a double step, so it could not be taken this way.`,
        marks: [beside],
      });
    }
  }
  return out;
}

function movesTwice(ctx: Context): IllegalMove[] {
  const last = ctx.history[ctx.history.length - 1];
  if (!last || ctx.inCheck) return [];
  const parts = ctx.fen.split(' ');
  // The side that has just moved, to move again (no en passant: that belongs to the other side).
  const flipped = [parts[0], ctx.enemy, parts[2] ?? '-', '-', '0', '1'].join(' ');
  let moves: Move[];
  try {
    moves = new Chess(flipped).moves({ verbose: true });
  } catch {
    return [];
  }
  const plies = ctx.history.length;
  return moves
    .filter((m) => !m.isKingsideCastle() && !m.isQueensideCastle() && !m.promotion)
    .map((m) => ({
      kind: 'moves-twice' as const,
      from: m.from,
      to: m.to,
      san: m.san.replace(/[+#]$/, ''),
      color: ctx.enemy,
      fen: `${m.after.split(' ')[0] ?? ''} ${ctx.side} - - 0 1`,
      reason: `${COLOR_NAMES[ctx.enemy]} moved twice in a row: after ${moveLabel(plies - 1)}${last.san} it was ${COLOR_NAMES[ctx.side]}’s turn.`,
      marks: [last.to],
      arrows: [],
      hints: [],
    }));
}

const GENERATORS: Record<Exclude<IllegalKind, 'moves-twice'>, (ctx: Context) => Draft[]> = {
  'knight-shape': knightShape,
  'bishop-straight': bishopStraight,
  'rook-diagonal': rookDiagonal,
  'pawn-backwards': pawnBackwards,
  'pawn-straight-capture': pawnStraightCapture,
  'pawn-diagonal-step': pawnDiagonalStep,
  'king-two-squares': kingTwoSquares,
  'own-capture': ownCapture,
  'jumps-over': jumpsOver,
  'pawn-late-double': pawnLateDouble,
  'pawn-blocked-double': pawnBlockedDouble,
  'no-promotion': noPromotion,
  'pinned-piece': pinnedPiece,
  'king-into-check': kingIntoCheck,
  'ignores-check': ignoresCheck,
  'castle-through-check': castleThroughCheck,
  'late-en-passant': lateEnPassant,
};

/** Every move of `kind` the side to move could make illegally in this position. */
export function illegalMoves(position: ArbiterPosition, kind: IllegalKind): IllegalMove[] {
  const ctx = context(position);
  if (kind === 'moves-twice') return movesTwice(ctx);
  return GENERATORS[kind](ctx).map((draft) => finish(kind, ctx, draft));
}
