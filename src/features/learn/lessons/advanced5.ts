import { fenAfter, type Lesson } from '../model';

// Defending worse positions: rook and pawn against rook, the defender to move.
const DEF_CHECK_DISTANCE = '4k3/2K5/3P4/8/4r3/8/3R4/8 b - - 0 1';
const DEF_BEHIND = '5R2/1k6/3P4/2K5/8/8/1r6/8 b - - 0 1';
const DEF_KING_FRONT = 'k7/8/2P1R3/2K5/8/r7/8/8 b - - 0 1';
const DEF_SIMPLIFY = '3k4/8/4RP2/5K2/4r3/8/8/8 b - - 0 1';
const DEF_CHECK_FIRST = '3k4/1K6/2P5/8/8/8/4r3/5R2 b - - 0 1';
const DEF_FORTRESS = 'kb6/8/2K5/8/8/8/3R4/8 w - - 0 1';

// Zwischenzug and quiet moves (positions from Lichess games, CC0 puzzle database).
const ZW_TRADE_FIRST = 'r1bqr1k1/ppp2p1p/5p1b/4p2Q/2P1P3/8/PPP2PPP/3R1RK1 w - - 0 15';
const ZW_TRADE_FIRST_2 = fenAfter('Rxd8 Rxd8', ZW_TRADE_FIRST);
const ZW_CHECK = '5rk1/ppp2ppp/1n6/8/3Q1qb1/1B3NN1/PP3PK1/R3R3 b - - 0 19';
const ZW_CHECK_2 = fenAfter('Bxf3+ Kg1', ZW_CHECK);
const ZW_BEFORE_RECAPTURE = 'r1bq1rk1/pp2bppp/2n1p3/3p4/3P4/P2BPNn1/1PQN1PPP/R3K2R w KQ - 0 12';
const ZW_ENDGAME = '3N4/4R1p1/p4k1p/r4P2/8/6PP/8/5K2 b - - 0 55';
const QUIET_ROOK_LIFT = '1r4k1/5p2/3p2pQ/2pq4/4R3/5PP1/6PK/8 w - - 0 30';
const QUIET_KNIGHT = '4k3/N3P3/1n2K3/8/p7/8/8/8 w - - 0 55';
const QUIET_BEHIND = '8/4k2p/pPp2p2/6p1/r7/7P/5PP1/3R2K1 w - - 0 35';

// Sicilian plans.
const NAJDORF_D5 = fenAfter(
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O 9. Be3 Be6 10. f4 exf4 11. Bxf4 Nc6 12. Kh1',
);
const SICILIAN_START = fenAfter('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5');
const ENGLISH_ATTACK = fenAfter(
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7',
);
const ENGLISH_ATTACK_BB3 = fenAfter(
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 18. Kb1 bxc2+ 19. Nxc2',
);
const DRAGON_SAC = '2r2rk1/pp1bppbp/3p1np1/q3n3/3NP1PP/1BN1BP2/PPPQ4/1K1R3R b - - 0 14';

// King's Indian plans.
const KID_F5 = fenAfter(
  '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Be3',
);
const KID_G5 = fenAfter(
  '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Be3 f5 11. f3 f4 12. Bf2',
);
const KID_C5 = fenAfter(
  '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Nd3 f5 11. Bd2 Nf6 12. f3 f4',
);
const KID_BAYONET = fenAfter(
  '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. b4',
);

// Practical play (positions from Lichess games, CC0 puzzle database).
const PRACTICAL_SIMPLIFY = '8/5pk1/2p3p1/8/2R5/1P5P/2r3P1/7K b - - 2 33';
const PRACTICAL_SIMPLIFY_2 = '8/8/1p6/5kp1/P7/3K3P/1rR5/8 b - - 0 51';
const PRACTICAL_CALM = '8/8/8/6k1/1P6/3p4/5K1P/8 w - - 0 41';

// Attacking with opposite-coloured bishops (positions from Lichess games, CC0 puzzle database).
const OPP_PIN = 'r4rkq/4bp2/3p2p1/p1p1p1QP/4P3/1B1P1P2/1PPK4/6R1 w - - 0 30';
const OPP_LONG_DIAGONAL = '2r2r1k/8/p2bQq1p/1ppBp3/3p3R/1P1P2P1/P4P1P/6K1 w - - 6 34';
const OPP_LONG_DIAGONAL_2 = fenAfter('Rxh6+ Kg7', OPP_LONG_DIAGONAL);
const OPP_BLACK = 'R3r1k1/1p3p1p/2p2Pp1/3pP1PP/1q1Bb3/4P1Q1/5R2/6K1 b - - 0 30';
const OPP_BLACK_2 = fenAfter('Qe1+ Rf1', OPP_BLACK);
const OPP_ENDGAME = '8/5pk1/6p1/p1b4p/P1B1p3/6P1/5PKP/8 w - - 0 1';

export const advancedLessons5: Lesson[] = [
  {
    id: 'defending-worse-positions',
    title: 'Defending worse positions',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'Bad positions are not lost positions. The defender’s tools — activity, checks from a distance, the king in front, simplification into known draws, fortresses — with the rook endings where they matter most.',
    minutes: 9,
    steps: [
      {
        title: 'The defender’s toolbox',
        text:
          'Most games are decided by the side that defends worse, not the side that attacks better. When you stand worse:\n\n' +
          '- **Activity before material.** A pawn given for an active rook or king is usually a good deal.\n' +
          '- **Know the drawn endings** and steer for them: rook and pawn against rook with the king in front, opposite ' +
          'bishops, king against king.\n' +
          '- **Check from a distance.** A rook three or more files away from the enemy king can check for ever; a rook next ' +
          'to it gets attacked.\n' +
          '- **Look for a fortress** — a set-up the stronger side cannot break — and for counterplay that keeps them busy.\n' +
          '- **Make them prove it.** Do not resign in your head; the win still has to be found and executed.\n\n' +
          'The rook endings that follow are the ones where these tools decide.',
        fen: DEF_CHECK_DISTANCE,
        orientation: 'black',
        shapes: ['e4c4', 'c4c1:blue', 'd6:red'],
      },
      {
        title: 'Checking distance',
        text:
          'White’s king shelters the pawn from c7. The rook on e4 does nothing there, and the pawn threatens to run. ' +
          'Chase the king first — from far enough away that it cannot come back at the rook — then get **behind** the pawn.',
        fen: DEF_CHECK_DISTANCE,
        orientation: 'black',
        task: {
          prompt: 'Black to move: draw.',
          moves: ['Rc4+'],
          hint: 'A check along the c-file.',
          success:
            'Rc4+! Kb6 Kd7! (the king in front of the pawn) Kb5 Rc6 and the pawn cannot advance; or Kb6 Rc1 and the rook checks and attacks from behind. Kf7? or a rook move without check loses to d7.',
          failure:
            'Only Rc4+ holds. Drive the king away, then bring your own king in front of the pawn or the rook behind it.',
        },
      },
      {
        title: 'Behind the pawn',
        text:
          'Tarrasch’s rule: **rooks belong behind passed pawns** — your own or the enemy’s. From behind, the rook attacks the ' +
          'pawn every time it advances and never has to move; from the side it is driven away with checks.',
        fen: DEF_BEHIND,
        orientation: 'black',
        shapes: ['b2d2', 'd6:red'],
        task: {
          prompt: 'Black to move: draw.',
          moves: ['Rd2'],
          hint: 'Where can the rook watch the pawn from for ever?',
          success:
            'Rd2! and the pawn is fixed: it cannot advance without being taken, and the king cannot support it without walking into checks from behind. Rg8 Rd1, Re8 Rd2 — White makes no progress. Rc2+? drives the king forward and loses.',
          failure:
            'Only Rd2 holds — the rook behind the pawn. Checks from the side just help the white king escort it.',
        },
      },
      {
        title: 'The king in front',
        text:
          'The simplest drawing method: get the **king in front of the pawn**. A king on b8 against a c-pawn cannot be ' +
          'driven away by checks, because it always has a square in front of the pawn to go to.',
        fen: DEF_KING_FRONT,
        orientation: 'black',
        shapes: ['a8b8', 'c6:red'],
        task: {
          prompt: 'Black to move: draw.',
          moves: ['Kb8'],
          hint: 'Which square blocks the pawn’s path for good?',
          success:
            'Kb8! Re8+ Kc7 Re7+ Kd8 (or Kc8) and White gets nowhere — the king shuffles between the squares in front of the pawn. Ka7? Re7+ and the king is cut off from c8.',
          failure:
            'Only Kb8 holds. In front of the pawn the king can never be checked away; on a7 it is cut off.',
        },
      },
      {
        title: 'Simplify into a known draw',
        text:
          'The defender’s favourite trade: give the rook for the pawn when the remaining **king against king** (or king and ' +
          'pawn against king with the king in front) is a book draw. Here the pawn on f6 is defended only by the rook.',
        fen: DEF_SIMPLIFY,
        orientation: 'black',
        shapes: ['e4e6', 'e8:blue'],
        task: {
          prompt: 'Black to move: draw.',
          moves: ['Rxe6'],
          hint: 'Take, and then head for the square in front of the pawn.',
          success:
            'Rxe6! Kxe6 Ke8! and the opposition holds: Ke5 Kf7, or f7+ Kf8 Kf6 stalemate. Any rook move instead lets the pawn advance with the rook’s support.',
          failure:
            'Rxe6! trades into king and pawn against king, and after Kxe6 Ke8 Black takes the opposition: a book draw.',
        },
      },
      {
        title: 'Check first, then go behind',
        text: 'One more: the pawn is on c6 with the king beside it, and Black’s rook stands on the wrong file.',
        fen: DEF_CHECK_FIRST,
        orientation: 'black',
        task: {
          prompt: 'Black to move: draw.',
          moves: ['Rb2+'],
          hint: 'Drive the king away from the pawn before it can escort it.',
          success:
            'Rb2+! Ka6 Kc7! and the king blockades: Rf6 Rb6+ Ka5 Rxc6 — the pawn falls. Rc2? c7+ and the pawn queens with check.',
          failure:
            'Rb2+ first: the king must leave the pawn, and the black king reaches c7 in front of it.',
        },
      },
      {
        title: 'Fortresses and swindles',
        text:
          'A **fortress** is a position the stronger side cannot break however long they try. Rook against bishop is ' +
          'the classic: the defending king goes to a corner of the **opposite colour to its bishop** — here the ' +
          'dark-squared bishop and the king on the light square a8. The rook can never drive it out, because every ' +
          'checking square next to the corner is covered by the bishop or leads to stalemate. Draw.\n\n' +
          'And when nothing else works, set problems: threats that need exact answers, unexpected sacrifices, stalemate ' +
          'tricks. A swindle is not luck — it is the last tool of the defender.',
        fen: DEF_FORTRESS,
        shapes: ['a8:green', 'b8:blue'],
      },
    ],
    practiceThemes: ['defensiveMove', 'rookEndgame'],
  },
  {
    id: 'zwischenzug-and-quiet-moves',
    title: 'Zwischenzug and quiet moves',
    level: 'advanced',
    category: 'Tactics',
    summary:
      'The in-between move and the quiet move are the two tactics calculation misses most: a check or capture before the “obvious” recapture, and a move that threatens without checking.',
    minutes: 8,
    steps: [
      {
        title: 'The move between',
        text:
          'A **zwischenzug** (in-between move) is a move inserted before the expected reply — usually a check or a capture ' +
          'that changes the situation so that the “forced” recapture no longer works. It is missed because we calculate ' +
          '“I take, they take” as one unit.\n\n' +
          'Train the habit: before every recapture, ask **“is there something better than taking back?”** — a check, a ' +
          'capture of a bigger piece, a threat that has to be answered first.\n\n' +
          'From a Lichess game: the queen on h5 attacks the bishop on h6, but Qxh6 at once runs into ...Qe7!, and the ' +
          'queen is caught in a net on h6 (...Re6 next). Is there an in-between move?',
        fen: ZW_TRADE_FIRST,
        shapes: ['d1d8', 'h5h6:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Rxd8'],
          reply: 'Rxd8',
          hint: 'Remove the queen first — with tempo.',
          success: 'Rxd8! Rxd8 and now Qxh6 wins the bishop for nothing. Play on.',
          failure:
            'Qxh6? Qe7! and the queen on h6 is trapped. Trade the queens first: Rxd8 Rxd8, then take the bishop.',
        },
      },
      {
        title: 'Now the bishop',
        text: 'The queens are gone and the bishop on h6 is still attacked.',
        fen: ZW_TRADE_FIRST_2,
        task: {
          prompt: 'White to move.',
          moves: ['Qxh6'],
          hint: 'Free piece.',
          success: 'Qxh6 — a piece up. The order of captures was everything.',
          failure: 'Qxh6 takes the bishop now that the queen trade is done.',
        },
      },
      {
        title: 'A check first',
        text:
          'From a Lichess game. Black’s queen is attacked by the queen on d4; the natural ...Qxd4 lets Nxd4. But Black ' +
          'has a check available, and a check must be answered before anything else.',
        fen: ZW_CHECK,
        orientation: 'black',
        shapes: ['g4f3', 'f4d4:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Bxf3+'],
          reply: 'Kg1',
          hint: 'Take the knight with check.',
          success:
            'Bxf3+! Kg1 and now the knight that guarded d4 is gone: Qxd4 wins the queen. Play on.',
          failure:
            'Bxf3+ first: it takes the knight with check, and after the king moves the queen on d4 is undefended.',
        },
      },
      {
        title: 'Collect',
        text: 'The king stepped to g1; the queen on d4 has no defender any more.',
        fen: ZW_CHECK_2,
        orientation: 'black',
        task: {
          prompt: 'Black to move.',
          moves: ['Qxd4'],
          hint: 'Take the queen.',
          success:
            'Qxd4 and Black is a queen up. Check, then capture — the order made the difference.',
          failure: 'Qxd4 takes the queen for free.',
        },
      },
      {
        title: 'Before the recapture',
        text:
          'From a Lichess game. Black’s knight has just landed on g3 and hxg3 is the obvious reply. Before you take back, ' +
          'look for a check.',
        fen: ZW_BEFORE_RECAPTURE,
        shapes: ['d3h7', 'g3:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Bxh7+'],
          reply: 'Kh8',
          hint: 'The bishop on d3 sees h7.',
          success:
            'Bxh7+! Kh8 hxg3 — the knight is still taken, and White has pocketed a pawn on the way (the bishop escapes with check later). Play on.',
          failure:
            'hxg3 is fine, but Bxh7+ first wins a pawn: the check must be answered, and the knight is still hanging afterwards.',
        },
      },
      {
        title: 'Then take the knight',
        text: 'The king went to h8 and the knight on g3 is still there.',
        fen: fenAfter('Bxh7+ Kh8', ZW_BEFORE_RECAPTURE),
        task: {
          prompt: 'White to move.',
          moves: ['hxg3'],
          hint: 'The recapture, one move later than expected.',
          success: 'hxg3 and White is a pawn up with a strong position.',
          failure: 'hxg3 takes the knight now.',
        },
      },
      {
        title: 'In the endgame too',
        text:
          'From a Lichess game. White’s rook on e7 and knight are both attacked, and Kxe7 seems automatic. But the pawn on ' +
          'f5 is also there for the taking — with check.',
        fen: ZW_ENDGAME,
        orientation: 'black',
        shapes: ['a5f5', 'e7:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['Rxf5+'],
          reply: 'Ke2',
          hint: 'A capture with check keeps everything else hanging.',
          success:
            'Rxf5+! Ke2 Kxe7 — a pawn more than the immediate Kxe7 would have given. Play on.',
          failure:
            'Rxf5+ takes a pawn with check; the rook on e7 is still there to be taken next move.',
        },
      },
      {
        title: 'Quiet moves',
        text:
          'The other tactic calculation misses is the **quiet move**: no check, no capture, but a threat the opponent ' +
          'cannot meet. Attacks are often decided by one.\n\n' +
          'From a Lichess game. White’s queen sits on h6 next to the black king; Qh8+ is nothing yet. Find the move that ' +
          'creates an unstoppable threat.',
        fen: QUIET_ROOK_LIFT,
        shapes: ['e4h4', 'h7:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Rh4'],
          reply: 'Qe5',
          hint: 'Bring the rook to the h-file and threaten mate on h7.',
          success:
            'Rh4! threatens Qh7 mate. Black’s only defence, Qe5, is met by Qh7+ Kf8 Qh8+ and the queen goes. Play on.',
          failure:
            'No check works yet. Rh4! is quiet, but Qh7 mate cannot be stopped without losing the queen.',
        },
      },
      {
        title: 'The quiet knight',
        text:
          'From a Lichess game. e7 will promote if the knight on b6 is diverted. There is no check — but there is a quiet ' +
          'move that leaves Black without a defence.',
        fen: QUIET_KNIGHT,
        shapes: ['a7b5', 'd6:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Nb5'],
          reply: 'a3',
          hint: 'From which square does the knight give mate?',
          success: 'Nb5! and Nd6 is mate next move — Black has no way to stop it. Play on.',
          failure: 'Nb5! threatens Nd6 mate, and nothing can prevent it.',
        },
      },
      {
        title: 'The rook behind the pawn',
        text:
          'From a Lichess game. The b-pawn is on b6 and Black’s rook on a4 watches it from the side. The winning move makes ' +
          'no threat that can be seen at once — but it decides.',
        fen: QUIET_BEHIND,
        shapes: ['d1b1', 'b6b7:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Rb1'],
          reply: 'Rd4',
          hint: 'Where do rooks belong?',
          success:
            'Rb1! and b7 cannot be stopped: Rd4 b7 Rd8 (or Rb4 Rxb4) and the pawn queens. Play on.',
          failure:
            'Rb1! puts the rook behind the passed pawn; b7 and b8 follow and the rook on a4 can only watch.',
        },
      },
    ],
    practiceThemes: ['intermezzo', 'quietMove'],
  },
  {
    id: 'sicilian-plans',
    title: 'Plans in the Sicilian',
    level: 'advanced',
    category: 'Openings',
    summary:
      'The Open Sicilian by plans, not moves: the ...d5 break, the half-open c-file and the exchange sacrifice on c3 for Black; the kingside pawn storm for White.',
    minutes: 9,
    steps: [
      {
        title: 'The shape of the fight',
        text:
          'After 1. e4 c5 and d4 cxd4, Black has traded a wing pawn for a centre pawn. That gives the Sicilian its ' +
          'character:\n\n' +
          '- Black has the **half-open c-file** (pressure on c3 and c2), the pawn lever **...d5** to equalise in the ' +
          'centre, and often ...b5-b4 to chase the c3 knight.\n' +
          '- White has more space and a lead in development, so White attacks — on the kingside with f4-f5 or ' +
          'g4-g5, or by castling long and storming.\n\n' +
          'The Najdorf with 6. Be2 e5 is the classic picture: Black’s d6–e5 chain leaves a hole on d5, and the whole ' +
          'game is about whether Black can play ...d5 anyway.',
        fen: SICILIAN_START,
        orientation: 'black',
        shapes: ['d5:red', 'c8c2:blue', 'd6d5'],
      },
      {
        title: 'The ...d5 break',
        text:
          'Every Sicilian player’s first question in a new position: **“Can I play ...d5?”** Here everything is ready — ' +
          'the e6 bishop supports it, the knights are out, and White’s f4 has opened the e-file.',
        fen: NAJDORF_D5,
        orientation: 'black',
        task: {
          prompt: 'Black to move: free the position.',
          moves: ['d5'],
          hint: 'The break in the centre.',
          success:
            'd5! and after exd5 Nxd5 Nxd5 Bxd5 (or e5 Ne4) Black has full equality: no more weak d6 pawn, active pieces, and the c-file. Slow moves let White build up with Qe1-g3.',
          failure:
            'Playable, but ...d5! is the move the whole set-up was for. It dissolves the d6 weakness at once.',
        },
      },
      {
        title: 'The exchange sacrifice on c3',
        text:
          'The half-open c-file gives Black a standard weapon: **...Rxc3**. The rook goes for the knight that holds White’s ' +
          'centre together, and after bxc3 White’s king (castled long) has no pawn cover while Black’s pieces pour in ' +
          'along the diagonals and the c-file. It is not a sacrifice to calculate to mate — it is a change of the ' +
          'position’s nature, and in the Dragon and the Najdorf it is often Black’s best practical chance under attack.\n\n' +
          'Here Black is under pressure on the kingside; ...Rxc3 bxc3 gives the knight on e5 the c4 square and the queen ' +
          'the a-file, and the pawn cover in front of the white king is gone.',
        fen: DRAGON_SAC,
        orientation: 'black',
        shapes: ['c8c3:red', 'e5c4:blue', 'a5a2:blue'],
      },
      {
        title: 'White’s plan: the pawn storm',
        text:
          'Against the Najdorf, the English Attack plan is the clearest: Be3, f3, Qd2, castle long — and then **g4-g5** to ' +
          'drive the f6 knight away from the defence of d5 and h7. Slow moves give Black time for ...b5-b4.',
        fen: ENGLISH_ATTACK,
        shapes: ['g2g4', 'g4g5:blue', 'f6:red'],
        task: {
          prompt: 'White to move: start the attack.',
          moves: ['g4'],
          hint: 'The pawn that kicks the knight.',
          success:
            'g4! b5 g5 b4 and both sides are racing — Black’s ...b4 hits the c3 knight, but White’s knight goes to e2 and the storm continues with h4, Rg1 and f4-f5. That race is the whole opening.',
          failure:
            'The plan is g4-g5, chasing the f6 knight. Everything else lets Black start the queenside first.',
        },
      },
      {
        title: 'Black’s counterplay',
        text:
          'A famous position from that race. White’s king is on b1, Black has pushed ...b3 and ...bxc2, and the ' +
          'knight on c2 is the last defender. Black has an astonishing quiet move that shows what the queenside ' +
          'counterplay is all about — every piece aims at the king.',
        fen: ENGLISH_ATTACK_BB3,
        orientation: 'black',
        shapes: ['e6b3', 'a4a3:blue', 'b1:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['Bb3'],
          hint: 'A piece that cannot be taken because of what follows on the a-file.',
          success:
            'Bb3!! axb3 axb3 and the a-file opens onto the king: the knight on c2 is pinned against it and ...Ra5-a1 follows. White has to play Na3 and hope. This is the Sicilian: White attacks on the kingside, and Black’s pawns and pieces arrive first on the other wing.',
          failure:
            'Bb3!! is the move: it cannot be taken (axb3 axb3 opens the a-file onto the king), and it dominates the knight on c2.',
        },
      },
      {
        title: 'Summary',
        text:
          '**For Black:** ask about ...d5 every move; use the c-file (…Rc8, pressure on c3, the ...Rxc3 sacrifice when ' +
          'the king is on c1); push ...b5-b4 against a queenside-castled king; keep the knight on f6 to hold d5 and ' +
          'h7.\n\n' +
          '**For White:** develop fast and attack — f4-f5 against the e6 structures, g4-g5 with the king on c1 against ' +
          '...e5 structures; occupy d5 when Black cannot challenge it; and never let the game go quiet, because a quiet ' +
          'Sicilian is Black’s Sicilian.',
        fen: ENGLISH_ATTACK,
        shapes: ['d5:blue', 'g2g4', 'b7b5:red'],
      },
    ],
    practiceThemes: ['opening', 'middlegame'],
  },
  {
    id: 'kings-indian-plans',
    title: 'Plans in the King’s Indian',
    level: 'advanced',
    category: 'Openings',
    summary:
      'A closed centre and two attacks on opposite wings: ...f5, ...f4 and ...g5-g4 for Black, c5 and the queenside for White. The classical King’s Indian by plans.',
    minutes: 9,
    steps: [
      {
        title: 'Where the pawn chains point',
        text:
          'In the Classical King’s Indian after d5, the centre is locked: White’s chain c4–d5 points to the queenside, ' +
          'Black’s d6–e5 to the kingside. The rule for locked centres: **attack where your chain points**, with the ' +
          'pawn break at the head of the chain.\n\n' +
          '- **Black** plays for **...f5**, then ...f4 to close the e3–f2 diagonal, ...g5-g4 to open lines, and the ' +
          'knights come to g6/f6 while the rook lifts to f6-h6.\n' +
          '- **White** plays for **c5** (after Nd3 or Rc1 and b4), opens the c-file, invades on c7 with a knight on b5, ' +
          'and only defends on the kingside when it must.\n\n' +
          'Both sides know the other’s plan; the game is a race, and tempi matter more than material.',
        fen: KID_F5,
        orientation: 'black',
        shapes: ['f7f5', 'c4c5:red', 'd6e5:blue', 'd5c4:blue'],
      },
      {
        title: '...f5',
        text: 'The knight has retreated to d7 to let the f-pawn go. Nothing else on the kingside makes sense before this.',
        fen: KID_F5,
        orientation: 'black',
        task: {
          prompt: 'Black to move: start the kingside plan.',
          moves: ['f5'],
          hint: 'The pawn break at the head of the chain.',
          success:
            'f5! and after f3 f4 Bf2 g5 the storm is on. Black never takes on e4 (that would open the centre for White’s pieces); the pawn goes to f4 and the g-pawn follows.',
          failure:
            'Every King’s Indian plan on the kingside starts with ...f5. Play it while White is regrouping.',
        },
      },
      {
        title: '...g5',
        text:
          'The f-pawn is on f4 and White’s bishop has gone to f2. Now the storm needs the g-pawn: ...g5-g4 opens the ' +
          'g-file and the h3 square, and ...Rf6-h6 comes behind it.',
        fen: KID_G5,
        orientation: 'black',
        shapes: ['g6g5', 'g5g4:blue', 'f8f6:blue'],
        task: {
          prompt: 'Black to move: continue the storm.',
          moves: ['g5'],
          hint: 'The pawn behind the f-pawn.',
          success:
            'g5! (…h5 first is also good) and after Nd3 Ng6 c5 Nf6 the race is on: ...g4, ...Rf7-g7, ...Nh5 against c5-cxd6 and Nb5. Note that Black leaves the f6 knight for later — it belongs on f6 only once ...g5 is in.',
          failure:
            'The plan needs ...g5 (or ...h5 first) — the pawns must go forward before the pieces can attack.',
        },
      },
      {
        title: 'White’s break: c5',
        text:
          'White’s turn. The knight has gone to d3 to support the break, and Black’s f-pawn has already reached f4. ' +
          'Waiting is fatal here; White must open the queenside now.',
        fen: KID_C5,
        shapes: ['c4c5', 'c5d6:red', 'c1c7:blue'],
        task: {
          prompt: 'White to move: start the queenside plan.',
          moves: ['c5'],
          hint: 'The break at the head of White’s chain.',
          success:
            'c5! and after ...g5 cxd6 cxd6 Nb5 White is already on c7 while Black is still preparing ...g4. (a4 and Rc1 first are also playable, but the break is the point.)',
          failure:
            'The queenside plan is c5 — open the c-file before Black’s pawns arrive on the other wing.',
        },
      },
      {
        title: 'The Bayonet: 9. b4',
        text:
          'White’s most direct version: 9. b4, going for c5 at once. Black’s standard answer is the knight to **h5**, ' +
          'preparing ...f5 and eyeing f4, rather than the slower ...Nd7 (which would let c5 come with tempo).',
        fen: KID_BAYONET,
        orientation: 'black',
        shapes: ['f6h5', 'h5f4:blue', 'f7f5:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Nh5', 'a5'],
          hint: 'The knight goes where it prepares ...f5 and can jump to f4.',
          success:
            'Nh5! and after Re1 f5 (or c5 Nf4) the fight is on. ...a5 first, to slow b4-b5, is the other main way.',
          failure:
            'Against 9. b4 the knight goes to h5 (or Black plays ...a5 to slow the queenside): ...Nd7 lets c5 come with tempo.',
        },
      },
      {
        title: 'Summary',
        text:
          '**Black:** ...f5 (never ...fxe4), ...f4, ...g5-g4, knights to g6 and f6, rook to f7-g7 or f6-h6, and do not ' +
          'defend the queenside — a tempo there is a tempo less on the kingside.\n\n' +
          '**White:** c5 with Nd3 or Rc1 and b4, cxd6 to open the c-file, Nb5 to c7, Bxa7 when it is free — and one ' +
          'defensive move on the kingside at the right moment (g4!? or Bf2, Nf2) is worth more than three early.',
        fen: KID_C5,
        shapes: ['c4c5', 'g6g5:red', 'c3b5:blue'],
      },
    ],
    practiceThemes: ['opening', 'kingsideAttack', 'queensideAttack'],
  },
  {
    id: 'practical-play-and-time',
    title: 'Practical play and the clock',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'Winning chess is not finding the best move; it is making good decisions with the time you have. When to calculate, when to play by hand, when to simplify, and how to stay out of time trouble.',
    minutes: 7,
    steps: [
      {
        title: 'The clock is a piece',
        text:
          'Every move costs time, and time spent early cannot be spent later. The practical player spends it where it ' +
          'changes the result:\n\n' +
          '- **Critical moments** — a pawn break, an exchange, a sacrifice, a transition into an endgame — deserve ' +
          'minutes. A developing move in a familiar position deserves seconds.\n' +
          '- **When you cannot decide between two good moves, play either.** The difference is usually smaller than ' +
          'the time you are losing.\n' +
          '- **Keep a reserve** for the ending, where calculation is concrete and mistakes are final.\n\n' +
          'A useful habit: before each move, ask *“is this a moment?”* If not, trust your hand.',
        fen: PRACTICAL_SIMPLIFY,
        orientation: 'black',
      },
      {
        title: 'When ahead, simplify',
        text:
          'From a Lichess game. Black is a pawn up in a rook ending — the kind of position that is easy to spoil in time ' +
          'trouble. The practical decision: trade rooks and win the pawn ending, where nothing can go wrong.',
        fen: PRACTICAL_SIMPLIFY,
        orientation: 'black',
        shapes: ['c2c4', 'g7f6:blue'],
        task: {
          prompt: 'Black to move: choose the simplest win.',
          moves: ['Rxc4'],
          reply: 'bxc4',
          hint: 'Trade into the ending you can count.',
          success:
            'Rxc4! bxc4 Kf6 and the king walks to e5, d4 and c4: two connected passed pawns follow. Play on.',
          failure:
            'Keeping the rooks may also win, but Rxc4! bxc4 Kf6 leads to a pawn ending that wins itself — the practical choice.',
        },
      },
      {
        title: 'Walk the king',
        text: 'The rooks are gone; the c4 pawn is going to fall and Black’s king is faster than White’s.',
        fen: fenAfter('Rxc4 bxc4', PRACTICAL_SIMPLIFY),
        orientation: 'black',
        task: {
          prompt: 'Black to move.',
          moves: ['Kf6'],
          hint: 'The king heads for e5 and d4.',
          success:
            'Kf6 — Ke5, Kd4 and Kxc4 come next. A pawn ending like this needs no calculation at all.',
          failure: 'Kf6, heading for e5 and d4, wins the c-pawn and the game.',
        },
      },
      {
        title: 'Again: count, then trade',
        text:
          'From a Lichess game. Black to move, a pawn up, both rooks attacked. Count the pawn ending after the rook trade ' +
          'before you decide — it is the kind of counting that takes twenty seconds and saves twenty minutes.',
        fen: PRACTICAL_SIMPLIFY_2,
        orientation: 'black',
        shapes: ['b2c2', 'f5f4:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Rxc2'],
          reply: 'Kxc2',
          hint: 'The pawn ending is won — reach it.',
          success:
            'Rxc2! Kxc2 Kf4 and the black king takes h3 while the white king is far too slow to stop both the g-pawn and the b-pawn. Play on.',
          failure:
            'Rxc2! Kxc2 Kf4 wins: Black’s king collects h3 and the g-pawn runs, and White’s a-pawn is too slow.',
        },
      },
      {
        title: 'The king goes forward',
        text: 'Black is a pawn up in the pawn ending and the white king is on c2.',
        fen: fenAfter('Rxc2 Kxc2', PRACTICAL_SIMPLIFY_2),
        orientation: 'black',
        task: {
          prompt: 'Black to move.',
          moves: ['Kf4'],
          hint: 'Head for the h3 pawn.',
          success: 'Kf4! Kd3 Kg3 and h3 falls; the g-pawn promotes long before White’s a-pawn.',
          failure: 'Kf4, heading for g3 and h3, wins.',
        },
      },
      {
        title: 'Do not panic in the pawn race',
        text:
          'From a Lichess game. Both sides have a passed pawn; Black’s d-pawn is closer. In time trouble the hand plays ' +
          'Kxd3? or Ke2? and draws. Count instead: who queens first, and with check?',
        fen: PRACTICAL_CALM,
        shapes: ['b4b5', 'd3d2:red'],
        task: {
          prompt: 'White to move.',
          moves: ['b5'],
          reply: 'd2',
          hint: 'Your pawn runs; the black pawn can be stopped by the king.',
          success:
            'b5! d2 Ke2 — the king stops the d-pawn while the b-pawn cannot be caught. Play on.',
          failure: 'b5! runs first: after ...d2 Ke2 the d-pawn is stopped and the b-pawn queens.',
        },
      },
      {
        title: 'Stop the runner',
        text: 'Black pushed to d2. One king move ends it.',
        fen: fenAfter('b5 d2', PRACTICAL_CALM),
        task: {
          prompt: 'White to move.',
          moves: ['Ke2'],
          hint: 'Cover the queening square.',
          success: 'Ke2 and the d-pawn is lost while b6-b7-b8 runs unopposed.',
          failure: 'Ke2 stops the pawn; then the b-pawn queens.',
        },
      },
      {
        title: 'Time trouble rules',
        text:
          'When the clock gets low:\n\n' +
          '- **Play the move you would play with more time** — do not switch to a “safe” move you have not checked.\n' +
          '- **Simplify** when ahead, **complicate** when behind; trades are easier to play quickly than attacks.\n' +
          '- **Do not check every move** — a check that does nothing costs a tempo and a second.\n' +
          '- **Write nothing off**: with seconds left, the opponent is human too.\n\n' +
          'And the only cure is prevention: spend your time on the moments that matter, and let the rest go by hand.',
        fen: PRACTICAL_CALM,
      },
    ],
    practiceThemes: ['endgame', 'pawnEndgame'],
  },
  {
    id: 'attacking-with-opposite-bishops',
    title: 'Attacking with opposite-coloured bishops',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Opposite-coloured bishops draw endgames — and win middlegames. The attacker’s bishop is a piece the defender can never challenge: attack on its colour.',
    minutes: 7,
    steps: [
      {
        title: 'A piece the defender cannot trade',
        text:
          'With bishops of opposite colour, each side has a piece the other **cannot oppose**: nothing the defender owns ' +
          'can ever contest the squares of the attacker’s bishop. In the endgame that produces draws — the defender ' +
          'simply blockades the pawns on the colour of their own bishop. In the middlegame, with queens and rooks on the ' +
          'board, it is the attacker’s dream:\n\n' +
          '- **Attack on your bishop’s colour.** Every square it covers is effectively yours.\n' +
          '- **Put the pawns on the other colour**, so they do not block the bishop and the enemy bishop has targets to ' +
          'hit only where it does not matter.\n' +
          '- **The initiative counts double** — the defender’s bishop cannot come to the rescue, so the first attack usually ' +
          'lands.\n\n' +
          'From a Lichess game: White’s light-squared bishop pins f7 to the king, and Black’s dark bishop can do nothing about g6.',
        fen: OPP_PIN,
        shapes: ['b3f7:red', 'g5g6', 'e7:blue'],
      },
      {
        title: 'Break in on the bishop’s colour',
        text: 'The f7 pawn is pinned by the bishop. Which pawn does that leave unprotected?',
        fen: OPP_PIN,
        task: {
          prompt: 'White to move.',
          moves: ['Qxg6+'],
          reply: 'Qg7',
          hint: 'The pinned pawn does not defend anything.',
          success: 'Qxg6+! — f7 cannot take because of the pin — Qg7 Qxg7 mate. Play on.',
          failure:
            'Qxg6+! The f7 pawn is pinned by the bishop, so the queen cannot be captured, and mate follows.',
        },
      },
      {
        title: 'Mate',
        text: 'Black blocked with the queen.',
        fen: fenAfter('Qxg6+ Qg7', OPP_PIN),
        task: {
          prompt: 'White to move.',
          moves: ['Qxg7#'],
          acceptAnyMate: true,
          hint: 'The queen is protected by the pawn.',
          success: 'Qxg7 mate. The dark-squared bishop watched the whole thing from e7.',
          failure: 'Qxg7 is checkmate.',
        },
      },
      {
        title: 'The long diagonal',
        text:
          'From a Lichess game. White’s bishop on d5 owns the long diagonal and the queen has joined it on e6; Black’s ' +
          'bishop on d6 defends dark squares nobody is attacking. The king on h8 has one pawn in front of it.',
        fen: OPP_LONG_DIAGONAL,
        shapes: ['d5g8:red', 'h4h6', 'e6f6:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Rxh6+'],
          reply: 'Kg7',
          hint: 'Open the king with a sacrifice on a light square.',
          success:
            'Rxh6+! Kg7 (Qxh6 Qxf6+ wins the queen) and now Rxf6 wins the queen anyway. Play on.',
          failure: 'Rxh6+! opens the king: Qxh6 Qxf6+ or Kg7 Rxf6 — either way the queen falls.',
        },
      },
      {
        title: 'Take the queen',
        text: 'The king stepped to g7, next to the rook.',
        fen: OPP_LONG_DIAGONAL_2,
        task: {
          prompt: 'White to move.',
          moves: ['Rxf6'],
          hint: 'The rook is protected by the queen.',
          success: 'Rxf6 and the queen is gone: Kxf6 Qxd6+ next. The light squares decided.',
          failure: 'Rxf6 wins the queen; after Kxf6 comes Qxd6+.',
        },
      },
      {
        title: 'The same idea for Black',
        text:
          'From a Lichess game. Now Black attacks. The bishop on e4 controls the light squares around the white king ' +
          '(g2, f3, h1) and White’s dark-squared bishop on d4 cannot help there. Black’s queen only needs one open line.',
        fen: OPP_BLACK,
        orientation: 'black',
        shapes: ['e4h1:red', 'b4e1', 'g3:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Qe1+'],
          reply: 'Rf1',
          hint: 'A check on the back rank first.',
          success:
            'Qe1+! Rf1 Qxg3 mate — the bishop on e4 covers the escape squares and the rook on f1 is pinned to the back rank. Play on.',
          failure:
            'Qe1+! forces Rf1, and then Qxg3 is mate: the bishop on e4 takes away every square.',
        },
      },
      {
        title: 'Finish',
        text: 'The rook blocked on f1. The bishop on e4 does the rest.',
        fen: OPP_BLACK_2,
        orientation: 'black',
        task: {
          prompt: 'Black to move.',
          moves: ['Qxg3#'],
          acceptAnyMate: true,
          hint: 'Mate on a dark square, covered by the light-squared bishop’s control of the flight squares.',
          success: 'Qxg3 mate. Both bishops still on the board — and only one of them mattered.',
          failure: 'Qxg3 is checkmate.',
        },
      },
      {
        title: 'And in the endgame…',
        text:
          'Trade the queens and rooks, and the same bishops mean the opposite. Here Black is a pawn up, but the white king ' +
          'and bishop hold every light square in front of the e-pawn and the black bishop can never attack them: a dead ' +
          'draw. So the rule is simple — with opposite bishops, **attack in the middlegame and avoid the endgame** if you ' +
          'are the one who is better.',
        fen: OPP_ENDGAME,
        shapes: ['c4e2:blue', 'e4:red'],
      },
    ],
    practiceThemes: ['kingsideAttack', 'pin'],
  },
];
