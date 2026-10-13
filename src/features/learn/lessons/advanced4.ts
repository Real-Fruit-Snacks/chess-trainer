import { fenAfter, type Lesson } from '../model';

// Good and bad bishops.
const FRENCH_BA6 = fenAfter('1. e4 e6 2. d4 d5 3. e5 b6 4. Nf3 Qd7 5. Bd3');
const BISHOPS = '8/3b1k2/p5p1/1p3p1p/1P3P1P/P4KP1/2B5/8 w - - 0 1';
const BISHOPS_2 = fenAfter('1. Ke3 Ke7 2. Kd4 Kd6', BISHOPS);

// Opposite-side castling: the Dragon, and Karpov – Korchnoi, World Championship Candidates final 1974 (game 2).
const YUGOSLAV = fenAfter(
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Rc8 11. Bb3 Ne5 12. h4',
);
const KARPOV =
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 Nc6 8. Qd2 O-O 9. Bc4 Bd7 10. h4 Rc8 11. Bb3 Ne5 12. O-O-O Nc4 13. Bxc4 Rxc4';
const KARPOV_H5 = fenAfter(KARPOV);
const KARPOV_BH6 = fenAfter(`${KARPOV} 14. h5 Nxh5 15. g4 Nf6 16. Nde2 Qa5`);
const KARPOV_G5 = fenAfter(
  `${KARPOV} 14. h5 Nxh5 15. g4 Nf6 16. Nde2 Qa5 17. Bh6 Bxh6 18. Qxh6 Rfc8 19. Rd3 R4c5`,
);
const KARPOV_E5 = fenAfter(
  `${KARPOV} 14. h5 Nxh5 15. g4 Nf6 16. Nde2 Qa5 17. Bh6 Bxh6 18. Qxh6 Rfc8 19. Rd3 R4c5 20. g5 Rxg5 21. Rd5 Rxd5 22. Nxd5 Re8 23. Nef4 Bc6`,
);
const KARPOV_END = fenAfter(
  `${KARPOV} 14. h5 Nxh5 15. g4 Nf6 16. Nde2 Qa5 17. Bh6 Bxh6 18. Qxh6 Rfc8 19. Rd3 R4c5 20. g5 Rxg5 21. Rd5 Rxd5 22. Nxd5 Re8 23. Nef4 Bc6 24. e5 Bxd5 25. exf6 exf6 26. Qxh7+ Kf8`,
);

// Converting an extra pawn.
const TRADE_ROOKS = '3rk3/p4ppp/8/8/8/8/PP3PPP/3R1K2 w - - 0 1';
const OUTSIDE_PASSER = '8/8/3k1pp1/2p4p/P7/3K1PPP/8/8 w - - 0 1';
const TRADE_QUEENS = '6k1/pp3ppp/4q3/8/4Q3/8/PPP2PPP/6K1 w - - 0 1';

// Candidate moves: Réti – Tartakower, Vienna 1910; Levitsky – Marshall, Breslau 1912.
const RETI =
  '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4';
const RETI_1 = fenAfter(RETI);
// Before 9. Qd8+, a quiet move gives Black time; after 9...Kxd8, it lets Black take the bishop on d2.
const RETI_QUIET =
  'A quiet move gives Black time to keep the extra piece and untangle. With your queen, rook and bishop lined up on the d-file, look for something forcing: checks first.';
const RETI_TOO_SLOW = {
  text: 'Too slow: Black takes the bishop, **Nxd2**, before it can move with double check, and you are simply a queen down. After a sacrifice, every move has to be forcing.',
  refute: 'Nxd2',
};
const ELIMINATION = '3r2k1/pp3ppp/1q6/8/4b3/5N2/PPP1QPPP/3R2K1 w - - 0 1';
const MARSHALL = '5r1k/pp4pp/4p3/2R3Q1/3n4/2q4r/P1P2PPP/5RK1 b - - 0 23';

// Planning from the pawn structure.
const HANGING =
  '1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. e3 Bb7 5. Bd3 d5 6. O-O Bd6 7. Nc3 O-O 8. b3 c5 9. Bb2 Nc6 10. cxd5 exd5 11. dxc5 bxc5';
const HANGING_WHITE = fenAfter(HANGING);
const HANGING_BLACK = fenAfter(`${HANGING} 12. Na4`);
const MAROCZY =
  '1. e4 c5 2. Nf3 g6 3. d4 cxd4 4. Nxd4 Nc6 5. c4 Bg7 6. Be3 Nf6 7. Nc3 O-O 8. Be2 d6 9. O-O Bd7 10. Qd2 Nxd4 11. Bxd4 Bc6 12. f3 a5 13. b3 Nd7 14. Be3 Nc5';
const MAROCZY_WHITE = fenAfter(MAROCZY);
const MAROCZY_BLACK = fenAfter(`${MAROCZY} 15. Rab1 Qb6 16. Rfc1`);

export const advancedLessons4: Lesson[] = [
  {
    id: 'good-and-bad-bishops',
    title: 'Good and bad bishops',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'A bishop is only as good as its pawns. Trade the bad one, fix the enemy pawns on its colour, and win the ending with the good one.',
    minutes: 10,
    steps: [
      {
        title: 'Which bishop is bad?',
        text:
          'Before you judge a bishop, look at its own pawns. A bishop is **bad** when they stand on its colour: ' +
          'they block its diagonals, and it ends up guarding them. It is **good** when they stand on the other ' +
          'colour, leaving its diagonals open and the enemy pawns as targets.\n\n' +
          'The French Defence is the classic case. Your pawns on d5 and e6 stand on light squares, and so does ' +
          'the bishop on c8: behind that chain it has no future. White’s bishop on d3 is the opposite, a good piece ' +
          'aimed at your king.\n\n' +
          'You cannot take the pawns off the light squares, but you can change the bishops. That is what your ' +
          'last two moves, ...b6 and ...Qd7, were preparing.',
        fen: FRENCH_BA6,
        orientation: 'black',
        shapes: ['d5:red', 'e6:red', 'c8:red', 'd3:blue'],
        task: {
          prompt: 'How do you get rid of your worst piece?',
          moves: ['Ba6'],
          hint: 'Your bishop will never be good behind d5 and e6. Is there a square where it meets White’s good one?',
          success:
            '**Ba6** offers your bad bishop for White’s good one. After **Bxa6 Nxa6** the piece locked behind d5 and e6 is gone, and so is the bishop that was aimed at your king.',
          why:
            'On paper both bishops are worth three pawns; on this board yours guards pawns while White’s attacks. ' +
            'Swapping your worst minor piece for the opponent’s best is one of the cheapest ways to improve a ' +
            'position, and it needs no tactics at all. Make it a habit in the French, the Caro-Kann and the ' +
            'Queen’s Gambit: find your bad bishop early, and look for the square where it can be traded.',
          wrong: {
            c5: '**c5** is a good move too, the standard French strike at d4, but it leaves the bishop on c8 exactly where it was. This step is about the trade that ...b6 and ...Qd7 prepared.',
            Bb7: 'On b7 the bishop stares at your own pawn on d5, which is no better than c8. A bishop behind its own pawn chain stays bad wherever it stands, so trade it instead.',
            Ne7: '**Ne7** is a useful developing move, and ...Ba6 can still follow. But the trade is the reason for your last two moves, so there is nothing to wait for.',
          },
          failure:
            'This step is about the bishop on c8, shut in by your pawns on d5 and e6. Look for a square where it can meet White’s good bishop.',
          reply: 'Bxa6',
          replyNote:
            'White takes, and your knight recaptures on a6. It is offside for a moment and will come back via b8 to c6; the bad bishop has gone for good.',
        },
      },
      {
        title: 'The same bishops, opposite fates',
        text:
          'Material is level here: a light-squared bishop and five pawns each. Yet White is winning, and the pawns ' +
          'tell you why.\n\n' +
          'White’s pawns on a3, b4, f4, g3 and h4 all stand on dark squares, so the bishop on c2 has open ' +
          'diagonals. Black’s pawns on a6, b5, f5, g6 and h5 all stand on light squares, the bishop’s own colour: ' +
          'every one of them is a target for it.\n\n' +
          'Black’s bishop on d7 lives on those same light squares. It can only defend its pawns, and it can never ' +
          'cover a dark square.\n\n' +
          'So White’s plan has two parts. The king marches over the dark squares, d4 and then c5, where the bad ' +
          'bishop can never challenge it. The good bishop attacks the pawns from behind.',
        fen: BISHOPS,
        shapes: ['b5:red', 'f5:red', 'g6:red', 'h5:red', 'd4:blue', 'c5:blue'],
      },
      {
        title: 'Count the tempi',
        text:
          'Plans cost moves, so count them. Black needs three to build a fortress: ...Ke7 and ...Kd6 to keep your ' +
          'king out of c5 and e5, and ...Be6, putting the bishop on the a2–g8 diagonal, where it can guard g6 from ' +
          'f7 and blocks your bishop’s road behind the pawns. With the king on d6 and the bishop on that diagonal, ' +
          'Black holds the draw.\n\n' +
          'You need three moves as well: the king to d4, and your bishop onto the a2–g8 diagonal first. You are to ' +
          'move, so you are exactly one tempo ahead. Spend it on anything else and the win is gone.',
        fen: BISHOPS,
        shapes: ['d6:red', 'e6:red'],
        task: {
          prompt: 'Which move starts the race without wasting a tempo?',
          moves: ['Ke3'],
          hint: 'Your king is bound for d4. Count the moves each route takes: only one gets there in two.',
          success:
            '**Ke3**: one more step and the king is on d4, and every square on the way is a dark one that the bishop on d7 can never touch.',
          why:
            'Black is now a tempo short, whichever piece moves first. If the bishop goes first, your king reaches ' +
            'c5 before Black’s king gets to d6: 1...Be6 2. Kd4 Bc4 3. Kc5. If the king goes first, your bishop ' +
            'wins the race to the diagonal. When both sides need the same number of moves, the side to move wins ' +
            'only if it wastes none.',
          wrong: {
            'Bb3+': {
              text: 'Check, but Black blocks with ...Be6 and the bishop reaches its diagonal with tempo. Trading does not help: after **Bxe6+ Kxe6** the black king gets to d5 first and the pawn ending is a draw.',
              refute: 'Be6',
            },
            Ke2: {
              text: 'The right direction by the long road: from e2 the king still needs two moves to reach d4. Black spends the spare tempo on ...Be6, and the fortress is ready in time.',
              refute: 'Be6',
            },
          },
          failure:
            'Count the tempi: Black needs only ...Ke7, ...Kd6 and ...Be6 to build the fortress. Your king has to head for d4 by the shortest road, starting now.',
          reply: 'Ke7',
          replyNote:
            'Black brings the king first, heading for d6 to guard c5. If the bishop had gone to e6 instead, your king would have walked straight to c5.',
          then: {
            prompt: 'The black king is heading for d6. Where does yours go?',
            moves: ['Kd4'],
            hint: 'Which square puts your king one step from both c5 and e5?',
            success:
              '**Kd4**: the king stands in the centre, one step from c5 and e5, and the black king has to keep guard on d6.',
            why:
              'Look at the squares the two kings are fighting over: d4, c5 and e5 are all dark, so the bad bishop ' +
              'can never take part. That is the hidden price of a bad bishop: the squares of the other colour ' +
              'belong to the enemy king. Black still needs ...Be6 to finish the fortress, and is still one tempo short.',
            wrong: {
              Bb3: {
                text: 'The right diagonal, one move too early. Black answers ...Be6: keep the bishops and Black’s bishop holds the diagonal, trade them and the pawn ending is a draw. The king had to come first.',
                refute: 'Be6',
              },
            },
            failure:
              'Your king must reach d4 before Black gets ...Kd6 and ...Be6 in. Do not spend the tempo anywhere else.',
            reply: 'Kd6',
            replyNote:
              'The black king blocks the way in, guarding c5 and e5. One more move, ...Be6, and the fortress would be complete. But it is your turn.',
            then: {
              prompt: 'Black needs one more move, ...Be6. How do you stop it?',
              moves: ['Bb3'],
              hint: 'Which diagonal does Black’s bishop want? Get there first.',
              success:
                '**Bb3** takes the a2–g8 diagonal first. Now 3...Be6 4. Bxe6 Kxe6 5. Kc5 is a lost pawn ending for Black: your king walks into the queenside.',
              why:
                'Black has run out of good moves. The bishop cannot reach its diagonal, the king cannot leave d6 ' +
                'without letting yours into c5 or e5, and your bishop is about to slip behind the pawns. Good ' +
                'bishop against bad usually comes down to this: one side has targets and a plan, the other can ' +
                'only wait.',
              wrong: {
                Bd1: {
                  text: '**Bd1** heads for f3 and the long diagonal, but from there the bishop never gets behind the pawns. Black plays ...Be6, the fortress is complete, and the game is a draw.',
                  refute: 'Be6',
                },
                Bd3: {
                  text: 'From d3 the bishop can never get behind the black pawns. Black plays ...Be6, the fortress is complete, and the game is a draw.',
                  refute: 'Be6',
                },
              },
              failure:
                'Black’s bishop wants the a2–g8 diagonal: ...Be6 would complete the fortress. Take that diagonal with your own bishop first.',
              reply: 'Bc6',
              replyNote:
                'Black is lost whatever it does. The bishop leaves for the long diagonal to eye your kingside pawns, and now nothing guards g6.',
              then: {
                prompt: 'Nothing guards g6. How does your bishop get at it?',
                moves: ['Bf7'],
                hint: 'Stay on the a2–g8 diagonal, and look for the square that attacks g6 from behind.',
                success:
                  '**Bf7** attacks g6 from behind. The bad bishop cannot guard it, and the black king cannot leave d6 without letting yours in, so the pawn falls.',
                why:
                  'This is the second weakness. Black’s king has to guard c5 and e5, so it cannot also defend the ' +
                  'kingside, and the bishop on c6 has no way back to g6. After 4...Bf3 5. Bxg6 you are a pawn up ' +
                  'with the same grip. One weakness can be defended; two usually cannot.',
                wrong: {
                  Bg8: '**Bg8** keeps the bind and still wins, because the king can walk to c5 later. But g6 is there for the taking now, and a bad bishop’s pawns never get easier to defend.',
                  Ba2: '**Ba2** keeps the bind and still wins, because the king can walk to c5 later. But g6 is there for the taking now, and a bad bishop’s pawns never get easier to defend.',
                },
                failure:
                  'g6 has no defender. Keep your bishop on the a2–g8 diagonal and find the square that attacks it from behind.',
              },
            },
          },
        },
      },
      {
        title: 'Rules for bishops',
        text:
          'Four rules to take into your own games:\n\n' +
          '- Put your **pawns on the opposite colour** to your bishop, above all the central ones that will be fixed.\n' +
          '- Fix the **enemy pawns on their bishop’s colour**, then attack them. Here White’s pawns on b4, f4 and h4 hold Black’s on b5, f5 and h5 in place for good.\n' +
          '- **Trade your bad bishop** when you can, as ...Ba6 did in the French, and keep your good one.\n' +
          '- In the ending, a good bishop and an **active king** on the squares the bad bishop cannot cover usually win.\n\n' +
          'And count tempi. In the race you just played, a single wasted move would have turned a win into a draw.',
        fen: BISHOPS_2,
      },
    ],
    practiceThemes: ['bishopEndgame', 'middlegame'],
  },

  {
    id: 'opposite-side-castling',
    title: 'Opposite-side castling: the pawn storm',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'When the kings live on opposite wings, the pawns become attackers. A classic attacking game shows how to open a file and finish; the Dragon shows how to slow the storm.',
    minutes: 14,
    steps: [
      {
        title: 'Why the pawns attack',
        text:
          'When both kings castle on the same side, pushing the pawns in front of your king weakens it. When they ' +
          'castle on **opposite wings**, your pawns on the far wing shelter nothing, so they are free to charge, and ' +
          'every pawn exchange near the enemy king opens a file for your rooks and queen.\n\n' +
          'The rules of the race:\n\n' +
          '- **Speed.** Count tempi, not pawns, and do not stop to defend small things.\n' +
          '- **Open a file**, then put the queen and a rook on it.\n' +
          '- **Trade the defender**, usually the fianchettoed bishop.\n' +
          '- The defender needs **counterplay** on the other wing, or must **slow the storm**.\n\n' +
          'This is the Yugoslav Attack against the Dragon. White has just played h4, and wants h5 to open the h-file.',
        fen: YUGOSLAV,
        orientation: 'black',
        shapes: ['h4h5:red', 'h5g6:red', 'c8c3:blue'],
      },
      {
        title: 'Slow the storm',
        text:
          'You are Black, and you cannot stop this attack, only make it cost time. So start with the question strong ' +
          'players ask before every move: what does my opponent want? White wants h5, then hxg6, and the h-file opens ' +
          'with the queen and a rook lined up behind it.\n\n' +
          'Your own play is on the other wing: the rook on c8, a knight jump to c4, perhaps an exchange sacrifice on ' +
          'c3 to break up the pawns in front of White’s king. Every tempo White spends on the kingside is a tempo ' +
          'for that, and the cheapest way to buy tempi is to put something in the storm’s way.',
        fen: YUGOSLAV,
        orientation: 'black',
        task: {
          prompt: 'White wants h5. How do you make that cost time?',
          moves: ['h5'],
          hint: 'Meet a pawn with a pawn. Can you take the square White’s pawn is heading for?',
          success:
            '**h5** puts a pawn on the very square White wanted. Now the h-file can only be opened with g4, which takes preparation, and that time goes into your play on the c-file.',
          why:
            'A pawn in the way is the best brake on a pawn storm: h5 is impossible for White, and g4 needs support ' +
            'before it opens anything. The price is a weakened g5 square and a pawn White can attack later, but in ' +
            'a race a tempo is worth more than a square. That is why this is Black’s standard answer in this line ' +
            'of the Dragon.',
          wrong: {
            Nc4: '**Nc4** is playable, and it is what Black chose in this very position in Karpov – Korchnoi, 1974: it trades the bishop on b3, which eyes f7. But it does nothing about h5, and the next steps show what White did with the time.',
            Qa5: '**Qa5** is a typical Dragon move, but it does nothing about h5 either. In a race, slow the opponent down before you speed yourself up.',
            b5: '**b5** offers a pawn to open lines on the queenside, but it costs a pawn and gives nothing back: the knight on d4 takes it, and White still has h5 in hand.',
            Rxc3: {
              text: 'The thematic exchange sacrifice, but too early: White takes back with the queen, **Qxc3**, the pawns in front of the king stay intact, and you are simply an exchange down.',
              refute: 'Qxc3',
            },
          },
          failure:
            'In a race, slow your opponent down before you speed yourself up. White wants h5 next: can one of your pawns take that square first?',
        },
      },
      {
        title: 'Open the h-file',
        text:
          'This is what happens when the defender does not slow the storm. Karpov – Korchnoi, Candidates final ' +
          '1974: Black played 12...Nc4 13. Bxc4 Rxc4, trading the bishop that eyed f7 and opening the c-file. A ' +
          'reasonable idea, but nothing stands in the way of your h-pawn now.\n\n' +
          'Think like the attacker. Your king on c1 is safe for the moment: Black’s counterplay, ...Rxc3 and a ' +
          'queen on the queenside, is still a few moves away. So go as fast as you can. The h-file is one pawn ' +
          'move from opening.',
        fen: KARPOV_H5,
        shapes: ['h4h5', 'h5g6:red'],
        task: {
          prompt: 'How do you open a file against the black king?',
          moves: ['h5'],
          hint: 'Your h-pawn is one step from g6. Does it matter whether Black takes it?',
          success:
            '**h5** offers a pawn to open the h-file. Taking it pulls the knight away from f6, its best defensive square; leaving it allows hxg6, and the file opens anyway.',
          why:
            'A pawn for an open file next to the enemy king is almost always a good deal in these races: the pawn ' +
            'costs one move, the open file stays for the rest of the game. Before you push, ask what Black would ' +
            'like to play: ...h5 itself, the brake from the last step. Pushing first takes that option away for good.',
          wrong: {
            g4: '**g4** is a good move too, and often comes first so that h5 is supported. Here h5 at once is simpler: it starts opening the file immediately and rules out ...h5 for good.',
            Kb1: '**Kb1** is a useful move in many such positions, but here it is a tempo spent on defence. Black answers ...h5, and the storm has to start all over again.',
            a4: {
              text: '**a4** stops ...b5, but it is a tempo spent on the wrong wing, and it leaves the pawn loose: **Qa5** and a4 is under fire while your attack has not started.',
              refute: 'Qa5',
            },
          },
          failure:
            'In a race every tempo counts. Your pawns are the battering ram: which one can open a file next to the black king right now?',
          reply: 'Nxh5',
          replyNote:
            'Black takes the pawn. Material counts for little here: the knight has left f6, its best defensive square, and stands on the rim where a pawn can chase it.',
          then: {
            prompt: 'The knight on h5 is a target. How do you gain time against it?',
            moves: ['g4'],
            hint: 'Which pawn can attack the knight, gaining space as it goes?',
            success:
              '**g4** attacks the knight. It has to go back to f6, and the h-file stays open for your rook on h1.',
            why:
              'Each pawn move in a good storm does two jobs: it gains a tempo by attacking something, and it opens a ' +
              'line towards the king, or keeps one open. The pawn on g4 has a future too: one more step, to g5, ' +
              'will kick the knight on f6 again.',
            wrong: {
              Bh6: {
                text: 'Trading the defender is the right idea, but not yet. With the bishop gone from e3, your knight on d4 is loose: ...Rxd4 wins material, because the bishop on g7 covers d4 as well.',
                refute: 'Rxd4',
              },
              Kb1: '**Kb1** is a sensible move, but slow: the knight on h5 is left in peace, and Black keeps the extra pawn with time to regroup. Chase the knight while it is offside.',
              Nf5: {
                text: 'A knight sacrifice that does not work: **Bxf5** takes it, and after exf5 the bishop on g7 bears down on c3. You have given a piece for nothing.',
                refute: 'Bxf5',
              },
              e5: {
                text: 'This opens the long diagonal for the bishop on g7: **Bxe5** and you are two pawns down, with your own king facing the bishop.',
                refute: 'Bxe5',
              },
              a4: {
                text: '**a4** stops ...b5, but it is slow: **Ng3** and the knight escapes from the rim, attacking your rook on h1.',
                refute: 'Ng3',
              },
              g3: {
                text: '**g3** keeps the knight out of g3 for a moment, but the pawn is loose: **Nxg3** takes it and hits the rook on h1.',
                refute: 'Nxg3',
              },
            },
            failure:
              'The knight on h5 is offside. Look for a pawn move that attacks it and keeps the h-file open.',
            reply: 'Nf6',
            replyNote:
              'Black’s only good move: the knight goes back to f6. Black is a pawn up, but your rook on h1 now looks straight down the open h-file at h7.',
          },
        },
      },
      {
        title: 'Trade the defender',
        text:
          'Play went 16.Nde2 Qa5. The knight retreat guards c3, where Black’s exchange sacrifice would land, and ' +
          'the black queen joins the queenside counterattack.\n\n' +
          'Now look at the bishop on g7. It is the best defender Black has: it covers h6, f6 and h8, the dark ' +
          'squares around the king. As long as it stands there, your queen cannot settle on h6. Remove it, and ' +
          'those squares are yours.',
        fen: KARPOV_BH6,
        shapes: ['e3h6', 'g7:red'],
        task: {
          prompt: 'How do you get rid of Black’s best defender?',
          moves: ['Bh6'],
          hint: 'Offer a trade the bishop on g7 can hardly refuse.',
          success:
            '**Bh6** offers to trade bishops. If Black takes, your queen recaptures on h6, right next to the king; if Black declines, Bxg7 removes the defender anyway.',
          why:
            'The fianchettoed bishop is the keystone of the black king’s shelter: without it, f6, g7 and h6 lose ' +
            'their dark-squared guard, and your queen can take up residence on h6. Against a fianchetto, this ' +
            'trade is the first thing to look for. It costs no time either, because Black has to deal with it at once.',
          wrong: {
            g5: {
              text: '**g5** kicks the knight, but it simply goes to h5 and blocks the very file you opened. Trade the bishop first; the pawn can come later.',
              refute: 'Nh5',
            },
            Nd5: {
              text: 'The knight looks active on d5, but it lets Black trade queens with **Qxd2+**, and an attack without queens is over before it starts. Black would still be a pawn up.',
              refute: 'Qxd2+',
            },
            e5: {
              text: 'This opens lines in the wrong place: **Qxe5** takes the pawn, and you are two pawns down with the bishop on g7 still guarding the king.',
              refute: 'Qxe5',
            },
            Kb1: '**Kb1** is a sensible safety move, and you would still stand better. But in a race, spend a tempo on defence only when you must; here the trade on h6 is worth more.',
          },
          failure:
            'Look at the bishop on g7: it guards every dark square around the black king. Which move offers to trade it?',
          reply: 'Bxh6',
          replyNote:
            'Black takes. Declining with ...Rfc8 was just as good, but then Bxg7 removes the defender anyway.',
          then: {
            prompt: 'Recapture. Which piece belongs on h6?',
            moves: ['Qxh6'],
            hint: 'One recapture blocks your own file; the other puts your strongest piece next to the king.',
            success:
              '**Qxh6** puts the queen next to the black king, on a square no black piece can contest, with the rook on h1 behind her.',
            why:
              'Queen in front, rook behind: that is the battery you want on an open file. **Rxh6** would put the ' +
              'rook in front and leave the queen on d2, far from the king. Now only the knight on f6 stops Qxh7+, ' +
              'so everything you do next aims at that knight.',
            wrong: {
              Rxh6: '**Rxh6** recaptures with the wrong piece: the rook stands in front of the queen and blocks the file, and the queen stays on d2, far from the king. Material is the same either way; what matters is where the pieces stand.',
            },
            failure:
              'Recapture on h6, and think about which piece you want next to the black king, with the other one behind it on the h-file.',
            reply: 'Rfc8',
            replyNote:
              'Black doubles rooks on the c-file, aiming at c3 and c2. The race is on: Black’s counterplay is real, so every white move now has to count.',
          },
        },
      },
      {
        title: 'Pawns first, then the deflection',
        text:
          'Play went 19. Rd3 R4c5. The rook move is defensive: it guards c3 along the third rank, because even ' +
          'the attacker must stop a sacrifice that would wreck the cover of their own king. Black’s rook now ' +
          'guards the fifth rank, against g5 and Nd5.\n\n' +
          'Count the defenders of h7. Only the knight on f6 stops Qxh7+, so every white move from here aims at ' +
          'that knight. You still have a pawn that can reach it.',
        fen: KARPOV_G5,
        shapes: ['f6:red', 'h7:red'],
        task: {
          prompt: 'How do you attack the last defender of h7?',
          moves: ['g5'],
          hint: 'The storm is not over. Which pawn can reach the knight on f6?',
          success:
            '**g5** attacks the knight on f6. Wherever the knight goes, it stops guarding h7. Black can take the pawn with the rook, but that pulls a rook away from the c-file.',
          why:
            'Against a well-defended king, attack the defenders rather than the king itself. A pawn is the ' +
            'cheapest attacker there is, and giving it up costs nothing that matters: two extra pawns will not ' +
            'save Black from a mating attack. And the fifth-rank guard Black has just set up is about to become ' +
            'a target too.',
          wrong: {
            Nf4: '**Nf4** is a good move too, bringing another piece towards the king, but it is slower: the knight on f6 stays where it is, and Black gains a tempo for the c-file.',
            Nd5: {
              text: 'Centralising, but **Rxd5** removes the knight at once, and after exd5 Black’s queen gets into your position via a2. The fifth-rank guard has done its job.',
              refute: 'Rxd5',
            },
            Rd5: {
              text: 'The right idea one move too early. Black answers ...Qd8, heading for f8, and with no pawn on g5 the knight on f6 is not under attack.',
              refute: 'Qd8',
            },
            e5: {
              text: 'Wrong pawn: the rook on c5 simply takes it, **Rxe5**, and the knight on f6 still guards h7. Attack the knight, not the pawn in front of it.',
              refute: 'Rxe5',
            },
          },
          failure:
            'Count the defenders of h7: only the knight on f6. Which pawn can attack it right now?',
          reply: 'Rxg5',
          replyNote:
            'Black grabs a second pawn, a natural reply, though ...Nh5 was tougher. Now look at the fifth rank: the queen on a5 protects the rook on g5 along it.',
          then: {
            prompt: 'Black’s queen and rook stand on the same rank. How do you exploit it?',
            moves: ['Rd5'],
            hint: 'A piece dropped between them would cut the line and attack both.',
            success:
              '**Rd5** cuts the fifth rank: it attacks the queen and the rook at once, and the rook on g5, also hit by your queen, has lost its guard. Black’s best is to take on d5.',
            why:
              'This is interference: one move blocks the line between two defenders and attacks both. After ' +
              '**Rxd5 Nxd5** your knight arrives on d5 with gain of time, hitting the knight on f6 and the pawn on ' +
              'e7, and the rook that guarded the kingside is gone. When two enemy pieces protect each other along ' +
              'a line, look at the squares between them.',
            wrong: {
              Nd5: {
                text: 'Natural, but Black takes with the rook, **Rxd5**, and after the recapture the queen raids your queenside with ...Qxa2. Let your rook go first, so that the knight lands on d5 with tempo.',
                refute: 'Rxd5',
              },
              Nf4: {
                text: '**Nf4** brings another piece, but Black answers ...Be6, covering d5, and the fifth rank is shut for good. Strike before the defence regroups.',
                refute: 'Be6',
              },
              a4: {
                text: 'Far too slow: **Rh5** attacks your queen and offers a rook trade on the h-file. Once the file is closed, your attack is over and Black is two pawns up.',
                refute: 'Rh5',
              },
            },
            failure:
              'Look at the fifth rank: the queen on a5 guards the rook on g5 along it. Is there a square between them where a piece of yours attacks both?',
            reply: 'Rxd5',
            replyNote:
              'Black’s best: the rook from g5 takes yours. The kingside has lost its extra defender, and your knight is ready to land on d5 with tempo.',
            then: {
              prompt: 'Recapture. Which piece should land on d5?',
              moves: ['Nxd5'],
              hint: 'One recapture opens a road for Black’s queen; the other brings a piece closer to the black king, with a threat.',
              success:
                '**Nxd5** recaptures towards the king. The knight hits e7, threatening Nxe7+ with a fork of the king and the rook on c8, and it eyes the knight on f6 as well.',
              why:
                '**exd5** would recapture with the wrong unit: it opens a road for Black’s queen to c5 and f2, ' +
                'right into your camp, while the knight on c3 stays passive. Recapture so that the new piece joins ' +
                'the attack with a threat, and your opponent never gets a free move for counterplay.',
              wrong: {
                exd5: {
                  text: 'The pawn recapture opens a road for Black’s queen: after ...Qc5 it heads for f2 and f3, behind your pieces, and Black takes over.',
                  refute: 'Qc5',
                },
              },
              failure:
                'Recapture on d5 with the piece that joins the attack. Which one creates a new threat against the black king?',
              reply: 'Re8',
              replyNote:
                'Black’s best: the rook covers e7 and steps out of the fork. Now your last piece joins in, and the knight on f6 will be attacked again.',
            },
          },
        },
      },
      {
        title: 'The finish',
        text:
          'Play went 23. Nef4 Bc6: the last white knight joined the attack, and Black’s bishop hit the one on d5.\n\n' +
          'h7 is where the game will be decided, with your queen and rook lined up on the h-file and only the ' +
          'knight on f6 in the way. But look at your own king too. Black’s queen on a5 covers e1, and the rook ' +
          'stands on e8: once the e-file opens, ...Re1+ becomes a mating idea. From here on, every move must ' +
          'carry a threat Black has to answer.\n\n' +
          'One pawn has not joined the storm yet.',
        fen: KARPOV_E5,
        shapes: ['f6:red', 'a5e1:red'],
        task: {
          prompt: 'Which pawn can attack the last defender of h7?',
          moves: ['e5'],
          hint: 'Look at the knight on f6. Which of your pawns is one step from attacking it?',
          success:
            '**e5** attacks the knight on f6 with a pawn, and the knight cannot step away without giving up h7. Black’s best is to take your knight on d5 first.',
          why:
            'A pawn is the ideal attacker of a defender: the knight is worth three pawns, the e-pawn one, so Black ' +
            'cannot just ignore it. Compare **Nxf6+**: it swaps your best attacker for the defender, and after ' +
            '...exf6 the attack runs dry. A pawn break is often the last piece of a mating attack, because it opens ' +
            'lines and gains time at once.',
          wrong: {
            'Nxf6+': {
              text: 'That swaps your best attacker for the defender. After **exf6** the black king breathes again and your attack runs out of pieces. Attack the knight with something cheaper.',
              refute: 'exf6',
            },
          },
          failure:
            'The knight on f6 is the last defender of h7. Attack it with something cheaper than a piece: which pawn can reach it?',
          reply: 'Bxd5',
          replyNote:
            'Black’s best try: the bishop removes your knight on d5, which was also attacking f6, before the pawn can take there.',
          then: {
            prompt: 'Two captures are on offer. Which one hits the defence of the king?',
            moves: ['exf6'],
            hint: 'Which black piece guards h7?',
            success:
              '**exf6** removes the knight that guarded h7 and threatens Qg7 mate, so Black has to take back.',
            why:
              '**Nxd5** looks natural, winning a piece back, but Black answers ...dxe5 and nothing attacks f6 any ' +
              'more: Black even stands better. In an attack, take the defender, not the material. Notice how much a ' +
              'single pawn on f6 does: next to the king, it threatens mate on g7.',
            wrong: {
              Nxd5: {
                text: 'That wins back a piece, but Black answers **dxe5**: the knight on f6 is safe, your attack is over, and Black even stands better.',
                refute: 'dxe5',
              },
            },
            failure:
              'Two black pieces are hanging, the bishop on d5 and the knight on f6. Which capture hits the defence of the black king?',
            reply: 'exf6',
            replyNote:
              'Forced, or Qg7 is mate. But the e-file is open now: with the rook on e8 and the queen covering e1, Black threatens ...Re1+ and mate. Give Black one free move and the game turns.',
            then: {
              prompt: 'Black threatens ...Re1+. How do you keep Black too busy to play it?',
              moves: ['Qxh7+'],
              hint: 'Only checks will do now. Where can your queen give one?',
              success:
                '**Qxh7+** takes the pawn with check, backed by the rook on h1. The king has one square, f8.',
              why:
                'With a mate threat hanging over your own king, quiet moves are out. **Nxd5**, for instance, wins a ' +
                'bishop but runs into **Re1+ Rxe1 Qxe1#**. A strong player asks what the opponent threatens before ' +
                'looking at their own attack, and here that question decides the move: check, check and check again.',
              wrong: {
                Nxd5: {
                  text: 'That wins a bishop but ignores Black’s threat: **Re1+ Rxe1 Qxe1#**. With your back rank this weak, every move has to be a check.',
                  refute: 'Re1+',
                },
                Nh5: {
                  text: 'This threatens mate on g7, but it is not a check, and Black mates first: **Re1+ Rxe1 Qxe1#**.',
                  refute: 'Re1+',
                },
              },
              failure:
                'Black threatens ...Re1+ and mate on e1. Only a move that keeps Black busy will do: look for a check.',
              reply: 'Kf8',
              replyNote:
                'The only move. The king heads for e7 and the queenside, and Black still threatens ...Re1+ the moment you pause.',
              then: {
                prompt: 'Keep checking. Which check decides the game?',
                moves: ['Qh8+'],
                hint: 'Look at the rook on e8. Which check attacks it as well?',
                success:
                  '**Qh8+** checks and attacks the rook on e8. After **Ke7 Nxd5+ Qxd5 Re1+** Black loses the queen or the rook. Black resigned here.',
                why:
                  'Compare **Qh6+**: after **Ke7 Nxd5+ Qxd5** Black is two pawns up with the safer king, because ' +
                  'the rook on e8 is not attacked. From h8 your queen keeps the rook in her sights, so the king ' +
                  'cannot escape the checks without dropping it. In a mating attack, look first for the check ' +
                  'that also attacks something.',
                wrong: {
                  'Qh6+': {
                    text: 'Check, but from h6 the queen does not attack the rook on e8. After **Ke7** the king is out of the net, and **Nxd5+ Qxd5** leaves Black two pawns up with the safer king.',
                    refute: 'Ke7',
                  },
                  Nxd5: {
                    text: 'The bishop is tempting, but it is not a check: **Re1+ Rxe1 Qxe1#**. Until Black’s threat is gone, every move must be a check.',
                    refute: 'Re1+',
                  },
                  b4: '**b4** hits the queen, but it is not a check, and Black’s queen gets in first: ...Qa3+ starts a stream of checks against your king, and the attack is over.',
                },
                failure:
                  'Only checks will do while ...Re1+ hangs over your king. Which check also attacks the rook on e8?',
              },
            },
          },
        },
      },
      {
        title: 'The recipe',
        text:
          '**Attacker**: pawns first (h4-h5, g2-g4-g5, and a central break such as e4-e5 to finish), open a file, ' +
          'trade the fianchettoed bishop, bring the queen and a rook onto the file, then aim every move at the last ' +
          'defender. Count tempi, not pawns: White gave two of them away and never looked back.\n\n' +
          '**Defender**: slow the storm (...h5 against h4) before starting your own play, keep the fianchettoed ' +
          'bishop, and look for the exchange sacrifice on c3 that wrecks the attacker’s pawn cover.\n\n' +
          '**Both**: before every move, ask what your opponent threatens. At the end, ...Re1+ was one free move ' +
          'away from mating White.',
        fen: KARPOV_END,
      },
    ],
    practiceThemes: ['kingsideAttack', 'sacrifice', 'attackingF2F7'],
  },

  {
    id: 'converting-an-extra-pawn',
    title: 'Converting an extra pawn',
    level: 'advanced',
    category: 'Endgames',
    summary:
      'A pawn up is a win only if you know the routine: trade pieces, create a passed pawn, ideally an outside one, and use the king.',
    minutes: 9,
    steps: [
      {
        title: 'The routine',
        text:
          'Winning a pawn is the easy part. Converting it follows a routine, and strong players run through it ' +
          'almost without thinking:\n\n' +
          '1. **Trade pieces, not pawns.** Every piece exchange makes the extra pawn weigh more; every pawn exchange brings a draw closer.\n' +
          '2. **Make a passed pawn**, ideally an **outside** one, far from the other pawns.\n' +
          '3. **Use the king**: in the endgame it is a fighting piece.\n' +
          '4. **Do not hurry.** Improve everything first; the pawn is not running away.\n' +
          '5. Give the opponent **two weaknesses** to defend: the passed pawn and something on the other wing.\n\n' +
          'Here you are a pawn up with rooks on, and step one is available right now.',
        fen: TRADE_ROOKS,
        shapes: ['d1d8', 'a2:blue', 'b2:blue'],
      },
      {
        title: 'Trade into the pawn ending',
        text:
          'Before you exchange the last pieces, look at the pawn ending you would get, because there is no way ' +
          'back from it. Count: on the queenside your a- and b-pawns face a single black pawn, so a passed pawn is ' +
          'coming there; on the kingside it is three against three.\n\n' +
          'Then ask what Black wants. Right now, ...Rxd1+: your rook is unguarded, so something has to happen on ' +
          'the d-file this move. And with rooks on, Black’s rook would love to reach your second rank or get ' +
          'behind your pawns, where a pawn up is often a long grind.',
        fen: TRADE_ROOKS,
        task: {
          prompt: 'You are a pawn up. Which move makes the extra pawn count most?',
          moves: ['Rxd8+'],
          hint: 'Every exchange makes an extra pawn weigh more. Can you trade the last pieces on your terms?',
          success:
            '**Rxd8+** trades the last pieces with check. After **Kxd8** it is a pure pawn ending with an extra pawn and a queenside majority, and it is your move.',
          why:
            'Keeping the rooks is not a mistake, but it gives Black hope: an active rook on your second rank or ' +
            'behind your pawns saves many endings a pawn down. In the pawn ending there is nothing to hide behind, ' +
            'and a healthy extra pawn with a majority on one wing is a textbook win. The habit: before you trade ' +
            'the last pieces, check the pawn ending, and if it is won, go into it.',
          wrong: {
            Ke2: {
              text: '**Ke2** is a natural move and you stay better, but it lets Black keep the rooks: ...Rc8 and the black rook becomes active. Why grind out a rook ending when the pawn ending is a clean win?',
              refute: 'Rc8',
            },
          },
          failure:
            'Ahead in material, trade pieces, not pawns. Picture the pawn ending: can you reach it right now, with your move to follow?',
          reply: 'Kxd8',
          replyNote:
            'Black recaptures, and only kings and pawns are left. Your majority will make a passed pawn; the question now is what to do first.',
          then: {
            prompt: 'The pawn ending is won. Which piece do you bring into play first?',
            moves: ['Ke2'],
            hint: 'In a pawn ending one piece decides most fights. Is it in play yet?',
            success:
              '**Ke2** heads for d3 and the centre. From there the king can support the queenside pawns and still reach the kingside.',
            why:
              'In the endgame the king is a fighting piece, and every move it spends on the back rank is wasted. ' +
              'Pawns cannot move backwards, so push them only once you know where they belong. **b4** and **a4** ' +
              'also win, but the king has to come anyway, and bringing it first keeps every option open.',
            wrong: {
              b4: '**b4** also wins: the majority has to advance sooner or later. But pawns cannot move back, so bring the king first and push when you know where they belong.',
              a4: '**a4** also wins, but there is no hurry. Bring the king first, and push the pawns once it can support them.',
              Ke1: '**Ke1** brings the king too, but more slowly: from e2 it reaches d3 a move sooner. When the king walks to the centre, take the diagonal step.',
            },
            failure:
              'In a pawn ending the king is your strongest piece. Bring it towards the centre before you push anything.',
          },
        },
      },
      {
        title: 'The outside passed pawn',
        text:
          'Material is level here, and both sides have a passed pawn, yet White is winning. The difference is ' +
          'where the passers stand: White’s a-pawn is an **outside** passed pawn, far from everything else, while ' +
          'Black’s c-pawn sits next to the white king.\n\n' +
          'The a-pawn is a decoy. The black king must go and stop it, and while it does, White’s king takes c5 ' +
          'and heads for the kingside, for example 1. a5 Kd5 2. Kc3 Kd6 3. Kc4 Kc6 4. a6 Kb6 5. Kd5 Kxa6 6. Kxc5.\n\n' +
          'Now Black’s king is stranded on a6, and White’s is far closer to the kingside pawns. That is why you aim ' +
          'for the outside passed pawn: it wins by pulling the defending king away.',
        fen: OUTSIDE_PASSER,
        shapes: ['a4a6', 'd3c4:blue', 'c5:red'],
      },
      {
        title: 'Trade the queens',
        text:
          'Queens are the hardest pieces to win against. With the queens on, Black can give checks for as long ' +
          'as your king stays in the open, and a single extra pawn is often not enough to stop them.\n\n' +
          'Here you are a pawn up, with three pawns against two on the queenside. The queens face each other on ' +
          'the e-file, and Black’s queen is guarded only by the f-pawn. If they come off, Black recaptures with ' +
          'that pawn, and you get a pawn ending with your majority intact and an isolated black e-pawn.',
        fen: TRADE_QUEENS,
        task: {
          prompt: 'Which move turns your extra pawn into a clean win?',
          moves: ['Qxe6'],
          hint: 'Which black piece gives Black the most counterplay? Can you exchange it right now?',
          success:
            '**Qxe6** forces the queens off. After **fxe6** you have a pawn ending a pawn up, with a queenside majority that will make a passed pawn and a black e-pawn that is isolated.',
          why:
            'With queens on, the defender always has counterplay: checks, or an attack on the pawns behind your ' +
            'back. Without them, your majority and your king decide, and Black has no way to stop both. Whenever ' +
            'you are a pawn up, look at the ending you could trade into, and choose the one with the fewest ' +
            'pieces that is still won.',
          wrong: {
            Qe3: '**Qe3** keeps the queens and the extra pawn, and you stay better. But Black’s queen stays too, and with it the checks and the counterplay. A clean pawn ending is on offer: take it.',
            Qb4: {
              text: 'The queen leaves the e-file to attack b7, but Black takes on a2 instead, **Qxa2**, and the extra pawn is gone.',
              refute: 'Qxa2',
            },
            Qxb7: {
              text: 'Greedy: your queen leaves the e-file and your back rank has no air. **Qe1#** is mate.',
              refute: 'Qe1#',
            },
          },
          failure:
            'Ahead in material, trade pieces. Which black piece is the source of all Black’s counterplay, and can you exchange it now?',
          reply: 'fxe6',
          replyNote:
            'Black has to recapture. Count again: three pawns against two on the queenside, three against three on the kingside, and both kings the same distance from the centre. The majority will decide.',
        },
      },
      {
        title: 'Checklist',
        text:
          '- Ahead in material? **Trade pieces**, and check the pawn ending before the last exchange.\n' +
          '- Make a **passed pawn**, and prefer the **outside** one: it wins by decoying the king.\n' +
          '- **Centralise the king** before pushing anything.\n' +
          '- Ask what the opponent’s counterplay is (a checking queen, an active rook) and take it away first: **do not hurry**.\n\n' +
          'The endgame drill “The outside passed pawn” lets you practise the decoy against the engine.',
        fen: TRADE_QUEENS,
      },
    ],
    practiceThemes: ['endgame', 'advantage'],
  },

  {
    id: 'candidate-moves',
    title: 'Candidate moves and elimination',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'Before calculating anything, list the forcing moves (checks, captures, threats), then eliminate them one by one.',
    minutes: 10,
    practiceDrills: [{ title: 'What’s the threat?', to: '/drills/threats' }],
    steps: [
      {
        title: 'List first, calculate second',
        text:
          'Strong players do not calculate the first move they see. They **list the candidates** first, and the ' +
          'list starts with the forcing moves, because those leave the opponent the fewest replies:\n\n' +
          '1. **Checks**\n' +
          '2. **Captures**\n' +
          '3. **Threats**: mate threats, attacks on loose pieces\n\n' +
          'Then they **eliminate**: for each candidate, find the opponent’s best reply. If it refutes the move, ' +
          'cross it off and move on. Whatever survives is your move, and quite often it is one you would never ' +
          'have looked at seriously.\n\n' +
          'Réti – Tartakower, Vienna 1910. Black has just taken a knight on e4, so White is a piece down, and the ' +
          'knight now eyes d2 and f2. Make the list.',
        fen: RETI_1,
        shapes: ['d3d7:blue', 'd3d8:blue', 'd3e4:blue'],
      },
      {
        title: 'Checks first',
        text:
          'Here is the list: two checks, **Qd7+** and **Qd8+**, and one capture, **Qxe4**. Now eliminate.\n\n' +
          'The capture looks natural, winning the piece back, but the knight on e4 is defended by the queen on ' +
          'e5: after ...Qxe4 you have simply lost your queen. Crossed off.\n\n' +
          'That leaves two checks, and both are queen sacrifices, which is why most players cross them off ' +
          'without calculating. Do not. For each one, ask which black piece would stand on the d-file afterwards, ' +
          'and what your rook on d1 would see.',
        fen: RETI_1,
        task: {
          prompt: 'Two checks, both queen sacrifices. Which one works?',
          moves: ['Qd8+'],
          hint: 'After each capture, which black piece stands on the d-file, and what does your rook on d1 see?',
          success:
            '**Qd8+** leaves Black one legal move, **Kxd8**. Your queen is gone, but the king now stands on the open d-file, with only your bishop between it and the rook.',
          why:
            'Compare the two sacrifices. After **Qd7+** Black takes with the knight or the bishop, and that piece ' +
            'shuts the d-file. After **Qd8+** only the king can take, and it lands right in front of your rook. ' +
            'The bishop on d2 becomes a loaded gun: wherever it moves, the rook gives check. Sacrifices on the ' +
            'list deserve a real look, not a glance.',
          wrong: {
            'Qd7+': {
              text: 'A check and a sacrifice, but Black takes with the knight, **Nxd7**, and the knight on d7 shuts your rook’s file. You are a queen down for nothing.',
              refute: 'Nxd7',
            },
            Qxe4: {
              text: 'The natural move, but the knight on e4 is defended by the queen on e5: after **Qxe4** you have lost your queen for a knight.',
              refute: 'Qxe4',
            },
            Qc4: RETI_QUIET,
            Qb3: RETI_QUIET,
            a3: RETI_QUIET,
            a4: RETI_QUIET,
            c3: RETI_QUIET,
            c4: RETI_QUIET,
            g3: RETI_QUIET,
            h3: RETI_QUIET,
            h4: RETI_QUIET,
            Kb1: RETI_QUIET,
            Be2: RETI_QUIET,
            Ne2: RETI_QUIET,
          },
          failure:
            'Go through the forcing moves first: checks, then captures. One check leaves the black king on the open d-file, in front of your rook.',
          reply: 'Kxd8',
          replyNote:
            'Forced: the king is the only piece that can take. Now it stands on d8, with only your bishop on d2 between it and the rook on d1.',
          then: {
            prompt: 'Every bishop move is a discovered check. Which one does the most damage?',
            moves: ['Bg5+'],
            hint: 'Look for a square where the bishop gives check as well, and also covers the squares the king would run to.',
            success:
              '**Bg5+** is a double check: the bishop checks along the diagonal and the rook along the d-file. The king has to move, and the bishop covers e7.',
            why:
              'A double check is the most forcing move in chess: nothing can block or capture both checkers, so ' +
              'only a king move helps. **Ba5+** is a double check too, but it leaves e7 open, and the king walks ' +
              'out. Bg5+ also takes away the escape square. After ...Ke8 the rook mates on d8; after ...Kc7 ' +
              'the bishop does.',
            wrong: {
              'Ba5+': {
                text: 'Also a double check, but from a5 the bishop does not cover e7. After **Ke8** the king has e7 to run to, and you are simply a queen down.',
                refute: 'Ke8',
              },
              'Bf4+': {
                text: 'A discovered check that also hits the queen on e5, but it is only a single check: Black blocks with **Qd6**, and the attack is over.',
                refute: 'Qd6',
              },
              a3: RETI_TOO_SLOW,
              a4: RETI_TOO_SLOW,
              c3: RETI_TOO_SLOW,
              c4: RETI_TOO_SLOW,
              g3: RETI_TOO_SLOW,
              h3: RETI_TOO_SLOW,
              h4: RETI_TOO_SLOW,
              Be2: RETI_TOO_SLOW,
              Bc4: RETI_TOO_SLOW,
              Ne2: RETI_TOO_SLOW,
              Kb1: { ...RETI_TOO_SLOW, refute: 'Nxd2+' },
            },
            failure:
              'Every bishop move gives a discovered check from the rook. You need the one where the bishop also gives check and takes away the king’s escape square.',
            reply: 'Kc7',
            replyNote:
              'The game went ...Kc7; after ...Ke8 the rook ends it on d8 just as quickly. Either way the king has run out of squares.',
            then: {
              prompt: 'Mate in one: which move ends it?',
              moves: ['Bd8#'],
              acceptAnyMate: true,
              hint: 'Your queen was taken on d8. Which piece can use that square now?',
              success:
                'Mate. The bishop returns to d8, the square where your queen was taken: it checks the king, the rook guards it along the d-file, and every other square is covered or blocked.',
              why:
                'Three forcing moves, and each left Black a single answer or two: a check with one capture, a ' +
                'double check, and mate. That is why the list starts with forcing moves: they are the quickest to ' +
                'calculate to the end, and when they work nothing else matters. A sacrifice you never put on the ' +
                'list is a sacrifice you will never find.',
              failure:
                'Look for a check the king cannot escape: the square where your queen was taken is free again.',
            },
          },
        },
      },
      {
        title: 'Captures in the right order',
        text:
          'You are a pawn up, and two captures are on the board: **Rxd8+** and **Qxe4**. Both seem to win ' +
          'material, but they cannot both come first.\n\n' +
          'Elimination means finding the opponent’s best reply to each candidate before you play it, not the ' +
          'reply you hope for. Look at what each capture leaves behind: which of your pieces guards the rook on ' +
          'd1, and what is the black rook on d8 doing to it?',
        fen: ELIMINATION,
        shapes: ['d1d8', 'e2e4'],
        task: {
          prompt: 'Which capture survives elimination?',
          moves: ['Rxd8+'],
          hint: 'Find Black’s best reply to each capture. Which one leaves your back rank safe?',
          success:
            '**Rxd8+** captures with check, so Black has no time for anything but **Qxd8**. The rook that threatened your back rank is gone, and the bishop on e4 is still loose.',
          why:
            'After **Qxe4 Rxd1+** the queen has left e2, so nothing guards d1: the rook takes with check, and you ' +
            'come out a rook for a bishop down with your back rank under fire. **Rxd8+** comes first because a ' +
            'check takes away Black’s choice: one legal reply, and then the bishop is yours. When two captures ' +
            'are on the board, play the one that leaves the opponent the fewest options.',
          wrong: {
            Qxe4: {
              text: 'The natural capture, but it abandons d1: **Rxd1+** and the rook takes with check, because your queen no longer guards it. You win a bishop and lose a rook.',
              refute: 'Rxd1+',
            },
            Re1: {
              text: '**Re1** steps off the d-file and lines up on the bishop, but Black simply moves it, **Bc6**, and the chance is gone. Capture first.',
              refute: 'Bc6',
            },
          },
          failure:
            'Two captures are on the board. For each one, find Black’s best reply: which leaves your back rank safe?',
          reply: 'Qxd8',
          replyNote:
            'Forced: the queen is the only piece that can take back, and the king has nowhere to go. Now count what is still loose.',
          then: {
            prompt: 'The rook on d8 is gone. What can you take now?',
            moves: ['Qxe4'],
            hint: 'Your queen no longer has to guard d1. Which black piece was loose all along?',
            success:
              '**Qxe4** wins the bishop. Black’s queen can check on d1, but your queen or knight blocks on e1, and you are a piece and a pawn up.',
            why:
              'This is the payoff of getting the order right: the capture that lost a rook one move ago now wins ' +
              'a piece. Before every capture, look for the reply that refutes it, and if there is one, look for a ' +
              'forcing move that removes it first. Checks, captures and threats, in that order, and for both sides.',
            failure:
              'The rook that attacked your back rank has been traded off. Look at the bishop on e4: is anything protecting it?',
          },
        },
      },
      {
        title: 'When the forcing moves fail',
        text:
          'Levitsky – Marshall, Breslau 1912. You are Black, a piece up, but two of your pieces are attacked: ' +
          'the queen on c3 by the rook, and the rook on h3 by the g-pawn. Make the list. Checks: **Ne2+** and ' +
          '**Nf3+**. Captures: **Qxc5**, **Rxh2**, **Nxc2**, **Qxc2** and **Rxf2**. Eliminate them one by one, and ' +
          'the best of them keeps only a small edge; the rest lose outright.\n\n' +
          'When the forcing moves do not win, look for a **threat**: a quiet move that creates more problems ' +
          'than the opponent can solve.',
        fen: MARSHALL,
        orientation: 'black',
        shapes: ['c5c3:red', 'g2h3:red', 'h3h2:blue'],
        task: {
          prompt: 'Your queen is attacked. Where does it go with a threat White cannot meet?',
          moves: ['Qg3'],
          hint: 'Your rook on h3 already eyes h2. Which queen move adds a second attacker, even where pawns can take the queen?',
          success:
            '**Qg3** threatens Qxh2 mate, and pins the g-pawn, so gxh3 is illegal. The queen can be taken three ways, and every one of them loses.',
          why:
            'List White’s answers as carefully as your own: **hxg3 Ne2#**, or **fxg3 Ne2+ Kh1 Rxf1#**, and ' +
            'anything that ignores the queen runs into mate on h2. The only try is **Qxg3**, and your knight wins ' +
            'the queen back with checks. A quiet move can be the most forcing move on the board.',
          wrong: {
            'Ne2+': {
              text: 'The first check on the list, but after **Kh1** the knight has nothing better than more checks, and you keep only a small edge. Checks that lead nowhere are crossed off.',
              refute: 'Kh1',
            },
            'Nf3+': {
              text: 'A knight sacrifice with check: **gxf3** opens the g-file, but you have no follow-up that wins. The edge that is left is small.',
              refute: 'gxf3',
            },
            Qb4: '**Qb4** also wins: the queen escapes, and gxh3 would run into Nf3+, forking the king and queen. But Qg3 does more, threatening mate and winning material by force.',
            Qa3: '**Qa3** also wins: the queen escapes, and gxh3 would still run into Nf3+. But Qg3 does more, threatening mate and winning material by force.',
            Qe3: {
              text: '**Qe3** also offers the queen to a pawn, but it threatens nothing as strong as mate on h2: White answers **Rf5**, challenging your rook on f8, and you keep only a small edge.',
              refute: 'Rf5',
            },
            Qb2: {
              text: '**Qb2** saves the queen, and gxh3 would still run into Nf3+, but White has better: **Qe7**, and with your queen far from the king you keep only a small edge.',
              refute: 'Qe7',
            },
            Rg3: {
              text: 'The rook move threatens nothing White has to fear: **hxg3** simply takes it, and your queen is still attacked.',
              refute: 'hxg3',
            },
            Re3: {
              text: 'That leaves your queen where it was: **Rxc3** takes it.',
              refute: 'Rxc3',
            },
            Rxf2: {
              text: 'The rook grabs a pawn with a threat, but it leaves your back rank bare: **Qd8+** and White mates first.',
              refute: 'Qd8+',
            },
          },
          failure:
            'The checks and captures keep at most a small edge. Your queen must move anyway: look for a square where it attacks h2 together with the rook on h3.',
          reply: 'Qxg3',
          replyNote:
            'White’s only try: hxg3 and fxg3 lose to mate, and every other move allows mate on h2 or worse. Now the knight goes to work.',
          then: {
            prompt: 'Your queen is gone. How do you start winning it back?',
            moves: ['Ne2+'],
            hint: 'A knight check that the king can answer in only one way.',
            success:
              '**Ne2+** leaves the king a single square, h1. From there, Nxg3 comes with check, so the white queen falls with tempo.',
            why:
              'Each check leaves White exactly one reply, which is why forcing lines are so quick to calculate. The ' +
              'point is g3: with the king on h1, Nxg3 comes with check, and White cannot take back, because the ' +
              'h-pawn is pinned by your rook and **fxg3 Rxf1#** is mate.',
            wrong: {
              Rxg3: {
                text: 'Taking back with the rook loses it: **hxg3**, and you have given a queen and a rook for a queen. The knight check first keeps the material.',
                refute: 'hxg3',
              },
            },
            failure:
              'Your queen is gone, so the next move must be forcing. Which check leaves the white king a single square?',
            reply: 'Kh1',
            replyNote: 'The only move: f1, f2, g2 and h2 are all occupied by White’s own pieces.',
            then: {
              prompt: 'How do you win the queen back?',
              moves: ['Nxg3+'],
              hint: 'Which white piece stands on a square your knight can reach with check?',
              success:
                '**Nxg3+** takes the queen with check. After Kg1 the knight escapes with Ne2+, and you are a piece up with the queens off.',
              why:
                'Three forcing moves won it: a queen offer with a mate threat, a check with one reply, and a capture ' +
                'with check. None needed long calculation once it was on the list. When the checks and captures ' +
                'fail, look for the quiet move that threatens more than the opponent can parry, then calculate it ' +
                'with the same forcing tools.',
              wrong: {
                Rxg3: {
                  text: '**Rxg3** takes the queen too, but **hxg3** removes your rook, and the extra material is gone. Take with the knight, with check.',
                  refute: 'hxg3',
                },
              },
              failure:
                'White’s queen stands on g3. Which capture comes with check, so that White has no time to save anything?',
            },
          },
        },
      },
      {
        title: 'The habit',
        text:
          '- Before calculating, **make the list**: checks, captures, threats, for both sides.\n' +
          '- Calculate the **most forcing** candidate first; it is the quickest to eliminate.\n' +
          '- For every candidate, find the opponent’s **best reply**, not the one you hope for.\n' +
          '- When the forcing moves fail, look for the **quiet move** that creates two threats at once.\n\n' +
          'Every puzzle in the trainer is practice for this. Say the list out loud before you touch a piece, and ' +
          'moves like Qd8+ and Qg3 will stop looking impossible.',
        fen: MARSHALL,
        orientation: 'black',
      },
    ],
    practiceThemes: ['quietMove', 'doubleCheck', 'sacrifice'],
  },

  {
    id: 'hanging-pawns-and-maroczy',
    title: 'Planning from the pawn structure: hanging pawns and the Maróczy Bind',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Two structures, two complete plans for both sides: the dynamic c5/d5 pawns and the c4/e4 clamp.',
    minutes: 11,
    steps: [
      {
        title: 'Structure decides the plan',
        text:
          'When you do not know what to do, look at the pawns. Every structure comes with a plan for each side, ' +
          'and the pieces follow the plan.\n\n' +
          '**Hanging pawns** are two pawns side by side on the c- and d-files with no pawns beside them: here ' +
          'Black’s on c5 and d5. They control the centre and can advance with ...d4 or ...c4 to open lines, but ' +
          'no pawn can defend them, and once one of them advances the other can become weak.\n\n' +
          '- The owner keeps the pieces active and **advances at the right moment**, before the pawns become targets.\n' +
          '- The opponent **blockades** the squares in front of them, piles up on them, and tries to provoke a premature advance.',
        fen: HANGING_WHITE,
        shapes: ['c5:red', 'd5:red', 'c4:blue', 'd4:blue'],
      },
      {
        title: 'Against the hanging pawns',
        text:
          'You are White. Ask what Black wants first: active pieces, and the advance ...d4 at a moment when it ' +
          'opens lines towards your king. Your plan is the opposite. Put pieces on the pawns, so that Black has ' +
          'to defend them with pieces, or push one of them before it is ready.\n\n' +
          'The c5 pawn is the softer target. It is defended only by the bishop on d6, while your knight, your ' +
          'rook and later your queen can all be pointed at it.',
        fen: HANGING_WHITE,
        task: {
          prompt: 'How do you start putting pressure on the pawns?',
          moves: ['Na4', 'Rc1', 'Nb5'],
          hint: 'The c5 pawn has one defender. Which of your pieces can aim at the pawn, or at that defender, right away?',
          success:
            'That lines a piece up against c5 or against its only defender, the bishop on d6. Black must defend with pieces or push a pawn, and both suit you.',
          why:
            'Hanging pawns are strong while they stand side by side with active pieces behind them. Every white ' +
            'piece aimed at c5 forces a black piece into passive defence, and sooner or later Black has to decide ' +
            'on ...c4 or ...d4, each of which leaves a hole or a target behind. **Na4**, **Rc1** and **Nb5** all ' +
            'serve that plan; the queen and the other rook join later.',
          wrong: {
            Re1: '**Re1** is a sensible move, but it puts no pressure on the pawns: Black gets a free move to activate a knight, and the pawns stay comfortable.',
            Ne2: '**Ne2** heads for f4 to hit d5, a reasonable plan, but it takes two moves and leaves c5 alone. Strike at the softer pawn first.',
            e4: '**e4** is a real try, striking at d5 with a pawn, but Black need not take: ...d4 gains space by attacking your knight, and c5 is no weaker than before. Pressure on c5 first.',
          },
          failure:
            'The plan against hanging pawns is pressure. The c5 pawn has a single defender: bring a piece to bear on the pawn or on that defender.',
        },
      },
      {
        title: 'With the hanging pawns',
        text:
          'Now switch sides. White played 12.Na4, attacking c5. Look at what else the knight move did: with the ' +
          'knight gone from c3, the bishop on b2 sees straight down the long diagonal to your knight on f6 and ' +
          'the kingside behind it.\n\n' +
          'The passive answer, ...Qe7 or ...Rc8, guards c5 and is perfectly playable. The active one uses what ' +
          'the pawns are for: advance while your pieces stand behind them and the white knight sits on the rim.',
        fen: HANGING_BLACK,
        orientation: 'black',
        shapes: ['a4c5:red', 'b2f6:red'],
        task: {
          prompt: 'Which pawn move uses the hanging pawns?',
          moves: ['d4'],
          hint: 'One advance would shut the bishop on b2 out of play. The other can simply be taken.',
          success:
            '**d4** gains space, attacks e3 and closes the bishop on b2’s diagonal at once, while the knight on a4 is far from the centre.',
          why:
            'Hanging pawns are at their best when they move with a purpose: this advance attacks e3 and answers ' +
            'White’s last move by blocking the long diagonal. **c4** is the wrong pawn, because b3 and the bishop ' +
            'on d3 both attack c4. Before you push a hanging pawn, check which squares the push takes and which ' +
            'it gives up.',
          wrong: {
            c4: '**c4** is the wrong pawn: after **bxc4 dxc4 Bxc4** a pawn is simply gone, and your centre with it.',
            Qe7: '**Qe7** is a good move too, the solid way: the queen guards c5 and the pawns stay side by side. But this step is about using the pawns while the white knight is offside.',
            Ne4: '**Ne4** is a good, active move as well. But this step is about the pawns themselves: ...d4 uses them while the white knight is offside.',
            Bc7: {
              text: 'The bishop is the only guard of c5. Once it leaves d6, **Nxc5** takes the pawn, and the hanging pawns become one isolated pawn.',
              refute: 'Nxc5',
            },
            Bb8: {
              text: 'Aiming at h2 is a familiar idea, but the bishop is the only guard of c5: **Nxc5** takes the pawn, and the hanging pawns become one isolated pawn.',
              refute: 'Nxc5',
            },
          },
          failure:
            'This step is about the pawns: one of them can advance now, gaining space and closing the bishop on b2’s diagonal.',
        },
      },
      {
        title: 'The Maróczy Bind',
        text:
          'Pawns on **c4 and e4** against a Sicilian pawn on d6: the Maróczy Bind. White has a grip on **d5** ' +
          'and **b5**, so Black’s freeing breaks, ...b5 and ...d5, need long preparation, and Black usually ' +
          'settles for active pieces, a knight on c5 and sometimes ...f5.\n\n' +
          '- White: no hurry. Improve the pieces, then use the **b3-b4** lever to drive the knight off c5, or ' +
          'play Nd5 at the right moment.\n' +
          '- Black: exchange pieces where you can, because the side with less space suffers most from having ' +
          'too many, and keep the bishop on g7, which presses along the long diagonal.',
        fen: MAROCZY_WHITE,
        shapes: ['c4:blue', 'e4:blue', 'd5:green', 'b5:green', 'c5:red'],
      },
      {
        title: 'Prepare the lever',
        text:
          'White wants b4 to drive the knight from c5, and with Black’s pawn on a5, something has to be ready ' +
          'to recapture after ...axb4.\n\n' +
          'Before you start, ask what Black wants, and look along the long diagonal. The bishop on g7 looks ' +
          'through your knight on c3 at the rook on a1. Move the knight, or loosen the pawn on b3, and that rook ' +
          'is in trouble; Black’s pieces are waiting for exactly that. The right preparation deals with both ' +
          'problems at once.',
        fen: MAROCZY_WHITE,
        shapes: ['g7a1:red', 'b3b4'],
        task: {
          prompt: 'How do you prepare b4 without walking into the bishop on g7?',
          moves: ['Rab1'],
          hint: 'Which rook move takes the rook off the long diagonal and puts it behind the b-pawn?',
          success:
            '**Rab1** takes the rook off the bishop’s diagonal and puts it behind the b-pawn. Now b4 is a real threat: after ...axb4 the rook recaptures.',
          why:
            'Look at what goes wrong without it. **a3** loosens b3, and ...Nxb3 forks your queen and the rook on ' +
            'a1. **b4** at once runs into ...axb4, with the knight on c3 pinned against that rook. **Nd5** lets ' +
            'the bishop take on a1. One quiet rook move removes all three tactics and prepares the plan: ' +
            'prophylaxis first, then the lever.',
          wrong: {
            a3: {
              text: 'The natural way to prepare b4, but it loosens b3: **Nxb3** forks your queen and the rook on a1.',
              refute: 'Nxb3',
            },
            b4: {
              text: 'Too soon: after **axb4** the knight on c3 is attacked, and it cannot move because the bishop on g7 would take the rook on a1. You lose material.',
              refute: 'axb4',
            },
            Nd5: {
              text: 'The thematic jump, but it opens the long diagonal: **Bxa1** takes the rook. The knight has to wait until a1 is safe.',
              refute: 'Bxa1',
            },
            Rac1: '**Rac1** is a good move too: it also takes the rook off the diagonal. But from c1 it does not support b4, the plan this step is about.',
            f4: {
              text: 'This loosens e4: **Nxe4**, and your knight on c3 cannot take back without opening the long diagonal to the rook on a1.',
              refute: 'Nxe4',
            },
          },
          failure:
            'Look along the long diagonal from g7 to a1, and at the b4 square. One rook move deals with both.',
          reply: 'Qb6',
          replyNote:
            'Black has seen the plan: from b6 the queen already watches b4. In the next step you take Black’s side of this fight.',
        },
      },
      {
        title: 'Stop the lever',
        text:
          'Now you are Black. Play went 15.Rab1 Qb6 16.Rfc1, and White is ready for b4.\n\n' +
          'This is the moment for the prophylactic question: what does White want? To play b4 and drive your ' +
          'knight from c5, its best square. You can answer a plan by preparing your own, or by making it ' +
          'impossible. Look at the b4 square, and at the knight on c3: what stands behind it on the diagonal?',
        fen: MAROCZY_BLACK,
        orientation: 'black',
        shapes: ['b3b4:red', 'c5:blue'],
        task: {
          prompt: 'How do you make White’s lever impossible?',
          moves: ['Qb4'],
          hint: 'Occupy the square the pawn wants, with a piece that also attacks something.',
          success:
            '**Qb4** sits on the square White’s pawn needed, pins the knight on c3 against the queen on d2, and offers a queen trade.',
          why:
            'Prophylaxis: see the plan, take the square. With less space, Black is glad to trade queens, and the ' +
            'pin makes White deal with it at once. It wins nothing by force, and quieter moves such as ...Rfc8 are ' +
            'playable too, but none of them stops the plan so directly. In every cramped position, ask what your ' +
            'opponent wants next, and whether you can simply prevent it.',
          wrong: {
            a4: {
              text: 'The natural queenside push, but it walks into the lever: **b4** attacks the knight on c5, and with your pawn gone from a5 nothing can take on b4. White wins a piece.',
              refute: 'b4',
            },
            Nxb3: {
              text: 'The knight grabs a pawn and hits the queen and the rook on c1, but the rook on b1 simply takes it: after **Rxb3** you are a piece down for a pawn.',
              refute: 'Rxb3',
            },
            Rfc8: '**Rfc8** is a reasonable move too, adding a rook to the c-file. But it lets White carry on with the plan; ...Qb4 takes the square away first.',
          },
          failure:
            'White wants b4 to drive your knight from c5. Which square does the pawn need, and which of your pieces can occupy it with gain of time?',
        },
      },
      {
        title: 'Reading a structure',
        text:
          'Ask three questions in any middlegame:\n\n' +
          '1. Which pawns are fixed, and which squares do they leave weak?\n' +
          '2. What is my **pawn break**, and what is my opponent’s?\n' +
          '3. Which piece is doing the least, and where is the square the structure gives it?\n\n' +
          'Hanging pawns: advance at the right moment, or be attacked. The Bind: levers and outposts for White, ' +
          'exchanges and prophylaxis for Black, and no hurry for either. Compare the isolated queen’s pawn and ' +
          'the Carlsbad structure from the earlier lessons.',
        fen: MAROCZY_BLACK,
        orientation: 'black',
      },
    ],
    practiceThemes: ['middlegame', 'advantage'],
  },
];
