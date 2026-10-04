import type { LessonLevel } from './model';

/**
 * Courses: guided paths through the lessons, drills, puzzles, repertoires and
 * classic games. A unit's checkpoint is simply an item that needs practice
 * (puzzles solved, a drill won, a game played) rather than reading.
 */
export type CourseItem =
  | { type: 'lesson'; id: string }
  | { type: 'drill'; id: string; title: string; to: string }
  | { type: 'puzzles'; theme: string; target: number }
  | { type: 'repertoire'; id: string; title: string; target: number }
  | { type: 'game'; level: number }
  | { type: 'classic'; id: string; title: string };

export interface CourseUnit {
  id: string;
  title: string;
  blurb: string;
  items: CourseItem[];
}

export interface Course {
  id: string;
  title: string;
  level: LessonLevel;
  blurb: string;
  units: CourseUnit[];
}

const drill = (id: string, title: string): CourseItem => ({
  type: 'drill',
  id,
  title,
  to: `/drills/endgame/${id}`,
});
const lesson = (id: string): CourseItem => ({ type: 'lesson', id });
const puzzles = (theme: string, target: number): CourseItem => ({ type: 'puzzles', theme, target });

export const COURSES: Course[] = [
  {
    id: 'first-steps',
    title: 'First steps',
    level: 'beginner',
    blurb:
      'From the rules to your first wins: how the pieces move, how to win material, how to deliver checkmate and how to start a game sensibly.',
    units: [
      {
        id: 'rules',
        title: 'The rules',
        blurb: 'The board, the pieces, and the three special moves.',
        items: [
          lesson('the-board'),
          lesson('how-pieces-move'),
          lesson('special-moves'),
          lesson('check-checkmate-stalemate'),
          { type: 'drill', id: 'coordinates', title: 'Coordinates', to: '/drills/coordinates' },
        ],
      },
      {
        id: 'material',
        title: 'Winning material',
        blurb: 'What the pieces are worth and how to take things for free.',
        items: [lesson('piece-values'), lesson('trading-pieces'), puzzles('hangingPiece', 5)],
      },
      {
        id: 'checkmates',
        title: 'First checkmates',
        blurb: 'The mates every player must know, then find them yourself.',
        items: [
          lesson('basic-checkmates'),
          drill('mate-kq', 'Queen vs king'),
          drill('mate-kr', 'Rook vs king'),
          puzzles('mateIn1', 6),
        ],
      },
      {
        id: 'openings',
        title: 'Starting the game',
        blurb: 'Principles, the traps everyone falls for once, and a first repertoire.',
        items: [
          lesson('opening-principles'),
          lesson('opening-traps'),
          { type: 'repertoire', id: 'italian', title: 'Italian Game', target: 5 },
          { type: 'game', level: 1 },
        ],
      },
      {
        id: 'endings',
        title: 'How games end',
        blurb: 'Draws, pawn races and promoting a pawn against a lone king.',
        items: [
          lesson('how-games-end'),
          lesson('pawn-races'),
          drill('kp-promote', 'Promote the pawn'),
          puzzles('mateIn2', 5),
        ],
      },
    ],
  },
  {
    id: 'club-player',
    title: 'Club player',
    level: 'intermediate',
    blurb:
      'Tactics you can rely on, the endgames that decide club games, a way of thinking about plans, and an opening repertoire that works.',
    units: [
      {
        id: 'motifs',
        title: 'Tactical motifs',
        blurb: 'Forks, pins, skewers and discovered attacks — the bread and butter.',
        items: [
          lesson('forks'),
          lesson('pins-and-skewers'),
          lesson('discovered-attacks'),
          puzzles('fork', 8),
          puzzles('pin', 8),
        ],
      },
      {
        id: 'nets',
        title: 'Removing defenders and mating nets',
        blurb: 'How combinations are built, and the mating patterns behind them.',
        items: [
          lesson('removing-the-defender'),
          lesson('mating-patterns'),
          puzzles('mateIn2', 8),
          puzzles('discoveredAttack', 5),
        ],
      },
      {
        id: 'endgames',
        title: 'Endgame essentials',
        blurb: 'King and pawn, the rook endings you cannot avoid, and queen against pawn.',
        items: [
          lesson('king-and-pawn-endgames'),
          lesson('rook-endgames'),
          lesson('queen-vs-pawn'),
          drill('lucena', 'Lucena position'),
          drill('philidor', 'Philidor position'),
          puzzles('rookEndgame', 5),
        ],
      },
      {
        id: 'thinking',
        title: 'Thinking and planning',
        blurb:
          'Plans, pawn breaks, visualisation and the active king; then test it against the engine.',
        items: [
          lesson('planning-basics'),
          lesson('space-and-pawn-breaks'),
          lesson('visualisation'),
          lesson('the-active-king'),
          { type: 'classic', id: 'opera-game', title: 'The Opera Game' },
          { type: 'game', level: 3 },
        ],
      },
      {
        id: 'repertoire',
        title: 'Openings that work',
        blurb: 'Choose openings, build a repertoire and attack a king that stayed in the centre.',
        items: [
          lesson('common-openings'),
          lesson('building-a-repertoire'),
          lesson('attacking-the-uncastled-king'),
          lesson('how-to-study-openings'),
          { type: 'repertoire', id: 'london', title: 'London System', target: 10 },
        ],
      },
      {
        id: 'more-endgames',
        title: 'More endgames',
        blurb:
          'Minor pieces, opposite bishops, more pawn and rook endings, and pieces against the rook.',
        items: [
          lesson('minor-piece-endgames'),
          lesson('opposite-bishops'),
          lesson('pawn-endgames-2'),
          lesson('rook-endgames-2'),
          lesson('rook-endgames-3'),
          lesson('rook-vs-minor-piece'),
          lesson('queen-endgames'),
          lesson('knight-endgames'),
          lesson('rook-vs-pawn'),
          drill('vancura', 'Vancura position'),
          drill('bishop-pawn-hold', 'Wrong bishop: hold the draw'),
        ],
      },
      {
        id: 'middlegame',
        title: 'Middlegame ideas',
        blurb:
          'Passed pawns, bishop against knight, the initiative and the moment to trade into an endgame.',
        items: [
          lesson('passed-pawns-in-the-middlegame'),
          lesson('bishop-vs-knight'),
          lesson('the-initiative'),
          lesson('transitions-to-endgames'),
          puzzles('advancedPawn', 6),
          puzzles('trappedPiece', 5),
        ],
      },
      {
        id: 'attack-and-defence',
        title: 'Attack and defence',
        blurb:
          'Breaking a fianchetto, surviving the Greek gift, and the named mating patterns every player should recognise.',
        items: [
          lesson('attacking-the-fianchetto'),
          lesson('defending-the-greek-gift'),
          {
            type: 'drill',
            id: 'mating-patterns',
            title: 'Mating patterns',
            to: '/patterns?drill=all',
          },
          puzzles('kingsideAttack', 6),
          puzzles('defensiveMove', 5),
        ],
      },
      {
        id: 'endgame-technique',
        title: 'Endgame technique',
        blurb:
          'Bishop endings, the tricks of pawn endings, the bishop-and-knight mate and queen against rook — with the ladder drills to play them out.',
        items: [
          lesson('bishop-endgames'),
          lesson('pawn-endgames-3'),
          lesson('bishop-and-knight-mate'),
          lesson('queen-vs-rook'),
          drill('kp-breakthrough', 'The breakthrough'),
          drill('reti-hold', 'Réti’s manoeuvre'),
          drill('mate-kbn-corner', 'Bishop and knight: wrong corner'),
          drill('queen-vs-rook', 'Queen vs rook'),
        ],
      },
    ],
  },
  {
    id: 'strategy-and-calculation',
    title: 'Strategy and calculation',
    level: 'advanced',
    blurb:
      'Calculate properly, understand pawn structures and piece placement, attack and defend with a plan, and convert what you win.',
    units: [
      {
        id: 'calculation',
        title: 'Calculation',
        blurb: 'A method for calculating, then long puzzles to apply it.',
        items: [
          lesson('calculation-method'),
          lesson('candidate-moves'),
          lesson('zwischenzug-and-quiet-moves'),
          lesson('calculation-3'),
          puzzles('intermezzo', 5),
          puzzles('quietMove', 5),
          puzzles('long', 6),
          puzzles('veryLong', 3),
        ],
      },
      {
        id: 'structures',
        title: 'Pawn structures',
        blurb:
          'The structures that decide the plans: the isolani, the minority attack, hanging pawns and the Maróczy Bind.',
        items: [
          lesson('pawn-structures'),
          lesson('isolated-queens-pawn'),
          lesson('minority-attack'),
          lesson('hanging-pawns-and-maroczy'),
        ],
      },
      {
        id: 'pieces',
        title: 'Pieces and squares',
        blurb: 'Outposts, the bishop pair and giving up the exchange for good reasons.',
        items: [
          lesson('outposts-and-weak-squares'),
          lesson('bishop-pair'),
          lesson('good-and-bad-bishops'),
          lesson('exchange-sacrifice'),
          lesson('exchange-sacrifices-2'),
          lesson('when-there-is-nothing-to-do'),
          puzzles('sacrifice', 6),
        ],
      },
      {
        id: 'attack-defence',
        title: 'Attack and defence',
        blurb: 'Attacking the king, and the prophylaxis that stops attacks before they start.',
        items: [
          lesson('attacking-the-king'),
          lesson('opposite-side-castling'),
          lesson('attacking-with-opposite-bishops'),
          lesson('defence-and-prophylaxis'),
          lesson('defending-worse-positions'),
          puzzles('kingsideAttack', 6),
          puzzles('defensiveMove', 5),
        ],
      },
      {
        id: 'openings-by-plan',
        title: 'Openings by plan',
        blurb:
          'The Sicilian and the King’s Indian understood as plans, then a repertoire to carry them.',
        items: [
          lesson('sicilian-plans'),
          lesson('kings-indian-plans'),
          lesson('catalan-and-qgd-plans'),
          lesson('french-structures'),
          { type: 'repertoire', id: 'najdorf', title: 'Najdorf Sicilian', target: 10 },
          { type: 'repertoire', id: 'kings-indian', title: 'King’s Indian Defence', target: 10 },
        ],
      },
      {
        id: 'converting',
        title: 'Converting and holding',
        blurb: 'Turning an advantage into a win — and knowing when a position cannot be won.',
        items: [
          lesson('converting-advantages'),
          lesson('converting-an-extra-pawn'),
          lesson('fortresses-and-zugzwang'),
          lesson('rook-and-bishop-vs-rook'),
          drill('mate-kbn', 'Bishop and knight vs king'),
          drill('rook-short-side', 'The short-side defence'),
          puzzles('zugzwang', 4),
        ],
      },
      {
        id: 'own-games',
        title: 'Your own games',
        blurb: 'Learn from what you actually play, and from the greatest games ever played.',
        items: [
          lesson('analysing-your-games'),
          lesson('practical-play-and-time'),
          { type: 'classic', id: 'byrne-fischer', title: 'The Game of the Century' },
          { type: 'game', level: 5 },
        ],
      },
    ],
  },
];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
