import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { Fen, LongColor } from '@/chess/types';

/**
 * A rules-based reading of a position: material, pawn structure, king safety,
 * files and piece placement, and the plans that follow from them. Nothing here
 * needs the engine; it is the checklist a coach runs through before looking at
 * concrete lines, phrased so that each finding links to the lesson about it.
 */
export type ReportTopic = 'material' | 'pawns' | 'king' | 'files' | 'pieces' | 'plan';

export interface ReportItem {
  topic: ReportTopic;
  text: string;
  /** Whose feature it is (a weakness or an asset), when it belongs to one side. */
  side: LongColor | null;
  /** Squares worth showing on the board. */
  squares: Square[];
  /** Lesson that teaches the idea. */
  lesson: string | null;
  /** True for a problem the side should fix (isolated pawn, loose piece, exposed king). */
  weakness: boolean;
}

export interface PawnStructure {
  isolated: Square[];
  doubled: Square[];
  backward: Square[];
  passed: Square[];
  /** Pawns on the a–d files and on the e–h files. */
  queenside: number;
  kingside: number;
}

export interface KingSafety {
  square: Square;
  where: 'kingside' | 'queenside' | 'centre';
  /** Own pawns on the three files around the king, one or two ranks ahead. */
  shield: number;
  /** Open or half-open files (for the opponent) touching the king's file. */
  openFilesNear: string[];
  rating: 'safe' | 'loose' | 'exposed';
}

export interface PositionReport {
  fen: Fen;
  /** Material in pawns, positive for White. */
  materialBalance: number;
  bishopPair: LongColor | null;
  pawns: Record<LongColor, PawnStructure>;
  kings: Record<LongColor, KingSafety>;
  openFiles: string[];
  halfOpen: Record<LongColor, string[]>;
  outposts: Record<LongColor, Square[]>;
  looseP: Record<LongColor, Square[]>;
  items: ReportItem[];
  /** Plans for each side, drawn from the findings. */
  plans: Record<LongColor, ReportItem[]>;
  /** A rough phase for the summary line. */
  phase: 'opening' | 'middlegame' | 'endgame';
}

const FILES = 'abcdefgh';
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const toLong = (c: Color): LongColor => (c === 'w' ? 'white' : 'black');
const toShort = (c: LongColor): Color => (c === 'white' ? 'w' : 'b');
const other = (c: LongColor): LongColor => (c === 'white' ? 'black' : 'white');

interface PieceAt {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

function pieces(chess: Chess): PieceAt[] {
  const out: PieceAt[] = [];
  for (const row of chess.board()) {
    for (const p of row) if (p) out.push({ square: p.square, type: p.type, color: p.color });
  }
  return out;
}

const fileOf = (sq: Square) => sq.charCodeAt(0) - 97;
const rankOf = (sq: Square) => Number(sq[1]);
const square = (file: number, rank: number): Square | null =>
  file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? (`${FILES[file]}${rank}` as Square) : null;
const isLight = (sq: Square) => (fileOf(sq) + rankOf(sq)) % 2 === 1;

/** Pawn structure for one side. */
export function pawnStructure(all: PieceAt[], color: LongColor): PawnStructure {
  const c = toShort(color);
  const own = all.filter((p) => p.type === 'p' && p.color === c).map((p) => p.square);
  const enemy = all.filter((p) => p.type === 'p' && p.color !== c).map((p) => p.square);
  const dir = color === 'white' ? 1 : -1;
  const ownFiles = new Set(own.map(fileOf));
  const byFile = new Map<number, number>();
  for (const sq of own) byFile.set(fileOf(sq), (byFile.get(fileOf(sq)) ?? 0) + 1);

  const isolated = own.filter(
    (sq) => !ownFiles.has(fileOf(sq) - 1) && !ownFiles.has(fileOf(sq) + 1),
  );
  const doubled = own.filter((sq) => (byFile.get(fileOf(sq)) ?? 0) > 1);
  const passed = own.filter((sq) => {
    const f = fileOf(sq);
    const r = rankOf(sq);
    return !enemy.some((e) => {
      const ef = fileOf(e);
      const er = rankOf(e);
      return Math.abs(ef - f) <= 1 && (color === 'white' ? er > r : er < r);
    });
  });
  const backward = own.filter((sq) => {
    if (isolated.includes(sq) || passed.includes(sq)) return false;
    const f = fileOf(sq);
    const r = rankOf(sq);
    // No friendly pawn beside or behind it on the neighbouring files...
    const supported = own.some((o) => {
      const of = fileOf(o);
      const or = rankOf(o);
      return Math.abs(of - f) === 1 && (color === 'white' ? or <= r : or >= r);
    });
    if (supported) return false;
    // ...and the square in front is watched by an enemy pawn, so it cannot advance safely.
    const front = square(f, r + dir);
    if (!front) return false;
    return enemy.some((e) => {
      const ef = fileOf(e);
      const er = rankOf(e);
      return Math.abs(ef - f) === 1 && er === rankOf(front) + dir;
    });
  });
  return {
    isolated,
    doubled,
    backward,
    passed,
    queenside: own.filter((sq) => fileOf(sq) <= 3).length,
    kingside: own.filter((sq) => fileOf(sq) >= 4).length,
  };
}

/** King safety for one side. */
export function kingSafety(
  all: PieceAt[],
  color: LongColor,
  openFiles: string[],
  halfOpenForOpponent: string[],
): KingSafety {
  const c = toShort(color);
  const king = all.find((p) => p.type === 'k' && p.color === c);
  const sq: Square = king?.square ?? (color === 'white' ? 'e1' : 'e8');
  const f = fileOf(sq);
  const where: KingSafety['where'] = f >= 5 ? 'kingside' : f <= 2 ? 'queenside' : 'centre';
  const dir = color === 'white' ? 1 : -1;
  const own = all.filter((p) => p.type === 'p' && p.color === c).map((p) => p.square);
  let shield = 0;
  for (const df of [-1, 0, 1]) {
    for (const dr of [1, 2]) {
      const s = square(f + df, rankOf(sq) + dr * dir);
      if (s && own.includes(s)) shield += 1;
    }
  }
  const near = [f - 1, f, f + 1]
    .filter((x) => x >= 0 && x < 8)
    .map((x) => FILES[x] ?? '')
    .filter((file) => openFiles.includes(file) || halfOpenForOpponent.includes(file));
  const rating: KingSafety['rating'] =
    shield >= 2 && near.length === 0
      ? 'safe'
      : shield === 0 || near.length >= 2
        ? 'exposed'
        : 'loose';
  return { square: sq, where, shield, openFilesNear: near, rating };
}

function phaseOf(all: PieceAt[], ply: number): PositionReport['phase'] {
  let material = 0;
  let queens = 0;
  for (const p of all) {
    if (p.type === 'q') queens += 1;
    if (p.type !== 'p' && p.type !== 'k') material += VALUE[p.type];
  }
  if (material <= 18 || (queens === 0 && material <= 26)) return 'endgame';
  return ply <= 20 ? 'opening' : 'middlegame';
}

const SIDE = (c: LongColor) => (c === 'white' ? 'White' : 'Black');

function listSquares(squares: Square[]): string {
  return squares.join(', ');
}

export function reportPosition(fen: Fen): PositionReport {
  const chess = new Chess(fen);
  const all = pieces(chess);
  const items: ReportItem[] = [];
  const plans: Record<LongColor, ReportItem[]> = { white: [], black: [] };
  const fullmove = Number(fen.split(' ')[5] ?? 1);
  const ply = (fullmove - 1) * 2 + (chess.turn() === 'b' ? 1 : 0) + 1;
  const phase = phaseOf(all, ply);

  // Material.
  let balance = 0;
  const counts: Record<LongColor, Record<PieceSymbol, number>> = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const p of all) {
    counts[toLong(p.color)][p.type] += 1;
    balance += (p.color === 'w' ? 1 : -1) * VALUE[p.type];
  }
  const bishopPair: LongColor | null =
    counts.white.b >= 2 && counts.black.b < 2
      ? 'white'
      : counts.black.b >= 2 && counts.white.b < 2
        ? 'black'
        : null;
  const ahead: LongColor | null = balance > 0 ? 'white' : balance < 0 ? 'black' : null;
  const diff = Math.abs(balance);
  const minorDiff = (c: LongColor) =>
    counts[c].n + counts[c].b - (counts[other(c)].n + counts[other(c)].b);
  if (!ahead) {
    items.push({
      topic: 'material',
      text: 'Material is level.',
      side: null,
      squares: [],
      lesson: 'piece-values',
      weakness: false,
    });
  } else {
    const exchangeUp =
      counts[ahead].r > counts[other(ahead)].r && minorDiff(ahead) < 0 && diff <= 2;
    const text = exchangeUp
      ? `${SIDE(ahead)} is up the exchange (a rook for a minor piece).`
      : diff >= 6
        ? `${SIDE(ahead)} is far ahead — about ${diff} points of material.`
        : diff >= 3 && minorDiff(ahead) > 0
          ? `${SIDE(ahead)} is a piece up.`
          : diff === 1
            ? `${SIDE(ahead)} is a pawn up.`
            : `${SIDE(ahead)} is ahead by about ${diff} points.`;
    items.push({
      topic: 'material',
      text,
      side: ahead,
      squares: [],
      lesson: diff >= 3 ? 'converting-advantages' : 'converting-an-extra-pawn',
      weakness: false,
    });
    plans[ahead].push({
      topic: 'plan',
      text:
        diff >= 3
          ? 'Ahead in material: trade pieces, not pawns, and keep everything defended.'
          : 'A pawn up: trade pieces, create a passed pawn and bring the king to it.',
      side: ahead,
      squares: [],
      lesson: diff >= 3 ? 'converting-advantages' : 'converting-an-extra-pawn',
      weakness: false,
    });
  }
  if (bishopPair) {
    items.push({
      topic: 'material',
      text: `${SIDE(bishopPair)} has the bishop pair.`,
      side: bishopPair,
      squares: all
        .filter((p) => p.type === 'b' && p.color === toShort(bishopPair))
        .map((p) => p.square),
      lesson: 'bishop-pair',
      weakness: false,
    });
    plans[bishopPair].push({
      topic: 'plan',
      text: 'The bishop pair wants an open board: trade pawns in the centre and keep the bishops.',
      side: bishopPair,
      squares: [],
      lesson: 'bishop-pair',
      weakness: false,
    });
  } else if (
    counts.white.b + counts.white.n === 1 &&
    counts.black.b + counts.black.n === 1 &&
    counts.white.b !== counts.black.b
  ) {
    const withBishop: LongColor = counts.white.b === 1 ? 'white' : 'black';
    items.push({
      topic: 'material',
      text: `Bishop against knight: ${SIDE(withBishop)} has the bishop.`,
      side: null,
      squares: [],
      lesson: 'bishop-vs-knight',
      weakness: false,
    });
  }

  // Files.
  const pawnsOnFile = (file: number, c: Color) =>
    all.some((p) => p.type === 'p' && p.color === c && fileOf(p.square) === file);
  const openFiles: string[] = [];
  const halfOpen: Record<LongColor, string[]> = { white: [], black: [] };
  for (let f = 0; f < 8; f++) {
    const w = pawnsOnFile(f, 'w');
    const b = pawnsOnFile(f, 'b');
    const name = FILES[f] ?? '';
    if (!w && !b) openFiles.push(name);
    else if (!w) halfOpen.white.push(name);
    else if (!b) halfOpen.black.push(name);
  }
  if (openFiles.length) {
    items.push({
      topic: 'files',
      text: `Open file${openFiles.length > 1 ? 's' : ''}: ${openFiles.join(', ')}.`,
      side: null,
      squares: [],
      lesson: 'planning-basics',
      weakness: false,
    });
    for (const c of ['white', 'black'] as const) {
      const rooks = all.filter((p) => p.type === 'r' && p.color === toShort(c));
      const onOpen = rooks.filter((r) => openFiles.includes(FILES[fileOf(r.square)] ?? ''));
      if (rooks.length && onOpen.length === 0) {
        plans[c].push({
          topic: 'plan',
          text: `Put a rook on the open ${openFiles[0]}-file before the opponent does.`,
          side: c,
          squares: rooks.map((r) => r.square),
          lesson: 'planning-basics',
          weakness: false,
        });
      }
    }
  }

  // Pawn structure.
  const pawns: Record<LongColor, PawnStructure> = {
    white: pawnStructure(all, 'white'),
    black: pawnStructure(all, 'black'),
  };
  for (const c of ['white', 'black'] as const) {
    const s = pawns[c];
    if (s.isolated.length) {
      const isQueenPawn = s.isolated.some((sq) => fileOf(sq) === 3);
      items.push({
        topic: 'pawns',
        text: `${SIDE(c)}: isolated pawn${s.isolated.length > 1 ? 's' : ''} on ${listSquares(s.isolated)}.`,
        side: c,
        squares: s.isolated,
        lesson: isQueenPawn ? 'isolated-queens-pawn' : 'pawn-structures',
        weakness: true,
      });
      if (isQueenPawn && phase !== 'endgame') {
        plans[c].push({
          topic: 'plan',
          text: 'The isolated d-pawn wants activity: pieces around it, a knight on e5 and a break with d5.',
          side: c,
          squares: s.isolated,
          lesson: 'isolated-queens-pawn',
          weakness: false,
        });
        plans[other(c)].push({
          topic: 'plan',
          text: 'Blockade the isolated pawn, trade minor pieces and win it in the endgame.',
          side: other(c),
          squares: s.isolated,
          lesson: 'isolated-queens-pawn',
          weakness: false,
        });
      }
    }
    if (s.doubled.length) {
      items.push({
        topic: 'pawns',
        text: `${SIDE(c)}: doubled pawns on ${listSquares(s.doubled)}.`,
        side: c,
        squares: s.doubled,
        lesson: 'pawn-structures',
        weakness: true,
      });
    }
    if (s.backward.length) {
      items.push({
        topic: 'pawns',
        text: `${SIDE(c)}: backward pawn${s.backward.length > 1 ? 's' : ''} on ${listSquares(s.backward)}.`,
        side: c,
        squares: s.backward,
        lesson: 'outposts-and-weak-squares',
        weakness: true,
      });
    }
    if (s.passed.length) {
      items.push({
        topic: 'pawns',
        text: `${SIDE(c)}: passed pawn${s.passed.length > 1 ? 's' : ''} on ${listSquares(s.passed)}.`,
        side: c,
        squares: s.passed,
        lesson: phase === 'endgame' ? 'king-and-pawn-endgames' : 'passed-pawns-in-the-middlegame',
        weakness: false,
      });
      plans[c].push({
        topic: 'plan',
        text: `Support and advance the passed pawn on ${s.passed[0]}; it ties the opponent's pieces down.`,
        side: c,
        squares: s.passed,
        lesson: 'passed-pawns-in-the-middlegame',
        weakness: false,
      });
      plans[other(c)].push({
        topic: 'plan',
        text: `Blockade the passed pawn on ${s.passed[0]} with a piece in front of it — a knight is ideal.`,
        side: other(c),
        squares: s.passed,
        lesson: 'passed-pawns-in-the-middlegame',
        weakness: false,
      });
    }
  }
  const wq = pawns.white.queenside - pawns.black.queenside;
  const wk = pawns.white.kingside - pawns.black.kingside;
  if (wq > 0 && wk < 0) {
    items.push({
      topic: 'pawns',
      text: `White has a queenside pawn majority (${pawns.white.queenside} v ${pawns.black.queenside}), Black a kingside one (${pawns.black.kingside} v ${pawns.white.kingside}).`,
      side: null,
      squares: [],
      lesson: 'pawn-structures',
      weakness: false,
    });
    plans.white.push({
      topic: 'plan',
      text: 'Advance the queenside majority to make a passed pawn.',
      side: 'white',
      squares: [],
      lesson: 'passed-pawns-in-the-middlegame',
      weakness: false,
    });
    plans.black.push({
      topic: 'plan',
      text: 'Advance the kingside majority to make a passed pawn — or attack there.',
      side: 'black',
      squares: [],
      lesson: 'passed-pawns-in-the-middlegame',
      weakness: false,
    });
  } else if (wq < 0 && wk > 0) {
    items.push({
      topic: 'pawns',
      text: `Black has a queenside pawn majority (${pawns.black.queenside} v ${pawns.white.queenside}), White a kingside one (${pawns.white.kingside} v ${pawns.black.kingside}).`,
      side: null,
      squares: [],
      lesson: 'pawn-structures',
      weakness: false,
    });
    plans.black.push({
      topic: 'plan',
      text: 'Advance the queenside majority to make a passed pawn.',
      side: 'black',
      squares: [],
      lesson: 'passed-pawns-in-the-middlegame',
      weakness: false,
    });
    plans.white.push({
      topic: 'plan',
      text: 'Advance the kingside majority to make a passed pawn — or attack there.',
      side: 'white',
      squares: [],
      lesson: 'passed-pawns-in-the-middlegame',
      weakness: false,
    });
  }

  // Kings.
  // Files with no pawns of the king's own colour are the ones an attack comes down.
  const kings: Record<LongColor, KingSafety> = {
    white: kingSafety(all, 'white', openFiles, halfOpen.white),
    black: kingSafety(all, 'black', openFiles, halfOpen.black),
  };
  const queensOn = counts.white.q > 0 && counts.black.q > 0;
  for (const c of ['white', 'black'] as const) {
    const k = kings[c];
    if (phase === 'endgame') continue;
    if (k.rating === 'exposed' || k.rating === 'loose') {
      const why =
        k.shield === 0
          ? 'no pawns in front of it'
          : k.openFilesNear.length
            ? `the ${k.openFilesNear.join(' and ')}-file${k.openFilesNear.length > 1 ? 's' : ''} open beside it`
            : 'a thin pawn cover';
      items.push({
        topic: 'king',
        text: `${SIDE(c)}'s king on ${k.square} is ${k.rating}: ${why}.`,
        side: c,
        squares: [k.square],
        lesson: k.where === 'centre' ? 'attacking-the-uncastled-king' : 'attacking-the-king',
        weakness: true,
      });
      if (queensOn) {
        plans[other(c)].push({
          topic: 'plan',
          text:
            k.where === 'centre'
              ? `${SIDE(c)}'s king is still in the centre: open lines before it castles.`
              : `Attack ${SIDE(c)}'s king: bring pieces to the ${k.where} and open a file there.`,
          side: other(c),
          squares: [k.square],
          lesson: k.where === 'centre' ? 'attacking-the-uncastled-king' : 'attacking-the-king',
          weakness: false,
        });
      }
    }
  }
  if (
    phase !== 'endgame' &&
    kings.white.where !== 'centre' &&
    kings.black.where !== 'centre' &&
    kings.white.where !== kings.black.where
  ) {
    items.push({
      topic: 'king',
      text: 'The kings are castled on opposite sides.',
      side: null,
      squares: [kings.white.square, kings.black.square],
      lesson: 'opposite-side-castling',
      weakness: false,
    });
    for (const c of ['white', 'black'] as const) {
      plans[c].push({
        topic: 'plan',
        text: 'Opposite-side castling: storm the enemy king with pawns, and be first.',
        side: c,
        squares: [],
        lesson: 'opposite-side-castling',
        weakness: false,
      });
    }
  }

  // Pieces: outposts, loose pieces, bad bishops.
  const outposts: Record<LongColor, Square[]> = { white: [], black: [] };
  const looseP: Record<LongColor, Square[]> = { white: [], black: [] };
  for (const c of ['white', 'black'] as const) {
    const cs = toShort(c);
    const enemyPawns = all.filter((p) => p.type === 'p' && p.color !== cs).map((p) => p.square);
    for (const p of all.filter((x) => x.color === cs)) {
      if (p.type === 'n' || p.type === 'b') {
        const r = rankOf(p.square);
        const inEnemyHalf = c === 'white' ? r >= 4 : r <= 5;
        const defendedByPawn = chess
          .attackers(p.square, cs)
          .some((a) => chess.get(a)?.type === 'p');
        const attackableByPawn = enemyPawns.some((e) => {
          const ef = fileOf(e);
          const er = rankOf(e);
          return Math.abs(ef - fileOf(p.square)) === 1 && (c === 'white' ? er > r : er < r);
        });
        if (inEnemyHalf && defendedByPawn && !attackableByPawn && p.type === 'n') {
          outposts[c].push(p.square);
        }
      }
      if (p.type !== 'k' && p.type !== 'p') {
        const defenders = chess.attackers(p.square, cs).length;
        const attacked = chess.attackers(p.square, cs === 'w' ? 'b' : 'w').length > 0;
        const homeRank = c === 'white' ? rankOf(p.square) <= 2 : rankOf(p.square) >= 7;
        // Undefended pieces matter once they are attacked or out in the open;
        // an untouched rook in the corner is not a finding.
        if (defenders === 0 && (attacked || (!homeRank && p.type !== 'q'))) {
          looseP[c].push(p.square);
        }
      }
    }
    if (outposts[c].length) {
      items.push({
        topic: 'pieces',
        text: `${SIDE(c)}'s knight on ${listSquares(outposts[c])} sits on an outpost.`,
        side: c,
        squares: outposts[c],
        lesson: 'outposts-and-weak-squares',
        weakness: false,
      });
    }
    if (looseP[c].length) {
      const attacked = looseP[c].filter(
        (sq) => chess.attackers(sq, cs === 'w' ? 'b' : 'w').length > 0,
      );
      items.push({
        topic: 'pieces',
        text: `${SIDE(c)} has undefended piece${looseP[c].length > 1 ? 's' : ''} on ${listSquares(looseP[c])}${attacked.length ? ` — ${listSquares(attacked)} under attack` : ''}.`,
        side: c,
        squares: looseP[c],
        lesson: 'piece-values',
        weakness: true,
      });
    }
    // Bad bishop: most own pawns on its colour and the centre blocked.
    for (const b of all.filter((x) => x.type === 'b' && x.color === cs)) {
      const light = isLight(b.square);
      const ownPawns = all.filter((x) => x.type === 'p' && x.color === cs).map((x) => x.square);
      const sameColour = ownPawns.filter((sq) => isLight(sq) === light).length;
      if (
        ownPawns.length >= 4 &&
        sameColour >= Math.ceil(ownPawns.length * 0.6) &&
        sameColour >= 4
      ) {
        items.push({
          topic: 'pieces',
          text: `${SIDE(c)}'s bishop on ${b.square} is a bad bishop: ${sameColour} of ${ownPawns.length} pawns stand on its colour.`,
          side: c,
          squares: [b.square],
          lesson: 'good-and-bad-bishops',
          weakness: true,
        });
        plans[c].push({
          topic: 'plan',
          text: `Trade the bad bishop on ${b.square}, or get the pawns off its colour.`,
          side: c,
          squares: [b.square],
          lesson: 'good-and-bad-bishops',
          weakness: false,
        });
      }
    }
  }

  if (phase === 'endgame') {
    for (const c of ['white', 'black'] as const) {
      plans[c].push({
        topic: 'plan',
        text: 'It is an endgame: the king is a fighting piece — centralise it.',
        side: c,
        squares: [kings[c].square],
        lesson: 'the-active-king',
        weakness: false,
      });
    }
  } else if (plans.white.length === 0 || plans.black.length === 0) {
    for (const c of ['white', 'black'] as const) {
      if (plans[c].length === 0) {
        plans[c].push({
          topic: 'plan',
          text: 'No structural target yet: improve your worst-placed piece and keep the king safe.',
          side: c,
          squares: [],
          lesson: 'planning-basics',
          weakness: false,
        });
      }
    }
  }

  return {
    fen,
    materialBalance: balance,
    bishopPair,
    pawns,
    kings,
    openFiles,
    halfOpen,
    outposts,
    looseP,
    items,
    plans,
    phase,
  };
}
