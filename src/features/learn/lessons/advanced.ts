import { fenAfter, type Lesson } from '../model';

const BACK_RANK_COMBO = '3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1';
const QUEEN_TRADE_FORK = '3qk2r/pp3pp1/8/4N3/8/8/PPP5/3Q2K1 w - - 0 1';
const GREEK_GIFT = 'r1b2rk1/pp1n1ppp/1q2p3/3pP3/3P4/2PB1N2/PP3PPP/RNBQ1RK1 w - - 0 12';

export const advancedLessons: Lesson[] = [
  {
    id: 'calculation-method',
    title: 'How to calculate: checks, captures, threats',
    level: 'advanced',
    category: 'Thinking',
    summary: 'A repeatable method for finding combinations instead of hoping to see them.',
    minutes: 10,
    practiceDrills: [
      { title: 'What’s the threat?', to: '/drills/threats' },
      { title: 'Blind puzzles', to: '/puzzles/blind' },
    ],
    steps: [
      {
        title: 'Forcing moves first',
        text:
          'Strong players do not calculate everything. They look at **forcing moves** first — moves that limit the ' +
          'opponent’s replies — in this order:\n\n' +
          '1. **Checks**\n2. **Captures**\n3. **Threats** (especially mate threats)\n\n' +
          'For each one, ask “what are *all* the replies?” and follow the line until the position is quiet. Only if ' +
          'nothing forcing works do you look at quiet moves.',
        fen: BACK_RANK_COMBO,
      },
      {
        title: 'Checks: a back-rank combination',
        text: 'White has one check. Calculate it to the end before you play it: what must Black reply, and what happens next?',
        fen: BACK_RANK_COMBO,
        shapes: ['e2e8'],
        task: {
          prompt: 'Start the forcing sequence.',
          moves: ['Qe8+'],
          reply: 'Rxe8',
          hint: 'Sacrifices are fine if the follow-up is mate.',
          success: 'Qe8+! The only legal reply is Rxe8.',
          failure:
            'Look for the check. If Black has only one reply, calculate what you play after it.',
        },
      },
      {
        title: 'Finish the combination',
        text: 'The black rook has been dragged onto e8. Complete the pattern.',
        fen: fenAfter('Qe8+ Rxe8', BACK_RANK_COMBO),
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rxe8#'],
          acceptAnyMate: true,
          success:
            'Rxe8# — a queen sacrifice for a back-rank mate. You saw it because you checked the checks first.',
          failure: 'Recapture on e8 — with check.',
        },
      },
      {
        title: 'Captures: trade to win',
        text:
          'Captures come next. A capture that looks like an even trade can be the start of a combination. Here, ' +
          'trading queens sets up a knight fork. Calculate: after Qxd8+ Black must recapture with the king — and then?',
        fen: QUEEN_TRADE_FORK,
        shapes: ['d1d8', 'e5f7:blue'],
        task: {
          prompt: 'Begin the combination.',
          moves: ['Qxd8+'],
          reply: 'Kxd8',
          success: 'Queens off — and the black king has been lured to d8.',
          failure: 'Nxf7 first fails to Qxd1. Force the queen trade first, then look again.',
        },
      },
      {
        title: 'The fork appears',
        text: 'Now the knight move that was impossible a moment ago wins material.',
        fen: fenAfter('Qxd8+ Kxd8', QUEEN_TRADE_FORK),
        task: {
          prompt: 'Win material.',
          moves: ['Nxf7+'],
          success: 'Nxf7+ forks king and rook. Whatever Black does, Nxh8 follows.',
          failure: 'Look for a knight check that also attacks the rook in the corner.',
        },
      },
      {
        title: 'Visualisation habits',
        text:
          'Tips that make calculation reliable:\n\n' +
          '- Always look for the opponent’s **best** reply, not the one you hope for — especially their checks and captures.\n' +
          '- When a line ends, take a mental snapshot: *who is better, and why?* If you cannot say, calculate one move further.\n' +
          '- Before playing a move you calculated, do a final **blunder check**: does it leave anything undefended? Does it allow a check?\n' +
          '- Compare candidate moves at the end, never during. Finish one line before starting the next.',
        fen: QUEEN_TRADE_FORK,
      },
    ],
    practiceThemes: ['sacrifice', 'long', 'veryLong'],
  },

  {
    id: 'pawn-structures',
    title: 'Pawn structures and the plans they dictate',
    level: 'advanced',
    category: 'Strategy',
    summary: 'Isolated pawns, hanging pawns, pawn chains and the minority attack.',
    minutes: 10,
    steps: [
      {
        title: 'The isolated queen’s pawn',
        text:
          'Black’s d5 pawn has no neighbours: an **isolated queen’s pawn (IQP)**. It gives active pieces and the ' +
          '…d4 break in the middlegame, but it is a target in the endgame.\n\n' +
          '- **Owner’s plan**: attack — piece play, the …d4 push, a kingside initiative.\n' +
          '- **Opponent’s plan**: blockade the square in front (d4), trade pieces, win the pawn in the endgame.',
        fen: fenAfter(
          '1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 exd5 5. Nf3 Nc6 6. g3 Nf6 7. Bg2 Be7 8. O-O O-O 9. dxc5 Bxc5',
        ),
        shapes: ['d5:red', 'd4:blue'],
      },
      {
        title: 'Hanging pawns',
        text:
          'Two adjacent pawns with no support on either side — here c5 and d5 — are **hanging pawns**. They ' +
          'control space and can advance with force, but if one is forced forward, the other becomes weak.\n\n' +
          'The side facing them wants to provoke an advance (b4!, or pressure on the d-file) and then attack the pawn ' +
          'left behind.',
        fen: 'r2q1rk1/p4ppp/4bn2/2pp4/8/4PN2/PP2BPPP/R2QR1K1 w - - 0 15',
        shapes: ['c5:red', 'd5:red', 'b2b4:blue'],
      },
      {
        title: 'Pawn chains',
        text:
          'Locked pawn chains (here d4–e5 against d5–e6) point in the direction to attack: White plays on the ' +
          'kingside, Black on the queenside. Each side should attack the **base** of the enemy chain — Black with ' +
          '…c5, White with f4–f5.',
        fen: fenAfter('1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. f4 c5 6. Nf3 Nc6'),
        shapes: ['c5d4:red', 'f4f5:blue', 'd4:green', 'e6:green'],
      },
      {
        title: 'The minority attack',
        text:
          'In the Carlsbad structure (White pawns a2, b2, d4 against Black’s a7, b7, c6, d5), White advances **two** ' +
          'queenside pawns against Black’s **three** with b4–b5. After bxc6 bxc6, Black is left with a weak pawn on c6 — ' +
          'a long-term target.\n\nStart the minority attack.',
        fen: fenAfter(
          '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. Qc2 Be7 7. e3 Nbd7 8. Bd3 O-O 9. Nf3 Re8 10. O-O Nf8 11. Rab1 Bd6',
        ),
        shapes: ['b2b4', 'b4b5', 'c6:red'],
        task: {
          prompt: 'Begin the minority attack.',
          moves: ['b4'],
          success:
            'b4! followed by b5 undermines c6. Meanwhile Black will look for play on the kingside.',
          failure:
            'The plan is a pawn advance on the queenside, where you have fewer pawns than Black.',
        },
      },
      {
        title: 'Reading a structure',
        text:
          'Whenever the pawn structure changes, stop and ask:\n\n' +
          '- Which pawns are **weak** (isolated, backward, doubled) — and who owns them?\n' +
          '- Where are the **open and half-open files**?\n' +
          '- Which side of the board do my **pawn chains point** toward?\n' +
          '- Is there a **pawn break** (…c5, f4–f5, b4–b5) that improves my structure or damages theirs?\n\n' +
          'The answers usually hand you a plan for the next ten moves.',
        fen: fenAfter('1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. f4 c5 6. Nf3 Nc6'),
      },
    ],
    practiceThemes: ['middlegame', 'advantage'],
  },

  {
    id: 'defence-and-prophylaxis',
    title: 'Defence and prophylaxis',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'See the opponent’s plan before it happens — and counter-attack when it is the best defence.',
    minutes: 8,
    practiceDrills: [{ title: 'What’s the threat?', to: '/drills/threats' }],
    steps: [
      {
        title: 'Prophylaxis: prevent, don’t react',
        text:
          '**Prophylaxis** means asking “what does my opponent want?” and quietly preventing it. In this Italian ' +
          'position 8. h3 stops …Bg4, which would pin the knight and pressure d4 for the rest of the game. The move ' +
          'looks passive; it is anything but.\n\nBefore every move, name the opponent’s **best plan** in one sentence. If ' +
          'you cannot, look harder.',
        fen: fenAfter(
          '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O a6 7. a4 Ba7 8. h3',
        ),
        shapes: ['c8g4:red', 'h3g4:blue'],
      },
      {
        title: 'Defending a mate threat',
        text:
          'White’s queen and bishop form a battery aimed at h7: Qxh7 would be mate. Find a defence — ideally one ' +
          'that also improves your position.',
        fen: 'r1b2rk1/pp1nqppp/2p1p3/8/8/2PQ4/PPBN1PPP/R3R1K1 b - - 0 14',
        orientation: 'black',
        shapes: ['d3h7:red', 'c2h7:red'],
        task: {
          prompt: 'Black to move. Stop the mate.',
          moves: ['Nf6', 'g6'],
          hint: 'Block the diagonal or add a defender to h7. Which move also develops?',
          success:
            'Safe. Nf6 is the most useful, defending h7 while bringing the knight to its best square.',
          failure:
            'That does not stop Qxh7. Cover h7 or block the b1–h7 diagonal — and check that your king still has no escape square before you rely on one.',
        },
      },
      {
        title: 'Counter-attack: the best defence',
        text:
          'Your rook is attacked by the queen. The passive reply is to move it — but before defending, **check the ' +
          'checks**. Is there something stronger?',
        fen: '6k1/pp3ppp/8/8/8/1q6/P4PPP/3R2K1 w - - 0 1',
        shapes: ['b3d1:red'],
        task: {
          prompt: 'The rook is attacked. Find the best move.',
          moves: ['Rd8#'],
          acceptAnyMate: true,
          success:
            'Rd8#! The “attacked” rook delivers back-rank mate. Always check the forcing moves before defending.',
          failure: 'Moving the rook away is safe but slow. Is there a check that ends the game?',
        },
      },
      {
        title: 'Drawing resources',
        text:
          'When you are worse, know the ways to hold:\n\n' +
          '- **Perpetual check**: a king that cannot escape a series of checks means a draw by repetition.\n' +
          '- **Fortresses**: positions the attacker cannot break despite extra material. Shown here: the “wrong ' +
          'bishop” — White’s bishop does not control h8, so Black just sits in the corner and it is a draw.\n' +
          '- **Stalemate tricks**: when you have almost no pieces left, look for ways to have no legal moves.\n' +
          '- **Reduce material**: with fewer pawns, many endgames a piece down are drawn.',
        fen: '7k/8/6KP/8/8/8/8/5B2 w - - 0 1',
        shapes: ['h8:red', 'f1h3:blue'],
      },
    ],
    practiceThemes: ['defensiveMove', 'quietMove', 'equality'],
  },

  {
    id: 'converting-advantages',
    title: 'Converting an advantage',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Winning a won position is a skill of its own: simplify, create passed pawns, use the king.',
    minutes: 8,
    steps: [
      {
        title: 'Principles of technique',
        text:
          'When you are ahead:\n\n' +
          '- **Trade pieces, not pawns.** Fewer pieces means fewer chances for the opponent to swindle; more pawns means more potential queens.\n' +
          '- **Do not hurry.** First remove all counterplay, then push.\n' +
          '- **Create a passed pawn** and support it with the king and rook.\n' +
          '- **Activate the king** in the endgame — it is a fighting piece worth about three pawns.\n' +
          '- **Two weaknesses**: if the opponent can defend one target, create a second one on the other side of the board.',
        fen: '8/ppp5/8/PPP5/8/8/8/k6K w - - 0 1',
      },
      {
        title: 'The pawn breakthrough',
        text:
          'Three pawns against three, both kings far away. There is only one move that forces a pawn through. ' +
          'Calculate each capture to the end.',
        fen: '8/ppp5/8/PPP5/8/8/8/k6K w - - 0 1',
        task: {
          prompt: 'Force a passed pawn.',
          moves: ['b6'],
          hint: 'Sacrifice the middle pawn so that whichever way Black captures, another pawn runs through.',
          success:
            'b6! If axb6 then c6! bxc6 a6 and the a-pawn queens; if cxb6 then a6! bxa6 c6 and the c-pawn queens.',
          failure:
            'That lets Black keep the pawns blocked. Try offering the pawn in the middle first.',
        },
      },
      {
        title: 'Passed pawns must be pushed — with support',
        text:
          'A passed pawn is a candidate for promotion, but on its own it just gets rounded up. Escort it: king in ' +
          'front or beside it, rook behind it. In this typical rook endgame the white king walks up to support ' +
          'the pawn while the rook cuts off the black king.',
        fen: '8/8/8/8/2k1P3/8/8/4K1R1 w - - 0 1',
        shapes: ['e1e2:blue', 'e2f3:blue', 'g1g4:green'],
      },
      {
        title: 'Beware the draw when winning',
        text:
          'Advantages evaporate through three mistakes: **stalemate** (when the opponent has almost no moves), ' +
          '**perpetual check** (when your king has no shelter) and **wrong trades** (into a drawn endgame such as the ' +
          'wrong-bishop fortress). Before each simplifying move, make sure the resulting endgame is really won.',
        fen: '7k/8/6KP/8/8/8/8/5B2 w - - 0 1',
        shapes: ['h8:red'],
      },
    ],
    practiceThemes: ['endgame', 'advancedPawn', 'promotion'],
  },

  {
    id: 'attacking-the-king',
    title: 'Attacking the king: the Greek gift',
    level: 'advanced',
    category: 'Tactics',
    summary: 'Recognise when Bxh7+ works, and the three-move follow-up that decides the game.',
    minutes: 9,
    steps: [
      {
        title: 'Ingredients of a king attack',
        text:
          'Successful attacks share a few features:\n\n' +
          '- **More attackers than defenders** near the king.\n' +
          '- An **open line** (file or diagonal) toward the king, or the means to open one.\n' +
          '- A pawn on **e5** (or d5) that keeps the defending knight off f6.\n' +
          '- The opponent’s pieces **far away** on the other wing.\n\n' +
          'The classic **Greek gift** sacrifice, Bxh7+, needs exactly these: a bishop on the b1–h7 diagonal, a knight on f3 ready ' +
          'to jump to g5, the queen able to reach h5, and no black knight on f6.',
        fen: GREEK_GIFT,
        shapes: ['d3h7:red', 'f3g5:blue', 'd1h5:blue', 'e5:green'],
      },
      {
        title: 'The sacrifice',
        text: 'All the ingredients are present. Play the Greek gift.',
        fen: GREEK_GIFT,
        task: {
          prompt: 'Sacrifice on h7.',
          moves: ['Bxh7+'],
          reply: 'Kxh7',
          success: 'Bxh7+! Kxh7 is forced (declining is even worse).',
          failure:
            'The thematic move is the bishop sacrifice on h7 — play it and follow the attack through.',
        },
      },
      {
        title: 'The knight follows',
        text: 'The king is exposed on h7. Bring the knight in with check.',
        fen: fenAfter('Bxh7+ Kxh7', GREEK_GIFT),
        task: {
          prompt: 'Continue the attack with check.',
          moves: ['Ng5+'],
          reply: 'Kg8',
          success:
            'Ng5+! Kg8 — the natural retreat, and the classic line this lesson follows, though it loses fastest. Kh6 walks into mate too, and Kg6, the toughest defence, still costs heavy material after Qd3+.',
          failure: 'Knight check on g5 is the follow-up.',
        },
      },
      {
        title: 'The queen arrives',
        text: 'Complete the picture: bring the queen to the h-file with a mate threat on h7.',
        fen: fenAfter('Bxh7+ Kxh7 Ng5+ Kg8', GREEK_GIFT),
        task: {
          prompt: 'Threaten mate.',
          moves: ['Qh5'],
          success:
            'Qh5 threatens Qh7#, and nothing saves Black any more: Nf6 is met by exf6, a rook move that frees f8 by Qxf7+, and mate follows within a few moves.',
          failure:
            'The queen wants to attack h7. Which square on the h-file does it reach in one move?',
        },
      },
      {
        title: 'When it does not work',
        text:
          'The Greek gift fails when the defender can:\n\n' +
          '- Play …Kg6 and escape via f5 or h6 safely (usually when White’s queen cannot reach g4/d3 with tempo),\n' +
          '- Bring a **knight to f6** in time (no pawn on e5),\n' +
          '- Meet Qh5 with …Qxg5 (a black queen or bishop controlling g5),\n' +
          '- Defend h7 with a bishop on the b1–h7 diagonal or a rook on the 7th rank.\n\n' +
          'Check those four points and you will know within seconds whether Bxh7+ is sound.',
        fen: GREEK_GIFT,
      },
    ],
    practiceThemes: ['kingsideAttack', 'sacrifice', 'attackingF2F7'],
  },
];
