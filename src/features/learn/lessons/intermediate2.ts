import { fenAfter, type Lesson } from '../model';

const FRENCH_ADVANCE = fenAfter('1. e4 e6 2. d4 d5 3. e5');
const ITALIAN_PASSIVE = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Be7');
const KID_MAINLINE = fenAfter(
  '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Nd3',
);
const AFTER_E4_E5_NF3_NC6 = fenAfter('1. e4 e5 2. Nf3 Nc6');
const AFTER_D4_D5 = fenAfter('1. d4 d5');
const AFTER_E4 = fenAfter('1. e4');
const QUEEN_V_PAWN = 'K7/8/8/8/7Q/8/3kp3/8 w - - 0 1';

export const intermediateLessons2: Lesson[] = [
  {
    id: 'minor-piece-endgames',
    title: 'Minor-piece endgames',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Bishop or knight? Right corner or wrong corner? The rules that decide most minor-piece endings.',
    minutes: 8,
    steps: [
      {
        title: 'Bishop versus knight',
        text:
          'With the queens and rooks gone, ask first: which minor piece is better here? White is a pawn up, the ' +
          'board is open and there are pawns on both wings. The bishop on c3 eyes g7 and a5 at once, while the ' +
          'knight on c6 needs several jumps to switch wings.\n\n' +
          'My rules of thumb:\n\n' +
          '- The **bishop** likes open boards, pawns on both wings and a passed pawn to escort from afar.\n' +
          '- The **knight** likes closed positions, pawns on one wing, a safe outpost, or an enemy bishop hemmed ' +
          'in by its own pawns.\n\n' +
          'Knight endings play like pawn endings: an extra pawn usually wins. Bishops of opposite colours are a ' +
          'story of their own, in the next lesson.',
        fen: '8/pp3kpp/2n5/8/8/2B5/PP3PPP/6K1 w - - 0 1',
        shapes: ['c3g7:green', 'c3a5:green', 'c6:blue'],
      },
      {
        title: 'The wrong rook pawn',
        text:
          'Now an ending where the colour of the bishop decides everything. White is a bishop and a pawn up, but ' +
          'look at the pawn: an **h-pawn**, which promotes on h8, a dark square. White’s bishop runs on the light ' +
          'squares, so it can never attack h8. Players call it the **wrong bishop**.\n\n' +
          'That gives you, Black, a simple plan: put your king on h8. Once it is there it can never be driven out, ' +
          'and the pawn can never get past it. So the whole ending is a race for the corner, and the white king is ' +
          'already on f5.',
        fen: '8/5k2/8/5K2/7P/3B4/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:blue', 'f7g8', 'f7g7'],
        task: {
          prompt: 'Which king move heads for the saving corner in time?',
          moves: ['Kg7', 'Kg8', 'Kf8'],
          hint: 'Which square does the h-pawn promote on, and can the bishop ever cover it? Point your king that way.',
          success:
            'Your king heads for h8, and the white king is too late to cut it off. From the corner nothing can drive it out.',
          why:
            'From g7, g8 or f8 the king reaches the corner in a move or two, and White cannot stop it. Once it sits ' +
            'on h8, the bishop can never check it and the pawn can never pass it: the game is a draw, often by ' +
            'stalemate. The habit: before you trade into bishop and rook pawn, look at the colour of the corner. The ' +
            'wrong colour turns a whole extra piece into a draw.',
          wrong: {
            Ke7: {
              text: 'That walks away from the corner. **Bc4** covers g8 and f7, and if your king goes back to f8, **Kf6** shuts it out for good.',
              refute: 'Bc4',
            },
            Ke8: {
              text: 'That walks away from h8. **Kf6** covers g7, the bishop will cover g8, and your king never gets back to the corner.',
              refute: 'Kf6',
            },
          },
          failure: 'Head for the corner the bishop can never touch: h8, by way of g7 or g8.',
        },
      },
      {
        id: 'right-rook-pawn',
        title: 'The right rook pawn',
        text:
          'Give White a dark-squared bishop and the same ending is easy. The bishop on c5 covers f8, and your king ' +
          'on g6 covers f7, g7 and h7, so the black king has just two squares left: g8 and h8. And the corner is no ' +
          'refuge any more, because this bishop can reach the long diagonal.\n\n' +
          'When the enemy king is this short of squares, look at your checks first. One of them leaves the king a ' +
          'single square, and then the bishop finishes the job.',
        fen: '6k1/8/6KP/2B5/8/8/8/8 w - - 0 1',
        shapes: ['c5f8', 'h6h7'],
        task: {
          prompt: 'Mate in two. Which check starts it?',
          moves: ['h7+'],
          hint: 'The bishop already guards f8. Which check leaves the black king only one square?',
          success:
            '**h7+**: the pawn checks, your king covers f7 and g7, the bishop covers f8, so the king must go to h8.',
          why:
            'A check that leaves one square drives the king exactly where you want it, and here that square is a ' +
            'corner on the long diagonal, the one your bishop can use. A quiet move first gives Black a free move, ' +
            'and the king may slip out of the box. After every check you consider, ask: where can the king go?',
          wrong: {
            Bd4: 'That aims at h8, but it is not check, so Black gets a free move: ...Kf8, and the king walks out of the box. It still wins, only much more slowly. Give the check first.',
          },
          failure:
            'The mate in two starts with a check. Look at which squares the black king would have left after it.',
          reply: 'Kh8',
          replyNote:
            'The only square. Now the king stands in the corner, right on the long diagonal from a1 to h8.',
          then: {
            prompt: 'Finish it: checkmate in one.',
            moves: ['Bd4#'],
            acceptAnyMate: true,
            hint: 'Which square of the long diagonal can the bishop reach from c5?',
            success:
              '**Bd4#**: the bishop checks along the long diagonal, the pawn on h7 covers g8, and your king covers g7.',
            why:
              'The right bishop can attack the corner, so the king has nowhere to hide. With a rook pawn, look at the ' +
              'queening square before anything else: if your bishop controls it, the pawn wins; if not, a king that ' +
              'reaches the corner holds the draw against a whole extra piece.',
            failure:
              'The king on h8 stands on the long diagonal. Which bishop move checks it there?',
          },
        },
      },
      {
        id: 'knight-in-the-corner',
        title: 'A knight against a rook pawn',
        text:
          'Knights are at their weakest on the edge, and in a corner they are weaker still. Your knight on a1 ' +
          'blocks the a-pawn, but from there it reaches only b3 and c2, and the black king covers both. Black ' +
          'threatens **Kb2**, attacking the knight, and a knight cannot defend itself.\n\n' +
          'So everything depends on your king. The black king can only attack a1 from b1 or b2, so those are the ' +
          'squares that matter. Count the moves your king needs to get near them, and ask what is left for Black ' +
          'if the knight falls anyway.',
        fen: '8/8/8/8/8/2k5/p7/N3K3 w - - 0 1',
        shapes: ['a1:blue', 'c3b2:red'],
        task: {
          prompt: 'Which move saves the draw?',
          moves: ['Kd1', 'Ke2'],
          hint: 'Count the moves to c1 or c2, the squares next to b1 and b2. Which first step gets your king there in time?',
          success:
            'Your king heads for c1 or c2, next to the corner, and arrives in time whether Black takes the knight or not.',
          why:
            'Count it out: **Kd1** Kb2 Kd2 Kxa1 Kc1. Black has won the knight, but the king on a1 is buried behind ' +
            'its own pawn with no legal move: stalemate. **Ke2** works the same way, through d3 to c2. Alone on the ' +
            'rim, a knight cannot hold a rook pawn; with its king close by, even losing it can still draw.',
          wrong: {
            Kf1: {
              text: 'One step too slow. After **Kb2** the knight falls, and your king cannot get to c1 or c2 in time to box the black king in. The pawn queens.',
              refute: 'Kb2',
            },
            Kf2: {
              text: 'That heads the wrong way. After **Kb2** the knight falls, and your king is too far from c1 and c2 to box the black king in. The pawn queens.',
              refute: 'Kb2',
            },
          },
          failure:
            'Keep the knight where it is and bring your king toward c1 or c2, the squares beside b1 and b2.',
        },
      },
    ],
    practiceThemes: ['bishopEndgame', 'knightEndgame'],
  },

  {
    id: 'opposite-bishops',
    title: 'Opposite-coloured bishops',
    level: 'intermediate',
    category: 'Endgames',
    summary: 'A draw magnet in the endgame, a weapon in the middlegame.',
    minutes: 7,
    steps: [
      {
        title: 'Why they draw',
        text:
          'Each side has one bishop, and they run on opposite colours: White’s on the light squares, Black’s on ' +
          'the dark. They can never meet, never be traded and never fight over the same square. That is the whole ' +
          'secret of these endings.\n\n' +
          'Black is two pawns down, yet this is a dead draw. Look at the blue squares. The king on f6 stands in ' +
          'front of the f-pawn, and the bishop on d6 blocks the d-pawn. Both blockade squares are dark, so White’s ' +
          'bishop can never attack them, and without that the pawns cannot move.\n\n' +
          'The defender’s recipe: blockade on your bishop’s colour, and never move a piece off its post without a ' +
          'reason.',
        fen: '8/8/3b1k2/3P1P2/2B1K3/8/8/8 b - - 0 1',
        shapes: ['d6:blue', 'f6:blue', 'd5d6:red', 'f5f6:red'],
      },
      {
        title: 'Hold the blockade',
        text:
          'Your move, and you have to make one. This is where defenders go wrong: they get restless and move the ' +
          'wrong piece. Your king on f6 holds the f-pawn, and your bishop stands on d6, right in front of the ' +
          'd-pawn. After your move both jobs must still be done.\n\n' +
          'Before you touch a piece, ask two questions: after this move, is d6 still covered, and is my king still ' +
          'in front of the f-pawn?',
        fen: '8/8/3b1k2/3P1P2/2B1K3/8/8/8 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Which move keeps both blockades in place?',
          moves: ['Bc5', 'Bb4', 'Ba3', 'Be7', 'Bf8', 'Bc7', 'Bb8', 'Bg3', 'Bh2', 'Be5'],
          hint: 'Your king is already where it belongs. Which piece can move and still watch d6?',
          success:
            'The bishop changes squares but still covers d6, and your king stays in front of the f-pawn. White has nothing to push.',
          why:
            'White’s bishop can never challenge the dark squares, so your bishop can wait on its diagonal for ever. ' +
            'If the white king comes over to chase it, it just switches to the other diagonal through d6. With no ' +
            'pawn that can move and no square to win, two extra pawns are worth nothing. Defending these endings is ' +
            'mostly patience: find your posts, then pass.',
          wrong: {
            Bf4: {
              text: 'From f4 the bishop still watches d6, but f4 is next to the white king. **Kxf4**, and with your bishop gone the pawns walk through.',
              refute: 'Kxf4',
            },
          },
          failure:
            'A king move holds here too, but your king is already on its post in front of the f-pawn, so leave it there. The bishop is the piece that can move: find a square that still covers d6.',
        },
      },
      {
        title: 'In the middlegame: an extra piece',
        text:
          'Now the other face of opposite bishops. With queens on the board, the side that attacks is a piece up ' +
          'on the colour of its bishop, because the defender’s bishop can never cover those squares.\n\n' +
          'Count the material: Black is a rook and three pawns ahead. It does not matter. Your queen on e4 and your ' +
          'bishop on d3 both aim at h7, a light square, and the only black piece that guards it is the king. The ' +
          'bishop on f6 is a spectator: whatever happens on the light squares, it cannot take part.',
        fen: '3q1rk1/5ppp/5b2/8/4Q3/3B4/8/6K1 w - - 0 1',
        shapes: ['e4h7:red', 'd3h7:red'],
        task: {
          prompt: 'Mate in one. Where do your two pieces meet?',
          moves: ['Qxh7#'],
          acceptAnyMate: true,
          hint: 'Count the attackers and the defenders of the light squares around the black king.',
          success:
            '**Qxh7#**: the queen takes on h7, protected by the bishop. The king cannot take her and has nowhere to go.',
          why:
            'h7 was attacked twice and defended once, by the king. Black’s bishop is a whole piece, yet it could ' +
            'never help, because h7 is a light square. That is the middlegame rule: with opposite bishops, the ' +
            'attacker aims at the squares of its own bishop’s colour. As the defender, cover those squares early, ' +
            'before the attack arrives.',
          failure:
            'Not mate. Look at h7: two of your pieces attack it, and only the king defends it.',
        },
      },
      {
        title: 'Practical advice',
        text:
          'Three rules to take from this lesson:\n\n' +
          '- **Ahead in material?** Think twice before trading into a pure opposite-bishop ending. Keep a pair of ' +
          'rooks or the queens on: with them, extra pawns still count.\n' +
          '- **Defending a worse ending?** Head for one. Trade the other pieces, and put your pawns on the colour ' +
          'of your own bishop, where it protects them and the enemy bishop can never attack them.\n' +
          '- **Attacking?** Put your pieces on your bishop’s colour and aim them at the king. The defender’s bishop ' +
          'cannot cover those squares.',
        fen: '8/8/3b1k2/3P1P2/2B1K3/8/8/8 w - - 0 1',
      },
    ],
    practiceThemes: ['bishopEndgame'],
  },

  {
    id: 'queen-vs-pawn',
    title: 'Queen against pawn',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'A queen beats a pawn on the seventh, except for two stalemate tricks every player must know.',
    minutes: 9,
    steps: [
      {
        title: 'The winning method',
        text:
          'A queen against a pawn on its seventh rank looks like an easy win. But look at the board: Black’s pawn ' +
          'on e2 is one step from queening, its king guards it, and your king on a8 is miles away. You ' +
          'cannot take the pawn, and one careless move lets it promote.\n\n' +
          'The method:\n\n' +
          '1. Use checks, pins and attacks on the pawn to force the black king **in front of** its pawn, onto e1.\n' +
          '2. With the king there, the pawn is blocked for a move. Spend that move bringing your king a step ' +
          'closer.\n' +
          '3. Repeat until your king arrives, then win the pawn or mate.\n\n' +
          'It works against a centre pawn or a knight pawn. For now, Black threatens ...e1=Q.',
        fen: QUEEN_V_PAWN,
        shapes: ['e2e1:red', 'h4d4', 'd4d2:red'],
        task: {
          prompt: 'Find a queen move that keeps the pawn from queening.',
          moves: ['Qd4+', 'Qf4+', 'Qg5+', 'Qh6+', 'Qb4+', 'Qd8+', 'Qf2', 'Qh2'],
          hint: 'A quiet move gives Black the one tempo it needs. Look for a check, or for a pin of the pawn along the second rank.',
          success:
            'The pawn cannot promote: the queen either gives check, so Black must answer it, or pins the pawn to its king along the second rank.',
          why:
            'In this ending every queen move has to force something. A check makes Black answer it and a pin ' +
            'freezes the pawn; a quiet move, even a step by your king, lets ...e1=Q and the win is gone. Eight ' +
            'queen moves do the job here, and the next step follows the check from d4.',
          failure:
            'Black needs only one free move to queen. Every move here has to be forcing: find a check, or a pin along the second rank.',
        },
      },
      {
        title: 'Centre pawn: the method in action',
        text:
          'Say you started with the check from d4, and Black stepped aside to c2, staying close to its pawn. ' +
          'Now ...e1=Q is a threat again, and your king is still far away.\n\n' +
          'Everything you do aims at one picture: the black king on e1, standing in front of its own pawn. With ' +
          'the king there, the pawn cannot move, Black threatens nothing, and your king gets a free step.\n\n' +
          'From c2 the king can guard the pawn on e2 only by stepping to d1, d2 or d3, so those are the squares to watch.',
        fen: fenAfter('Qd4+ Kc2', QUEEN_V_PAWN),
        shapes: ['d1:blue', 'd2:blue', 'd3:blue'],
        task: {
          prompt: 'Which queen move attacks the pawn and leaves the king only one way to guard it?',
          moves: ['Qe3'],
          hint: 'The king guards e2 from d1, d2 or d3. Which queen square attacks e2 and covers two of those?',
          success:
            '**Qe3**: the queen attacks the pawn and covers d2 and d3, so only **Kd1** still guards it. ...e1=Q would be met by Qxe1.',
          why:
            'Black has to guard the pawn with the king, and the only square left for that is d1. Other queen ' +
            'moves attack the pawn too, but they leave the king two or three squares to guard it from; from e3 ' +
            'the queen takes them away at once. Quiet moves like this are part of the method: a check is only ' +
            'worth giving when it drives the king somewhere worse.',
          wrong: {
            Kb7: {
              text: 'Too early. The black king is not in front of its pawn yet, so **e1=Q** comes at once and the win is gone.',
              refute: 'e1=Q',
            },
            Qf2: '**Qf2** attacks the pawn too, but the king can still guard it from d1, d2 or d3. You want a square that leaves it only one.',
            'Qe4+':
              '**Qe4+** is a strong check that attacks the pawn, but ...Kd2 or ...Kd1 keeps it guarded. This line takes the guarding squares away first.',
          },
          failure:
            'Black must be left just one way to guard the pawn. Find the queen square that attacks e2 and covers two of d1, d2 and d3.',
          reply: 'Kd1',
          replyNote:
            'The only move that keeps the pawn: the king guards it from d1. Look at the squares around that king, and at where a check can send it.',
          then: {
            prompt: 'Which check forces the king in front of its own pawn?',
            moves: ['Qd3+'],
            hint: 'Check the king on d1 so that its only safe square is e1.',
            success:
              '**Qd3+**: the king must go to e1, in front of its pawn. Anywhere else, the pawn falls.',
            why:
              'This is the picture the whole method aims for. With the king on e1 the pawn is blocked, so for one ' +
              'move Black threatens nothing. That free move is your tempo, and it goes to your king. A check that ' +
              'lets the king step to the side instead gains no time: always ask which squares your check leaves ' +
              'the king.',
            failure: 'Find the check that leaves the black king only e1, in front of its pawn.',
            reply: 'Ke1',
            replyNote:
              'Forced, unless Black gives up the pawn. The king blocks its own pawn, and Black has no threat this move.',
            then: {
              prompt: 'Black has no threat for one move. How do you use it?',
              moves: ['Kb7', 'Ka7'],
              hint: 'Which of your pieces is still far from the action?',
              success:
                'Your king takes a step toward the pawn. From here you repeat the method until it arrives.',
              why:
                'Now the black king steps out again, and the queen starts over: check, pin and attack until the ' +
                'king is back on e1, then another king step. Each cycle brings your king one square closer, and ' +
                'once it arrives the pawn falls or Black is mated. Against a centre or knight pawn this always ' +
                'works. Patience matters more than speed: never give the pawn a free move.',
              failure:
                'The pawn is blocked for one move, so use the time: bring your own king a step closer.',
            },
          },
        },
      },
      {
        title: 'Bishop pawn: the stalemate trick',
        text:
          'Now you defend with Black, and your pawn is a **bishop pawn**. White has just checked from b4. Against a ' +
          'centre pawn, a check like this drives the king in front of its pawn, which hands White the free ' +
          'move.\n\n' +
          'A bishop pawn gives you a way out: the corner. With your king on a1 the queen can never ' +
          'take the pawn, because **Qxc2** would be stalemate. And with the white king far away on f5, nothing else ' +
          'can help White.',
        fen: '8/8/8/5K2/1Q6/8/1kp5/8 b - - 0 1',
        orientation: 'black',
        shapes: ['a1:blue', 'b4b2:red'],
        task: {
          prompt: 'Which king move sets the stalemate trap?',
          moves: ['Ka1'],
          hint: 'Find the square where **Qxc2** would be stalemate, not a win.',
          success:
            '**Ka1**: into the corner. Now **Qxc2** would leave you without a legal move: stalemate.',
          why:
            'The corner turns White’s main idea against White. The queen cannot take the pawn, and every check just ' +
            'sends your king between a1 and b1. White never gains the free move the method needs, and the white ' +
            'king is too far away to arrive in time. **Kc1**, in front of the pawn, would lose: the pawn stays ' +
            'blocked while the white king walks in.',
          wrong: {
            Ka2: '**Ka2** holds as well, but it sets no trap: with your king on a2, a queen that takes on c2 gives check. Go all the way into the corner, where taking the pawn is stalemate.',
            Kc1: {
              text: 'That steps in front of the pawn, which is what White wants: the pawn is blocked, and the white king walks in with **Ke4**. Black cannot hold.',
              refute: 'Ke4',
            },
          },
          failure: 'Head for the corner, where taking your pawn would be stalemate.',
          reply: 'Qc3+',
          replyNote:
            'White checks along the long diagonal. Your king has to step out of it and still protect the pawn.',
          then: {
            prompt: 'Which king move answers the check and still protects your pawn?',
            moves: ['Kb1'],
            hint: 'Only one square next to the pawn is out of the queen’s reach.',
            success:
              '**Kb1**: out of check, and the king protects the pawn on c2, so it still threatens to promote.',
            why:
              'Watch the squares, not just the check. On b1 your king guards c2 and c1, so the pawn is alive again and ' +
              'White has to keep checking. The other way out of check, ...Ka2, leaves the pawn alone, and **Qxc2+** ' +
              'takes it with check: no stalemate there.',
            wrong: {
              Ka2: {
                text: 'That leaves the pawn unprotected, and with your king on a2 there is no stalemate: **Qxc2+** takes it with check, and the queen wins.',
                refute: 'Qxc2+',
              },
            },
            failure: 'Step out of the check onto a square that still guards your pawn on c2.',
            reply: 'Qb3+',
            replyNote:
              'Another check, and the same question: back into the corner, or in front of the pawn on c1?',
            then: {
              prompt: 'Where does the king go now?',
              moves: ['Ka1'],
              hint: 'One square blocks your pawn and hands White the free move. The other sets the stalemate trap again.',
              success:
                '**Ka1**: back into the corner. Now **Qxc2** is stalemate, and the checks only go round in a circle.',
              why:
                'That is the whole defence: shuttle between a1 and b1 and never step in front of the pawn. White can ' +
                'check for ever without gaining a single tempo, and with the white king too far away, the game is a ' +
                'draw. The rule: against a bishop pawn or a rook pawn, the defending king heads for the corner, not ' +
                'for the square in front of its pawn.',
              wrong: {
                Kc1: {
                  text: 'In front of the pawn at last, and that is exactly what White wanted: the pawn is blocked, the free move goes to the white king, **Ke4**, and the pawn falls.',
                  refute: 'Ke4',
                },
              },
              failure: 'Go back into the corner, where taking your pawn is stalemate.',
            },
          },
        },
      },
      {
        title: 'Rook pawn: the same trick',
        text:
          'A **rook pawn** draws for the same reason, and even more easily. With your king on a1 and the pawn on ' +
          'a2, the queen can hardly come near: **Qb3** would be stalemate at once, and checks only push the king ' +
          'between a1 and b1. Here Black can play any king move (a1, c1 or c2) and still hold, because the corner is ' +
          'never more than a step or two away.\n\n' +
          'Both tricks share one condition: the attacking king must be far away. Bring it within a few squares of ' +
          'the pawn and the queen wins after all, because then the king joins the mating net.',
        fen: '8/7K/8/8/1Q6/8/pk6/8 b - - 0 1',
        orientation: 'black',
        shapes: ['a1:blue', 'b4b3:red'],
      },
      {
        title: 'Summary',
        text:
          '- Queen against a **centre or knight pawn** on the seventh: a win. Force the king in front of its pawn, ' +
          'bring your king one step closer, and repeat.\n' +
          '- Queen against a **bishop or rook pawn**: a draw if the attacking king is far away, thanks to stalemate ' +
          'in the corner; a win if it is close.\n' +
          '- With the pawn further back, on the sixth rank, the queen nearly always wins: there is time to get in ' +
          'front of it.\n\n' +
          'Remember this in pawn races. Queening first does not always win: a bishop or rook pawn on the seventh, ' +
          'with its king beside it, can hold a queen to a draw.',
        fen: 'K7/8/8/8/7Q/8/3kp3/8 w - - 0 1',
      },
    ],
    practiceThemes: ['queenEndgame', 'promotion'],
  },

  {
    id: 'rook-endgames-2',
    title: 'Rook endgames II',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Rooks behind passed pawns, rooks on the seventh, and the Lucena and Philidor positions played through.',
    minutes: 11,
    steps: [
      {
        title: 'Rooks belong behind passed pawns',
        text:
          'You are a pawn up, and it is a passed a-pawn. Black’s rook on a8 has done the natural thing and stands ' +
          'in front of it, attacking it. Your rook on b1 does nothing yet, so the pawn needs a defender now.\n\n' +
          'One of the oldest rules in the endgame helps: rooks belong *behind* passed pawns, yours or your ' +
          'opponent’s. Behind its own pawn a rook defends it all the way to the queening square and gains scope with ' +
          'every step the pawn takes. The rook in front gets the opposite deal: the further the pawn goes, the less ' +
          'room it has.',
        fen: 'r7/5kpp/5p2/P7/8/6P1/5PKP/1R6 w - - 0 1',
        shapes: ['a8a5:red', 'b1a1'],
        task: {
          prompt: 'Where does your rook belong?',
          moves: ['Ra1'],
          hint: 'Defend the pawn from a square where your rook still defends it after the pawn advances.',
          success:
            '**Ra1**: the rook stands behind the pawn and guards it on every square up to a8.',
          why:
            'Compare the two rooks. Yours defends the pawn without having to move again, and every push makes it ' +
            'stronger. Black’s rook can only stand in front of the pawn and wait, and sooner or later the black king ' +
            'has to come and help it. Meanwhile your king is free to walk in. Behind the passed pawn, the rook works ' +
            'and the king plays.',
          wrong: {
            Rb5: '**Rb5** guards the pawn too, and the engine rates it nearly as highly here. But as a rule the rook does better behind: from the side it has to follow the pawn up the board, from behind it never has to move again.',
            'Rb7+':
              'A check on the seventh, but it wins nothing: after ...Kg6 the pawn on a5 is still attacked, and your rook has to go back to guard it. Guard the pawn first.',
          },
          failure:
            'Your a-pawn is attacked and needs a defender. Where can your rook guard it for the whole of its journey?',
          reply: 'Ra6',
          replyNote:
            'Black’s best: the rook blocks the pawn from a6, where it also guards the sixth rank. But it is a passive defender now, tied to the a-file.',
          then: {
            prompt: 'The pawn is safe. Which piece joins the game next?',
            moves: ['Kf3'],
            hint: 'Your rook needs no help. Which piece is still sitting near the edge?',
            success: '**Kf3**: the king heads for the centre, with e4 and d4 in view.',
            why:
              'With the rook doing its job from behind, your king is the extra attacker. It marches toward the ' +
              'queenside to help the pawn on, or turns on the black pawns if the black king goes to stop the a-pawn. ' +
              'Black has no such luxury: its rook is stuck on the a-file, and its king must watch the pawn. That is ' +
              'what the rook behind the pawn buys you.',
            failure:
              'With the rook behind the pawn, the next job is for your king: bring it toward the centre.',
          },
        },
      },
      {
        title: 'Seventh heaven',
        text:
          'Material is level here, and the d-file is open. A rook that reaches the **seventh rank** is worth a lot: ' +
          'it attacks the pawns that have not moved yet, from the side, where no pawn can protect them, and it shuts ' +
          'the enemy king on the back rank.\n\n' +
          'Before you go, check your own back rank. Your pawn on h3 has given your king a square on h2, so a check ' +
          'on the first rank is no danger to you.',
        fen: '2r3k1/pp3ppp/8/8/8/7P/PP3PP1/3R2K1 w - - 0 1',
        shapes: ['d1d7', 'd7b7:red', 'd7f7:red'],
        task: {
          prompt: 'Where does your rook do the most damage?',
          moves: ['Rd7'],
          hint: 'The d-file is open all the way. Which rank holds Black’s unmoved pawns?',
          success: '**Rd7**: the rook lands on the seventh rank, attacks b7 and eyes f7.',
          why:
            'Black must answer the threat to b7, and the natural defence, ...Rb8, puts the rook on a passive square. ' +
            'Your rook stays on the seventh, the black king is cut off on the back rank, and your king can walk to ' +
            'the centre. The position is not won yet, but Black has to defend passively. Rooks belong on open files, ' +
            'and open files lead to the seventh rank.',
          failure:
            'This step is about the open file: find the square on it where your rook attacks Black’s pawns.',
        },
      },
      {
        id: 'lucena',
        title: 'Lucena: building the bridge',
        text:
          'The **Lucena position**: your pawn is on the seventh, your king in front of it, and the black king is ' +
          'cut off by your rook on the f-file. It is a win, but only with technique. Your king wants to step out ' +
          'of e8 so the pawn can queen, and as soon as it does, Black’s rook starts checking.\n\n' +
          'The plan has two steps. First, drive the black king one more file away, so it cannot come back to the ' +
          'pawn later. Then lift your rook to the fourth rank, ready to shield your king from the checks: players ' +
          'call that **building a bridge**.',
        fen: '4K3/4P1k1/8/8/8/8/r7/5R2 w - - 0 1',
        shapes: ['f1g1'],
        task: {
          prompt: 'First step: how do you push the black king further away?',
          moves: ['Rg1+'],
          hint: 'Which rook move gives check and drives the king toward the h-file?',
          success:
            '**Rg1+**: check, and the king must leave the g-file. On the h-file it is three files from your pawn; on f6 it would let your king out to f8.',
          why:
            'Cutting the king off is half of every rook-ending win. On g7 the black king is only two files from the ' +
            'pawn: once your king walks out, it would come back and attack e7. On the h-file it is too far away. A ' +
            'check is worth giving when it puts the enemy king on a worse square; this one does.',
          wrong: {
            Rf4: {
              text: 'The bridge comes too early. **Ra8+** starts the checks along the ranks, your king has to walk away from the pawn, and with its king still on g7 Black is close enough to hold.',
              refute: 'Ra8+',
            },
            Kd7: {
              text: 'Out too soon: **Ra7+** and the checks begin, with nothing to shield your king and the black king close to your pawn.',
              refute: 'Ra7+',
            },
            'Rf7+':
              '**Rf7+** is a check, and it still wins, but the king answers on g8 or g6 and stays close to your pawn. **Rg1+** sends it to the h-file, three files away.',
          },
          failure:
            'Start with a check that drives the black king one more file away from your pawn.',
          reply: 'Kh7',
          replyNote:
            'The king goes to the h-file, three files from your pawn. From there it is too far away to bother it.',
          then: {
            prompt: 'Second step: where does your rook go to build the bridge?',
            moves: ['Rg4'],
            hint: 'Lift the rook to the rank where it will later block a check on the e-file.',
            success:
              '**Rg4**: the rook stands on the fourth rank, ready to cross to e4 when the checks come.',
            why:
              'Now the king walks out, and when the black rook checks from behind, your rook blocks on e4, guarded by ' +
              'your king: for example ...Ra1 Kd7 Rd1+ Ke6 Re1+ Kf6 Rf1+ Ke5 Re1+ Re4, and the checks are over. The ' +
              'rook on g4 also keeps the black king cut off. Two steps, and the Lucena is a win every time.',
            wrong: {
              Kd7: '**Kd7** still wins here, because the black king is so far away, but **Rd2+** starts the checks at once and your king has to turn back. Build the bridge first and the checks run out.',
            },
            failure:
              'Lift your rook to the fourth rank first, so that it can shield your king from the checks later.',
          },
        },
      },
      {
        id: 'philidor',
        title: 'Philidor: checks from behind',
        text:
          'Now you defend. The **Philidor position** is the drawing method against rook and pawn. While the pawn is ' +
          'on the fifth rank, your rook stays on your third rank (the sixth here), so the white king cannot come ' +
          'forward.\n\n' +
          'White has just played **e6**, and the pawn has taken that rank away. But it has given something up too. ' +
          'The only place the white king could hide from checks from behind is in front of its pawn, and your king ' +
          'is standing there. That is your cue to change plans.',
        fen: '4k3/R7/1r2P3/3K4/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['b6b1', 'b1d1:blue'],
        task: {
          prompt: 'Where does your rook go now?',
          moves: ['Rb1'],
          hint: 'Go as far from the white king as you can, on the file you already hold, ready to check from behind.',
          success:
            '**Rb1**: the rook drops to the first rank, as far from the white king as it can get.',
          why:
            'From b1 the rook can check the king from behind on any file, and the pawn on e6 gives it no cover from ' +
            'that side. Distance matters: the further away the rook, the less chance the king has of approaching it. ' +
            '**Rb2**, **Rb3** or **Rb4** follow the same idea, but the first rank gives the most room.',
          wrong: {
            Rb2: 'That follows the right idea, and it holds. But go all the way to b1: the further the rook is from the king, the more room it has for checks.',
            Rb3: 'That follows the right idea, and it holds. But go all the way to b1: the further the rook is from the king, the more room it has for checks.',
            Rb4: 'That follows the right idea, and it holds. But go all the way to b1: the further the rook is from the king, the more room it has for checks.',
            'Rb5+':
              'That holds too, but checks from close range are easier to escape. The safe way is from far away, behind the king: drop the rook to the first rank.',
            Rb8: 'That holds here, but it is the passive way, and it lets White choose the plan. The checks from behind are the method that always works.',
            Kf8: 'That holds for now, but it gives the white king time. The moment the pawn reached e6 was the moment to switch: rook to the first rank, then checks from behind.',
            Kd8: 'That holds for now, but it gives the white king time. The moment the pawn reached e6 was the moment to switch: rook to the first rank, then checks from behind.',
          },
          failure:
            'The pawn has taken your third rank, so the defence now needs checks from behind. Take the rook down to the first rank.',
          reply: 'Kd6',
          replyNote:
            'The king steps up to d6 and threatens mate on the back rank, starting with **Ra8+**. You have one move, and it had better be a check.',
          then: {
            prompt: 'White threatens mate. How do you keep the draw?',
            moves: ['Rd1+'],
            hint: 'A check gains the move you need. From which side can your rook check?',
            success:
              '**Rd1+**: a check from behind, along the d-file. The king has to answer it, and the mate threat is gone.',
            why:
              'From behind, the king has nowhere to hide: Ke5 Re1+ Kf6 Rf1+, and if it walks back toward your rook, ' +
              'the checks go on. The pawn on e6 cannot shelter it, because the checks come from below. That is the ' +
              'Philidor defence: third rank while the pawn is back, first rank and checks once it advances.',
            wrong: {
              'Rb6+':
                'That check holds too, from the side. But your rook on b6 is close to the white king, which can walk toward it; checks from behind, from far away, are the safer method.',
              Rb8: 'That blocks the mate and holds here, but now your rook is passive on the back rank. Checks from behind keep the white king busy instead.',
              Rb7: {
                text: 'That guards the seventh rank, but not the eighth: **Ra8+** comes anyway, and after ...Rb8 Rxb8 it is mate.',
                refute: 'Ra8+',
              },
            },
            failure:
              'White threatens mate on the back rank. A check gains the time you need: check from behind, where the pawn gives the king no shelter.',
          },
        },
      },
      {
        id: 'summary',
        title: 'Summary',
        text:
          '- Rooks belong **behind** passed pawns, yours or your opponent’s.\n' +
          '- An open file leads to the **seventh rank**: get there first.\n' +
          '- Winning with an extra pawn: reach the **Lucena** position (king in front, pawn on the seventh), drive ' +
          'the enemy king away with a check, then build the bridge on the fourth rank.\n' +
          '- Defending: reach the **Philidor** position (king in front of the pawn, rook on your third rank), and ' +
          'once the pawn advances, check from behind.\n\n' +
          'Both positions are in the Drills section, to practise against the engine until the moves come by ' +
          'themselves.',
        fen: '4K3/4P1k1/8/8/8/8/r7/5R2 w - - 0 1',
      },
    ],
    practiceThemes: ['rookEndgame'],
  },

  {
    id: 'the-active-king',
    title: 'The active king',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'In the endgame the king is a fighting piece. Centralise it, learn the key squares, and find the only moves.',
    minutes: 9,
    steps: [
      {
        title: 'Centralise the king',
        text:
          'Once the queens are off, the king stops hiding and starts working. In the centre it attacks pawns, ' +
          'escorts its own and keeps the enemy king out. That is why the first move of so many endgames is a quiet ' +
          'king move.\n\n' +
          'Here you are a pawn up in a pawn ending: four pawns to three on the queenside. Your king on g1 is far ' +
          'from the action, and so is Black’s on g8. Whichever king arrives first will decide what the pawns can do.',
        fen: '6k1/pp3ppp/2p5/8/3P4/2P5/PP3PPP/6K1 w - - 0 1',
        task: {
          prompt: 'What is your first move in this ending?',
          moves: ['Kf1'],
          hint: 'Which of your pieces can do the most once it reaches the centre?',
          success: '**Kf1**: the king sets off for e2 and d3, and then c4 or e4.',
          why:
            'In a pawn ending the king is your only piece, so every tempo it saves counts. Black’s king will race to ' +
            'the centre too, and the one that gets there first can attack pawns and push the other aside. Many quiet ' +
            'pawn moves keep the extra pawn as well, but they can wait: the pawns will still be there, and a pawn ' +
            'move can never be taken back.',
          failure:
            'Your king is the piece that most needs to join the game. Look for the king move that heads toward the centre.',
        },
      },
      {
        title: 'Stay on the key squares',
        text:
          'King and pawn against king comes down to one idea: **key squares**. For a pawn on d3, the key squares ' +
          'are c5, d5 and e5, the three squares two ranks in front of it. If your king reaches one of them, the ' +
          'pawn queens, whoever is to move.\n\n' +
          'Your king is already on d5, so this position is won. But the kings face each other and it is your move. ' +
          'One careless step back and Black takes the **opposition**, and the win is gone.',
        fen: '8/3k4/8/3K4/8/3P4/8/8 w - - 0 1',
        shapes: ['c5:blue', 'd5:blue', 'e5:blue'],
        task: {
          prompt: 'Which move keeps the win?',
          moves: ['Kc5', 'Ke5', 'd4'],
          hint: 'Do not leave the key squares, unless you can make Black move instead.',
          success:
            '**Kc5** or **Ke5** keeps your king on a key square; **d4** passes the move to Black instead. Either way, the black king has to give way.',
          why:
            'With the king on a key square, the opposition does not matter: your king outflanks, gets in front of ' +
            'the pawn and escorts it home. A move such as **Kd4** steps off the key squares, and then ...Kd6 takes ' +
            'the opposition and draws. Learn the key squares for each pawn and your king will know where to go.',
          wrong: {
            Kd4: {
              text: 'A step back, off the key squares. **Kd6** takes the opposition, and Black can mirror your king from now on: a draw.',
              refute: 'Kd6',
            },
            Kc4: {
              text: 'That leaves the key squares, and **Kc6** takes the opposition against your king. Black holds the draw by keeping it.',
              refute: 'Kc6',
            },
            Ke4: {
              text: 'That leaves the key squares, and **Ke6** takes the opposition. From here Black holds the draw.',
              refute: 'Ke6',
            },
          },
          failure: 'Keep your king on c5, d5 or e5, or make Black move instead.',
        },
      },
      {
        title: 'Key squares on the fifth rank',
        text:
          'Now the pawn is on d5. Once a pawn has reached the fifth rank, its key squares are the three in front ' +
          'of it, c6, d6 and e6, and the three beyond, c7, d7 and e7. Your king on e6 stands on one, so this is ' +
          'a win, but only one move keeps it.\n\n' +
          'Two moves look natural and both throw it away. Pushing the pawn lets the black king sit in front of it. ' +
          'And stepping aside hands the black king d7, right in front of your pawn.',
        fen: '3k4/8/4K3/3P4/8/8/8/8 w - - 0 1',
        task: {
          prompt: 'Find the only move that wins.',
          moves: ['Kd6'],
          hint: 'Which key square can your king step to? Leave the pawn where it is for now.',
          success:
            '**Kd6**: your king stays on a key square and takes the opposition. Black has to step aside.',
          why:
            'With the kings face to face and Black to move, the black king must give way, and your king walks round ' +
            'it: after ...Ke8, Kc7, and after ...Kc8, Ke7. Either way the pawn’s path to d8 is yours. **d6** instead ' +
            'lets Black sit on d8: d6 Ke8 d7+ Kd8 Kd6 is stalemate.',
          wrong: {
            d6: {
              text: 'Pushing first lets the black king sit in front of the pawn: after **Ke8** your king cannot get past, and d7+ Kd8 Kd6 would be stalemate.',
              refute: 'Ke8',
            },
            Kf7: {
              text: 'Off the key squares: **Kd7**, and the black king stands in front of your pawn. That is a draw.',
              refute: 'Kd7',
            },
          },
          failure:
            'Your king must stay on a key square: c6, d6 or e6, or the three squares above them. Which one can it reach?',
          reply: 'Ke8',
          replyNote:
            'The black king has to give way, and it chooses e8. Now look at the other side of the board.',
          then: {
            prompt: 'How does your king go round?',
            moves: ['Kc7'],
            hint: 'Take control of d7 and d8, the squares in front of your pawn.',
            success:
              '**Kc7**: your king covers d7 and d8, the pawn’s whole path. Nothing can stop it now.',
            why:
              'This is outflanking: the king steps past the enemy king on the side it has just left. From c7 it guards ' +
              'both squares in front of the pawn, so the pawn walks home on its own. Stepping back to e6 or c6 does ' +
              'not throw the win away, but then you have to take the opposition all over again.',
            wrong: {
              Ke6: 'That keeps the win, but only by stepping back: after ...Kd8 Kd6 you are where you started. Go round the black king instead.',
              Kc6: 'That keeps the win, but only by stepping back: after ...Kd8 Kd6 you are where you started. Go round the black king instead.',
            },
            failure:
              'Go round the black king on the side it left, to the square that covers d7 and d8.',
            reply: 'Ke7',
            replyNote:
              'The king tries to come back toward the pawn from the side. It is one move too late.',
            then: {
              prompt: 'Your king covers the pawn’s path. What now?',
              moves: ['d6+'],
              hint: 'With d7 and d8 covered by your king, the pawn can go. Does it come with check?',
              success:
                '**d6+**: the pawn advances with check, and the black king cannot stop it: your king covers d7 and d8.',
              why:
                'Count it: d7 next, then d8, and the black king never gets in front. Look at the order of the whole ' +
                'line: the king first, the pawn last. In king and pawn endings the king leads and the pawn follows; ' +
                'push too early and the defending king steps in front of it.',
              wrong: {
                Kc6: 'That keeps the win, but it gives the black king time to come back to d8, and you have to start the manoeuvre again. The pawn can go now.',
              },
              failure: 'Your king already covers the pawn’s path. Time for the pawn to move.',
            },
          },
        },
      },
      {
        title: 'Opposition, then outflanking',
        text:
          'The pawn is on d4, so its key squares are c6, d6 and e6. Your king on c5 is not on one yet, and Black ' +
          'will try to keep it out.\n\n' +
          'The tempting move is the pawn: **d5** gains space, but it spends a tempo you may need later. Black ' +
          'answers **...Kc7**, keeps your king out and gets in front of the pawn in time. The right plan uses the ' +
          'kings, not the pawn.',
        fen: '8/3k4/8/2K5/3P4/8/8/8 w - - 0 1',
        task: {
          prompt: 'Find the only move that wins.',
          moves: ['Kd5'],
          hint: 'Put your king directly opposite the black king, with one square between them.',
          success:
            '**Kd5**: the kings face each other, and Black is to move. That is the opposition.',
          why:
            'Black must now step aside, and whichever way it goes, your king walks past on the other side to c6 or ' +
            'e6, a key square. Every other move fails: **d5** lets ...Kc7 keep your king out, and a king move such as ' +
            '**Kb5** lets ...Kd6 plant the black king on a key square itself.',
          wrong: {
            d5: {
              text: 'The pawn goes first, and **Kc7** keeps your king out of c6 and d6. With the opposition in Black’s hands, it is a draw.',
              refute: 'Kc7',
            },
          },
          failure:
            'Put your king directly opposite Black’s, with one square between them, so that Black is the one who has to move.',
          reply: 'Ke7',
          replyNote:
            'The black king gives way to the e-file. Your king can now go round on the other side.',
          then: {
            prompt: 'Which way round?',
            moves: ['Kc6'],
            hint: 'The black king went to the e-file. Step forward on the other side, onto a key square.',
            success:
              '**Kc6**: your king outflanks Black’s and stands on a key square, ready to cover the pawn’s path.',
            why:
              'From c6 your king heads for c7, covering d7 and d8, and the pawn simply walks up the board. Opposition ' +
              'first, then outflanking: that pair of ideas wins most king and pawn endings, and both work only if you ' +
              'keep the pawn back until the king has done its job.',
            wrong: {
              Kc5: 'That keeps the win, but it steps back: after ...Kd7 you have to take the opposition all over again. Step forward on the other side instead.',
              Ke5: 'That keeps the win, but it steps back: after ...Kd7 you have to take the opposition all over again. Step forward on the other side instead.',
            },
            failure:
              'Go round the black king on the side it has left, onto a key square in front of your pawn.',
          },
        },
      },
      {
        title: 'Habits',
        text:
          '- Once the queens are off, bring your king to the centre before you push pawns.\n' +
          '- Learn the key squares: for a pawn up to the fourth rank, the three squares two ranks ahead; from the ' +
          'fifth rank on, also the three squares just in front.\n' +
          '- The king leads, the pawn follows. A pawn move can never be taken back, so keep it as a spare tempo.\n' +
          '- When the kings face each other, count who has to move: that decides who has the opposition.\n\n' +
          'The king and pawn drills turn this into reflexes.',
        fen: '8/3k4/8/3K4/8/3P4/8/8 w - - 0 1',
      },
    ],
    practiceThemes: ['pawnEndgame', 'endgame'],
  },

  {
    id: 'building-a-repertoire',
    title: 'Building an opening repertoire',
    level: 'intermediate',
    category: 'Openings',
    summary:
      'Pick a few openings, learn the plans behind them, and train them with spaced repetition.',
    minutes: 8,
    steps: [
      {
        title: 'What a repertoire is',
        text:
          'A **repertoire** is your prepared answer to whatever your opponent plays: one system with White, one ' +
          'defence against 1. e4 and one against 1. d4. That is enough for years of club chess.\n\n' +
          'How do you choose? Pick openings that suit how you like to play. If you enjoy open positions and ' +
          'tactics, choose lines where the centre opens early; if you prefer plans and structure, choose solid ones. ' +
          'Then stay with them long enough to learn from your own games: switch every month and you never get past ' +
          'move eight.\n\n' +
          'The **Openings** section of this app trains complete repertoires move by move.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      {
        title: 'With White: 1. e4',
        text:
          'Say you play 1. e4 with White. After 1. e4 e5 2. Nf3 Nc6, the first real decision arrives: where does ' +
          'the king’s bishop go?\n\n' +
          '- **Bc4**, the Italian Game, aims at f7 and leads to quick development and natural plans: castle, ' +
          'prepare d4 with c3, then fight for the centre.\n' +
          '- **Bb5**, the Ruy Lopez, pressures the knight on c6, the defender of e5. The fight is slower and deeper, ' +
          'which is why it is the main choice at the top level.\n\n' +
          'Both are excellent. Pick the one whose middlegames you would rather play.',
        fen: AFTER_E4_E5_NF3_NC6,
        shapes: ['f1c4', 'f1b5:blue'],
        task: {
          prompt: 'Where does the king’s bishop go in your repertoire?',
          moves: ['Bc4', 'Bb5'],
          hint: 'Two squares start the two great 1. e4 e5 openings: one aims at f7, the other at the knight on c6.',
          success:
            'Both are main lines. The Italian aims at f7 and prepares c3 and d4; the Ruy Lopez puts pressure on the knight that guards e5.',
          why:
            'Notice that neither move wins anything yet: each one chooses a kind of middlegame. The Italian gives open ' +
            'lines and early contact with f7; the Ruy Lopez builds pressure slowly, aiming to win the centre with c3 ' +
            'and d4. Learn the plans of the one you pick, where the pieces go and which pawn break you want. The ' +
            'moves follow from those.',
          wrong: {
            d4: '**d4** is a fine choice too: the Scotch Game, which opens the centre at once and makes a good repertoire. This step, though, is about the bishop move.',
            Nc3: '**Nc3** is sound too, heading for the Four Knights Game, solid and quiet. This step, though, is about the bishop move.',
          },
          failure:
            'This step is about the king’s bishop: c4 for the Italian or b5 for the Ruy Lopez.',
        },
      },
      {
        title: 'With White: 1. d4',
        text:
          'If you open 1. d4, the main fork in the road comes after 1...d5. Three choices cover most repertoires:\n\n' +
          '- **c4**, the Queen’s Gambit: the most direct fight for the centre, offering a pawn to lure Black’s ' +
          'd-pawn away.\n' +
          '- **Bf4**, the London System: the bishop comes out first, then e3, Nf3, c3 and Bd3. The same setup ' +
          'against almost anything, so there is less theory to learn.\n' +
          '- **Nf3**: a flexible move that keeps both options open.',
        fen: AFTER_D4_D5,
        shapes: ['c2c4', 'c1f4:blue', 'g1f3:yellow'],
        task: {
          prompt: 'Which move starts your repertoire here?',
          moves: ['c4', 'Bf4', 'Nf3'],
          hint: 'Pick one of the three: the gambit pawn, the London bishop or the flexible knight.',
          success:
            'A main road. Whichever you chose, what matters now is the plan: where the pieces go and which pawn break you aim for.',
          why:
            'Here is how the three differ. The Queen’s Gambit fights for the centre at once and leads to rich ' +
            'positions, with more theory. The London gives you the same comfortable setup every game, at the price ' +
            'of fewer chances to hit hard. **Nf3** keeps your options open and can go either way. None is best for ' +
            'everyone: choose the one whose middlegames you want to understand.',
          wrong: {
            e3: '**e3** is playable, the start of the Colle System, but it shuts in your bishop on c1. This step is about the three main choices: c4, Bf4 or Nf3.',
            e4: '**e4** is a gambit: White offers a pawn for open lines. It can be played, but it needs a lot of theory. This step is about the three main choices: c4, Bf4 or Nf3.',
            Nc3: '**Nc3** is playable and has its fans, but it blocks your c-pawn, so the Queen’s Gambit is off. This step is about c4, Bf4 or Nf3.',
          },
          failure:
            'This step is about the three main roads after 1. d4 d5: the Queen’s Gambit with c4, the London with Bf4, or Nf3.',
        },
      },
      {
        title: 'With Black',
        text:
          'With Black you need an answer to 1. e4, and every main defence is fine at club level:\n\n' +
          '- **1...e5**: classical, open positions.\n' +
          '- **1...c5**, the Sicilian: sharp and unbalanced.\n' +
          '- **1...e6**, the French, and **1...c6**, the Caro-Kann: solid, preparing ...d5 next.\n' +
          '- **1...d5**, the Scandinavian: simple, with a clear plan from move one.\n\n' +
          'Choose by temperament, not by fashion. Then learn the typical middlegames of your choice, not just the ' +
          'moves.',
        fen: AFTER_E4,
        orientation: 'black',
        task: {
          prompt: 'How do you answer 1. e4?',
          moves: ['e5', 'c5', 'e6', 'c6', 'd5'],
          hint: 'Any of the five main defences will do: pick the one that suits you.',
          success:
            'A sound choice. Now learn its first eight to ten moves, and above all the plans that come after them.',
          why:
            'At club level the opening rarely decides the game; the middlegame that follows it does. A Sicilian ' +
            'player needs to know the typical attacks on both wings, a French player the ...c5 and ...f6 breaks, a ' +
            'Caro-Kann player where the light-squared bishop belongs. Pick the defence whose middlegames you would ' +
            'enjoy playing a hundred times.',
          wrong: {
            d6: '**1...d6** is a real defence too, the Pirc, usually with ...Nf6 and ...g6. It is a fine choice; this step asks for one of the five main defences above.',
            g6: '**1...g6** is a real defence too, the Modern, a close cousin of the Pirc. It is playable; this step asks for one of the five main defences above.',
            Nf6: '**1...Nf6** is a real defence too: it invites White’s pawns forward, to attack them later. It is playable; this step asks for one of the five main defences above.',
          },
          failure:
            'This step asks for one of the five main defences: ...e5, ...c5, ...e6, ...c6 or ...d5.',
        },
      },
      {
        title: 'How to keep a repertoire',
        text:
          'Here is how I would build and keep one:\n\n' +
          '1. **Plans before moves.** For each line, know where your pieces belong and which pawn break you are ' +
          'aiming for.\n' +
          '2. **Short lines.** Ten moves deep is plenty; below master level, games leave theory early.\n' +
          '3. **Spaced repetition.** Review a line just before you would forget it. The Openings trainer schedules ' +
          'that for you.\n' +
          '4. **Check your games.** After every game, find the move where you left your repertoire, and look up ' +
          'what you should have played.\n' +
          '5. **Grow slowly.** Add a line only when a real game shows you need it.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    ],
    practiceThemes: ['opening'],
  },

  {
    id: 'space-and-pawn-breaks',
    title: 'Space and pawn breaks',
    level: 'intermediate',
    category: 'Strategy',
    summary:
      'Pawns decide where the pieces can go. Learn the breaks that open a position at the right moment.',
    minutes: 9,
    steps: [
      {
        title: 'Space and pawn chains',
        text:
          '**Space** is the territory your pawns control. White’s pawns on d4 and e5 reach deep into Black’s half: ' +
          'Black’s knight cannot use f6, and Black’s pieces have little room behind their own pawns. More space ' +
          'means more room for your pieces and less for your opponent’s.\n\n' +
          'But a pawn chain has a weak point. The pawn on d4 protects e5, but no pawn protects d4 itself: it is ' +
          'the **base** of the chain, and it lives or dies by its defenders. A **pawn break** is a pawn move that ' +
          'challenges a chain like this and opens lines for the pieces. Most middlegame plans are built around one.',
        fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
        shapes: ['e5:red', 'd4:red', 'c7c5'],
      },
      {
        title: 'Attack the base of the chain',
        text:
          'This is the French Defence, Advance Variation. White’s centre cramps you, so you need a plan against ' +
          'it, and the plan starts with a target: the base of the chain, d4.\n\n' +
          'Here is how I think about it: count. Every attacker you add on d4 has to be met by a white defender, and ' +
          'every white piece busy guarding d4 is not doing anything else.',
        fen: FRENCH_ADVANCE,
        orientation: 'black',
        shapes: ['d4:red'],
        task: {
          prompt: 'Which pawn break attacks the base of White’s chain?',
          moves: ['c5'],
          hint: 'Which of your pawns can reach a square that attacks d4?',
          success:
            '**c5**: the pawn strikes at d4, the base of White’s chain, and prepares to open the c-file.',
          why:
            'Attack a chain at its base, because that is the pawn the others lean on: if d4 falls or has to take on ' +
            'c5, e5 is left without a pawn to protect it. The only pawn that can still help d4 is the c-pawn, from ' +
            'c3, so the fight will be about pieces. Later, ...f6 can strike at the front of the chain as well.',
          wrong: {
            Bd7: '**...Bd7** is a good move too, and often comes soon. But first things first: this step is about the pawn break itself.',
            f6: '**...f6** hits the front of the chain, and its time comes later. Played now it loosens your king and the e6 pawn, while the base of the chain is the better target.',
          },
          failure:
            'This step is about the pawn break: find the pawn move that attacks d4, the base of White’s chain.',
          reply: 'c3',
          replyNote:
            'White supports d4 with a pawn, the natural answer. Now d4 is attacked once and defended twice, by the pawn and the queen.',
          then: {
            prompt: 'Add a second attacker on d4. Which piece?',
            moves: ['Nc6'],
            hint: 'Which minor piece can come out and hit d4 at once?',
            success: '**Nc6**: the knight develops and adds a second attacker on d4.',
            why:
              'This is development with a purpose: the knight had to come out anyway, and on c6 it joins the attack ' +
              'on the centre. Count again: two attackers, two defenders, so d4 holds for now, but every new attacker ' +
              'needs an answer. The other knight often follows via e7 to f5, adding even more pressure.',
            wrong: {
              Qb6: '**...Qb6** is a good move too, and often played here. In this line the knight comes first, because it develops a piece that has to come out anyway.',
              Ne7: '**...Ne7** is a good move too, heading for f5. If White takes on c5, **...Ng6** attacks e5 and opens the bishop’s diagonal to c5, so the pawn comes back. This step is about the knight that hits d4 at once.',
            },
            failure: 'Find a piece that develops and attacks d4 in the same move.',
            reply: 'Nf3',
            replyNote:
              'White adds another defender: the knight on f3. Now d4 is guarded by a pawn, a knight and the queen.',
            then: {
              prompt: 'Which move brings a third piece to bear on d4, and eyes b2 as well?',
              moves: ['Qb6'],
              hint: 'Your queen can join in. Find a square on the diagonal toward d4 that also looks down the b-file at b2.',
              success:
                '**Qb6**: the queen lines up behind the c5 pawn, aiming at d4, and attacks b2 down the b-file.',
              why:
                'Now count: the pawn, the knight and the queen bear down on d4, against the pawn, knight and queen ' +
                'that guard it, and b2 needs care too. White’s pieces are tied to defence while yours develop with ' +
                'purpose. That is the French Advance in one plan: ...c5, ...Nc6, ...Qb6, and often a knight to f5. ' +
                'In any opening, know which pawn your pieces are aiming at.',
              wrong: {
                Bd7: '**...Bd7** is a good move too, and the engine likes it just as much. This line, though, is about adding pressure on d4, and the bishop does not touch it.',
                Nge7: '**...Nge7** is a good move too, heading for f5. If White takes on c5, **...Ng6** attacks e5 and opens the bishop’s diagonal to c5, so the pawn comes back. This line, though, is about pressure on d4, and the knight on e7 does not touch it.',
                cxd4: '**...cxd4** is playable, but it releases the tension: after cxd4 White’s centre is solid again. Keep the pressure on and add another attacker first.',
                g5: {
                  text: '**...g5** just hangs a pawn: **Bxg5** wins it with an attack on your queen. Keep adding pressure on d4 instead.',
                  refute: 'Bxg5',
                },
              },
              failure:
                'Bring one more piece to bear on d4. Which one can line up on the diagonal toward it?',
            },
          },
        },
      },
      {
        title: 'Open the centre when you are better developed',
        text:
          'After 1. e4 e5 2. Nf3 Nc6 3. Bc4 Be7 Black has chosen a modest square for the bishop: on e7 it defends, ' +
          'but it does not fight for the centre. Your bishop on c4 and knight on f3 are the more active pieces, ' +
          'and it is your move.\n\n' +
          'Here is the rule I follow: when you are ahead in development, open the position, because open lines ' +
          'favour the side with more pieces ready to use them. When you are behind, keep it closed.',
        fen: ITALIAN_PASSIVE,
        task: {
          prompt: 'Which pawn move opens the centre?',
          moves: ['d4'],
          hint: 'Which central pawn can attack e5 right away, with your knight and queen behind it?',
          success:
            '**d4**: the pawn strikes at e5. After 4...exd4 5. Nxd4 you keep a pawn on e4, and your pieces get open lines.',
          why:
            'With the centre open, the more active side gets to use the lines first. Black would like a quiet game ' +
            'with ...d6 and ...Nf6, and every move you spend elsewhere helps Black get there. When you are better ' +
            'developed, ask yourself on every move: can I open the position now?',
          wrong: {
            'O-O':
              '**O-O** is a good move too, and d4 can follow next. This step is about striking while Black is still passive, so open the centre now.',
            c3: '**c3** is a good move too: it prepares d4 with pawn support. This step is about striking at once, while Black’s bishop is still passive on e7.',
            Nc3: '**Nc3** is a sound developing move, but it does not open anything yet. This step is about the pawn that strikes at e5.',
            d3: '**d3** is solid, but it keeps the centre closed, which suits the side with the more passive pieces: Black. Open it instead.',
          },
          failure:
            'This step is about opening the centre while Black is passive: which pawn move attacks e5 at once?',
        },
      },
      {
        title: 'The King’s Indian break: ...f5',
        text:
          'In the King’s Indian the centre is locked, with pawns on d5 and e4 against d6 and e5. A locked centre ' +
          'changes the question from “where do the pieces go?” to “where do the pawns break?” White will break on ' +
          'the queenside with c5. Your break is on the kingside, toward White’s king.\n\n' +
          'Look how the position has been prepared for it. The knight on f6 went back to d7, so the f-pawn is free, ' +
          'and the other knight on e7 is ready to join the attack.',
        fen: KID_MAINLINE,
        orientation: 'black',
        shapes: ['f7f5', 'e4:red'],
        task: {
          prompt: 'Which pawn break is the whole point of this setup?',
          moves: ['f5'],
          hint: 'Which pawn can strike at e4, the base of White’s chain?',
          success:
            '**f5**: the pawn strikes at e4, the base of White’s chain, and opens the way for your rook on f8.',
          why:
            'It is the same rule as in the French: attack the chain at its base. White’s chain d5–e4 rests on e4, so ' +
            'you hit e4, just as White will hit your pawn on d6 with c5. With the centre locked, the game becomes a ' +
            'race between those two breaks, and here everything is ready for yours.',
          failure:
            'This step is about your pawn break: which pawn move strikes at White’s centre from the kingside?',
          reply: 'f3',
          replyNote:
            'White props up e4 with a pawn, the usual answer. Taking on e4 now would only open the f-file for both sides.',
          then: {
            prompt: 'White has supported e4. How do you keep the kingside attack going?',
            moves: ['f4'],
            hint: 'Think about your kingside pawns: which one can gain space and prepare ...g5 and ...g4?',
            success:
              '**f4**: the pawn gains space next to White’s king and shuts in White’s dark-squared bishop. Next come ...g5 and ...g4.',
            why:
              'With the centre locked, the game is a race: White attacks on the queenside with c5, you attack on the ' +
              'kingside with your pawns, aiming at White’s king. Taking on e4 would open the f-file for White’s rook as ' +
              'much as yours and free White’s centre. Know your break, and know what comes after it: here, ...g5, ' +
              '...g4 and an attack on the king.',
            wrong: {
              fxe4: '**...fxe4** opens the f-file, but for White’s rook on f1 as much as yours, and after fxe4 White’s centre is solid again. Gaining space with the pawn keeps the attack going.',
              Nf6: '**...Nf6** is a good move too, and often played here. This step, though, is about the pawns: they lead the kingside attack.',
            },
            failure:
              'Your kingside pawns lead the attack. Which pawn move gains space next to White’s king?',
          },
        },
      },
      {
        title: 'Timing a break',
        text:
          'My rules of thumb for pawn breaks:\n\n' +
          '- Break in the centre when you are **better developed**; keep it closed when you are behind.\n' +
          '- Attack a pawn chain at its **base**, the pawn the others lean on, or at its front when the base is ' +
          'out of reach.\n' +
          '- With **more space**, avoid trades and prepare your break; with less space, trade pieces and break ' +
          'early.\n' +
          '- Before every break, look at the files and diagonals it will open, for both sides. A break that opens ' +
          'lines toward your own king can backfire.',
        fen: KID_MAINLINE,
      },
    ],
    practiceThemes: ['middlegame'],
  },
];
