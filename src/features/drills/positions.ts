import { Chess, type Square } from 'chess.js';
import type { Fen } from '@/chess/types';

const FILES = 'abcdefgh';
const ALL_SQUARES: Square[] = [];
for (let r = 1; r <= 8; r++) for (const f of FILES) ALL_SQUARES.push(`${f}${r}` as Square);

function squareColor(square: Square): 0 | 1 {
  return ((FILES.indexOf(square[0] ?? 'a') + Number(square[1])) % 2) as 0 | 1;
}

function kingsAdjacent(a: Square, b: Square): boolean {
  const df = Math.abs(FILES.indexOf(a[0] ?? 'a') - FILES.indexOf(b[0] ?? 'a'));
  const dr = Math.abs(Number(a[1]) - Number(b[1]));
  return df <= 1 && dr <= 1;
}

/**
 * Builds a random, legal "mate the lone king" position: White king, Black
 * king and the given white pieces (e.g. "Q", "R", "BB", "BN"), White to move.
 * The black king is never in check, never adjacent to a white piece, and the
 * two bishops always stand on opposite colours.
 */
export function generateMatePosition(material: string, random: () => number = Math.random): Fen {
  for (let attempt = 0; attempt < 500; attempt++) {
    const free = [...ALL_SQUARES];
    const take = (): Square => {
      const index = Math.floor(random() * free.length);
      return free.splice(index, 1)[0] as Square;
    };
    const whiteKing = take();
    let blackKing = take();
    let guard = 0;
    while (kingsAdjacent(whiteKing, blackKing) && guard++ < 10) {
      free.push(blackKing);
      blackKing = take();
    }
    if (kingsAdjacent(whiteKing, blackKing)) continue;

    const pieces: { square: Square; piece: string }[] = [
      { square: whiteKing, piece: 'K' },
      { square: blackKing, piece: 'k' },
    ];
    let bishopColor: 0 | 1 | null = null;
    let ok = true;
    for (const piece of material.split('')) {
      let square = take();
      if (piece === 'B') {
        // Opposite colours for a bishop pair.
        let tries = 0;
        while (bishopColor !== null && squareColor(square) === bishopColor && tries++ < 20) {
          free.push(square);
          square = take();
        }
        if (bishopColor !== null && squareColor(square) === bishopColor) {
          ok = false;
          break;
        }
        bishopColor = squareColor(square);
      }
      if (kingsAdjacent(square, blackKing)) {
        ok = false;
        break;
      }
      pieces.push({ square, piece });
    }
    if (!ok) continue;

    const fen = toFen(pieces, 'w');
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      continue;
    }
    if (chess.isAttacked(blackKing, 'w')) continue; // Black may not be in check with White to move
    if (chess.isGameOver()) continue;
    return fen;
  }
  // Extremely unlikely fallback: a fixed sensible position.
  return material === 'Q'
    ? '8/8/8/3k4/8/8/4Q3/4K3 w - - 0 1'
    : material === 'R'
      ? '8/8/8/3k4/8/8/4R3/4K3 w - - 0 1'
      : material === 'BB'
        ? '8/8/8/3k4/8/8/2B1B3/4K3 w - - 0 1'
        : '8/8/8/3k4/8/8/2B1N3/4K3 w - - 0 1';
}

function toFen(pieces: { square: Square; piece: string }[], turn: 'w' | 'b'): Fen {
  const board = new Map(pieces.map((p) => [p.square, p.piece]));
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = board.get(`${file}${rank}` as Square);
      if (piece) {
        if (empty) row += String(empty);
        empty = 0;
        row += piece;
      } else empty++;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} - - 0 1`;
}

/**
 * Whether `color` still has material that can force mate against a lone king:
 * a queen, a rook, a pawn (it may promote), two bishops on opposite colours,
 * or bishop and knight. Two knights (or one minor piece) cannot. Used when a
 * mating drill loses a piece: two rooks down to one is still a win.
 */
export function canStillMate(fen: Fen, color: 'white' | 'black'): boolean {
  const chess = new Chess(fen);
  const own = chess
    .board()
    .flat()
    .filter((p) => p !== null && p.color === (color === 'white' ? 'w' : 'b') && p.type !== 'k');
  const has = (type: string) => own.some((p) => p?.type === type);
  if (has('q') || has('r') || has('p')) return true;
  const bishops = own.filter((p) => p?.type === 'b');
  const knights = own.filter((p) => p?.type === 'n');
  if (bishops.length >= 1 && knights.length >= 1) return true;
  if (bishops.length >= 2) {
    const colours = new Set(bishops.map((p) => (p ? squareColor(p.square) : 0)));
    return colours.size === 2;
  }
  return false;
}

/**
 * Whether the piece on `square` can be captured by the side to move. A
 * promotion is only a win once the new piece survives — or stands where nothing
 * can take it.
 */
export function isAttackedNow(fen: Fen, square: Square): boolean {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).some((m) => m.to === square && m.captured !== undefined);
}

export interface MaterialCount {
  white: number;
  black: number;
  whitePawns: number;
  blackPawns: number;
}

/** Number of pieces (excluding kings) and pawns each side has on the board. */
export function countMaterial(fen: Fen): MaterialCount {
  const board = fen.split(' ')[0] ?? '';
  const count: MaterialCount = { white: 0, black: 0, whitePawns: 0, blackPawns: 0 };
  for (const ch of board) {
    if ('QRBNP'.includes(ch)) count.white++;
    if ('qrbnp'.includes(ch)) count.black++;
    if (ch === 'P') count.whitePawns++;
    if (ch === 'p') count.blackPawns++;
  }
  return count;
}

/** The same counts seen from one side: own material and the opponent's. */
export function materialFor(
  count: MaterialCount,
  color: 'white' | 'black',
): { own: number; ownPawns: number; opp: number; oppPawns: number } {
  return color === 'white'
    ? { own: count.white, ownPawns: count.whitePawns, opp: count.black, oppPawns: count.blackPawns }
    : {
        own: count.black,
        ownPawns: count.blackPawns,
        opp: count.white,
        oppPawns: count.whitePawns,
      };
}
