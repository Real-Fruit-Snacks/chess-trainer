import { fenAfter, type Lesson } from '../model';

// Rook and bishop versus rook.
const RB_PHILIDOR = '3k4/8/3K4/3B4/8/8/4r3/5R2 w - - 0 1';
const RB_FINISH = fenAfter(
  'Rf8+ Re8 Rf7 Re1 Ra7 Rc1 Bb3 Rc3 Be6 Rd3+ Bd5 Rc3 Rd7+ Kc8 Rf7 Kb8 Rb7+ Kc8',
  RB_PHILIDOR,
);
const RB_COCHRANE = '6k1/1R6/8/4K3/4B3/8/8/4r3 b - - 0 1';

// Catalan and Queen's Gambit Declined plans.
const CAT_OPEN = fenAfter('1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4');
const CAT_OPEN_2 = fenAfter('1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4 7. Qc2');
const CAT_CLOSED = fenAfter(
  '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O c6 7. Qc2 b6 8. Nbd2 Bb7 9. e4',
);
const QGD_CARLSBAD = fenAfter(
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 Re8 9. Nf3 c6 10. O-O Nf8',
);
const QGD_MINORITY = fenAfter(
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 Re8 9. Nf3 c6 10. O-O Nf8 11. Rab1 h6 12. Bh4 Ne4 13. Bxe7 Qxe7',
);
const QGD_TARTAKOWER = fenAfter(
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. Be2 Bb7 9. Bxf6 Bxf6 10. cxd5 exd5 11. O-O',
);

// French structures.
const FR_ADVANCE = fenAfter('1. e4 e6 2. d4 d5 3. e5');
const FR_ADVANCE_3 = fenAfter('1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 Nh6 7. b4');
const FR_F6 = fenAfter(
  '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Bd7 6. Be2 Nge7 7. O-O Ng6 8. g3',
);
const FR_WINAWER = fenAfter('1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7');
/** The answer to every move that ignores the threat bxc5 in the Advance French step. */
const FR_IGNORES_BXC5 = {
  text: 'This ignores White’s threat: **bxc5** wins the pawn on c5, because ...Qxc5 would walk into **dxc5**. The tension has to be released now.',
  refute: 'bxc5',
};
const FR_TARRASCH = fenAfter(
  '1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5 5. Ngf3 Nc6 6. Bb5 Bd6 7. O-O Nge7 8. dxc5 Bxc5 9. Nb3 Bd6 10. Re1 O-O',
);

// Exchange sacrifices II (positions from Lichess games, CC0 puzzle database).
const EX_SICILIAN = '2r2rk1/1p1qbppp/p2p1nn1/P2Pp1B1/1P2P3/2N2N2/5PPP/2RQ1RK1 b - - 2 15';
const EX_STRUCTURE = '2rq1k1r/p4ppp/1p1bpn2/7b/3PB3/1QN1P3/PP3PPP/R1B2RK1 b - - 2 13';
const EX_KING = 'r4rk1/1p1b2p1/p3pnQp/2pp2N1/3n2qP/2NB4/PPP3P1/1K1R1R2 w - - 6 21';
const EX_PIN = 'r3r1k1/p5p1/2p2nQ1/1p1p2B1/4q3/P7/2P3PP/1R3R1K w - - 1 23';
const EX_ENDGAME = '6k1/1p3pp1/2p2nbp/2P2p2/1PP2P2/2N1r3/4BKPP/2R5 b - - 4 21';

// Calculation III (positions from Lichess games, CC0 puzzle database).
const CALC_RACE = '8/8/8/2p4p/3k4/2rP1K1P/3R2P1/8 b - - 3 49';
const CALC_RACE_3 = fenAfter(
  'Rxd3+ Rxd3+ Kxd3 g4 hxg4+ hxg4 c4 g5 c3 g6 c2 g7 c1=Q g8=Q',
  CALC_RACE,
);
const CALC_BREAK = '8/5p2/p3p3/7p/7P/6P1/P4Pk1/4K3 w - - 0 43';
const CALC_SIMPLIFY = '8/8/p7/1p3K2/1P1B4/2rkP3/8/8 w - - 0 63';
const CALC_QUIET = 'r2q1r2/pp1b1pk1/2n1pbp1/4N3/3P1PQ1/PB5R/1PP3P1/2KR4 w - - 3 21';
const CALC_KING = fenAfter('Kxg2 Kg5', '8/7p/p5pk/5p2/P2p4/3P4/1PP3q1/5K2 w - - 0 42');

// When there is nothing to do (positions from the classic games in this app).
const NOTHING_RA2 = 'r1r2bk1/1nqb1p1p/3p1np1/1ppPp3/1P2P3/2PBBNNP/3Q1PP1/R3R1K1 w - - 2 22';
const NOTHING_BIND = fenAfter('Ra2 c4 Bb1 Qd8 Ba7', NOTHING_RA2);
const NOTHING_F4 = 'r1rnb1k1/B1n1qpbp/3p2p1/1p1Pp3/1Pp1P3/2P4P/R2QNPPN/RB4K1 w - - 14 30';
const NOTHING_NF1 = '1rb2rk1/1nq1bppp/3p1n2/1ppPp3/1P2P3/2P2N1P/2BN1PP1/R1BQR1K1 w - - 1 17';
const NOTHING_KING = '5k2/p1p4R/1pr5/3p1pP1/P2P1P2/2P2K2/8/8 w - - 0 35';
const NOTHING_ROOK = '8/p3k1pp/8/5R2/8/4PK2/Pr4PP/8 w - - 0 27';
const NOTHING_SAFETY = 'r1b1nr2/pp2pk1p/2n1p1p1/4b3/8/2N1B3/PPPQ1PPP/R3K2R w KQ - 0 14';

export const advancedLessons6: Lesson[] = [
  {
    id: 'rook-and-bishop-vs-rook',
    title: 'Rook and bishop versus rook',
    level: 'advanced',
    category: 'Endgames',
    summary:
      'Usually a draw, often lost in practice. The Philidor position and the method that wins it, and the Cochrane defence that holds: what to know before you get there.',
    minutes: 9,
    practiceThemes: ['rookEndgame', 'endgame'],
    steps: [
      {
        title: 'The Philidor position',
        text:
          'Rook and bishop against rook is a draw in most positions, yet strong players lose it again and again: the defence is hard to find over the board. This is the position the defender must never drift into, and the one the attacker aims for. Black’s king is on the back rank, your king faces it from d6, and the bishop on d5 shields your king from checks along the d-file. With White to move it is a forced win.\n\n' +
          'It shares its name with the rook-and-pawn draw, but this Philidor position is a win. The method has three parts: drive the black rook to a poor square, threaten mate, then let the bishop finish the job. It begins with a check.',
        fen: RB_PHILIDOR,
        shapes: ['f1f8', 'e2:red', 'd6:blue', 'd8:blue'],
        task: {
          prompt: 'How do you begin the winning method?',
          moves: ['Rf8+'],
          hint: 'The black king cannot move: your king covers c7, d7 and e7. What happens if your rook checks it along the back rank?',
          success:
            '**Rf8+** checks along the back rank. The king has no square, so the black rook must come all the way back from e2 to block on e8.',
          why: 'The black rook is at its best far from your king, free to check from a distance. The check drags it back to e8, next to its own king, where it is pinned and takes the king’s own flight square. Every step of this method does the same thing: it takes good squares away from the defending rook. And notice the forcing move came first: with one legal reply, there was nothing to calculate.',
          wrong: {
            Ra1: 'That wins too, and is even a move faster: the rook heads for the seventh rank by another road. But the method is easier to remember with the check, which sends the black rook to e8 at once.',
            Kc6: 'Your king steps away from the black king, and that is exactly what the defender wanted: without the kings facing each other, the black king gets out of the box and the ending is a draw again.',
          },
          failure:
            'Use the rook to check the king along the back rank. The king has nowhere to go, so the black rook has to come back and block.',
          reply: 'Re8',
          replyNote:
            'The only legal move. The rook blocks on e8, pinned against its own king, and it has left the active square on e2.',
          then: {
            prompt: 'Your rook has done its job on f8. Where does it go next?',
            moves: ['Rf7'],
            hint: 'Stay on the f-file, out of reach. Which square on it lets the rook swing across the seventh rank?',
            success:
              '**Rf7** takes the seventh rank and threatens to swing to a7 and mate on a8. To stop it, the black rook has to leave e8 and give its king the square.',
            why: 'Count the threat: from a7 the rook would mate on a8, because your king covers c7, d7 and e7 and the black rook blocks e8. So Black has to move the rook off the back rank, and it runs as far away as it can, to keep its checking distance. That is the best defence, and the reason the win still takes about fifteen more moves.',
            wrong: {
              'Rxe8+': {
                text: 'Trading rooks leaves king and bishop against king, and a bishop cannot mate on its own: a dead draw. Your rook is the piece that mates, so keep it.',
                refute: 'Kxe8',
              },
              Rf4: 'That keeps the win too: any rook move along the f-file does. But it gives Black time. **Rf7** makes the threat at once and forces the black rook to decide.',
            },
            failure:
              'The rook on f8 is attacked by the pinned rook. Step it back along the f-file to a square from which it threatens mate on the other side of the board.',
            reply: 'Re1',
            replyNote:
              'The rook runs to e1, as far from your king as it can get. **Re2** would have held out a little longer; the method against it is the same.',
            then: {
              prompt: 'Your king is ready. Where can the rook threaten mate now?',
              moves: ['Ra7'],
              hint: 'With the black rook on e1, nothing guards the back rank on the queenside. Which rook move threatens a check there?',
              success:
                '**Ra7** stays on the seventh rank and threatens mate on a8: your king covers c7, d7 and e7, and the black rook cannot get to b8 or c8 to block.',
              why: 'Black’s only good defence is to bring the rook to the c-file, so that a check can be blocked on c8. That square is what the rest of the method is about: the bishop will take it away. Strong players think of this ending as a fight over a few squares, here c8, rather than as a sequence of moves to memorise.',
              wrong: {
                Rb7: 'That works just as well: it threatens mate on b8 instead, and the method goes on in the same way. This line follows **Ra7**, the same idea one file further along.',
                Rc7: 'That keeps the win, but it threatens nothing: a check on c8 would simply be taken by the king. Go further along the seventh rank, where the check cannot be answered that way.',
                'Rd7+':
                  'A check, but after **Ke8** or **Kc8** the king has found air and you have to start the squeeze again.',
              },
              failure:
                'Look for a rook move along the seventh rank that threatens mate on the back rank, out of reach of the black king.',
              reply: 'Rc1',
              replyNote:
                'The only good defence: from c1 the rook can block a check on c8. Every other move runs into mate or loses the rook within a few moves.',
            },
          },
        },
      },
      {
        id: 'cut-the-rook-off',
        title: 'Cut the rook off',
        text:
          'Play on from the last step and the bishop joins in: **Bb3** threatens **Be6**, which would cover c8 and turn a check on the back rank into mate, so Black has to keep harassing. Six moves of manoeuvring later, with the bishop going to b3, e6 and back to d5 and the rook checking on d7 and b7, we reach this position. The black king has been pushed to c8, and the black rook stands on c3.\n\n' +
          'The finish comes from the bishop again, with a check from e6 that drives the king back to d8. Before you give it, look at what the bishop is doing on d5 right now.',
        fen: RB_FINISH,
        shapes: ['d5b7:blue', 'b7:red'],
        task: {
          prompt: 'Which rook move sets up a mate with the bishop?',
          moves: ['Rb4'],
          hint: 'On b7 the rook is protected only by the bishop. Keep control of the b-file, but step out of the king’s reach.',
          success:
            '**Rb4** keeps the b-file and steps out of the king’s reach. Now it threatens Be6+ Kd8 Rb8+ Rc8 Rxc8#.',
          why: 'Why not **Be6+** at once? Because the bishop leaving d5 leaves the rook on b7 unprotected, and the king takes it. From b4 the rook does the same job, guarding b7 and b8 so the king cannot run, but no king can reach it. Black’s best try is to pin the bishop so that it cannot give that check.',
          wrong: {
            'Be6+': {
              text: 'The mating idea, one move too early: with the bishop gone from d5, nothing protects the rook on b7, and the king simply takes it.',
              refute: 'Kxb7',
            },
            Rf7: 'That keeps the win, but it repeats the earlier manoeuvre. The rook has to leave the seventh rank so that the bishop’s check does not leave it hanging.',
          },
          failure:
            'Keep control of the b-file, but put the rook where the black king cannot reach it, so that the bishop is free to give check.',
          reply: 'Rd3',
          replyNote:
            'The toughest defence: the rook pins your bishop against your king, so **Be6+** is impossible for now.',
          then: {
            prompt: 'The bishop is pinned. How can the rook threaten mate on its own?',
            moves: ['Ra4'],
            hint: 'A pinned bishop still guards b7. Where could the rook check on the back rank so that the king has no square at all, not even a7?',
            success:
              '**Ra4** threatens mate on a8: the bishop still covers b7, your king covers c7 and d7, and from the a-file the rook also keeps the king out of a7.',
            why: 'A pinned piece cannot move, but it still controls its squares, so the king cannot use b7. Rook moves to e4, f4, g4 or h4 threaten mate too, but after **Kb8** the king slips out through a7. From a4 the rook shuts that door, and Black has to give up the rook for the bishop.',
            wrong: {
              Rh4: 'That threatens mate on h8 as well, and still wins, but **Kb8** gives the king a way out through a7. From a4 the rook covers that file too.',
            },
            failure:
              'The bishop is pinned but still guards b7. Find the rook move that threatens mate on the back rank and also closes the king’s escape through a7.',
            reply: 'Rxd5+',
            replyNote:
              'Black gives up the rook for the bishop rather than be mated on a8. The checks are over.',
            then: {
              prompt: 'What is left to do?',
              moves: ['Kxd5'],
              hint: 'Count the material after the recapture.',
              success:
                '**Kxd5**, and it is king and rook against king: a mate you can force from any position.',
              why: 'This is what the whole method was for. The rook and bishop took every square around the black king, until the defender had to give up the rook. As the attacker, aim for the Philidor position; as the defender, keep your king off the edge, and never let it be caught there with the enemy king facing it.',
              wrong: {
                Kc6: 'That keeps the win, but the rook on d5 is yours to take now. Why give Black a move?',
              },
              failure:
                'The black rook has just taken your bishop with check, and your king can take it back.',
            },
          },
        },
      },
      {
        id: 'cochrane-defence',
        title: 'The Cochrane defence',
        text:
          'Now swap sides. You are defending, and your king is already on the edge, the dangerous case. The defence that holds here is the **Cochrane defence**: your rook stands behind the bishop on the e-file and pins it to the white king. A pinned bishop cannot move, so it cannot block a check or come to the square where it would help to mate, and White has to spend moves breaking the pin. Your king does nothing at all: it waits on the back rank.\n\n' +
          'Most moves in this position lose. Before you move, ask the defender’s question: what does my opponent want? Here, a free bishop.',
        fen: RB_COCHRANE,
        orientation: 'black',
        shapes: ['e1e4', 'e4:red', 'e5:red'],
        task: {
          prompt: 'Find a move that keeps the pin, and the draw.',
          moves: ['Kf8', 'Kh8', 'Re2', 'Re3'],
          hint: 'Which of your pieces must not leave its line? Move something that keeps it there.',
          success:
            'The pin stays on: your rook is still on the e-file behind the bishop, and your king waits on the back rank. White has to start unpicking the pin.',
          why: 'The rook on e1 is doing the most important job on the board. Move it off the e-file and the bishop is free: **Bf5** follows, the white king steps up to f6, and the net closes around your king. Defending this ending is mostly about knowing which piece must stay put, and passing with the others. With the pin kept, White has no way through.',
          wrong: {
            Ra1: {
              text: 'The rook goes far away to check from a distance, a good habit in most rook endings. Here it lets the bishop go: **Bf5** follows, and White’s pieces close in on your king.',
              refute: 'Bf5',
            },
            Rd1: {
              text: 'This keeps White’s king off the d-file, but it frees the bishop: after **Bf5** White’s king and rook can build a mating net.',
              refute: 'Bf5',
            },
            'Rxe4+': {
              text: 'Taking the bishop looks like a way out, but it is protected: the king takes back, and king and rook against king is lost.',
              refute: 'Kxe4',
            },
          },
          failure:
            'The rook on e1 pins the bishop to the white king. Keep it on the e-file, or pass with your king, and the bishop stays out of play.',
        },
      },
      {
        id: 'rook-and-bishop-summary',
        title: 'Summary',
        text:
          '- **Attacker**: aim for the Philidor position: enemy king on the edge, your king facing it, bishop shielding your king. Then check to drive the rook back, take the seventh rank, threaten mate, and let the bishop cut the defending rook off.\n' +
          '- **Defender**: keep your king away from the edge for as long as you can. If it is pushed there, pin the bishop to the enemy king from behind (the Cochrane defence) and keep the pin.\n' +
          '- **Count the moves**: the win can take many moves, and the fifty-move rule (fifty moves without a capture or a pawn move) is a real resource for the defender.',
        fen: RB_PHILIDOR,
      },
    ],
  },
  {
    id: 'catalan-and-qgd-plans',
    title: 'Catalan and Queen’s Gambit plans',
    level: 'advanced',
    category: 'Openings',
    summary:
      'The middlegame ideas behind 1.d4 d5 2.c4: the Catalan bishop and Black’s ...a6, ...b5 plan, the break against a closed centre, the minority attack in the Carlsbad structure, and the freeing ...c5 of the Tartakower.',
    minutes: 10,
    practiceThemes: ['opening', 'middlegame'],
    steps: [
      {
        title: 'The Catalan: no hurry for the pawn',
        text:
          'In the Catalan you fianchetto the king’s bishop and let Black take on c4. That is not a blunder but a bargain: the bishop on g2 aims down the long diagonal towards b7 and a8, and the pawn on c4 is hard to keep, because Black’s queenside pieces are still at home.\n\n' +
          'So there is no need to rush. Strong players ask a simple question here: which piece can attack c4 and still be useful afterwards? Several moves do that job, each pointing a piece at the pawn.',
        fen: CAT_OPEN,
        shapes: ['c4:red', 'g2a8:blue'],
        task: {
          prompt: 'How do you prepare to win back the c4-pawn?',
          moves: ['Qc2', 'Qa4', 'Ne5'],
          hint: 'Which of your pieces can reach a square that attacks c4 in one move?',
          success:
            'A piece now aims at c4, and the pawn will come back within a move or two. Meanwhile your bishop on g2 keeps pressing on the long diagonal.',
          why: '**Qc2** is the main line: the queen eyes c4 and stays central. **Qa4** goes for the pawn more directly, and **Ne5** attacks it while opening the bishop’s diagonal. What you must not do is waste time: Black’s plan is to use every move you spend on c4 to develop the queenside with ...a6, ...b5 and ...Bb7.',
          wrong: {
            Nbd2: 'The knight aims at c4, but it is too slow: **...b5** defends the pawn, and Black may keep it. Use the queen or the other knight.',
            Na3: 'The knight heads for c4 too, but after **...Bxa3** your queenside pawns are doubled. Playable, but the queen moves are cleaner.',
            a4: 'A real line: it stops ...b5 for good, and the c4-pawn can wait. But it attacks nothing yet; this step asks for a move that goes after c4.',
          },
          failure:
            'Look for a piece that can attack c4 in one move: the queen has two ways, and the knight on f3 has one.',
        },
      },
      {
        title: 'Black’s plan: ...a6, ...b5, ...Bb7',
        text:
          'Now sit on the other side. White is about to take back on c4, and Black does not try to stop it. Instead the plan is to use the time: ...a6 prepares ...b5, which gains space with a tempo on the queen once she has taken on c4, and then the bishop goes to b7 to challenge White’s bishop on the long diagonal.\n\n' +
          'Ask what White wants: to collect the pawn and keep the long diagonal for the g2-bishop. Each move of Black’s plan answers that.',
        fen: CAT_OPEN_2,
        orientation: 'black',
        shapes: ['a7a6', 'b7b5:blue', 'c8b7:blue'],
        task: {
          prompt: 'Which pawn move starts the plan?',
          moves: ['a6'],
          hint: 'The b-pawn wants to go to b5. What does it need first, so that it has support there?',
          success:
            '**...a6** prepares **...b5**: when the queen takes on c4, the b-pawn will hit her with the a-pawn behind it.',
          why: 'With the pawn on a6, ...b5 comes with support and cannot simply be taken. Notice what Black is not doing: defending c4 with pieces. The pawn was always going to come back, so Black spends the time on space and development. That is how to treat a gambit pawn you cannot keep.',
          wrong: {
            b5: 'Playable, and the engine rates it close to **...a6**: it holds the pawn for now. But after **a4** Black has to spend moves propping up the chain. This step follows the main line.',
            c5: 'A sound alternative: Black gives the pawn back at once and frees the game with ...Nc6. It is a different plan; this step follows ...a6 and ...b5.',
            c6: 'Solid, and it prepares ...b5 too, but it takes c6 from the knight and blocks the long diagonal for your own bishop.',
          },
          failure:
            'This step is about the queenside plan: a pawn move that prepares ...b5, so that the b-pawn can gain space with tempo on the queen.',
          reply: 'Qxc4',
          replyNote:
            'White takes the pawn back, as expected. The queen now stands on c4, exactly where a pawn on b5 would hit her.',
          then: {
            prompt: 'Now gain space, with tempo.',
            moves: ['b5'],
            hint: 'Which pawn can attack the queen on c4, with support?',
            success:
              '**...b5** hits the queen, and the pawn on a6 guards it. Black gains space on the queenside and makes room for the bishop on b7.',
            why: 'Every tempo counts in the opening: the queen has to move again, and Black gets a free move for the bishop. Moves such as **...Bd7** are playable, but they gain neither space nor time. The pawn on b5 can become a target for a4 later, so the bishop must arrive quickly.',
            wrong: {
              Bd7: 'Playable, with ...Bc6 in mind, but it gains no time. **...b5** develops nothing and yet does more: it moves the queen and makes room for the bishop on b7.',
            },
            failure: 'Look for a pawn move that attacks the queen on c4 and is protected.',
            reply: 'Qc2',
            replyNote:
              'The queen drops back to c2. Now the long diagonal is the battleground: White’s bishop on g2 against the one Black is about to bring out.',
            then: {
              prompt: 'Complete the plan.',
              moves: ['Bb7'],
              hint: 'Which bishop belongs on the long diagonal, facing White’s?',
              success:
                '**...Bb7** puts the bishop on the long diagonal, opposite White’s bishop on g2. The Catalan bishop no longer has the diagonal to itself.',
              why: 'This is why the pawn went to b5: it made the square for the bishop. Black can follow with ...Nbd7 and ...c5, freeing the game with the extra queenside space. White develops with Bf4 or Bg5 and brings a knight to c3 or d2, aiming at c7 and the c-file. Both sides have what they wanted.',
              wrong: {
                Qd5: {
                  text: 'The queen steps onto the long diagonal, right in front of the Catalan bishop: **Ng5** uncovers the bishop on g2 against her, and Black loses material.',
                  refute: 'Ng5',
                },
              },
              failure:
                'The bishop on c8 still has no good diagonal. Which square did the b-pawn just make for it?',
            },
          },
        },
      },
      {
        id: 'closed-catalan',
        title: 'The closed Catalan: break the centre',
        text:
          'A different Catalan. Black has kept the pawn on d5 and built a solid wall with ...c6 and ...b6, and White has used the time for **e4**: the centre pawns now stand side by side. If Black waits, **e5** follows, the knight is driven from f6, and White’s space advantage turns into a kingside attack.\n\n' +
          'The habit to build: when your opponent builds a big centre, strike at it before it advances. Black has two good ways to break it up.',
        fen: CAT_CLOSED,
        orientation: 'black',
        shapes: ['c6c5', 'd5c4:blue', 'e4e5:red'],
        task: {
          prompt: 'How does Black hit back at the centre?',
          moves: ['c5', 'dxc4'],
          hint: 'A pawn move that attacks d4, or a capture that breaks White’s chain apart.',
          success:
            'Black challenges the centre at once: ...c5 hits d4, and ...dxc4 breaks the chain before ...c5 follows. Either way the position opens while Black’s pieces are ready.',
          why: 'Compare the natural **...Nbd7**: White plays **e5**, the knight has to leave f6, and Black stays cramped for a long time. After ...c5 the d4-pawn is attacked, and if White takes or pushes, lines open for Black’s bishops. The engine also likes **...Na6**, which prepares the same break. Preparing it is fine; waiting is not.',
          wrong: {
            Nbd7: 'Natural, but it lets White play **e5**: the knight on f6 is driven back and White gains space for a kingside attack. Break first, then develop.',
            Na6: 'A good move, the engine’s favourite: the knight heads for b4 or c7, and Black still plans ...c5. This step asks for the break itself.',
            dxe4: 'This gives up the centre on poor terms: after **Nxe4** your knights come to life, and White has easy development. Taking on c4 is the better way to dissolve the centre.',
            e5: {
              text: 'The wrong pawn: after **dxe5** your knight on f6 is attacked, and when the dust settles in the centre, White has won a pawn.',
              refute: 'dxe5',
            },
          },
          failure:
            'This step is about the pawn break: hit White’s centre with a pawn, or capture to break up the chain, before e5 cramps your pieces.',
        },
      },
      {
        id: 'carlsbad',
        title: 'The Carlsbad structure',
        text:
          'Now the Queen’s Gambit Declined. After 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 the pawns form the **Carlsbad structure**: White has the half-open c-file, Black the half-open e-file. White’s classic plan is the **minority attack**: the b-pawn marches to b5, two pawns against three, to leave Black with a weak pawn on c6 or d5.\n\n' +
          'Black’s counterplay is on the kingside and in the centre, with ...Ne4 and the knight coming to g6. So White starts with quiet moves that prepare b4, or take Black’s ideas away.',
        fen: QGD_CARLSBAD,
        shapes: ['a1b1', 'b2b4:blue', 'b4b5:blue', 'c6:red'],
        task: {
          prompt: 'Find a useful quiet move: prepare b4, or take away one of Black’s ideas.',
          moves: ['Rab1', 'h3'],
          hint: 'The b-pawn needs a rook behind it before it advances. And which square would Black’s knight and bishop like on the kingside?',
          success:
            'One quiet move of the plan: **Rab1** puts the rook behind the b-pawn, ready for b4 and b5, and **h3** takes g4 away from Black’s knight and bishop.',
          why: 'The minority attack is slow, so the order is: deny the opponent’s counterplay, put the rook behind the pawn, then push. Strong players do not rush b4 here; they ask what Black wants (...Ne4, ...Bg4, a knight on g6) and make one quiet move that spoils it. **Ne5** and **Rae1** are good moves too, but they aim at the centre; this step is about the queenside plan.',
          wrong: {
            b4: 'The right plan, one move too soon: nothing protects the pawn yet, and the bishop on e7 can take it. Prepare first.',
            Ne5: 'A good move too, but a different plan: the knight looks at the centre and the kingside. This step is about preparing b4.',
            Rae1: 'Good, but it prepares play in the centre, not the minority attack. Put the rook behind the b-pawn instead.',
          },
          failure:
            'Think about the plan b4 and b5: which rook belongs behind the b-pawn? Or which kingside square does Black want for a knight or a bishop?',
        },
      },
      {
        id: 'minority-attack',
        title: 'The minority attack',
        text:
          'A few moves later: 11. Rab1 h6 12. Bh4 Ne4 13. Bxe7 Qxe7. Black’s knight has jumped to e4, but your knight on c3 holds, and the preparation is complete. The bishop that could have taken a pawn on b4 has been exchanged.\n\n' +
          'The minority attack works like a battering ram: the b-pawn advances to b5 and offers itself. If Black takes with the c-pawn, d5 is isolated; if White takes on c6, Black is left with a backward c-pawn on a half-open file. Either way White gets a fixed target.',
        fen: QGD_MINORITY,
        shapes: ['b2b4', 'b4b5:blue', 'c6:red'],
        task: {
          prompt: 'Start the minority attack.',
          moves: ['b4'],
          hint: 'Which pawn leads the attack against c6?',
          success:
            '**b4**, and b5 is the next target. The pawn is safe on b4 now that the bishop on e7 has gone.',
          why: 'Two pawns attack three: the b-pawn will offer itself on b5 to break Black’s chain, and the a-pawn will support it. Your rook on b1 and queen on c2 already stand ready for the files that open. **Ne5** is just as good by the engine’s count, but it is another plan; the minority attack works only if you play it with purpose.',
          wrong: {
            Ne5: 'Just as good by the engine’s count, and the knight is strong on e5, but it is a different plan. This step is about the pawns: b4 first, then a4 and b5.',
          },
          failure: 'This step is about the minority attack: which pawn starts the march to b5?',
          reply: 'a6',
          replyNote:
            'Black prepares for b5: with a pawn on a6, an exchange on b5 can be answered by ...axb5, keeping the c-pawn healthy for now.',
          then: {
            prompt: 'Black guards b5 for the moment. How do you support the push?',
            moves: ['a4'],
            hint: 'The b-pawn needs a friend to advance against ...a6.',
            success:
              '**a4** supports **b5**: the push will now come with two pawns behind it, and ...axb5 can be met by axb5.',
            why: 'This is the standard pattern: when the defender plays ...a6, bring the a-pawn up so that b5 can be played anyway. The engine rates **Bxe4** and **Ne5** about the same, pieces first, but the pawns are the plan, and once they are prepared Black cannot stop b5 without new concessions.',
            wrong: {
              Bxe4: 'Fine as well: taking the e4-knight is a common idea. But this step follows the pawn plan, a4 and then b5.',
              Ne5: 'Good by the engine’s count, but it puts the plan on hold. Support the b-pawn first.',
            },
            failure:
              'The b-pawn wants to go to b5, but ...a6 guards that square. Which pawn can help it get there?',
            reply: 'Ng6',
            replyNote:
              'Black ignores the queenside and brings the knight towards the king, where it eyes f4 and h4.',
            then: {
              prompt: 'Now the push.',
              moves: ['b5'],
              hint: 'Everything is prepared: the a-pawn and the rook stand behind the b-pawn.',
              success:
                '**b5** breaks into Black’s chain. Whatever Black does, a weakness stays behind: d5 isolated after ...cxb5, or a backward c6-pawn after bxc6 bxc6.',
              why: 'That is the minority attack in full: b4, a4, b5. After the exchanges Black is left with a weak pawn on c6 or d5 that White can attack down the open files for the rest of the game. It is a long-term plan, and that is its strength: the weakness never goes away.',
              wrong: {
                Rfc1: 'A useful move, but it waits. The pawns are ready now and Black’s knight has gone to the kingside, so push.',
              },
              failure:
                'The pawns are in place and the rook on b1 backs them up. Which pawn breaks into Black’s chain?',
            },
          },
        },
      },
      {
        id: 'tartakower',
        title: 'The Tartakower: the freeing ...c5',
        text:
          'Back to Black’s side. In the Tartakower variation Black plays ...b6 and ...Bb7 and keeps the bishop pair; here White has exchanged on f6 and d5, so Black has a bishop on f6 aiming at d4 and a bishop on b7 behind the pawn on d5. The pieces are ready, and one pawn move sets them free.\n\n' +
          'In queen’s pawn openings the freeing break is almost always the c-pawn. Ask what White wants: a calm game, pressure on d5, a fixed target. The break gives Black activity instead.',
        fen: QGD_TARTAKOWER,
        orientation: 'black',
        shapes: ['c7c5', 'f6d4:blue'],
        task: {
          prompt: 'Which break frees Black’s game?',
          moves: ['c5'],
          hint: 'Which pawn can strike at d4, supported by the bishop on f6?',
          success: '**...c5** strikes at d4. If White takes, the bishop on f6 joins in.',
          why: 'Black accepts the risk of hanging pawns on c5 and d5 in return for open lines for both bishops. **...Qe7** and **...c6** are solid too, but they wait, and White uses the time for Qb3 and pressure on d5. The side with the bishops wants the position open: that is why the break comes now.',
          wrong: {
            Qe7: 'A solid main-line move, and fine. But it prepares rather than acts; this step is about the break itself.',
            c6: 'Solid, and the engine rates it about equal, but it is passive: the bishop on b7 stays shut in behind c6 and d5. **...c5** opens its diagonal.',
          },
          failure:
            'This step is about the pawn break: strike at d4, so that both bishops get open lines.',
          reply: 'dxc5',
          replyNote: 'White takes, hoping to leave Black with weak pawns.',
          then: {
            prompt: 'Before you take back on c5, is there something better?',
            moves: ['Bxc3'],
            hint: 'Your bishop on f6 can capture something first.',
            success:
              '**...Bxc3** comes first: White’s queenside pawns are split before Black recaptures on c5.',
            why: 'After bxc3 bxc5 Black has the hanging pawns, but White’s pawns on a2 and c3 are weak too, and the knight that pressed on d5 has gone. The plain **...bxc5** is also fine, but it lets that knight live. Look for an in-between capture every time a recapture seems forced.',
            wrong: {
              bxc5: 'Fine too, and the engine agrees it holds. But first **...Bxc3** damages White’s pawns and removes the knight that pressed on d5.',
              Na6: {
                text: 'The knight eyes c5, but **c6** hits your bishop on b7, and once it moves nothing guards d5: White wins a pawn. Deal with the c5-pawn first.',
                refute: 'c6',
              },
            },
            failure:
              'An in-between capture first: your bishop on f6 can take something before you recapture on c5.',
            reply: 'bxc3',
            replyNote: 'White recaptures, and the pawns on a2 and c3 are now isolated.',
            then: {
              prompt: 'Now take back on c5.',
              moves: ['bxc5'],
              hint: 'Which pawn recaptures and keeps the centre?',
              success:
                '**...bxc5**: the hanging pawns on c5 and d5 control the centre, the b-file is open for a rook, and White’s queenside pawns are isolated.',
              why: 'Hanging pawns are a trade-off: they can become targets, but they control b4, c4, d4 and e4 and give the pieces room. Here the balance is fine, because White’s pawns on a2 and c3 are weak too. Take this into your own games: a freeing break is worth a structural concession when it opens lines for your pieces.',
              failure:
                'White’s pawn on c5 is extra for the moment. Take it back with the pawn that keeps your centre strong.',
            },
          },
        },
      },
      {
        id: 'catalan-plans-at-a-glance',
        title: 'Plans at a glance',
        text:
          '- **Open Catalan** (...dxc4): White points a piece at c4 and wins the pawn back calmly; Black uses the time for ...a6, ...b5 and ...Bb7, then ...c5.\n' +
          '- **Closed Catalan** (...c6 and ...b6): White gains space with e4; Black breaks with ...c5, or ...dxc4 first, before e5 cramps the position.\n' +
          '- **Carlsbad** (the exchange on d5, recaptured with the e-pawn): the minority attack b4, a4 and b5 against c6; Black counters with ...Ne4 and a knight on g6.\n' +
          '- **Tartakower** (...b6 and ...Bb7): the freeing ...c5, accepting hanging pawns for open lines.\n\n' +
          'The Queen’s Gambit repertoires in the Openings section put these plans into move orders.',
        fen: CAT_OPEN,
      },
    ],
  },
  {
    id: 'french-structures',
    title: 'French structures',
    level: 'advanced',
    category: 'Openings',
    summary:
      'The pawn chain of the Advance, the doubled c-pawns of the Winawer and the isolated pawn of the Tarrasch: what each side is playing for in the French Defence, and the breaks that decide it.',
    minutes: 10,
    practiceThemes: ['opening', 'middlegame'],
    steps: [
      {
        title: 'Attack the chain at its base',
        text:
          'After 1. e4 e6 2. d4 d5 3. e5 the centre is locked, and the pawns form chains: d4 and e5 for White, e6 and d5 for Black. The rule for chains is to **attack them at the base**. White’s base is d4, the pawn that holds e5 up: take it away and the whole chain wobbles.\n\n' +
          'So Black’s first moves all aim at d4: a pawn, then a knight, then the queen. Your bishop on c8 is shut in behind e6; that is the price of the French, and the reason Black must play actively.',
        fen: FR_ADVANCE,
        orientation: 'black',
        shapes: ['c7c5', 'd4:red', 'e5:blue'],
        task: {
          prompt: 'Strike at the base of the chain.',
          moves: ['c5'],
          hint: 'Which pawn can attack d4?',
          success:
            '**...c5** attacks d4 at once. If the pawn on d4 ever falls or is exchanged, e5 loses its support.',
          why: 'The other lever, ...f6 against the head of the chain, comes later, once the pieces are ready to use the lines it opens. First d4, because that pawn holds everything up. Developing moves such as **...Bd7** are reasonable, but none of them puts the question to White’s centre. The plan is a sequence: the pawn first, then the pieces behind it.',
          wrong: {
            Nc6: 'The knight blocks the c-pawn, the very pawn you need. In the French the c-pawn goes first, and the knight follows to c6.',
            f6: 'The other lever, but too early: your pieces are not ready to use the lines it opens, and after the exchange on f6 the e6-pawn is a weakness.',
            Bd7: 'Reasonable, since the bishop can later swap itself off via b5, but it does not touch White’s centre. Start with the pawn.',
          },
          failure:
            'Black’s whole plan is to attack d4, the base of White’s chain. Which pawn can do that?',
          reply: 'c3',
          replyNote:
            'White props up d4 with a pawn, so that a capture there can be answered with a pawn and the chain stays whole.',
          then: {
            prompt: 'Bring a piece to bear on d4.',
            moves: ['Nc6'],
            hint: 'Which knight can attack d4 in one move?',
            success:
              '**...Nc6** adds a second attacker on d4: the c5-pawn and the knight, against the pawn on c3 and the queen.',
            why: 'Count attackers and defenders on d4, as you would before any capture: two against two now. White will add the knight on f3, and Black will answer with the queen. As long as Black keeps adding pressure, White’s pieces stay tied to d4 instead of attacking the kingside.',
            wrong: {
              Qb6: 'Just as good, and often played first; the moves usually transpose. Here bring the knight first, and the queen joins next move.',
              cxd4: 'Playable, but it releases the tension early, and the c-file opening helps White as much as you. Keep the pressure on d4.',
            },
            failure: 'Add a piece to the attack on d4: which knight reaches a square that hits it?',
            reply: 'Nf3',
            replyNote: 'White adds a defender: the knight on f3 guards d4 and e5 at the same time.',
            then: {
              prompt: 'Where does the queen join the pressure?',
              moves: ['Qb6'],
              hint: 'Look for a square on the diagonal that runs through c5 to d4, which also eyes the b2-pawn.',
              success:
                '**...Qb6** lines up behind c5 against d4 and attacks b2. The bishop on c1 has to look after b2 before it can develop.',
              why: 'The queen does two jobs: she x-rays d4 through the c5-pawn, so any exchange on d4 brings her straight into the attack, and she ties White’s bishop to b2. **...Bd7** is a fine alternative, the engine’s choice, but it adds no pressure yet. White’s usual answers are Be2, or a3 and b4 to gain space.',
              wrong: {
                Bd7: 'The engine’s favourite and a main line: it prepares ...Qb6 or ...Rc8. But it adds nothing to the pressure on d4 yet, and that is the question here.',
                Nge7: 'Good too: the knight is on its way to f5. But it needs two moves to hit d4, and the queen joins at once.',
                g5: {
                  text: 'The idea of chasing the knight from f3 exists, but here the pawn is simply lost: **Bxg5**, and your kingside is loosened for good.',
                  refute: 'Bxg5',
                },
              },
              failure:
                'Look for a queen move to the diagonal that runs through c5 to d4; from there she also eyes b2.',
            },
          },
        },
      },
      {
        id: 'exchange-on-d4',
        title: 'Exchange at the right moment',
        text:
          'Play went on 6. a3 Nh6 7. b4. White gains space on the queenside and now threatens **bxc5**: the c5-pawn could not be taken back, because the queen would be lost to dxc5. Meanwhile Black’s knight has reached h6, on its way to f5, the best square for hitting d4.\n\n' +
          'This is a moment where the tension cannot be kept. Ask what White wants: to win the c5-pawn or to lock the queenside. The answer is to release the tension yourself, on your terms.',
        fen: FR_ADVANCE_3,
        orientation: 'black',
        shapes: ['c5d4', 'h6f5:blue', 'b4c5:red'],
        task: {
          prompt: 'White threatens to take on c5. What do you do?',
          moves: ['cxd4'],
          hint: 'The c5-pawn is attacked twice. Can you exchange it before White takes it?',
          success:
            '**...cxd4** releases the tension before White can win the pawn, and opens the c-file. After the recapture, the d4-pawn has lost its pawn support for good.',
          why: 'Every other move costs something: **...c4** keeps the pawn but locks the queenside and gives White a free hand there, and **...Nf5** allows **bxc5**, when ...Qxc5 walks into **dxc5**. Timing is the point: the tension was Black’s asset while it lasted, and the moment it could be broken in White’s favour, Black broke it first.',
          wrong: {
            c4: 'This keeps the pawn, but the queenside locks up: White can play **a4** and later b5 at leisure, and your queen on b6 has nothing to bite on.',
            Nf5: {
              text: 'The knight arrives a move too early: **bxc5** wins the c5-pawn, because ...Qxc5 walks into **dxc5**.',
              refute: 'bxc5',
            },
            cxb4: {
              text: 'Taking the other way opens lines for White: **Bxh6** first breaks up your kingside pawns, and then the a-pawn takes back on b4.',
              refute: 'Bxh6',
            },
            Bd7: FR_IGNORES_BXC5,
            a6: FR_IGNORES_BXC5,
            g6: FR_IGNORES_BXC5,
            Rg8: FR_IGNORES_BXC5,
            Kd8: FR_IGNORES_BXC5,
          },
          failure:
            'The c5-pawn is about to be taken. Exchange it while the exchange still helps you.',
          reply: 'cxd4',
          replyNote:
            'White recaptures with the pawn. The d4-pawn stands alone now: no white pawn can ever defend it again.',
          then: {
            prompt: 'Now the knight. Where does it hit d4 hardest?',
            moves: ['Nf5'],
            hint: 'Your knight on h6 is attacked by the bishop on c1, and d4 needs a third attacker. One move does both.',
            success:
              '**...Nf5** attacks d4 a third time: two knights and the queen, against the knight on f3 and the queen. It also leaves h6, where the bishop on c1 could take it.',
            why: 'Three attackers against two defenders, so White must spend a move on **Bb2** or **Be3** just to hold d4. That is the Advance French from Black’s side: d4 is a permanent target and White’s pieces become defenders. **...Bd7** develops, but it gives White time, and **Bxh6** would wreck your kingside pawns.',
            wrong: {
              Bd7: 'It develops, but it gives White a free move to defend d4, or to take on h6 and double your pawns. The knight belongs on f5 now.',
              g5: {
                text: 'Gaining space with the g-pawn, but the pawn is simply lost: **Bxg5**, and your kingside is full of holes. The knight on h6 has a better square.',
                refute: 'Bxg5',
              },
            },
            failure:
              'Your knight on h6 can be taken by the bishop on c1, and d4 needs a third attacker. Which move does both jobs?',
          },
        },
      },
      {
        id: 'f6-break',
        title: 'The ...f6 break',
        text:
          'A different Advance line. Black has developed with ...Bd7, ...Nge7 and ...Ng6, and White has castled and played g3. The knight on g6 already looks at e5. Now the second lever comes into play: **...f6**, attacking the chain at its head.\n\n' +
          'It is right only when the pieces are ready to use what opens. Here they are: after an exchange on f6 the queen recaptures, the f-file opens towards White’s king, and e5 becomes a square for Black’s knights. Played too early, ...f6 only weakens e6.',
        fen: FR_F6,
        orientation: 'black',
        shapes: ['f7f6', 'e5:red'],
        task: {
          prompt: 'The pieces are ready. Which lever now?',
          moves: ['f6'],
          hint: 'This time, attack the head of the chain.',
          success:
            '**...f6** attacks e5, the head of White’s chain. If White takes, the f-file opens for Black.',
          why: '**...cxd4** and **...Be7** are sensible too, but they keep the position as it is, and White’s pieces get time to regroup. With ...f6 Black asks a question White cannot ignore: take on f6 and give up the e5-square, or allow ...fxe5 and lose the head of the chain.',
          wrong: {
            cxd4: 'Playable and close in value. But it releases the pressure on d4 without asking White anything new; this step is about the second lever.',
            Be7: 'A sensible developing move, close in value. But it waits, and your pieces are already in place for ...f6.',
          },
          failure:
            'This step is about the second pawn lever: attack the head of White’s chain on e5.',
          reply: 'exf6',
          replyNote:
            'White takes, the usual answer: leaving the pawn on e5 would let Black capture there and break up the centre.',
          then: {
            prompt: 'How do you recapture?',
            moves: ['Qxf6'],
            hint: 'Which recapture brings a piece into play with a threat?',
            success:
              '**...Qxf6** develops the queen with a threat: she hits the knight on f3, the piece that guards d4.',
            why: 'Now Black has the half-open f-file, the e5-square for a knight, and pressure on d4. The price is a backward pawn on e6, which is why the timing mattered. **...gxf6** keeps more pawns in the centre, but it loosens your king and leaves the queen at home.',
            wrong: {
              gxf6: 'Possible, but it loosens your king and the queen stays at home. **...Qxf6** develops with a threat to the knight on f3.',
              cxd4: {
                text: 'Recapture first: the pawn on f6 is attacking g7, and **fxg7** takes it.',
                refute: 'fxg7',
              },
            },
            failure:
              'White’s pawn on f6 has to be taken back. Which recapture also brings a piece into play?',
          },
        },
      },
      {
        id: 'winawer',
        title: 'The Winawer: go for the dark squares',
        text:
          'Now the Winawer: 1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7. Black has given up the dark-squared bishop to double your c-pawns, and the dark squares around Black’s king, g7 above all, have lost their defender. You have the bishop pair and a big centre; Black has pressure on c3 and d4 and a lead in development.\n\n' +
          'Your trumps are on the kingside, so use them at once, while Black’s king is still in the centre.',
        fen: FR_WINAWER,
        shapes: ['d1g4', 'g4g7:blue', 'c3:red'],
        task: {
          prompt: 'Which move goes straight for the weakened dark squares?',
          moves: ['Qg4'],
          hint: 'Which pawn has lost its defender? Your queen can attack it in one move.',
          success:
            '**Qg4** attacks g7, which lost its guard when the bishop left. Black has to decide at once how to meet the threat.',
          why: 'This is the critical test of the Winawer. **h4**, **Nf3** and **a4** are fine moves too, and the engine even prefers h4, but Qg4 asks the question immediately: defend g7, castle into the attack, or give the pawn for counterplay. The general rule: when your opponent gives up a bishop, attack the squares it used to guard.',
          wrong: {
            h4: 'A strong modern line, the engine’s choice: the pawn heads for h5 and h6 to loosen the kingside. This step follows the classical **Qg4**, which hits g7 at once.',
            Nf3: 'A calm, good move: it develops and supports d4. But it lets Black finish developing; this step is about using the dark squares straight away.',
            a4: 'A positional line that aims the bishop at a3 and the dark squares on the other wing. Good, but this step is about g7.',
          },
          failure:
            'Look at the squares the bishop on b4 used to guard. Which piece can attack one of them right now?',
          reply: 'Qc7',
          replyNote:
            'Black offers the g-pawn: the queen hits e5, and after ...cxd4 the c-file opens against c3. Castling was the calmer alternative.',
          then: {
            prompt: 'Take what is offered?',
            moves: ['Qxg7'],
            hint: 'Is anything defending g7?',
            success: '**Qxg7** wins a pawn and attacks the rook on h8.',
            why: 'This is the Poisoned Pawn variation, and the engine rates the capture best. White takes pawns on the kingside; Black gets the c-file, play against c3 and d4, and a white king that will stay in the centre for a long time. Whichever side you play, know the plans: this is a race, not a quiet game.',
            wrong: {
              Bd3: 'Good too, and close in value: the bishop develops and g7 stays attacked. This step takes the pawn now.',
            },
            failure: 'g7 is attacked and nothing defends it. Count, and take what is there.',
            reply: 'Rg8',
            replyNote: 'The rook escapes and takes the g-file, from where it will chase the queen.',
            then: {
              prompt: 'The queen is attacked. Where does she go?',
              moves: ['Qxh7'],
              hint: 'Is there a safe square that also takes something?',
              success:
                '**Qxh7** takes a second pawn and gets the queen off the g-file. White now has a passed h-pawn.',
              why: 'The queen had to move anyway, and h7 is the retreat that wins a second pawn: the engine prefers it to every other square. Now both sides race: White pushes the passed h-pawn, Black takes on d4 and c3 and plays in the centre. It is the critical line of the Winawer, playable for both sides if you know the plans.',
              wrong: {
                Qh6: 'A safe square, but it wins nothing, and Black’s counterplay in the centre comes anyway. If the queen must move, let her take the h-pawn.',
              },
              failure: 'The queen is attacked by the rook. Find the retreat that takes a pawn.',
              reply: 'cxd4',
              replyNote:
                'Black opens the c-file and hits c3. From here it is a race: your passed h-pawn against Black’s play in the centre.',
            },
          },
        },
      },
      {
        id: 'tarrasch',
        title: 'The Tarrasch: blockade the isolated pawn',
        text:
          'The Tarrasch: 1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5. No chains here: the centre opens, and Black ends up with an **isolated d-pawn**, free piece play in return for a pawn that no other pawn can ever defend.\n\n' +
          'Your plan against it is the classic one: **blockade** the square in front of the pawn, trade pieces (every trade weakens the pawn and reduces Black’s activity), and attack d5 later. The best blockader is a piece that no pawn can chase away.',
        fen: FR_TARRASCH,
        shapes: ['d4:green', 'd5:red', 'b3d4:blue', 'f3d4:blue'],
        task: {
          prompt: 'Which piece goes to the blockade square?',
          moves: ['Nbd4', 'Nfd4'],
          hint: 'Name the square in front of the isolated pawn. Which of your pieces can land there in one move?',
          success:
            'A knight lands on d4, right in front of the isolated pawn. No black pawn can ever chase it from there.',
          why: 'A knight is the ideal blockader: it stops the pawn, and from d4 it also eyes c6, e6, b5 and f5. Other moves are fine, and **h3**, **Bd3**, **c3** or **Be3** keep a small edge too, but the knight on d4 is the heart of the plan, and the rest of your moves will support it. Against an isolated pawn: blockade, trade, then attack.',
          wrong: {
            h3: 'A useful move, and the engine likes it: it stops ...Bg4. But it does nothing about the pawn; the blockade comes first.',
            Bd3: 'A good developing move, close in value, but it does not touch the pawn. The square in front of it is the key.',
          },
          failure:
            'This step is about the blockade: find the square in front of Black’s isolated pawn, and put a knight on it.',
        },
      },
      {
        id: 'french-summary',
        title: 'Three structures, three plans',
        text:
          '- **Advance** (3. e5): Black attacks the base d4 with ...c5, ...Nc6, ...Qb6 and ...Nf5, then the head e5 with ...f6; White gains space with c3, a3 and b4 and defends d4 with pieces.\n' +
          '- **Winawer** (3. Nc3 Bb4): doubled c-pawns against the dark squares; Qg4 and the kingside for White, the c-file and pressure on c3 and d4 for Black.\n' +
          '- **Tarrasch** (3. Nd2): an open centre with an isolated d-pawn; blockade on d4 and trade pieces against Black’s activity.\n\n' +
          'The French repertoire in the Openings section trains the moves; this lesson is the why.',
        fen: FR_ADVANCE,
      },
    ],
  },
  {
    id: 'exchange-sacrifices-2',
    title: 'Exchange sacrifices II',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Beyond the tactical exchange sacrifice: ...Rxc3 in the Sicilian, wrecking the pawn structure, destroying the king’s cover, the recapture that is not there, and the sacrifice that simplifies into a won ending.',
    minutes: 9,
    practiceThemes: ['sacrifice', 'capturingDefender'],
    steps: [
      {
        title: 'The Sicilian ...Rxc3',
        text:
          'The most famous exchange sacrifice: a black rook takes the knight on c3. In Sicilian structures that capture often pays for itself in pawns and squares. Here it pays at once, because the knight on c3 is the only piece holding e4.\n\n' +
          'Look at what that knight does: it guards e4, and e4 is attacked by your knight on f6. Remove the defender, and the pawn falls with a fork. But before you give up a rook, calculate the whole line and count what comes back.',
        fen: EX_SICILIAN,
        orientation: 'black',
        shapes: ['c8c3', 'f6e4:blue', 'e4:red'],
        task: {
          prompt: 'Which capture removes the defender of e4?',
          moves: ['Rxc3'],
          hint: 'Which white piece protects the e4-pawn? Can you take it?',
          success: '**...Rxc3** gives the rook for the knight that guarded e4.',
          why: 'The point is the follow-up: with the knight gone, **...Nxe4** hits the rook on c3 and the bishop on g5 at the same time. Without the sacrifice, ...Nxe4 would just lose a piece to **Nxe4**. Exchange sacrifices are easiest to judge when, as here, the material comes straight back.',
          wrong: {
            Nxe4: {
              text: 'The right target, the wrong order: the knight on c3 still guards e4, and **Nxe4** wins your knight for a pawn.',
              refute: 'Nxe4',
            },
          },
          failure: 'The knight on c3 is the only defender of e4. What happens if it disappears?',
          reply: 'Rxc3',
          replyNote:
            'White takes back with the rook, the natural recapture. Now the rook stands on c3, where a knight can fork it.',
          then: {
            prompt: 'Now collect.',
            moves: ['Nxe4'],
            hint: 'With the defender gone, what can your knight take, and what will it attack from there?',
            success: '**...Nxe4** wins the pawn and forks the rook on c3 and the bishop on g5.',
            why: 'White cannot save both pieces. The best is to save the bishop and give the rook back, after which Black has won a pawn and keeps the better pieces. That is the exchange sacrifice at its most concrete: you give a rook, and a move later the board pays you back with interest.',
            failure:
              'The defender of e4 has gone. Which capture wins the pawn and attacks two pieces?',
            reply: 'Bd2',
            replyNote:
              'White saves the bishop and protects the rook with it, so that ...Nxc3 can be met by Bxc3.',
            then: {
              prompt: 'Take the exchange back.',
              moves: ['Nxc3'],
              hint: 'The rook on c3 is protected, but it is still worth more than your knight.',
              success:
                '**...Nxc3**, and after **Bxc3** Black has won a clean pawn, with the same pieces on both sides.',
              why: 'Count it all: rook for knight, then a pawn, then knight for rook. Black comes out a pawn up with the more active pieces, and the engine rates Black clearly winning. When a sacrifice wins the material straight back, the only question is whether you counted every capture.',
              failure: 'The rook on c3 is attacked by your knight. Take it.',
            },
          },
        },
      },
      {
        title: 'Wreck the structure',
        text:
          'The same capture with a different purpose. White is a pawn up, and the bishop on e4 is White’s best piece, but only the knight on c3 protects it. Take the knight, and the bishop hangs: Black gets two minor pieces for the rook, and White’s queenside pawns are split, with a lonely pawn on a2 and a weak one on c3.\n\n' +
          'Before you sacrifice for structure, check that the material comes back. Here it does, at once.',
        fen: EX_STRUCTURE,
        orientation: 'black',
        shapes: ['c8c3', 'e4:red'],
        task: {
          prompt: 'Which capture leaves the bishop on e4 without a defender?',
          moves: ['Rxc3'],
          hint: 'What protects the bishop on e4? Can you remove it?',
          success:
            '**...Rxc3** removes the bishop’s only defender. Whichever way White recaptures, the bishop on e4 falls next.',
          why: 'The tempting **...Nxe4** first does not work: **Nxe4** just trades knight for bishop, and the white knight lands on e4 and hits your bishop on d6. Remove the defender first, then take what it was defending. Defender first, target second: the same order as in the Sicilian example, and worth checking whenever a piece is guarded only once.',
          wrong: {
            Nxe4: {
              text: 'Wrong order: the knight on c3 simply takes back, **Nxe4**, and the white knight now attacks your bishop on d6.',
              refute: 'Nxe4',
            },
          },
          failure: 'The bishop on e4 has one defender. Take the defender first.',
          reply: 'bxc3',
          replyNote:
            'White recaptures with the pawn and keeps the queen on b3. The pawns on a2 and c3 are now cut off from each other.',
          then: {
            prompt: 'Collect the bishop.',
            moves: ['Nxe4'],
            hint: 'The bishop on e4 has lost its guard.',
            success:
              '**...Nxe4**: two minor pieces for the rook, and White’s queenside pawns are broken.',
            why: 'Material is roughly level, two minor pieces against rook and pawn, but the engine rates Black clearly better: the knight on e4 and the two bishops are active, White’s bishop on c1 is still at home, and c3 is a target. In the middlegame, two active minor pieces are usually worth more than a rook.',
            failure: 'The defender has gone. Which capture wins the bishop on e4?',
          },
        },
      },
      {
        title: 'Destroy the king’s cover',
        text:
          'Against a king, an exchange is cheap. You are two pawns down, so slow moves will not do. Look at Black’s king instead: your queen on g6 and knight on g5 both aim at h7, and the knight on f6 is the only piece that keeps your queen out of there.\n\n' +
          'When you attack the king, count defenders, not material. Remove the one that matters, and the checks come by themselves.',
        fen: EX_KING,
        shapes: ['f1f6', 'g6h7:blue', 'g5h7:blue'],
        task: {
          prompt: 'Which capture tears the cover away?',
          moves: ['Rxf6'],
          hint: 'Which black piece stops your queen from landing on h7?',
          success:
            '**Rxf6** gives the rook for the knight that guarded h7. Now **Qh7+** is coming.',
          why: 'Black’s best is to take back, but then the queen gets in with check, and every check drives the king further into the open. Every other move leaves you clearly worse, two pawns down with nothing to show. In a king attack, the question is not whether the sacrifice is sound in material, but whether the king survives the checks that follow.',
          wrong: {
            'Qh7+': {
              text: 'Too early: the knight on f6 still guards h7 and simply takes the queen.',
              refute: 'Nxh7',
            },
            h5: {
              text: 'This defends your queen, but the knight on g5 loses its pawn support: **...Qxg5** wins it, and your attack is gone.',
              refute: 'Qxg5',
            },
            Nce4: {
              text: 'The knight on e4 is simply taken by the d5-pawn: **...dxe4**. Remove the defender of h7 instead.',
              refute: 'dxe4',
            },
          },
          failure:
            'The knight on f6 is the only piece that stops your queen from reaching h7. Remove it.',
          reply: 'Rxf6',
          replyNote: 'Black takes back; nothing else holds. Now look at h7.',
          then: {
            prompt: 'Start the checks.',
            moves: ['Qh7+'],
            hint: 'Your knight on g5 guards one square right next to the king.',
            success:
              '**Qh7+**: the queen lands next to the king, protected by the knight on g5. The king has to run to f8.',
            why: 'Forcing moves first: Black has one legal reply, so there is nothing to calculate but the next check. The knight on g5 is the quiet hero of the attack, guarding h7 now and f7 a move later.',
            failure:
              'Look for a check: your knight on g5 protects a square right next to the black king.',
            reply: 'Kf8',
            replyNote: 'The only move. The king steps towards the centre, away from its defenders.',
            then: {
              prompt: 'Keep checking.',
              moves: ['Qh8+'],
              hint: 'Which check drives the king further into the open?',
              success: '**Qh8+** checks along the back rank, and the king must step up to e7.',
              why: 'Each check takes a square away: the king cannot go back along the eighth rank and cannot hide on f7, where your knight is waiting. Up on e7 it is out in the open, and the pawn on g7 has lost its last guard.',
              wrong: {
                Bf5: {
                  text: 'This throws the bishop away: **...Qxf5** takes it, and your attack runs out of pieces. Keep checking instead.',
                  refute: 'Qxf5',
                },
              },
              failure:
                'Keep the checks coming: which square lets the queen check along the back rank?',
              reply: 'Ke7',
              replyNote: 'Forced again. The king stands on e7, and nothing defends g7 any more.',
              then: {
                prompt: 'Collect, with check.',
                moves: ['Qxg7+'],
                hint: 'Which pawn has just lost its defender?',
                success:
                  '**Qxg7+** takes the pawn with check. After Rf7 Qxf7+ White is a knight up for a pawn, with Black’s king in the open.',
                why: 'Four forcing moves turned an exchange down into a piece up. That is the pattern to look for when the enemy king has a single defender: give the exchange to remove it, then check until the king runs out of shelter. Calculate to the end of the checks before you start: here every Black reply was forced.',
                failure: 'The king has left g7 alone. Take the pawn, with check.',
              },
            },
          },
        },
      },
      {
        title: 'When the recapture is not there',
        text:
          'Sometimes the exchange sacrifice is no sacrifice at all. Your queen on g6 is attacked by the black queen on e4, you are a pawn down, and the obvious move is to trade queens. Look closer first: the pawn on g7 stands between your queen and the black king, so it is **pinned** and cannot capture anything.\n\n' +
          'That changes what the knight on f6 is worth. Ask which piece could take back on f6, and whether it is free to do so.',
        fen: EX_PIN,
        shapes: ['f1f6', 'g6g8:red', 'g7:red'],
        task: {
          prompt: 'Find the capture that wins material.',
          moves: ['Rxf6'],
          hint: 'Who could take back on f6? Check whether that piece is free to move.',
          success:
            '**Rxf6** wins the knight: ...gxf6 is illegal because of the pin, and the rook on f6 now protects your queen.',
          why: 'Black’s best is to trade queens or to give a check, and either way the knight has gone: after ...Qxg6 Rxg6 White is a piece up for a pawn. It looks like an exchange sacrifice, rook for knight, but the recapture is not there. Whenever a capture can only be answered by a pinned piece, look at it twice.',
          wrong: {
            Qxe4: {
              text: 'Trading queens is natural, but after **...Nxe4** the knight escapes with tempo on your bishop, and you are still a pawn down.',
              refute: 'Nxe4',
            },
            Bxf6: {
              text: 'The right target with the wrong piece: your queen on g6 is still attacked and now nothing protects her, so Black takes her.',
              refute: 'Qxg6',
            },
          },
          failure:
            'The g7-pawn is pinned to the king, so it cannot recapture. Which capture takes advantage and also keeps your queen protected?',
        },
      },
      {
        title: 'Simplify into a won ending',
        text:
          'In the endgame an exchange sacrifice can be the quickest way to simplify. Material is level: rook, bishop and knight each, and six pawns each. Your rook on e3 is attacked by the white king, so the natural move is to retreat it.\n\n' +
          'Look at the geometry first. If White’s rook ever stood on c3, a knight on e4 would attack it and the king on f2 at the same time. Can you make it go there?',
        fen: EX_ENDGAME,
        orientation: 'black',
        shapes: ['e3c3', 'f6e4:blue', 'f2:red'],
        task: {
          prompt: 'Which capture sets up a fork?',
          moves: ['Rxc3'],
          hint: 'Lure the white rook to a square your knight can attack with check.',
          success:
            '**...Rxc3** gives the rook for the knight. If White takes back, the rook lands on c3, in range of your knight.',
          why: 'It works because of what follows: after Rxc3 Ne4+ the king must move and the rook on c3 falls. If White does not take back, Black is a knight up anyway. In the endgame this is the cleanest kind of exchange sacrifice: you give the rook only to win it straight back, and what remains is easy to win.',
          wrong: {
            'Ne4+': {
              text: 'The fork comes too early: White’s rook is still on c1, and your rook on e3 is loose. The king takes it.',
              refute: 'Kxe3',
            },
            Re8: 'The safe retreat, and the position stays level. But you miss a combination: the fork only needs White’s rook on c3, and a capture can put it there.',
          },
          failure:
            'Your rook on e3 is attacked by the king. Before retreating, look for a capture that lures White’s rook to a square your knight can fork.',
          reply: 'Rxc3',
          replyNote: 'White takes back, and the rook now stands on c3, a knight’s jump from e4.',
          then: {
            prompt: 'Now the fork.',
            moves: ['Ne4+'],
            hint: 'Which knight move gives check and attacks c3?',
            success: '**...Ne4+** checks the king and attacks the rook on c3.',
            why: 'A knight check cannot be blocked, so the king has to move and the rook falls. Count the result: Black gave a rook for a knight, then takes the rook back for nothing, and ends up a knight ahead.',
            failure:
              'Look for a knight move that checks the king and attacks the rook at the same time.',
            reply: 'Ke3',
            replyNote:
              'The king steps up, as close to the action as it can get. The rook is lost all the same.',
            then: {
              prompt: 'Collect the rook.',
              moves: ['Nxc3'],
              hint: 'The rook on c3 is attacked.',
              success:
                '**...Nxc3**: Black is a knight up in an ending of bishop and knight against bishop.',
              why: 'With the rooks gone, an extra piece is decisive: bring the king to the centre, and the extra knight will win pawns. That is the point of exchange sacrifices in the endgame: they turn a complicated position into a simple won one.',
              failure: 'The rook on c3 is attacked by your knight. Take it.',
            },
          },
        },
      },
      {
        title: 'When to give the exchange',
        text:
          '- To **remove a defender**: of a pawn (the Sicilian example), of a piece (the bishop on e4) or of the king (the knight on f6), and then collect.\n' +
          '- For the **structure**: split pawns and active minor pieces are worth a lot of exchange.\n' +
          '- To **simplify**: give the rook when a fork wins it straight back.\n' +
          '- When the recapture is **illegal**, it is no sacrifice at all.\n\n' +
          'The rule of thumb: a rook is worth about a minor piece and one and a half pawns. Get the pawns, the squares or the king, and the exchange was cheap.',
        fen: EX_SICILIAN,
      },
    ],
  },
  {
    id: 'calculation-3',
    title: 'Calculation III: to the end of the line',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'Long forcing lines, pawn races counted to the last move, quiet moves inside a combination, and the check at the end that decides the race. Calculate until the position is quiet.',
    minutes: 11,
    practiceThemes: ['quietMove', 'veryLong', 'advancedPawn'],
    steps: [
      {
        title: 'Count to the end',
        text:
          'A pawn race is decided by counting, and by what happens after both pawns queen. Here you can trade rooks with a capture on d3, and the pawn ending that follows is a race: your c-pawn against a white g-pawn. Both will queen. What decides it is who queens first, and what the first new queen can do.\n\n' +
          'Strong players do not trade into a pawn ending on a feeling. They count it to the last move, and then one more. Let’s count it together, a move at a time.',
        fen: CALC_RACE,
        orientation: 'black',
        shapes: ['c3d3', 'c5c1:blue', 'g2g8:red'],
        task: {
          prompt: 'Which capture starts the race?',
          moves: ['Rxd3+'],
          hint: 'Your rook can take a pawn with check. What happens once the rooks come off?',
          success: '**...Rxd3+** takes a pawn with check and offers the rook trade.',
          why: 'Once the rooks are gone it is pure counting, and that count has to be done before this move, not after it. Every other move keeps the rooks on, and the engine rates them all about level. In a race, the side that has calculated it to the end chooses the moment it starts.',
          failure:
            'Look for a capture with check that forces the rooks off, then count the race that follows.',
          reply: 'Rxd3+',
          replyNote: 'White takes back with check: the rooks are coming off.',
          then: {
            prompt: 'Take back.',
            moves: ['Kxd3'],
            hint: 'Only one piece can recapture.',
            success:
              '**...Kxd3**, and it is a pawn ending: your king is in the centre, close to your c-pawn.',
            why: 'Now count. Your c-pawn needs four moves to queen. White will try to make a passed pawn on the kingside, and that pawn will also need several moves. Who moves first matters, and so does where each queen appears. Keep counting through the next moves; the line is forced.',
            failure: 'The white rook on d3 is checking your king. Take it.',
            reply: 'g4',
            replyNote:
              'White creates a passed pawn: if Black takes, the h-pawn recaptures and the g-pawn runs.',
            then: {
              prompt: 'How do you answer g4?',
              moves: ['hxg4+'],
              hint: 'Take the pawn, and notice that it comes with check.',
              success:
                '**...hxg4+** takes with check. After the recapture White has a passed g-pawn, and the race is on.',
              why: 'Every other move throws the win away. Now count: your c-pawn needs four moves, the white g-pawn will need four as well, and it is your move. So you queen first, and then White queens with you to move. That last detail decides the game, as you will see.',
              failure:
                'White’s g-pawn is attacking yours. Take it, and do the counting afterwards.',
              reply: 'hxg4',
              replyNote: 'The g-pawn is passed. It needs four moves to queen; so does yours.',
              then: {
                prompt: 'Run.',
                moves: ['c4'],
                hint: 'Every tempo counts. Which pawn should move?',
                success:
                  '**...c4**: the c-pawn runs, and White’s g-pawn follows one step behind it.',
                why: 'The race runs c4 g5 c3 g6 c2 g7 c1=Q g8=Q, and then it is your move with queens on both sides. A king move now would cost the tempo you need. Before you start a race, count it to the position after both sides queen: that is where it is decided.',
                failure:
                  'Count the moves: your c-pawn needs four, and every move spent elsewhere hands White the race.',
              },
            },
          },
        },
      },
      {
        id: 'check-at-the-end',
        title: 'The check at the end',
        text:
          'Both pawns ran: c4 g5 c3 g6 c2 g7 c1=Q g8=Q. Queen against queen, kings in the open, and it is your move. This is the position you had to see before trading rooks. Many players stop counting once both sides have queened; strong players look for the first check.\n\n' +
          'Look at the geometry: White’s king on f3 and queen on g8. A check that forces the king onto the g-file, or a check along it, would win the queen.',
        fen: CALC_RACE_3,
        orientation: 'black',
        shapes: ['c1f1', 'g8:red', 'f3:red'],
        task: {
          prompt: 'Find the check that sets up a skewer.',
          moves: ['Qf1+'],
          hint: 'Which check leaves the white king only squares on the g-file?',
          success:
            '**...Qf1+**: the king has only g3 and g4, both on the g-file, the same file as its queen on g8.',
          why: 'This is the only winning move. A check that drives the king onto a line with its own queen sets up a skewer: whatever the king does, the queen behind it falls. Look for it every time both sides have just queened, before you look at anything else.',
          failure: 'Look for a check after which the white king and queen stand on the same line.',
          reply: 'Kg3',
          replyNote: 'The king steps onto the g-file. **Kg4** would meet the same answer.',
          then: {
            prompt: 'Now win the queen.',
            moves: ['Qg1+'],
            hint: 'The king and the queen stand on the same file.',
            success:
              '**...Qg1+** checks along the g-file. When the king steps aside, the queen on g8 is yours.',
            why: 'This is the skewer: the check first, the capture second. It only works because Black queened first and so also gave the first check. That single tempo, counted back on the first move, was the value of the whole race.',
            failure: 'The king and the queen are on the same file. Check along it.',
            reply: 'Kf4',
            replyNote: 'The king has to leave the g-file, and the queen behind it is left alone.',
            then: {
              prompt: 'Take it.',
              moves: ['Qxg8'],
              hint: 'The queen on g8 is undefended.',
              success: '**...Qxg8**: queen against a bare king, and the game is won.',
              why: 'Look back at the whole line: a rook trade, a pawn race of four moves each, and a skewer at the end. None of it was difficult move by move; the skill was seeing, before the first capture, that the race ended with Black to move and a check available.',
              failure: 'The white queen on g8 is unprotected. Take it.',
            },
          },
        },
      },
      {
        id: 'breakthrough',
        title: 'The breakthrough',
        text:
          'Your king is far away on e1, Black’s king is deep in your camp on g2, and the pawns look blocked. But look at the h-file: Black’s king is a long way from h8. If you could make a passed h-pawn, nothing would catch it.\n\n' +
          'The tool is a breakthrough: give up a pawn so that another one can pass. Before you play it, count: how many moves does the new passed pawn need, and can the black king get into its square in time?',
        fen: CALC_BREAK,
        shapes: ['g3g4', 'h4h5:blue', 'h5h8:blue'],
        task: {
          prompt: 'How do you make a passed pawn on the h-file?',
          moves: ['g4'],
          hint: 'Offer a pawn so that the h-pawn gets a clear road.',
          success:
            '**g4** offers the g-pawn. If Black takes, **h5** creates a passed h-pawn three steps from queening.',
          why: 'Count it: after hxg4 h5 the pawn needs three moves, and the black king on g2 is outside its square, too far away to reach h8 in time. Every other move loses: a king move such as **Ke2** is too slow, and Black’s king and pawns take over. Breakthroughs need exact counting, but they are often the only winning idea in a blocked pawn ending.',
          wrong: {
            Ke2: {
              text: 'Defending f2 looks sensible, but it is too slow: Black’s pawns roll forward, and the engine rates the ending lost for you.',
              refute: 'f5',
            },
          },
          failure:
            'Look for a pawn move that gives up a pawn so that another one becomes passed, far from the black king.',
          reply: 'hxg4',
          replyNote:
            'Black takes. Leaving the pawn alone was no better: then you take on h5, and the h-pawns run anyway.',
          then: {
            prompt: 'Now the pawn that runs.',
            moves: ['h5'],
            hint: 'Which pawn has a free road to h8?',
            success:
              '**h5**: three more moves to h8, and the black king on g2 is outside the pawn’s square.',
            why: 'The rule of the square settles it: draw the square from the pawn to the queening rank, and if the defending king cannot step into it, the pawn queens. Black’s own pawns are too slow to matter. Do not stop to defend with **Ke2**: the win is gone after that.',
            wrong: {
              Ke2: {
                text: 'Too slow: the h-pawn had to run at once. Black’s pawns get going with **...f5** and the game ends level.',
                refute: 'f5',
              },
            },
            failure:
              'One pawn has a free road to the eighth rank. Push it before Black’s king or pawns can interfere.',
          },
        },
      },
      {
        id: 'simplify-when-counted',
        title: 'Simplify only when it is counted',
        text:
          'Your bishop can take the rook on c3, and after the king takes back it is a pawn ending: your king and two pawns against king and two pawns. Any other move loses your b-pawn to **...Rc4**. But a pawn ending is the most concrete ending there is, and one tempo decides it, so count before you trade.\n\n' +
          'Your king on f5 stands ready to escort the e-pawn, far from Black’s king. Black’s queenside pawns will try to decoy your b-pawn. Count both races.',
        fen: CALC_SIMPLIFY,
        shapes: ['d4c3', 'e3e8:blue', 'a6a5:red'],
        task: {
          prompt: 'Is the pawn ending won? If so, go into it.',
          moves: ['Bxc3'],
          hint: 'The rook on c3 is attacked by your bishop. What happens to your e-pawn after the trade?',
          success:
            '**Bxc3** gives the bishop for the rook. After the king recaptures it is a pawn ending, with you to move.',
          why: 'Here the alternative is bad anyway: after any other move, ...Rc4 wins your b-pawn and Black’s pawns roll. But in other positions the same decision is free, and then only counting tells you whether to trade. The habit: before every trade into a pawn ending, count the race to the end.',
          failure:
            'The rook on c3 is attacked by your bishop. Take it, and count the pawn ending that follows.',
          reply: 'Kxc3',
          replyNote: 'The king takes back. It is close to your b-pawn and far from your e-pawn.',
          then: {
            prompt: 'Which pawn do you push?',
            moves: ['e4'],
            hint: 'Which of your pawns is out of the black king’s reach?',
            success:
              '**e4**: the e-pawn heads for e8 with your king beside it. Black’s king on c3 cannot get near it in time.',
            why: 'Taking on b4 costs the black king time, and the e-pawn, escorted by your king, simply walks in. Black’s best is the decoy **...a5**, to make your b-pawn take so that Black’s b-pawn can run. Every other white move throws the win away: this is the only one.',
            failure:
              'Look for the pawn that Black’s king cannot reach, and push it while your king escorts it.',
            reply: 'a5',
            replyNote:
              'The best defence, a decoy: if your b-pawn takes, Black’s b-pawn is free to run.',
            then: {
              prompt: 'Take, or push on?',
              moves: ['bxa5'],
              hint: 'If you ignore the a-pawn, it takes on b4. If you take, which of your pawns becomes a runner?',
              success:
                '**bxa5** gives you a passed a-pawn too. After ...b4 both sides run: a6 b3 a7 b2 a8=Q b1=Q, and you queen first.',
              why: 'Taking is the only winning move. Both pawns run, you queen first, and you keep the e-pawn with your king beside it, so the queen ending is won, though it takes care. That is the full count, and it had to be done before **Bxc3**: after the trade there was no way back.',
              wrong: {
                e5: {
                  text: 'Racing on looks natural, but **...axb4** gives Black two connected passed pawns on b4 and b5, and they are fast enough to hold the draw. Take on a5 first.',
                  refute: 'axb4',
                },
              },
              failure:
                'Black’s a-pawn is attacking your b-pawn. Count what happens if you take it, and what happens if you do not.',
            },
          },
        },
      },
      {
        id: 'quiet-move',
        title: 'The quiet move',
        text:
          'Black is a bishop up for a pawn, and your attack on the h-file has stalled: the rook on h3 and the queen on g4 point at the black king on g7, but no check works yet. The natural moves are captures and checks, and none of them gets through.\n\n' +
          'The strongest moves inside a combination are often quiet. Ask what you would do with one more piece in the attack, then find the move that brings it there. Your rook on d1 is doing nothing.',
        fen: CALC_QUIET,
        shapes: ['d1h1', 'h3h8:blue'],
        task: {
          prompt: 'Find the quiet move.',
          moves: ['Rdh1'],
          hint: 'Which piece is not taking part? Bring it to the file where the action is.',
          success:
            '**Rdh1** doubles the rooks on the h-file. Now Rh7+ is threatened, with a mating attack.',
          why: 'No check, no capture, yet it is the only winning move: everything else lets Black keep the extra piece. Black’s best defence is to block the h-file with **...Rh8**, and then the rooks exchange their way into Black’s position. When the forcing moves do not work, look for the quiet one that makes them work.',
          failure:
            'Look for a quiet move that brings one more piece into the attack on the h-file.',
          reply: 'Rh8',
          replyNote:
            'Black’s best: the rook blocks the h-file and offers itself, because Rh7+ was coming.',
          then: {
            prompt: 'Black blocks the file. What now?',
            moves: ['Rxh8'],
            hint: 'Your rooks attack h8 twice. Start the exchanges.',
            success:
              '**Rxh8**: the king cannot take back, because your second rook guards h8, so the queen has to.',
            why: 'This is why doubling mattered: the second rook turns the exchanges on h8 in your favour. Count them: rook for rook, then rook for queen. When pieces fight over one square, list the attackers and defenders, and their values, before the first capture.',
            failure: 'The rook on h8 blocks your attack. Capture it: the king cannot recapture.',
            reply: 'Qxh8',
            replyNote:
              'The only recapture. Now the queen stands where your second rook can reach her.',
            then: {
              prompt: 'Cash in.',
              moves: ['Rxh8'],
              hint: 'What is standing on h8 now?',
              success:
                '**Rxh8** takes the queen. After ...Rxh8 Nxd7 you have a queen against a rook, and the bishop on d7 is gone too.',
              why: 'Two rooks for queen and rook, then a bishop on top: from a piece down to a queen against a rook. The whole combination began with a quiet move that threatened something Black could not allow.',
              failure: 'The black queen on h8 is attacked by your rook. Take her.',
              reply: 'Rxh8',
              replyNote: 'Black takes back, and now your knight on e5 captures the bishop on d7.',
            },
          },
        },
      },
      {
        id: 'pawn-majority',
        title: 'Count the wings',
        text:
          'A pawn ending, and you are a pawn down. Count the wings, not the total: on the kingside Black has three pawns against none, but on the queenside your pawns on a4, b2 and c2 face a single black pawn on a6. And Black’s king on g5 is far from the queenside.\n\n' +
          'A king march is too slow: by the time your king gets anywhere, Black’s kingside pawns will be running. The answer is a breakthrough that makes a passed pawn faster than anything Black has.',
        fen: CALC_KING,
        shapes: ['b2b4', 'b4b5:blue', 'a4a5:blue'],
        task: {
          prompt: 'How do you make a passed pawn on the queenside?',
          moves: ['b4'],
          hint: 'Two of your pawns against one: which pawn starts the breakthrough?',
          success:
            '**b4** prepares **b5**. Whether Black takes on b5 or not, one of your queenside pawns gets through, and Black’s king is too far away to stop it.',
          why: 'The king moves are what most players look at, and they lose: the engine rates **Kf2** or **Kg3** as lost for White, because Black’s king and pawns win the kingside first. The pawns are faster. Count the race before you choose the plan, not after.',
          wrong: {
            Kf2: {
              text: 'Bringing the king over is natural, but too slow: Black’s king walks to f4 and the kingside pawns roll. The engine rates it lost.',
              refute: 'Kf4',
            },
          },
          failure:
            'Use your queenside majority: which pawn move prepares a breakthrough that Black’s distant king cannot stop?',
          reply: 'Kf4',
          replyNote: 'Black’s king heads for the centre, to attack your pawns on d3 and c2.',
          then: {
            prompt: 'Now the breakthrough.',
            moves: ['b5'],
            hint: 'Push the pawn that attacks a6.',
            success:
              '**b5** attacks a6. If ...axb5, the a-pawn runs; if Black leaves it, bxa6 makes the passed pawn instead.',
            why: 'This is the breakthrough: two pawns against one, and one of them gets through. The black king on f4 is five files from the a-file, far outside the square of the pawn. Waiting with the king instead, **Kf2**, lets Black’s king attack your pawns first.',
            failure:
              'Push the pawn that attacks a6, so that one of your queenside pawns becomes passed.',
            reply: 'axb5',
            replyNote:
              'Black takes, the best try. Now look at your a-pawn: nothing stands in front of it.',
            then: {
              prompt: 'Which pawn runs?',
              moves: ['a5'],
              hint: 'Which pawn has no black pawn in front of it?',
              success:
                '**a5**: the a-pawn needs three more moves to queen, and Black’s king on f4 is far outside its square.',
              why: 'Count it once more: three moves for the a-pawn, and the black king cannot get near the a-file in time. Do not recapture on b5: then the black king gets back to stop that pawn, and Black’s kingside pawns decide the game.',
              wrong: {
                axb5: {
                  text: 'Taking back leaves your pawn on b5 within reach: Black’s king comes back to stop it, and then the kingside pawns decide. The pawn that runs is the one with nothing in front of it.',
                  refute: 'Ke5',
                },
              },
              failure:
                'One of your pawns has no black pawn in front of it and is far from Black’s king. Push it.',
            },
          },
        },
      },
      {
        id: 'calculation-habits',
        title: 'Habits of a calculator',
        text:
          '- **Count races to the last move**, and then look for the first check after both sides queen.\n' +
          '- **Look for the quiet move** inside the line: doubling rooks, a pawn push, a king step.\n' +
          '- **Trade into a pawn ending only after counting it**, including your opponent’s best decoy.\n' +
          '- **Use the rule of the square**, but remember that a pawn escorted by its king is a different story.\n' +
          '- **Stop only at a quiet position.** If the line ends in a capture or a check, look one move further.\n\n' +
          'The “very long” and “quiet move” puzzles below are the training ground.',
        fen: CALC_RACE,
      },
    ],
  },
  {
    id: 'when-there-is-nothing-to-do',
    title: 'When there is nothing to do',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Improving the worst piece, prophylaxis, and the patience to keep a bind: the moves strong players make when no tactic is on offer, from games by Karpov, Capablanca and Fischer.',
    minutes: 10,
    practiceThemes: ['quietMove', 'middlegame'],
    steps: [
      {
        title: 'Improve the worst piece',
        text:
          'No tactics, no targets, no obvious plan: this is where many games drift. The question strong players ask here is simple: **which of my pieces is doing least?** Then they move that piece to a better square.\n\n' +
          'Look at the knight on d2. It stands behind your own pawns, blocks the bishop on c1 and the queen’s file, and guards nothing that matters. The knight has a route out, via f1, to squares where it counts.\n\n' +
          'This is Karpov–Unzicker, Nice 1974, a model of the patient bind. Play it through in Classic games.',
        fen: NOTHING_NF1,
        shapes: ['d2f1', 'f1g3:blue', 'f1e3:blue'],
        task: {
          prompt: 'Which piece is doing least, and where should it go?',
          moves: ['Nf1'],
          hint: 'Look at the knight on d2. Which square leads it towards g3 or e3?',
          success:
            '**Nf1** reroutes the knight towards g3 or e3, where it eyes f5. It also gets out of the way of the bishop on c1 and your queen.',
          why: 'Nothing dramatic happens, and that is the point: a few moves later the knight is on g3, the bishop on c1 can come out, and every white piece has a job. The engine likes **Bd3** just as much, another quiet improving move. When there is no plan, improving your worst piece is never a wasted move.',
          wrong: {
            Bd3: 'A good move too, the engine’s top choice: the bishop finds a better diagonal. But the bishop was already doing something, and the knight on d2 was doing nothing. Improve the worst piece first.',
            Nb3: 'The right piece, but a poorer square: on b3 the knight bumps into Black’s pawns on b5 and c5 and has no way forward. The engine rates it clearly worse than **Nf1**.',
          },
          failure:
            'Look for the piece with nothing to do, and a route that brings it to a better square.',
        },
      },
      {
        title: 'Take the file, then freeze the wing',
        text:
          'A few moves later. The a-file is open, and both sides have a rook on it. Whoever controls it can get into the other camp; whoever loses it has to sit and watch. Rather than trade rooks at once, you can build a battery: rook to a2, the other rook behind it on a1.\n\n' +
          'Prophylaxis is the habit behind it: ask what your opponent wants, and arrange your pieces so that it does not work. Black wants to trade on the a-file and relieve the pressure.',
        fen: NOTHING_RA2,
        shapes: ['a1a2', 'e1a1:blue', 'a8:red'],
        task: {
          prompt: 'How do you prepare to take the a-file?',
          moves: ['Ra2'],
          hint: 'Two rooks on one file beat one. Which square lets the other rook come up behind?',
          success:
            '**Ra2** prepares to double with **Rea1**. If Black trades on a2, your queen takes back and the file stays yours.',
          why: 'The engine sees several moves of similar value here; this one has a clear plan behind it. With two rooks on the file, any trade on a2 or a1 leaves you in control, and Black’s rook on a8 has to give way. Trading on a8 at once would hand the file to Black’s other rook.',
          wrong: {
            Rxa8: 'This trades the file away: after ...Rxa8 Black’s other rook takes it over. Build the battery first, so that any trade happens on your terms.',
            Nh2: 'A good move by the engine’s count, heading for g4. But it leaves the a-file to Black, and this step is about the file.',
          },
          failure:
            'This step is about the open a-file: put a rook where the other one can come up behind it.',
          reply: 'c4',
          replyNote:
            'Black gains space and attacks your bishop on d3. Trading on a2 was the alternative; your queen would take back and keep the file.',
          then: {
            prompt: 'Your bishop is attacked. Where does it go?',
            moves: ['Bb1', 'Be2', 'Bf1'],
            hint: 'Find a safe square that does not cut off your queen’s protection of the rook on a2.',
            success: 'The bishop steps back, and your rook on a2 is still protected by the queen.',
            why: 'The tempting **Bc2** is the one retreat that loses: it blocks the second rank, and ...Rxa2 wins a rook because your queen no longer guards a2. And **Rea1** at once ignores the attack. Before every quiet move, check what your opponent’s last move attacked.',
            wrong: {
              Bc2: {
                text: 'This blocks the second rank: your queen no longer protects the rook on a2, and **...Rxa2** wins it.',
                refute: 'Rxa2',
              },
              Rea1: {
                text: 'The plan, but the bishop is still attacked: after ...Rxa2 Rxa2 cxd3 Black has won a piece. Deal with the threat first.',
                refute: 'Rxa2',
              },
            },
            failure:
              'The bishop on d3 is attacked by a pawn. Move it to a safe square that does not block the queen’s protection of a2.',
            reply: 'Qd8',
            replyNote:
              'Black regroups and waits. Now look at the queenside: which squares do Black’s rooks still need?',
            then: {
              prompt: 'Find the move that freezes Black’s queenside.',
              moves: ['Ba7'],
              hint: 'Where can your dark-squared bishop sit for the rest of the game, out of reach of Black’s pieces?',
              success:
                '**Ba7** puts the bishop where Black’s pieces cannot easily reach it. It covers b8 and blocks the a-file, so Black’s rooks have no squares on the queenside.',
              why: 'This is prophylaxis at its purest: the bishop does nothing active, but it takes away what Black wanted, the trade on the a-file and a rook on b8 behind the b-pawn. Once the queenside is frozen, Black can only wait, and you are free to turn to the other wing.',
              wrong: {
                Rxa8: 'Playable, but it gives up the file you built: after ...Rxa8 Black’s rook is the one on the open file.',
                Ng5: 'Active, but it lets Black trade on a2 and ease the pressure. First take the queenside squares away.',
              },
              failure:
                'Black’s rooks want the a-file and the b8-square. Which of your pieces can sit on the queenside and deny them both?',
            },
          },
        },
      },
      {
        id: 'other-wing',
        title: 'Then open the other side',
        text:
          'Six moves later the queenside is frozen solid: your bishop still sits on a7, Black’s pieces guard the a-file, and nothing can happen there. When one wing is locked, the play moves to the other. Your knights on e2 and h2 point at the kingside, and Black’s pieces are far away, tied to the queenside.\n\n' +
          'The tool is a pawn break on the kingside, on the wing where your pieces outnumber Black’s. It is exactly how Karpov finished the game.',
        fen: NOTHING_F4,
        shapes: ['f2f4', 'e5:red'],
        task: {
          prompt: 'Which pawn break opens the other wing?',
          moves: ['f4'],
          hint: 'Which pawn can strike at e5?',
          success:
            '**f4** attacks e5 and offers to open the f-file, on the side where your pieces outnumber Black’s.',
          why: 'The engine rates it the best move. If Black takes, your knight comes to f4, aiming at e6 and the g6-pawn; if Black keeps the centre closed, the pawn goes on to f5 and gains more space. Patience on one wing, then a break on the other: that is how a bind is converted.',
          wrong: {
            Ng4: 'A useful knight move, but it opens nothing: the kingside stays closed. The break makes your space count.',
            Ra5: 'Pressure on the a-file looks natural, but the queenside is already frozen, and nothing more happens there. Play on the other wing.',
          },
          failure:
            'The queenside is locked. Look for a pawn break on the other wing, where your pieces are closer than Black’s.',
          reply: 'f6',
          replyNote:
            'Black props up e5 and keeps the centre closed. ...exf4 was a little better, but it would give your knight the f4-square.',
          then: {
            prompt: 'Black has closed the centre. How do you gain more space?',
            moves: ['f5'],
            hint: 'Do not take on e5: push past it.',
            success:
              '**f5** gains space and fixes Black’s kingside pawns. The e6-square is now a hole that no black pawn can cover.',
            why: 'Exchanging on e5 would only free Black’s pieces. With the pawn on f5, e6 belongs to you, Black’s bishop on g7 is hemmed in by its own pawns, and your knights can head for g4 and beyond. The engine rates **f5** clearly best. Now the bind covers both wings, and Black can only wait.',
            wrong: {
              fxe5: 'This opens the position for Black’s pieces: the files and squares you took away come back. Push past e5 instead.',
            },
            failure:
              'Gain space on the kingside: push the f-pawn past e5 instead of exchanging it.',
          },
        },
      },
      {
        id: 'the-king-is-a-piece',
        title: 'The king is a piece',
        text:
          'A rook ending, and your rook alone has nothing to attack. Black’s rook on c6 is about to take on c3, and your g-pawn on g5 is passed but needs help. In endings the most useful piece to improve is often the king: here it can walk up the h-file to support the g-pawn and attack f5.\n\n' +
          'The price is a pawn or two on the queenside. Ask what matters more: a pawn on c3, or a king next to your passed pawn. Capablanca answered that question against Tartakower in New York, 1924.',
        fen: NOTHING_KING,
        shapes: ['f3g3', 'g3h4:blue', 'h4h5:blue', 'h5g6:blue'],
        task: {
          prompt: 'Where does the king go?',
          moves: ['Kg3'],
          hint: 'Head for the passed pawn, even if it costs the c3-pawn.',
          success:
            '**Kg3** starts the walk towards h4, h5 and g6. Black can take on c3 with check, and you let it happen.',
          why: 'The engine rates the king walk clearly best. Central king moves such as **Ke3** or **Kf2** look safer, but Black takes on c3 anyway and the position becomes close to level. Material is a means, not an end: a king next to a passed pawn is worth more than a pawn on c3.',
          wrong: {
            Ke3: 'This heads for the centre, but Black takes on c3 anyway, with check, and the position becomes close to level. The walk to the g-pawn is what wins.',
            Kf2: 'This keeps an eye on the centre, but it walks away from the g-pawn, and the advantage almost disappears.',
            Rh6: {
              text: 'Offering the rook trade is the wrong idea: after ...Rxh6 gxh6 the pawn ending is better for Black. Your rook is needed; the king is the piece to improve.',
              refute: 'Rxh6',
            },
          },
          failure:
            'The king is the piece with the most to gain. March it towards the passed g-pawn.',
          reply: 'Rxc3+',
          replyNote: 'Black takes the pawn with check, as expected.',
          then: {
            prompt: 'Keep walking.',
            moves: ['Kh4'],
            hint: 'Do not go back. Which square continues the walk?',
            success: '**Kh4**: the king keeps going, towards h5 and g6.',
            why: 'Every step back would admit the walk was a mistake. From h4 the king heads for g6, where it supports the g-pawn and attacks f5 from behind. The black rook can take more pawns, but each move it spends on pawns is a move it is not defending its king.',
            failure: 'Continue towards the g-pawn: the king’s road runs along the h-file.',
            reply: 'a6',
            replyNote:
              'Black prepares ...b5 for counterplay on the queenside instead of chasing your king.',
            then: {
              prompt: 'One more step.',
              moves: ['Kh5'],
              hint: 'g6 is the goal.',
              success:
                '**Kh5**, and **Kg6** comes next: the king arrives beside the passed pawn and attacks f5.',
              why: '**g6** and **Rd7** keep an edge as well, but on a deeper look the engine prefers the king step. A king on g6, next to the passed pawn and behind the f5-pawn, does more than any rook move could. In endings with nothing to attack, ask which piece is furthest from where it should be: very often it is the king.',
              wrong: {
                g6: 'Not bad, but the pawn runs ahead of its escort. Let the king reach g6 first, and the pawn advances with support.',
                Rd7: 'Active, and it keeps an edge, but it does not help the g-pawn. The king walk comes first.',
              },
              failure: 'Keep the king walking towards g6 and the passed pawn.',
            },
          },
        },
      },
      {
        id: 'tie-a-piece-down',
        title: 'Tie a piece down',
        text:
          'You are a pawn up in a rook ending, and the natural thing is to push your pawns at once. But Black’s rook on b2 is active and attacks your a-pawn, and an active rook is the defender’s best hope. Before you advance, make the defending rook passive.\n\n' +
          'Look at a7: it is isolated, and only Black’s rook can defend it. A rook that attacks a7 from the side ties Black’s rook to its defence.',
        fen: NOTHING_ROOK,
        shapes: ['f5a5', 'a7:red', 'a2:blue'],
        task: {
          prompt: 'Find the rook move that defends and restricts at the same time.',
          moves: ['Ra5'],
          hint: 'Which square on the a-file guards your a2-pawn and attacks a7?',
          success:
            '**Ra5** defends a2 along the file and attacks a7. Black’s rook has to leave b2 to protect the pawn.',
          why: 'After ...Rb7 the black rook is passive, tied to a7, while yours guards a2 and can still go to a6 to cut off the king. Then your king and pawns advance at leisure. **Re5+** and **Rg5** are good too and often reach the same set-up a move later. In rook endings, take the defender’s activity away before you push.',
          wrong: {
            'Re5+':
              'Good too: after **...Kd6** the rook usually goes to a5 anyway. But why give the black king a move towards the queenside? **Ra5** does the job at once.',
            a4: 'Saving the pawn by pushing it keeps Black’s rook active, and the engine rates it about a pawn worse than **Ra5**. Put your own rook to work first.',
          },
          failure:
            'Your a2-pawn is attacked. Look for a rook move that defends it and attacks a7 at the same time.',
        },
      },
      {
        id: 'safety-first',
        title: 'Safety first',
        text:
          'You have a queen for two minor pieces, a clear material advantage. But your king is still in the centre, your rook on h1 is not developed, and Black’s bishop on e5 and knight on c6 are active. Black hopes for one thing: a tactic against your king while it sits in the middle.\n\n' +
          'When you are winning and there is no tactic for you, remove your own weaknesses first. Then the extra material wins by itself. Fischer, in this position, did exactly that.',
        fen: NOTHING_SAFETY,
        shapes: ['e1g1', 'e1c1'],
        task: {
          prompt: 'Which move makes everything else easier?',
          moves: ['O-O', 'O-O-O'],
          hint: 'Your king and your h1-rook both need a better square. One move fixes both.',
          success:
            'Castling tucks the king away and brings a rook towards the centre, both in one move.',
          why: 'With the king safe and the rooks connected, the queen can go hunting without worrying about her own king. **Bh6** and other active moves keep the win too, and the engine rates many moves as winning, but castling makes every later move safer. Winning a won position is mostly about giving the opponent no chances.',
          wrong: {
            Bh6: 'Good too, and it keeps the winning advantage. But your king is still in the centre: make it safe first, then attack.',
            Rf1: 'The rook comes towards the centre, but the king stays there with it, and now it can only castle on the queenside. You are still winning; castling first does both jobs at once.',
            Rg1: 'The rook leaves the corner, but your king is still in the centre, and now it can only castle on the queenside. Castling does both jobs in one move.',
          },
          failure: 'Look at your king and your h1-rook: one move improves both.',
        },
      },
      {
        id: 'nothing-to-do-list',
        title: 'The list',
        text:
          '- **Improve the worst piece.** Every move that does so is a good move.\n' +
          '- **Prophylaxis**: ask what the opponent wants, and stop it before it happens.\n' +
          '- **Fix one wing, then break on the other.**\n' +
          '- **Restrict** before you advance: a piece tied to a weakness is half a piece.\n' +
          '- **Use the king** in endings; **castle** in middlegames before you start the technique.\n' +
          '- **Do not hurry**: with a bind, the opponent’s position gets worse by itself.\n\n' +
          'Play through Karpov–Unzicker and Capablanca–Tartakower in Classic games to see these ideas move by move.',
        fen: NOTHING_BIND,
      },
    ],
  },
];
