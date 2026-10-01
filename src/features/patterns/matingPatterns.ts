import { Chess } from 'chess.js';
import { toUci } from '@/chess/helpers';
import type { Fen, San } from '@/chess/types';
import type { Puzzle } from '@/features/puzzles/puzzleService';

/**
 * The named mating patterns, each with a minimal diagram (White to move and
 * mate) and the defender's move that led to it, so every pattern doubles as a
 * puzzle: the setup move is played, then the learner finds the mate. The
 * ids are the Lichess puzzle themes, which link each pattern to the library.
 */
export interface MatingPattern {
  /** Lichess theme tag, e.g. `bodenMate`. */
  id: string;
  name: string;
  /** The pieces that deliver it. */
  pieces: string;
  /** Position with the defender to move; `setup` leads to the diagram. */
  before: Fen;
  /** The defender's move (SAN) that reaches the diagram. */
  setup: San;
  /** The mating line from the diagram, attacker first (SAN). */
  line: San[];
  /** How the mate works. */
  explanation: string;
  /** What to look for in your own games. */
  spot: string;
  difficulty: 1 | 2 | 3;
}

export const MATING_PATTERNS: readonly MatingPattern[] = [
  {
    id: 'backRankMate',
    name: 'Back-rank mate',
    pieces: 'Rook or queen',
    before: '6k1/pp3ppp/8/8/8/8/P7/4R1K1 b - - 0 1',
    setup: 'a6',
    line: ['Re8#'],
    explanation:
      'The king is shut in by its own pawns on f7, g7 and h7, so a rook or queen arriving on the back rank with check is mate — nothing can block and the king has no square.',
    spot: 'A castled king that has not made a “luft” (moved a pawn to give the king a hole) and a back rank guarded by only one piece — or none.',
    difficulty: 1,
  },
  {
    id: 'smotheredMate',
    name: 'Smothered mate',
    pieces: 'Knight (after a queen sacrifice)',
    before: '5rk1/6pp/7N/8/8/1Q6/8/6K1 b - - 0 1',
    setup: 'Kh8',
    line: ['Qg8+', 'Rxg8', 'Nf7#'],
    explanation:
      'Philidor’s legacy: the queen is thrown in on g8 with check. The rook has to take it — the knight on h6 keeps the king off g8 — and now the king is buried under its own pieces, so the knight check from f7 is mate.',
    spot: 'A king in the corner with its own pawns on g7/h7 and a rook next to it, a knight that can reach f7 (or f2) with check, and a queen that can force the rook onto g8.',
    difficulty: 2,
  },
  {
    id: 'anastasiaMate',
    name: 'Anastasia’s mate',
    pieces: 'Knight and rook',
    before: '7k/4NppQ/8/8/8/8/5K2/R7 b - - 0 1',
    setup: 'Kxh7',
    line: ['Rh1#'],
    explanation:
      'The knight on e7 takes away g8 and g6, the king’s own pawn blocks g7, and a rook arriving on the h-file finishes the job. The queen sacrifice on h7 only served to drag the king onto the file.',
    spot: 'A knight that can land on e7 (or e2) next to a castled king, an open h-file — or a queen sacrifice on h7 that opens it — and a rook ready to swing across.',
    difficulty: 2,
  },
  {
    id: 'arabianMate',
    name: 'Arabian mate',
    pieces: 'Knight and rook',
    before: '5rk1/1R6/5N2/8/8/8/8/6K1 b - - 0 1',
    setup: 'Kh8',
    line: ['Rh7#'],
    explanation:
      'The knight on f6 guards both g8 and h7 from a knight’s move away; the rook slides to h7, protected by the knight, and the king in the corner has nowhere to go.',
    spot: 'A king driven into the corner with a knight on f6 (or f3, c6, c3) nearby, and a rook that can reach the seventh rank or the rook file next to it.',
    difficulty: 1,
  },
  {
    id: 'bodenMate',
    name: 'Boden’s mate',
    pieces: 'Two bishops',
    before: '2kr4/1p1p4/2Q5/8/5B2/3B4/8/6K1 b - - 0 1',
    setup: 'bxc6',
    line: ['Ba6#'],
    explanation:
      'Two bishops on criss-crossing diagonals: after the queen sacrifice on c6 pulls the b-pawn away, the bishop on a6 gives check while the bishop on f4 covers b8 and c7. The rook and pawn on d8/d7 block the rest.',
    spot: 'A queenside-castled king with its own pieces on d8 and d7, bishops aimed at c8 and c7, and a way to remove the pawn on b7 — often a queen sacrifice on c6.',
    difficulty: 2,
  },
  {
    id: 'doubleBishopMate',
    name: 'Double bishop mate',
    pieces: 'Two bishops',
    before: '6k1/7p/4B3/8/5B2/8/8/5RK1 b - - 0 1',
    setup: 'Kh8',
    line: ['Be5#'],
    explanation:
      'Two bishops on neighbouring diagonals: one checks along the long diagonal, the other covers the escape square g8. The king’s own pawn on h7 does the rest.',
    spot: 'A king in the corner without its fianchetto bishop, and both your bishops aimed at the kingside — the long diagonal and the a2–g8 diagonal.',
    difficulty: 1,
  },
  {
    id: 'dovetailMate',
    name: 'Dovetail mate',
    pieces: 'Queen (protected)',
    before: '8/4p3/3kNp2/8/2P5/8/8/3Q2K1 b - - 0 1',
    setup: 'Kxe6',
    line: ['Qd5#'],
    explanation:
      'The queen mates diagonally next to the king, protected by the pawn on c4. Two of the king’s flight squares (e7 and f6) are taken by its own pieces — the “dovetail” — and the queen covers every other one.',
    spot: 'A king in the open with two of its own pieces sitting diagonally behind it, and a protected square next to it that your queen can reach.',
    difficulty: 2,
  },
  {
    id: 'epauletteMate',
    name: 'Epaulette mate',
    pieces: 'Queen',
    before: '3rk3/5r2/8/8/8/8/Q7/6K1 b - - 0 1',
    setup: 'Rf8',
    line: ['Qe6#'],
    explanation:
      'The king wears its own rooks like epaulettes: d8 and f8 are blocked, and the queen two squares in front covers d7, e7 and f7. No piece can capture the queen or block the file.',
    spot: 'A king on the back rank hemmed in by its own rooks (or other pieces) on both sides, and a queen that can safely land two squares in front of it.',
    difficulty: 1,
  },
  {
    id: 'hookMate',
    name: 'Hook mate',
    pieces: 'Rook, knight and pawn',
    before: '3rk3/R6n/8/3N4/2P5/8/8/6K1 b - - 0 1',
    setup: 'Nf8',
    line: ['Re7#'],
    explanation:
      'The rook checks from next to the king, protected by the knight, which is protected in turn by the pawn — the three form a hook. The rook covers d7 and f7, and the king’s own pieces fill d8 and f8.',
    spot: 'A knight on d5 or f5 supported by a pawn, a rook that can reach the seventh rank next to the king, and flight squares on the back rank occupied by the defender’s own pieces.',
    difficulty: 2,
  },
  {
    id: 'killBoxMate',
    name: 'Kill box mate',
    pieces: 'Rook and queen',
    before: 'R1k5/3Np3/1Q6/8/8/8/8/6K1 b - - 0 1',
    setup: 'Kxd7',
    line: ['Rd8#'],
    explanation:
      'The rook checks next to the king while the queen, two squares away on the diagonal, protects it and seals the box: c6, c7, d6 and e6 are all covered, the king’s own pawn blocks e7.',
    spot: 'A king in the open with your queen and rook two diagonal squares apart, so together they control a three-by-three box around it.',
    difficulty: 2,
  },
  {
    id: 'morphysMate',
    name: 'Morphy’s mate',
    pieces: 'Bishop and rook',
    before: '6k1/7p/8/8/5B2/8/8/6RK b - - 0 1',
    setup: 'Kh8',
    line: ['Be5#'],
    explanation:
      'The rook on the open g-file keeps the king in the corner; the bishop delivers mate on the long diagonal, and the pawn on h7 blocks the last exit.',
    spot: 'An open g-file in front of a castled king, a bishop that can reach the long diagonal, and no fianchetto pawn on g7 to block it.',
    difficulty: 1,
  },
  {
    id: 'operaMate',
    name: 'Opera mate',
    pieces: 'Rook and bishop',
    before: '1Q2k3/3n1ppp/8/6B1/8/8/8/3R2K1 b - - 0 1',
    setup: 'Nxb8',
    line: ['Rd8#'],
    explanation:
      'From Morphy’s game at the Paris opera: the queen is sacrificed on b8 to deflect the knight, and the rook mates on the back rank, protected by the bishop on g5, which also covers e7.',
    spot: 'An uncastled king on e8 with pawns on f7 (and a bishop of yours on g5), an open d-file for a rook, and a defender that can be deflected from d7 or d8.',
    difficulty: 2,
  },
  {
    id: 'pillsburysMate',
    name: 'Pillsbury’s mate',
    pieces: 'Rook and bishop',
    before: '7k/1p5p/7B/8/8/8/8/R5K1 b - - 0 1',
    setup: 'b6',
    line: ['Ra8#'],
    explanation:
      'The mirror of Morphy’s mate: here the rook delivers mate along the back rank while the bishop on h6 takes away g7 (and f8). The pawn on h7 blocks the last square.',
    spot: 'A bishop lodged on h6 next to a castled king whose g-pawn is gone, and a rook that can reach the back rank or the open g-file.',
    difficulty: 1,
  },
  {
    id: 'cornerMate',
    name: 'Corner mate',
    pieces: 'Knight and rook',
    before: '6k1/7p/8/6N1/8/8/8/6RK b - - 0 1',
    setup: 'Kh8',
    line: ['Nf7#'],
    explanation:
      'The rook on the g-file takes the king’s two escape squares, its own pawn on h7 takes the third, and the knight check from f7 needs no support — a knight cannot be blocked.',
    spot: 'A king pushed into the corner by a rook on the open g-file, and a knight within reach of f7 (or f2, c7, c2).',
    difficulty: 1,
  },
  {
    id: 'balestraMate',
    name: 'Balestra mate',
    pieces: 'Queen and bishop',
    before: '6k1/2B5/6Q1/8/8/8/8/6K1 b - - 0 1',
    setup: 'Kf8',
    line: ['Bd6#'],
    explanation:
      'A crossbow (balestra): the bishop gives the check while the queen, from a distance, covers every square around the king — e8, f7, g7 and g8.',
    spot: 'A queen close to an exposed king that controls its flight squares, and a bishop that can give check from the other side.',
    difficulty: 2,
  },
  {
    id: 'triangleMate',
    name: 'Triangle mate',
    pieces: 'Queen and rook',
    before: '6k1/4R3/8/6Q1/8/8/8/6K1 b - - 0 1',
    setup: 'Kf8',
    line: ['Qg7#'],
    explanation:
      'The queen mates diagonally next to the king, protected by the rook two squares away on the same rank; king, queen and rook form a triangle and the rook also covers the e-file.',
    spot: 'A rook on the seventh rank and a queen nearby against a king on the back rank, with the queen able to land on a square the rook protects.',
    difficulty: 1,
  },
  {
    id: 'swallowstailMate',
    name: 'Swallow’s tail mate',
    pieces: 'Queen (protected)',
    before: '8/8/2p1p3/2kN4/7Q/2B5/8/6K1 b - - 0 1',
    setup: 'Kxd5',
    line: ['Qd4#'],
    explanation:
      'Also called the guéridon: the queen checks from directly in front of the king, protected by the bishop, and the two diagonal squares behind the king are blocked by its own pawns — the swallow’s tail.',
    spot: 'A king in the open with two of its own pieces on the diagonal squares behind it, and a protected square right in front of it for your queen.',
    difficulty: 2,
  },
  {
    id: 'blindSwineMate',
    name: 'Blind swine mate',
    pieces: 'Two rooks',
    before: '5r1k/1R5R/8/8/8/8/8/6K1 b - - 0 1',
    setup: 'Kg8',
    line: ['Rbg7#'],
    explanation:
      'Two rooks on the seventh rank — Dawid Janowski’s “blind pigs” — devour everything: one checks on the g-file while the other covers h7 and h8, and the king’s own rook takes f8.',
    spot: 'Both rooks on (or reaching) the seventh rank against a king on the back rank whose escape squares are blocked by its own pieces.',
    difficulty: 1,
  },
  {
    id: 'vukovicMate',
    name: 'Vuković mate',
    pieces: 'Rook, knight and pawn',
    before: '8/6pk/5N2/7P/8/8/8/K5R1 b - - 0 1',
    setup: 'Kh6',
    line: ['Rg6#'],
    explanation:
      'The rook checks from next to the king on the edge, protected by the pawn, while the knight covers the two squares along the edge (h7 and h5). The king’s own pawn on g7 blocks the last one.',
    spot: 'A king on the edge with a knight two files away covering the squares beside it, and a rook that can land next to the king on a protected square.',
    difficulty: 2,
  },
];

/** The diagram: the position after the setup move (White to move and mate). */
export function patternDiagram(pattern: MatingPattern): Fen {
  const chess = new Chess(pattern.before);
  chess.move(pattern.setup);
  return chess.fen();
}

/** The pattern as a puzzle for the trainer: setup move first, then the mate. */
export function patternPuzzle(pattern: MatingPattern): Puzzle {
  const chess = new Chess(pattern.before);
  const moves = [pattern.setup, ...pattern.line].map((san) => toUci(chess.move(san)));
  return {
    id: `pattern:${pattern.id}`,
    fen: pattern.before,
    moves: moves.join(' '),
    rating: 800 + pattern.difficulty * 200,
    rd: 0,
    popularity: 100,
    plays: 0,
    themes: `${pattern.id} mate mateIn${pattern.line.length === 1 ? 1 : Math.ceil(pattern.line.length / 2)}`,
    url: '',
  };
}

/** Progress key for a pattern's drill result. */
export function patternDrillId(pattern: MatingPattern): string {
  return `pattern-${pattern.id}`;
}
