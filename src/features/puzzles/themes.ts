/**
 * Human-readable names and one-line explanations for Lichess puzzle themes.
 * Themes not listed here are shown with their tag de-camel-cased.
 */
export interface ThemeInfo {
  name: string;
  description: string;
  /** Grouping for the practice page. */
  group: 'Motifs' | 'Mates' | 'Phases' | 'Goals' | 'Special moves' | 'Length' | 'Origin';
}

export const THEMES: Record<string, ThemeInfo> = {
  // Motifs
  fork: {
    name: 'Fork',
    description: 'One piece attacks two or more enemy pieces at once.',
    group: 'Motifs',
  },
  pin: {
    name: 'Pin',
    description: 'A piece cannot move without exposing a more valuable piece behind it.',
    group: 'Motifs',
  },
  skewer: {
    name: 'Skewer',
    description: 'A valuable piece is attacked and must move, exposing a piece behind it.',
    group: 'Motifs',
  },
  discoveredAttack: {
    name: 'Discovered attack',
    description: 'Moving one piece uncovers an attack from another.',
    group: 'Motifs',
  },
  doubleCheck: {
    name: 'Double check',
    description: 'Two pieces give check at once — the king has to move.',
    group: 'Motifs',
  },
  sacrifice: {
    name: 'Sacrifice',
    description: 'Give up material to gain a decisive advantage.',
    group: 'Motifs',
  },
  hangingPiece: {
    name: 'Hanging piece',
    description: 'An undefended piece can simply be taken.',
    group: 'Motifs',
  },
  trappedPiece: {
    name: 'Trapped piece',
    description: 'A piece has no safe squares and can be won.',
    group: 'Motifs',
  },
  attraction: {
    name: 'Attraction',
    description: 'Lure an enemy piece — often the king — onto a fatal square.',
    group: 'Motifs',
  },
  deflection: {
    name: 'Deflection',
    description: 'Drag a defender away from the square it must guard.',
    group: 'Motifs',
  },
  clearance: {
    name: 'Clearance',
    description: 'Move a piece out of the way, often with tempo, to free a square or line.',
    group: 'Motifs',
  },
  interference: {
    name: 'Interference',
    description: 'Put a piece between two enemy pieces to cut their coordination.',
    group: 'Motifs',
  },
  intermezzo: {
    name: 'Intermezzo',
    description: 'Instead of the expected recapture, play an in-between move with a bigger threat.',
    group: 'Motifs',
  },
  quietMove: {
    name: 'Quiet move',
    description: 'No check, no capture — but an unstoppable threat.',
    group: 'Motifs',
  },
  zugzwang: {
    name: 'Zugzwang',
    description: 'Every move the opponent has makes their position worse.',
    group: 'Motifs',
  },
  xRayAttack: {
    name: 'X-ray attack',
    description: 'A piece attacks or defends through an enemy piece.',
    group: 'Motifs',
  },
  exposedKing: {
    name: 'Exposed king',
    description: 'A king without pawn cover invites a mating attack.',
    group: 'Motifs',
  },
  kingsideAttack: {
    name: 'Kingside attack',
    description: 'Break through against a king castled short.',
    group: 'Motifs',
  },
  queensideAttack: {
    name: 'Queenside attack',
    description: 'Break through against a king castled long.',
    group: 'Motifs',
  },
  attackingF2F7: {
    name: 'Attacking f2/f7',
    description: 'Target the weakest square next to an uncastled king.',
    group: 'Motifs',
  },
  capturingDefender: {
    name: 'Capturing the defender',
    description: 'Remove the piece guarding a key square or piece.',
    group: 'Motifs',
  },
  defensiveMove: {
    name: 'Defensive move',
    description: 'Find the only move that holds the position.',
    group: 'Motifs',
  },
  advancedPawn: {
    name: 'Advanced pawn',
    description: 'A far-advanced pawn becomes a decisive threat.',
    group: 'Motifs',
  },

  // Mates
  mate: { name: 'Checkmate', description: 'Finish the game.', group: 'Mates' },
  mateIn1: { name: 'Mate in 1', description: 'Deliver checkmate immediately.', group: 'Mates' },
  mateIn2: { name: 'Mate in 2', description: 'Force checkmate in two moves.', group: 'Mates' },
  mateIn3: { name: 'Mate in 3', description: 'Force checkmate in three moves.', group: 'Mates' },
  mateIn4: { name: 'Mate in 4', description: 'Force checkmate in four moves.', group: 'Mates' },
  mateIn5: { name: 'Mate in 5+', description: 'A longer forced mate.', group: 'Mates' },
  backRankMate: {
    name: 'Back-rank mate',
    description: 'The king is trapped on its own back rank by its pawns.',
    group: 'Mates',
  },
  smotheredMate: {
    name: 'Smothered mate',
    description: 'A knight mates a king boxed in by its own pieces.',
    group: 'Mates',
  },
  anastasiaMate: {
    name: "Anastasia's mate",
    description: 'Knight and rook trap the king against the side of the board.',
    group: 'Mates',
  },
  arabianMate: {
    name: 'Arabian mate',
    description: 'Knight and rook cooperate to mate a king in the corner.',
    group: 'Mates',
  },
  bodenMate: {
    name: "Boden's mate",
    description: 'Two bishops on criss-crossing diagonals mate a castled king.',
    group: 'Mates',
  },
  doubleBishopMate: {
    name: 'Double bishop mate',
    description: 'Two bishops on adjacent diagonals deliver mate.',
    group: 'Mates',
  },
  dovetailMate: {
    name: 'Dovetail mate',
    description: 'A queen mates a king whose escape squares are blocked by its own pieces.',
    group: 'Mates',
  },
  hookMate: {
    name: 'Hook mate',
    description: 'Rook, knight and pawn combine in a hook-shaped pattern.',
    group: 'Mates',
  },
  killBoxMate: {
    name: 'Kill box mate',
    description: 'A rook, supported by a queen, mates in a 3×3 box.',
    group: 'Mates',
  },
  vukovicMate: {
    name: 'Vukovic mate',
    description: 'Rook and knight mate a king on the edge, the knight guarding the rook.',
    group: 'Mates',
  },

  // Special moves
  promotion: {
    name: 'Promotion',
    description: 'Push a pawn to the last rank.',
    group: 'Special moves',
  },
  underPromotion: {
    name: 'Underpromotion',
    description: 'Promote to something other than a queen.',
    group: 'Special moves',
  },
  castling: { name: 'Castling', description: 'Castling is the key move.', group: 'Special moves' },
  enPassant: {
    name: 'En passant',
    description: 'The special pawn capture decides the position.',
    group: 'Special moves',
  },

  // Phases
  opening: {
    name: 'Opening',
    description: 'Puzzles from the first moves of the game.',
    group: 'Phases',
  },
  middlegame: {
    name: 'Middlegame',
    description: 'Puzzles with most pieces still on the board.',
    group: 'Phases',
  },
  endgame: {
    name: 'Endgame',
    description: 'Few pieces left — precision matters.',
    group: 'Phases',
  },
  rookEndgame: { name: 'Rook endgame', description: 'Rooks and pawns only.', group: 'Phases' },
  pawnEndgame: { name: 'Pawn endgame', description: 'Kings and pawns only.', group: 'Phases' },
  queenEndgame: { name: 'Queen endgame', description: 'Queens and pawns only.', group: 'Phases' },
  bishopEndgame: {
    name: 'Bishop endgame',
    description: 'Bishops and pawns only.',
    group: 'Phases',
  },
  knightEndgame: {
    name: 'Knight endgame',
    description: 'Knights and pawns only.',
    group: 'Phases',
  },
  queenRookEndgame: {
    name: 'Queen and rook endgame',
    description: 'Queens, rooks and pawns.',
    group: 'Phases',
  },

  // Goals
  equality: {
    name: 'Equality',
    description: 'Come back from a losing position to equality.',
    group: 'Goals',
  },
  advantage: { name: 'Advantage', description: 'Seize a decisive advantage.', group: 'Goals' },
  crushing: {
    name: 'Crushing',
    description: 'Spot the opponent’s blunder to win big material.',
    group: 'Goals',
  },

  // Length
  oneMove: { name: 'One move', description: 'A single move solves it.', group: 'Length' },
  short: { name: 'Short', description: 'Two moves to solve.', group: 'Length' },
  long: { name: 'Long', description: 'Three moves to solve.', group: 'Length' },
  veryLong: { name: 'Very long', description: 'Four or more moves to solve.', group: 'Length' },

  // Origin
  master: {
    name: 'Master game',
    description: 'From a game with a titled player.',
    group: 'Origin',
  },
  masterVsMaster: {
    name: 'Master vs master',
    description: 'Both players were titled.',
    group: 'Origin',
  },
  superGM: {
    name: 'Super GM game',
    description: 'From a game by one of the world’s best.',
    group: 'Origin',
  },
};

export function themeName(tag: string): string {
  return (
    THEMES[tag]?.name ??
    tag.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
  );
}

export function themeDescription(tag: string): string | undefined {
  return THEMES[tag]?.description;
}

/** Themes worth practising deliberately (excludes metadata like length or origin). */
export const PRACTICE_GROUPS: ThemeInfo['group'][] = [
  'Motifs',
  'Mates',
  'Special moves',
  'Phases',
  'Goals',
];
