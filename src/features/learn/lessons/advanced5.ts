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
const ZW_CHECK = '5rk1/ppp2ppp/1n6/8/3Q1qb1/1B3NN1/PP3PK1/R3R3 b - - 0 19';
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
const OPP_BLACK = 'R3r1k1/1p3p1p/2p2Pp1/3pP1PP/1q1Bb3/4P1Q1/5R2/6K1 b - - 0 30';
const OPP_ENDGAME = '8/5pk1/6p1/p1b4p/P1B1p3/6P1/5PKP/8 w - - 0 1';

export const advancedLessons5: Lesson[] = [
  {
    id: 'defending-worse-positions',
    title: 'Defending worse positions',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'Bad positions are not lost positions. The defender’s tools — activity, checks from a distance, the king in front, simplification into known draws, fortresses — in the rook endings where they matter most.',
    minutes: 10,
    steps: [
      {
        title: 'The defender’s toolbox',
        text:
          'Games are rarely won by the better attacker; far more often they are lost by the worse defender. My ' +
          'toolbox when I stand worse:\n\n' +
          '- **Activity before material.** An active rook or king is worth more than a pawn you cling to.\n' +
          '- **Know the drawn endings** and steer for them: the king in front of the pawn, the rook behind it, ' +
          'opposite-coloured bishops.\n' +
          '- **Check from a distance.** A rook far from the enemy king keeps checking; one next to it gets chased.\n' +
          '- **Look for a fortress**, a set-up the stronger side cannot break.\n' +
          '- **Make them prove it.** The win still has to be found.\n\n' +
          'Rook endings are where these tools matter most. Here you are Black, and White’s pawn is two steps from ' +
          'queening.',
        fen: DEF_CHECK_DISTANCE,
        orientation: 'black',
        shapes: ['d6:red', 'c7:red'],
      },
      {
        title: 'Checking distance',
        text:
          'White’s king on c7 shelters the pawn, and d7+ is coming. Your rook on e4 does nothing where it stands, ' +
          'and your king cannot get in front of the pawn while the white king guards d7 and d8.\n\n' +
          'So the defender’s first question in a rook ending: can I drive the escort away? A check does it, but ' +
          'only from far enough that the king cannot turn round and attack the rook.',
        fen: DEF_CHECK_DISTANCE,
        orientation: 'black',
        task: {
          prompt: 'Which move saves the game?',
          moves: ['Rc4+'],
          hint: 'Look at your checks. Which one keeps your rook out of reach of the white king?',
          success:
            '**Rc4+**: a check from three squares away. The king has to step to the b-file, and next move your king can go to d7, right in front of the pawn.',
          why:
            'Every other move loses: the pawn advances with its king beside it and queens. The check gains the tempo ' +
            'you need, because the escort is pushed away and your king takes d7. Notice the distance. **Re7+** is a ' +
            'check too, but from next door: dxe7, and the rook is gone. In rook endings, check from far away and use ' +
            'the time to bring your king in front.',
          wrong: {
            Re6: {
              text: 'That attacks the pawn, but it is too slow: d7+ comes with check, and with the king on c7 beside it the pawn reaches d8.',
              refute: 'd7+',
            },
          },
          failure:
            'Deal with the escort first. A check from far enough away moves the white king off the pawn, and then your king can step in front of it.',
        },
      },
      {
        title: 'Behind the pawn',
        text:
          'White’s rook on f8 keeps your king off the eighth rank, and the pawn wants d7 and d8. Your king on b7 ' +
          'already does one useful job: it keeps the white king off c6 and c7.\n\n' +
          'Now the rook. The old rule says rooks belong **behind passed pawns**, your own or your opponent’s. From ' +
          'behind, the rook attacks the pawn on every square it reaches and never has to move; from the side or in ' +
          'front, it gets driven away with checks.',
        fen: DEF_BEHIND,
        orientation: 'black',
        shapes: ['d6:red'],
        task: {
          prompt: 'Where does your rook belong?',
          moves: ['Rd2'],
          hint: 'The pawn can only go forward. From which side can a rook keep watching it however far it runs?',
          success:
            '**Rd2**: your rook goes behind the pawn. If the pawn runs to d7 at once, your rook simply takes it.',
          why:
            'From d2 the rook never has to move: it watches every square the pawn can reach, while your king keeps ' +
            'the white king off c6 and c7. White can shuffle, but cannot make progress. **Rc2+** looks active, yet ' +
            'after Kd5 the king walks toward e6 and d7, where it shelters the pawn, and the checks run out. Behind the ' +
            'pawn is the rook’s best square, in attack and in defence.',
          wrong: {
            'Rc2+': {
              text: 'Checks look active, but they drive the king where it wants to go: Kd5, and then on to e6 and d7, right beside its pawn. Put the rook where it watches the pawn for good.',
              refute: 'Kd5',
            },
          },
          failure:
            'Find the square from which your rook can watch the pawn without ever being chased: a passed pawn can only run away from a rook behind it.',
        },
      },
      {
        title: 'The king in front',
        text:
          'The simplest drawing method of all is to put your **king in front of the pawn**. A king that blocks the ' +
          'pawn’s path cannot be checked away, because there is always another square in front of the pawn to step ' +
          'to.\n\n' +
          'Your king on a8 is close, but not yet on the right square, and White’s rook on e6 is one move away from ' +
          'cutting it off along the eighth rank.',
        fen: DEF_KING_FRONT,
        orientation: 'black',
        shapes: ['c6:red', 'c7', 'c8'],
        task: {
          prompt: 'Where does your king belong?',
          moves: ['Kb8'],
          hint: 'The pawn has to cross c7 and c8. Which king move takes your king toward those squares?',
          success: '**Kb8**: the king steps next to the pawn’s path and covers c7 and c8.',
          why:
            'Your king now guards both squares the pawn must cross, and if the rook checks, the king steps onto the ' +
            'path itself. **Ka7** is the natural slip: after Re8 your king is cut off from the eighth rank, and the ' +
            'pawn walks through. Before you defend an ending, find the squares the pawn has to cross, and get your ' +
            'king onto them.',
          wrong: {
            Ka7: {
              text: 'That steps away from the pawn’s path. After Re8 your king is cut off from the eighth rank, and c7 and c8 follow.',
              refute: 'Re8',
            },
            'Rc3+': {
              text: 'Checking from behind sends the king where it wants to go: Kb6, and after one more check it reaches c7, beside its pawn. Get your king in front first.',
              refute: 'Kb6',
            },
          },
          failure:
            'The pawn’s path is c7 and c8. Put your king where it covers those squares, so the rook can never check it away from them.',
          reply: 'Re8+',
          replyNote:
            'White checks along the eighth rank. Your king has to leave b8, and where it goes decides the game.',
          then: {
            prompt: 'Where does the king go?',
            moves: ['Kc7'],
            hint: 'One of the two squares is on the pawn’s path.',
            success: '**Kc7**: your king stands right in front of the pawn.',
            why:
              'Now the pawn cannot move at all, and checks change nothing: after Re7+ the king steps to b8, c8 or d8 ' +
              'and stays in the pawn’s way. **Ka7** loses at once to c7, when the pawn has a clear road. The squares in ' +
              'front of a passed pawn are where the defending king lives.',
            wrong: {
              Ka7: {
                text: 'That leaves the pawn’s path: c7, and the pawn queens next move, because your rook cannot stop it in time.',
                refute: 'c7',
              },
            },
            failure:
              'Step onto the pawn’s path. Directly in front of it, your king cannot be checked away.',
            reply: 'Re7+',
            replyNote:
              'One more check, and it changes nothing: your king steps back to b8, c8 or d8, still in front of the pawn. That is the draw.',
          },
        },
      },
      {
        title: 'Simplify into a known draw',
        text:
          'Sometimes the best defence is a trade. Swap your rook for White’s and look at what is left: king and pawn ' +
          'against king. That ending is often a draw, and every defender should know exactly when.\n\n' +
          'Here the rooks stand face to face on the e-file. Keep them on, and the f-pawn walks forward with the ' +
          'rook’s help while your rook can only watch.',
        fen: DEF_SIMPLIFY,
        orientation: 'black',
        shapes: ['e4e6', 'f6:red'],
        task: {
          prompt: 'Which trade saves the game?',
          moves: ['Rxe6'],
          hint: 'Picture the board without the rooks. Can your king get in front of the f-pawn in time?',
          success:
            '**Rxe6**: the rooks come off, and only White’s king and pawn are left against your king.',
          why:
            'With the rooks on, the pawn goes to f7 with the rook’s support, and your rook alone cannot hold it. ' +
            'Without them, the pawn needs its king, and your king is close enough to stand in front of it. Count the ' +
            'pawn ending before you trade: here it is a draw, but only if you find the next move.',
          wrong: {
            Rh4: {
              text: 'Keeping the rooks loses: f7, and king and rook escort the pawn to f8 while your rook can only give checks.',
              refute: 'f7',
            },
          },
          failure:
            'Look at what is left if the rooks come off: king and pawn against king, with your king right next to the pawn’s path.',
          reply: 'Kxe6',
          replyNote:
            'White takes back. Now it is king and pawn against king, and only one square draws.',
          then: {
            prompt: 'Which king move draws?',
            moves: ['Ke8'],
            hint: 'Stand in front of the pawn’s path and face the white king, with one square between you.',
            success:
              '**Ke8**: your king faces White’s with one square between them, ready to step in front of the pawn.',
            why:
              'That is the **opposition**: White has to give way. After Ke5 your king steps to f7, in front of the ' +
              'pawn; after f7+ Kf8 Kf6 it is stalemate. **Kc7** or **Kc8** walks away, and the pawn simply runs to ' +
              'f8. Rook endings are often saved in the pawn ending they turn into, so learn the opposition cold.',
            wrong: {
              Kc7: {
                text: 'Your king steps away from the pawn’s path: f7, and the pawn queens next move.',
                refute: 'f7',
              },
              Kc8: {
                text: 'Your king steps away from the pawn’s path: f7, and the pawn queens next move.',
                refute: 'f7',
              },
            },
            failure:
              'Face the white king with one square between you, on the pawn’s side of the board. Whoever has to move then gives way.',
          },
        },
      },
      {
        title: 'Check first, then step in front',
        text:
          'One more, and this time the order of your moves matters. White’s king on b7 escorts the pawn, c7+ is ' +
          'threatened, and your rook on e2 stands on the wrong file. Your king on d8 is close to the queening square, ' +
          'but not yet in front of the pawn.\n\n' +
          'When a king and its pawn work together like this, split them up before anything else.',
        fen: DEF_CHECK_FIRST,
        orientation: 'black',
        shapes: ['c6:red', 'b7:red'],
        task: {
          prompt: 'How do you stop the c-pawn?',
          moves: ['Rb2+'],
          hint: 'The white king is the pawn’s escort. Can you make it step away first, with gain of time?',
          success:
            '**Rb2+**: a check along the b-file. The king has to go to the a-file, and your king steps to c7, right in front of the pawn.',
          why:
            'Every quiet move loses to c7+, when the king escorts the pawn to c8. The check gains the one tempo you ' +
            'need: the king is pushed off the b-file, your king reaches c7, and the pawn soon falls. **Rc2** goes for ' +
            'the pawn at once, but Rd1+ drives your king away first. In rook endings, separate the king from its pawn, ' +
            'then blockade.',
          wrong: {
            Rc2: {
              text: 'Going after the pawn at once is too slow: Rd1+ drives your king off the d-file, and then c7 and c8 follow.',
              refute: 'Rd1+',
            },
            'Re7+': {
              text: 'A check, but from close by: Kb8, and c7+ comes next with the pawn on its way to c8.',
              refute: 'Kb8',
            },
            Re1: {
              text: 'A trade offer, but White need not accept it: c7+ first, and once your king steps aside, White takes your rook on e1 with check as well.',
              refute: 'c7+',
            },
          },
          failure:
            'Split the pawn from its escort first: a check from far away moves the white king, and your king can then step in front of the pawn.',
        },
      },
      {
        title: 'Fortresses and swindles',
        text:
          'A **fortress** is a position the stronger side cannot break, however long they try. Rook against bishop is ' +
          'the classic. The defending king runs to the corner the bishop does *not* control: the bishop here is ' +
          'dark-squared, and the king sits on a8, a light corner. When the rook checks along the back rank, the ' +
          'bishop blocks on b8; and if White pins it there with the king on b6, Black has no move left, and it is ' +
          'stalemate. In the a1 corner the bishop could never block on b1.\n\n' +
          'And when nothing else works, set problems: threats that need exact answers, stalemate tricks, an ' +
          'unexpected sacrifice. A swindle is not luck. It is the defender’s last tool.',
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
    minutes: 11,
    steps: [
      {
        title: 'The move between',
        text:
          'A **zwischenzug** (German for “in-between move”) is a move slipped in before the one everyone expects: a ' +
          'check, a capture or a threat that has to be answered first. We miss them because we calculate “I take, ' +
          'they take back” as one unit.\n\n' +
          'So build the habit: before every capture and every recapture, ask **“is there something stronger ' +
          'first?”**\n\n' +
          'Here you are two bishops down for a pawn. Your queen on h5 attacks the bishop on h6, and taking it looks ' +
          'obvious. But your rook on d1 is looking at Black’s queen too.',
        fen: ZW_TRADE_FIRST,
        shapes: ['h5h6:blue', 'd1d8:blue'],
        task: {
          prompt: 'Two captures are on offer. Which comes first?',
          moves: ['Rxd8'],
          hint: 'If you take the bishop first, where can Black’s queen go? Which capture leaves Black no choice?',
          success:
            '**Rxd8**: you take the queen first, and Black has to recapture before doing anything else.',
          why:
            'After Rxd8 Rxd8 the bishop on h6 is still hanging, and you collect it next. The other order fails: after ' +
            '**Qxh6** Black’s queen steps off the d-file to e7, its only safe square, and Black is still a piece up for ' +
            'a pawn. When two captures are on offer, start with the one your opponent has to answer.',
          wrong: {
            Qxh6: {
              text: 'The automatic capture, and it lets Black’s queen escape with Qe7, its one safe square off the d-file. Black stays a piece up. Deal with the queen first, while it is still attacked.',
              refute: 'Qe7',
            },
          },
          failure:
            'Look at what is attacking Black’s queen on d8. A capture your opponent must answer comes before one that can wait.',
          reply: 'Rxd8',
          replyNote:
            'Black takes back, as Black must, or stays a queen down. And the bishop on h6 is still where it was.',
          then: {
            prompt: 'And now the second capture?',
            moves: ['Qxh6'],
            hint: 'Which black piece is still hanging?',
            success:
              '**Qxh6**: the bishop falls too. You have queen and rook against two rooks and a bishop, and Black’s king has lost its dark-squared defender.',
            why:
              'Count it up: you gave a rook for the queen and took a bishop on top. The same two captures in the other ' +
              'order would have left you a piece down. Many in-between moves are just that: the moves you were going ' +
              'to play anyway, in the order that leaves your opponent no choice.',
            failure: 'The bishop on h6 is still attacked, and still unprotected.',
          },
        },
      },
      {
        id: 'check-first',
        title: 'A check first',
        text:
          'You are Black, a rook and a piece down for three pawns, and the queens attack each other along the fourth ' +
          'rank. The automatic answer is Qxd4 Nxd4, and after the trade you are simply lost.\n\n' +
          'Before you take, ask what holds White’s position together. The queen on d4 is guarded once, by the knight ' +
          'on f3, and a check has to be answered before anything else.',
        fen: ZW_CHECK,
        orientation: 'black',
        shapes: ['d4:red', 'f3:red'],
        task: {
          prompt: 'Is there something stronger than trading queens?',
          moves: ['Bxf3+'],
          hint: 'A check must be answered before anything else. Which check also removes a defender?',
          success:
            '**Bxf3+**: the bishop takes the knight that guarded d4, with check. The king cannot take back, because your queen guards f3.',
          why:
            'White must answer the check, and the queen on d4 has lost its only guard: next move you take it for ' +
            'nothing. **Qxd4** at once just trades queens: Nxd4, and you are still a rook and a piece down. Before you ' +
            'accept a trade, ask whether the piece guarding it can be taken with tempo.',
          wrong: {
            Qxd4: {
              text: 'That trades queens, and after Nxd4 you are still a rook and a piece down for three pawns. Look at the knight guarding d4 first: can you remove it with tempo?',
              refute: 'Nxd4',
            },
            'Qxf3+': {
              text: 'Right square, wrong piece. After Kg1 your queen has left f4, so White’s queen is no longer attacked: you have won a knight, not a queen, and you are still losing.',
              refute: 'Kg1',
            },
          },
          failure:
            'Look for a check that also takes away a defender. A check has to be answered first, and the piece it leaves unguarded may be yours.',
          reply: 'Kg1',
          replyNote:
            'The king steps away, as it must: it cannot take on f3, which your queen guards. And the queen on d4 now stands alone.',
          then: {
            prompt: 'What does the check leave behind?',
            moves: ['Qxd4'],
            hint: 'Which white piece has just lost its only guard?',
            success:
              '**Qxd4**: the queen falls for nothing. A rook and a piece down a moment ago, you are now winning.',
            why:
              'One check before the capture, and the trade has become a free queen: that is all a zwischenzug is. The ' +
              'habit to take from it: when the queens attack each other, look for a check before you take.',
            failure: 'White’s queen on d4 has no defender left.',
          },
        },
      },
      {
        id: 'check-before-recapture',
        title: 'Before the recapture',
        text:
          'Black’s knight has just captured on g3, and you are a piece down until you take it back. Both your f- and ' +
          'h-pawns can do it, and hxg3 even opens the h-file for your rook.\n\n' +
          'But the knight will still be there next move if Black is busy with something else. Before you recapture, ' +
          'look at the checks. Your bishop on d3 and queen on c2 both point at h7, and that pawn is guarded only by ' +
          'the king.',
        fen: ZW_BEFORE_RECAPTURE,
        shapes: ['g3:red', 'h7:blue'],
        task: {
          prompt: 'Recapture at once, or is there something better first?',
          moves: ['Bxh7+'],
          hint: 'Checks first. Is there one that wins something and still leaves the knight on g3 hanging?',
          success:
            '**Bxh7+**: a pawn with check. The king cannot take back, because your queen on c2 guards h7, so it has to go to h8.',
          why:
            'The check costs you nothing: the knight on g3 is still there to be taken. After Bxh7+ Kh8 hxg3 you have ' +
            'won a pawn and opened the h-file, with your bishop on h7 standing in front of your own rook. **hxg3** at ' +
            'once lets Black answer g6 and close the diagonal, and the position is level. Before you recapture, look ' +
            'for the checks.',
          wrong: {
            hxg3: {
              text: 'The automatic recapture, and the chance is gone: g6 shuts the diagonal toward h7, and the position is level. The knight would still have been there after a check.',
              refute: 'g6',
            },
            fxg3: {
              text: 'That recaptures too, but the chance is gone: g6 shuts the diagonal toward h7. The knight would still have been there after a check.',
              refute: 'g6',
            },
          },
          failure:
            'Before you recapture, look at every check. One of them wins a pawn and leaves the knight on g3 exactly where it is.',
          reply: 'Kh8',
          replyNote:
            'Black’s only move: the king cannot take on h7, which your queen guards. And the knight on g3 is still there.',
          then: {
            prompt: 'Now the recapture. Which pawn takes?',
            moves: ['hxg3'],
            hint: 'Which capture opens a file toward the black king?',
            success:
              '**hxg3**: the piece comes back, and the h-file opens for your rook, with your bishop on h7 in front of it.',
            why:
              'You are a pawn up, and the bishop on h7 is a loaded gun: any move it makes uncovers a check from the rook ' +
              'on h1. Black’s king is in serious trouble. The same recapture a move earlier would have given you none of ' +
              'this. The recapture could wait a move; the check could not.',
            wrong: {
              fxg3: {
                text: 'That wins the piece back too, but it keeps the h-file closed and loosens e3: after e5 Black’s pieces come to life against your king in the centre.',
                refute: 'e5',
              },
            },
            failure: 'Recapture so that a file opens toward the black king.',
          },
        },
      },
      {
        id: 'endgame-zwischenzug',
        title: 'In the endgame too',
        text:
          'Endings are full of in-between moves too, and they are easier to miss because everything is quieter.\n\n' +
          'White is a knight up, but the rook on e7 is attacked by your king and has no protection, so Kxe7 looks ' +
          'automatic. Before you play it, ask the in-between question, and look at where the white knight could jump ' +
          'once your king stands on e7.',
        fen: ZW_ENDGAME,
        orientation: 'black',
        shapes: ['e7:red', 'd8:blue'],
        task: {
          prompt: 'Take the rook now, or first something else?',
          moves: ['Rxf5+'],
          hint: 'If your king goes to e7, where can the knight jump with check, and what else would it hit?',
          success:
            '**Rxf5+**: a pawn with check, and your rook leaves a5, where a knight fork was waiting for it.',
          why:
            'After Kxe7 at once, Nc6+ forks your king and the rook on a5, and White wins the rook back. With **Rxf5+** ' +
            'first, White has to answer the check, the rook on e7 is still hanging, and your rook is safe on f5. The ' +
            'same captures, a whole rook of difference. Before the obvious capture, look at what your opponent can do ' +
            'right after it.',
          wrong: {
            Kxe7: {
              text: 'The automatic capture walks into a fork: Nc6+ hits your king and the rook on a5, and White takes the rook back.',
              refute: 'Nc6+',
            },
            Kxf5: {
              text: 'You take a pawn, but your king steps away from the rook on e7, which escapes with Rxg7 and takes a pawn of its own. White stays a knight up.',
              refute: 'Rxg7',
            },
          },
          failure:
            'Before you take on e7, look at where the knight can jump once your king is there, and at the checks you have first.',
          reply: 'Ke2',
          replyNote:
            'The king steps out of check. Your rook is safe on f5, and the rook on e7 is still hanging.',
          then: {
            prompt: 'What do you take now?',
            moves: ['Kxe7'],
            hint: 'The rook on e7 is still unprotected.',
            success: '**Kxe7**: the rook falls, and this time Nc6+ forks nothing.',
            why:
              'You are the exchange and a pawn up, and the knight on d8 is attacked and has to run. Same capture, one ' +
              'move later, and the fork that would have cost you the rook has gone, because your rook left a5 with ' +
              'check. Before you take, ask where your opponent’s pieces can go afterwards.',
            failure: 'The rook on e7 is still hanging.',
          },
        },
      },
      {
        id: 'quiet-rook-lift',
        title: 'Quiet moves',
        text:
          'The other tactic calculation misses is the **quiet move**: no check, no capture, just a threat the ' +
          'opponent cannot meet. We look at forcing moves first, as we should, and stop before the quiet one.\n\n' +
          'Black is a pawn up. Your queen on h6 is close to Black’s king, but on her own she can do nothing: Qh8+ ' +
          'just loses her. She needs a partner on the h-file. Black’s queen on d5 attacks your rook on e4, which the ' +
          'f3 pawn guards.',
        fen: QUIET_ROOK_LIFT,
        shapes: ['h7:red'],
        task: {
          prompt: 'No check works yet. Which quiet move creates a threat Black cannot meet?',
          moves: ['Rh4'],
          hint: 'The queen needs support for a check on h7 or h8. Which piece can bring it, and where?',
          success:
            '**Rh4**: the rook swings to the h-file. Now Qh7+ and Qh8+ are threatened, with the rook behind the queen.',
          why:
            'The threat is Qh7+ Kf8 Qh8+, and the checks win the rook on b8 or the queen. There is no check in Rh4, ' +
            'which is exactly why it is hard to see. When your checks fail, ask which piece could make them work, and ' +
            'bring it in, even if it costs a move.',
          wrong: {
            'Re8+': {
              text: 'A check, but Black just takes: Rxe8, and you are a rook down. The queen needs a partner, not a sacrifice.',
              refute: 'Rxe8',
            },
          },
          failure:
            'Look for a quiet move that brings a second piece to the h-file. Then the queen’s checks on h7 and h8 would be backed up.',
          reply: 'Qe5',
          replyNote:
            'Black’s best try: the queen covers h8 along the long diagonal, so the check there no longer wins anything by itself.',
          then: {
            prompt: 'Black has covered h8. How do you go on?',
            moves: ['Qh7+'],
            hint: 'Start with the check that Black’s king has to answer.',
            success: '**Qh7+**: the king has only f8 to go to.',
            why:
              'Check first, so Black has no time to reorganise: the king is driven to f8, and the next check lands on h8 ' +
              'with the rook behind the queen. A slower move gives Black time to regroup, with Qg7 or the rook coming ' +
              'across, and the chance is gone.',
            failure: 'Use the queen and rook together on the h-file: start with a check.',
            reply: 'Kf8',
            replyNote:
              'Forced. Now look at h8: your rook backs the queen up there, and Black’s queen guards it only once.',
            then: {
              prompt: 'Which check wins material?',
              moves: ['Qh8+'],
              hint: 'Count attackers and defenders on h8.',
              success:
                '**Qh8+**: the queen lands on h8 with check, backed by the rook. Taking her opens the h-file for the rook; not taking her loses the rook on b8.',
              why:
                'After Qxh8 Rxh8+ the king steps aside and Rxb8 collects the rook, and you finish a rook for a pawn up. ' +
                'Every move here was forced except the first, the quiet Rh4, and that is the move most players never look ' +
                'at. When your checks run out, ask: which piece is not helping yet?',
              wrong: {
                'Qh6+':
                  '**Qh6+** keeps a winning position too, but after Ke7 the king slips out of the net and you have to work much harder. The check on h8 wins the rook at once.',
                Kh1: {
                  text: 'A quiet king move, but the wrong one: Black uses the tempo for Rb1+, then Qg7 covers h8 and offers a queen trade, and your attack is over.',
                  refute: 'Rb1+',
                },
                Kg1: {
                  text: 'A quiet king move, but the wrong one: Black uses the tempo for Rb1+, then Qg7 covers h8 and offers a queen trade, and your attack is over.',
                  refute: 'Rb1+',
                },
              },
              failure: 'Look at h8: the queen can go there with check, backed by the rook.',
              reply: 'Qxh8',
              replyNote:
                'Black gives the queen back rather than lose the rook for nothing. Rxh8+ and Rxb8 follow, and the ending is yours.',
            },
          },
        },
      },
      {
        id: 'quiet-knight',
        title: 'The quiet knight',
        text:
          'Quiet moves decide endings too. Count the black king’s squares first: d8 and f8 are covered by your pawn ' +
          'on e7, d7 and f7 by your king. The king cannot move at all.\n\n' +
          'So any knight check that cannot be parried is mate. Your knight on a7 has no check to give, and Black’s ' +
          'knight on b6 will try to cover whatever square you aim at. The question is not “which check?” but “which ' +
          'move threatens more mates than Black can stop?”',
        fen: QUIET_KNIGHT,
        shapes: ['e8:red'],
        task: {
          prompt: 'Which quiet knight move leaves Black without a defence?',
          moves: ['Nb5'],
          hint: 'From which squares could a knight check the king on e8? Can one knight move aim at two of them?',
          success:
            '**Nb5**: the knight threatens Nc7# and Nd6#. Black’s knight can cover one of those squares, never both.',
          why:
            'A knight cannot guard c7 and d6 at the same time, the a-pawn is too slow, and the black king cannot move. ' +
            'Nb5 gives no check and takes nothing, which is why it is so easy to miss. When the enemy king is stuck, ' +
            'look for the quiet move that threatens mate twice.',
          wrong: {
            Nc6: {
              text: 'The knight comes closer, but from c6 it threatens no mate: a3, and your knight has to run back to stop the pawn.',
              refute: 'a3',
            },
            Kd6: {
              text: 'Your king guards the pawn, but it lets go of f7: Kf7, and the black king is out of its box.',
              refute: 'Kf7',
            },
          },
          failure:
            'The black king has no squares at all. Find a knight move that threatens mate on two squares, so that Black’s knight cannot cover both.',
          reply: 'Nd5',
          replyNote: 'Black’s knight covers c7. It cannot reach d6 as well.',
          then: {
            prompt: 'Where does the knight mate?',
            moves: ['Nd6#'],
            acceptAnyMate: true,
            hint: 'c7 is covered now. Which other square checks the king?',
            success: '**Nd6#**: the knight checks from d6, and the king has nowhere to go.',
            why:
              'Two threats, one defender: that is the idea behind most quiet moves. Black could choose which mate to ' +
              'allow, but could not stop both. When the enemy king is boxed in, make more threats than your opponent ' +
              'has defenders.',
            failure:
              'Not mate. Your knight had two mating squares, and Black has just covered one of them.',
          },
        },
      },
      {
        id: 'rook-behind-the-pawn',
        title: 'The rook behind the pawn',
        text:
          'Sometimes the quiet move is a rook that simply goes to the right square.\n\n' +
          'Your pawn on b6 is two steps from queening, and Black is a pawn up elsewhere. The natural move is to ' +
          'push. Before you do, ask what Black’s rook on a4 will do about it, and where your own rook should stand ' +
          'when the pawn goes forward. You know the rule from the rook endings: rooks belong behind passed pawns.',
        fen: QUIET_BEHIND,
        shapes: ['b6:blue', 'a4:red'],
        task: {
          prompt: 'Push the pawn now, or prepare it?',
          moves: ['Rb1'],
          hint: 'Where do rooks belong when there is a passed pawn?',
          success:
            '**Rb1**: your rook gets behind the pawn. Now b7 and b8 come with the rook’s support, and Black’s rook can only stop the pawn by giving itself up.',
          why:
            '**b7** at once runs into Rb4: Black’s rook gets behind the pawn first and wins it. After Rb1 the pawn ' +
            'advances with your rook behind it, so Black’s rook has to stand in front, on b8, where it can only give ' +
            'itself up. The rule you use in defence wins games in attack: rook behind the passed pawn first, then push.',
          wrong: {
            b7: {
              text: 'The pawn runs too soon: Rb4, and Black’s rook gets behind it first. After Ra1 Rxb7 you have lost your best pawn.',
              refute: 'Rb4',
            },
            'Re1+': {
              text: 'A check, but after Kd7 Black’s king heads for the pawn, and your rook stands on the wrong file.',
              refute: 'Kd7',
            },
            h4: {
              text: 'A kingside pawn move does nothing for the b-pawn: Rb4, and Black’s rook gets behind it first.',
              refute: 'Rb4',
            },
            f4: {
              text: 'A kingside pawn move does nothing for the b-pawn: Rb4, and Black’s rook gets behind it first.',
              refute: 'Rb4',
            },
          },
          failure: 'Before you push, put your rook where it supports the pawn all the way to b8.',
          reply: 'Rd4',
          replyNote: 'Black’s rook heads for the d-file, to get back to the eighth rank in time.',
          then: {
            prompt: 'How do you go on?',
            moves: ['b7'],
            hint: 'Your rook is behind the pawn now. What did you put it there for?',
            success: '**b7**: one step from queening, with your rook behind it.',
            why:
              'Now b8 is threatened, and Black’s rook can only meet it from the front, on b8 itself, where it will have ' +
              'to give itself up when the pawn queens. Quiet moves like Rb1 are what make the loud ones work.',
            wrong: {
              h4: {
                text: 'That gives Black the tempo to bring the rook back: Rd8, and with the rook on the eighth rank and the king on its way, the win is gone.',
                refute: 'Rd8',
              },
              f4: {
                text: 'That gives Black the tempo to bring the rook back: Rd8, and with the rook on the eighth rank and the king on its way, the win is gone.',
                refute: 'Rd8',
              },
            },
            failure: 'With your rook behind it, the pawn is ready to run.',
            reply: 'Rd8',
            replyNote:
              'Black’s rook gets in front of the pawn just in time. After b8=Q Rxb8 Rxb8 you are a rook for two pawns up.',
          },
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
    minutes: 11,
    steps: [
      {
        title: 'The shape of the fight',
        text:
          'After 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4, Black has traded a wing pawn for a centre pawn, and that ' +
          'trade gives the Open Sicilian its character:\n\n' +
          '- Black gets the **half-open c-file**, with pressure on c3 and c2, and two pawn levers: **...d5** in the ' +
          'centre and **...b5-b4** on the queenside.\n' +
          '- White gets more space and a lead in development, so White attacks, with f4-f5 or g4-g5, often with the ' +
          'king castled long.\n\n' +
          'In the diagram, a Najdorf where White played 6. Be2 and Black answered ...e5, the d6-e5 chain leaves a ' +
          'hole on d5. Much of the game turns on one question: can Black still play ...d5?',
        fen: SICILIAN_START,
        orientation: 'black',
        shapes: ['d5:red', 'c8c2:blue', 'd6d5'],
      },
      {
        title: 'The ...d5 break',
        text:
          'Every Sicilian player’s first question in a new position: **“can I play ...d5?”** The pawn on d6 is the ' +
          'weak point of Black’s structure, and ...d5 gets rid of it in one move, opening the centre while your ' +
          'pieces are ready.\n\n' +
          'Here everything supports it: the bishop on e6, the knight on f6, the queen behind on d8. And White’s f4 ' +
          'has traded off your e5 pawn, so the pawn on e4 now stands alone.',
        fen: NAJDORF_D5,
        orientation: 'black',
        shapes: ['d6:red', 'e4:red'],
        task: {
          prompt: 'Which pawn break frees your game?',
          moves: ['d5'],
          hint: 'Ask the Sicilian player’s first question. Is the break supported well enough?',
          success: '**d5**: the pawn hits e4 and gets rid of your weak d6 pawn in one move.',
          why:
            'After exd5 Nxd5 Nxd5 Bxd5 your pieces are active, the d6 weakness is gone, and the position is level. ' +
            'Wait, and White gets time for Qe1 and Qg3, piling up on your kingside. **Rc8** and **b5** are sensible ' +
            'moves too, but they leave d6 where it is. When the break is ready, play it before your opponent can stop ' +
            'it.',
          wrong: {
            Rc8: '**Rc8** is a sensible move, and the engine does not mind it. But it leaves the d6 pawn and the hole on d5 as they are, and White gets time for Qe1 and Qg3. The break is ready now.',
            b5: '**b5** gains queenside space and is playable, but it leaves the centre as it is. With d5 ready to go, the break comes first.',
            Ne5: '**Ne5** is playable too, but it leaves d6 weak and gives White time for Qe1 and Qg3. The break is ready now.',
            Qe8: 'A queen move is playable here, but it leaves d6 weak, and the break that fixes it is ready now. Look at the centre.',
            Qb6: 'A queen move is playable here, but it leaves d6 weak, and the break that fixes it is ready now. Look at the centre.',
            Qc8: 'A queen move is playable here, but it leaves d6 weak, and the break that fixes it is ready now. Look at the centre.',
          },
          failure:
            'Several moves are playable, but this step is about the centre. Look at d6: which pawn move gets rid of the weakness at once?',
        },
      },
      {
        title: 'The exchange sacrifice on c3',
        text:
          'The half-open c-file gives Black a standard weapon: **...Rxc3**. The rook takes the knight that holds ' +
          'White’s centre together and shields the king castled long. It is not a sacrifice you calculate to mate; ' +
          'it changes the nature of the position, and in the Dragon it is often Black’s best answer to a kingside ' +
          'attack.\n\n' +
          'Here White is ready for h5, to open the h-file against your king. Your queen on a5 and rook on c8 both ' +
          'point at c3.',
        fen: DRAGON_SAC,
        orientation: 'black',
        shapes: ['c3:red', 'h4h5:blue'],
        task: {
          prompt: 'What is the standard way to fight back here?',
          moves: ['Rxc3'],
          hint: 'Which white piece guards e4 and shields the white king? Can you remove it, even at a price?',
          success:
            '**Rxc3**: the rook takes the knight on c3. If White takes back with the queen, the queens come off; if with the pawn, the king loses its cover.',
          why:
            'After Qxc3 Qxc3 bxc3 the mating attack is gone: White’s pawns on c2 and c3 are weak, and the pawns on f3 ' +
            'and e4 soon come under fire. White is still somewhat better, but that is a game; without the sacrifice, ' +
            'h5 comes and the h-file opens against your king. With the kings on opposite wings, slowing the attack is ' +
            'worth material.',
          wrong: {
            Nxf3: '**Nxf3** is a good move too: after Nxf3 Rxc3 it comes to the same thing. This step is about the sacrifice itself, so play it directly.',
            Rc4: {
              text: 'The rook offers itself on the wrong square: White ignores it with g5, kicking your knight, and the attack rolls on.',
              refute: 'g5',
            },
            b5: '**b5** is a typical Dragon pawn offer, but here it is too slow: Nd5 trades queens on White’s terms and wins the e7 pawn.',
            d5: {
              text: 'Opening the centre backfires: Nxd5 uncovers White’s queen on d2 against yours on a5, and you lose material.',
              refute: 'Nxd5',
            },
            Nc4: 'The other standard Dragon idea, but here it is too slow: Bxc4 Rxc4 Nb3 drives your queen back, and White’s attack goes on. The exchange sacrifice slows it down far more.',
          },
          failure:
            'Your rook on c8 and queen on a5 both aim at c3, the square that holds White’s queenside together. What would a sacrifice there change?',
        },
      },
      {
        title: 'White’s plan: the pawn storm',
        text:
          'Now White’s side of the story. Against the Najdorf, the **English Attack** is the clearest plan: Be3, f3, ' +
          'Qd2, castle long, then throw the kingside pawns at Black’s king. The first target is the knight on f6, ' +
          'which guards d5 and h7: drive it away and both squares weaken.\n\n' +
          'Black’s plan is the mirror image: ...b5-b4 to chase your knight on c3 and open lines against your king. ' +
          'Neither side has time for slow moves.',
        fen: ENGLISH_ATTACK,
        shapes: ['f6:red', 'c3:blue'],
        task: {
          prompt: 'Which pawn move starts the storm?',
          moves: ['g4'],
          hint: 'Which pawn can reach the knight on f6 soonest?',
          success: '**g4**: the storm begins, and g5 next will hit the knight on f6.',
          why:
            'Speed is everything with the kings on opposite wings, and g4 threatens to kick the knight before Black’s ' +
            'queenside pawns arrive. The pawn on f3 backs it up, which is one reason White played f3 early. **h4** ' +
            'points the same way but threatens nothing yet. In a pawn race, pick the move that makes a threat next ' +
            'move.',
          wrong: {
            h4: '**h4** belongs to the same plan, but it threatens nothing yet, and Black gets a free move for b5. The g-pawn reaches the knight a move sooner.',
            Kb1: '**Kb1** is a useful move that White often plays in these lines, stepping off the c-file. But it is a waiting move, and in this race the first threat counts for more.',
            a3: '**a3** is a sensible move too: it prepares to meet ...b4 by taking. But it is a defensive move, and this step is about the attack.',
            Nd5: '**Nd5** is a real idea in these structures, but it turns the game into a slower, positional fight. This step is about the storm.',
            Bg5: {
              text: '**Bg5** looks active, but it does nothing for the storm and hands Black a free move: b5, and Black’s pawns are first in the race.',
              refute: 'b5',
            },
          },
          failure:
            'Several moves are fine here, but this step is about the storm: which pawn heads straight for the knight on f6?',
          reply: 'b5',
          replyNote:
            'Black starts the counter-race at once: the b-pawn is heading for b4 and your knight on c3.',
          then: {
            prompt: 'How do you keep the race going?',
            moves: ['g5'],
            hint: 'Carry on with the plan: the knight on f6 is the target.',
            success:
              '**g5**: the knight on f6 is attacked and has to move, and with it goes Black’s control of d5 and h7.',
            why:
              'Every tempo counts now. g5 makes a threat, so Black has to answer it or reply with a threat of its own, ' +
              'which is exactly what b4 does. Slower moves such as **a3** or **h4** are playable, but they hand Black ' +
              'the first threat. With the kings on opposite wings, count tempi and keep making threats.',
            wrong: {
              a3: '**a3** is playable: it meets ...b4 with axb4. But it is a defensive move, and it hands Black the first threat in the race.',
              h4: '**h4** supports the storm, but it threatens nothing yet, while the g-pawn can hit the knight right now.',
              Nd5: '**Nd5** is a real idea in these structures, but it turns the game into a slower, positional fight. This step is about the storm.',
              Bg5: {
                text: '**Bg5** pins the knight, but it stands on the square your g-pawn wants and costs a tempo: b4, and Black hits your knight first.',
                refute: 'b4',
              },
              f4: {
                text: '**f4** opens a second front, but it takes the f3 pawn’s protection away from g4: Nxg4, and you are a pawn down with the storm stalled.',
                refute: 'Nxg4',
              },
            },
            failure: 'Keep the storm going: the knight on f6 is the target.',
            reply: 'b4',
            replyNote:
              'Black hits your knight on c3 in return. Both sides now have a knight attacked, and the race is on.',
          },
        },
      },
      {
        title: 'Black’s counterplay',
        text:
          'A famous position from that race. White’s king has gone to b1, Black has pushed ...b3 and ...bxc2, and ' +
          'the knight on c2 is now the king’s last defender. Your pawn on a4 and rook on a8 are waiting for a file to open.\n\n' +
          'Your bishop on e6 is attacked by the pawn on f5, so it has to do something anyway. The question is where ' +
          'it does the most damage.',
        fen: ENGLISH_ATTACK_BB3,
        orientation: 'black',
        shapes: ['e6:red', 'b1:red'],
        task: {
          prompt: 'How do you open a line to the white king?',
          moves: ['Bb3'],
          hint: 'A piece offered on b3 cannot be taken safely. Which file opens if the a2 pawn captures?',
          success:
            '**Bb3**: the bishop lands next to the king and attacks the knight on c2. If axb3, then axb3, and the a-file opens.',
          why:
            'The bishop hits the last defender, and taking it opens the a-file for your rook. Slower moves fail: after ' +
            'fxe6 fxe6 White has won a piece and your attack is a move short. In the Sicilian race, count tempi rather ' +
            'than material: the side that opens a file first usually wins.',
          wrong: {
            'Bxa2+':
              'A check, but Kxa2 takes the bishop for a pawn, and the white king is safe on a2. The engine prefers White after it.',
            Bxg5: {
              text: 'Grabbing the pawn ignores the real problem: after Bxg5 your bishop on e6 is still attacked, and you end up a piece down for two pawns.',
              refute: 'Bxg5',
            },
            Nc5: 'Developing, but your bishop on e6 is still attacked: after fxe6 fxe6 you are a piece down for a pawn, with some play but not enough.',
          },
          failure:
            'Your bishop on e6 is attacked anyway. Where can it go so that taking it opens a line to the white king?',
          reply: 'axb3',
          replyNote:
            'White takes. Declining is no better: the bishop on b3 attacks the knight on c2, the king’s last defender.',
          then: {
            prompt: 'How do you recapture?',
            moves: ['axb3'],
            hint: 'Recapture so that a file opens toward the king.',
            success:
              '**axb3**: the a-file is open, your rook on a8 looks straight down it, and the knight on c2 is attacked.',
            why:
              'White has to block the file and save the knight in one move. A bishop for a pawn is a small price for an ' +
              'open file against the king. That is the Sicilian in one picture: White attacks on the kingside, and ' +
              'Black’s pawns and pieces arrive first on the other wing.',
            failure: 'Recapture so that a file opens toward the white king.',
            reply: 'Na3',
            replyNote:
              'The only good move: the knight blocks the a-file and leaves c2 at the same time. The engine calls it roughly level, with Black’s pieces swarming around the white king.',
          },
        },
      },
      {
        title: 'Summary',
        text:
          'Here is what I check in every Open Sicilian.\n\n' +
          '**As Black:**\n\n' +
          '- Can I play ...d5? If it works, it usually equalises at once.\n' +
          '- Use the c-file: a rook on c8, pressure on c3, and the exchange sacrifice there when White’s king has ' +
          'castled long.\n' +
          '- Push ...b5-b4 against a queenside king, and keep the knight on f6, which guards d5 and h7.\n\n' +
          '**As White:**\n\n' +
          '- Develop fast and attack: f4-f5 against ...e6 set-ups, g4-g5 with the king on c1 against ...e5.\n' +
          '- Put a piece on d5 once Black can no longer challenge it.\n' +
          '- Never let the game go quiet. A quiet Sicilian is Black’s Sicilian.',
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
    minutes: 11,
    steps: [
      {
        title: 'Where the pawn chains point',
        text:
          'In the Classical King’s Indian, once White plays d5 the centre is locked. White’s pawns on d5 and e4 point ' +
          'at the queenside, Black’s on d6 and e5 at the kingside. The rule for a locked centre: **attack where your ' +
          'pawns point**, with the break that hits the enemy chain at its base.\n\n' +
          '- **Black** plays ...f5 against e4, then ...f4 to gain space, and ...g5-g4 to open lines against the ' +
          'king.\n' +
          '- **White** plays c5 against d6, prepared by b4 or a knight on d3, then opens the c-file and aims a ' +
          'knight at c7.\n\n' +
          'Each side knows the other’s plan. It is a race, and tempi count for more than pawns.',
        fen: KID_F5,
        orientation: 'black',
        shapes: ['f7f5', 'c4c5:red', 'd6e5:blue', 'd5c4:blue'],
      },
      {
        title: 'Black’s storm',
        text:
          'Your knight went back to d7 for one reason: to free the f-pawn. White’s knight has gone to e1, on its way ' +
          'to d3 to support c5, and the bishop on e3 eyes your queenside.\n\n' +
          'Now play Black’s plan, one move at a time. Each move should gain space on the kingside or open a line ' +
          'toward the white king; a tempo spent on the queenside is a tempo your attack never gets back.',
        fen: KID_F5,
        orientation: 'black',
        task: {
          prompt: 'How do you start the kingside plan?',
          moves: ['f5'],
          hint: 'Which pawn break hits White’s chain at its base?',
          success:
            '**f5**: the pawn hits e4, the base of White’s chain, and the f-file opens behind it for your rook.',
          why:
            'Everything Black does on the kingside starts with this move: the f-pawn gains space, and later the ' +
            'g-pawn follows. **h5** and **Kh8** are useful moves too, and they often come later, but they are ' +
            'preparation; the break is the plan itself. Play the move that starts your plan before the ones that tidy ' +
            'up.',
          wrong: {
            h5: '**h5** is a modern idea and a good move: it keeps White’s pawns off g4. But it is preparation. The break that starts your kingside play is the f-pawn’s.',
            Kh8: '**Kh8** is a useful move that Black often plays sooner or later, clearing g8 for a knight. But the break itself comes first.',
            a5: '**a5** slows White’s queenside play and is playable. But it spends a tempo on the wing where your pawns do not point.',
          },
          failure:
            'Several moves are playable, but this step is about your plan. Which pawn break hits White’s chain on the kingside?',
          reply: 'f3',
          replyNote:
            'White holds e4 with a pawn. Now you have a choice: take on e4, or push past it.',
          then: {
            prompt: 'Take on e4, or push past it?',
            moves: ['f4'],
            hint: 'Which move gains space on the kingside and hits the bishop on e3 at the same time?',
            success:
              '**f4**: the pawn gains space, hits the bishop on e3 and keeps the centre closed, ready for the g-pawn to follow.',
            why:
              'Taking is playable, but after fxe4 fxe4 the f-file opens and a pair of rooks comes off there, which takes ' +
              'the sting out of your attack. With f4 the centre stays shut and the kingside is yours to storm. **h5** ' +
              'and **Kh8** are again about as good, but they are still preparation.',
            wrong: {
              fxe4: '**fxe4** is playable, but after the recapture the f-file opens and a pair of rooks comes off, which takes the sting out of your kingside attack. Keep the centre closed and gain space instead.',
              h5: '**h5** is about as good, and the engine agrees, but it is still preparation. The plan move is the f-pawn’s next step.',
              Kh8: '**Kh8** is a useful move, but it is still preparation. The plan move is the f-pawn’s next step.',
            },
            failure:
              'This step is about the kingside plan: the f-pawn goes forward, gaining space and taking squares from White’s pieces.',
            reply: 'Bf2',
            replyNote:
              'The bishop steps back to f2. Your pawn on f4 is fixed now, and the g-pawn is next.',
            then: {
              prompt: 'How do you continue the storm?',
              moves: ['g5'],
              hint: 'The f-pawn has gone as far as it can for now. Which pawn comes next?',
              success:
                '**g5**: the g-pawn joins in, heading for g4, where it will hit f3 and open lines toward the white king.',
              why:
                'With f4 fixed, the attack needs a second pawn: g5-g4 hits f3 and opens the g-file for a rook. The ' +
                'knights come to g6 and f6 later; pawns first, pieces after. **h5** first is playable but slower, and ' +
                'the engine prefers g5. In closed positions, pawn storms take time, so start them at once.',
              wrong: {
                h5: '**h5** belongs to the same storm and is playable, but it is a move slower: g5 gets the g-pawn to g4 sooner.',
              },
              failure:
                'Keep the pawns rolling: the f-pawn is fixed on f4, so the storm needs the pawn beside it.',
              reply: 'b4',
              replyNote:
                'White races on the other wing, with c5 next. From here on it is a pure race: your pawns against White’s.',
            },
          },
        },
      },
      {
        id: 'white-break-c5',
        title: 'White’s break: c5',
        text:
          'Now sit on the other side of the board. White’s knight has come to d3 to support the break, and Black has ' +
          'already pushed ...f4. If White spends the next moves defending the kingside, the g-pawn arrives and the ' +
          'game is decided on White’s king.\n\n' +
          'White’s answer is to be faster. The c-pawn is White’s f-pawn: the break that hits Black’s chain at its ' +
          'base.',
        fen: KID_C5,
        shapes: ['d6:red', 'c4:blue'],
        task: {
          prompt: 'Which pawn break opens the queenside?',
          moves: ['c5'],
          hint: 'Black’s chain is d6 and e5. Which pawn can hit it at its base?',
          success:
            '**c5**: the pawn hits d6, the base of Black’s chain. Next, cxd6 opens the c-file for your rook and the road to c7 for a knight.',
          why:
            'The c-file is White’s answer to Black’s kingside storm, just as the f- and g-files are Black’s. **a4**, ' +
            '**b4** and **Be1** are good moves too, and the engine rates them about the same, but they prepare the ' +
            'break rather than play it. In a race, the side that opens a file first usually gets there first.',
          wrong: {
            a4: '**a4** is a strong move, and the engine likes it a touch more: it gains space and prepares a5. But it prepares the break rather than playing it, and this step is about the break.',
            b4: '**b4** supports c5 and is a good move too. But here the break can be played at once, and this step is about the break itself.',
            Be1: '**Be1** is a useful regrouping move, but it is still preparation. This step is about opening the queenside.',
          },
          failure:
            'Good preparing moves exist here, but this step is about the break. Which pawn hits Black’s chain at its base?',
        },
      },
      {
        id: 'bayonet',
        title: 'The Bayonet: 9. b4',
        text:
          'White’s most direct version is the **Bayonet**, 9. b4, going for c5 at once without the slow knight ' +
          'manoeuvre. Black must not just wait: the kingside plan still starts with ...f5, and for that the knight on ' +
          'f6 has to get out of the f-pawn’s way.\n\n' +
          'Where it goes is a matter of taste. From h5 it eyes the f4 square; from e8 or d7 it is more modest, but ' +
          'solid.',
        fen: KID_BAYONET,
        orientation: 'black',
        shapes: ['f7f5:blue', 'f6:red'],
        task: {
          prompt: 'How do you prepare ...f5?',
          moves: ['Nh5', 'Ne8', 'Nd7'],
          hint: 'The f-pawn cannot move while the knight on f6 stands in front of it.',
          success: 'The knight steps aside, and the f-pawn is free to go. Next comes ...f5.',
          why:
            'Against 9. b4, **Nh5** is the main line: the knight frees the f-pawn and is ready to jump to f4, where it ' +
            'hits e2 and g2. **Ne8** and **Nd7** do the same job more quietly, and the engine rates all three about ' +
            'equally. **a5**, slowing White’s queenside, is the other main approach. Whichever you choose, keep the ' +
            'plan: ...f5 comes next.',
          wrong: {
            a5: '**a5** is the other main line: it slows White’s b4-b5 and c5. A fine move, but it does not prepare ...f5, and this step is about the kingside plan.',
          },
          failure:
            'Several moves are playable, but this step is about preparing ...f5: which piece stands in the f-pawn’s way?',
        },
      },
      {
        id: 'summary',
        title: 'Summary',
        text:
          'The King’s Indian plans in a nutshell:\n\n' +
          '**Black:**\n\n' +
          '- ...f5, then usually ...f4 rather than ...fxe4, then ...g5-g4.\n' +
          '- Knights to g6 and f6, a rook to f7 or f6, and every piece toward the white king.\n' +
          '- Spend as little as you can on the queenside: a tempo there is a tempo less for the attack.\n\n' +
          '**White:**\n\n' +
          '- c5, prepared by b4 or a knight on d3, then cxd6 to open the c-file.\n' +
          '- A knight to b5 and c7, a rook to c1.\n' +
          '- One well-timed defensive move on the kingside is worth more than three early ones.',
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
    minutes: 8,
    steps: [
      {
        title: 'The clock is a piece',
        text:
          'Every move costs time, and time spent early cannot be spent later. The practical player spends it where it ' +
          'changes the result:\n\n' +
          '- **Critical moments** deserve minutes: a pawn break, an exchange, a sacrifice, the move into an endgame. ' +
          'A developing move in a familiar position deserves seconds.\n' +
          '- **When two moves look equally good, play either.** The difference is usually smaller than the time you ' +
          'would lose choosing.\n' +
          '- **Keep a reserve** for the ending, where calculation is concrete and mistakes are final.\n\n' +
          'Before each move, ask: *is this a moment?* If not, trust your hand. If it is, like the rook ending in the ' +
          'diagram, take your time and count.',
        fen: PRACTICAL_SIMPLIFY,
        orientation: 'black',
      },
      {
        title: 'When ahead, simplify',
        text:
          'Material is level in this rook ending, but your king on g7 is far closer to the centre than White’s, which ' +
          'is stuck on h1. Edges like that are easy to spoil when the clock is ticking.\n\n' +
          'This is a moment, so count. The rooks attack each other on the c-file. If they come off, what happens in ' +
          'the pawn ending?',
        fen: PRACTICAL_SIMPLIFY,
        orientation: 'black',
        shapes: ['c2c4', 'g7f6:blue'],
        task: {
          prompt: 'Which move makes the win simple?',
          moves: ['Rxc4'],
          hint: 'Picture the pawn ending after a trade of rooks. Whose king gets to the queenside first?',
          success:
            '**Rxc4**: the rooks come off. After bxc4 your king walks to the c4 pawn long before White’s king can help it.',
          why:
            'With the rooks on, White’s rook gets active and the game is level: **Rb2** Rxc6 Rxb3, for example, is a ' +
            'draw. After the trade, the pawn ending wins by itself, because your king is closer. When you are better ' +
            'and short of time, look for the trade into an ending you can count, and count it before you play.',
          wrong: {
            Rb2: {
              text: 'You win a pawn, but White wins one back: Rxc6, and with both rooks on, the ending is level.',
              refute: 'Rxc6',
            },
          },
          failure:
            'Count the pawn ending first. If the rooks come off, whose king reaches the queenside pawns first?',
          reply: 'bxc4',
          replyNote:
            'Forced, or White is simply a rook down. Now it is a pure pawn ending, and the kings race.',
          then: {
            prompt: 'Which king move wins?',
            moves: ['Kf6'],
            hint: 'Your king wants the c4 pawn. Which way does it walk?',
            success:
              '**Kf6**: the king heads for e5, d4 and the c4 pawn, and White’s king is too far away to defend it.',
            why:
              'Only the king march wins: Ke5 and Kd4 come next, and the c-pawn falls. A pawn move such as **c5** or ' +
              '**f5** wastes the tempo, the white king gets back in time, and the engine calls it level. In pawn endings ' +
              'one tempo is often the whole game: walk the king first and push the pawns later.',
            wrong: {
              f5: {
                text: 'A pawn move costs the tempo your king needs: Kh2, and the white king heads for the centre in time. Walk the king first.',
                refute: 'Kh2',
              },
              c5: {
                text: 'That gains nothing: Kg1, and the white king walks toward the centre in time. Walk your king first.',
                refute: 'Kg1',
              },
            },
            failure:
              'Walk the king toward the c4 pawn. In pawn endings the king comes first and the pawns later.',
          },
        },
      },
      {
        id: 'count-then-trade',
        title: 'Again: count, then trade',
        text:
          'Another rook ending, and both rooks are attacked. Your rook can step away and keep the game going, or you ' +
          'can trade into a pawn ending.\n\n' +
          'Count before you decide. After the trade your king goes for the pawn on h3, White’s king for the pawn on ' +
          'b6. Whose pawn queens first, and can the other one still be stopped? Twenty seconds of counting here saves ' +
          'twenty minutes later.',
        fen: PRACTICAL_SIMPLIFY_2,
        orientation: 'black',
        shapes: ['b2c2', 'h3:red', 'b6:red'],
        task: {
          prompt: 'Trade the rooks, or keep them?',
          moves: ['Rxc2'],
          hint: 'Count the race: your king to h3 and the g-pawn to g1, against White’s king to b6 and the a-pawn to a8.',
          success:
            '**Rxc2**: the rooks come off, and after Kxc2 your king heads straight for the h3 pawn.',
          why:
            'Your king takes h3 in three moves and the g-pawn needs four more; White’s king needs four moves just to ' +
            'reach b6, so your pawn queens first. Keeping the rooks with **Rb3+** or **Rb4** is level. When you can ' +
            'count a pawn ending to the end, trust the count and play it.',
          wrong: {
            'Rb3+':
              'That keeps the rooks on, and after Ke2 Rxh3 the ending is level: White’s rook and a-pawn are active enough. The pawn ending is the win.',
            Rb4: 'That keeps the rooks on, and the engine calls it level. The pawn ending after the trade is a clear win: count it.',
          },
          failure:
            'Count the pawn ending after the trade: your king to h3, White’s king to b6. Which pawn is faster?',
          reply: 'Kxc2',
          replyNote:
            'White takes back. Now both kings set off for the enemy pawns, and the count decides.',
          then: {
            prompt: 'Which king move wins the race?',
            moves: ['Kf4'],
            hint: 'Your king’s target is the pawn on h3. Which road is the shortest?',
            success: '**Kf4**: the king heads for g3 and the h3 pawn, and then the g-pawn runs.',
            why:
              'Every other king move is a tempo slower, and then the race is level. **Ke4** also heads for h3, but from ' +
              'e4 the king needs one move more. Pick a target, go straight for it, and count again once you get there.',
            wrong: {
              Ke4: {
                text: 'A step toward h3, but a slow one: from e4 the king needs a move more than from f4, and after Kb3 White’s king is in time. The race is level.',
                refute: 'Kb3',
              },
              Ke5: {
                text: 'That heads for the b-pawn instead, and the white king is closer to it: Kb3, and the race is level.',
                refute: 'Kb3',
              },
            },
            failure: 'Go straight for the pawn on h3: your king needs the shortest road there.',
          },
        },
      },
      {
        id: 'pawn-race',
        title: 'Do not panic in the pawn race',
        text:
          'Both sides have a passed pawn, and Black’s d-pawn is two squares from queening while yours on b4 has four ' +
          'to go. In time trouble that looks frightening, so this is a moment: count.\n\n' +
          'Your king on f2 is close enough to catch the d-pawn: it already covers e1 and e2. Black’s king on g5 is ' +
          'too far away to stop your b-pawn for good. Keep both facts true and the game is won. There is more than ' +
          'one way to do it.',
        fen: PRACTICAL_CALM,
        shapes: ['b4b5', 'd3d2:red'],
        task: {
          prompt: 'How do you stay calm and keep the win?',
          // Every move that keeps the king in touch with the d-pawn wins; only a step to the g-file loses.
          moves: ['b5', 'Ke3', 'Kf3', 'Ke1', 'Kf1', 'h4+', 'h3'],
          hint: 'Your king only has to stay in touch with the d-pawn. Which squares must it keep in reach?',
          success:
            'That keeps both facts true: your king stays in touch with the d-pawn, and the game stays won.',
          why:
            'Seven moves win here. The most direct is **b5**: after b5 d2 Ke2 the d-pawn falls, and b6, b7 and b8 ' +
            'follow. The only losing moves walk the king to the g-file, out of reach of d1. When the clock is low, do ' +
            'not hunt for the best move: find one that keeps the win, check that it does not lose, and play it.',
          wrong: {
            Kg1: {
              text: 'That walks the king away from the d-pawn: d2, and nothing stops d1=Q. Your king must stay where it can reach d1 or d2.',
              refute: 'd2',
            },
            Kg2: {
              text: 'That walks the king away from the d-pawn: d2, and nothing stops d1=Q. Your king must stay where it can reach d1 or d2.',
              refute: 'd2',
            },
            Kg3: {
              text: 'That walks the king away from the d-pawn: d2, and nothing stops d1=Q. Your king must stay where it can reach d1 or d2.',
              refute: 'd2',
            },
          },
          failure:
            'Keep your king in touch with the d-pawn: it must be able to reach d1 or d2 in time.',
        },
      },
      {
        id: 'time-trouble-rules',
        title: 'Time trouble rules',
        text:
          'When the clock gets low:\n\n' +
          '- **Play the move you would play with more time.** Do not switch to a “safe” move you have not checked.\n' +
          '- **Simplify when ahead, complicate when behind.** Trades are easier to play quickly than attacks.\n' +
          '- **Do not give checks for the sake of it.** A check that does nothing costs a tempo and a few seconds.\n' +
          '- **Write nothing off.** With seconds left, your opponent is human too.\n\n' +
          'And the real cure is prevention: spend your time on the moments that matter, as you did in these endings, ' +
          'and play the rest by hand.',
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
    minutes: 8,
    steps: [
      {
        title: 'A piece the defender cannot trade',
        text:
          'With bishops of opposite colours, each side has a piece the other **cannot oppose**. In the endgame that ' +
          'means draws: the defender blockades on the squares of their own bishop. With queens and rooks on, it ' +
          'means the opposite:\n\n' +
          '- **Attack on your bishop’s colour.** The defender’s bishop can never contest those squares.\n' +
          '- **Keep your pawns off that colour**, so they do not block your own bishop.\n' +
          '- **The initiative counts double**: the defender’s bishop cannot come to the rescue.\n\n' +
          'Here White’s light-squared bishop on b3 pins the f7 pawn to Black’s king, and Black’s dark-squared bishop ' +
          'on e7 can do nothing on the light squares around it. Black is a whole rook up, and it will not matter.',
        fen: OPP_PIN,
        shapes: ['b3f7:red', 'e7:blue'],
      },
      {
        title: 'Break in on the bishop’s colour',
        text:
          'The pawn on f7 is pinned by your bishop, so it does not really guard anything. Look at the squares it is ' +
          'supposed to protect, starting with g6, where your queen and the pawn on h5 are both aimed.',
        fen: OPP_PIN,
        shapes: ['b3g8:red'],
        task: {
          prompt: 'Which capture breaks into Black’s king?',
          moves: ['Qxg6+'],
          hint: 'The f7 pawn is pinned. Which of Black’s pawns does that leave without a real defender?',
          success:
            '**Qxg6+**: the queen takes on g6 with check. The pawn on f7 cannot take back because of the pin, and the h5 pawn protects your queen.',
          why:
            'The g6 pawn looked defended by f7, but the pin along the light diagonal made that defence an illusion, and ' +
            'Black’s bishop on e7 cannot help on light squares. Black’s only move is to put the queen in the way, and ' +
            'then that square falls too. Before you count defenders, check which of them are pinned.',
          wrong: {
            Qxe7: {
              text: 'You win the bishop, but Black’s queen takes on h5 and your attack is gone. The light squares around the king were the target, not the dark bishop.',
              refute: 'Qxh5',
            },
          },
          failure:
            'Look at the pawn on f7: it is pinned to the king, so what does it really defend?',
          reply: 'Qg7',
          replyNote:
            'Black’s only move: the queen blocks on g7. But your rook on g1 stands right behind your queen on the g-file.',
          then: {
            prompt: 'How do you finish?',
            moves: ['Qxg7#'],
            acceptAnyMate: true,
            hint: 'Take what blocked the check. Which of your pieces backs the queen up?',
            success:
              '**Qxg7#**: the queen takes on g7, protected by the rook on g1, and the king has no square left.',
            why:
              'Black was a rook up, and both rooks and the dark-squared bishop watched it happen: the pin on the light ' +
              'diagonal did the work. That is opposite-coloured bishops in the middlegame: the attacker’s bishop has no ' +
              'opponent, so every square it controls belongs to the attack.',
            failure: 'Take on g7 with the queen: the rook on g1 protects her there.',
          },
        },
      },
      {
        id: 'long-diagonal',
        title: 'The long diagonal',
        text:
          'Black is a rook up again, but look at the light squares around the king on h8. Your queen on e6 and bishop ' +
          'on d5 line up on the diagonal toward g8, and Black’s bishop on d6 guards dark squares nobody is attacking.\n\n' +
          'The king has one pawn in front of it, on h6, and your rook on h4 is already looking at it.',
        fen: OPP_LONG_DIAGONAL,
        shapes: ['d5g8:red', 'h4h6:blue'],
        task: {
          prompt: 'How do you break open the king?',
          moves: ['Rxh6+'],
          hint: 'The pawn on h6 is the king’s only cover. What happens if you take it with check?',
          success:
            '**Rxh6+**: the rook takes the h-pawn with check, and Black cannot take back without being mated.',
          why:
            'If Qxh6, then Qxh6 is mate: your bishop covers g8, and the king has nowhere to go. So the king must step ' +
            'to g7, next to your rook, and that costs Black the queen. Black’s dark-squared bishop can do nothing about ' +
            'any of it. With opposite bishops, sacrifices on your bishop’s colour tend to work, because the defender ' +
            'cannot cover those squares.',
          wrong: {
            'Qxf6+': {
              text: 'Trading queens gives away your attack: Rxf6, and Black is still a rook up with nothing left to fear.',
              refute: 'Rxf6',
            },
          },
          failure:
            'Look at the pawn on h6, the only cover in front of Black’s king, and at what your queen and bishop could do without it.',
          reply: 'Kg7',
          replyNote:
            'The only move that does not lose at once: the king steps up beside your rook. But look at Black’s queen.',
          then: {
            prompt: 'What does the king’s move cost Black?',
            moves: ['Rxf6'],
            hint: 'Your rook on h6 is attacked. Which black piece is attacked twice?',
            success:
              '**Rxf6**: the rook takes the queen. The king cannot take back, because your queen guards f6.',
            why:
              'Black can recapture with the rook, but then it leaves the eighth rank, and the rook on c8 is loose: your ' +
              'queen on e6 attacks it along the diagonal. Look for what a recapture leaves behind; combinations often ' +
              'win twice.',
            wrong: {
              'Qxf6+':
                'Taking with the queen just trades queens: after Rxf6 Black is still a rook up, and your attack has gone. Take with the piece you can spare, and keep the queen on e6.',
            },
            failure: 'Black’s queen on f6 is attacked by your rook and by your queen.',
            reply: 'Rxf6',
            replyNote:
              'The rook takes back, but it has left the eighth rank, and the rook on c8 is on its own.',
            then: {
              prompt: 'What is left to collect?',
              moves: ['Qxc8'],
              hint: 'Which black piece has no protection now?',
              success:
                '**Qxc8**: the second rook falls too. You have queen and bishop against rook and bishop, and Black’s king is still exposed.',
              why:
                'From a rook down to queen against rook in three moves. It all came from one source: Black’s bishop could ' +
                'never contest the light squares around the king, so your queen and bishop had them to themselves. In ' +
                'opposite-bishop middlegames, aim everything at your bishop’s colour.',
              wrong: {
                'Qd7+':
                  '**Qd7+** keeps a winning position too, but why give a check when you can take a whole rook? Qxc8 collects it at once, with nothing left to calculate.',
                'Qg4+':
                  '**Qg4+** keeps a winning position too, but why give a check when you can take a whole rook? Qxc8 collects it at once, with nothing left to calculate.',
              },
              failure: 'One black piece has been left without protection.',
            },
          },
        },
      },
      {
        id: 'black-attacks',
        title: 'The same idea for Black',
        text:
          'Now you are the attacker. White is a rook up for a pawn and threatens Rxe8+, so there is no time to lose. ' +
          'But look at the light squares around White’s king: your bishop on e4 covers f3, g2 and h1, and White’s ' +
          'dark-squared bishop on d4 can never contest them.\n\n' +
          'Your queen only needs one open line to the king.',
        fen: OPP_BLACK,
        orientation: 'black',
        shapes: ['e4h1:red', 'g3:blue'],
        task: {
          prompt: 'Which check opens the way?',
          moves: ['Qe1+'],
          hint: 'Your queen can reach the back rank with check. What can White put in the way?',
          success:
            '**Qe1+**: the queen checks on the back rank. White has two answers, Rf1 and Kh2, and both lose at once.',
          why:
            'After Kh2 Qh1# your bishop guards the queen on h1; after Rf1 Qxg3# it covers g2 and h1 while the queen ' +
            'covers the rest. White’s bishop on d4 watches it all from the wrong colour. In opposite-bishop ' +
            'middlegames, the attacker’s bishop is often worth a rook.',
          wrong: {
            Rxa8: {
              text: '**Rxa8** wins the rook back, and after Kh2 you are even a little better. But there is a mate on the board: look at the checks first.',
              refute: 'Kh2',
            },
            'Qb1+': {
              text: 'The right idea from the wrong square: after Rf1 your queen on b1 cannot reach g3, and the attack has run out.',
              refute: 'Rf1',
            },
          },
          failure:
            'Look for a check on the back rank. White’s king can only run to light squares, and your bishop owns them.',
          reply: 'Rf1',
          replyNote:
            'White blocks with the rook; Kh2 Qh1# was no better. Now look at White’s queen on g3.',
          then: {
            prompt: 'How do you finish?',
            moves: ['Qxg3#'],
            acceptAnyMate: true,
            hint: 'What is White’s queen on g3 guarding, and what happens if it disappears with check?',
            success:
              '**Qxg3#**: the queen takes on g3 with check. Your bishop covers g2 and h1, the queen covers f2 and h2, and the rook on f1 blocks the last square.',
            why:
              'Both bishops were on the board until the end, and only one of them mattered: White’s bishop on d4 could ' +
              'not cover a single light square near its own king. The more pieces there are on the board, the stronger ' +
              'opposite-coloured bishops are for the attacker.',
            failure: 'Look at White’s queen on g3: can your queen take it with check?',
          },
        },
      },
      {
        id: 'endgame-draw',
        title: 'And in the endgame…',
        text:
          'Trade the queens and rooks, and the same bishops mean the opposite. Black is a pawn up here, but White’s ' +
          'bishop guards e2, a light square on the e-pawn’s path, and Black’s dark-squared bishop can never challenge ' +
          'it. The engine calls it a dead draw.\n\n' +
          'So the rule cuts both ways. With opposite-coloured bishops, **attack in the middlegame and avoid the ' +
          'endgame** if you are the one who is better; if you are worse, trade the heavy pieces and head for the ' +
          'ending.',
        fen: OPP_ENDGAME,
        shapes: ['c4e2:blue', 'e4:red'],
      },
    ],
    practiceThemes: ['kingsideAttack', 'pin'],
  },
];
