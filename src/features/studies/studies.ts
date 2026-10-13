import type { Fen, San } from '@/chess/types';

/**
 * One half-move of the solution: the moves accepted from the solver (the
 * first is the main line), the scripted reply and a note shown afterwards.
 */
export interface StudyPly {
  moves: San[];
  reply?: San;
  note?: string;
}

export interface Study {
  id: string;
  title: string;
  composer: string;
  year: number | null;
  /** Where the study was first published, when known. */
  source?: string;
  fen: Fen;
  goal: 'win' | 'draw';
  difficulty: 1 | 2 | 3;
  themes: string[];
  intro: string;
  line: StudyPly[];
  outro: string;
}

export const STUDIES: readonly Study[] = [
  {
    id: 'reti-1921',
    title: 'Réti’s king walk',
    composer: 'Richard Réti',
    year: 1921,
    source: 'Kagans Neueste Schachnachrichten',
    fen: '7K/8/k1P5/7p/8/8/8/8 w - - 0 1',
    goal: 'draw',
    difficulty: 2,
    themes: ['king activity', 'the square', 'two goals at once'],
    intro:
      'The most famous study ever composed. White’s king is far outside the square of the h-pawn and the c-pawn seems doomed — yet White draws. The king walks diagonally, threatening two things at once.',
    line: [
      {
        moves: ['Kg7'],
        reply: 'h4',
        note: 'The diagonal step gains a tempo on both wings: the king approaches the h-pawn and the c-pawn at the same time.',
      },
      {
        moves: ['Kf6'],
        reply: 'Kb6',
        note: 'Now the threat is Ke7 and c7-c8. Black must deal with the c-pawn, which costs the h-pawn a tempo.',
      },
      {
        moves: ['Ke5'],
        note: 'Both threats are alive: Kd6 supports the pawn, Kf4 catches the h-pawn. Whatever Black does, White draws.',
      },
    ],
    outro:
      'After 3...h3 4.Kd6 h2 5.c7 h1=Q 6.c8=Q the queens are level; after 3...Kxc6 4.Kf4 the h-pawn falls. A king can move on a diagonal for the same price as on a file — Réti’s idea has decided countless real endgames.',
  },
  {
    id: 'saavedra-1895',
    title: 'The Saavedra position',
    composer: 'Fernando Saavedra (after Barbier)',
    year: 1895,
    source: 'Weekly Citizen, Glasgow',
    fen: '8/8/1KP5/3r4/8/8/8/k7 w - - 0 1',
    goal: 'win',
    difficulty: 3,
    themes: ['underpromotion', 'stalemate trap', 'skewer'],
    intro:
      'A rook against a pawn on the sixth — surely a draw? The pawn runs, the rook checks, and the white king must find the one path down the board that avoids every trick. The finish is the most famous underpromotion in chess.',
    line: [
      { moves: ['c7'], reply: 'Rd6+', note: 'The pawn goes; the rook starts checking.' },
      {
        moves: ['Kb5'],
        reply: 'Rd5+',
        note: 'Not Kc5, which walks into Rd1 and Rc1+, and not Kb7, when Rd7 pins the pawn.',
      },
      {
        moves: ['Kb4'],
        reply: 'Rd4+',
        note: 'Down the board, staying next to the c-file so the rook can never pin.',
      },
      {
        moves: ['Kb3', 'Kc3'],
        reply: 'Rd3+',
        note: 'One more check and the king finally reaches the second rank.',
      },
      {
        moves: ['Kc2'],
        reply: 'Rd4',
        note: 'The checks are over. Black sets the trap: after c8=Q Rc4+! the queen must take and it is stalemate.',
      },
      {
        moves: ['c8=R'],
        reply: 'Ra4',
        note: 'A rook instead of a queen! Now Rc4+ fails, and the new rook threatens Ra8 mate.',
      },
      {
        moves: ['Kb3'],
        note: 'The rook on a4 is attacked and Rc1 mate is threatened at the same time. Black loses the rook or gets mated.',
      },
    ],
    outro:
      'Barbier published the position as a draw; Saavedra, a priest in Glasgow, found the rook promotion a week later. Ask what the opponent wants — Black wanted a queen on c8.',
  },
  {
    id: 'breakthrough-three-pawns',
    title: 'The classic breakthrough',
    composer: 'Traditional',
    year: null,
    fen: '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1',
    goal: 'win',
    difficulty: 1,
    themes: ['breakthrough', 'passed pawn'],
    intro:
      'Three pawns face three pawns and both kings are far away. Whoever creates a passed pawn first wins the race — and only one pawn move does it.',
    line: [
      {
        moves: ['b6'],
        reply: 'axb6',
        note: 'The middle pawn goes first. If ...cxb6 then a6! and a pawn queens; if ...axb6 then c6!',
      },
      {
        moves: ['c6'],
        reply: 'bxa5',
        note: 'Again the pawn that opens the way: after ...bxc6 a6 or ...bxa5 cxb7, a white pawn is unstoppable.',
      },
      {
        moves: ['cxb7'],
        note: 'The pawn promotes next move and the black pawns are far too slow.',
      },
    ],
    outro:
      'The breakthrough works because the black pawns have not moved and every capture opens a file for another pawn. Look for it whenever pawns face each other with the kings away.',
  },
  {
    id: 'knight-fork-promotion',
    title: 'A queen is not always best',
    composer: 'Traditional',
    year: null,
    fen: '7K/2q1P3/5k2/1P6/8/8/8/8 w - - 0 1',
    goal: 'win',
    difficulty: 1,
    themes: ['underpromotion', 'fork'],
    intro:
      'White’s pawn is about to promote, but a new queen would simply be exchanged and the game drawn. Look at the black king and queen and choose the right piece.',
    line: [
      {
        moves: ['e8=N+'],
        reply: 'Ke7',
        note: 'A knight — with check! It forks the king on f6 and the queen on c7.',
      },
      {
        moves: ['Nxc7'],
        note: 'The queen falls and the b-pawn decides the ending: a knight and a pawn beat a lone king.',
      },
    ],
    outro:
      'Whenever a pawn promotes, check all four pieces. The knight’s fork is the promotion that wins here; the queen only draws.',
  },
  {
    id: 'holding-a-pawn-down',
    title: 'One pawn down, one draw',
    composer: 'Traditional',
    year: null,
    fen: '8/8/8/8/3k4/8/3PK3/8 b - - 0 1',
    goal: 'draw',
    difficulty: 1,
    themes: ['opposition', 'king and pawn'],
    intro:
      'Black is a pawn down in the purest ending there is. Every draw comes from the same idea: keep the king in front of the pawn and take the opposition at the right moment.',
    line: [
      {
        moves: ['Ke4'],
        reply: 'd3+',
        note: 'Straight in front of the pawn. Any step to the side lets the white king out.',
      },
      {
        moves: ['Ke5', 'Kd5', 'Kf5', 'Kd4', 'Kf4'],
        note: 'Step back and wait — straight back in front of the pawn, to either side of it, or beside it on the fourth rank: the pawn cannot advance without support, and the white king cannot get in front of it.',
      },
    ],
    outro:
      'From here the method repeats itself: whenever the pawn advances, the king steps back in front of it (after 3.Ke3 Kd5 4.d4 Kd6 White can never get the king in front of its pawn), and whenever the white king comes forward, Black takes the opposition. Learn this and you will never lose a pawn-down king ending by accident.',
  },
  {
    id: 'rook-pin-on-the-file',
    title: 'The rook’s last trick',
    composer: 'Traditional',
    year: null,
    fen: '1Q6/8/1K6/8/8/8/r7/7k b - - 0 1',
    goal: 'draw',
    difficulty: 1,
    themes: ['pin', 'rook vs queen'],
    intro:
      'White has just promoted. A queen against a rook is normally an easy win — but the new queen stands on the same file as its king.',
    line: [
      {
        moves: ['Rb2+'],
        reply: 'Kc7',
        note: 'Check on the b-file: the queen is pinned against the king behind it.',
      },
      {
        moves: ['Rxb8'],
        note: 'The queen falls and the game is drawn. Whenever a pawn promotes, check the line behind the new piece.',
      },
    ],
    outro:
      'Kings and queens on the same line are a target for a rook check. The same pin saves many rook-versus-pawn endings.',
  },
  {
    id: 'three-only-moves',
    title: 'Three only moves',
    composer: 'Traditional',
    year: null,
    fen: '8/8/8/1k6/8/8/1K1P4/8 w - - 0 1',
    goal: 'win',
    difficulty: 2,
    themes: ['opposition', 'king and pawn'],
    intro:
      'King and pawn against king, with the pawn still at home. White wins — but only by finding the single correct king move three times in a row. Pushing the pawn or stepping the wrong way throws the win away every time.',
    line: [
      {
        moves: ['Kb3'],
        reply: 'Kc5',
        note: 'Take the opposition. Kc3 or Kc2 let Black’s king reach c4 or d4 in front of the pawn.',
      },
      {
        moves: ['Kc3'],
        reply: 'Kd5',
        note: 'Again the opposition, keeping the pawn behind the king.',
      },
      {
        moves: ['Kd3'],
        reply: 'Kd6',
        note: 'And again. Black has run out of good squares; White’s king will reach the fifth rank ahead of the pawn.',
      },
    ],
    outro:
      'With the pawn two squares behind the king, whoever has the opposition wins the fight for the key squares. Move the king, not the pawn.',
  },
  {
    id: 'opposition-with-the-pawn-behind',
    title: 'The king leads, the pawn follows',
    composer: 'Traditional',
    year: null,
    fen: '8/8/8/3k4/8/8/3PK3/8 w - - 0 1',
    goal: 'win',
    difficulty: 2,
    themes: ['opposition', 'key squares'],
    intro:
      'The black king stands in front of the pawn, which normally means a draw. White wins only by using the king first: one move keeps the win, every other move lets Black hold.',
    line: [
      {
        moves: ['Kd3'],
        reply: 'Kc5',
        note: 'Opposition: the kings face each other with one square between them and Black has to give way.',
      },
      {
        moves: ['Kc3', 'Ke3', 'Ke4'],
        note: 'Keep the opposition by following the black king sideways (Kc3 is the most direct), or slip past it to e4 — the pawn still stays at home.',
      },
    ],
    outro:
      'After 2.Kc3 Kd5 3.Kd3 Black must step back and the white king reaches the fourth rank in front of its pawn. Rule of thumb: with the pawn on the second rank, the king must get to the fourth rank in front of it with the opposition. Pawn moves are for later.',
  },
];

export function getStudy(id: string): Study | undefined {
  return STUDIES.find((s) => s.id === id);
}

/** Side that plays the solution. */
export function solverColor(study: Study): 'white' | 'black' {
  return study.fen.split(' ')[1] === 'b' ? 'black' : 'white';
}
