import { fenAfter, type Lesson } from '../model';

// Knight endgames.
const KNIGHT_PASSER = '8/5pk1/5np1/7p/1P3P2/3K1NP1/7P/8 w - - 0 1';
const KNIGHT_ROOK_PAWN = '8/8/8/8/7k/7p/1N6/3K4 w - - 0 1';
const KNIGHT_TEMPO_CHECK = '8/8/3k2KN/8/8/8/5p2/8 w - - 0 1';
const KNIGHT_SACRIFICE = '8/1K6/8/8/6k1/8/6p1/3N4 w - - 0 1';

// Rook against a pawn.
const RP_KING_FIRST = '8/8/8/4K3/5p2/6k1/4R3/8 w - - 0 1';
const RP_CHECK_FIRST = '8/8/1R6/8/8/8/4p3/5k1K w - - 0 1';
const RP_BACK_RANK = '8/8/8/8/7k/3R2p1/8/2K5 w - - 0 1';
const RP_NO_CHECKS = '8/8/1K6/8/2p5/1k6/8/5R2 w - - 0 1';
const RP_PUSH = '8/8/8/8/3p4/2k5/7R/7K b - - 0 1';
const RP_PUSH_2 = '8/8/8/8/k7/p7/5K2/1R6 b - - 0 1';

// Passed pawns in the middlegame (positions from Lichess games, CC0 puzzle database).
const PASSER_FORK = '3r1rk1/pp4pp/4P3/8/8/2N3Q1/PP3PPP/3R2K1 w - - 0 1';
const PASSER_SEVENTH = '4rbk1/p2q1p1p/1p1P2p1/8/4QP1B/7P/3R2PK/8 w - - 5 31';
const PASSER_SEVENTH_2 = fenAfter('Qxe8 Qxe8', PASSER_SEVENTH);
const PASSER_DECOY = '8/6p1/p2Pk2p/2Pb4/3K3P/8/PP6/8 w - - 1 45';
const BLOCKADE = '3r2k1/pp3ppp/3n4/3P4/8/2N2B2/PP3PPP/3R2K1 w - - 0 1';
const MAJORITY = '6k1/1p3ppp/p7/8/1PP5/P4P2/5KPP/8 w - - 0 1';

// Bishop against knight.
const RIM_KNIGHT = '8/pp4k1/2p5/3pNp2/3P1P2/2P2K2/PP5n/8 w - - 10 35';
const TRAPPED_BISHOP = '8/5pk1/3Q1bp1/3Pp2p/3rP1PP/5P2/4b1K1/8 w - - 1 43';
const BISHOP_BOTH_WINGS = '8/pp3k1p/2n3p1/2P5/1P3B2/P5P1/5K1P/8 w - - 0 1';
const KNIGHT_CLOSED = '6k1/5pb1/p1p1p1pp/1p1pP3/3P1P2/2N3P1/PP4KP/8 w - - 0 1';

// The initiative.
const EVANS = fenAfter(
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O dxc3',
);
const FRIED_LIVER = fenAfter(
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6',
);
const GREEDY = 'rnbqkb1r/ppp1pppp/8/8/2BQ4/2n5/PPP2PPP/R1B1K1NR w KQkq - 0 7';
const KEEP_GOING = 'r1bq1rk1/ppp2ppp/2np1n2/2b1P3/2B5/2p2N2/PP3PPP/RNBQR1K1 w - - 1 9';
const DANISH = fenAfter('1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Bc4 cxb2 5. Bxb2');

// Transitions into the endgame.
const TRADE_INTO_PAWNS = '6k1/pp3ppp/2p5/8/4q3/2P2Q2/P4PKP/8 b - - 0 1';
const FORCE_TRADE = '5rk1/pp3ppp/2n5/8/1q6/3Q1P2/PP4PP/2R3K1 b - - 0 1';
const FORCE_TRADE_2 = fenAfter('Qd4+ Qxd4', FORCE_TRADE);
const PIN_TRADE = '3r2k1/p2b2pp/4q3/8/8/2NQ4/PP3PPP/3R2K1 w - - 0 1';
const QUEENS_OFF = '8/8/6k1/1p1p1ppp/2q5/2PQ2PP/P3KP2/8 w - - 0 41';
const OPPOSITE_TRAP = '8/5pk1/6p1/p1b4p/P1B1p3/6P1/5PKP/8 w - - 0 1';

export const intermediateLessons5: Lesson[] = [
  {
    id: 'knight-endgames',
    title: 'Knight endgames',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Knight endings are pawn endings in disguise: the king and the passed pawns decide, and the knight has one blind spot you must know.',
    minutes: 8,
    steps: [
      {
        title: 'Knight endings are pawn endings',
        text:
          'Botvinnik’s rule: **knight endings are pawn endings.** The knight is short-legged, so it cannot stop ' +
          'a distant passed pawn on its own, and — unlike a bishop — it cannot “lose a tempo” by shuffling along ' +
          'a diagonal. Everything you know about king activity, outside passed pawns and the opposition still ' +
          'counts.\n\n' +
          'Here White is a pawn up with an **outside passed pawn** on the b-file. The plan is exactly the pawn-ending ' +
          'plan: push it to drag the black pieces to the queenside, then win on the other wing with the king.',
        fen: KNIGHT_PASSER,
        shapes: ['b4b5', 'b5b6', 'd3d4:blue', 'f6:red'],
      },
      {
        title: 'The outside passed pawn',
        text:
          'Push the passer or centralise the king first — both win, because Black’s knight has to stop the pawn while ' +
          'the white king walks to the kingside pawns. What loses is doing neither and letting Black’s king come to d6.',
        fen: KNIGHT_PASSER,
        task: {
          prompt: 'White to move: follow the plan.',
          moves: ['b5', 'Kd4'],
          hint: 'The passed pawn or the king — the two pieces of the plan.',
          success:
            'Kd4 Ne8 b5 Nd6 b6! Nb7 Kd5 and the knight is tied to the pawn while the king eats the kingside. Pushing b5 at once comes to the same thing.',
          failure:
            'Too slow. The plan has two parts — the passed pawn (b5, b6) and the king (Kd4, Kd5) — and every tempo counts before ...Kf6-e6-d6 arrives.',
        },
      },
      {
        title: 'The knight against a rook pawn',
        text:
          'The knight’s blind spot is the **rook pawn**. Against a pawn on the seventh rank a knight can only hold if ' +
          'it controls the queening square from a square the king cannot take away — for the h-pawn that means **f2**, ' +
          'guarding h1 with the knight and reaching it in time.',
        fen: KNIGHT_ROOK_PAWN,
        shapes: ['b2d3', 'd3f2', 'f2h1:blue', 'h3h2:red'],
        task: {
          prompt: 'White to move: draw.',
          moves: ['Nd3'],
          hint: 'Head for f2 by the shortest route.',
          success:
            'Nd3! Kg3 Ke2 h2 Nf2! and the knight guards h1: Kg2 Nh1! Kxh1 Kf1 and Black is stalemated. Every other move lets the pawn through.',
          failure:
            'The pawn queens. Only Nd3, heading for f2 where the knight controls h1, holds the draw.',
        },
      },
      {
        title: 'Checks gain time',
        text:
          'A knight arrives in time far more often when it can **check on the way**: each check is a tempo the pawn does ' +
          'not get. Here the target square is f1 (or g3) to control the queening square.',
        fen: KNIGHT_TEMPO_CHECK,
        shapes: ['h6f5', 'f5g3:blue', 'f2f1:red'],
        task: {
          prompt: 'White to move: draw.',
          moves: ['Nf5+'],
          hint: 'A check that also brings the knight closer to f1.',
          success:
            'Nf5+! Ke5 Ng3 and f1 is covered: Kf4 Nf1 and the knight can never be driven off. Nf7+? goes the wrong way and the pawn queens.',
          failure: 'Only the check works: it gains the tempo the knight needs to reach g3 and f1.',
        },
      },
      {
        title: 'Give the knight for the pawn',
        text:
          'When the pawn cannot be stopped, remember that **king against king is a draw**. A knight that can be given ' +
          'for the last pawn has done its job.',
        fen: KNIGHT_SACRIFICE,
        shapes: ['d1e3', 'e3g2:blue'],
        task: {
          prompt: 'White to move: draw.',
          moves: ['Ne3+'],
          hint: 'Check, then take the pawn.',
          success:
            'Ne3+! Kg3 Nxg2 Kxg2 and it is a draw — nothing is left to win with. Any other knight move and the pawn becomes a queen.',
          failure:
            'The pawn promotes. Ne3+ followed by Nxg2 gives the knight for the last pawn: king against king is a draw.',
        },
      },
    ],
    practiceThemes: ['knightEndgame'],
  },
  {
    id: 'rook-vs-pawn',
    title: 'Rook against a pawn',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'A rook usually beats a pawn — but only if the king helps. Learn when the rook must go behind, when to check, and how the pawn side holds.',
    minutes: 9,
    steps: [
      {
        title: 'Three rules',
        text:
          'Rook against a pawn comes up after every pawn race. Three rules decide it:\n\n' +
          '- **The rook alone cannot win.** If the enemy king supports its pawn and your king is far away, it is a draw. ' +
          'Bring the king — every tempo matters.\n' +
          '- **Cut the king off or check it in front of its pawn.** A king that has to step in front of its own pawn ' +
          'loses a tempo, and a rook on the queening rank stops the pawn from a distance.\n' +
          '- **The defender pushes.** With the pawn side you keep the pawn moving and the king beside it, never in front.\n\n' +
          'Here the rook already covers the pawn; what wins is the king.',
        fen: RP_KING_FIRST,
        shapes: ['e5e4', 'f4:red'],
      },
      {
        title: 'The king first',
        text: 'Rd2? would let the black king shield the pawn for ever. One move wins.',
        fen: RP_KING_FIRST,
        task: {
          prompt: 'White to move and win.',
          moves: ['Ke4'],
          hint: 'The rook is fine where it is.',
          success:
            'Ke4! f3 Re3 (cutting the king off along the third rank) Kg4 Rxf3 and the pawn is gone. The king had to be next to the pawn before the rook struck.',
          failure:
            'Only Ke4 wins: the rook alone cannot take a pawn that the king protects. Approach first, strike second.',
        },
      },
      {
        title: 'Check first',
        text:
          'The pawn stands on the seventh, the black king beside it. If the pawn were free to move it would promote, so ' +
          '**check** — the king must step in front of its own pawn, and that tempo brings the white king across.',
        fen: RP_CHECK_FIRST,
        shapes: ['b6f6', 'f1e1:red', 'h1g2:blue'],
        task: {
          prompt: 'White to move and win.',
          moves: ['Rf6+'],
          hint: 'A check that leaves the king only one square.',
          success:
            'Rf6+! Ke1 Kg2 Kd2 Rd6+ Ke3 Re6+ Kd4 Kf3 and the pawn falls. Without the check the king comes to g2 too late.',
          failure:
            'Only Rf6+ wins. The king is forced in front of the pawn (Ke1), so it can no longer advance, and White’s king arrives.',
        },
      },
      {
        title: 'The rook on the queening rank',
        text:
          'From the front, a rook on the first rank stops the pawn from a distance: it cannot promote while the square is ' +
          'covered, and the king comes over at leisure. From the side (Rd6?) the rook is too close — the king simply walks ' +
          'forward.',
        fen: RP_BACK_RANK,
        shapes: ['d3d1', 'g1:red'],
        task: {
          prompt: 'White to move and win.',
          moves: ['Rd1'],
          hint: 'Where does the pawn want to go? Cover that square.',
          success:
            'Rd1! Kg4 Kd2 Kf3 Ke1 g2 Rd3+ and the rook comes round to g3 while the pawn can never queen safely. Rd6? lets the king escort the pawn.',
          failure:
            'Only Rd1 wins: the queening square must be covered so the king has time to approach.',
        },
      },
      {
        title: 'Do not check without a reason',
        text:
          'Checks are only useful when they gain a tempo. Here Rb1+? would drive the king *forward* beside its pawn — ' +
          'exactly where it wants to go. The king must approach instead.',
        fen: RP_NO_CHECKS,
        shapes: ['b6c5', 'c5d4:blue'],
        task: {
          prompt: 'White to move and win.',
          moves: ['Kc5'],
          hint: 'Bring the king, and let the rook wait.',
          success:
            'Kc5! c3 Kd4 c2 Kd3 and the pawn is lost: the king got there first. After Rb1+? Kc2! the king shields the pawn and it is a draw.',
          failure: 'A check here helps the defender. Kc5, marching to d4 and d3, wins the pawn.',
        },
      },
      {
        title: 'For the defender: push, do not block',
        text:
          'Now the pawn side. The rule is to keep the pawn moving with the king **beside** it, never in front, and to head ' +
          'for the queening square with the king only when the pawn is about to be lost anyway.',
        fen: RP_PUSH,
        orientation: 'black',
        shapes: ['d4d3', 'd3d2:blue'],
        task: {
          prompt: 'Black to move: draw.',
          moves: ['d3'],
          hint: 'The pawn or the king — which one gains a tempo?',
          success:
            'd3! Kg1 d2 Rxd2 Kxd2 and the kings are alone. Kd3? blocks the pawn: Kg2 Ke3 Rh7 d3 Re7+ drives the king off and the pawn falls.',
          failure:
            'The pawn was the resource: d3! reaches d2, and White has to give the rook for it.',
        },
      },
      {
        title: 'For the defender: push again',
        text: 'The same idea from the other wing. Only one move holds.',
        fen: RP_PUSH_2,
        orientation: 'black',
        task: {
          prompt: 'Black to move: draw.',
          moves: ['a2'],
          hint: 'Do not let the king get in the pawn’s way.',
          success:
            'a2! Rb8 Ka3 Ra8+ Kb2 and the pawn queens, so White has to give up the rook for it — a dead draw. Ka5? loses the pawn to the rook and king.',
          failure:
            'Only a2 holds. The king covers b2 and b1 from a3, and the rook must be given up for the queen.',
        },
      },
    ],
    practiceThemes: ['rookEndgame'],
  },
  {
    id: 'passed-pawns-in-the-middlegame',
    title: 'Passed pawns in the middlegame',
    level: 'intermediate',
    category: 'Strategy',
    summary:
      'A passed pawn is a threat long before the endgame: push it, support it, blockade the enemy’s, and know how a majority becomes a passer.',
    minutes: 8,
    steps: [
      {
        title: 'Passed pawns must be pushed',
        text:
          'Nimzowitsch called the passed pawn’s **lust to expand**. In the middlegame a far-advanced passer ties down ' +
          'enemy pieces, takes squares away and can end the game with a fork or a promotion threat. Here the e-pawn ' +
          'is already on the sixth rank.',
        fen: PASSER_FORK,
        shapes: ['e6e7', 'd8:red', 'f8:red'],
        task: {
          prompt: 'White to move: use the passed pawn.',
          moves: ['e7', 'Rxd8'],
          hint: 'One more step and the pawn attacks two rooks at once.',
          success:
            'e7! forks the rooks; Rxd8 Rxd8 e7 comes to the same. The pawn itself wins material — that is what “must be pushed” means.',
          failure:
            'The pawn on e7 attacks both rooks. Push it (or trade rooks first with Rxd8 and then push).',
        },
      },
      {
        title: 'A passer on the seventh is worth a piece',
        text:
          'From a Lichess game. White’s d-pawn is on the sixth and only the e8 rook guards the queening square. Black is ' +
          'even a pawn up, so the “obvious” move Qxe8 looks like a mere swap — but look at what happens after Qxe8 Qxe8.',
        fen: PASSER_SEVENTH,
        shapes: ['e4e8', 'd6d7:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Qxe8'],
          reply: 'Qxe8',
          hint: 'Remove the piece that watches d8 — then push.',
          success:
            'Qxe8! Qxe8 and now the pawn goes to d7 with the queen unable to stop it. Play on.',
          failure:
            'Qxe8! trades off the only guard of the queening square; then d7 wins the queen for the pawn.',
        },
      },
      {
        title: 'Finish the idea',
        text: 'The queen on e8 is the last defender of the eighth rank — and it has to move soon.',
        fen: PASSER_SEVENTH_2,
        task: {
          prompt: 'White to move.',
          moves: ['d7'],
          hint: 'The pawn attacks the queen and threatens to promote.',
          success:
            'd7! hits the queen, and after it moves d8 promotes: Black must give the queen for the new one. A pawn that far advanced was worth a whole piece.',
          failure: 'd7! attacks the queen; whatever it does, the pawn becomes a queen next move.',
        },
      },
      {
        title: 'Decoy with the passer',
        text:
          'From a Lichess game. Black’s king blockades the d6 pawn and the bishop on d5 guards everything. A passed pawn ' +
          'can also be given up: what matters is what its advance drags out of place.',
        fen: PASSER_DECOY,
        shapes: ['d6d7', 'd4d5:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['d7'],
          hint: 'Where does the king have to go?',
          success:
            'd7! Kxd7 Kxd5 and the bishop is gone: the pawn decoyed the king from d5. The c-pawn queens.',
          failure: 'd7! forces Kxd7, and the bishop on d5 no longer has a defender.',
        },
      },
      {
        title: 'The blockade',
        text:
          'Against an enemy passer, the answer is Nimzowitsch’s **blockade**: a piece on the square in front of it. A ' +
          'blockading knight is ideal — it is not attacked by the pawn it stops, it is protected from the front by the pawn ' +
          'itself, and from there it radiates over the board.\n\n' +
          'Here the knight on d6 stops the d5 pawn for good; without it White would play d6 and the pawn would decide.',
        fen: BLOCKADE,
        shapes: ['d6:green', 'd5:red'],
      },
      {
        title: 'Make a passer from a majority',
        text:
          'Most passed pawns are created rather than inherited. A **pawn majority** (three against two on the queenside) ' +
          'produces a passer if you advance it — and the extra pawn here should become a passed pawn quickly, before the ' +
          'black king comes back.',
        fen: MAJORITY,
        shapes: ['c4c5', 'b4b5:blue'],
        task: {
          prompt: 'White to move: start the winning plan.',
          moves: ['c5', 'b5', 'Ke3'],
          hint: 'Advance the majority (the pawn without an opponent first), or bring the king up before you do.',
          success:
            'c5 (or b5) and the extra pawn becomes a passed pawn that the black king must run after; Ke3 first, then the pawns, wins the same way. What loses time is playing on the kingside.',
          failure:
            'The plan is on the queenside: c5 or b5 turns the extra pawn into a passed pawn (Ke3 first is fine too).',
        },
      },
    ],
    practiceThemes: ['advancedPawn', 'promotion'],
  },
  {
    id: 'bishop-vs-knight',
    title: 'Bishop against knight in the middlegame',
    level: 'intermediate',
    category: 'Strategy',
    summary:
      'Open the board for a bishop, close it for a knight, keep the knight off the rim — and trade into the minor-piece ending that suits your piece.',
    minutes: 8,
    steps: [
      {
        title: 'Which piece is better?',
        text:
          'Bishop and knight are worth about the same; the position decides which one is *better*:\n\n- The ' +
          '**bishop** wants an open board, pawns on both wings (it covers both sides at once) and enemy pawns ' +
          'fixed on its colour.\n- The **knight** wants a closed or blocked centre, an outpost it cannot be ' +
          'driven from, and play on one wing, where its short range does not matter.\n\nSo the side with the ' +
          'bishop opens the position and keeps pawns on both wings; the side with the knight keeps it closed ' +
          'and looks for a stable square.\n\nHere the bishop is far stronger: pawns on both wings, an open board, ' +
          'and the knight cannot attack the c5 pawn without leaving the kingside to the white king.',
        fen: BISHOP_BOTH_WINGS,
        shapes: ['f4c7:blue', 'f4h6:blue'],
      },
      {
        title: 'The knight’s position',
        text:
          'The same material, a different structure. The centre is locked, every pawn is fixed, and the bishop on g7 ' +
          'stares at its own pawns while the knight heads for the outpost on c5 (via e2, c1 and d3) — a square no black ' +
          'pawn can ever attack. A knight loves a closed board.',
        fen: KNIGHT_CLOSED,
        shapes: ['c3e2', 'e2c1:blue', 'c1d3:blue', 'd3c5:blue', 'g7:red'],
      },
      {
        title: 'A knight on the rim',
        text:
          'From a Lichess game. The knight on h2 has strayed to the edge. Knights on the rim have few squares — and a ' +
          'king can take them all away.',
        fen: RIM_KNIGHT,
        shapes: ['f3g2', 'h2:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Kg2'],
          reply: 'Ng4',
          hint: 'Which squares does the knight have?',
          success:
            'Kg2! and the knight has only g4, where Nxg4 fxg4 trades it off — and the g4 pawn then falls to the king. Play on.',
          failure:
            'Kg2! attacks the knight and covers f1 and f3: it has only g4 left, where the e5 knight takes it.',
        },
      },
      {
        title: 'Take the knight',
        text: 'The knight jumped to g4 — its only square. Taking it is a trade, not a free piece, but the pawn that recaptures is lost: a won pawn ending.',
        fen: fenAfter('Kg2 Ng4', RIM_KNIGHT),
        task: {
          prompt: 'White to move.',
          moves: ['Nxg4'],
          hint: 'Trade the knights and count the pawns.',
          success:
            'Nxg4 fxg4 Kg3 and the g4 pawn cannot be defended: Kxg4 next, and White wins the pawn ending.',
          failure: 'Just take it: Nxg4 fxg4 Kg3 wins the g4 pawn and the ending.',
        },
      },
      {
        title: 'Pawns take squares from a bishop',
        text:
          'From a Lichess game. A bishop is no better on the rim of its diagonals. Black’s bishop on f6 has the pawns ' +
          'e5 and g6 around it and only two squares — and the white pawns can take them away.',
        fen: TRAPPED_BISHOP,
        shapes: ['g4g5', 'f6:red'],
        task: {
          prompt: 'White to move.',
          moves: ['g5'],
          reply: 'Bxg5',
          hint: 'The pawn attacks the bishop, and the bishop’s squares are all covered.',
          success: 'g5! Bxg5 hxg5 and the bishop is gone for a pawn. Play on.',
          failure:
            'g5! attacks the bishop, and every square it could go to is covered. It has to be given up.',
        },
      },
      {
        title: 'Collect it',
        text: 'The bishop took on g5 because it had nowhere else to go.',
        fen: fenAfter('g5 Bxg5', TRAPPED_BISHOP),
        task: {
          prompt: 'White to move.',
          moves: ['hxg5'],
          hint: 'Recapture.',
          success:
            'hxg5 — a bishop for a pawn. Queen against rook and bishop, with the black pieces loose: a winning position.',
          failure: 'hxg5 wins the bishop for a pawn.',
        },
      },
      {
        title: 'Trade into the right ending',
        text:
          'The choice of which pieces to keep is where this lesson meets the endgame. With pawns on both wings, aim for ' +
          '**bishop against knight** when you have the bishop; with one wing left or a blocked centre, keep the knight. ' +
          'And with bishops of opposite colour, remember that the *middlegame* favours the attacker while the *endgame* ' +
          'tends to a draw (see the lesson on opposite bishops).',
        fen: OPPOSITE_TRAP,
        shapes: ['c4:blue', 'c5:blue'],
      },
    ],
    practiceThemes: ['bishopEndgame', 'knightEndgame', 'trappedPiece'],
  },
  {
    id: 'the-initiative',
    title: 'The initiative',
    level: 'intermediate',
    category: 'Strategy',
    summary:
      'Having the initiative means your opponent answers your threats instead of making their own. Learn to keep it, to pay a pawn for it, and to kill it when you are the one under fire.',
    minutes: 8,
    steps: [
      {
        title: 'What the initiative is',
        text:
          'You have the **initiative** when your moves create threats and your opponent’s moves have to answer them. ' +
          'The side with the initiative chooses where the game is played; the other side reacts. It is worth material ' +
          'when your threats arrive faster than the opponent can consolidate — which is why the classic gambits give ' +
          'a pawn for tempi.\n\n' +
          'The Evans Gambit is the model: White gives the b-pawn to gain **time** (c3 and d4 with tempo, the centre, ' +
          'open lines against f7) while Black’s bishop has moved three times.',
        fen: EVANS,
        shapes: ['c4f7:red', 'd1b3', 'a5:red'],
      },
      {
        title: 'Do not stop to recapture',
        text:
          'Black has just taken a second pawn with ...dxc3. Recapturing (Nxc3) is natural, but it lets Black catch up ' +
          'in development. The initiative says: **make a threat instead**.',
        fen: EVANS,
        task: {
          prompt: 'White to move: keep the initiative.',
          moves: ['Qb3'],
          hint: 'Aim at f7 with a second piece.',
          success:
            'Qb3! attacks f7 and Black must find ...Qf6 or ...Qe7 while c3 stays alive for later (Nxc3 ' +
            'next). Three pawns down, White has every piece in play; Black has a bishop on a5 and a king in ' +
            'the centre.',
          failure:
            'Nxc3 gives Black time to develop. Qb3, hitting f7, keeps the pressure — the pawn on c3 can wait.',
        },
      },
      {
        title: 'Develop with threats',
        text:
          'The Fried Liver Attack: White has given a knight to drag the king to e6. A piece down, White cannot afford a ' +
          'quiet move — every move must **develop a piece and threaten something**.',
        fen: FRIED_LIVER,
        shapes: ['b1c3', 'c3d5:red', 'e6:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Nc3'],
          hint: 'Develop a piece so that it attacks the knight the king is defending.',
          success:
            'Nc3! attacks d5, and the pinned knight (Qf3 aims at it through the king) cannot be held for long: ...Ncb4 or ...Nce7 are the only tries, and d4 comes next with more threats. Slow moves like O-O let Black escape with ...Nd4.',
          failure:
            'A piece down, White cannot play quietly. Nc3 develops with an attack on the pinned knight — the initiative is everything here.',
        },
      },
      {
        title: 'Punish the grab',
        text:
          'From a Lichess game. Black has just captured a knight on c3 — greedy, because Black’s king and queen are ' +
          'still on their starting squares. With the initiative you punish that immediately.',
        fen: GREEDY,
        shapes: ['c4f7', 'd4d8:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Bxf7+'],
          reply: 'Kxf7',
          hint: 'A check that pulls the king off the queen’s defence.',
          success:
            'Bxf7+! Kxf7 Qxd8 and the queen is gone: the knight can be recaptured later. Play on.',
          failure: 'Recapturing on c3 would be fine — but Bxf7+ Kxf7 Qxd8 wins the queen at once.',
        },
      },
      {
        title: 'Finish it',
        text: 'The king has taken on f7 and the queen on d8 no longer has a defender.',
        fen: fenAfter('Bxf7+ Kxf7', GREEDY),
        task: {
          prompt: 'White to move.',
          moves: ['Qxd8'],
          hint: 'The queen is free.',
          success: 'Qxd8 — a queen for a bishop, and bxc3 will pick up the knight too.',
          failure: 'Take the queen: Qxd8.',
        },
      },
      {
        title: 'Keep going',
        text:
          'From a Lichess game. Black just took on c3 and expects bxc3. But the initiative is worth more than the pawn: ' +
          'is there a capture that keeps making threats?',
        fen: KEEP_GOING,
        shapes: ['e5f6', 'c3:red'],
        task: {
          prompt: 'White to move.',
          moves: ['exf6'],
          reply: 'c2',
          hint: 'Take with the pawn that keeps attacking.',
          success:
            'exf6! and Black’s c-pawn can run to c2 — but Qxc2 collects it, while the pawn on f6 wrecks the kingside. Play on.',
          failure:
            'bxc3 is passive. exf6! takes a knight and keeps the threats coming; the c-pawn is not going anywhere.',
        },
      },
      {
        title: 'Collect the runaway',
        text: 'The pawn reached c2, attacking the queen and dreaming of c1.',
        fen: fenAfter('exf6 c2', KEEP_GOING),
        task: {
          prompt: 'White to move.',
          moves: ['Qxc2'],
          hint: 'Simply take it.',
          success:
            'Qxc2 and White has won a piece for a pawn, with Black’s kingside ruined by the pawn on f6.',
          failure: 'Qxc2 takes the pawn and ends the threats.',
        },
      },
      {
        title: 'Killing an initiative',
        text:
          'Now the other side. The Danish Gambit: White has given two pawns for open lines and two bishops aimed at ' +
          'the black king. Grabbing more (…Nf6?) invites e5 and a storm. The recipe against an initiative is to **give ' +
          'material back to trade the attacking pieces**.',
        fen: DANISH,
        orientation: 'black',
        shapes: ['d7d5', 'c4:red', 'b2:red'],
        task: {
          prompt: 'Black to move: break the initiative.',
          moves: ['d5'],
          hint: 'Return a pawn to open your own lines and trade a bishop.',
          success:
            'd5! Bxd5 Nf6 Bxf7+ Kxf7 Qxd8 Bb4+ Qd2 Bxd2+ Nxd2 — queens and bishops come off, material is ' +
            'level and Black has nothing to fear in the quiet ending. The initiative died with the trades.',
          failure:
            'Holding on to both pawns keeps White’s bishops alive. d5! gives the material back and forces ' +
            'exchanges that end the attack.',
        },
      },
    ],
    practiceThemes: ['attackingF2F7', 'opening', 'sacrifice'],
  },
  {
    id: 'transitions-to-endgames',
    title: 'Transitions into the endgame',
    level: 'intermediate',
    category: 'Strategy',
    summary:
      'Trading queens changes everything. Learn which endings to steer into, how to force the trade you want, and which trades to refuse.',
    minutes: 8,
    steps: [
      {
        title: 'Ask before you trade',
        text:
          'Every exchange, above all the queen trade, is a transition into a different game. Before you allow one, ask:\n\n' +
          '- **Who is ahead?** Material advantages grow in the endgame; the side ahead usually wants queens off.\n' +
          '- **Whose king is better?** Without queens the king becomes a fighting piece — a centralised king is worth a pawn.\n' +
          '- **Which pieces stay?** Rook endings are drawish, opposite-coloured bishops are drawish, pawn endings are ' +
          'decisive. Choose the ending you can win (or hold).\n\n' +
          'Here Black is two pawns up, and White’s only hope is the queen. The transition is simple.',
        fen: TRADE_INTO_PAWNS,
        orientation: 'black',
        shapes: ['e4f3', 'g2:blue'],
      },
      {
        title: 'Into the pawn ending',
        text: 'Two pawns up, the pawn ending is a certain win. Take away the piece that could still create trouble.',
        fen: TRADE_INTO_PAWNS,
        orientation: 'black',
        task: {
          prompt: 'Black to move: choose the ending.',
          moves: ['Qxf3+'],
          reply: 'Kxf3',
          hint: 'The queen trade.',
          success:
            'Qxf3+ Kxf3 and it is a pawn ending two pawns up: bring the king, make a passed pawn, win. Keeping the queens is also winning, but why give White chances?',
          failure:
            'Keeping the queens keeps White’s hopes alive. Qxf3+ trades into a pawn ending two pawns up — the simplest win there is.',
        },
      },
      {
        title: 'Force the trade',
        text:
          'Black is a knight up, but with the queens on the board White can still make threats against the king. ' +
          'Black wants the queens off — and can **force** it: offer the trade *with check*, so that White has no ' +
          'time to decline.',
        fen: FORCE_TRADE,
        orientation: 'black',
        shapes: ['b4d4', 'd4g1:blue', 'd4d3:red'],
        task: {
          prompt: 'Black to move: force the queen exchange.',
          moves: ['Qd4+'],
          reply: 'Qxd4',
          hint: 'Find a protected square where your queen gives check and attacks the white queen.',
          success:
            'Qd4+! White has to take: after Kh1 or Kf1 the queen on d3 falls, and blocking with Qe3 only loses ' +
            'more. Qxd4 Nxd4 and the queens are off with Black a knight ahead. Play on.',
          failure:
            'Qd4+! offers the trade with check, on a square the knight protects: White has no time to avoid it.',
        },
      },
      {
        title: 'Complete the trade',
        text: 'White took on d4 — as intended.',
        fen: FORCE_TRADE_2,
        orientation: 'black',
        task: {
          prompt: 'Black to move.',
          moves: ['Nxd4'],
          hint: 'Recapture.',
          success: 'Nxd4 and the game is a technical win: a knight up with no counterplay.',
          failure: 'Nxd4 recaptures and leaves Black a knight up without queens.',
        },
      },
      {
        title: 'Use a pin to trade',
        text:
          'White is two pawns up and would like the queens off — but a plain offer can be declined. Offer the trade ' +
          'on a square where your queen **pins** the enemy queen against its king, and it cannot be refused.',
        fen: PIN_TRADE,
        shapes: ['d3d5', 'd5g8:blue', 'e6:red'],
        task: {
          prompt: 'White to move: force the queens off.',
          moves: ['Qd5'],
          reply: 'Qxd5',
          hint: 'Which square pins the queen on e6 to the king on g8 — and is protected twice?',
          success:
            'Qd5! pins the queen to g8: it may only move along the diagonal, so whatever Black does the queens come off — Qxd5 now, or Qxe6+ next move. White stays two pawns up. Play on.',
          failure:
            'Qd5! pins the queen against the king; after Qxd5 White recaptures and keeps the extra pawns without any counterplay.',
        },
      },
      {
        title: 'Recapture',
        text: 'The queen took on d5.',
        fen: fenAfter('Qd5 Qxd5', PIN_TRADE),
        task: {
          prompt: 'White to move.',
          moves: ['Nxd5', 'Rxd5'],
          hint: 'Take back.',
          success: 'Recaptured — and Black has nothing left to attack with.',
          failure: 'Nxd5 or Rxd5 completes the exchange.',
        },
      },
      {
        title: 'Into a won pawn ending',
        text:
          'From a Lichess game. Queens against each other again; Black’s queen is on c4 protected by the d5 pawn. White is ' +
          'not ahead in material — but count the pawn ending after the trade: White’s king reaches e3 and the black pawns ' +
          'are targets.',
        fen: QUEENS_OFF,
        shapes: ['d3c4', 'e2e3:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Qxc4'],
          reply: 'dxc4',
          hint: 'Trade, then the king.',
          success:
            'Qxc4! dxc4 Ke3 and the king walks to d4 and c5: the b-pawn falls, then c4, while Black’s king is still on the kingside. Evaluating the pawn ending before trading is the whole skill.',
          failure:
            'Qxc4! dxc4 Ke3 wins the pawn ending: the king reaches d4 and c5, and the queenside pawns fall.',
        },
      },
      {
        title: 'Trades to refuse',
        text:
          'The same thinking says **no** to some trades. Ahead by a pawn, do not trade into opposite-coloured bishops: here ' +
          'Black’s extra pawn means nothing, because White’s king and bishop hold the light squares in front of it for ever ' +
          'and the black bishop can never help there. Keep a rook or a knight on the board instead, and only trade when ' +
          'the ending you get is one you can win.',
        fen: OPPOSITE_TRAP,
        shapes: ['c5:red', 'c4:blue'],
      },
    ],
    practiceThemes: ['queenEndgame', 'pawnEndgame'],
  },
];
