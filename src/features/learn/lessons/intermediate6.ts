import { fenAfter, type Lesson } from '../model';

// Attacking the fianchetto (positions from Lichess games, CC0 puzzle database).
const FIAN_STRUCTURE = fenAfter(
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. O-O-O',
);
const FIAN_TRADE = 'r2q1rk1/ppp1ppbp/6p1/3P4/2nB4/5R2/PP4PP/RN1Q2K1 w - - 0 15';
const FIAN_TRADE_2 = 'r3r1k1/1ppq1pbp/p2p2p1/3N4/2P1n3/1P1QP1P1/PB3PK1/R4R2 w - - 5 19';
const FIAN_DARK = 'r5k1/pbp2p1p/2q1rBp1/1p6/1P5Q/P2P1R2/5PPP/R5K1 w - - 6 21';
const FIAN_HFILE = 'r1b2rk1/pp2qp1p/4p1p1/2np3P/3p4/6RQ/PPP1NPP1/1K4NR w - - 5 17';
const FIAN_QH6 = '2r2rk1/pp1n1p1p/1q2p1p1/3p3R/8/P2B1n1P/2PQNP2/6RK w - - 0 21';

// Defending the Greek gift (positions from Lichess games, CC0 puzzle database).
const GG_WORKS = 'r1bq1rk1/pp2nppp/2n1p3/2bpP3/8/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 4 9';
const GG_TAKE = 'rn1q1rk1/pb3ppB/1p2p3/3n4/1b1P4/2N2N2/PP1B1PPP/R2Q1RK1 b - - 0 11';
const GG_ROOK = fenAfter(
  'Kxh7 Ng5+ Kg8 Qh5',
  'rnbq2k1/ppp1b1pB/1n2pr2/3p4/3P4/2P2N2/PP3PPP/RNBQ1RK1 b - - 0 11',
);
const GG_BISHOP = fenAfter(
  'Kxh7 Ng5+',
  'r1bq1rk1/p2nbppB/1p2p3/3p3n/3P1B2/2N1PN2/PP3PPP/R2QK2R b KQ - 0 10',
);
const GG_KNIGHT = '3r1rk1/pb3ppB/1p2pn2/2q3N1/7P/8/PPPQ1PP1/2KRR3 b - - 0 18';
const GG_CALM = fenAfter(
  'Kxh7 Ng5+',
  'r2q1rk1/ppp2ppB/2nnbb2/8/5B1P/2P2N2/PP1N1PP1/R2QK2R b KQ - 0 11',
);

// Bishop endgames (positions from Lichess games, CC0 puzzle database).
const BE_GOOD_BAD = '8/8/1p2p2p/1Pp1k1p1/2P1P1P1/1b1BK1P1/8/8 b - - 6 41';
const BE_TRADE = '8/p2b4/1pk5/3p1p1p/1K1P1Pp1/2PB2P1/P6P/8 w - - 8 35';
const BE_TRADE_2 = '8/5b2/3p1kB1/2pP1P1p/1pP2K2/1P6/8/8 w - - 6 57';
const BE_DECOY = '8/6p1/p2Pk2p/2Pb4/3K3P/8/PP6/8 w - - 1 45';
const BE_WRONG = '6k1/8/5K2/7P/8/3B4/8/8 b - - 0 1';

// Pawn endgames III.
const PE_SQUARE = '8/8/8/5k2/1P6/8/8/6K1 b - - 0 1';
const PE_KEY = '8/8/8/2k5/8/3K4/3P4/8 w - - 0 1';
const PE_OUTSIDE = fenAfter('Kd4 Kc6', '8/8/3k4/5p2/5P2/1P1K4/8/8 w - - 0 1');
const PE_TRIANGLE = '8/2k5/3p4/1K1P4/8/8/8/8 w - - 0 1';
const PE_BREAK = '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1';
const PE_RETI = '7K/8/k1P5/7p/8/8/8/8 w - - 0 1';

// Bishop and knight mate.
const BN_MATE_A = 'k7/7B/NK6/8/8/8/8/8 w - - 0 1';
const BN_MATE_H = '7k/8/6KN/6B1/8/8/8/8 w - - 0 1';
const BN_NET = '6k1/4B3/6K1/5N2/8/8/8/8 w - - 0 1';
const BN_EDGE = '1k6/8/2K5/4N3/5B2/8/8/8 w - - 0 1';
const BN_WALK = fenAfter('Nd7+ Ka8 Be5 Ka7', BN_EDGE);
const BN_RUN = fenAfter('Nd7+ Kc8', BN_EDGE);

// Queen vs rook.
const QR_START = '1k6/1r6/2K5/8/8/8/8/4Q3 w - - 0 1';
const QR_CHECKS = fenAfter('Qa5 Rb1 Qd8+ Ka7', QR_START);
const QR_RUN = fenAfter('Qa5 Rh7', QR_START);
const QR_KING = fenAfter('Qa5 Kc8', QR_START);

export const intermediateLessons6: Lesson[] = [
  {
    id: 'attacking-the-fianchetto',
    title: 'Attacking the fianchetto',
    level: 'intermediate',
    category: 'Tactics',
    summary:
      'A fianchettoed king is only as safe as its bishop. How to trade the g7-bishop, open the h-file, and use the dark squares it leaves behind.',
    minutes: 12,
    practiceThemes: ['kingsideAttack', 'sacrifice'],
    steps: [
      {
        title: 'Two weak points',
        text:
          'A fianchetto looks solid: a pawn on g6, a bishop on g7, and the king tucked in behind them. Whenever I meet one, I ask two questions.\n\n' +
          '- **Can I get rid of that bishop?** It guards the dark squares around the king. Trade it, and f6, g7 and h6 are left without a guard.\n' +
          '- **Can I open the h-file?** The pawn on g6 is a hook. Push h4–h5, and after hxg6 a rook or the queen can land on h7 or h8.\n\n' +
          'This is the Sicilian Dragon with White castled long, so both plans are ready: the bishop on e3 can go to h6, the pawn on h2 to h5.',
        fen: FIAN_STRUCTURE,
        shapes: ['e3h6', 'h2h4:blue', 'h4h5:blue', 'g7:red'],
      },
      {
        title: 'Trade it, then fork',
        text:
          'You are two pawns down, but nothing protects Black’s knight on c4. Now look along the long diagonal: your bishop on d4 and Black’s bishop on g7 face each other. If you take on g7, you also attack the rook on f8, so only the king can take back.\n\n' +
          'Where does that recapture leave the king, and what could your queen on d1 do about it?',
        fen: FIAN_TRADE,
        shapes: ['d4g7', 'c4:red'],
        task: {
          prompt: 'Which capture sets up a check that also hits the knight?',
          moves: ['Bxg7'],
          hint: 'Which black piece guards the long diagonal, and who must take back if you remove it?',
          success:
            '**Bxg7** takes the king’s bodyguard and attacks the rook on f8, so the king has to recapture and step onto the long diagonal.',
          why: 'The bishop on g7 covers the dark squares around the king. Take it and the king must recapture, which puts it on a diagonal your queen can reach. Declining is no better: after ...Re8 Qd4 your bishop is safe and the knight is attacked too. Before you trade a bishop, ask where the recapture will put the king.',
          wrong: {
            Qd3: {
              text: '**Qd3** attacks the knight and guards your bishop, but it leaves the pawn on d5 hanging. After ...Qxd5 the knight is protected too, your bishop on d4 is attacked twice, and you are three pawns down.',
              refute: 'Qxd5',
            },
            Bc3: {
              text: '**Bc3** saves the bishop but gives up the whole idea. You are still two pawns down, and after ...e5 the knight on c4 is as strong as before.',
              refute: 'e5',
            },
          },
          failure:
            'Look at the bishop on g7. If it is traded off, where does the black king have to stand?',
          reply: 'Kxg7',
          replyNote:
            'Black has to take back, or White is a bishop up with the rook on f8 attacked as well. The king now stands on the long diagonal, in front of your queen.',
          then: {
            prompt: 'Which queen move checks the king and attacks something else?',
            moves: ['Qd4+'],
            hint: 'The king is on g7. Find the square on its diagonal from which the queen also hits the knight.',
            success:
              '**Qd4+** checks along the long diagonal, and from d4 the queen attacks the loose knight on c4 along the fourth rank.',
            why: 'A fork is at its best when one target is the king: Black must answer the check, so the knight cannot be saved. Whenever you can give a check, ask what else the checking piece attacks, and what else is loose.',
            wrong: {
              Qd3: {
                text: '**Qd3** attacks the knight but gives no check, so Black has a free move: ...Ne5 saves the knight and forks your queen and rook.',
                refute: 'Ne5',
              },
              Rc3: {
                text: '**Rc3** attacks the knight too, but without a check Black simply moves it: ...Ne5, and the king is safe again.',
                refute: 'Ne5',
              },
              Rh3: {
                text: '**Rh3** aims at the h7 pawn, but it is slow: ...Ne5 saves the knight, and you are two pawns down with the attack gone.',
                refute: 'Ne5',
              },
            },
            failure:
              'A quiet attack on the knight lets it run away. Look for a check, from a square that also hits the knight.',
            reply: 'e5',
            replyNote:
              'Black blocks with the pawn, which also attacks your queen. But it is still your move, and the knight is still loose.',
            then: {
              prompt: 'Your queen is attacked, but it is your move. What does she take?',
              moves: ['Qxc4'],
              hint: 'Nothing guards the knight.',
              success:
                '**Qxc4** wins the knight and puts the queen out of the pawn’s reach. You were two pawns down; now you have a knight for them.',
              why: 'One trade and one check turned the position. The g7-bishop held Black’s game together, and once it was gone the king itself was the target. Notice the pawn on e5: it looks free, but the knight on c4 guards it.',
              wrong: {
                'Qxe5+': {
                  text: 'It looks like a free pawn with check, but the knight on c4 guards e5: ...Nxe5 and your queen is gone.',
                  refute: 'Nxe5',
                },
              },
              failure:
                'Your queen is attacked, so she has to move, and one capture wins a whole piece.',
            },
          },
        },
      },
      {
        title: 'The same trap, one move deeper',
        text:
          'Another long diagonal, and the same duel: your bishop on b2 and Black’s bishop on g7 attack each other, and yours has no defender. You are a pawn down. This time the black knight on e4 is guarded by the rook on e8, so a check will not win it at once.\n\n' +
          'See whether the recipe from the last step still works.',
        fen: FIAN_TRADE_2,
        shapes: ['b2g7', 'e4:red'],
        task: {
          prompt: 'Your bishop is attacked. Is there something better than moving it?',
          moves: ['Bxg7'],
          hint: 'Think about where the king stands after it recaptures.',
          success:
            '**Bxg7** takes the attacker before it takes you, and drags the king onto the long diagonal.',
          why: 'One capture solves two problems: your bishop was attacked, and the king now stands where your queen can check it. When a piece of yours is attacked, look at capturing the attacker before you think of running. Here the bishop on g7 was the king’s best defender, and now it is gone.',
          wrong: {
            f3: {
              text: '**f3** attacks the knight, but your own bishop is still hanging: ...Bxb2 wins it and hits the rook on a1 as well.',
              refute: 'Bxb2',
            },
            Bd4: {
              text: '**Bd4** is a sensible move that offers a trade, and the game stays roughly level. But it misses what Bxg7 wins: a whole piece.',
            },
          },
          failure: 'Your bishop on b2 is attacked by the bishop on g7. What if you take it first?',
          reply: 'Kxg7',
          replyNote:
            'The king recaptures, as in the last step. The knight on e4 is better guarded this time, so look for more than a plain fork.',
          then: {
            prompt: 'Same check as before. Where does the queen go?',
            moves: ['Qd4+'],
            hint: 'The king is on g7 again: use the long diagonal.',
            success:
              '**Qd4+** checks along the long diagonal. The knight on e4 is guarded this time, so the check wins nothing yet.',
            why: 'The queen on d4 covers c3, c5 and d2, three of the knight’s escape squares. Black has to deal with the check first, and the cheapest ways, ...f6 or ...Re5, leave the knight with very few squares.',
            wrong: {
              f3: {
                text: '**f3** attacks the knight at once, but without a check Black has time: ...Nf6 and it escapes. Check first, so that the queen reaches d4 with tempo.',
                refute: 'Nf6',
              },
            },
            failure: 'Look for a check along the long diagonal.',
            reply: 'f6',
            replyNote:
              'Black blocks with the f-pawn. The diagonal is shut, but f6 was one of the knight’s squares, and now it has almost none left.',
            then: {
              prompt: 'The knight is guarded but nearly trapped. How do you attack it?',
              moves: ['f3'],
              hint: 'A pawn can attack a knight without being attacked by it.',
              success:
                '**f3** attacks the knight with a pawn. It has nowhere safe to go: even ...Nxg3 Kxg3 only gets a pawn for it.',
              why: 'Count its squares: the queen covers c3, c5 and d2, and on g3 it is taken for a pawn. Quiet moves like f3 are easy to miss when your eyes are on checks. Always ask where the enemy piece can go.',
              failure:
                'The knight has almost no squares left. Find the quiet move that attacks it.',
            },
          },
        },
      },
      {
        title: 'The sacrifice on h7',
        text:
          'Here the fianchetto bishop is long gone, and a white bishop has taken its place on f6, the very square it used to guard. From f6 it covers g7 and h8, so the king on g8 has no way out. Your queen on h4 looks down the h-file at h7, and your rook on f3 can swing across to h3.\n\n' +
          'Black’s rook is attacking your bishop, but when the king is this cramped I look at the checks first.',
        fen: FIAN_DARK,
        shapes: ['f6:red', 'h4h7', 'f3h3:blue'],
        task: {
          prompt: 'Which sacrifice leads to mate in three?',
          moves: ['Qxh7+'],
          hint: 'Which of your pieces can give check right now, and what happens if the king takes it?',
          success:
            '**Qxh7+** takes the pawn with check. The king has to take the queen, because ...Kf8 Qh8 mate.',
          why: 'Count what points at the corner: the bishop covers g7 and h8, the queen sits on the h-file and the rook is one move from it. Black has nothing near the king to help. When the g7-bishop is gone and one of your bishops lands on f6, look for the sacrifice on h7.',
          wrong: {
            Rh3: {
              text: '**Rh3** is the natural way to bring the rook in, but that rook was shielding g2 from Black’s queen and bishop on the long diagonal: ...Qxg2 is mate.',
              refute: 'Qxg2#',
            },
            a4: {
              text: '**a4** attacks the pawn on b5, but it gives Black a move: ...h5 clears h7 for the king, and the sacrifice no longer works.',
              refute: 'h5',
            },
          },
          failure:
            'Look for a forcing sacrifice: the bishop on f6 covers g7 and h8, and Black’s king has nowhere to run.',
          reply: 'Kxh7',
          replyNote:
            'Black takes the queen. ...Kf8 Qh8 mate would be quicker, so this is the longest defence. The king now stands on the open h-file.',
          then: {
            prompt: 'The king is on the h-file. How does the rook join in?',
            moves: ['Rh3+'],
            hint: 'The king stands on the h-file.',
            success:
              '**Rh3+** checks along the h-file. The rook leaves f3 with check, so Black has no time for ...Qxg2.',
            why: 'The queen dragged the king onto the open file, and now the bishop and the rook take every square near it. The check matters as much as the geometry: a quiet rook move would have allowed ...Qxg2 mate. In a sacrificial attack, keep every move forcing until the mate.',
            failure: 'The king is on h7 and the h-file is open: bring the rook there with check.',
            reply: 'Kg8',
            replyNote:
              'Black’s only move: the bishop covers g7 and h8, and the rook rules the h-file.',
            then: {
              prompt: 'Checkmate in one.',
              moves: ['Rh8#'],
              acceptAnyMate: true,
              hint: 'The bishop on f6 covers g7, so the rook only needs to check.',
              success:
                '**Rh8#**: the rook checks from the corner, and the bishop on f6 protects it and covers g7.',
              why: 'Queen, rook and bishop against a king whose own bishop is gone. Remember the pattern: a bishop on f6 (or a queen on h6), a sacrifice on h7 and a rook on the h-file.',
              failure: 'Not mate yet: check the king with the rook, and keep g7 covered.',
            },
          },
        },
      },
      {
        title: 'Open the h-file',
        text:
          'Your pawn on h5 has been pointing at g6 for some time, and everything is lined up behind it: the queen on h3, a rook on g3 and another on h1. This is the second plan from the first step: g6 is the hook, h5 the lever.\n\n' +
          'Capture on g6 and the h-file opens, with three pieces aimed at the king at once.',
        fen: FIAN_HFILE,
        shapes: ['h5g6', 'h3h8:blue'],
        task: {
          prompt: 'Which capture opens the h-file?',
          moves: ['hxg6'],
          hint: 'A pawn on h5 attacks g6. What happens when it captures?',
          success:
            '**hxg6** takes the hook. The pawn now attacks f7 and h7, and the queen and rook behind it look down the h-file.',
          why: 'Open the file first, then sacrifice. Black cannot take back with the h-pawn: ...hxg6 Qh8 mate. So the f-pawn takes, and the king loses a defender. Before you throw a rook at a king, ask whether one quiet capture can make the sacrifice work.',
          wrong: {
            'Rxg6+': {
              text: '**Rxg6+** is the right idea at the wrong moment. After ...fxg6 hxg6 you have given a rook for two pawns, and the pawn on h7 still shuts the h-file.',
              refute: 'fxg6',
            },
          },
          failure: 'Your pawn on h5 is the lever. What does it attack?',
          reply: 'fxg6',
          replyNote:
            'The f-pawn takes, because ...hxg6 Qh8 mate. Now g6 holds a black pawn again, defended only by the pawn on h7.',
          then: {
            prompt: 'Now the sacrifice. How do you break the king’s cover?',
            moves: ['Rxg6+'],
            hint: 'Which pawn guards g6, and what happens to the h-file if it has to recapture?',
            success:
              '**Rxg6+** takes the pawn with check. If ...hxg6, the h-file is open and the queen can land on h8 with check.',
            why: 'The pawn on h7 does two jobs: it guards g6 and it shuts the h-file. Capture what it guards and it must leave its post. Declining with ...Kh8 does not help, because Rh6 keeps the attack going. When a defender has two jobs, give it a third.',
            wrong: {
              Rg5: {
                text: '**Rg5** adds nothing: ...Qg7 defends g6 and the king, and the pressure is gone.',
                refute: 'Qg7',
              },
              a4: {
                text: '**a4** is a waiting move, and Black uses the time: ...Qg7 defends g6 and the king, and White has nothing left.',
                refute: 'Qg7',
              },
              Nc1: {
                text: '**Nc1** brings a knight round, but it takes too long: ...Qg7 and the pawn on g6 is safe.',
                refute: 'Qg7',
              },
            },
            failure: 'Look for a check that drags the h-pawn off the h-file.',
            reply: 'hxg6',
            replyNote:
              'Black takes the rook. The other choice, ...Kh8, loses to Rh6. But the h-file is now open.',
            then: {
              prompt: 'Where does the queen land with check?',
              moves: ['Qh8+'],
              hint: 'The rook on h1 stands behind the queen on the same file.',
              success:
                '**Qh8+** checks from the corner. The rook on h1 protects the queen, so the king cannot take her.',
              why: 'Queen in front, rook behind: a battery on an open file. The queen goes first because the rook protects her. The king now has a single square, f7, and it lands on the same rank as its own queen.',
              wrong: {
                a4: {
                  text: '**a4** loses a tempo: ...Qg7 covers the king and the h-file, and you are a rook down for a pawn.',
                  refute: 'Qg7',
                },
                Nf4: {
                  text: '**Nf4** attacks g6 again, but ...Qg7 defends it, and you are still a rook down for a pawn.',
                  refute: 'Qg7',
                },
                Ng3: {
                  text: '**Ng3** blocks nothing useful: ...Qg7 covers the king, and the attack has run dry.',
                  refute: 'Qg7',
                },
                Nc1: {
                  text: '**Nc1** is far too slow: ...Qg7, and there is nothing left on the h-file to hit.',
                  refute: 'Qg7',
                },
              },
              failure:
                'The h-file is open and the rook stands behind the queen: check the king there.',
              reply: 'Kf7',
              replyNote:
                'The only square. Look along the seventh rank: the king and its queen stand there together.',
              then: {
                prompt: 'Which rook move checks the king and attacks the queen behind it?',
                moves: ['Rh7+'],
                hint: 'The king and the queen are on the same rank.',
                success:
                  '**Rh7+** is a skewer: the king must step aside, and the rook takes the queen on e7.',
                why: 'A check with a more valuable piece lined up behind the king wins that piece. After ...Ke8 Rxe7+ Kxe7 Qxd4 White has won a queen for a rook, and the attack goes on. A skewer is the check to look for when the king and the queen stand on one line.',
                failure: 'The king and the queen stand on the same rank. Check along it.',
              },
            },
          },
        },
      },
      {
        title: 'The queen on h6',
        text: 'Black’s knight has just jumped to f3, attacking your queen and your rook on g1. Retreating loses material, so look for a threat that is bigger than his. Your rook on h5 and your bishop on d3 already point at Black’s king, and the pawn on g6 is the only cover it has.',
        fen: FIAN_QH6,
        shapes: ['d2h6', 'h5h7:blue', 'd3g6:blue'],
        task: {
          prompt: 'Which queen move threatens mate on h7?',
          moves: ['Qh6'],
          hint: 'Your rook on h5 is already on the h-file. Where must the queen stand for Qxh7 to be mate?',
          success: '**Qh6** saves the queen and threatens Qxh7 mate, supported by the rook on h5.',
          why: 'When two of your pieces are attacked, a threat of your own beats a retreat. The queen on h6 is the dream square against a fianchetto: with the bishop gone, g7 and h7 are mating squares. Black’s only defence is ...Nf6, and then the pawn on g6 becomes the target.',
          wrong: {
            Qf4: {
              text: '**Qf4** attacks the knight, but it is Black’s move: ...Nxg1 takes the rook, and your attack is gone while Black has won the exchange.',
              refute: 'Nxg1',
            },
            Bxg6: {
              text: '**Bxg6** is the right sacrifice at the wrong moment: after ...fxg6 the knight on f3 still attacks your queen and your rook, and you have thrown a bishop away.',
              refute: 'fxg6',
            },
          },
          failure: 'Do not retreat: find the queen move that makes a mating threat on h7.',
          reply: 'Nf6',
          replyNote:
            'The toughest defence: the knight covers h7 and attacks the rook on h5. But it has left d7, and the pawn on g6 is now the king’s only cover.',
          then: {
            prompt: 'The knight guards h7. Which sacrifice removes the king’s last cover?',
            moves: ['Bxg6'],
            hint: 'Which pawn shelters the king?',
            success:
              '**Bxg6** takes the pawn that shelters the king. Now Bxh7+ would be a double check, from the bishop and from the rook on g1.',
            why: 'A sacrifice is justified when it removes the last cover. If Black ignores the bishop, Bxh7+ Kh8 Qg7 mate: only the king can answer a double check. So ...fxg6 is forced, but the f-pawn has left f7, and the g-file is open for your rook.',
            failure: 'The king’s cover is one pawn. Remove it with a sacrifice.',
            reply: 'fxg6',
            replyNote:
              'Black takes: anything else loses at once to Bxh7+. The pawn on g6 is again the king’s only cover.',
            then: {
              prompt: 'The g-file is open. How does the rook come in with check?',
              moves: ['Rxg6+'],
              hint: 'The rook on g1 looks up the g-file at the pawn that has just recaptured.',
              success:
                '**Rxg6+** takes the pawn with check, and the king has no good square: ...hxg6 Qxg6 mate, ...Kh8 Qg7 mate.',
              why: 'Count what is left: no bishop, no f-pawn, a king with one flight square. After ...Kf7 Rxf6+ Ke7 Qg7+ Black is lost. The queen on h6 was the key from the start: it made g7 and h7 into mating squares.',
              wrong: {
                Ng3: {
                  text: '**Ng3** gives Black the move, and ...Qxf2 turns the game round: Black’s queen and knight attack your own king.',
                  refute: 'Qxf2',
                },
              },
              failure: 'The rook on g1 can take the pawn on g6 with check.',
            },
          },
        },
      },
      {
        title: 'The attacker’s checklist',
        text:
          'Here is what I run through whenever I see a fianchetto.\n\n' +
          '- **Trade the g7-bishop.** Bh6, or a capture on g7. Everything else gets easier once it is gone.\n' +
          '- **Push h4–h5.** It is the lever; hxg6 opens the file once a rook or the queen can use it.\n' +
          '- **Take the dark squares.** A bishop on f6 or a queen on h6 turns g7, h7 and h8 into mating squares.\n' +
          '- **Look for sacrifices** on h7 and g7 whenever a rook can reach the h-file with check, and keep every move forcing.\n\n' +
          'Practise with the kingside-attack puzzles below.',
        fen: FIAN_STRUCTURE,
      },
    ],
  },
  {
    id: 'defending-the-greek-gift',
    title: 'Defending the Greek gift',
    level: 'intermediate',
    category: 'Tactics',
    summary:
      'Bxh7+ is the most famous sacrifice in chess, and it is unsound about as often as it works. Learn what the attacker needs, and the defences that make him regret it.',
    minutes: 11,
    practiceThemes: ['defensiveMove', 'kingsideAttack'],
    steps: [
      {
        title: 'When the gift works',
        text:
          'The Greek gift is the sacrifice **Bxh7+ Kxh7 Ng5+**, with the queen following to h5. Before I defend against it, I want to know when it works. The attacker needs four things:\n\n' +
          '- a bishop aimed at h7 along the b1–h7 diagonal;\n' +
          '- a knight that can jump to g5 with check;\n' +
          '- a queen that can follow to h5;\n' +
          '- a pawn on e5, which keeps a black knight off f6, the square from which it would guard h7.\n\n' +
          'White has all four here.',
        fen: GG_WORKS,
        shapes: ['d3h7', 'f3g5:blue', 'd1h5:blue', 'e5:green'],
        task: {
          prompt: 'Which sacrifice starts the attack?',
          moves: ['Bxh7+'],
          hint: 'Your bishop is aimed at the pawn that shelters the king.',
          success:
            '**Bxh7+** takes the pawn with check. If the king takes the bishop, **Ng5+** follows with the queen ready to join.',
          why: 'Quiet moves such as Ng5 or Qe2 give Black time for ...h6 or ...Ng6, and the attack fades. The sacrifice drags the king to h7 before Black can untangle. Declining with ...Kh8 only leaves White a pawn up. Before you sacrifice, count what arrives with check.',
          wrong: {
            Ng5: {
              text: '**Ng5** adds a second attacker, but it gives Black a move: ...h6 kicks the knight, and without the sacrifice White has no more than an equal game. Strike while the king is still cramped.',
              refute: 'h6',
            },
            b4: {
              text: '**b4** is a fair try that hits the bishop on c5, but ...Bxb4 wins a pawn first, and the sacrifice has lost much of its sting.',
              refute: 'Bxb4',
            },
          },
          failure:
            'A quiet move gives Black time to play ...h6. Look for a forcing capture on the b1–h7 diagonal.',
          reply: 'Kxh7',
          replyNote:
            'Black takes the bishop, since ...Kh8 would only leave White a pawn up. The king now stands on h7, within range of a knight check.',
          then: {
            prompt: 'Which knight move gives check and opens the diagonal for the queen?',
            moves: ['Ng5+'],
            hint: 'Your knight on f3 has exactly one square from which it checks the king.',
            success:
              '**Ng5+** checks the king and unblocks the diagonal from d1, so the queen can come to h5 next.',
            why: 'Count the king’s replies. After ...Kg8 Qh5 the pawn on h7 is gone and Black cannot hold it: ...Re8 Qh7+ Kf8 Qh8+ Ng8 Nh7+ wins. ...Kh8 Qh5+ Kg8 Qh7# is mate, and ...Kh6 Nxe6+ wins the queen. Only ...Kg6 is left. Work out every king move before you sacrifice.',
            wrong: {
              'Qd3+': {
                text: '**Qd3+** gives check, so it looks natural, but ...Nf5 blocks it and the knight is happy there. The bishop has gone and so has the attack: Black is better.',
                refute: 'Nf5',
              },
              b4: {
                text: '**b4** attacks the bishop on c5, but it lets Black off: ...Nxe5 wins a pawn, and the king is no longer in danger.',
                refute: 'Nxe5',
              },
            },
            failure:
              'A check alone is not enough. Find the knight move that also brings the queen into the attack.',
            reply: 'Kg6',
            replyNote:
              'Black’s best defence is to run forward. The knight on e7 covers f5, so a queen check from d3 would simply be blocked.',
            then: {
              prompt: 'Which quiet move keeps the attack going?',
              moves: ['Ne2'],
              hint: 'One of your pieces is still doing nothing. It can reach f4 in two moves.',
              success:
                '**Ne2** brings the second knight into the attack. It heads for f4 with check, and Black has no good way to untangle.',
              why: 'The obvious Qd3+ meets ...Nf5 and the attack is over, while h4 is too slow because of ...Rh8. Ne2 adds another attacker instead of cashing in early: after ...Nxe5 Nf4+ Kf5 the king stays exposed in the open. Before you give a check, ask whether another piece can join first.',
              wrong: {
                'Qd3+': {
                  text: '**Qd3+** looks like the point of the whole attack, but ...Nf5 blocks the diagonal and the king is safe again. White’s attack is spent.',
                  refute: 'Nf5',
                },
                h4: {
                  text: '**h4** threatens h5+, but it is too slow: ...Rh8 attacks the pawn at once, and Black wins it and holds.',
                  refute: 'Rh8',
                },
                b4: {
                  text: '**b4** hits the bishop, but ...Bd4 puts it on a good square, and the attack has stalled.',
                  refute: 'Bd4',
                },
              },
              failure:
                'The king is exposed, but White has only one attacker near it. Which of your pieces is still doing nothing?',
            },
          },
        },
      },
      {
        title: 'Before you accept, count',
        text:
          'Now you are on the receiving end: White has just played Bxh7+. Before I take, I ask three questions.\n\n' +
          '- **Is the attack complete?** Knight to g5 with check, queen to h5 and a pawn on e5. If one is missing, the sacrifice is just a piece down.\n' +
          '- **Do I have a defender?** A knight that can reach f6, a piece that covers g5, a rook that can lift to h6.\n' +
          '- **Where does my king go?** Back to g8 if h7 can be held; forward only if I have counted every check.\n\n' +
          'Here there is no white pawn on e5, and your knight on d5 reaches f6 in one move.',
        fen: GG_TAKE,
        orientation: 'black',
        shapes: ['h7:red', 'd5f6:blue', 'e5:red'],
        task: {
          prompt: 'Accept the sacrifice or decline it?',
          moves: ['Kxh7'],
          hint: 'Count White’s attackers and your defenders. Which attacker is missing?',
          success:
            '**Kxh7** takes the bishop. With no white pawn on e5, your knight can reach f6 and cover h7.',
          why: 'Run the count. The knight reaches g5 and the queen reaches h5, but nothing keeps your knight off f6, and your queen already eyes g5. Declining with ...Kh8 only loses a pawn: the bishop retreats and White keeps the initiative. When a sacrifice lacks an ingredient, take it.',
          wrong: {
            Kh8: {
              text: '**Kh8** declines, but the king attacks the bishop and it simply retreats: **Bc2**. White has won a pawn without risking anything, and your king is boxed in.',
              refute: 'Bc2',
            },
          },
          failure: 'You can take the checking bishop or step away. Which keeps your extra piece?',
          reply: 'Ng5+',
          replyNote:
            'The knight arrives with check, exactly as in the last step. Now the king must choose a square.',
          then: {
            prompt: 'Which square is safe for the king?',
            moves: ['Kg8'],
            hint: 'Going forward walks into the open. Which square keeps the king behind its pawns?',
            success:
              '**Kg8** puts the king back behind its pawns. White’s queen can still reach h5, but you have an answer ready.',
            why: 'The forward squares fail: ...Kg6 meets Re1 or Qb1+ with no shelter, ...Kh6 loses to Nxe6+, a discovered check from the bishop on d2, and ...Qxg5? loses the queen to Bxg5. On g8 the king is safe as long as h7 can be covered, and the knight on d5 covers it.',
            wrong: {
              Kg6: {
                text: '**Kg6** walks into the open. **Re1** and **Qb1+** come at the king, and it has no shelter. White is much better, even though you have an extra bishop.',
                refute: 'Re1',
              },
              Qxg5: {
                text: '**Qxg5** wins the knight on the face of it, but the bishop on d2 guards g5: **Bxg5**, and you have given your queen for a knight.',
                refute: 'Bxg5',
              },
            },
            failure:
              'Think about where the king is safest from further checks: behind the pawns, or in the open?',
            reply: 'Qh5',
            replyNote:
              'White brings the queen and threatens mate on h7. This is the moment the sacrifice was counting on.',
            then: {
              prompt: 'Which move guards h7 and attacks the queen?',
              moves: ['Nf6'],
              hint: 'The knight on d5 has a move that does both.',
              success:
                '**Nf6** attacks the queen and covers h7. The mating threat is gone, and you are a piece up for a pawn.',
              why: 'This is the defender you counted at the start. ...g6 and ...Nd7 both lose to Qh7#, ...Qxg5 Qxg5 gives up the queen, and ...Re8 drops to Qxf7+. After Nf6 the queen must move: Qh4 Bxc3 bxc3 Qd5 and Black is winning. Cover the mating square with a move that attacks something.',
              wrong: {
                g6: {
                  text: '**g6** attacks the queen, but it removes the pawn that shields h7: **Qh7#**.',
                  refute: 'Qh7#',
                },
                Qxg5: {
                  text: '**Qxg5** takes the knight, but White’s queen takes yours first: **Qxg5**, and you have given a queen for a knight.',
                  refute: 'Qxg5',
                },
              },
              failure: 'White threatens mate on h7. Which move covers h7 and attacks something?',
            },
          },
        },
      },
      {
        title: 'Calm is the defence',
        text: 'Here the sacrifice has been taken, and Black is a piece up and in check from the knight on g5. Your bishop on f6 attacks that knight, which makes taking it very tempting. Look at what would recapture first: the pawn on h4 guards g5, and the rook on h1 stands behind it. An open h-file with the rook on it is what the attacker is hoping for.',
        fen: GG_CALM,
        orientation: 'black',
        shapes: ['f6g5:blue', 'h4g5:red', 'g8:green'],
        task: {
          prompt: 'How do you meet the check?',
          moves: ['Kg8'],
          hint: 'Do not take the knight. Which square leaves the h-file shut and the king behind its pawns?',
          success:
            '**Kg8** steps out of the check and off the h-file. The knight on g5 stays where it is, because taking it would open the file.',
          why: 'Both natural moves lose. ...Bxg5 hxg5+ is a discovered check from the rook, and the open h-file decides the game. ...Kg6 runs into h5+. The calm ...Kg8 keeps the king behind its pawns, and White cannot add attackers. When a capture opens a file against your king, look at what recaptures first.',
          wrong: {
            Bxg5: {
              text: '**Bxg5** wins a piece, but **hxg5+** is a discovered check from the rook on h1. The h-file is open, the queen follows to h5, and the king has no shelter.',
              refute: 'hxg5+',
            },
            Kg6: {
              text: '**Kg6** walks into **h5+**. After ...Kh6 Nxe6+ is a discovered check from the bishop on f4, and the knight forks your queen.',
              refute: 'h5+',
            },
          },
          failure:
            'Taking is not always right. Find the move that keeps the h-file shut and the king behind its pawns.',
          reply: 'Qh5',
          replyNote:
            'White brings the queen anyway, hoping you will take on g5 and open the file for the rook and queen.',
          then: {
            prompt: 'The queen eyes h7. Which developing move covers it for good?',
            moves: ['Bf5'],
            hint: 'A bishop on the light squares can guard h7 along the diagonal.',
            success:
              '**Bf5** covers h7 along the diagonal. The queen has no check, and White’s attack is out of ideas.',
            why: 'Bxg5 is still the mistake: hxg5 opens the h-file with the queen and rook lined up behind it. Bf5 guards h7 with a developing move, and you simply stay a piece up. Calm defence means meeting threats with useful moves, not with captures that open lines.',
            wrong: {
              Bxg5: {
                text: '**Bxg5** is the same mistake again: **hxg5** opens the h-file with the queen already on h5, and White’s attack comes with force.',
                refute: 'hxg5',
              },
            },
            failure:
              'Which of your pieces can cover h7 and develop at the same time, without taking anything?',
          },
        },
      },
      {
        title: 'Take the knight',
        text: 'Sometimes the piece that arrives with check can simply be captured. Here your bishop on e7 attacks the knight on g5. Notice what the check has done, though: the knight left f3, so the queen on d1 now looks straight down the diagonal at your own knight on h5. Look at what each move leaves hanging before you play it.',
        fen: GG_BISHOP,
        orientation: 'black',
        shapes: ['e7g5', 'd1h5:red', 'h5:red'],
        task: {
          prompt: 'How do you answer the knight check?',
          moves: ['Bxg5'],
          hint: 'Which of your pieces attacks the checking knight?',
          success:
            '**Bxg5** takes the checking knight. The queen can take your loose knight on h5 with check, but you have an answer.',
          why: 'The usual ...Kg8 fails here: the check has opened the diagonal, and Qxh5 wins a piece. ...Kg6 meets Qc2+, and ...Kh6 loses to Nxf7+. Bxg5 removes the attacker, and after Qxh5+ Bh6 the bishop shields the king while you are a piece up for a pawn. Before you step back, check what the checking move uncovered.',
          wrong: {
            Kg8: {
              text: '**Kg8** is the natural retreat from the earlier steps, but this time the diagonal to h5 is open: **Qxh5** wins your knight, and the extra piece is gone.',
              refute: 'Qxh5',
            },
            Kg6: {
              text: '**Kg6** runs into the open: **Qc2+** f5 Nxe6 forks your queen and rook.',
              refute: 'Qc2+',
            },
          },
          failure:
            'Look at what the knight check has uncovered. Which of your pieces is now attacked?',
          reply: 'Qxh5+',
          replyNote:
            'White takes your loose knight, and with check, since the h-file is open. The bishop on g5 now has a job to do.',
          then: {
            prompt: 'Which move meets the check and keeps your extra piece?',
            moves: ['Bh6'],
            hint: 'Put the bishop between the queen and the king.',
            success:
              '**Bh6** blocks the h-file with the bishop. The queen has no more checks, and Black is a piece up for a pawn.',
            why: 'Moving the king instead leaves the bishop on g5 to Bxg5. Bh6 blocks the check, covers g7 and keeps the extra piece. White has no more attackers to bring: after g4 Nf6 Qh3 the queen is driven back. Block with the piece that is also protected.',
            wrong: {
              Kg8: {
                text: '**Kg8** steps aside but leaves the bishop on g5 hanging: **Bxg5**, and the extra piece is gone.',
                refute: 'Bxg5',
              },
            },
            failure:
              'The h-file is open and the king is in check. Block the file with a piece that stays protected.',
          },
        },
      },
      {
        title: 'The rook lift',
        text: 'The knight has checked, the king has gone back to g8 and the queen has arrived on h5. White threatens Qh7+ Kf8 Qh8 mate. Black has a rook on f6, and the sixth rank is open all the way to the h-file. A rook lift is the quickest defender you can bring: it arrives in one move.',
        fen: GG_ROOK,
        orientation: 'black',
        shapes: ['f6h6', 'h5h7:red'],
        task: {
          prompt: 'Which move stops the mate?',
          moves: ['Rh6'],
          hint: 'Think about the sixth rank: which of your pieces can reach the h-file in one move?',
          success:
            '**Rh6** blocks the h-file and attacks the queen. White can still win back material with Qf7+, but the mating attack is over.',
          why: 'The queen threatens Qh7+ Kf8 Qh8#, so you need a piece on the h-file. ...g6 and ...Rf5 attack the queen but lose to Qh7+, and ...Bd6 only delays the end. After Rh6 Qf7+ Kh8 Nf3 White regains the exchange, but Black keeps the better game. When the queen arrives on the h-file, put a piece in front of the king.',
          wrong: {
            g6: {
              text: '**g6** attacks the queen, but it leaves h7 uncovered: **Qh7+** Kf8 **Qh8#**.',
              refute: 'Qh7+',
            },
            Rf5: {
              text: '**Rf5** attacks the queen with the rook, but **Qh7+** Kf8 **Qh8#** is mate. Attacking the queen is no defence if h7 is left open.',
              refute: 'Qh7+',
            },
            e5: {
              text: '**e5** does nothing about h7: **Qh7+** Kf8 **Qh8#**.',
              refute: 'Qh7+',
            },
          },
          failure:
            'The queen threatens mate on the h-file. Which of your pieces can reach that file at once?',
          reply: 'Qf7+',
          replyNote:
            'White’s best try: the knight on g5 protects the queen, so the king must go to h8. Nf3 will then uncover the bishop on c1, which attacks the rook.',
        },
      },
      {
        title: 'Recapture with the knight',
        text: 'When a bishop lands on h7 with check, the king is not the only piece that can take it. Here your knight on f6 attacks h7 as well. The white knight on g5 covers the square, so the king cannot recapture at all, but the knight can. Look at every piece that can take before you move the king.',
        fen: GG_KNIGHT,
        orientation: 'black',
        shapes: ['f6h7', 'g5h7:red', 'd8:blue'],
        task: {
          prompt: 'How do you answer the bishop’s check?',
          moves: ['Nxh7'],
          hint: 'The king cannot take. Which other piece attacks h7?',
          success:
            '**Nxh7** takes the bishop with the knight. The king protects it, and White’s own knight on g5 is now attacked.',
          why: 'Kxh7 is illegal, so the choice is between ...Kh8 and the knight capture. ...Kh8 lets White win the rook on d8: Qxd8 Bd5 Nxf7+ and White is winning. Nxh7 wins the bishop for nothing, and after Qxd8 Rxd8 Rxd8+ Nf8 Black is clearly ahead. Before you move the king, ask whether another piece can capture.',
          wrong: {
            Kh8: {
              text: '**Kh8** declines, but the bishop is still loose and the rook on d8 hangs: **Qxd8** wins a rook, and Black is in trouble.',
              refute: 'Qxd8',
            },
          },
          failure: 'The king cannot recapture. Which of your other pieces attacks h7?',
          reply: 'Qxd8',
          replyNote:
            'White grabs the rook, since the knight on g5 is lost anyway. The queen is taken in return, and the rook comes with check.',
          then: {
            prompt: 'White has taken a rook. How do you recapture?',
            moves: ['Rxd8'],
            hint: 'The rook on f8 is guarding d8.',
            success:
              '**Rxd8** takes the queen. If White plays Rxd8+, the knight blocks with ...Nf8, and Black is clearly ahead.',
            why: 'The recapture is forced, and the sequence ends in your favour: after Rxd8+ Nf8 the knight blocks the check and Black is clearly better. Count the whole exchange before you start it, and you will know which side comes out ahead.',
            failure: 'Your rook on f8 guards d8. Recapture the queen.',
          },
        },
      },
      {
        title: 'The defender’s checklist',
        text:
          'Here is what I run through when a bishop lands on h7.\n\n' +
          '- **Count the attackers.** A bishop, a knight for g5, a queen for h5, and a pawn on e5. If one is missing, take.\n' +
          '- **Count the defenders.** A knight for f6, a bishop or queen to take on g5, a rook for h6 or f5.\n' +
          '- **Choose the king’s square.** g8 when h7 can be held; g6 only when the h-file and the b1–h7 diagonal are safe; h6 almost never.\n' +
          '- **Don’t grab.** Before you take on g5, ask what recaptures and which file opens.\n\n' +
          'The defensive-move puzzles below train the same instinct.',
        fen: GG_WORKS,
      },
    ],
  },
  {
    id: 'bishop-endgames',
    title: 'Bishop endgames',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Same-coloured bishop endings: attack with the good bishop, trade only after counting the pawn ending, use a passed pawn as a decoy, and know why the wrong rook pawn never wins.',
    minutes: 11,
    practiceThemes: ['bishopEndgame'],
    steps: [
      {
        title: 'Good bishop, bad bishop',
        text: 'With bishops of the same colour, I count the pawns first. A bishop is **bad** when its own pawns stand on its colour: they block it, and it ends up guarding them. White’s pawns on b5, c4, e4 and g4 are all on light squares, like both bishops, so White’s bishop is tied to them. Black’s pawns are mostly on dark squares, so his bishop is **good**: it is free to attack, while White’s can only defend.',
        fen: BE_GOOD_BAD,
        orientation: 'black',
        shapes: ['b3d1', 'd1g4:blue', 'g4:red'],
        task: {
          prompt: 'Which bishop move wins a pawn?',
          moves: ['Bd1'],
          hint: 'One of White’s pawns has no defender. Which diagonal reaches it?',
          success:
            '**Bd1** attacks the loose pawn on g4. White’s bishop cannot defend it without giving up another pawn, so Black wins one.',
          why: 'Bd1 is the only move that wins. It attacks g4, and White cannot defend it: Be2 Bxe2 Kxe2 Kxe4 loses the e-pawn instead. A waiting move such as ...Kd6 lets White play Be2 first, and ...Bc2 drops the bishop. When the enemy bishop is tied to its pawns, attack the pawn it cannot afford to defend.',
          wrong: {
            Kd6: {
              text: '**Kd6** only waits. White answers **Be2**, which guards g4 and c4 together, and the extra pawn never arrives.',
              refute: 'Be2',
            },
            Bc2: {
              text: '**Bc2** looks active, but the bishop is unprotected: **Bxc2** wins it.',
              refute: 'Bxc2',
            },
          },
          failure: 'The pawn on g4 is the one nothing defends. Which bishop move attacks it?',
          reply: 'Kd2',
          replyNote:
            'White cannot save the pawn: Be2 Bxe2 Kxe2 Kxe4 would lose the e-pawn instead. So he attacks the bishop and lets g4 go.',
          then: {
            prompt: 'Your bishop is attacked. How do you save it and win the pawn?',
            moves: ['Bxg4'],
            hint: 'The bishop has to move anyway. Is there a capture?',
            success:
              '**Bxg4** wins the pawn and takes the bishop out of danger. Black is a pawn up with a kingside majority, while White’s bishop is still stuck guarding c4 and e4.',
            why: '**Bxg4** wins the pawn with tempo. **Bf3** and **Kd4** win as well, but Bxg4 keeps everything simple. White’s bishop must guard c4 and e4, so it cannot help the kingside, and ...h5 will make a passed pawn. Take what is loose, then look at the pawn majority.',
            wrong: {
              Bf3: {
                text: '**Bf3** also wins: it hits g4 and e4 together, and after **Be2 Bxe2 Kxe2 Kxe4** Black is a pawn up in a won pawn ending. But **Bxg4** takes the pawn at once.',
              },
              Kd4: {
                text: '**Kd4** also wins: after **Kxd1 Kxd3** the bishops are gone, and Black’s king attacks c4 and e4. It is a clean win, but **Bxg4** is simpler.',
              },
            },
            failure:
              'The bishop is attacked, so it has to move. Look for a move that also captures something.',
          },
        },
      },
      {
        title: 'Count the pawn ending',
        text: 'The cleanest plan in a bishop ending is often to trade bishops, but only if the pawn ending is won, so I count it before I trade. Here White’s king is on b4, close to the queenside pawns on a7 and b6, while Black’s king stands in the centre. If the bishops come off, the white king reaches b5 and a6 first.',
        fen: BE_TRADE,
        shapes: ['d3b5', 'b4b5:blue', 'a7:red'],
        task: {
          prompt: 'Which bishop move forces the trade?',
          moves: ['Bb5+'],
          hint: 'Look for a check that also attacks Black’s bishop.',
          success:
            '**Bb5+** checks the king, and once it steps aside the bishop on b5 attacks the one on d7. The trade cannot be avoided.',
          why: '**Bb5+** is the only winning move. The quiet tries (**Kb3**, **Ba6**, **Be2** and the rest) keep the bishops on, and Black’s king gets to c7 in time: level. After the check the trade is forced, and the pawn ending is won because White’s king is closer to the queenside pawns. Count the pawn ending before you trade.',
          wrong: {
            Kb3: {
              text: '**Kb3** keeps the bishops on, and after **...Kc7** the white king has missed its moment: the position is level.',
              refute: 'Kc7',
            },
            Ba6: {
              text: '**Ba6** steps away from the bishop on d7. After **...Kc7** Black’s king is back in time and the win has gone.',
              refute: 'Kc7',
            },
          },
          failure:
            'The trade only works with tempo. Look for a check that attacks the bishop on d7.',
          reply: 'Kc7',
          replyNote:
            'Black steps aside, and now the bishop on d7 is attacked. ...Kd6 would come to the same thing.',
          then: {
            prompt: 'Black’s bishop is attacked. How do you complete the trade?',
            moves: ['Bxd7'],
            hint: 'Your bishop on b5 attacks the bishop on d7.',
            success:
              '**Bxd7** takes the bishop. Black must recapture with the king, and a pawn ending begins in which White’s king is nearer the pawns.',
            why: 'The check was played for this capture. Retreating with **Be2**, **Bf1** or **Bd3** leaves the bishops on and the win disappears. After the recapture only one king move wins, so know it before you take.',
            failure:
              'Your bishop on b5 attacks the bishop on d7. Taking it is the point of the check.',
            reply: 'Kxd7',
            replyNote:
              'The king recaptures. The bishops are off, and the pawn ending has to be counted from here.',
            then: {
              prompt: 'Which king move wins the pawn ending?',
              moves: ['Kb5'],
              hint: 'Head for the queenside pawns before Black’s king can defend them.',
              success:
                '**Kb5** heads for a6. After ...Kc7 Ka6 Kb8 a4, Black’s king is stuck guarding a7 and b6 while White still has pawn moves in hand, and the white king breaks in.',
              why: '**Kb5** is the only winning move: Ka3, Ka4, Kb3 and a3 all draw, and a4 even loses to ...Kc6. White’s king must reach b5 and a6 before Black’s can guard both b6 and a7, then spare pawn moves decide it. That is why you count the ending before you trade.',
              wrong: {
                a4: {
                  text: '**a4** pushes a pawn instead of using the king. After **...Kc6** Black’s king is in time, and it is White who ends up losing.',
                  refute: 'Kc6',
                },
                Kb3: {
                  text: '**Kb3** stays away from the action. After **...Kc6** Black’s king covers b6 and b5, and the ending is a draw.',
                  refute: 'Kc6',
                },
              },
              failure:
                'The kings decide this ending. Which king move reaches the queenside pawns first?',
            },
          },
        },
      },
      {
        title: 'When the trade is forced',
        text: 'Black has just played ...Bf7. With the king, it attacks your bishop on g6, and the bishop has no safe square: **Bh7** runs into ...Kg7, and **Bxh5** loses a piece to ...Bxh5. So the trade is forced, and the real question is whether the pawn ending wins. I count it before I take.',
        fen: BE_TRADE_2,
        shapes: ['g6f7', 'f4g5:blue', 'h5:red'],
        task: {
          prompt: 'How do you deal with the attack on your bishop?',
          moves: ['Bxf7'],
          hint: 'Count the pawn ending that follows: where does your king go?',
          success:
            '**Bxf7** trades the bishops. After ...Kxf7 the white king marches to g5 and wins the pawn on h5.',
          why: '**Bxf7** works because the pawn ending wins: **Kg5** takes h5 and the f-pawn runs. **Bh7** is trapped by ...Kg7, and **Bxh5** drops the bishop to ...Bxh5. When a trade is forced, count where the kings go and who gets there first.',
          wrong: {
            Bh7: {
              text: '**Bh7 Kg7** traps the bishop: after Kg5 Kxh7 you have lost a piece for nothing.',
              refute: 'Kg7',
            },
            Bxh5: {
              text: '**Bxh5** wins a pawn, but **...Bxh5** takes the bishop: you have given a piece for a pawn.',
              refute: 'Bxh5',
            },
          },
          failure: 'The bishop on g6 has no safe retreat. What can it do before it is taken?',
          reply: 'Kxf7',
          replyNote:
            'Black recaptures with the king. Now count: the white king gets to the h5 pawn before Black’s king can help it.',
          then: {
            prompt: 'Which king move heads for the h5 pawn?',
            moves: ['Kg5'],
            hint: 'The king should attack the pawn and keep Black’s king out at the same time.',
            success:
              '**Kg5** attacks the pawn on h5 and keeps Black’s king out: f6, g6 and e6 are all covered.',
            why: '**Kg5** does two jobs: it attacks the h-pawn and keeps the black king off f6 and g6. Other king moves drift, and ...Kf6 wins the f-pawn and turns the ending around. Choose the king move that attacks and restricts.',
            failure:
              'Which square attacks the h5 pawn and also covers the squares in front of Black’s king?',
            reply: 'Kg7',
            replyNote: 'Black steps back to g7, hoping to hold the pawn. Other moves lose as well.',
            then: {
              prompt: 'Which move decides the ending?',
              moves: ['Kxh5'],
              hint: 'The pawn on h5 is still loose.',
              success:
                '**Kxh5** wins the pawn. The white king and the f-pawn now win the race against Black’s king.',
              why: '**Kxh5** is the only winning move. **f6+** and **Kh4** both let Black’s king reach f6 and the f-pawn falls. After Kxh5 Kf6 Kg4 Ke5 Kg5 the f-pawn is passed, and it queens first. Don’t hurry a won ending: take the free pawn.',
              wrong: {
                'f6+': {
                  text: '**f6+** pushes the pawn too soon. After **...Kf7 Kxh5 Kxf6** the pawn is lost, and so is the race.',
                  refute: 'Kf7',
                },
                Kh4: {
                  text: '**Kh4** attacks h5 from the wrong side. After **...Kf6** Black’s king reaches the f-pawn, and the ending is won for Black.',
                  refute: 'Kf6',
                },
              },
              failure: 'The pawn on h5 is loose, and your king is next to it.',
            },
          },
        },
      },
      {
        title: 'The decoy',
        text: 'A passed pawn works as a decoy as well as a threat. Here the pawn on d6 is one step from d7, and Black’s king is the only piece that can stop it. But the same king is the only guard of the bishop on d5, which White’s king already attacks.',
        fen: BE_DECOY,
        shapes: ['d6d7', 'd5:red', 'd4d5:blue'],
        task: {
          prompt: 'Which pawn move wins a piece?',
          moves: ['d7'],
          hint: 'Push the passed pawn. What does the black king have to leave behind?',
          success:
            '**d7** threatens to queen, and only the king can stop it. But that king is also the only guard of the bishop on d5.',
          why: 'The pawn cannot be ignored: if Black plays a bishop move, d8=Q wins at once. So the king must take on d7, and **Kxd5** wins the bishop. Quiet moves such as **a3** or **b3** let Black untangle with ...Bc6, and then White’s pawns are the ones in danger. Ask which enemy piece has only one guard, then decoy it.',
          wrong: {
            c6: {
              text: '**c6** leaves d6 without its guard: **...Kxd6** takes it, and the pawn on c6 soon falls as well.',
              refute: 'Kxd6',
            },
          },
          failure:
            'The pawn on d6 is your trump. Where can it go, and which Black piece has to answer it?',
          reply: 'Kxd7',
          replyNote:
            'The king has to take, or the pawn queens. But the bishop on d5 has just lost its only protector.',
          then: {
            prompt: 'What does the white king take?',
            moves: ['Kxd5'],
            hint: 'Look at the bishop on d5.',
            success:
              '**Kxd5** wins the bishop for a pawn. White is a pawn up in a pawn ending, with the more active king.',
            why: 'The black king had two jobs, and the decoy overloaded it. The pawn ending is won: White’s king is active, the c-pawn is passed, and Black’s pawns are scattered. Look for the piece that is guarded only once.',
            failure: 'The bishop on d5 is no longer protected.',
          },
        },
      },
      {
        title: 'The wrong rook pawn',
        text: 'One ending every player must know. A bishop and a rook pawn **cannot win** when the bishop does not control the queening square and the defending king reaches the corner. White’s bishop is light-squared but h8 is dark, so the king in the corner can never be driven out. And stalemate is always in the air.',
        fen: BE_WRONG,
        orientation: 'black',
        shapes: ['h8:green', 'g8:green', 'd3h7:red'],
        task: {
          prompt: 'Where does the king go to hold the draw?',
          moves: ['Kh8'],
          hint: 'Which of the two legal moves stays close to the queening square?',
          success:
            '**Kh8** puts the king in the corner. The queening square h8 is dark, so the light-squared bishop can never drive it out.',
          why: '**Kh8** is the only move that holds. In the corner the king always keeps a square, because the bishop can cover g8 but never h8, and pushing the pawn to h7 would be stalemate. **Kf8** leaves the corner: Bc4 takes g8 away, and the pawn walks in. When you defend, run for the corner the bishop cannot reach.',
          wrong: {
            Kf8: {
              text: '**Kf8** leaves the corner. **Bc4** takes g8 away, the king can never return, and the pawn walks in.',
              refute: 'Bc4',
            },
          },
          failure: 'The king belongs next to the queening square. Which move gets it there?',
          reply: 'Kg6',
          replyNote:
            'White brings the king closer. Black has only ...Kg8 and then shuffles between g8 and h8: the bishop can cover g8 but never the corner, so White cannot make progress.',
        },
      },
      {
        title: 'The bishop ending checklist',
        text:
          'Here is what I check in a bishop ending.\n\n' +
          '- **Good against bad.** My bishop is good when my pawns stand on the other colour: it attacks theirs while their bishop defends.\n' +
          '- **Count before you trade.** Take the bishops off only when the pawn ending is won, and know your first king move.\n' +
          '- **A passed pawn is a decoy.** Push it and see which piece has to leave its post.\n' +
          '- **The wrong rook pawn draws.** If the bishop cannot cover the queening square, the king in the corner holds.\n\n' +
          'The minor-piece drills let you play these positions out against the engine.',
        fen: BE_GOOD_BAD,
        orientation: 'black',
      },
    ],
  },
  {
    id: 'pawn-endgames-3',
    title: 'Pawn endgames III: tricks of the trade',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'The square of the pawn, key squares, the outside passed pawn, triangulation, the breakthrough and Réti’s manoeuvre: the ideas that decide pawn endings which look simple.',
    minutes: 12,
    practiceThemes: ['pawnEndgame'],
    steps: [
      {
        title: 'The square of the pawn',
        text: 'A lone king can stop a passed pawn if it can step into the pawn’s **square**: draw a square from the pawn to its queening square, as wide as it is tall. Here the b4-pawn needs four moves, so its square is b4–b8–f8–f4. Black’s king stands on f5, on the edge of it, and Black is to move. The king catches the pawn as long as every move keeps it inside the square.',
        fen: PE_SQUARE,
        orientation: 'black',
        shapes: ['b4b8:blue', 'b8f8:blue', 'f8f4:blue', 'f4b4:blue'],
        task: {
          prompt: 'Which king move catches the pawn?',
          moves: ['Ke5', 'Ke6', 'Ke4', 'Kf4', 'Kf6'],
          hint: 'Stay inside the square. Its right-hand edge is the f-file.',
          success:
            '**Ke5** stays inside the square and catches the pawn: after b5 Kd6 b6 Kc6 the pawn falls. Any move that stays inside the square does the same.',
          why: 'Five moves keep the king inside the square, and each one catches the pawn: the ending is a draw, because White’s king is too far away to help. A step towards the g-file leaves the square, and then the pawn queens by force. Count the square before you decide whether to chase a passed pawn.',
          wrong: {
            Kg5: {
              text: '**Kg5** steps out of the square. After **b5** the pawn is simply too fast: the king never gets back, and the pawn queens.',
              refute: 'b5',
            },
          },
          failure: 'The pawn’s square runs from b4 to f8. A step towards the g-file leaves it.',
        },
      },
      {
        title: 'Key squares',
        text: 'With king and pawn against king, the **key squares** decide the game: if the attacking king reaches one, the pawn queens whoever has the move. For a pawn on d2 they are c4, d4 and e4. White’s king is on d3, Black’s on c5, and White is to move. The aim is to reach a key square before Black’s king can take the opposition.',
        fen: PE_KEY,
        shapes: ['c4:green', 'd4:green', 'e4:green'],
        task: {
          prompt: 'Which king move heads for a key square?',
          moves: ['Ke4'],
          hint: 'Get the king in front of the pawn, on the fourth rank.',
          success:
            '**Ke4** stands on a key square at once. Black can only try for the opposition, and the next move decides it.',
          why: '**Ke4** reaches a key square at once; **Ke3** and **Kc3** win as well, but less directly. The retreats **Kc2** and **Ke2** draw: Black’s king steps in front of the pawn and holds. Get in front of the pawn, never behind it.',
          wrong: {
            Kc2: {
              text: '**Kc2** retreats beside the pawn. After **...Kc4** Black’s king is in front of it, and the ending is a draw.',
              refute: 'Kc4',
            },
            Ke2: {
              text: '**Ke2** also steps back. **...Kd4** puts Black’s king in front of the pawn, and the ending is a draw.',
              refute: 'Kd4',
            },
            Ke3: {
              text: '**Ke3** also wins, but less directly: Black can still contest the key squares. **Ke4** stands on one at once.',
            },
            Kc3: {
              text: '**Kc3** also wins, but less directly: Black’s king guards c4 and d4, so you still have to find a way round. **Ke4** stands on a key square at once.',
            },
          },
          failure: 'Get the king in front of the pawn: the key squares are c4, d4 and e4.',
          reply: 'Kd6',
          replyNote:
            'Black’s king gives way, trying to keep the opposition. But White’s king is on a key square, and it must stay on one.',
          then: {
            prompt: 'Which move keeps the king on a key square?',
            moves: ['Kd4'],
            hint: 'Do not step back or push the pawn. Stay in front of it and take the opposition.',
            success:
              '**Kd4** stays on a key square and takes the opposition. Whatever Black does, White’s king gets in front of the pawn and escorts it home.',
            why: '**Kd4** is the only winning move. **Kd3**, **Kf3**, **Kf4**, **Ke3** and **d3** all let Black take the opposition, and the ending is drawn. From d4 the king keeps the opposition as it advances. Move the king, not the pawn, until the key squares are won.',
            wrong: {
              d3: {
                text: '**d3** pushes the pawn too soon. After **...Ke6** Black’s king takes the opposition, the pawn has lost its escort, and the ending is a draw.',
                refute: 'Ke6',
              },
              Kd3: {
                text: '**Kd3** steps back, and **...Kd5** takes the opposition. White’s king never gets past it: a draw.',
                refute: 'Kd5',
              },
            },
            failure:
              'Keep the king on the key squares c4, d4 or e4, in front of the pawn, and do not push the pawn yet.',
          },
        },
      },
      {
        title: 'The outside passed pawn',
        text: 'A passed pawn far from the other pawns works by **decoying** the enemy king. Here Black’s king has gone to c6 to watch the b-pawn, and that leaves f5 without a defender. White can win in several ways, but one move puts the question to Black at once: take the pawn and lose f5, or stay and let it run.',
        fen: PE_OUTSIDE,
        shapes: ['b3b4:blue', 'f5:red', 'c6:red'],
        task: {
          prompt: 'Which move makes the outside pawn work?',
          moves: ['b4'],
          hint: 'Push the passed pawn, so that the black king has to choose between it and f5.',
          success:
            '**b4** gives the black king two jobs: stop the pawn and guard f5. If it goes for the pawn, White’s king takes f5 and the f-pawn runs.',
          why: '**b4** wins whatever Black does: after ...Kb5 Ke5 Kxb4 Kxf5 the f-pawn is passed and the black king is too far away. **Ke5** and **Kc4** win as well, but **b4** is the move that uses the outside pawn. A far-off passed pawn is worth more than the pawn it costs: use it to drag the king away.',
          wrong: {
            Ke5: {
              text: '**Ke5** also wins, since it attacks f5 at once. But **b4** shows the idea of the lesson: the passed pawn gives the black king two jobs.',
            },
            Kc4: {
              text: '**Kc4** also wins, but it sets the black king no second job. **b4** does, and that is the point of an outside passed pawn.',
            },
          },
          failure:
            'The black king has two jobs: stopping the b-pawn and guarding f5. Which move gives it both at once?',
          reply: 'Kb5',
          replyNote:
            'Black goes for the pawn. Now Ke5 Kxb4 Kxf5 wins the f-pawn, and the black king is too far away to stop the king and pawn.',
        },
      },
      {
        title: 'Triangulation: losing a tempo',
        text: 'White’s king on b5 and Black’s on c7 stand a knight’s move apart, with the d-pawns blocked. The prize is Black’s pawn on d6, and White wins it only by gaining the **opposition**: the king on c6, facing a king on c8, with **Black** to move. The king cannot pass, so it takes the long way round: a detour that costs a tempo and hands the move over. Going straight for the centre only lets Black keep the opposition.',
        fen: PE_TRIANGLE,
        shapes: ['b5a6', 'a6b6', 'b6c6', 'd6:red'],
        task: {
          prompt: 'Which king move wins by losing a tempo?',
          moves: ['Ka6', 'Ka5'],
          hint: 'Not towards the centre: go round the outside.',
          success:
            '**Ka6** takes the detour. Black has no good move: after ...Kd8 Kb6 Kc8 Kc6 Kd8 Kxd6 the d-pawn falls, and the ending is won.',
          why: 'Ka6 and Ka5 win, because Black runs out of safe moves. **Kc4**, **Ka4** and **Kb4** only draw: Black answers ...Kb6 or ...Kb8 and keeps the opposition. A king cannot pass, so lose the tempo with a detour. Ask who has to move.',
          wrong: {
            Kc4: {
              text: '**Kc4** goes straight for the centre. **...Kb6** keeps the opposition, White’s king can never get in, and the ending is a draw.',
              refute: 'Kb6',
            },
            Ka4: {
              text: '**Ka4** only shuffles. After **...Kb8 Kb5 Kc7** you are back where you started, with White to move again: a draw.',
              refute: 'Kb8',
            },
            Kb4: {
              text: '**Kb4** steps back. **...Kb6** and Black’s king keeps the opposition: a draw.',
              refute: 'Kb6',
            },
          },
          failure:
            'Going straight forward only lets Black keep the opposition. Find the detour round the outside.',
        },
      },
      {
        title: 'The breakthrough',
        text: 'Three pawns against three, with both kings far away. Black’s king cannot reach the queenside in time, so a sacrifice that opens a path for one pawn wins. The pattern is to push the **middle** pawn first: whichever pawn takes it, a second sacrifice leaves the third pawn free to run.',
        fen: PE_BREAK,
        shapes: ['b5b6', 'a5a6:blue', 'c5c6:blue'],
        task: {
          prompt: 'Which pawn move starts the breakthrough?',
          moves: ['b6'],
          hint: 'The middle pawn goes first.',
          success:
            '**b6** attacks both a7 and c7. Whichever pawn takes it, White sacrifices again and one pawn is left to run.',
          why: '**b6** wins in every line: after ...axb6 c6 or ...cxb6 a6, one pawn is left that the king cannot catch. **Kg2** wins too, but slowly. **Kg1** and **Kh2** let Black off, and **a6** and **c6** lose. Look for the sacrifice that makes a passed pawn.',
          wrong: {
            Kg2: {
              text: '**Kg2** also wins, but slowly, by walking the king over. **b6** forces the win at once.',
            },
            c6: {
              text: '**c6** only trades pawns. After **...bxc6 bxc6** White’s pawns are weak, and it is Black who is winning.',
              refute: 'bxc6',
            },
            a6: {
              text: '**a6** only trades pawns. After **...bxa6 bxa6** White’s pawns are weak, and it is Black who is winning.',
              refute: 'bxa6',
            },
          },
          failure: 'Do not wait. Sacrifice a pawn so that another one is left free to run.',
          reply: 'axb6',
          replyNote:
            'Black takes with the a-pawn. Now the second sacrifice, so that the last pawn is left free.',
          then: {
            prompt: 'Which pawn sacrifice follows?',
            moves: ['c6'],
            hint: 'Offer the second pawn so that the third is left free.',
            success:
              '**c6** attacks b7. After ...bxc6 the black pawns have left the b-file, and the a-pawn is free to run.',
            why: '**c6** is the only winning move: **cxb6** and **axb6** only draw, and **a6** and **Kg2** lose. After ...bxc6 the a-pawn escapes the b6-pawn and nothing can catch it. Two pawns given, a queen won.',
            wrong: {
              cxb6: {
                text: '**cxb6** recaptures, but after **...cxb6 axb6** the pawns are locked on the b-file, and the ending is a draw.',
                refute: 'cxb6',
              },
              axb6: {
                text: '**axb6** recaptures the other way, but after **...cxb6 cxb6** it is the same locked pair of b-pawns, and the ending is a draw.',
                refute: 'cxb6',
              },
              Kg2: {
                text: '**Kg2** ignores the pawns: **...bxa5** wins one, and White has nothing left to break through with.',
                refute: 'bxa5',
              },
            },
            failure: 'Offer a second pawn so that the last one is free.',
            reply: 'bxc6',
            replyNote:
              'Black takes. The a-pawn is attacked by the pawn on b6, so it must move at once.',
            then: {
              prompt: 'How does the last pawn get through?',
              moves: ['a6'],
              hint: 'The pawn on a5 is attacked. Move it forward.',
              success:
                '**a6** escapes the b6-pawn, and nothing can stop it: ...Kg7 a7 and the pawn queens.',
              why: '**a6** wins: the pawn escapes the b6-pawn, and the black king is too far to stop it. **Kg2** and **axb6** lose, because ...bxa5 or ...cxb6 wins the pawn. Two pawns sacrificed, one queen gained.',
              wrong: {
                axb6: {
                  text: '**axb6** takes a pawn, but **...cxb6** leaves White with no pawns against two: Black wins.',
                  refute: 'cxb6',
                },
                Kg2: {
                  text: '**Kg2** ignores the attack on a5. **...bxa5** and White has no pawns left, against three.',
                  refute: 'bxa5',
                },
              },
              failure: 'The pawn on a5 is attacked by the pawn on b6. Move it forward.',
            },
          },
        },
      },
      {
        title: 'Réti’s manoeuvre',
        text: 'The most famous pawn study. White’s king is far outside the square of the h-pawn, and the c-pawn seems lost to Black’s king. Yet White draws, because the king walks **diagonally**: every step both approaches the h-pawn and supports its own pawn. Two goals with one move. A direct chase with Kh7 loses, and so does pushing the pawn.',
        fen: PE_RETI,
        shapes: ['h8g7', 'g7f6:blue', 'f6e5:blue', 'c6c8:green'],
        task: {
          prompt: 'Which king move draws?',
          moves: ['Kg7'],
          hint: 'Move diagonally: towards the h-pawn and towards the c-pawn at the same time.',
          success:
            '**Kg7** starts the diagonal walk. The king is heading for the h-pawn’s square and for d6, where it supports the c-pawn, at once.',
          why: '**Kg7** is the only move that draws; **Kh7**, **Kg8** and **c7** all lose. The king walks g7, f6, e5: every square brings it closer to the h-pawn and to the c-pawn. A direct chase fails because Black’s king takes the c-pawn first.',
          wrong: {
            Kh7: {
              text: '**Kh7** chases the h-pawn directly, but **...Kb6** wins the c-pawn first, and the h-pawn cannot be caught anyway.',
              refute: 'Kb6',
            },
            c7: {
              text: '**c7** pushes the pawn too early. **...Kb7** takes it, and the black h-pawn runs.',
              refute: 'Kb7',
            },
          },
          failure: 'Walk the king diagonally, so that each step serves both pawns.',
          reply: 'h4',
          replyNote:
            'Black pushes the h-pawn. It seems to be running, but the white king is closing in on its square.',
          then: {
            prompt: 'Which move keeps the draw?',
            moves: ['Kf6'],
            hint: 'Continue on the diagonal.',
            success:
              '**Kf6** continues the diagonal. From here the king meets ...Kb6 with Ke5 and ...h3 with Ke7, and it keeps both pawns in view.',
            why: '**Kf6** is the only move that holds: **c7**, **Kg6**, **Kf7** and **Kf8** all lose. From f6 the king reaches both the h-pawn’s square and d6, so Black cannot go for one pawn without losing the race for the other.',
            wrong: {
              c7: {
                text: '**c7** is still too soon: **...Kb7** takes the pawn, and nothing stops the h-pawn.',
                refute: 'Kb7',
              },
              Kg6: {
                text: '**Kg6** chases the h-pawn alone. **...Kb6** wins the c-pawn, and the h-pawn queens.',
                refute: 'Kb6',
              },
            },
            failure: 'Stay on the diagonal: the king must keep both pawns in view.',
            reply: 'Kb6',
            replyNote: 'Black goes for the c-pawn. The king on f6 is already placed to meet it.',
            then: {
              prompt: 'Which move holds both pawns?',
              moves: ['Ke5'],
              hint: 'Step diagonally again: the h-pawn must stay inside your reach.',
              success:
                '**Ke5** is the point of the manoeuvre. It is inside the square of the h-pawn, and after ...h3 Kd6 h2 c7 both pawns queen: a draw.',
              why: '**Ke5** is the only move that draws; **Kf5**, **Kg5**, **c7** and **Ke6** all lose. From e5 the king catches the h-pawn if Black takes on c6, and reaches d6 to support c7 if Black pushes the h-pawn. One king, two goals.',
              wrong: {
                Kf5: {
                  text: '**Kf5** heads for the h-pawn alone. **...h3** and the pawn cannot be caught: it queens.',
                  refute: 'h3',
                },
                c7: {
                  text: '**c7** is too early even now: **...Kxc7** removes the pawn, and the h-pawn is left alone to win.',
                  refute: 'Kxc7',
                },
              },
              failure: 'Step diagonally again, so that the king serves both pawns.',
            },
          },
        },
      },
      {
        title: 'Pawn endings checklist',
        text:
          'Here is what I check before I commit in a pawn ending.\n\n' +
          '- **The square.** Can the king step into it? Count before you push or run.\n' +
          '- **Key squares.** Get the king in front of the pawn and keep it there.\n' +
          '- **The outside passed pawn** drags the enemy king away, while your own king wins the rest.\n' +
          '- **Triangulation.** A king cannot pass, so lose the tempo with a detour.\n' +
          '- **Breakthrough.** Sacrifice pawns to make a passed pawn the king cannot catch.\n' +
          '- **Réti.** A king walking diagonally chases two goals at once.\n\n' +
          'All six are drills in the endgame library.',
        fen: PE_BREAK,
      },
    ],
  },
  {
    id: 'bishop-and-knight-mate',
    title: 'Bishop and knight mate',
    level: 'intermediate',
    category: 'Checkmates',
    summary:
      'The hardest of the basic mates, made simple: learn the two final pictures, then herd the king out of the wrong corner and into the one your bishop can reach.',
    minutes: 9,
    practiceThemes: ['mate', 'endgame'],
    steps: [
      {
        title: 'The corner of the bishop’s colour',
        text: 'With bishop and knight you can force mate only in a corner of the bishop’s colour. In the final picture the bishop gives the check, and a bishop only ever checks squares of its own colour. Here a light-squared bishop and the light corner a8 go together. My king covers a7 and b7, and the knight on a6 covers b8, so Black’s king has no move at all. That is the danger as well as the chance: a quiet move now would be stalemate.',
        fen: BN_MATE_A,
        shapes: ['h7e4', 'e4a8:blue', 'a6b8:blue'],
        task: {
          prompt: 'Find the mate in one.',
          moves: ['Be4#'],
          acceptAnyMate: true,
          hint: 'Black has no legal move, so only a check will do. Which square on the long diagonal can the bishop reach?',
          success:
            '**Be4#** checks along the long diagonal. The king’s three squares stay covered: a7 and b7 by your king, b8 by the knight.',
          why: '**Be4#** is the only mate. **Nc7+** is a check too, but ...Kb8 lets the king out of the corner. A quiet bishop move such as **Bg6** is stalemate, because Black has no legal move. Before any quiet move, count the king’s squares.',
          wrong: {
            'Nc7+': {
              text: '**Nc7+** is check, but the knight leaves a6, so b8 is free again: ...Kb8 and the king is out of the corner. You can still win, but the mate is no longer one move away.',
            },
            Bg6: {
              text: '**Bg6** is stalemate: Black has no legal move and is not in check, so the game is drawn. A quiet move cannot win here; you need the check.',
            },
          },
          failure:
            'Count the king’s squares: a7, b7 and b8 are all covered, so you need a check that keeps them covered.',
        },
      },
      {
        title: 'The same net in the dark corner',
        text: 'Swap the colours and the picture turns round. A dark-squared bishop belongs with a dark corner, here h8. Compare the two pictures: my king stands a knight’s move from the corner, the knight stands two squares from the corner on the same file, and the bishop checks along the long diagonal. Here the king takes g7 and h7, the knight on h6 takes g8, and one bishop move finishes it. Know both pictures, and every part of this ending has something to aim at.',
        fen: BN_MATE_H,
        shapes: ['g5f6', 'h6g8:blue'],
        task: {
          prompt: 'Find the mate in one.',
          moves: ['Bf6#'],
          acceptAnyMate: true,
          hint: 'The check has to come along the long diagonal. Which square on it can the bishop reach?',
          success:
            '**Bf6#** checks along the long diagonal. The king’s squares stay covered: g7 and h7 by your king, g8 by the knight.',
          why: '**Bf6#** is the only mate. **Nf7+** is a check too, but ...Kg8 lets the king out of the corner. Any quiet move, such as **Bh4**, is stalemate. The light and dark pictures are mirror images, so learn them as one.',
          wrong: {
            'Nf7+': {
              text: '**Nf7+** is check, but the knight leaves h6, so g8 is free again: ...Kg8 and the king is out of the corner. You can still win, but the mate is no longer one move away.',
            },
          },
          failure:
            'Black’s squares are g8, g7 and h7, and all three are covered. Find the check that keeps them covered.',
        },
      },
      {
        title: 'The knight check that draws the net',
        text: 'The pictures do not appear by themselves: I draw the net one move at a time. Black’s king on g8 has only f8 and h8 to go to. My bishop on e7 holds f8, and my king holds f7, g7 and h7, so h8 is the one free square. A knight check that takes g8 away leaves the king no choice, and the bishop can finish.',
        fen: BN_NET,
        shapes: ['f5h6', 'e7f8:red', 'h8:green'],
        task: {
          prompt: 'Which knight check forces the king into the corner?',
          moves: ['Nh6+'],
          hint: 'Only one knight move gives check. It lands on the edge, next to your king.',
          success:
            '**Nh6+** attacks g8. The king cannot go to f8, f7, g7 or h7, so it has to go to h8, the corner.',
          why: '**Nh6+** is mate in two: ...Kh8 is forced, then **Bf6#**. **Bf6** also wins, but it takes the bishop off e7, so ...Kf8 slips out and you need five more moves. A check that leaves one square puts the king exactly where your mating picture waits.',
          wrong: {
            Bf6: {
              text: '**Bf6** also wins, but it takes the bishop off e7. After ...Kf8 the king is out of the corner and the net has to be drawn again.',
            },
          },
          failure:
            'Look for a check that leaves the king one square: f8 is held by the bishop, f7, g7 and h7 by your king.',
          reply: 'Kh8',
          replyNote:
            'The only legal move: f8, f7, g7 and h7 are all covered. The king is in the corner, and the picture from the last step is one move away.',
          then: {
            prompt: 'Which bishop move gives mate?',
            moves: ['Bf6#'],
            acceptAnyMate: true,
            hint: 'Every square around the king is covered already. Check along the long diagonal.',
            success:
              '**Bf6#** checks the king on h8. The knight holds g8, and your king holds g7 and h7.',
            why: '**Bf6#** is the only mate. The net worked because every move left Black one square: first the check, then the corner, then the bishop’s check. Draw the net so that the king’s last square is the corner.',
            failure:
              'The king’s squares are all covered, so you need a check along the long diagonal to h8.',
          },
        },
      },
      {
        title: 'Out of the wrong corner',
        text: 'A king in the wrong corner has to be walked out of it. Black ran to a8, which is light, so my dark-squared bishop can never mate him there. I answered with a quiet bishop move, and he stepped to a7. Now the walk begins, down the a-file towards a1, a corner my bishop covers. The knight and the bishop take turns, and every move leaves Black exactly one reply, forward and not back. My king on c6 guards b7 and b6 while they work.',
        fen: BN_WALK,
        shapes: ['d7b6', 'e5b8:blue', 'a1:green', 'a8:red'],
        task: {
          prompt: 'Which knight move forces the king one step further down the file?',
          moves: ['Nb6'],
          hint: 'Find the knight move that takes a8 away while the bishop still covers b8.',
          success:
            '**Nb6** takes a8 away, and the bishop on e5 still covers b8. Black’s only move is ...Ka6, one step further from the wrong corner.',
          why: '**Nb6** is the only move that leaves one square, a6. **Nc5** and **Nb8** leave only ...Ka8, which sends him back into the corner. A quiet bishop move leaves him two squares. Choose the move that leaves one reply, and make it a step forward.',
          wrong: {
            Nc5: {
              text: '**Nc5** leaves Black one move, but it is ...Ka8: he is back in the wrong corner and you have lost time. The walk must go forward.',
            },
          },
          failure:
            'Black has two ways out: back to a8 and forward to a6. Find the move that leaves only the forward one.',
          reply: 'Ka6',
          replyNote:
            'Forced: the knight takes a8, the bishop takes b8, and my king takes b7. The knight on b6 is protected, so a6 is the only square.',
          then: {
            prompt: 'Which bishop move shuts the door behind the king?',
            moves: ['Bb8'],
            hint: 'The king would like to step back to a7. Which bishop move takes that square away?',
            success:
              '**Bb8** takes a7 away. With b7 and b5 covered by your king and b6 protected, the only move left is ...Ka5.',
            why: '**Bb8** takes the square behind the king, so he can only go forward. **Bc3** and **Nc4** leave only ...Ka7, which lets him back. **Nc8** also forces ...Ka5, but it puts the knight on the edge. Take the square behind him.',
            wrong: {
              Bc3: {
                text: '**Bc3** takes a5, so the king has to go back to a7. You have undone the work of the last move.',
              },
              Nc8: {
                text: '**Nc8** also forces ...Ka5, but it puts the knight on the edge, where it does little. **Bb8** shuts the door and keeps the knight in play.',
              },
            },
            failure:
              'The king can go forward to a5 or back to a7. Find the bishop move that takes the square behind him.',
            reply: 'Ka5',
            replyNote:
              'Forced again: the king has been walked from a8 to a5 without a choice. The knight and king keep the walk going; the drills let you play it out.',
          },
        },
      },
      {
        title: 'When the king runs along the edge',
        text: 'Black does not have to run to the wrong corner. After the double check Nd7+ he can go the other way, ...Kc8, along the back rank towards h8. That is the right direction for me, because h8 is dark and my bishop covers it. I keep the initiative with checks and bring my king up to take the squares in front of him. Stalemate lurks again, because he has so few squares.',
        fen: BN_RUN,
        shapes: ['d7b6', 'c8:red', 'h8:green'],
        task: {
          prompt: 'Which knight check drives the king along the back rank?',
          moves: ['Nb6+'],
          hint: 'Only one knight move gives check. The king then has a single square.',
          success:
            '**Nb6+** checks the king on c8 and guards d7. The bishop covers b8, so the king’s only move is ...Kd8.',
          why: '**Nb6+** is the quickest win. The bishop moves **Bc7** and **Bg5** are stalemate, because Black would have no legal move. Keep checking while the king has few squares, and count his squares before any quiet move.',
          wrong: {
            Bc7: {
              text: '**Bc7** takes d8 and b8, and the king has no move left: that is stalemate, a draw. With so few squares, count them before a quiet move.',
            },
            Bg5: {
              text: '**Bg5** takes d8, and the knight and king already cover the rest. Black has no move and is not in check: stalemate, a draw.',
            },
          },
          failure:
            'Look for a check that leaves the king one square and keeps him on the back rank.',
          reply: 'Kd8',
          replyNote:
            'The only move: the bishop covers b8, and my king and knight cover b7, c7 and d7. Black heads towards h8.',
          then: {
            prompt: 'Which king move leaves Black one square and cuts him off?',
            moves: ['Kd6'],
            hint: 'Bring your king next to the black king, so that it covers e7 as well as c7 and d7.',
            success:
              '**Kd6** covers c7, d7 and e7. With the knight guarding c8, the king’s only move is ...Ke8.',
            why: '**Kd6** brings the king in: it covers c7, d7 and e7, so Black has one square, ...Ke8, and the road back to the wrong corner is shut. **Bg5+** also wins and leaves only ...Ke8 as well, but it keeps my king idle. In this ending the king is a piece, not a spectator, so bring it up.',
            wrong: {
              'Bg5+': {
                text: '**Bg5+** also wins, and it leaves only ...Ke8 as well. But it keeps my king idle on c6, and the king is a piece in this ending. **Kd6** brings it into the net.',
              },
            },
            failure:
              'Black has a few squares left. Find the king move that covers e7 as well as c7 and d7.',
          },
        },
      },
      {
        title: 'The bishop and knight method',
        text:
          'Here is the method.\n\n' +
          '- **Corner colour.** Force mate only in a corner of your bishop’s colour. Check it first.\n' +
          '- **Edge first.** Drive the king to an edge with king and bishop; the knight helps from the centre.\n' +
          '- **Wrong corner.** Walk him out, always forward, leaving him one reply each time.\n' +
          '- **The net.** King a knight’s move from the corner, knight on the corner’s file, bishop checking.\n' +
          '- **Stalemate.** Near the end the king has few squares: count them before every quiet move.\n\n' +
          'It takes at most 33 moves, so the fifty-move rule is no worry if you keep to a plan. The drills “Bishop and knight vs king” and “Bishop and knight: wrong corner” let you practise against the engine.',
        fen: BN_NET,
      },
    ],
  },
  {
    id: 'queen-vs-rook',
    title: 'Queen versus rook',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Winning with the queen against a rook: drive the king to the edge, take its squares away with a quiet queen move, then check until one check also attacks the rook.',
    minutes: 9,
    practiceThemes: ['queenRookEndgame', 'endgame'],
    steps: [
      {
        title: 'Hand over the move',
        text: 'Queen against rook is a win, but the rook defends stubbornly while it stays beside its king. Here the black king is on the edge and the rook is tied to it: the king guards the rook, and yours attacks it. The method is to take the king’s squares away with a quiet queen move, so that Black must move and every move loses. That is zugzwang. Keep an eye on your own queen as well: the rook needs only one check to win it.',
        fen: QR_START,
        shapes: ['e1a5', 'a8:red', 'a7:red', 'c7:red'],
        task: {
          prompt: 'Which quiet queen move leaves Black with nothing good?',
          moves: ['Qa5'],
          hint: 'Find the square that covers a7, a8 and c7 together, and that the rook cannot attack.',
          success:
            '**Qa5** covers a7, a8 and c7, so the king has only c8, and that drops the rook to Qa6. The rook has to leave, and wherever it goes the queen wins it.',
          why: 'Qa5 is the fastest win, mate in eight. It takes a7, a8 and c7 from the king, so Black must move the rook or play Kc8, which loses it to Qa6. **Qe5+** and **Qe8+** win too, only slower, and **Qb4** hangs the queen to the rook. Quiet moves that take squares away beat checks that only chase.',
          wrong: {
            'Qe5+': {
              text: '**Qe5+** also wins, but it is slower. The king goes to a7 or a8, and you still need the quiet **Qa5** to finish the job.',
            },
            'Qe8+': {
              text: '**Qe8+** also wins, but it is slower: the king only steps aside, and the checks lead nowhere until you find a quiet move that takes his squares away.',
            },
            Qb4: {
              text: '**Qb4** attacks the rook a second time, but it is Black’s move, and the queen stands on the rook’s own file: **Rxb4** wins it.',
              refute: 'Rxb4',
            },
          },
          failure:
            'Look for a quiet queen move: no check, but it takes the king’s squares away and stays out of the rook’s reach.',
          reply: 'Rb1',
          replyNote:
            'Black’s longest defence is to send the rook to the first rank, away from the king. It is still lost: the queen will check until one check also attacks the rook.',
          then: {
            prompt: 'Which check begins the hunt?',
            moves: ['Qd8+'],
            hint: 'A check along the eighth rank leaves the king only one square.',
            success:
              '**Qd8+** checks along the eighth rank, and the king has only a7. From there the queen keeps checking until one check also attacks the rook.',
            why: '**Qd8+** and **Qe5+** both win in seven more moves, and the rook can touch neither square. What matters is the plan: keep checking from squares the rook cannot reach, and look for a check that attacks the rook as well. **Qc7+** wins too, a move slower.',
            wrong: {
              'Qe5+': {
                text: '**Qe5+** also wins, just as fast: after ...Ka7 Qd4+ the hunt follows the same pattern. **Qd8+** simply leaves the king only one reply.',
              },
              'Qc7+': {
                text: '**Qc7+** also wins, but a move slower: after ...Ka8 Qd8+ Ka7 you reach the same position a move later.',
              },
            },
            failure:
              'Check from a square the rook cannot reach, and keep driving the king towards the a-file.',
            reply: 'Ka7',
            replyNote:
              'The king has only one square. Now the hunt begins: keep checking until one check also attacks the rook.',
          },
        },
      },
      {
        title: 'Check until the fork',
        text: 'The rook sits on b1, and every check I give forces the king to move, so the rook never gets a free move. Look at the diagonal from b1 to h7. If the queen checks the king from h7, it attacks the rook at the same time: a fork. The king has to stand on the seventh rank when the queen lands there, so I use the checks to place it.',
        fen: QR_CHECKS,
        shapes: ['b1h7:blue', 'a7:red'],
        task: {
          prompt: 'Which check keeps the hunt going?',
          moves: ['Qd4+'],
          hint: 'Use the diagonal that points at a7, from the centre.',
          success:
            '**Qd4+** checks along the diagonal d4–a7, from a square the rook cannot reach. Black must answer the check, so the rook still has no free move.',
          why: '**Qd4+** is the quickest, mate in six. **Qa5+**, **Qd7+** and **Qe7+** also win, but they need two more moves. Notice that the rook on b1 never gets a move: every check forces the king, so the queen keeps the initiative.',
          wrong: {
            'Qa5+': {
              text: '**Qa5+** also wins, but it only takes you back: after ...Kb8 you have the position before **Qd8+**, with the same job to do.',
            },
            'Qd7+': {
              text: '**Qd7+** also wins: after ...Kb8 Qd8+ Ka7 you are back where you started, two moves later.',
            },
          },
          failure:
            'Keep checking from a square the rook cannot reach. Which check keeps the king in the corner and keeps the rook cut off?',
          reply: 'Kb8',
          replyNote:
            'The king steps back to b8 (a8 comes to the same thing). One more check forces it to a7 again, and that is the one that sets up the fork.',
          then: {
            prompt: 'Which check forces the king back to a7?',
            moves: ['Qh8+'],
            hint: 'A check along the eighth rank, from a square the rook cannot reach.',
            success:
              '**Qh8+** checks along the eighth rank. The king can only go to a7, and now the queen is one move from the fork.',
            why: '**Qh8+** is the quickest, mate in five. It forces ...Ka7, and then Qh7+ checks along the seventh rank while attacking the rook on b1 along the diagonal. **Qe5+** and **Qd8+** win too, but need two more moves.',
            failure:
              'Check along the eighth rank, so that the king has only one square and lands on the seventh rank.',
            reply: 'Ka7',
            replyNote:
              'The king is on the seventh rank, and the queen can check it along that rank.',
            then: {
              prompt: 'Which check wins the rook?',
              moves: ['Qh7+'],
              hint: 'Find a check that also attacks the rook on b1.',
              success:
                '**Qh7+** checks along the seventh rank and attacks the rook along the diagonal h7–b1. After ...Kb8 Qxb1+ the rook is gone with check.',
              why: '**Qh7+** is mate in four: after ...Kb8 Qxb1+ Kc8 Qh7 the king is mated next move. A check that also attacks the rook is a fork, and the king cannot answer both. **Qd4+** keeps the hunt going but wastes two moves. Always look for the check that attacks a second piece.',
              wrong: {
                'Qd4+': {
                  text: '**Qd4+** also wins, but you only repeat the hunt: after ...Kb8 Qh8+ Ka7 you are back here, two moves later.',
                },
              },
              failure: 'Look for a check along the seventh rank that also attacks the rook.',
            },
          },
        },
      },
      {
        title: 'When the rook runs the other way',
        text: 'Suppose Black answers Qa5 by running the rook along the seventh rank to h7. The idea is the same. The rook now stands on the diagonal h7–b1 again, so if the queen can check the king on the b-file from b1, that check attacks the rook as well. The queen has to get there with checks, from squares the rook cannot attack.',
        fen: QR_RUN,
        shapes: ['b1h7:blue', 'h7:red'],
        task: {
          prompt: 'Which check starts the hunt?',
          moves: ['Qe5+'],
          hint: 'Check along the diagonal, from a square the rook on h7 does not control.',
          success:
            '**Qe5+** checks along the diagonal and keeps the queen out of the rook’s lines. The king goes to a8 or a7, and the queen heads for the a-file.',
          why: '**Qe5+** is mate in six; **Qb5+**, **Qd8+** and **Qb4+** also win, but two moves slower. The rook on h7 covers the seventh rank and the h-file, so avoid those. The aim is the same as before: a check that also attacks the rook.',
          failure:
            'Check from a square the rook cannot attack, and aim to catch the rook on the diagonal b1–h7.',
          reply: 'Ka8',
          replyNote:
            'Black goes to the corner (a7 comes to the same thing). The queen now swings to the a-file with check.',
          then: {
            prompt: 'Which check drives the king to b8?',
            moves: ['Qa1+'],
            hint: 'Check along the a-file; the king has only one square.',
            success:
              '**Qa1+** checks along the a-file, and the king has only b8. That puts it on the b-file, where one check will also attack the rook.',
            why: '**Qa1+** is mate in five. The king must go to b8, because b7 is covered by your king, and the next check from b1 attacks the rook as well. **Qe6** also wins, a move slower. Force the king to the square where a fork works.',
            failure:
              'Check along the a-file, so that the king has only one square and lands on the b-file.',
            reply: 'Kb8',
            replyNote: 'The king is forced to b8, and one check now does everything.',
            then: {
              prompt: 'Which check wins the rook?',
              moves: ['Qb1+'],
              hint: 'Check along the b-file, and see what else the queen then attacks.',
              success:
                '**Qb1+** checks the king and attacks the rook on h7 along the diagonal b1–h7. After ...Ka7 Qxh7+ Ka6 Qb7+ Ka5 Qb5# the king is mated.',
              why: '**Qb1+** is a fork: check on the b-file, attack on the rook along b1–h7. Black is mated within three moves, whatever he tries. Ask where the rook sits relative to the king, and look for the check that hits both.',
              failure: 'Look for a check along the b-file that also attacks the rook.',
            },
          },
        },
      },
      {
        title: 'When the king runs',
        text: 'What if Black answers Qa5 with ...Kc8? Now the rook on b7 is guarded only by the king, while your king and queen can both attack it. Count the attackers and defenders before you look for checks: two attackers against one defender wins the rook. Checks win here too, but the quiet move that adds the second attacker is faster.',
        fen: QR_KING,
        shapes: ['b7:red', 'c6b7:blue'],
        task: {
          prompt: 'How do you win the rook?',
          moves: ['Qa6'],
          hint: 'Add a second attacker to the rook on b7, from a square it cannot touch.',
          success:
            '**Qa6** attacks the rook a second time, and only the king defends it. After ...Kd8 Qxb7 the rook falls, and mate follows soon after.',
          why: '**Qa6** wins at once: king and queen attack the rook, and only the king defends it. **Qe5** and **Qa8+** also win, but they take a move longer. Checks are not always the fastest way: count attackers and defenders first.',
          wrong: {
            'Qa8+': {
              text: '**Qa8+** also wins, a move slower: the rook is lost either way. But **Qa6** is simpler.',
            },
            Qe5: {
              text: '**Qe5** also wins, a move slower, because the rook cannot hold b7 for long. **Qa6** attacks it straight away.',
            },
          },
          failure:
            'The rook on b7 is guarded once. Find the quiet move that attacks it a second time.',
          reply: 'Kd8',
          replyNote:
            'Black walks away, and the rook falls. After Qxb7 Ke8 Qg7 Kd8 Qd7# the king is mated.',
        },
      },
      {
        title: 'The queen-against-rook checklist',
        text:
          'Here is what I do in queen against rook.\n\n' +
          '- **Edge first.** The rook defends well only beside its king, so drive the king to the edge.\n' +
          '- **Quiet move.** Take the king’s squares away so that Black must move and the rook has to leave its post.\n' +
          '- **Check to fork.** Keep checking from squares the rook cannot reach, until one check also attacks the rook.\n' +
          '- **Count the attackers** if the king runs: two against one wins the rook.\n' +
          '- **Mind your queen.** One rook check can fork king and queen, and a bare king can be stalemated.\n\n' +
          'The “Queen vs rook” drill plays this against the engine.',
        fen: QR_START,
      },
    ],
  },
];
