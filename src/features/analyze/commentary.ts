import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Fen, Uci } from '@/chess/types';
import type { Score } from '@/engine/uci';

/**
 * Plain-language explanations of judged moves, derived from the engine's
 * verdicts and a little tactical detection on the board: what the move hangs,
 * what it walks into, what it missed. Everything here is a pure function of
 * the position and the review data, so it runs offline and is easy to test.
 */

export type Motif =
  | 'missed-mate'
  | 'allows-mate'
  | 'hanging-piece'
  | 'loses-exchange'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered-attack'
  | 'missed-material'
  | 'missed-fork'
  | 'missed-mate-threat'
  | 'queen-trade'
  | 'passive'
  | 'generic';

export interface Explanation {
  motif: Motif;
  /** One or two sentences, e.g. "Hangs the knight on e5: Bxe5 wins it." */
  text: string;
  /** The move that punishes (or the move that should have been played). */
  keyMove: string | null;
}

export interface MoveContext {
  /** Position before the move. */
  fen: Fen;
  /** The move that was played (SAN). */
  san: string;
  judgement: 'inaccuracy' | 'mistake' | 'blunder' | 'best' | 'good';
  /** Engine's best move in `fen`, UCI, when different from the played move. */
  bestUci: Uci | null;
  /** Principal variation after the best move (starting with it), UCI. */
  bestPv?: Uci[];
  /** The opponent's best answer to the played move, UCI, with its line. */
  replyUci?: Uci | null;
  replyPv?: Uci[];
  /** Scores from the mover's point of view, before and after the move. */
  scoreBefore: Score | null;
  scoreAfter: Score | null;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function parseUci(uci: Uci) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] };
}

function tryMove(chess: Chess, uci: Uci): Move | null {
  try {
    return chess.move(parseUci(uci));
  } catch {
    return null;
  }
}

function sanOf(fen: Fen, uci: Uci | null | undefined): string | null {
  if (!uci) return null;
  const chess = new Chess(fen);
  return tryMove(chess, uci)?.san ?? null;
}

/** Squares from which `color` attacks `square`, least valuable piece first. */
function attackers(
  chess: Chess,
  square: Square,
  color: Color,
): { square: Square; type: PieceSymbol }[] {
  return chess
    .attackers(square, color)
    .map((sq) => ({ square: sq, type: chess.get(sq)?.type ?? 'p' }))
    .sort((a, b) => VALUE[a.type] - VALUE[b.type]);
}

/**
 * Static exchange evaluation: material won by `color` capturing on `square`
 * with the least valuable attacker each time, both sides recapturing while it
 * pays. Positive = the capture wins material for the first capturer.
 */
export function staticExchange(fen: Fen, square: Square, color: Color): number {
  const chess = new Chess(fen);
  const target = chess.get(square);
  // An en passant capture lands on an empty square: the pawn it wins stands beside it.
  const enPassant = !target && chess.turn() === color && fen.split(' ')[3] === square;
  if (!target && !enPassant) return 0;
  const gains: number[] = [];
  let side = color;
  let onSquare = target ? VALUE[target.type] : VALUE.p;
  for (let depth = 0; depth < 12; depth++) {
    const list = attackers(chess, square, side).filter((a) => {
      // Only pieces that can legally capture there (pins, checks).
      const probe = new Chess(chess.fen());
      try {
        probe.move({ from: a.square, to: square, promotion: 'q' });
        return true;
      } catch {
        return false;
      }
    });
    const attacker = list[0];
    if (!attacker) break;
    gains.push(onSquare);
    onSquare = VALUE[attacker.type];
    chess.move({ from: attacker.square, to: square, promotion: 'q' });
    side = side === 'w' ? 'b' : 'w';
  }
  // Minimax backwards: each side may stop capturing.
  let value = 0;
  for (let i = gains.length - 1; i >= 0; i--) {
    value = Math.max(0, (gains[i] ?? 0) - value);
  }
  return value;
}

/** Mover's pieces that `attacker` (on `square`) attacks, excluding pawns it merely touches. */
function targetsOf(
  chess: Chess,
  square: Square,
): { square: Square; type: PieceSymbol; defended: boolean }[] {
  const piece = chess.get(square);
  if (!piece) return [];
  const enemy: Color = piece.color === 'w' ? 'b' : 'w';
  const out: { square: Square; type: PieceSymbol; defended: boolean }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell?.color !== enemy) continue;
      if (!chess.attackers(cell.square, piece.color).includes(square)) continue;
      const defended = chess.attackers(cell.square, enemy).length > 0;
      out.push({ square: cell.square, type: cell.type, defended });
    }
  }
  return out;
}

const SLIDER_DIRS: Record<PieceSymbol, [number, number][]> = {
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  q: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  p: [],
  n: [],
  k: [],
};

/**
 * Attacks uncovered by a piece leaving `vacated`: for every slider of `color`
 * whose ray runs through the now-empty square, the first enemy piece beyond it.
 */
export function discoveredTargets(
  chess: Chess,
  vacated: Square,
  color: Color,
): { square: Square; type: PieceSymbol; defended: boolean; from: Square }[] {
  if (chess.get(vacated)) return [];
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const vf = vacated.charCodeAt(0) - 97;
  const vr = Number(vacated[1]) - 1;
  const out: { square: Square; type: PieceSymbol; defended: boolean; from: Square }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell?.color !== color || !SLIDER_DIRS[cell.type].length) continue;
      const sf = cell.square.charCodeAt(0) - 97;
      const sr = Number(cell.square[1]) - 1;
      const df = Math.sign(vf - sf);
      const dr = Math.sign(vr - sr);
      const onLine =
        (df === 0 || dr === 0 || Math.abs(vf - sf) === Math.abs(vr - sr)) &&
        SLIDER_DIRS[cell.type].some(([a, b]) => a === df && b === dr);
      if (!onLine) continue;
      // Walk from the slider towards and past the vacated square.
      let f = sf + df;
      let r = sr + dr;
      let passed = false;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const sq = `${String.fromCharCode(97 + f)}${r + 1}` as Square;
        if (sq === vacated) passed = true;
        const piece = chess.get(sq);
        if (piece) {
          if (passed && piece.color === enemy) {
            out.push({
              square: sq,
              type: piece.type,
              defended: chess.attackers(sq, enemy).length > 0,
              from: cell.square,
            });
          }
          break;
        }
        f += df;
        r += dr;
      }
    }
  }
  return out;
}

/** True when `square`'s attacker wins something from each of two or more targets. */
function forkTargets(chess: Chess, square: Square) {
  const piece = chess.get(square);
  if (!piece) return [];
  return targetsOf(chess, square).filter(
    (t) => t.type === 'k' || VALUE[t.type] > VALUE[piece.type] || !t.defended,
  );
}

const DIRS: Record<'r' | 'b', [number, number][]> = {
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};

/** Pins and skewers created by the slider on `square` against the enemy. */
function lineTactics(
  chess: Chess,
  square: Square,
): {
  kind: 'pin' | 'skewer';
  front: Square;
  back: Square;
  frontType: PieceSymbol;
  backType: PieceSymbol;
}[] {
  const piece = chess.get(square);
  if (!piece || !['r', 'b', 'q'].includes(piece.type)) return [];
  const dirs = [...(piece.type !== 'b' ? DIRS.r : []), ...(piece.type !== 'r' ? DIRS.b : [])];
  const enemy: Color = piece.color === 'w' ? 'b' : 'w';
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const out: {
    kind: 'pin' | 'skewer';
    front: Square;
    back: Square;
    frontType: PieceSymbol;
    backType: PieceSymbol;
  }[] = [];
  for (const [df, dr] of dirs) {
    let f = file + df;
    let r = rank + dr;
    let front: { square: Square; type: PieceSymbol } | null = null;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = `${String.fromCharCode(97 + f)}${r + 1}` as Square;
      const cell = chess.get(sq);
      if (cell) {
        if (cell.color !== enemy) break;
        if (!front) {
          front = { square: sq, type: cell.type };
        } else {
          const frontValue = VALUE[front.type];
          const backValue = VALUE[cell.type];
          if (cell.type === 'k' || backValue > frontValue) {
            out.push({
              kind: 'pin',
              front: front.square,
              back: sq,
              frontType: front.type,
              backType: cell.type,
            });
          } else if (frontValue > backValue && front.type !== 'p') {
            out.push({
              kind: 'skewer',
              front: front.square,
              back: sq,
              frontType: front.type,
              backType: cell.type,
            });
          }
          break;
        }
      }
      f += df;
      r += dr;
    }
  }
  return out;
}

/** Material gained by the side to move in `fen` over the first plies of `pv`, in pawns. */
export function materialSwing(fen: Fen, pv: readonly Uci[], plies = 4): number {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const count = (c: Chess) => {
    let total = 0;
    for (const row of c.board()) {
      for (const cell of row) {
        if (!cell || cell.type === 'k') continue;
        total += (cell.color === mover ? 1 : -1) * VALUE[cell.type];
      }
    }
    return total;
  };
  const before = count(chess);
  // Measure after an even number of plies, so the balance is read on the mover's turn.
  const usable = pv.slice(0, plies - (plies % 2));
  const line = usable.length % 2 === 1 ? usable.slice(0, -1) : usable;
  let played = 0;
  for (const uci of line) {
    if (!tryMove(chess, uci)) break;
    played += 1;
  }
  if (played === 0) return 0;
  if (played % 2 === 1) chess.undo();
  return count(chess) - before;
}

const mateIn = (score: Score | null) => (score?.type === 'mate' ? score.value : null);
const cp = (score: Score | null) =>
  score ? (score.type === 'mate' ? Math.sign(score.value) * 10_000 : score.value) : 0;

/**
 * Explains a judged move. Good moves get an explanation only when the scores
 * show a mate missed or allowed; otherwise one motif with its text, most
 * specific first.
 */
export function explainMove(ctx: MoveContext): Explanation | null {
  const before = new Chess(ctx.fen);
  const mover = before.turn();
  const enemy: Color = mover === 'w' ? 'b' : 'w';
  const played = (() => {
    try {
      return before.move(ctx.san);
    } catch {
      return null;
    }
  })();
  if (!played) return null;
  const after = before; // now the position after the move
  const bestSan = sanOf(ctx.fen, ctx.bestUci);
  const replySan = sanOf(after.fen(), ctx.replyUci ?? null);

  // 1. Mate missed or allowed.
  const mateBefore = mateIn(ctx.scoreBefore);
  const mateAfter = mateIn(ctx.scoreAfter);
  if (mateBefore !== null && mateBefore > 0 && !(mateAfter !== null && mateAfter > 0)) {
    return {
      motif: 'missed-mate',
      text: `Missed a forced mate in ${mateBefore}${bestSan ? `: ${bestSan} starts it` : ''}.`,
      keyMove: bestSan,
    };
  }
  if (mateAfter !== null && mateAfter < 0 && !(mateBefore !== null && mateBefore < 0)) {
    return {
      motif: 'allows-mate',
      text: `Allows a forced mate in ${-mateAfter}${replySan ? ` after ${replySan}` : ''}.`,
      keyMove: replySan,
    };
  }
  if (ctx.judgement === 'best' || ctx.judgement === 'good') return null;

  // 2. What the reply does to the position after the move.
  if (ctx.replyUci) {
    const reply = parseUci(ctx.replyUci);
    const replyPiece = after.get(reply.from);
    const probe = new Chess(after.fen());
    const replyMove = tryMove(probe, ctx.replyUci);
    if (replyMove && replyPiece) {
      // A capture that wins material.
      if (replyMove.captured) {
        const gain = staticExchange(after.fen(), reply.to, enemy);
        const lostType = replyMove.captured;
        if (gain >= 3 || (gain >= 1 && lostType === 'p' && ctx.judgement !== 'blunder')) {
          // An en passant capture takes the pawn beside its landing square.
          const lostSquare = replyMove.isEnPassant()
            ? (`${reply.to[0]}${reply.from[1]}` as Square)
            : reply.to;
          const movedHere = played.to === lostSquare;
          const defended = after.attackers(reply.to, mover).length > 0;
          if (gain >= VALUE[lostType] - 0.5) {
            return {
              motif: 'hanging-piece',
              text: movedHere
                ? `Puts the ${NAME[lostType]} where it can simply be taken: ${replyMove.san}.`
                : defended
                  ? `Leaves the ${NAME[lostType]} on ${lostSquare} insufficiently defended: ${replyMove.san} wins it.`
                  : `Leaves the ${NAME[lostType]} on ${lostSquare} hanging: ${replyMove.san} takes it for free.`,
              keyMove: replyMove.san,
            };
          }
          return {
            motif: 'loses-exchange',
            text: `Loses material: after ${replyMove.san} the exchanges on ${reply.to} cost about ${gain} pawn${gain === 1 ? '' : 's'}.`,
            keyMove: replyMove.san,
          };
        }
      }
      // A fork.
      const targets = forkTargets(probe, reply.to).filter((t) => t.square !== reply.to);
      if (targets.length >= 2) {
        const names = targets
          .slice(0, 2)
          .map((t) => (t.type === 'k' ? 'the king' : `the ${NAME[t.type]} on ${t.square}`));
        return {
          motif: 'fork',
          text: `Walks into a fork: ${replyMove.san} attacks ${names[0]} and ${names[1]} at once.`,
          keyMove: replyMove.san,
        };
      }
      // A pin or skewer.
      const lines = lineTactics(probe, reply.to);
      const pin = lines.find((l) => l.kind === 'pin');
      if (pin) {
        return {
          motif: 'pin',
          text: `Allows ${replyMove.san}, pinning the ${NAME[pin.frontType]} on ${pin.front} to the ${NAME[pin.backType]}.`,
          keyMove: replyMove.san,
        };
      }
      const skewer = lines.find((l) => l.kind === 'skewer');
      if (skewer) {
        return {
          motif: 'skewer',
          text: `Allows ${replyMove.san}, a skewer: the ${NAME[skewer.frontType]} on ${skewer.front} must move and the ${NAME[skewer.backType]} on ${skewer.back} falls.`,
          keyMove: replyMove.san,
        };
      }
      // A discovered attack: the reply moves a piece off a line, and a slider behind it
      // now hits something valuable (or gives check).
      const uncovered = discoveredTargets(probe, reply.from, enemy);
      const valuable = uncovered.filter(
        (t) => t.type !== 'k' && (VALUE[t.type] >= 5 || (!t.defended && t.type !== 'p')),
      );
      const discoveredCheck = uncovered.some((t) => t.type === 'k');
      if (valuable.length > 0 && (discoveredCheck || probe.inCheck() || !replyMove.captured)) {
        const target = valuable[0];
        return {
          motif: 'discovered-attack',
          text: `Allows ${replyMove.san}${discoveredCheck || probe.inCheck() ? ' with check' : ''}, uncovering an attack on the ${NAME[target?.type ?? 'q']}${target ? ` on ${target.square}` : ''}.`,
          keyMove: replyMove.san,
        };
      }
      // The reply's line wins material over the next few plies.
      if (ctx.replyPv && ctx.replyPv.length >= 2) {
        const swing = materialSwing(after.fen(), ctx.replyPv, 4);
        if (swing >= 2) {
          return {
            motif: 'loses-exchange',
            text: `Loses material: ${replyMove.san} and the following moves win about ${Math.round(swing)} pawn${Math.round(swing) === 1 ? '' : 's'}.`,
            keyMove: replyMove.san,
          };
        }
      }
    }
  }

  // 3. What the best move would have done.
  if (ctx.bestUci && bestSan) {
    const probe = new Chess(ctx.fen);
    const best = tryMove(probe, ctx.bestUci);
    if (best) {
      if (ctx.bestPv && ctx.bestPv.length >= 1) {
        const swing = materialSwing(ctx.fen, ctx.bestPv, 4);
        if (swing >= 2) {
          return {
            motif: 'missed-material',
            text: `Missed ${bestSan}, which wins about ${Math.round(swing)} pawn${Math.round(swing) === 1 ? '' : 's'} of material.`,
            keyMove: bestSan,
          };
        }
      }
      const targets = forkTargets(probe, best.to).filter((t) => t.square !== best.to);
      if (targets.length >= 2) {
        const names = targets
          .slice(0, 2)
          .map((t) => (t.type === 'k' ? 'the king' : `the ${NAME[t.type]}`));
        return {
          motif: 'missed-fork',
          text: `Missed a fork: ${bestSan} attacks ${names[0]} and ${names[1]} at once.`,
          keyMove: bestSan,
        };
      }
      if (best.captured && staticExchange(ctx.fen, best.to, mover) >= 3) {
        return {
          motif: 'missed-material',
          text: `Missed ${bestSan}, which wins the ${NAME[best.captured]} on ${best.to}.`,
          keyMove: bestSan,
        };
      }
    }
  }

  // 4. Trading down while ahead.
  if (
    played.captured === 'q' &&
    cp(ctx.scoreBefore) >= 150 &&
    cp(ctx.scoreAfter) < cp(ctx.scoreBefore) - 80
  ) {
    return {
      motif: 'queen-trade',
      text: `Trading queens lets the advantage slip${bestSan ? `; ${bestSan} keeps the pressure` : ''}.`,
      keyMove: bestSan,
    };
  }

  // 5. Generic, but still concrete: name the punishment or the better move.
  const dropped = Math.round((cp(ctx.scoreBefore) - cp(ctx.scoreAfter)) / 100);
  if (replySan) {
    return {
      motif: 'generic',
      text: `Loses ground: ${replySan} is the problem${bestSan ? `, and ${bestSan} would have avoided it` : ''}.`,
      keyMove: replySan,
    };
  }
  return {
    motif: 'passive',
    text: bestSan
      ? `Too slow: ${bestSan} was the move${dropped >= 1 ? ` (about ${dropped} pawn${dropped === 1 ? '' : 's'} better)` : ''}.`
      : 'Loses ground without a concrete reason the engine can name.',
    keyMove: bestSan,
  };
}

/** Explains a move from a game review. */
export function explainReviewedMove(move: {
  fen: Fen;
  san: string;
  judgement: 'inaccuracy' | 'mistake' | 'blunder' | 'best' | 'good' | null;
  bestUci: Uci | null;
  bestPv?: Uci[];
  replyUci?: Uci | null;
  replyPv?: Uci[];
  scoreBefore: Score | null;
  scoreAfter?: Score | null;
}): Explanation | null {
  if (!move.judgement) return null;
  return explainMove({
    fen: move.fen,
    san: move.san,
    judgement: move.judgement,
    bestUci: move.bestUci,
    bestPv: move.bestPv,
    replyUci: move.replyUci,
    replyPv: move.replyPv,
    scoreBefore: move.scoreBefore,
    scoreAfter: move.scoreAfter ?? null,
  });
}

/** Lessons and puzzle themes that teach the motif behind an explanation. */
export const MOTIF_HELP: Record<Motif, { lesson: string; theme: string | null }> = {
  'missed-mate': { lesson: 'mating-patterns', theme: 'mate' },
  'allows-mate': { lesson: 'basic-checkmates', theme: 'mateIn2' },
  'hanging-piece': { lesson: 'piece-values', theme: 'hangingPiece' },
  'loses-exchange': { lesson: 'trading-pieces', theme: 'advantage' },
  fork: { lesson: 'forks', theme: 'fork' },
  pin: { lesson: 'pins-and-skewers', theme: 'pin' },
  skewer: { lesson: 'pins-and-skewers', theme: 'skewer' },
  'discovered-attack': { lesson: 'discovered-attacks', theme: 'discoveredAttack' },
  'missed-material': { lesson: 'candidate-moves', theme: 'advantage' },
  'missed-fork': { lesson: 'forks', theme: 'fork' },
  'missed-mate-threat': { lesson: 'mating-patterns', theme: 'mate' },
  'queen-trade': { lesson: 'converting-an-extra-pawn', theme: 'endgame' },
  passive: { lesson: 'calculation-method', theme: null },
  generic: { lesson: 'analysing-your-games', theme: null },
};
