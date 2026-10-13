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
const PASSER_FORK = '4r1k1/2nbqp1p/5Rp1/3Pn3/2p1PQ2/2N4P/2B1N1P1/6K1 w - - 0 28';
const PASSER_SEVENTH = '4rbk1/p2q1p1p/1p1P2p1/8/4QP1B/7P/3R2PK/8 w - - 5 31';
const PASSER_DECOY = '8/6p1/p2Pk2p/2Pb4/3K3P/8/PP6/8 w - - 1 45';
const BLOCKADE = '6k1/5ppp/1pb5/3p4/8/1P3N1P/P3r1P1/R6K w - - 1 25';
const PAWN_BREAK = '8/pp3p2/7k/2P5/1P6/8/5K2/8 w - - 0 39';

// Bishop against knight.
const KNIGHT_OUTPOST = '6k1/5pb1/2p1p1pp/1pNpP3/3P1P2/6P1/PP4KP/8 w - - 0 1';
const RIM_KNIGHT = '8/pp4k1/2p5/3pNp2/3P1P2/2P2K2/PP5n/8 w - - 10 35';
const CORNER_KNIGHT = 'N7/8/1b1p4/p2Pk3/P5K1/7P/8/8 b - - 4 43';
const TRAPPED_BISHOP = '8/5pk1/3Q1bp1/3Pp2p/3rP1PP/5P2/4b1K1/8 w - - 1 43';

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
    minutes: 10,
    steps: [
      {
        id: 'outside-passer',
        title: 'Knight endings are pawn endings',
        text:
          'Here is the idea that makes knight endings simple: **a knight ending is a pawn ending in disguise.** ' +
          'A knight is short-legged, so it struggles against a passed pawn far away, and it cannot wait: a bishop can ' +
          'slide along its diagonal and keep watching the same squares, but every knight jump lets go of every square ' +
          'it watched. So the pawn-ending ideas you know, the active king and the outside passed pawn, decide here too.\n\n' +
          'Count the board. White is a pawn up, and the extra pawn is an **outside passed pawn** on the b-file, far ' +
          'from Black’s king. The plan is the pawn-ending plan: use the passer to drag Black’s knight to the queenside, ' +
          'then let your king collect what it left behind.',
        fen: KNIGHT_PASSER,
        shapes: ['b4b5', 'b5b6', 'd3d4:blue', 'f6:red'],
        task: {
          prompt: 'How do you start the pawn-ending plan?',
          moves: ['b5', 'Kd4', 'Kc4', 'Kc3'],
          hint: 'Which white pawn has no black pawn in front of it, and which of your pieces should be helping it?',
          success:
            'The plan is under way: the b-pawn runs, or your king steps up to escort it. Either way Black’s knight must ' +
            'leave the kingside to deal with the pawn.',
          why:
            'A knight can only stop a passed pawn from close by, so Black’s knight has to go to the queenside and stay ' +
            'there. Black’s king cannot help it without abandoning its own pawns. Your king, meanwhile, is free to ' +
            'escort the pawn or raid the kingside. Before you trade into a knight ending, count it as a pawn ending: ' +
            'who has the outside passer, and whose king is closer?',
          wrong: {
            Ke3: {
              text:
                'Heading for the kingside is the second half of the plan, not the first. With the b-pawn left alone, ' +
                '**Nd5+** forks your king and the pawn, **Nxb4** follows, and material is level.',
              refute: 'Nd5+',
            },
            g4: {
              text:
                '**g4** hits h5, but it hands Black a pawn: **hxg4** attacks your knight, nothing can take back on g4, ' +
                'and material is level again.',
              refute: 'hxg4',
            },
          },
          failure:
            'Treat it as a pawn ending: the plan is to push the passed b-pawn, or to bring your king forward to ' +
            'escort it.',
        },
      },
      {
        id: 'rook-pawn',
        title: 'The knight against a rook pawn',
        text:
          'Now the knight’s blind spot: the **rook pawn**. To stop a pawn heading for h1, a knight has only two ' +
          'squares that guard the corner, **f2** and **g3**, and the enemy king can take both away. A knight that ' +
          'holds easily against a centre pawn can lose against a rook pawn.\n\n' +
          'Here Black’s pawn needs two moves to queen, and its king is ready to help. Your knight is far away on b2, ' +
          'and your own king on d1 blocks one of its routes. Count the jumps before you touch anything.',
        fen: KNIGHT_ROOK_PAWN,
        shapes: ['b2d3', 'd3f2', 'f2h1:blue', 'h3h2:red'],
        task: {
          prompt: 'The pawn needs two moves to queen. Which knight move gets there in time?',
          moves: ['Nd3'],
          hint: 'f2 is the square to reach. Which jump from b2 lands one jump away from it?',
          success: '**Nd3**: one jump from f2, the square where the knight guards h1.',
          why:
            'If **h2**, the knight jumps to f2 at once, and **h1=Q** is met by **Nxh1**. Every other move is a tempo ' +
            'short: after **Ke2** the reply **h2** leaves the knight unable to reach f2 or g3 before the pawn queens. ' +
            'Against a rook pawn, plan the knight’s route before you do anything else.',
          wrong: {
            Ke2: {
              text:
                'The king comes closer, but it is a tempo short: **h2**, and the knight on b2 cannot reach f2 or g3 ' +
                'in one jump. The pawn queens next move.',
              refute: 'h2',
            },
            Nc4: {
              text:
                'The knight heads for e3, but from e3 it does not guard h1. After **h2** it is still one jump short ' +
                'of f2 and g3, and the pawn queens.',
              refute: 'h2',
            },
          },
          failure:
            'The pawn needs only two moves. Find the knight route that reaches f2, the square that guards h1, in ' +
            'two jumps.',
          reply: 'Kg3',
          replyNote:
            'Black’s king comes to g3. It now guards f2, so the knight cannot land there yet, and it is heading for ' +
            'g2 to escort the pawn home.',
          then: {
            prompt: 'The black king guards f2. How do you make that square safe for your knight?',
            moves: ['Ke2', 'Ke1'],
            hint: 'A knight on f2 needs a defender. Which of your pieces can reach a square next to f2?',
            success:
              'Your king steps next to f2, so the knight can land there under its protection.',
            why:
              'The knight cannot hold the corner alone, so the king guards its square for it. **Nf2** right away ' +
              'loses the knight to **Kxf2**, and then nothing stops the pawn. King and knight together are enough: ' +
              'once the knight sits on f2, defended, the pawn can never queen.',
            wrong: {
              Nf2: {
                text: 'Right square, wrong moment: the king on g3 takes it. **Kxf2**, and nothing can stop the pawn.',
                refute: 'Kxf2',
              },
            },
            failure:
              'The knight wants f2, but the black king guards it. Bring your king next to f2 first, so the knight ' +
              'lands there protected.',
            reply: 'h2',
            replyNote:
              'Black pushes. The pawn is one step from h1, and the corner has to be covered now.',
            then: {
              prompt: 'The pawn is one step from queening. Where does the knight go?',
              moves: ['Nf2'],
              hint: 'Which square guards h1 and is protected by your king?',
              success:
                '**Nf2**: the knight guards h1, and your king protects it. If **h1=Q**, then **Nxh1**.',
              why:
                'Black has nothing left. If the king attacks with **Kg2**, the knight can even jump into the ' +
                'corner: after **Kg2 Nh1 Kxh1 Kf1** Black is stalemated. Remember the two squares, f2 and g3: when ' +
                'the knight reaches one of them in time, protected, the rook pawn is held.',
              wrong: {
                Kf1: {
                  text: 'The king cannot cover h1 from f1: **h1=Q+** comes with check. The knight has to guard the corner.',
                  refute: 'h1=Q+',
                },
              },
              failure:
                'The pawn queens next move unless h1 is guarded. The knight guards it from f2, where your king ' +
                'protects it.',
            },
          },
        },
      },
      {
        id: 'check-on-the-way',
        title: 'Checks gain time',
        text:
          'A knight that is too slow can often win the tempo it needs with a **check**. The king has to answer, so ' +
          'the pawn does not move, and if the check also brings the knight closer to the queening square, the race ' +
          'changes.\n\n' +
          'Here the pawn on f2 queens next move. Your knight on h6 needs a square that guards f1, such as e3 or g3, ' +
          'and no quiet move gets there in time. Your king on g6 is no help. Look at the black king on d6.',
        fen: KNIGHT_TEMPO_CHECK,
        shapes: ['h6f5', 'f5g3:blue', 'f2f1:red'],
        task: {
          prompt: 'The pawn queens next move. Which knight move saves the game?',
          moves: ['Nf5+'],
          hint: 'Only a check gives you time. Which check also takes the knight toward e3 and g3?',
          success:
            '**Nf5+**: check, so **f1=Q** has to wait, and the knight is now one jump from both e3 and g3.',
          why:
            'From h6 no knight move reaches a square that guards f1, so a quiet move loses a tempo the knight does ' +
            'not have. The check buys it. **Nf7+** checks too, but it jumps away from f1, and after **Ke7** the pawn ' +
            'queens. In knight endings, look for checks that also bring the knight where it needs to be.',
          wrong: {
            'Nf7+': {
              text:
                'A check, but in the wrong direction: from f7 the knight is even further from f1. After **Ke7** it ' +
                'cannot reach e3 or g3 in one jump, and the pawn queens.',
              refute: 'Ke7',
            },
            Ng4: {
              text:
                'The knight attacks the pawn, but a pawn on the seventh needs no protection. **f1=Q**, and from g4 ' +
                'the knight does not even see f1.',
              refute: 'f1=Q',
            },
          },
          failure:
            'The pawn queens next move, so a quiet move is too slow. Look for a check that also brings the knight ' +
            'toward e3 or g3.',
          reply: 'Ke5',
          replyNote:
            'The king attacks your knight. Black hopes to win the race, but the knight has one more jump.',
          then: {
            prompt: 'Your knight is attacked. Where does it go to stop the pawn?',
            moves: ['Ng3', 'Ne3'],
            hint: 'Which squares guard f1? One jump from f5 reaches two of them.',
            success: 'The knight now guards f1: if the pawn queens, it is taken at once.',
            why:
              'Both e3 and g3 guard f1, and the king on e5 cannot reach either in one step, so the knight arrives ' +
              'with the tempo the check bought. Count a knight race the way you count a pawn race, move by move, and ' +
              'look for checks to make up a missing tempo.',
            failure:
              'The pawn queens next move unless f1 is guarded. Two squares one jump away guard it, and the king ' +
              'cannot reach either of them.',
            reply: 'Kf4',
            replyNote:
              'The king attacks the knight again. It has to move, and it must still keep the pawn from queening.',
            then: {
              prompt: 'Attacked again. Which square keeps the pawn from queening?',
              moves: ['Nf1'],
              hint: 'The knight is attacked, and the king will keep chasing it. What is the most direct way to stop a pawn that needs f1?',
              success: '**Nf1**: the knight blocks the queening square itself.',
              why:
                'Black cannot drive it away for good. If the king attacks f1 from e2 or g2, the knight jumps to g3 or ' +
                'e3 with check and still guards f1, while your king walks back. **Nh5+** or **Ne2+** check too, but ' +
                'from h5 or e2 the knight no longer sees f1. A knight in front of the pawn, with checks in reserve, ' +
                'holds on its own.',
              wrong: {
                'Nh5+': {
                  text:
                    'A check, but it takes the knight away from f1. **Kg4** attacks it, and the only way back to ' +
                    'guarding f1 is g3, where the king takes it.',
                  refute: 'Kg4',
                },
                'Ne2+': {
                  text:
                    'A check, but from e2 the knight does not guard f1. After **Kg4** the only way back is g3, where ' +
                    'the king takes it, and the pawn queens.',
                  refute: 'Kg4',
                },
              },
              failure:
                'The knight must keep f1 covered, or stand on it. Find the square where the king cannot chase it ' +
                'away for good.',
            },
          },
        },
      },
      {
        id: 'give-the-knight',
        title: 'Give the knight for the pawn',
        text:
          'When nothing else works, remember the bottom line: **a king alone cannot mate.** If your knight can give ' +
          'itself up for the last pawn, the game is a draw.\n\n' +
          'Here the pawn on g2 queens next move, your king on b7 is far away, and the knight on d1 cannot reach a ' +
          'square that guards g1 in one jump. But one jump gains a tempo.',
        fen: KNIGHT_SACRIFICE,
        shapes: ['d1e3', 'e3g2:blue'],
        task: {
          prompt: 'The pawn queens next move. How does the knight save the game?',
          moves: ['Ne3+'],
          hint: 'You need a tempo and a target. Which check also attacks g2?',
          success: '**Ne3+**: check, and the knight attacks the pawn on g2 at the same time.',
          why:
            'Black must answer the check, so **g1=Q** has to wait, and next move the knight takes on g2. **Nf2+** ' +
            'checks too, but from f2 the knight neither attacks g2 nor guards g1, and the pawn promotes. A check that ' +
            'also hits the pawn is the knight’s favourite way to win a tempo.',
          wrong: {
            'Nf2+': {
              text:
                'A check, but from f2 the knight neither attacks g2 nor guards g1. **Kg3** attacks it, and nothing ' +
                'can stop **g1=Q**.',
              refute: 'Kg3',
            },
          },
          failure:
            'The pawn queens next move. Find the knight move that gains a tempo with check and hits the pawn at the ' +
            'same time.',
          reply: 'Kf3',
          replyNote:
            'Black’s king steps up to protect the pawn and attack your knight. A retreat now would let **g1=Q** ' +
            'through.',
          then: {
            prompt: 'The pawn is protected. What now?',
            moves: ['Nxg2'],
            hint: 'What is left on the board if the knight and the pawn both disappear?',
            success:
              '**Nxg2**: the knight takes the last pawn. After **Kxg2** only the kings remain, and the game is drawn.',
            why:
              'Material only wins when it can still mate, and two bare kings cannot. So giving your last piece for ' +
              'the last pawn is a full success, while any retreat lets **g1=Q** through. When an ending is going ' +
              'wrong, look for the moment you can remove the last pawn, even at the cost of your last piece.',
            wrong: {
              Kc6: {
                text:
                  'Your king is far too slow to help, and Black does not wait for it: **Kxe3** removes the knight, ' +
                  'and the pawn queens next move.',
                refute: 'Kxe3',
              },
            },
            failure:
              'Anything but taking lets the pawn queen. Your knight can still reach g2, and it does not matter that ' +
              'the king takes back.',
          },
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
      'A rook usually beats a pawn, but only if the king helps. Learn when to bring the king, when to check, where the rook stands best, and how the pawn side holds.',
    minutes: 13,
    steps: [
      {
        id: 'king-first',
        title: 'The king first',
        text:
          'Rook against pawn comes up after almost every pawn race, and it is decided by counting tempi. Three ' +
          'rules carry you through it:\n\n' +
          '- **The rook alone cannot win** against a pawn its king supports: your king has to come.\n' +
          '- **Cut the king off, or check it in front of its pawn.** Every tempo the defending king loses is one ' +
          'your king gains.\n' +
          '- **The defender pushes**, with the king beside the pawn, never in front of it.\n\n' +
          'Here your rook on e2 holds the second rank, and the pawn needs three moves to queen. Before you move ' +
          'your king, count where the pawn will be when it arrives.',
        fen: RP_KING_FIRST,
        shapes: ['e5e4', 'f4:red'],
        task: {
          prompt: 'Where does your king go first?',
          moves: ['Ke4'],
          hint: 'From which square does your king attack the pawn and also guard f3, the square it will reach next?',
          success:
            '**Ke4**: your king attacks the pawn and already guards f3, the square it is about to step to.',
          why:
            'After **f3** your rook comes to e3, and your king on e4 protects a capture on f3. **Kf5** also attacks ' +
            'the pawn, but from f5 the king does not guard f3: after **f3 Re3 Kg2** the rook cannot take without ' +
            'being taken back, and the pawn walks on. Send your king to where the pawn is going, not to where it is.',
          wrong: {
            Kf5: {
              text:
                'Your king attacks the pawn, but from f5 it does not guard f3. After **f3 Re3 Kg2** the rook cannot ' +
                'take on f3 without being taken back, and the pawn walks on.',
              refute: 'f3',
            },
            Re4: {
              text:
                'The rook attacks the pawn, but the king on g3 defends it, and **f3** comes anyway. The rook cannot ' +
                'do this alone: the king has to come first.',
              refute: 'f3',
            },
          },
          failure:
            'The rook is already doing its job on the second rank. Bring your king to the square that also guards ' +
            'f3, the pawn’s next step.',
          reply: 'f3',
          replyNote: 'The pawn runs on, protected by its king. Two more moves and it queens.',
          then: {
            prompt: 'The pawn is on f3. How does the rook join in?',
            moves: ['Re3'],
            hint: 'Attack the pawn along the third rank. What stands behind it on that rank?',
            success: '**Re3**: the rook attacks f3, and the pawn is pinned against the king on g3.',
            why:
              'The pawn cannot move: on f2 it would leave its king in check from your rook. It is attacked twice and ' +
              'defended once, so it falls next move. **Re1** looks natural, guarding f1, but after **f2** and **Kg2** ' +
              'the rook has to give itself up for the pawn. Attack the pawn while it is pinned, rather than waiting ' +
              'for it.',
            wrong: {
              Re1: {
                text:
                  'The rook guards f1, but it attacks nothing. **f2** and **Kg2** follow, and the rook has to give ' +
                  'itself up for the pawn: a draw.',
                refute: 'f2',
              },
            },
            failure:
              'Attack the pawn now, on a square your king protects. Look along the third rank.',
            reply: 'Kg2',
            replyNote:
              'The king steps off the third rank to free its pawn and defend it from g2. But f3 is attacked twice ' +
              'and defended once.',
            then: {
              prompt: 'The pawn is attacked twice and defended once. Finish the job.',
              moves: ['Rxf3'],
              hint: 'Count the attackers and defenders of f3.',
              success: '**Rxf3**: the pawn is gone, and your king on e4 keeps the rook safe.',
              why:
                'King and rook against a lone king is a forced mate, so the race is over. Look back at what decided ' +
                'it: the king came first, to the one square that guarded f3, and only then did the rook strike. ' +
                'Approach first, strike second.',
              wrong: {
                Kf4: {
                  text:
                    'Not yet: **f2**, and the pawn is one step from queening. Your rook will end up giving itself ' +
                    'up for it.',
                  refute: 'f2',
                },
              },
              failure:
                'The pawn on f3 is attacked by your rook and king and defended only by the black king. What does that count tell you?',
            },
          },
        },
      },
      {
        id: 'check-first',
        title: 'Check first',
        text:
          'Here the pawn stands on e2 with its king beside it on f1, and your king on h1 is close, but not quite ' +
          'close enough. If Black gets one free move, **e1=Q** follows.\n\n' +
          'The cure is a check that forces the king **in front of its own pawn**. A pawn cannot move through its ' +
          'own king, so every move the king spends in the way is a tempo for yours. That is the second rule: cut ' +
          'the king off, or check it in front.',
        fen: RP_CHECK_FIRST,
        shapes: ['b6f6', 'f1e1:red', 'h1g2:blue'],
        task: {
          prompt: 'Black threatens to queen. Which check puts the king in front of its pawn?',
          moves: ['Rf6+'],
          hint: 'A check on the f-file leaves the king just one square. Which one?',
          success: '**Rf6+**: the king’s only square is e1, right in front of its pawn.',
          why:
            'With the king on e1 the pawn cannot move, and that tempo lets your king come up. **Rb1+** looks like ' +
            'the same idea, but Black blocks it by queening with **e1=Q**, and after **Rxe1+ Kxe1** nothing is ' +
            'left. A check is only good if the reply costs the defender a tempo.',
          wrong: {
            'Rb1+': {
              text:
                'A check, but Black blocks it by queening: **e1=Q**. After **Rxe1+ Kxe1** the kings are alone, and ' +
                'the game is a draw.',
              refute: 'e1=Q',
            },
            Kh2: {
              text:
                'Too slow: Black takes the free move, **e1=Q**. The best you can then do is give your rook for the ' +
                'new queen, and that is a draw.',
              refute: 'e1=Q',
            },
            Re6: {
              text:
                'Behind the pawn is usually a fine place for a rook, but here it is too late: **e1=Q**, and your ' +
                'rook can only trade itself for the new queen.',
              refute: 'e1=Q',
            },
          },
          failure:
            'Black threatens to queen next move. Find the check that forces the king onto the pawn’s path.',
          reply: 'Ke1',
          replyNote:
            'The only move. The king now stands on e1, the square its pawn needs, so the pawn is frozen.',
          then: {
            prompt: 'The pawn is blocked by its own king. How do you use the tempo?',
            moves: ['Kg2', 'Kg1'],
            hint: 'The rook has done its job. Which of your pieces must now come closer?',
            success:
              'Your king steps toward the pawn, and from there it covers f1 and f2, next to the queening square.',
            why:
              'Now the black king has to step aside to free its pawn, and your king is already close enough to fight ' +
              'for it. **Kh2** comes closer too, but from h2 the king covers neither f1 nor f2, and Black holds the ' +
              'draw. In these races the difference between winning and drawing is often a single square.',
            wrong: {
              Kh2: {
                text:
                  'Closer, but not close enough: from h2 your king covers neither f1 nor f2. After **Kd2** the pawn ' +
                  'is defended again, and Black holds.',
                refute: 'Kd2',
              },
            },
            failure:
              'The rook has done its job. Bring your king toward the pawn, to a square that covers f1 and f2.',
            reply: 'Kd2',
            replyNote:
              'The king steps aside to defend its pawn from d2, and **e1=Q** is a threat again.',
            then: {
              prompt: 'Black threatens to queen again. How do you stop it?',
              moves: ['Rd6+'],
              hint: 'Another check: from which side can the rook drive the king away from e1?',
              success:
                '**Rd6+**: check again, and the king has to leave d2, the square from which it guarded e1.',
              why:
                'Your king covers f1 and f2, and the rook now covers the d-file, so the black king can only stand on ' +
                'e1 again, in front of its pawn, or let go of the queening square. Then **Re6**, with or without ' +
                'check, and **Kf2** win the pawn. Every check here costs Black a tempo.',
              wrong: {
                Kf2: {
                  text:
                    'Your king attacks the pawn, but it is protected, and **e1=Q+** comes with check: the new queen ' +
                    'is defended by the king on d2.',
                  refute: 'e1=Q+',
                },
                Rf1: {
                  text:
                    'The rook covers e1, but so does the king on d2: after **e1=Q Rxe1+ Kxe1** the kings are alone, ' +
                    'and it is a draw.',
                  refute: 'e1=Q',
                },
              },
              failure:
                'Black threatens to queen next move. Check the king away from the queening square before it gets the ' +
                'chance.',
            },
          },
        },
      },
      {
        id: 'queening-rank',
        title: 'The rook on the queening rank',
        text:
          'Sometimes your king is too far away, and the rook has to hold the pawn on its own for a few moves. The ' +
          'best place for that is the **queening rank**: from there the rook covers the queening square from a ' +
          'distance, and the enemy king cannot chase it off quickly. From the side, a rook can only give checks, ' +
          'and the king hides behind its pawn.\n\n' +
          'Here the g-pawn needs two moves, Black’s king is ready to escort it, and your king on c1 is far away. ' +
          'The rook has to buy time.',
        fen: RP_BACK_RANK,
        shapes: ['d3d1', 'g1:red'],
        task: {
          prompt: 'Where does the rook hold the pawn best while your king comes?',
          moves: ['Rd1'],
          hint: 'Which square does the pawn need? Cover it from as far away as you can.',
          success:
            '**Rd1**: the rook guards g1 from the far side of the board, where the black king cannot touch it.',
          why:
            'Now **g2** gets nowhere, because g1 is covered, and the black king needs several moves to come and ' +
            'chase the rook. That buys time for your king to walk over. **Kd2** at once is a tempo slow: after ' +
            '**g2** the rook can only stop the pawn by giving itself up. Cover the queening square first, then bring ' +
            'the king.',
          wrong: {
            Kd2: {
              text:
                'The king comes, but a tempo too late: **g2**, and the rook can only stop the pawn by giving itself ' +
                'up for it. A draw.',
              refute: 'g2',
            },
            Rd6: {
              text:
                'From the side the rook can only check, and the king hides behind its pawn: **g2**, and the rook ' +
                'ends up giving itself for the pawn.',
              refute: 'g2',
            },
            Rxg3: {
              text: 'Rook for pawn: after **Kxg3** only the kings are left, and the game is drawn.',
              refute: 'Kxg3',
            },
          },
          failure:
            'The pawn needs g1. Cover that square with the rook from far enough away that the black king cannot ' +
            'attack it.',
          reply: 'Kg4',
          replyNote:
            'The king walks up to support its pawn. That takes time, and time is what your king needs.',
          then: {
            prompt: 'The rook holds g1. What now?',
            moves: ['Kd2'],
            hint: 'The rook is fine where it is. Which piece still has to come, and by which road?',
            success: '**Kd2**: your king heads for the pawn while the rook keeps g1 covered.',
            why:
              'As long as the rook stays on the first rank, the pawn cannot queen, so every move goes to the king. ' +
              'Next comes **Ke1**, or a rook check on f1, and the king reaches the pawn. **Kc2** is the slower road: ' +
              'after **g2** your king is a move short, and the rook has to give itself up. Once the queening square ' +
              'is covered, think only about your king.',
            wrong: {
              Rg1: {
                text: 'The rook attacks the pawn, but **Kf3** defends it, and your king is still far away. Black holds.',
                refute: 'Kf3',
              },
              Kc2: {
                text:
                  'The king comes by the slower road: after **g2** it is a move short of the pawn, and the rook has to ' +
                  'give itself up for it.',
                refute: 'g2',
              },
            },
            failure:
              'The rook already covers g1. Use the move to bring your king toward the pawn by the shortest road.',
          },
        },
      },
      {
        id: 'no-pointless-checks',
        title: 'Do not check without a reason',
        text:
          'A check is good when it costs the defender a tempo. Here it would do the opposite: after **Rb1+** the ' +
          'king steps to c2, **beside** its pawn, exactly where it wants to be.\n\n' +
          'The pawn on c4 needs three moves to queen, and the rook on f1 already covers c1, so the rook can wait. ' +
          'Your king has to get in front of the pawn, and the black king on b3 blocks the short way.',
        fen: RP_NO_CHECKS,
        shapes: ['b6c5', 'c5d4:blue'],
        task: {
          prompt: 'How does your king get in front of the pawn?',
          moves: ['Kc5'],
          hint: 'The black king guards b4 and c4. Which way round does your king go?',
          success:
            '**Kc5**: your king goes round the black king, toward d4 and d3, the squares beside the pawn’s path.',
          why:
            'Count it: your king needs three moves to reach d3, and the pawn needs three to queen, but c1 is covered, ' +
            'so it never gets there safely. **Kb5** looks just as close, but the black king blocks b4 and c4, so ' +
            'from b5 you need an extra move to go round. Choose the road your opponent’s king cannot block.',
          wrong: {
            'Rb1+': {
              text:
                'That check helps Black: after **Kc2** the king stands beside its pawn and attacks your rook. The ' +
                'pawn marches on, and it is a draw.',
              refute: 'Kc2',
            },
            Kb5: {
              text:
                'Toward the pawn, but the black king guards b4 and c4, so your king has to go round anyway, one move ' +
                'later. After **c3** it arrives too late.',
              refute: 'c3',
            },
            Rc1: {
              text:
                'In front of the pawn the rook is only a target: after **c3** the black king comes to b2 and attacks ' +
                'it, while your king is still far away.',
              refute: 'c3',
            },
          },
          failure:
            'The rook already covers c1, so it can wait. Your king must get to d4 and d3, round the black king.',
          reply: 'c3',
          replyNote:
            'The pawn runs. Two more moves to queen, but c1 is covered, so it needs its king’s help.',
          then: {
            prompt: 'Keep coming. Which square is next?',
            moves: ['Kd4'],
            hint: 'The black king still guards c4. Which square takes you round it?',
            success: '**Kd4**: one step from d3, where your king will attack the pawn.',
            why:
              'Your king is now beside the pawn’s path, and next it reaches d3 to attack c2. Meanwhile the rook still ' +
              'covers c1, so the pawn cannot finish its run. **Rf3** attacks the pawn, but **Kb2** guards it, and ' +
              'with its king beside it the pawn is safe again.',
            wrong: {
              Rf3: {
                text:
                  'The rook attacks the pawn, but **Kb2** guards it, and the black king now stands beside its pawn. ' +
                  'Your king is a move too late.',
                refute: 'Kb2',
              },
              'Rb1+': {
                text: 'Another check that helps Black: the king steps aside, and the pawn runs on with its king beside it.',
                refute: 'Ka2',
              },
            },
            failure:
              'Leave the rook on f1, guarding c1, and bring your king closer to the pawn, round the black king.',
            reply: 'c2',
            replyNote:
              'The pawn reaches the seventh. One more step and it queens, but your rook still guards c1.',
            then: {
              prompt: 'The pawn is on c2. Where does your king strike?',
              moves: ['Kd3'],
              hint: 'Which square next to the pawn can your king reach?',
              success:
                '**Kd3**: your king attacks the pawn, and the rook still guards c1. The pawn is lost.',
              why:
                'The pawn needs c1, which your rook covers, and your king now attacks c2. If **Kb2**, then **Kd2** ' +
                'attacks it again, and **c1=Q+** is met by **Rxc1**. Three king moves won the race that one check ' +
                'would have thrown away.',
              wrong: {
                Ke3: 'That also wins. **Kd3** is the more direct plan, because from d3 your king attacks the pawn at once.',
                Rc1: {
                  text:
                    'The rook already guarded c1 from f1. On c1 it can be attacked: **Kb2**, and the rook must leave ' +
                    'or give itself up.',
                  refute: 'Kb2',
                },
              },
              failure:
                'The pawn cannot queen while c1 is covered. Attack it with your king from a square next to it.',
            },
          },
        },
      },
      {
        id: 'push-do-not-block',
        title: 'For the defender: push, do not block',
        text:
          'Now swap sides: you have the pawn. The defender’s rule is simple: **push, with the king beside the ' +
          'pawn, never in front of it.** A king in front blocks its own pawn, and the rook gets time to drive it ' +
          'away with checks.\n\n' +
          'Here White’s king on h1 is far away, and your king on c3 already stands beside the d-pawn. If the pawn ' +
          'reaches d2 with your king next to it, White has to give up the rook.',
        fen: RP_PUSH,
        orientation: 'black',
        shapes: ['d4d3', 'd3d2:blue'],
        task: {
          prompt: 'Which move holds the draw?',
          moves: ['d3'],
          hint: 'Pawn or king: which move brings the pawn closer to queening?',
          success:
            '**d3**: the pawn runs, and your king on c3 stays beside it, ready to support **d2**.',
          why:
            'The pawn needs two more moves to queen, and White’s king is too far away to catch it. The rook alone ' +
            'cannot stop a pawn its king supports. **Kd3** looks active, but it blocks the pawn: White’s king comes ' +
            'closer, and the rook checks yours away before the pawn can move. Beside the pawn, never in front.',
          wrong: {
            Kd3: {
              text:
                'Active, but now the king stands in front of its pawn. **Kg2** brings White’s king closer, and the ' +
                'rook will check yours away before the pawn can move. White wins.',
              refute: 'Kg2',
            },
            Kc4: {
              text:
                'Still beside the pawn, but you have wasted a tempo: **Kg1**, and White’s king is one step closer. ' +
                'Push the pawn while you can.',
              refute: 'Kg1',
            },
          },
          failure:
            'Every tempo counts. Push the pawn, and keep your king beside it rather than in front.',
          reply: 'Kg1',
          replyNote: 'White’s king sets off toward your pawn, but it is still far away.',
          then: {
            prompt: 'The white king is coming. What is your next move?',
            moves: ['d2'],
            hint: 'Same rule as before: what does the pawn want?',
            success: '**d2**: the pawn is one step from queening, with your king beside it on c3.',
            why:
              'Now the rook has to give itself up: if it leaves the second rank, **d1=Q** follows. A king move instead ' +
              'would give White’s king the time it needs, and the pawn would fall. For the defender, the pawn moves ' +
              'whenever it can.',
            failure:
              'Keep pushing. With the pawn one step from queening and your king beside it, White has to give up the rook.',
            reply: 'Rxd2',
            replyNote:
              'White gives up the rook, because there is nothing better. After **Kxd2** only the kings are left: a ' +
              'draw.',
          },
        },
      },
      {
        id: 'push-again',
        title: 'For the defender: push again',
        text:
          'The same rule on the edge of the board. Your king on a4 stands beside its pawn, and White’s rook on b1 ' +
          'cuts it off along the b-file. Watch out for one trick with a rook pawn: a check along the file can ' +
          '**skewer** your king and a new queen behind it.\n\n' +
          'You have only two legal moves, and White’s king is still far from the queening corner.',
        fen: RP_PUSH_2,
        orientation: 'black',
        task: {
          prompt: 'Which move keeps the draw?',
          moves: ['a2'],
          hint: 'Which move forces White to deal with the pawn at once?',
          success: '**a2**: the pawn is one step from queening, and White has to deal with it now.',
          why:
            'White’s king needs three moves to reach c2, and you need one to threaten **a1=Q**. **Ka5** steps away ' +
            'from the pawn and gives White the tempo: after **Ke3** the king comes in time. With the pawn side, a ' +
            'tempo spent on anything but the pawn is usually the tempo that loses.',
          wrong: {
            Ka5: {
              text:
                'Stepping away from the pawn hands White the tempo: **Ke3**, and the white king arrives. If the pawn ' +
                'then runs, **Rb8** and **Ra8+** can even skewer your king and the new queen.',
              refute: 'Ke3',
            },
          },
          failure: 'Push the pawn: with your king beside it, White has to deal with it at once.',
          reply: 'Rb8',
          replyNote:
            'White sets a trap: if you queen at once, **Ra8+** checks along the a-file and wins the new queen ' +
            'behind your king.',
          then: {
            prompt: 'Queening now runs into a skewer. What do you play instead?',
            moves: ['Ka3'],
            hint: 'Where can your king stand so that a check on the a-file wins nothing?',
            success:
              '**Ka3**: your king heads for b2, next to the queening square, where it protects the new queen.',
            why:
              'Now **Ra8+** is answered by **Kb2**, and the rook has to give itself up for the pawn. **a1=Q** at once ' +
              'loses to **Ra8+**, and **Ka5** leaves the pawn behind. With the pawn side: push, keep the king ' +
              'beside the pawn, and watch the file for skewers.',
            wrong: {
              'a1=Q': {
                text:
                  'That is the trap: **Ra8+** checks your king along the a-file, and once it steps aside, the rook ' +
                  'takes the new queen.',
                refute: 'Ra8+',
              },
              Ka5: {
                text:
                  'The king leaves its pawn, and **Ra8+** drives it further away: the rook gets behind the pawn and ' +
                  'wins it.',
                refute: 'Ra8+',
              },
            },
            failure:
              'Promoting now walks into a check on the a-file. Bring your king next to the queening square first.',
          },
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
      'A passed pawn is a weapon long before it becomes a queen: it forks, it lures defenders away and it wins races. Then learn to blockade one, and to make one.',
    minutes: 12,
    steps: [
      {
        id: 'passer-fork',
        title: 'A passed pawn is a weapon',
        text:
          'A **passed pawn** has no enemy pawn in front of it or on the files beside it, so no pawn can ever ' +
          'challenge it. Most players picture the queen it will become and wait for the endgame. I would rather ' +
          'ask a sharper question straight away: *what would this pawn attack one step further on?*\n\n' +
          'Material is level, and your d-pawn is passed. On d6 it would attack c7 and e7, where Black keeps a ' +
          'knight and the queen, and your rook on f6 would guard it there. There are louder moves on the board, ' +
          'a capture on e5 and a capture on g6, so the quiet push has to earn its place.',
        fen: PASSER_FORK,
        shapes: ['d5d6', 'c7:red', 'e7:red'],
        task: {
          prompt: 'Which move wins material by force?',
          moves: ['d6'],
          hint: 'Which black pieces stand on squares a pawn on the sixth rank would attack, and what would guard the pawn there?',
          success:
            '**d6**: the pawn attacks the queen and the knight at once, and the rook on f6 guards it, so **Qxd6** would lose the queen to **Rxd6**.',
          why:
            'I look at the forcing moves first, as you should. **Qxe5** wins a knight but loses the queen to ' +
            '**Qxe5**, and **Rxg6+** gives a rook for a pawn. The quiet push wins because a pawn is the cheapest ' +
            'piece on the board: nothing can take it without losing more. With a passed pawn, always ask what it ' +
            'attacks one step on.',
          wrong: {
            Qxe5: {
              text: 'That takes a knight, but the queen on e7 guards it. **Qxe5**, and you have given your queen for a knight.',
              refute: 'Qxe5',
            },
            'Rxg6+': {
              text: 'A rook for a pawn, with nothing behind it: **fxg6**, and your attack is over.',
              refute: 'fxg6',
            },
          },
          failure:
            'Look at your passed pawn on d5. What would it attack one step further on, and could anything take it there?',
          reply: 'Qd8',
          replyNote:
            'The queen steps back and still guards the knight, so the fork looks parried. It is not: guarding a piece does not help against a pawn.',
          then: {
            prompt: 'Black guards the knight with the queen. What do you play?',
            moves: ['dxc7'],
            hint: 'A pawn is worth less than a knight. What does that say about capturing a guarded piece?',
            success: '**dxc7**: the pawn takes the knight, and from c7 it attacks the queen on d8.',
            why:
              'Take with the cheapest piece and a guard means little. After **Qxc7** you have traded a pawn for a ' +
              'knight, and because the capture came with a threat, Black had no time for anything better. A pawn ' +
              'that has forked once may fork again, so keep asking what it attacks next.',
            failure:
              'The pawn on d6 still attacks the knight on c7. A guarded piece can still be taken by something worth less.',
          },
        },
      },
      {
        id: 'drag-the-blocker',
        title: 'Lure the blocker away',
        text:
          'You are a pawn down, but look at your d-pawn: it stands on d6 with a rook behind it, and your bishop ' +
          'on h4 covers e7 and d8. Only one thing stops it, the black queen on d7, and nothing you own can chase ' +
          'her away.\n\n' +
          'A blocker can be lured, though. Ask what else she is doing. Your queen on e4 attacks the rook on e8, ' +
          'and that rook has a single protector: the queen on d7. She is blocking your pawn and guarding that ' +
          'rook at the same time.',
        fen: PASSER_SEVENTH,
        shapes: ['e4e8', 'd6d7:blue', 'd7:red'],
        task: {
          prompt: 'How do you get the d-pawn moving?',
          moves: ['Qxe8'],
          hint: 'She cannot do both jobs. Which capture forces her to give one of them up?',
          success:
            '**Qxe8**: you take the rook, and Black has to recapture with the queen, which pulls her off d7.',
          why:
            'Giving a queen for a rook looks wild, so count it through. After **Qxe8 Qxe8** the pawn can step to ' +
            'd7 with an attack on the queen, and the bishop covers e7 and d8. The quiet moves lose the pawn: ' +
            '**Qc4** allows **Bxd6**, and **Qd5** allows **Re6**. When a passed pawn is blocked, look for the ' +
            'blocker’s second job.',
          wrong: {
            Qc4: {
              text: 'The queen eyes f7, but d6 is attacked by the bishop and the queen and guarded only by the rook: **Bxd6**, and you are two pawns down.',
              refute: 'Bxd6',
            },
            Qd5: {
              text: 'The queen supports d6, but **Re6** brings a second attacker, and the pawn falls anyway.',
              refute: 'Re6',
            },
          },
          failure:
            'The pawn cannot move while the queen stands on d7. Look for a capture that forces that queen to move.',
          reply: 'Qxe8',
          replyNote:
            'Black has to recapture, because the queen was the rook’s only guard. That was the point: she no longer blocks the pawn.',
          then: {
            prompt: 'The blocker is gone. How does the pawn advance?',
            moves: ['d7'],
            hint: 'The pawn has a free square ahead and a rook behind it. What would it attack one step on, and who has to move?',
            success:
              '**d7**: the pawn attacks the queen and threatens **d8=Q**, with the rook on d2 behind it.',
            why:
              'The queen cannot take the pawn: **Qxd7 Rxd7** loses her for a pawn. She cannot stop ' +
              'it queening either, so the most she can do is trade herself for the new queen, and the bishop on h4 ' +
              'takes back on d8. A passed pawn on the seventh, with a rook behind it and a bishop covering the ' +
              'queening square, is worth a queen.',
            wrong: {
              f5: {
                text: '**f5** opens the long diagonal to your own king: **Bxd6+** takes the pawn with check, and the pawn you were nursing is gone.',
                refute: 'Bxd6+',
              },
            },
            failure:
              'The pawn is ready to advance. The queen cannot stay on e8, and the bishop on h4 covers d8 and e7.',
            reply: 'Qa8',
            replyNote:
              'The best try: from a8 the queen still guards d8 along the back rank. But the pawn queens anyway.',
            then: {
              prompt: 'The pawn is on the seventh. Finish the job.',
              moves: ['d8=Q'],
              hint: 'The queen on a8 guards d8. Who else guards it?',
              success:
                '**d8=Q**: a new queen, defended by the rook and the bishop, attacking the queen on a8 and the bishop on f8.',
              why:
                'If Black takes with **Qxd8**, then **Bxd8** recaptures, and you have a rook and a bishop against a ' +
                'bishop. The queen sacrifice worked because every piece of yours had a job: the rook backed the ' +
                'pawn, the bishop covered the queening square, and the queen went first to clear the way.',
              failure:
                'The pawn is one step from a new queen on d8, with the rook behind it and the bishop covering that square.',
              reply: 'Qxd8',
              replyNote:
                'Black takes, and the bishop on h4 takes back on d8: a rook and a bishop against a bishop.',
            },
          },
        },
      },
      {
        id: 'decoy',
        title: 'A pawn as a decoy',
        text:
          'You are a bishop down for two pawns, so quiet moves will not rescue you. Count what you have instead: ' +
          'a passed pawn on d6, another on c5 that guards it, and Black’s king on e6 with two jobs. It watches ' +
          'the pawn on d6, and it is the only defender of the bishop on d5.\n\n' +
          'A passed pawn does not always have to queen to be useful. Sometimes its best moment is the one when ' +
          'it can be given away, because of where the capture drags the king.',
        fen: PASSER_DECOY,
        shapes: ['d6d7', 'e6:red', 'd5:blue'],
        task: {
          prompt: 'How do you drag the king away from its bishop?',
          moves: ['d7'],
          hint: 'A pawn on the seventh must be taken, or it queens. Which of your pawns can get there?',
          success:
            '**d7**: the pawn threatens **d8=Q**, so the king has to take it, and that leaves the bishop behind.',
          why:
            'The king had two jobs, and a pawn is the cheapest way to overload a defender. **c6** looks like ' +
            'progress, but the c-pawn was guarding d6: **Kxd6**, and both pawns are gone. Count what the sacrifice ' +
            'buys instead: a whole bishop, an active king and three queenside pawns against one. When a defender ' +
            'has two jobs, offer it a pawn.',
          wrong: {
            c6: {
              text: 'It looks like progress, but the c-pawn was guarding d6: **Kxd6**, and the c-pawn falls as well.',
              refute: 'Kxd6',
            },
          },
          failure:
            'The king guards the bishop and watches the pawn. Find a move that forces it to choose.',
          reply: 'Kxd7',
          replyNote:
            'Black has to take, or **d8=Q** wins at once. But the king has stepped away, and nothing guards the bishop now.',
          then: {
            prompt: 'The king has left the bishop alone. What now?',
            moves: ['Kxd5'],
            hint: 'Look at the bishop on d5. Who protects it now?',
            success: '**Kxd5**: the bishop has no defender left, so your king simply takes it.',
            why:
              'The pawn bought a whole bishop, and the position has changed: you are a pawn up, your king stands ' +
              'in the centre, and three queenside pawns face one. The d6 pawn was never going to queen by itself. ' +
              'Count what a sacrifice gets you, not only what it costs.',
            wrong: {
              'c6+': {
                text: 'Check, but **Kxc6** takes the pawn, and the king guards the bishop again.',
                refute: 'Kxc6',
              },
            },
            failure: 'The black king on d7 no longer guards the bishop on d5. Use that at once.',
          },
        },
      },
      {
        id: 'blockade',
        title: 'Blockade the passed pawn',
        text:
          'Now the other side of the coin. Black is a pawn up, and its d-pawn is passed: that is Black’s trump. ' +
          'The classic cure is the **blockade**, a piece parked on the square directly in front of the pawn. A ' +
          'knight is the best blockader, because it keeps all its power in the middle of the board, and here ' +
          'Black has no c- or e-pawn to chase it away.\n\n' +
          'Your knight on f3 can reach d4 in one jump. Before you go, ask what else it would attack from there.',
        fen: BLOCKADE,
        shapes: ['f3d4', 'd5:red', 'e2:red', 'c6:red'],
        task: {
          prompt: 'Where does the knight belong?',
          moves: ['Nd4'],
          hint: 'Think of the square in front of the black pawn. What would a knight attack from there?',
          success:
            '**Nd4**: the knight blockades the pawn and forks the rook on e2 and the bishop on c6.',
          why:
            'The blockade square was also the best square: nothing can chase the knight away, and from d4 it ' +
            'attacks two pieces. **Ne5** looks active but loses the knight to **Rxe5**, and **Rd1** loses the ' +
            'a-pawn to **Rxa2**. Against a passed pawn, ask which piece can stand in front of it, and what it ' +
            'attacks from there.',
          wrong: {
            Ne5: {
              text: 'The knight attacks the bishop, but the rook on e2 covers e5: **Rxe5**, and you have lost a piece.',
              refute: 'Rxe5',
            },
            Rd1: {
              text: 'The rook attacks the pawn, but the bishop guards it, and **Rxa2** takes a pawn for nothing.',
              refute: 'Rxa2',
            },
          },
          failure:
            'Black’s passed d-pawn is the problem. Look for a square in front of it where a piece also attacks something.',
          reply: 'Rd2',
          replyNote:
            'The rook attacks the knight, which has no defender, but it has left the bishop on c6 loose.',
          then: {
            prompt: 'The knight is attacked, but the bishop is loose. What do you play?',
            moves: ['Nxc6'],
            hint: 'A piece that is attacked may capture before it moves.',
            success:
              '**Nxc6**: the knight takes the bishop and steps out of the rook’s attack in the same move.',
            why:
              'When a piece of yours is attacked, check whether it can take something first. You are now a knight ' +
              'up for a pawn. The d-pawn is still passed, so the blockade is not over: the knight can come back to ' +
              'd4, and the rook keeps watch.',
            failure:
              'The bishop on c6 has no defender, and your knight is attacked. Use one problem to solve the other.',
          },
        },
      },
      {
        id: 'pawn-break',
        title: 'Make a passed pawn',
        text:
          'Most passed pawns are made, not found. Two white pawns face two black ones on the queenside, and ' +
          'Black has an extra pawn on f7, so you are a pawn down. But Black’s king is far away on h6. If you can ' +
          'force a passed pawn before it comes back, the game turns around.\n\n' +
          'Walking your own king over is too slow. A pawn lever is not.',
        fen: PAWN_BREAK,
        shapes: ['b4b5', 'c5c6:blue', 'h6:red'],
        task: {
          prompt: 'How do you force a passed pawn?',
          moves: ['b5'],
          hint: 'Bring the rear pawn level with the front one, so that the pair can break through together.',
          success:
            '**b5**: the pawns stand side by side, and **c6** is a threat that the black king is too far away to meet.',
          why:
            'One pawn alone changes nothing; side by side, the pair can break through. **Ke3** is the natural plan, ' +
            'but the black king simply comes back with **Kg6**, and the extra pawn decides. A lever works only ' +
            'while the enemy king is too far away to answer it, so count its distance before you start.',
          wrong: {
            Ke3: {
              text: 'The king heads for the centre, but it is a tempo too slow: **Kg6** brings the black king back, and the extra f-pawn decides.',
              refute: 'Kg6',
            },
            c6: {
              text: '**c6** goes off too soon: **bxc6**, and you are two pawns down without a passed pawn.',
              refute: 'bxc6',
            },
          },
          failure:
            'Two pawns against two cannot pass by marching. Place them so that one of them can break through.',
          reply: 'Kg6',
          replyNote: 'Black’s king starts the long walk back. It will not arrive in time.',
          then: {
            prompt: 'The king is on its way. What breaks through?',
            moves: ['c6'],
            hint: 'Offer a pawn, so that the pawn behind it is left with an open road.',
            success:
              '**c6** offers a pawn: if Black takes it, your b-pawn recaptures and nothing stands in front of it.',
            why:
              'Black must take, or **cxb7** wins the pawn on b7 and a queen follows. Taking removes the pawn that ' +
              'stood in front of your b-pawn. That is a **lever**: you offer one pawn so that the other recaptures ' +
              'with an open road.',
            failure:
              'The pawns stand side by side. One of them must step forward to force the exchange.',
            reply: 'bxc6',
            replyNote:
              'Black has to take. Now the b-pawn recaptures, and nothing stands in its way.',
            then: {
              prompt: 'Black took on c6. How do you recapture?',
              moves: ['bxc6'],
              hint: 'Which of your pawns can take on c6?',
              success:
                '**bxc6**: the pawn is passed and two steps from queening, and the black king cannot catch it.',
              why:
                'Two pawns against two became a passed pawn by force, because the lever left the recapturing pawn ' +
                'with an open road. Next comes **c7**, and **c8=Q** cannot be stopped, although you were a pawn ' +
                'down on the board. Count the enemy king’s distance, then strike: a passed pawn made in time beats ' +
                'an extra pawn.',
              failure: 'A pawn can recapture on c6. Take back and see what is left in front of it.',
            },
          },
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
      'Bishops want open lines and knights want outposts. Learn what each piece needs, and how to spot the moment when a knight on the rim or a hemmed-in bishop has no squares left.',
    minutes: 10,
    steps: [
      {
        id: 'what-they-want',
        title: 'What each piece wants',
        text:
          'Bishop and knight are each worth about three pawns, so which one is better depends on the position. ' +
          'A **bishop** wants open lines and pawns on both wings, where its long reach counts. A **knight** ' +
          'wants a closed position and an **outpost**: a square in the enemy camp that no pawn can attack.\n\n' +
          'Material is equal here, yet the engine puts White about two pawns ahead. Look at the knight on c5: ' +
          'Black’s b- and d-pawns have already walked past it, so nothing can ever kick it away. Then look at ' +
          'the bishop on g7. It bites on the chain of d4, e5 and f4, which it cannot break. Ask this in every ' +
          'position: which piece has the better squares?',
        fen: KNIGHT_OUTPOST,
        shapes: ['c5', 'g7e5:red', 'c5b7:blue', 'c5d7:blue'],
      },
      {
        id: 'rim-knight',
        title: 'A knight on the rim',
        text:
          'A knight on the rim is dim: it sees few squares, and a king can take them away. Black’s knight has ' +
          'just jumped to h2 with check, and from there it can reach only f1, f3 and g4. Your knight on e5 ' +
          'already guards g4.\n\n' +
          'Count before you move. That leaves two squares to deal with, and your king has to move out of check ' +
          'anyway, so the best move may do both jobs at once.',
        fen: RIM_KNIGHT,
        shapes: ['f3g2', 'h2:red', 'e5g4:blue'],
        task: {
          prompt: 'Which king move traps the knight?',
          moves: ['Kg2'],
          hint: 'Which king move attacks the knight and also covers its other squares?',
          success:
            '**Kg2** attacks the knight and covers f1 and f3. Only g4 is left, and your knight on e5 guards it.',
          why:
            'The knight has lost every escape square but one, and that one is guarded. **Kf2** covers f1 and f3 but ' +
            'does not attack the knight, and **Kg3** lets it out with **Nf1+**. When a knight sits on the edge, ' +
            'count its squares and use your king to take them.',
          wrong: {
            Kf2: {
              text: '**Kf2** covers f1 and f3 but does not attack the knight. After **Kf6** Black threatens ...Ng4+, backed by the f5 pawn, and the knight gets out.',
              refute: 'Kf6',
            },
            Kg3: {
              text: '**Kg3** attacks the knight, but it leaves f1 free: **Nf1+** escapes with check, and the knight is out.',
              refute: 'Nf1+',
            },
          },
          failure:
            'The knight on h2 can reach f1, f3 and g4, and your knight guards g4. Use your king to take away the other two.',
          reply: 'Ng4',
          replyNote: 'The knight takes its last square, g4. Every other move loses it for nothing.',
          then: {
            prompt: 'The knight took its last square. How do you cash in?',
            moves: ['Nxg4'],
            hint: 'Picture the pawn ending if the knights come off. Whose king is closer to the pawns?',
            success:
              '**Nxg4** trades the knights, and the pawn that recaptures on g4 will be lost.',
            why:
              'The recapturing pawn lands on g4, close to your king, while Black’s king is two moves away from ' +
              'defending it. After **fxg4 Kg3** the pawn falls and you win the pawn ending. Keeping the knights on ' +
              'gives Black time to bring the king over. Count the pawn ending before you trade.',
            failure:
              'The black knight stands on its last square, and your knight guards it. Count the pawn ending that follows a trade.',
            reply: 'fxg4',
            replyNote: 'Black has to recapture, and the pawn on g4 is now a target.',
            then: {
              prompt: 'The pawn on g4 stands alone. How do you attack it?',
              moves: ['Kg3'],
              hint: 'A king attacks what stands next to it.',
              success: '**Kg3** attacks the pawn on g4, which Black cannot hold.',
              why:
                'Black’s king needs two moves to defend the pawn and you need one to take it, so **Kxg4** follows and ' +
                'White wins the pawn ending. Do it at once: a slower move lets the king come over.',
              failure:
                'The pawn on g4 is Black’s weakness. Attack it with the piece that is closest.',
            },
          },
        },
      },
      {
        id: 'corner-knight',
        title: 'A bishop against the corner knight',
        text:
          'A bishop can take a knight’s squares away just as a king can. White’s knight has jumped to a8, and ' +
          'it attacks your bishop on b6. A knight in the corner has only two exits, **b6** and **c7**.\n\n' +
          'Your first instinct is to save the bishop, and that is fine, but save it with a purpose. White’s ' +
          'king is far away on g4, so nothing can help the knight out.',
        fen: CORNER_KNIGHT,
        orientation: 'black',
        shapes: ['a8b6:red', 'a8c7:red', 'b6d8'],
        task: {
          prompt: 'Where does the bishop go to trap the knight?',
          moves: ['Bd8'],
          hint: 'The knight can go to b6 or c7. Which bishop square covers both?',
          success: '**Bd8** covers b6 and c7, so the knight cannot move without being captured.',
          why:
            'From d8 the bishop watches the whole diagonal down to b6, so both exits are covered. Running anywhere ' +
            'else lets the knight out through **Nc7**, and the win is gone. **Kxd5** grabs a pawn, but ' +
            '**Nxb6+** wins the bishop with check. When a piece of yours is attacked, ask whether a better square ' +
            'takes the enemy’s squares away.',
          wrong: {
            Bc5: '**Bc5** saves the bishop but covers neither exit: **Nc7**, and the knight escapes. You have saved the bishop, but the win is gone.',
            Kxd5: {
              text: '**Kxd5** grabs a pawn, but **Nxb6+** wins your bishop with check.',
              refute: 'Nxb6+',
            },
          },
          failure:
            'The knight in the corner has two exits. Look for the bishop square that covers both.',
          reply: 'h4',
          replyNote: 'White cannot save the knight, so it makes what it can of the h-pawn.',
          then: {
            prompt: 'The knight is trapped. How does Black go and get it?',
            moves: ['Kxd5'],
            hint: 'The knight stands on a light square, which a dark-squared bishop cannot attack. Which piece can, and what blocks its path?',
            success:
              '**Kxd5** wins a pawn and heads for c6 and b7, from where the king collects the knight.',
            why:
              'The bishop is dark-squared and the knight sits on a light square, so the bishop can only guard its ' +
              'exits: the king has to collect it. Once the king reaches c6 it covers b6 and c7 itself, and the ' +
              'bishop is free to deal with White’s h-pawn.',
            failure:
              'The bishop on d8 is what holds the knight in, so leave it there. The king has to do the rest, and a pawn is in its way.',
          },
        },
      },
      {
        id: 'trapped-bishop',
        title: 'A bishop with no squares',
        text:
          'Pawns can take a bishop’s squares away, just as a king takes a knight’s. Black’s bishop on f6 has ' +
          'its own pawn on e5 and king on g7 in the way. It can run to e7 or d8, but your queen on d6 covers ' +
          'both, which leaves only the diagonal through g5 to h4. A pawn can close that.\n\n' +
          'Black has threats against your king too, so there is no time for slow moves.',
        fen: TRAPPED_BISHOP,
        shapes: ['g4g5', 'f6:red', 'd6f6'],
        task: {
          prompt: 'How do you trap the bishop on f6?',
          moves: ['g5'],
          hint: 'A pawn push can attack the bishop and block its way to h4 at once.',
          success:
            '**g5** attacks the bishop and shuts its way to h4. The queen covers e7 and d8, so it can only take the pawn.',
          why:
            'A bishop on a closed diagonal is fragile: once its few squares are covered, it is lost. **gxh5** grabs ' +
            'a pawn but lets Black take back with **gxh5** and carry on with the attack, and **Kf2** attacks the ' +
            'bishop on e2 but allows **hxg4**. Before you grab material, ask whether one quiet move wins a whole piece.',
          wrong: {
            gxh5: {
              text: '**gxh5** wins a pawn, but Black takes back with **gxh5**. The g-pawn that could have trapped the bishop is gone, and the threats against your king go on.',
              refute: 'gxh5',
            },
            Kf2: {
              text: '**Kf2** attacks the bishop on e2, but **hxg4** opens lines against your king, and the game is level.',
              refute: 'hxg4',
            },
          },
          failure:
            'The bishop has few squares. Find the move that attacks it and takes the rest away.',
          reply: 'Bxg5',
          replyNote: 'The bishop has nowhere else to go, so it takes the pawn.',
          then: {
            prompt: 'The bishop took the pawn. How do you recapture?',
            moves: ['hxg5'],
            hint: 'Which of your pawns can take on g5?',
            success: '**hxg5** wins the bishop for a pawn, and the black pieces are left loose.',
            why:
              'The pawn was the price of the bishop. Black’s pieces are loose on the board and the black king is ' +
              'exposed, so the queen picks up more. A bishop that cannot move is already lost: make it pay.',
            failure: 'A pawn can take back on g5.',
          },
        },
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
      'Having the initiative means your opponent answers your threats instead of making their own. Learn what it is worth, how to keep it, and how to take it away when you are the one under fire.',
    minutes: 11,
    steps: [
      {
        id: 'evans-qb3',
        title: 'Do not stop to recapture',
        text:
          'Material is not the only currency in chess: time is another. You have the **initiative** when your ' +
          'moves make threats and your opponent has to answer them, so they never get to carry out their own ' +
          'plans. A strong player will pay pawns for it.\n\n' +
          'In this Evans Gambit you are three pawns down, but look at Black’s camp: the bishop has moved three ' +
          'times, the king is still in the middle, and your bishop on c4 already eyes f7. Black has just taken on ' +
          'c3. Recapturing is the natural move. Before you play it, ask what each side is threatening.',
        fen: EVANS,
        shapes: ['c4f7:red', 'd1b3', 'a5:red'],
        task: {
          prompt: 'You are three pawns down. Which move keeps Black busy?',
          moves: ['Qb3'],
          hint: 'Every move must make a threat. Which piece can join the bishop against f7?',
          success:
            '**Qb3** attacks f7 a second time and covers c3, so the knight can take there next without losing to **Bxc3**.',
          why:
            'When you give material for the initiative, spend your moves on threats, not recaptures. **Nxc3** at ' +
            'once loses a piece to **Bxc3**, because the b-pawn that would retake is gone. **e5** is playable, but ' +
            'it threatens nothing, and the engine rates it a good pawn worse. **Qb3** attacks f7 and covers c3 in ' +
            'one move, so Black has to answer, and the pawn can wait.',
          wrong: {
            Nxc3: {
              text: 'The natural recapture loses a knight: **Bxc3**, and without the b-pawn nothing can take back.',
              refute: 'Bxc3',
            },
            'Bxf7+': {
              text: 'Too early. **Kxf7** and you have only a check to show for the bishop; the king soon steps back to safety, and you are a piece down as well.',
              refute: 'Kxf7',
            },
            e5: {
              text: '**e5** gains space, but it threatens nothing: **Nge7** develops with a defence, and Black gets the free move you cannot afford.',
              refute: 'Nge7',
            },
          },
          failure:
            'You are three pawns down, so slow moves cost too much. Look for a move that adds a second attacker to f7.',
          reply: 'Qf6',
          replyNote:
            'The best defence: the queen guards f7 and eyes the knight on f3. White must not slow down now.',
          then: {
            prompt: 'The queen has come out. How do you gain another tempo?',
            moves: ['Bg5', 'e5'],
            hint: 'Attack the queen with a move that also develops a piece or gains space.',
            success:
              'Either move attacks the queen: **Bg5** with a developing move, **e5** with a pawn.',
            why:
              'Each attack on the queen is a move Black cannot spend on development. **Bg5** brings a new piece ' +
              'into play and **e5** gains space; both keep the initiative. A quiet move such as **Re1** is no ' +
              'blunder, yet it hands the move back to Black. The rule is the same as before: keep making threats.',
            wrong: {
              Nxc3: {
                text: 'The queen and the bishop both attack c3, and only your queen defends it: **Qxc3** wins the knight.',
                refute: 'Qxc3',
              },
              Re1: '**Re1** is a decent move, and the engine does not mind it, but it makes no threat. Black gets time to untangle with ...Nge7.',
            },
            failure: 'The black queen is on f6. Attack it, and you gain a tempo.',
            reply: 'Qg6',
            replyNote:
              'The queen goes to g6 and still guards f7. Black has spent two moves on her with the king still in the centre, and now **Nxc3** is safe, because the queen on b3 covers c3. That is what the initiative buys: time.',
          },
        },
      },
      {
        id: 'fried-liver',
        title: 'Develop with threats',
        text:
          'The Fried Liver Attack. White has sacrificed a knight to drag Black’s king out to e6, and the bishop ' +
          'on c4 pins the knight on d5 to it. A knight down for a pawn, you cannot afford quiet moves: every ' +
          'move has to bring a piece into play and threaten something.\n\n' +
          'Count the pinned knight. It is attacked twice, by the bishop and the queen, and defended twice, by the ' +
          'king and the queen. A third attacker would win it. Several natural moves are on offer, so weigh them.',
        fen: FRIED_LIVER,
        shapes: ['b1c3', 'c4d5', 'd5e6:red'],
        task: {
          prompt: 'Which move keeps the attack going?',
          moves: ['Nc3'],
          hint: 'Bring a piece into play that attacks the pinned knight.',
          success:
            '**Nc3** attacks the pinned knight a third time: d5 is now attacked three times and defended twice.',
          why:
            'A knight down, you can only afford moves that develop with a threat, and **Nc3** is the one. **O-O** is ' +
            'natural, but **b5** hits the bishop and ...Nd4 then hits your queen. **d3** and **d4** are just as ' +
            'slow. The engine puts all three more than four pawns behind **Nc3**. Count the attackers and defenders of ' +
            'the key square before you choose.',
          wrong: {
            'O-O': {
              text: 'It is natural, but **b5** hits the bishop, and when it moves ...Nd4 attacks your queen. Black has taken over the initiative.',
              refute: 'b5',
            },
            d3: {
              text: '**d3** develops, but it is slow: **Nd4** attacks your queen with a tempo, and the initiative changes hands.',
              refute: 'Nd4',
            },
            d4: {
              text: '**d4** opens the centre, but **Nxd4** attacks your queen, and the attack collapses.',
              refute: 'Nxd4',
            },
          },
          failure:
            'A piece down, quiet moves lose time. Look for a developing move that attacks the pinned knight.',
          reply: 'Nb4',
          replyNote:
            'Black’s other knight defends d5 again and eyes c2. The king is stuck on e6 and White leads in development, so the quiet **O-O** is fine now, though it was too slow a move ago.',
        },
      },
      {
        id: 'greedy',
        title: 'Punish the grab',
        text:
          'Black has just taken a knight on c3 and expects you to take it back. But look at Black’s camp: the ' +
          'king and queen are still on their starting squares, your bishop eyes f7, and your queen faces Black’s ' +
          'queen down the open d-file with only the king to guard her.\n\n' +
          'A strong player looks at checks first, then captures, then threats. Recapturing, or trading queens, ' +
          'would let the initiative go.',
        fen: GREEDY,
        shapes: ['c4f7', 'd4d8:blue', 'c3:red'],
        task: {
          prompt: 'What is the most forcing move?',
          moves: ['Bxf7+'],
          hint: 'A check that pulls the king away from the queen it guards.',
          success:
            '**Bxf7+** forces **Kxf7**, which takes the king off e8, so the queen on d8 loses its only defender.',
          why:
            'Forcing moves come before recaptures. The check drags the king away from the queen it was guarding, ' +
            'and the queen falls. **Qxd8+** trades queens at once and leaves you a pawn down, **bxc3** allows ' +
            '**Qxd4**, and **Qxc3** lets Black develop with **e6**. Look at checks first, then captures, then ' +
            'threats: here the check wins a queen.',
          wrong: {
            'Qxd8+': {
              text: 'It trades queens, and after **Kxd8 bxc3** you are a pawn down with no attack left.',
              refute: 'Kxd8',
            },
            bxc3: {
              text: 'It recovers the knight, but **Qxd4** trades queens, and you are a pawn down with no attack.',
              refute: 'Qxd4',
            },
            Qxc3: {
              text: 'It also recovers the knight, but Black just develops with **e6**. You are still a pawn down, and the d-file is no longer a weapon.',
              refute: 'e6',
            },
          },
          failure: 'Black’s king and queen are still at home. Look at the checks first.',
          reply: 'Kxf7',
          replyNote: 'The king has to take, and it no longer guards the queen on d8.',
          then: {
            prompt: 'The king took on f7. What is now unprotected?',
            moves: ['Qxd8'],
            hint: 'Look at the queen on d8.',
            success:
              '**Qxd8** takes the queen, which the king no longer guards: a queen and a pawn for a bishop.',
            why:
              'Spending one piece to drag the king away is cheap when the capture that follows is a queen. The ' +
              'knight on c3 is a bonus: Black must now spend time rescuing it, and has none to spare.',
            failure: 'The queen on d8 has lost its defender. Ask which capture is worth the most.',
          },
        },
      },
      {
        id: 'keep-going',
        title: 'Take with tempo',
        text:
          'Black has just taken on c3 and expects you to take it back. Pause and look at the board first. Your ' +
          'pawn on e5 attacks the knight on f6, and Black’s pawn on c3 is ready to run to c2, forking your queen ' +
          'and your knight.\n\n' +
          'You are two pawns down, so a slow recapture cannot rescue you. You need a move that makes a threat, ' +
          'and then another one after that.',
        fen: KEEP_GOING,
        shapes: ['e5f6', 'c3:red', 'c3c2:red'],
        task: {
          prompt: 'Which capture keeps you in charge?',
          moves: ['exf6'],
          hint: 'One of Black’s pieces stands on a square your e-pawn attacks.',
          success:
            '**exf6** takes the knight, and the pawn on f6 threatens **fxg7**, which would attack the rook. Black must answer at once.',
          why:
            'Weigh the candidates. **bxc3** is the natural recapture, but **Ng4** attacks e5 a third time and the ' +
            'pawn falls. **Nxc3** loses the same pawn to **dxe5**. **exf6** wins a knight and makes a threat, so ' +
            'Black has to react at once. Before you recapture, look for a capture that comes with a threat.',
          wrong: {
            bxc3: {
              text: '**bxc3** takes back, but **Ng4** attacks e5 a third time. You lose the e-pawn and stay two pawns down.',
              refute: 'Ng4',
            },
            Nxc3: {
              text: '**Nxc3** recovers the pawn, but **dxe5** takes the very pawn that could have won a knight. You are two pawns down with no threats.',
              refute: 'dxe5',
            },
          },
          failure:
            'You cannot hold everything, and recapturing is too slow. Look at what your e5 pawn attacks.',
          reply: 'c2',
          replyNote:
            'Black’s best answer: the pawn attacks your queen and knight at once. But the queen can take it, and that ends the trouble.',
          then: {
            prompt: 'The pawn attacks queen and knight. How do you deal with both?',
            moves: ['Qxc2'],
            hint: 'The queen has to move anyway. Can it move with a capture?',
            success:
              '**Qxc2** takes the pawn and ends the fork. The pawn on f6 is still there, so **fxg7** remains a threat.',
            why:
              'A fork does not hurt when the attacked piece can capture the forking pawn. After Black recaptures ' +
              'on f6 you have won a knight for two pawns, with the more active pieces. **fxg7** is greedy: ' +
              '**cxd1=R** wins your queen.',
            wrong: {
              fxg7: {
                text: 'Greedy: **cxd1=R** captures your queen and promotes, and you will not have enough for it.',
                refute: 'cxd1=R',
              },
              Qd2: {
                text: '**Qd2** saves the queen, but **cxb1=N** takes your knight and promotes.',
                refute: 'cxb1=N',
              },
              'Bxf7+': {
                text: '**Bxf7+** gives up the bishop for a pawn: **Rxf7** takes it, and Black comes out well ahead.',
                refute: 'Rxf7',
              },
            },
            failure: 'Your queen must move anyway. Make the move count.',
          },
        },
      },
      {
        id: 'kill-the-initiative',
        title: 'Kill the initiative',
        text:
          'Now the other side. You are Black in the Danish Gambit: you have taken three pawns and White has won ' +
          'one back, so you are two pawns up. But both white bishops aim at your king, and White is ahead in ' +
          'development.\n\n' +
          'A strong player weighs it. Keep the pawns and defend with great care, or give one back to break the ' +
          'attack? The simplest cure for an initiative is to trade the pieces that carry it, and a pawn is a ' +
          'fair price for that.',
        fen: DANISH,
        orientation: 'black',
        shapes: ['d7d5', 'c4f7:red', 'b2g7:red'],
        task: {
          prompt: 'Which pawn move gives material back to ease the attack?',
          moves: ['d5'],
          hint: 'Open the centre by offering a pawn, so that your queen and pieces come into play.',
          success:
            '**d5** gives a pawn back, attacks the bishop on c4 and opens the centre for Black’s pieces.',
          why:
            'The pawn you return buys the trade of White’s attacking pieces. The engine rates the result as level, ' +
            'and Black’s king is safe. **Qg5** goes after g2, but **Nf3** hits the queen with tempo. Against an ' +
            'initiative, do not cling to material: trade the pieces that carry the attack, and pay a pawn for it ' +
            'if you must.',
          wrong: {
            Nf6: '**Nf6** is a good move too. But **e5** kicks the knight with tempo, and you must keep finding accurate moves. This step shows the simpler cure: return a pawn and trade the attackers.',
            Qg5: {
              text: '**Qg5** goes after g2, but **Nf3** attacks the queen with tempo, and White’s bishops stay on the board.',
              refute: 'Nf3',
            },
          },
          failure: 'White’s bishops are the danger. Offer a pawn so that you can challenge them.',
          reply: 'Bxd5',
          replyNote:
            'White takes with the bishop and keeps the pieces on. The bishop eyes f7 again.',
          then: {
            prompt: 'White took on d5. Which developing move attacks the bishop?',
            moves: ['Nf6'],
            hint: 'A knight move can attack the bishop and develop at once.',
            success:
              '**Nf6** attacks the bishop on d5 and brings a piece into play. White’s sharpest reply, **Bxf7+**, runs into a surprise.',
            why:
              'After **Bxf7+ Kxf7 Qxd8** it looks as though you have lost the queen. But **Bb4+** is check and ' +
              'uncovers the rook’s attack on d8, so White’s only answer is **Qd2**, and **Bxd2+ Nxd2** takes the ' +
              'queen back: queens off, a bishop each gone, material level. That is the recipe against an ' +
              'initiative: trade the attackers, and give back material if that is the price.',
            wrong: {
              f5: {
                text: '**f5** opens the diagonal to your own king and rook: **Bf7+** wins by force.',
                refute: 'Bf7+',
              },
            },
            failure: 'The bishop on d5 is exposed. Develop a piece that attacks it.',
          },
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
      'Trading queens changes everything. Learn which endings to steer into, how to force the trade you want, how to count a pawn ending before you enter it, and which trades to refuse.',
    minutes: 10,
    steps: [
      {
        id: 'ask-first',
        title: 'Ask before you trade',
        text:
          'Every queen trade changes the game you are playing, so a strong player asks three questions before ' +
          'offering one or allowing one.\n\n' +
          '- **Who is ahead?** Extra material counts for more with every piece that comes off.\n' +
          '- **Whose king is better?** With the queens gone, the king becomes a fighting piece.\n' +
          '- **Which pieces stay?** A pawn ending can be counted to the end, while rook endings and ' +
          'opposite-coloured bishops tend to be drawn.\n\n' +
          'Black is two pawns up here, and the white queen is the only piece that can still make trouble. It ' +
          'stands on f3, guarded by nothing but its king.',
        fen: TRADE_INTO_PAWNS,
        orientation: 'black',
        shapes: ['e4f3', 'g2:blue'],
        task: {
          prompt: 'You are two pawns up. Which move heads for a clean win?',
          moves: ['Qxf3+'],
          hint: 'Only the king guards White’s queen. What would a trade of queens leave White to play with?',
          success:
            '**Qxf3+** forces **Kxf3**: the queens come off, and Black is left two pawns up in a pawn ending.',
          why:
            'This pawn ending is won, and you can count it: two extra pawns and no queen left to hunt for checks. ' +
            '**Qd5** and **Qg6+** win too, but they leave White’s queen alive to look for tricks. When you are ' +
            'ahead, look for the move that ends the opponent’s counterplay, not the one that wins the most.',
          wrong: {
            Qd5: {
              text: '**Qd5** wins too, and the engine rates it just as highly. But White keeps a queen to hunt for checks against your king, and the pawn ending takes that risk away.',
            },
            'Qg6+': {
              text: '**Qg6+** wins as well, but White can step aside with **Kh3** and keep the queens on. A capture forces the trade; a check that lets the king step aside does not.',
            },
          },
          failure:
            'You are two pawns up, so trades help you. Look for a way to take the queens off the board.',
          reply: 'Kxf3',
          replyNote:
            'White has to recapture, since only the king guarded the queen. Now Black’s extra pawns meet no queen, no checks and no tricks.',
        },
      },
      {
        id: 'force-with-check',
        title: 'Force the trade',
        text:
          'Black is a knight up, but with the queens on White still has chances to make threats, and the rook ' +
          'on c1 already eyes the knight on c6. A strong player asks a practical question here: can I make the ' +
          'trade happen, whatever White wants?\n\n' +
          'You can, if you offer it with **check**. Put the queen where it gives check, attacks the enemy ' +
          'queen and is protected by one of your own pieces, and White has no time to decline.',
        fen: FORCE_TRADE,
        orientation: 'black',
        shapes: ['b4d4', 'd4g1:blue', 'd4d3:red'],
        task: {
          prompt: 'How do you force the queens off?',
          moves: ['Qd4+'],
          hint: 'Find a protected square where your queen gives check and attacks the white queen.',
          success:
            '**Qd4+** gives check and attacks the white queen from a square the knight protects, so **Qxd4 Nxd4** follows by force.',
          why:
            'The check leaves White no choice: **Kh1** or **Kf1** lose the queen to **Qxd3**, and **Qe3** loses it ' +
            'to **Qxe3+**. **Qb6+** and **Qxb2** may win more pawns, but they leave the queens on, and a knight up ' +
            'you do not need more. Pick the line that removes the opponent’s counterplay.',
          wrong: {
            Qxb2: {
              text: '**Qxb2** wins a pawn and is winning too, but the queens stay on and White keeps some counterplay. This step is about forcing the exchange.',
            },
            'Qb6+': {
              text: '**Qb6+** is excellent too: after **Kh1** the b2 pawn falls. But the queens stay on, and you must keep watching for tricks. This step is about forcing the exchange.',
            },
          },
          failure:
            'Black is a knight up. Look for a check that offers the queen trade on a square your knight protects.',
          reply: 'Qxd4',
          replyNote:
            'White has to take: a king move loses the queen to **Qxd3**, and **Qe3** loses it to **Qxe3+**.',
          then: {
            prompt: 'White took on d4. How do you recapture?',
            moves: ['Nxd4'],
            hint: 'Recapture with the piece that protected the queen.',
            success:
              '**Nxd4** recaptures and centralises the knight. The queens are off, and Black is a clean knight up.',
            why:
              'This is the ending you wanted: no queens to attack your king, and an extra knight that White cannot ' +
              'take away. You gave up the chance of winning more pawns, and a won position does not need them. ' +
              'Simplify when you are ahead.',
            failure: 'Only one piece can take back on d4. Which one protected the queen?',
          },
        },
      },
      {
        id: 'force-with-a-pin',
        title: 'Use a pin to trade',
        text:
          'White is two pawns up and would like the queens off, but an ordinary offer can be declined: Black ' +
          'steps the queen aside and the middlegame goes on. A **pin** takes that choice away.\n\n' +
          'Look at the diagonal from d5 to g8. Black’s queen stands on it, with the king at the far end. A ' +
          'white queen arriving on d5 would pin it, and that square is protected twice, by the rook on d1 and ' +
          'the knight on c3.',
        fen: PIN_TRADE,
        shapes: ['d3d5', 'd5g8:blue', 'e6:red'],
        task: {
          prompt: 'Where does your queen go to force the trade?',
          moves: ['Qd5'],
          hint: 'Black’s queen and king share a diagonal. Which square on it can your queen reach?',
          success:
            '**Qd5** pins the black queen to its king. It cannot leave the diagonal, so Black cannot avoid the trade.',
          why:
            'A pin turns an offer into an order. Black’s queen cannot leave the diagonal, so the trade happens on ' +
            'your terms and your two extra pawns meet a queenless middlegame. **h3** and **Qd4** score a little ' +
            'higher on the engine, but they leave Black’s queen free to untangle. Choose the move that leaves ' +
            'the opponent no choice.',
          wrong: {
            h3: {
              text: '**h3** wins too: it gives the king a square and keeps both extra pawns. But the queens stay on and Black gets time to untangle. This step is about forcing the trade.',
            },
            Qd4: {
              text: '**Qd4** attacks the a-pawn and also wins, but **Re8** keeps the queens on and Black’s pieces untangle. A pin makes the trade unavoidable.',
            },
          },
          failure:
            'You are two pawns up. Look for a square where your queen attacks the queen on e6 and Black cannot step aside.',
          reply: 'Qxd5',
          replyNote:
            'Black takes. Declining with ...Re8 only delays it, because **Qxe6+** forces the trade anyway.',
          then: {
            prompt: 'The queen took on d5. Which recapture keeps up the pressure?',
            moves: ['Rxd5'],
            hint: 'Two of your pieces can take back on d5. Which one hits the bishop on d7?',
            success:
              '**Rxd5** attacks the bishop on d7, which cannot move without losing the rook behind it.',
            why:
              'Both recaptures win, but **Nxd5** puts the knight in front of your rook and leaves Black free to ' +
              'untangle. **Rxd5** keeps the knight on c3 to guard the rook and ties the bishop to the rook on d8. ' +
              'In a won ending, keep your pieces active and your opponent’s tied up.',
            wrong: {
              Nxd5: {
                text: '**Nxd5** also wins, but it puts the knight in front of your own rook, so nothing hits the bishop on d7. **Rxd5** keeps Black tied up.',
              },
            },
            failure:
              'Your queen was just taken, so take back on d5. Choose the recapture that keeps up the pressure.',
          },
        },
      },
      {
        id: 'count-the-ending',
        title: 'Count the pawn ending',
        text:
          'Sometimes the question is not how to force a trade but whether to accept one. Material is level. ' +
          'Black’s queen on c4 attacks yours, and the pawns on b5 and d5 guard it, so you can take on c4 or ' +
          'look for something else.\n\n' +
          'A strong player does not guess here: they count. Your king on e2 is close to the queenside pawns, ' +
          'and Black’s king on g6 is far from them, with its queenside pawns left to look after themselves ' +
          'once the queens leave.',
        fen: QUEENS_OFF,
        shapes: ['d3c4', 'e2e3:blue'],
        task: {
          prompt: 'Count the pawn ending first. Which move do you play?',
          moves: ['Qxc4'],
          hint: 'Which king reaches the queenside pawns first if the queens come off?',
          success:
            '**Qxc4** trades queens. After **dxc4 Ke3** the white king reaches d4 and c5 long before Black’s king arrives.',
          why:
            'Count it out: after **Qxc4 dxc4 Ke3**, your king needs three moves to attack the b-pawn, and Black’s ' +
            'king is too far away to stop it. **Ke3** at once is natural, but **Qxa2** grabs a pawn and the game ' +
            'is level. Everything but the trade is at best a draw, so count the pawn ending before you press the button.',
          wrong: {
            Ke3: {
              text: 'With the queens on, **Qxa2** grabs a pawn at once and the game is level. The king march only works once the queens are off.',
              refute: 'Qxa2',
            },
          },
          failure: 'Black’s queen is attacking yours. Ask what happens if the queens come off.',
          reply: 'dxc4',
          replyNote:
            'Black takes with the d-pawn, the better recapture: after **bxc4** White’s a-pawn runs even faster.',
          then: {
            prompt: 'The queens are off. Which king move wins the race?',
            moves: ['Ke3'],
            hint: 'Which square brings the king towards d4?',
            success:
              '**Ke3** heads for d4 and c5, and White’s king gets there while Black’s king is still on the kingside.',
            why:
              '**Kf3** and **Kd2** look natural too, but after **Kf3 Kf6 Ke3 Ke5** Black’s king reaches the centre ' +
              'first and the ending is a draw. **Kd2** loses the same tempo. In pawn endings one tempo decides, so ' +
              'count each king’s route and pick the square that wins the race.',
            wrong: {
              Kf3: {
                text: '**Kf3** looks natural, but **Kf6** and Black’s king reaches e5 in time. The ending is a draw.',
                refute: 'Kf6',
              },
              Kd2: {
                text: '**Kd2** keeps the king near the queenside, but it loses a tempo: **Kf6**, and Black’s king gets to e5 first. The ending is a draw.',
                refute: 'Kf6',
              },
            },
            failure:
              'Count the moves each king needs to reach the queenside. The right square is the one that gets there first.',
            reply: 'Kf6',
            replyNote:
              'Black’s king heads for the centre too, but it is a move late: White’s king is already on e3.',
            then: {
              prompt: 'Black’s king came to f6. How does White stay ahead?',
              moves: ['Kd4'],
              hint: 'Which central square brings your king closer to the b-pawn and keeps Black’s king out of e5?',
              success:
                '**Kd4** takes the centre first. **Kc5** and the capture of the b-pawn follow, and Black’s king cannot get back in time.',
              why:
                'This is the whole idea: in a pawn ending the king is the strongest piece. Quiet moves such as ' +
                '**a3** or **f3** let Black’s king reach e5, and the game is drawn; **Kd4** takes that square ' +
                'away. Count the route of each king before you commit, and keep your king ahead in the race.',
              failure: 'The king is the strongest piece here. Keep it moving towards the centre.',
              reply: 'Ke6',
              replyNote:
                'Black’s king hurries towards the queenside too, but White’s arrives first: **Kc5** wins the b-pawn next.',
            },
          },
        },
      },
      {
        id: 'refuse',
        title: 'Trades to refuse',
        text:
          'The same questions can tell you to say **no**. Suppose you are Black, a pawn up, and a trade of the ' +
          'remaining pieces would lead to this ending. The bishops are on opposite colours: White’s controls ' +
          'the light squares and yours only the dark ones.\n\n' +
          'See what that means. Your pawns on e4, f7, g6 and h5 all stand on light squares, so White’s bishop ' +
          'can attack and block them while yours can never help. With the white king beside it, it makes a wall ' +
          'you cannot cross, and the engine calls the position a dead draw.\n\n' +
          'So ask the third question before you trade: which ending am I heading for? If you cannot win it, keep ' +
          'the rooks or the knights on.',
        fen: OPPOSITE_TRAP,
        shapes: ['c5:red', 'c4:blue'],
      },
    ],
    practiceThemes: ['queenEndgame', 'pawnEndgame'],
  },
];
