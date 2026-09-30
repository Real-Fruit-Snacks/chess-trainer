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

/** Number of pieces (excluding kings) each side has on the board. */
export function countMaterial(fen: Fen): { white: number; black: number; whitePawns: number } {
  const board = fen.split(' ')[0] ?? '';
  let white = 0;
  let black = 0;
  let whitePawns = 0;
  for (const ch of board) {
    if ('QRBNP'.includes(ch)) white++;
    if ('qrbnp'.includes(ch)) black++;
    if (ch === 'P') whitePawns++;
  }
  return { white, black, whitePawns };
}
