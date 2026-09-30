import type { Fen, LongColor } from '@/chess/types';

/**
 * mate — checkmate the lone king; promote — queen the pawn; hold — survive as
 * the defender; capture — win the opponent's last piece or pawn (then the rest
 * is elementary), or mate.
 */
export type DrillGoal = 'mate' | 'promote' | 'hold' | 'capture';

export interface EndgameDrill {
  id: string;
  title: string;
  group: 'Checkmates' | 'Pawn endgames' | 'Rook endgames' | 'Queen endgames' | 'Minor pieces';
  description: string;
  /** What the user is trying to do; drives adjudication. */
  goal: DrillGoal;
  /** Colour the user plays. */
  color: LongColor;
  /** Fixed starting positions (one is picked at random), or 'random' for generated ones. */
  positions: Fen[] | 'random';
  /** For 'random': the white pieces (besides the king) to place. */
  material?: string;
  /** Advice shown before starting. */
  tip: string;
  /** Moves allowed before the drill counts as failed (also bounded by the 50-move rule). */
  moveLimit: number;
  /** Rough difficulty for ordering. */
  difficulty: 1 | 2 | 3 | 4;
}

export const ENDGAME_DRILLS: readonly EndgameDrill[] = [
  {
    id: 'mate-kq',
    title: 'Queen vs king',
    group: 'Checkmates',
    description: 'Mate with king and queen against a lone king.',
    goal: 'mate',
    color: 'white',
    positions: 'random',
    material: 'Q',
    tip: 'Use the queen a knight’s move away from the king to shrink the box, then bring your king up. Watch out for stalemate!',
    moveLimit: 30,
    difficulty: 1,
  },
  {
    id: 'mate-kr',
    title: 'Rook vs king',
    group: 'Checkmates',
    description: 'Mate with king and rook against a lone king.',
    goal: 'mate',
    color: 'white',
    positions: 'random',
    material: 'R',
    tip: 'Cut the king off with the rook, take the opposition with your king, then check to push it back a rank.',
    moveLimit: 40,
    difficulty: 2,
  },
  {
    id: 'mate-kbb',
    title: 'Two bishops vs king',
    group: 'Checkmates',
    description: 'Mate with king and two bishops.',
    goal: 'mate',
    color: 'white',
    positions: 'random',
    material: 'BB',
    tip: 'Keep the bishops side by side to form a wall, drive the king to any corner, and use your king to take away escape squares.',
    moveLimit: 45,
    difficulty: 3,
  },
  {
    id: 'mate-kbn',
    title: 'Bishop and knight vs king',
    group: 'Checkmates',
    description: 'The hardest basic mate: king, bishop and knight.',
    goal: 'mate',
    color: 'white',
    positions: 'random',
    material: 'BN',
    tip: 'Mate only happens in a corner of the bishop’s colour. Drive the king to the edge, then to the right corner with the “W” knight manoeuvre.',
    moveLimit: 50,
    difficulty: 4,
  },
  {
    id: 'kp-promote',
    title: 'Promote the pawn',
    group: 'Pawn endgames',
    description: 'King and pawn against king — win by queening.',
    goal: 'promote',
    color: 'white',
    positions: [
      // King in front of the pawn with the opposition: winning.
      '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1',
      '8/3k4/8/3K4/8/3P4/8/8 w - - 0 1',
      '3k4/8/4K3/3P4/8/8/8/8 w - - 0 1',
      '8/3k4/8/2K5/3P4/8/8/8 w - - 0 1',
      '8/8/1k6/8/1K6/1P6/8/8 b - - 0 1',
      '4k3/8/5K2/4P3/8/8/8/8 w - - 0 1',
    ],
    tip: 'Keep your king in front of the pawn and take the opposition. Only push the pawn when the king cannot make progress.',
    moveLimit: 25,
    difficulty: 2,
  },
  {
    id: 'kp-hold',
    title: 'Hold the draw',
    group: 'Pawn endgames',
    description: 'Defend king versus king and pawn — stop the pawn from queening.',
    goal: 'hold',
    color: 'black',
    positions: [
      '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1',
      '8/8/3k4/8/3PK3/8/8/8 b - - 0 1',
      '8/8/8/8/5k2/8/5PK1/8 b - - 0 1',
      '8/3k4/8/3P4/3K4/8/8/8 b - - 0 1',
    ],
    tip: 'Stay in front of the pawn and take the opposition when the pawn is beside the enemy king. Rook pawns and a king in the corner are always a draw.',
    moveLimit: 30,
    difficulty: 2,
  },
  {
    id: 'lucena',
    title: 'Lucena position',
    group: 'Rook endgames',
    description: 'Rook and pawn on the seventh: win by building a bridge.',
    goal: 'promote',
    color: 'white',
    positions: ['4K3/4P1k1/8/8/8/8/r7/5R2 w - - 0 1', '3K4/3P2k1/8/8/8/8/r7/4R3 w - - 0 1'],
    tip: 'Cut the enemy king off, lift your rook to the fourth rank, step the king out, and use the rook as a bridge against the checks.',
    moveLimit: 30,
    difficulty: 3,
  },
  {
    id: 'philidor',
    title: 'Philidor position',
    group: 'Rook endgames',
    description: 'Defend rook versus rook and pawn with the third-rank defence.',
    goal: 'hold',
    color: 'black',
    positions: ['4k3/R7/1r6/4PK2/8/8/8/8 b - - 0 1', '3k4/R7/1r6/3PK3/8/8/8/8 b - - 0 1'],
    tip: 'Keep your rook on the third rank until the pawn advances, then swing it behind the pawn and check from a distance.',
    moveLimit: 30,
    difficulty: 3,
  },
  {
    id: 'vancura',
    title: 'Vancura position',
    group: 'Rook endgames',
    description: 'Draw against a rook pawn on the sixth with the rook in front of it.',
    goal: 'hold',
    color: 'black',
    positions: ['R7/6k1/P4r2/8/8/6K1/8/8 b - - 0 1', 'R7/5k2/P4r2/8/8/8/4K3/8 b - - 0 1'],
    tip: 'Keep your rook on the third rank (from White’s side the sixth), attacking the pawn from the side, and check the white king whenever it comes to support the pawn. Never let your king get cut off from g7/h7.',
    moveLimit: 30,
    difficulty: 4,
  },
  {
    id: 'bishop-pawn-hold',
    title: 'Wrong bishop: hold the draw',
    group: 'Minor pieces',
    description: 'Defend king against king, bishop and a rook pawn of the wrong colour.',
    goal: 'hold',
    color: 'black',
    positions: ['7k/8/6K1/7P/8/3B4/8/8 b - - 0 1', '6k1/8/5K2/7P/4B3/8/8/8 b - - 0 1'],
    tip: 'The bishop does not control h8, so a king in the corner can never be driven out. Stay on g8, h8, g7 or h7 and watch for stalemate tricks — they are all fine for you.',
    moveLimit: 30,
    difficulty: 2,
  },
  {
    id: 'mate-kbn-corner',
    title: 'Bishop and knight: wrong corner',
    group: 'Checkmates',
    description: 'The king is already in the corner — but the wrong one. Drive it across.',
    goal: 'mate',
    color: 'white',
    positions: ['k7/8/2K5/4N3/5B2/8/8/8 w - - 0 1', '7k/8/5K2/3N4/2B5/8/8/8 w - - 0 1'],
    tip: 'Mate only happens on the corner of the bishop’s colour. Use the knight’s “W” manoeuvre (knight to c7/b5-type squares) to herd the king along the edge to the right corner without letting it slip back to the centre.',
    moveLimit: 50,
    difficulty: 4,
  },
  {
    id: 'queen-vs-rook',
    title: 'Queen vs rook',
    group: 'Queen endgames',
    description: 'Win the rook from the Philidor position — the classic zugzwang technique.',
    goal: 'capture',
    color: 'white',
    positions: [
      '1k6/1r6/2K5/8/8/8/8/4Q3 w - - 0 1',
      '6k1/6r1/5K2/8/8/8/8/3Q4 w - - 0 1',
      '4Q3/8/8/8/8/2K5/1r6/1k6 w - - 0 1',
    ],
    tip: 'Keep the rook and king tied together: with the black king and rook on the same file or rank, a quiet queen move (a triangulation) forces the rook to leave its king, and then a check wins it.',
    moveLimit: 40,
    difficulty: 4,
  },
  {
    id: 'queen-vs-pawn',
    title: 'Queen vs pawn on the seventh',
    group: 'Queen endgames',
    description:
      'Stop a centre pawn one step from queening with the queen alone, then bring the king.',
    goal: 'capture',
    color: 'white',
    positions: ['K7/8/8/8/7Q/8/3kp3/8 w - - 0 1', 'K7/8/8/8/8/8/3pk3/2Q5 w - - 0 1'],
    tip: 'Check and pin until the black king is forced in front of its own pawn. Each time it blocks the pawn, step your king one square closer. Repeat until the pawn falls.',
    moveLimit: 30,
    difficulty: 3,
  },
];

export const DRILL_GROUPS: readonly EndgameDrill['group'][] = [
  'Checkmates',
  'Pawn endgames',
  'Rook endgames',
  'Queen endgames',
  'Minor pieces',
];

export function getDrill(id: string): EndgameDrill | undefined {
  return ENDGAME_DRILLS.find((d) => d.id === id);
}
