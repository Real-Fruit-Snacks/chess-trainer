import { fenAfter, type Lesson } from '../model';

const OPERA =
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5';
const OPERA_RXD7 = fenAfter(`${OPERA} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8`);
const OPERA_QB8 = fenAfter(
  `${OPERA} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7`,
);
const NIMZO = fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4');

export const advancedLessons2: Lesson[] = [
  {
    id: 'exchange-sacrifice',
    title: 'The exchange sacrifice',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Giving a rook for a minor piece is not a loss when the piece — or the pawns — matter more.',
    minutes: 8,
    steps: [
      {
        title: 'Rook for minor piece',
        text:
          'A rook is worth about five pawns, a bishop or knight about three. Giving up “the exchange” therefore costs ' +
          'roughly two pawns — and is often worth it when you get:\n\n' +
          '- a **wrecked pawn structure** in front of the enemy king,\n' +
          '- a **dominant minor piece** on an outpost that no rook can challenge,\n' +
          '- an **unstoppable passed pawn**, or\n' +
          '- an **attack** the rook was not taking part in anyway.\n\n' +
          'The Sicilian ...Rxc3 is the most famous example: Black shatters White’s queenside and picks up the e4 pawn.',
        fen: 'r1r3k1/4ppbp/p2p1np1/qp6/4P3/2NB4/PPP1QPPP/R4RK1 b - - 0 15',
        shapes: ['c8c3', 'f6e4:blue', 'g7c3:blue'],
      },
      {
        title: 'The Sicilian exchange sacrifice',
        text:
          'Black’s rook on c8 stares at the knight on c3, the queen on a5 pins it to nothing in particular, and ' +
          'the bishop on g7 will rake the long diagonal once c3 is gone. After **...Rxc3 bxc3** the e4 pawn falls to ' +
          '...Nxe4 and White’s queenside pawns are ruins.',
        fen: 'r1r3k1/4ppbp/p2p1np1/qp6/4P3/2NB4/PPP1QPPP/R4RK1 b - - 0 15',
        orientation: 'black',
        task: {
          prompt: 'Black to move: play the thematic sacrifice.',
          moves: ['Rxc3'],
          hint: 'Take the knight with the rook.',
          success:
            'Rxc3! bxc3 Nxe4 and Black has a pawn, the better structure and a monster bishop for the exchange. The engine agrees it is fully sound.',
          failure: 'Playable, but the thematic move is the sacrifice on c3 — try it.',
        },
      },
      {
        title: 'Morphy’s exchange sacrifice',
        text:
          'From the Opera Game. Black has just played **12...Rd8**, pinning the knight against its queen... or so it ' +
          'seems. Morphy simply gave up the exchange to keep every white piece in the attack. Find his move.',
        fen: OPERA_RXD7,
        shapes: ['d1d7', 'b5d7:blue'],
        task: {
          prompt: 'White to move: keep the initiative.',
          moves: ['Rxd7'],
          hint: 'The pinned knight is the key defender. Which piece removes it while keeping the pin on the other knight?',
          success:
            'Rxd7! Rxd7 Rd1 and the pin is renewed with the second rook. Black is a rook up for two pawns ' +
            'and completely lost.',
          failure:
            'Not bad, but Morphy’s Rxd7 is far stronger: it keeps every white piece attacking.',
        },
      },
      {
        title: 'And the finish',
        text:
          'Three moves later Black has an extra knight for two pawns and still no hope. White’s queen and ' +
          'rook finish the game with one of the most famous queen sacrifices ever played.',
        fen: OPERA_QB8,
        task: {
          prompt: 'White to move: force mate in two.',
          moves: ['Qb8+'],
          hint: 'A queen check that can only be answered by capturing.',
          success: 'Qb8+! Nxb8 Rd8 mate. The rook that stayed behind delivers the final blow.',
          failure:
            'There is a forced mate in two. Start with a check that the knight must capture.',
        },
      },
      {
        title: 'When not to sacrifice',
        text:
          'The exchange sacrifice fails when the rooks have **open files** to use, when the enemy king is **safe**, ' +
          'or when there is nothing concrete to show for it afterwards. Before you sacrifice, name the asset you get: ' +
          'a pawn, a square, a file, a king. If you cannot name it, keep the rook.',
        fen: 'r1r3k1/4ppbp/p2p1np1/qp6/4P3/2NB4/PPP1QPPP/R4RK1 b - - 0 15',
      },
    ],
    practiceThemes: ['sacrifice', 'attackingF2F7'],
  },

  {
    id: 'bishop-pair',
    title: 'The bishop pair',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Two bishops cover every square. Keep them, open the position, and take squares from the knight.',
    minutes: 7,
    steps: [
      {
        title: 'Why two bishops are strong',
        text:
          'One bishop controls only half the squares; **two bishops** cover them all, cut the board in two, and ' +
          'support pawns on both wings. In open positions the pair is worth roughly half a pawn.\n\n' +
          'Three rules: **keep** the pair unless you get something concrete; **open** the position with pawn breaks; ' +
          'and **restrict** the enemy knight with pawns so it has no outpost.',
        fen: '4k3/pp3ppp/8/8/8/8/PP3PPP/1BB1K3 w - - 0 1',
        shapes: ['b1h7', 'c1h6'],
      },
      {
        title: 'Keeping the pair',
        text:
          'In the Nimzo-Indian Black pins the knight and threatens ...Bxc3, doubling White’s pawns. White’s most ' +
          'popular answer prepares to recapture with the **queen** and keep the bishops.',
        fen: NIMZO,
        shapes: ['b4c3:red', 'd1c2'],
        task: {
          prompt: 'White to move: prepare to recapture on c3 without doubling pawns.',
          moves: ['Qc2', 'e3', 'Nf3'],
          hint: 'A queen move that covers c3.',
          success:
            'Qc2 — the Classical Variation. If ...Bxc3+ then Qxc3 and White has the bishop pair with an intact structure. e3 and Nf3 are the other main lines.',
          failure: 'Not the main line. Qc2 (or e3 / Nf3) keeps the position healthy.',
        },
      },
      {
        title: 'Restrict the knight',
        text:
          'A knight needs **outposts**. Here Black’s knight on b6 is already short of squares: a5 and c5 are covered ' +
          'by pawns. One more pawn move takes away its last good square and leaves it stranded on the rim.',
        fen: '6k1/5ppp/1n6/8/P1P1P3/8/5PPP/2B3K1 w - - 0 1',
        shapes: ['a4a5', 'b6:red'],
        task: {
          prompt: 'White to move: dominate the knight.',
          moves: ['a5'],
          hint: 'Attack the knight with a pawn so it must retreat to the back rank.',
          success:
            'a5! The knight must go to d7 or c8 — and c5, its dream square, stays covered by the bishop.',
          failure: 'Weaker. Push the a-pawn: it kicks the knight and takes its best squares.',
        },
      },
      {
        title: 'Using the pair',
        text:
          'Typical plans with two bishops:\n\n' +
          '- **Open files and diagonals** with pawn breaks; every trade of pawns favours the bishops.\n' +
          '- Play on **both wings** — the bishops switch sides in one move, the knight cannot.\n' +
          '- **Trade one bishop** for the knight only when it leads to a winning endgame or wins material.\n' +
          '- In the **endgame**, push pawns on both flanks and let the bishops support them from a distance.',
        fen: '4k3/pp3ppp/8/8/8/8/PP3PPP/1BB1K3 w - - 0 1',
      },
    ],
    practiceThemes: ['middlegame'],
  },

  {
    id: 'analysing-your-games',
    title: 'Analysing your own games',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'The fastest way to improve: find the turning point of every game and learn one thing from it.',
    minutes: 8,
    steps: [
      {
        title: 'A four-step method',
        text:
          'After every serious game, spend ten minutes on it:\n\n' +
          '1. **Write down what you thought** at the critical moments — before the engine tells you the truth.\n' +
          '2. **Find the turning point**: the first move after which the evaluation changed for good. Use the Analyze page’s *Review game* to locate it.\n' +
          '3. **Understand why**: was it calculation, a missed pattern, a bad plan, time trouble, a gap in your opening knowledge?\n' +
          '4. **Write one lesson** in a sentence. One per game is enough; a notebook of these is worth more than any book.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      {
        title: 'Find the turning point',
        text:
          'Imagine you played Black in this game and lost quickly. Reviewing it, you reach this position — White to ' +
          'move. Your notes say “b5 chases the bishop, then I develop”. What did you miss? Find the move that punishes ' +
          '...b5.',
        fen: fenAfter(OPERA),
        shapes: ['b5:red', 'c3b5'],
        task: {
          prompt: 'White to move: what does ...b5 allow?',
          moves: ['Nxb5'],
          hint: 'The knight can take the pawn — check what happens after ...cxb5.',
          success:
            'Nxb5! cxb5 Bxb5+ and the king is stuck in the centre with two pieces pinned. Lesson for Black: with an undeveloped king, do not open lines.',
          failure:
            'Stronger is available. The b5 pawn can be taken because the recapture opens a check on the e8 king.',
        },
      },
      {
        title: 'Reading engine output',
        text:
          'The engine is a great fact-checker and a poor teacher. Some rules for using it:\n\n' +
          '- Look at the **evaluation graph** first and jump to the swings. Do not scroll through every move.\n' +
          '- A **±0.3** change is noise; **±1** is a real mistake; a swing of **2 or more** is the game.\n' +
          '- When the engine suggests a move you would never find, ask *why* it works. If you cannot explain it, it is not your lesson.\n' +
          '- Prefer the mistake that repeats across games over the spectacular one-off.',
        fen: fenAfter(`${OPERA} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O`),
      },
      {
        title: 'Turning lessons into training',
        text:
          'Connect what you find to the tools here:\n\n' +
          '- Missed a **tactic**? Practise that theme in puzzles — the Progress page shows which themes you miss most.\n' +
          '- Lost the **opening**? Add the line to your repertoire and review it in the Openings trainer.\n' +
          '- Misplayed an **endgame**? Drill it against the engine until it is automatic.\n' +
          '- **Time trouble**? Play a few games with an increment and practise deciding faster in familiar structures.\n\n' +
          'One game, one lesson, one drill. Repeat.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    ],
  },
];
