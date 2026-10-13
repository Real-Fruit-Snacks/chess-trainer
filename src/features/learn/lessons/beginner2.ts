import { fenAfter, type Lesson } from '../model';

const SCHOLAR = fenAfter('1. e4 e5 2. Qh5 Nc6 3. Bc4');
const LEGAL_START = fenAfter('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6');
const SHILLING = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5');
const SHILLING_AVOID = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4');

export const beginnerLessons2: Lesson[] = [
  {
    id: 'how-games-end',
    title: 'Draws and how games end',
    level: 'beginner',
    category: 'Rules',
    summary:
      'Checkmate is not the only ending: stalemate, perpetual check, repetition, the fifty-move rule and more.',
    minutes: 9,
    steps: [
      {
        title: 'Ways a game can end',
        text:
          'A game ends in one of three decisive ways: **checkmate**, **resignation** (a player gives up) ' +
          'or **time** (a clock runs out, which loses unless the opponent could never mate). Anything else ' +
          'is a **draw**, half a point each:\n\n' +
          '- **Stalemate**: the side to move has no legal move but is *not* in check.\n' +
          '- **Insufficient material**: nobody has enough pieces left to mate.\n' +
          '- **Threefold repetition**: the same position comes up three times.\n' +
          '- **Fifty-move rule**: fifty moves each with no capture and no pawn move.\n' +
          '- **Agreement**: both players say yes.\n\n' +
          'The board shows a stalemate. Black is not in check, but the king has nowhere to go and there ' +
          'is nothing else to move. It is the draw beginners give away most often.',
        fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['f7g8:red', 'f7g7:red', 'f7h7:red', 'h8:blue'],
      },
      {
        title: 'Do not stalemate a beaten opponent',
        text:
          'White has a queen against a bare king, and the win is one move away. The most natural-looking ' +
          'move is **Qf7**: it covers every square around the king. But the king is not in check, and ' +
          'Black has no other piece to move. That is stalemate again, just like the first board.\n\n' +
          'So before you take squares away, ask a question: *after my move, can Black still move, or is ' +
          'it checkmate?* A won game is the easiest one to throw away.',
        fen: '7k/3Q4/5K2/8/8/8/8/8 w - - 0 1',
        shapes: ['d7f7:red'],
        task: {
          prompt: 'Find the checkmate in one.',
          moves: ['Qg7#'],
          acceptAnyMate: true,
          hint: 'A queen next to the king is safe only if your own king guards her. Which square next to the king does yours guard?',
          success:
            '**Qg7#**: the queen checks from g7, your king guards her, and the black king has no square left.',
          why:
            'Both queen moves take every square away from the king. The only difference is the check: with ' +
            'it you have checkmate, without it stalemate. In a won position, count your opponent’s legal ' +
            'moves before every quiet queen move, and if there are none, make sure you are giving check.',
          wrong: {
            Qf7: '**Qf7** looks strong, but there is no check and Black has no legal move. That is stalemate, and the game is drawn even though you are a whole queen up.',
          },
          failure:
            'Not checkmate yet. The queen must give check from a square next to the king, and your own king has to guard that square so she cannot be taken.',
        },
      },
      {
        title: 'Stalemate as a lifeline',
        text:
          'Now the other side of the coin. Black is a bishop down, and White threatens **Qf7**, with mate on ' +
          'g7 to follow. But look at the black king: it is stuck on h8, and the pawns on g6 and h7 are ' +
          'blocked by White’s pawns on g5 and h6. The only black piece that can move is the queen.\n\n' +
          'That is a chance. If the queen could vanish at the right moment, Black would have no legal move ' +
          'and no check to answer. A queen is a fair price for a draw when the alternative is mate.',
        fen: '7k/7p/6pP/3Q2P1/2B5/8/1q6/6K1 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:red', 'g6:red', 'h7:red', 'd5f7:yellow'],
        task: {
          prompt: 'Which check can White only answer by capturing your queen?',
          moves: ['Qg2+'],
          reply: 'Kxg2',
          hint: 'Sacrifice the queen with check, on a square where taking her is White’s only legal reply.',
          success:
            '**Qg2+**: the queen checks next to the white king, and White’s only legal replies are **Kxg2** and **Qxg2**.',
          replyNote:
            'White has to take, and whichever piece does, Black’s king and pawns are frozen with no check to answer. Stalemate: a draw, from a position that was about to lose.',
          why:
            'This is the classic stalemate swindle. Black’s king and pawns are frozen, so once the queen is gone ' +
            'Black has no legal move. When you are losing, check whether your king is boxed in and whether you ' +
            'have a check that can only be answered by a capture. Half a point is far better than none.',
          wrong: {
            'Qf2+':
              '**Qf2+** draws too, but White has a choice. **Kxf2** is stalemate, yet **Kh1** sidesteps and you need a second queen check. I asked for the check that leaves White no choice.',
            'Qh2+':
              '**Qh2+** draws as well, but White can sidestep with **Kf1** instead of taking, and you need a second queen check. I asked for the check where taking is White’s only legal reply.',
          },
          failure:
            'That is not the check I am after. Look for one next to the white king, where every legal reply is a capture of your queen.',
        },
      },
      {
        title: 'Perpetual check',
        text:
          'Black’s pawn on a2 is one step from queening, and a second queen would win the game. White cannot ' +
          'stop it, but White’s queen can keep giving check, and every check must be answered at once, so ' +
          'Black never gets the free move it needs.\n\n' +
          'If the checks can go on for ever, the same positions come round again and again. That is a ' +
          '**perpetual check**, and the game ends in a draw by repetition. The black king helps: its own ' +
          'pawns on f7, g6 and h7 take away its squares.',
        fen: '6k1/5p1p/6p1/4Q3/7P/6P1/p4PK1/1q6 w - - 0 1',
        shapes: ['a2:red', 'g8:blue'],
        task: {
          prompt: 'Which check keeps the game alive?',
          moves: ['Qe8+'],
          reply: 'Kg7',
          hint: 'Black’s king is boxed in by its own pawns. Which check leaves it only one way out?',
          success: '**Qe8+**: check along the eighth rank, and the king’s only move is to g7.',
          replyNote:
            'Forced: f7 and h7 are blocked by Black’s own pawns, and the king cannot stay on the eighth rank. Now the queen needs another check.',
          why:
            'White cannot stop the pawn, so any quiet move lets Black queen and win. A check is different: Black must answer it, so ' +
            'you decide what happens next. When you are losing, look for checks the king cannot escape from.',
          failure:
            'Only a check can stop Black queening, and the queen must be safe on the square she checks from. Find the check that Black can answer only by moving the king.',
          then: {
            prompt: 'The king is on g7. Which check comes next?',
            moves: ['Qe5+'],
            reply: 'Kg8',
            hint: 'Look at the diagonal the king is standing on.',
            success:
              '**Qe5+**: check along the long diagonal, from the square that also watches a1.',
            replyNote:
              'Back to g8, and the position is the one we started from, for the second time. Another round makes it three, and a player can claim the draw.',
            why:
              'The queen shuttles between e8 and e5, and the king between g8 and g7. Black can try other squares ' +
              '(after ...Kf8, Qc5+ keeps the checks going), but they never end, and Black never has time to queen.',
            failure:
              'Keep checking, from a square where nothing can capture the queen. Black can answer only by moving the king.',
          },
        },
      },
      {
        title: 'Draws by rule',
        text:
          'Some draws need nobody to do anything clever.\n\n' +
          '- **Insufficient material.** King and bishop against a bare king, as on the board, can never end ' +
          'in mate, so the game is drawn at once. The same goes for a lone knight. Two knights cannot force ' +
          'mate either, but the game goes on.\n' +
          '- **Threefold repetition.** The same position, with the same side to move, comes up three times, ' +
          'not necessarily in a row. This is how a perpetual check ends.\n' +
          '- **Fifty-move rule.** Fifty moves by each side pass with no capture and no pawn move.\n\n' +
          'The last two do not happen by themselves: a player has to claim the draw. So when you are ahead, keep making progress.',
        fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1',
        shapes: ['c1:blue', 'e8:blue'],
      },
      {
        title: 'Resigning and offering a draw',
        text:
          'Resigning is a decision, and beginners tend to make it too early. Resign when you are certain the ' +
          'position is lost against *this* opponent, not just because you are a piece down. Players ' +
          'blunder, and swindles like the stalemate you found are real. If in doubt, play one more move.\n\n' +
          'To offer a draw, make your move first, then ask before you press the clock. Your opponent can ' +
          'accept or simply decline, and then you play on. Offer one when you think the position is ' +
          'balanced, or when you are worse and happy with half a point.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    ],
  },

  {
    id: 'opening-traps',
    title: 'Opening traps and how to avoid them',
    level: 'beginner',
    category: 'Openings',
    summary:
      'Scholar’s mate, Légal’s mate and the Blackburne Shilling: see them once, never fall for them again.',
    minutes: 10,
    steps: [
      {
        title: 'Scholar’s mate',
        text:
          'A **trap** is a move that looks natural, or even free, and loses. The most common one at beginner ' +
          'level is **Scholar’s mate**: **1. e4 e5 2. Qh5 Nc6 3. Bc4**. White’s queen and bishop both aim ' +
          'at f7, the square only the king guards, and White threatens **Qxf7#**.\n\n' +
          'Your first instinct is probably to attack the queen, and that is exactly what the trap is ' +
          'waiting for. A threat of mate comes first: deal with it, then attack.',
        fen: SCHOLAR,
        orientation: 'black',
        shapes: ['h5f7:red', 'c4f7:red'],
        task: {
          prompt: 'Stop the mate on f7 and attack the queen at the same time.',
          moves: ['g6'],
          reply: 'Qf3',
          hint: 'A pawn can stand between the queen on h5 and f7. Which pawn move also attacks the queen?',
          success: '**g6**: the pawn blocks the diagonal to f7 and attacks the queen.',
          replyNote:
            'The queen must move, and **Qf3** is the natural retreat: she looks at f7 again down the f-file, with the bishop beside her. The pawn has cost White a move, but the threat is back.',
          why:
            'Before you make a threat of your own, ask what your opponent is threatening. Here it is mate, ' +
            'so only a move that deals with it counts, and the best one defends and attacks at once. ' +
            'A pawn that blocks the line and hits the queen makes her run, and you keep developing.',
          wrong: {
            Nf6: {
              text: '**Nf6** attacks the queen and develops a piece, and it is the move most players try first. But it ignores the mate: **Qxf7#**. Deal with a threat to your king before you make one of your own.',
              refute: 'Qxf7#',
            },
            Qe7: '**Qe7** guards f7, and it holds. But the queen comes out early, blocks your own bishop and leaves White’s queen alone. **g6** does the same job and attacks her.',
            Qf6: '**Qf6** guards f7 too, and it is playable. But it brings your queen out early, where White can chase her with a developing move. **g6** gains the time instead.',
            Nh6: '**Nh6** guards f7 as well, but a knight on the rim is dim, and White’s queen is not even attacked. Prefer the defence that costs White a move.',
            Ke7: {
              text: '**Ke7** runs from the mate, but it gives up castling and leaves the king in the middle: **Qxf7+** drives it on, and none of your pieces are out to help. Block the line instead.',
              refute: 'Qxf7+',
            },
            d5: {
              text: '**d5** blocks the bishop’s diagonal, so the mate is gone, and it attacks the bishop. But **Bxd5** simply wins a pawn, and the queen still eyes f7. There is a defence that costs nothing.',
              refute: 'Bxd5',
            },
          },
          failure:
            'Not that one. White threatens **Qxf7#**: stop it with a move that also attacks the queen.',
          then: {
            prompt: 'The queen and bishop still aim at f7. Which knight move blocks the f-file?',
            moves: ['Nf6'],
            hint: 'A knight on the f-file would stand between the queen on f3 and f7, and develop at the same time.',
            success: '**Nf6**: the knight blocks the f-file, develops, and attacks the pawn on e4.',
            why:
              'Now f7 is safe, and one move did three jobs. Count the moves: White has moved the queen ' +
              'twice and brought out one bishop, while you have two knights in play and your bishop is ' +
              'about to join. An early queen raid costs the attacker time, so meet it with calm, ' +
              'developing moves.',
            wrong: {
              Bg7: {
                text: '**Bg7** is the natural follow-up to g6, but it forgets about f7: **Qxf7#**. The bishop move can wait until the threat is dealt with.',
                refute: 'Qxf7#',
              },
              Nd4: {
                text: '**Nd4** attacks the queen, which makes it tempting, but she simply takes on f7 with mate. An attack on the queen does not help when she can answer with checkmate.',
                refute: 'Qxf7#',
              },
              Ke7: {
                text: '**Ke7** gets the king off the line, but **Qxf7+** chases it into the middle of the board, with your pieces still at home. A knight can block the file without any of that.',
                refute: 'Qxf7+',
              },
              d5: {
                text: '**d5** blocks the bishop’s line to f7 and attacks it, but **Bxd5** simply wins a pawn. The knight on f6 does the same job without losing anything.',
                refute: 'Bxd5',
              },
              f5: '**f5** also blocks the f-file, but it loosens the pawns in front of your king and leaves your pieces at home. **Nf6** blocks it with a developing move.',
            },
            failure:
              'Not that one. White’s queen and bishop still aim at f7: find the knight move that blocks the f-file.',
          },
        },
      },
      {
        title: 'Légal’s mate: a queen sacrifice',
        text:
          'Now you play White. After **1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6**, Black’s bishop is ' +
          '**pinning** your knight on f3: a pinned piece cannot move without exposing something more ' +
          'valuable behind it, here your queen. Most players leave a pinned knight alone.\n\n' +
          'But look at f7, where only the king stands guard, and at the pawn on e5. A queen is a lot to ' +
          'give away, so ask first: what do I get if Black takes her?',
        fen: LEGAL_START,
        shapes: ['g4d1:red', 'c4f7:blue'],
        task: {
          prompt: 'Find the surprising move that moves the pinned knight and sets the trap.',
          moves: ['Nxe5'],
          reply: 'Bxd1',
          hint: 'A pinned knight can still capture. Which pawn can it take, and what would that knight then attack?',
          success:
            '**Nxe5**: the knight takes a pawn and leaves your queen to the bishop, if Black wants her.',
          replyNote:
            'Black takes the queen, which is exactly what the trap is built for. **dxe5** was the safer reply: after **Qxg4** White is a pawn up and clearly better. Now the attack begins.',
          why:
            'A sacrifice makes sense when you can see the mate at the end of it. The knight on e5 and the ' +
            'bishop on c4 both bear down on f7, where only the king stands guard, and Black’s own pieces ' +
            'crowd the king. You are not hoping: you are calculating.',
          failure:
            'Not that one. The bishop pins the knight, so think about a move that uses the knight with a capture.',
          then: {
            prompt: 'Black has taken the queen. Which check starts the mate?',
            moves: ['Bxf7+'],
            reply: 'Ke7',
            hint: 'Both the bishop and the knight attack f7. The check you want cannot be captured.',
            success:
              '**Bxf7+**: the bishop checks, and the king cannot take it, because the knight on e5 guards f7.',
            replyNote:
              'The only legal move. The king cannot take the bishop, and the knight on e5 covers d7, so it steps forward into the middle of its own pieces.',
            why:
              'A check that cannot be captured drags the king forward. Both knights have a job: the one on ' +
              'e5 guards the bishop and covers d7, and the one on c3 is about to jump to d5. Always count ' +
              'your attackers: three small pieces against a king boxed in by its own men are plenty.',
            failure:
              'Not that one. You need a check that Black cannot answer by taking the piece. Which of your pieces attacks f7?',
            then: {
              prompt: 'Checkmate in one.',
              moves: ['Nd5#'],
              acceptAnyMate: true,
              hint: 'The king on e7 is boxed in by its own pieces. Which knight can give it check?',
              success:
                '**Nd5#**: the knight checks from d5, and every square around the king is covered or blocked by its own pieces.',
              why:
                'Black’s own pawn on d6, queen on d8 and bishop on f8 take away the king’s squares, and your ' +
                'bishop and knights cover the rest. You gave a queen, and three small pieces mated the king ' +
                'in the middle of its army. If a queen is offered for free in the opening, look for what ' +
                'follows before you take her.',
              failure: 'Not mate. Look for a knight check that the king cannot run from.',
            },
          },
        },
      },
      {
        title: 'The Blackburne Shilling Gambit',
        text:
          'A **gambit** is an opening where a player offers a pawn for a lead in development or an ' +
          'attack. Black has just played one: **1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4**, leaving the e5 pawn ' +
          'to be taken. White took it, **4. Nxe5**, and now you are Black, with a quiet reply that ' +
          'attacks the knight and the pawn on g2 at once.\n\n' +
          'If White grabs again, the game ends in checkmate.',
        fen: SHILLING,
        orientation: 'black',
        shapes: ['e5:red', 'g2:red'],
        task: {
          prompt: 'Attack the knight on e5 and the pawn on g2 at once.',
          moves: ['Qg5'],
          reply: 'Nxf7',
          hint: 'Which queen move hits e5 along the fifth rank and g2 down the g-file?',
          success: '**Qg5**: the queen attacks the knight on e5 and the pawn on g2 at once.',
          replyNote:
            'White grabs again, and the knight now attacks your queen and rook. That is the trap working. A calmer **O-O** would have kept White in the game, but a greedy player looks for more.',
          why:
            'The quiet queen move makes two threats at once, and nothing about it looks dangerous, so White ' +
            'feels safe. Many traps have this shape: a calm move with two threats behind it. When your ' +
            'opponent takes a pawn, ask what your next move could attack.',
          wrong: {
            d5: {
              text: '**d5** hits the bishop, but **Bxd5** wins a second pawn. The gambit only works if the quiet queen move comes first.',
              refute: 'Bxd5',
            },
          },
          failure: 'Not that one. Look for the queen move that hits e5 and g2 at the same time.',
          then: {
            prompt:
              'The knight attacks your queen and rook. Which capture saves her and hits the rook?',
            moves: ['Qxg2'],
            reply: 'Rf1',
            hint: 'One white pawn on the g-file has no protection. Taking it also attacks the rook on h1.',
            success:
              '**Qxg2**: the queen escapes with a capture, and attacks the rook on h1 and the pawn on e4.',
            replyNote:
              'White saves the rook by moving it to f1. But the king is still in the middle, with its pieces all around it, and the pawn on e4 is loose.',
            why:
              'You did not need to rescue the queen: a capture that carries a threat is stronger than a ' +
              'retreat. White has one move to spend, and it must save the rook, so the pawn on e4 falls ' +
              'next, with check.',
            failure:
              'Not that one. The queen must leave f7’s attack, ideally by capturing something and attacking the rook on h1.',
            then: {
              prompt: 'Take the pawn on e4 with check.',
              moves: ['Qxe4+'],
              reply: 'Be2',
              hint: 'The e-file is open between your queen and the white king.',
              success:
                '**Qxe4+**: the queen checks along the e-file, and White has only two ways to answer.',
              replyNote:
                'Both blocks are bad. **Qe2** loses the queen to **Nxe2**, and **Be2**, the natural one, walks into mate.',
              why:
                'Every move came with a threat, so White never had time to untangle. Now the king’s only ' +
                'helpers are blocks, and a block on e2 is pinned by your queen on the e-file.',
              wrong: {
                d5: '**d5** wins too, since it attacks the bishop and the pawn on e4. But **Qxe4+** comes with check and forces the end at once.',
              },
              failure: 'Not that one. Take the loose pawn with a check along the e-file.',
              then: {
                prompt: 'Checkmate in one.',
                moves: ['Nf3#'],
                acceptAnyMate: true,
                hint: 'The bishop on e2 is pinned. Which knight check can it not answer?',
                success:
                  '**Nf3#**: the knight checks, the bishop on e2 is pinned by your queen and cannot take it, and the king has no square.',
                why:
                  'White’s king is hemmed in by its own queen, rook and bishop, and the bishop is pinned to ' +
                  'it. The lesson for White: castle and develop before you grab pawns, especially when ' +
                  'the pawn is offered for nothing.',
                failure: 'Not mate. Look at the knight on d4: one check cannot be answered.',
              },
            },
          },
        },
      },
      {
        title: 'Do not fall for it',
        text:
          'Now you are White, and Black has just played **3...Nd4**, offering the e5 pawn. Taking it ' +
          'looks free: after **Nxe5** Black has no capture that wins anything back. But a pawn offered on move three ' +
          'should make you ask what the catch is, and you have just seen it. **Qg5** attacks the ' +
          'knight and g2 together, and if White grabs twice it ends in mate.\n\n' +
          'You do not need to fear the knight on d4. It can be traded or ignored.',
        fen: SHILLING_AVOID,
        shapes: ['f3e5:red', 'f3d4:blue'],
        task: {
          prompt: 'Black offers the e5 pawn. How do you turn it down?',
          moves: ['Nxd4', 'O-O', 'Nc3'],
          hint: 'Take the knight on d4, castle, or bring out your other knight.',
          success: 'You leave the pawn on e5 alone and carry on with your development.',
          why:
            'My choice is **Nxd4**: after **exd4** the knight that was annoying you is gone, and Black’s ' +
            'pawn on d4 is a target. But **O-O** and **Nc3** are fine too. What matters is the habit: ' +
            'when material is offered early, ask what the offer opens up before you take it.',
          wrong: {
            Nxe5: {
              text: '**Nxe5** is the move the whole gambit is built for. After **Qg5** the knight and the g2 pawn are both under attack, Black already has the better game, and **Nxf7?** loses by force.',
              refute: 'Qg5',
            },
          },
          failure:
            'That is not the move I am after. Leave the pawn on e5 alone, and either take the knight on d4, castle, or bring out your other knight.',
        },
      },
    ],
    practiceThemes: ['opening', 'mateIn2'],
  },

  {
    id: 'trading-pieces',
    title: 'When to trade pieces',
    level: 'beginner',
    category: 'Strategy',
    summary: 'Ahead? Trade pieces. Behind? Keep them. Under attack? Trade the attackers.',
    minutes: 8,
    steps: [
      {
        title: 'The three rules of trading',
        text:
          'Every capture that your opponent answers with a recapture is a **trade**. Trades are never ' +
          'neutral: they change who is winning, and three rules tell you when to want them.\n\n' +
          '- **Ahead in material? Trade pieces**, not pawns. A queen up on a crowded board is messy; a ' +
          'queen up with nothing else left is easy.\n' +
          '- **Behind? Avoid trades.** Pieces on the board mean complications, and complications mean ' +
          'chances.\n' +
          '- **Under attack? Trade the attackers**, above all the queen.\n\n' +
          'The next two boards show trades that do a job: ending an attack, and removing a defender.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      {
        title: 'Trade the attacker',
        text:
          'White is a knight and two pawns up, but Black threatens **Qxg2#**: the bishop on b7 looks ' +
          'all the way down the long diagonal and would protect the queen on g2. You could defend ' +
          'awkwardly. A strong player asks something simpler: can I take the attacker off the board?\n\n' +
          'Black’s queen is doing all of Black’s work, and yours can take her. Once the queens are ' +
          'gone, the extra material does the rest.',
        fen: '2r3k1/pb3p2/1p6/7p/N5q1/2N5/PP3PPP/3QR1K1 w - - 0 1',
        shapes: ['g4g2:red', 'b7g2:red'],
        task: {
          prompt: 'Stop the mate by trading queens.',
          moves: ['Qxg4+'],
          reply: 'hxg4',
          hint: 'Look along the diagonal from your queen on d1.',
          success:
            '**Qxg4+**: your queen takes Black’s with check, and the mate threat goes with her.',
          replyNote:
            'Black has to recapture, or it is simply a queen down. Now the queens are off, and your knight and two pawns are still there.',
          why:
            'The whole attack was one piece: Black’s queen, with the bishop behind her. Take her off and ' +
            'the threat is gone, while your extra material is still on the board and counts for more ' +
            'with fewer pieces left. When you are ahead and under attack, trade the attacker first.',
          wrong: {
            Qf3: {
              text: '**Qf3** offers a queen trade of your own, but the bishop on b7 sees f3: **Bxf3**, and you have lost your queen. Before you trade, check what the other side’s bishops and rooks are looking at.',
              refute: 'Bxf3',
            },
            Nd5: {
              text: '**Nd5** blocks the diagonal, but Black simply trades queens with **Qxd1** and then takes the knight with **Bxd5**, and most of your extra material is gone. Trade the queens on your terms instead.',
              refute: 'Qxd1',
            },
            f3: '**f3** also stops the mate, and it is a good move. But the queen just steps away and the attack goes on. I would rather take her off the board.',
            g3: '**g3** stops the mate too, but it weakens the light squares around your king, and Black’s queen stays on the board. Trading her is cleaner.',
          },
          failure:
            'The threat is **Qxg2#**. Look for the move that takes Black’s queen off the board, not one that only blocks her.',
        },
      },
      {
        title: 'Trade the defender',
        text:
          'Material is level, and h7 is the target. Your queen on d3 and your knight on g5 attack it, ' +
          'but Black has two defenders: the king and the knight on f6, so a capture on h7 now would ' +
          'lose. A trade can remove a defender as well as an attacker.\n\n' +
          'If your bishop takes the knight on f6, the king is left alone to guard h7.',
        fen: 'r4rk1/pb2qppp/1p2pn2/6N1/2P5/1P1Q4/PB3PPP/3RR1K1 w - - 0 1',
        shapes: ['d3h7:red', 'g5h7:red', 'f6h7:blue'],
        task: {
          prompt: 'Which capture removes a defender of h7?',
          moves: ['Bxf6'],
          reply: 'g6',
          hint: 'Which of your pieces can capture the knight on f6?',
          success:
            '**Bxf6**: the bishop takes the defender. If Black recaptures with the pawn or the queen, **Qxh7#** is mate, because the knight on g5 protects the queen.',
          replyNote:
            'Black’s best defence: the pawn blocks the queen’s line to h7. But it leaves Black’s queen on e7 facing your bishop.',
          why:
            'Your bishop on b2 was doing little, and the knight on f6 was holding Black’s king together, ' +
            'so this trade is a good deal. Before you trade, ask what the enemy piece is guarding. When ' +
            'it is the key defender, the trade wins more than material.',
          wrong: {
            Nxh7: {
              text: '**Nxh7** wins a pawn for a moment, but Black’s knight takes it, and if your queen recaptures, the king takes her. Count the attackers against the defenders first.',
              refute: 'Nxh7',
            },
          },
          failure:
            'Look at h7: your queen and knight attack it, and the knight on f6 helps the king defend it. Which of your pieces can remove that knight?',
          then: {
            prompt: 'Collect the queen.',
            moves: ['Bxe7'],
            hint: 'The bishop that just took on f6 now attacks something big.',
            success: '**Bxe7**: the bishop takes the queen, and it attacks the rook on f8 as well.',
            why:
              'Black’s best defence against the mate still cost the queen. The trade did not win anything by ' +
              'itself: it removed the one piece that held h7, and the rest followed. That is the habit: ' +
              'look at what a piece is protecting before you decide whether to trade it.',
            failure: 'Not that one. Your bishop on f6 attacks Black’s queen: take it.',
          },
        },
      },
      {
        title: 'Which pieces to trade',
        text:
          'Beyond counting material, look at the quality of the pieces you could trade.\n\n' +
          '- **Trade a bad bishop.** A bishop hemmed in by its own pawns does little. After 1. e4 e6 ' +
          '2. d4 d5 3. e5, Black’s bishop on c8 is the example: the pawns on d5 and e6 stand on light ' +
          'squares, the bishop’s own colour, and block it.\n' +
          '- **Trade your passive pieces for your opponent’s active ones**, never the other way round.\n' +
          '- **Space decides who wants trades.** White’s pawn on e5 gives White more room, so White ' +
          'avoids trades. Black is cramped and wants them.',
        fen: fenAfter('1. e4 e6 2. d4 d5 3. e5'),
        orientation: 'black',
        shapes: ['c8:blue', 'd5:red', 'e6:red', 'e5:green'],
      },
    ],
  },

  {
    id: 'pawn-races',
    title: 'Pawn races and the square',
    level: 'beginner',
    category: 'Endgames',
    summary: 'Can the king catch the pawn? Count the square — and count the race.',
    minutes: 8,
    steps: [
      {
        title: 'The rule of the square',
        text:
          'Can the king catch the pawn? You do not have to count every move. Draw an imaginary ' +
          '**square** from the pawn to its promotion square. The pawn on h4 needs four moves to queen, ' +
          'so the square runs from h4 up to h8, across to d8 and back down to d4. If the defending king ' +
          'can step **into that square** on its move, it catches the pawn. If it cannot, the pawn ' +
          'queens.\n\n' +
          'Black’s king stands on c4, one file outside the square, and it is White’s move.',
        fen: '8/8/8/8/2k4P/8/1K6/8 w - - 0 1',
        shapes: ['h4h8', 'h8d8', 'd8d4', 'd4h4', 'c4:red'],
        task: {
          prompt: 'Black’s king is outside the square. What does White play?',
          moves: ['h5'],
          reply: 'Kd5',
          hint: 'A king move would spend a tempo. Which move keeps Black outside the square?',
          success:
            '**h5**: the pawn steps forward and the square shrinks to h5–e8, with the black king still outside it.',
          replyNote:
            'The king comes closer, but it is still one file short: the square now runs from e5 to h8, and d5 is outside it. The pawn stays ahead.',
          why:
            'Counting the square saves you counting every move. The king is one file short, and each push ' +
            'keeps it one step behind: h6 Ke6 h7 Kf7 h8=Q. In a pawn race, check the square first. If the ' +
            'enemy king is outside it, every move that is not a push is a wasted tempo.',
          failure:
            'Not that one. After any other move the black king steps into the square and catches the pawn. Keep it outside by pushing.',
        },
      },
      {
        title: 'Inside the square: catch it',
        text:
          'Now you play Black. The same pawn stands on h4, and your king is on d4: exactly on the corner ' +
          'of its square, so it is already inside. It is your move, and the square shrinks each time the ' +
          'pawn advances. Keep the king inside it and you will catch the pawn. Step outside, for ' +
          'example down the board, and the pawn queens.',
        fen: '8/8/8/8/3k3P/8/1K6/8 b - - 0 1',
        orientation: 'black',
        shapes: ['h4h8', 'h8d8', 'd8d4', 'd4h4'],
        task: {
          prompt: 'Which king step keeps you inside the square?',
          moves: ['Ke5', 'Ke4', 'Kd5'],
          hint: 'The square is five files wide, from d to h. Which steps keep you inside it?',
          success: 'The king stays inside the square, so it will catch the pawn.',
          why:
            'Whichever of the three you chose, the pawn cannot get away: after Ke5 h5 Kf6 h6 Kg6 it is ' +
            'attacked and falls, and king against king is a draw. Compare the last step: the same pawn ' +
            'won when the king stood one file further away. One tempo decides a pawn race.',
          failure:
            'That steps out of the square, and the pawn queens. Choose a step that keeps the king on the d-file or further right, and on the fourth rank or higher.',
        },
      },
      {
        title: 'A pawn on its starting square',
        text:
          'The pawn is back on its starting square, h2, and Black’s king stands on b5. A pawn on its ' +
          'starting square can move two squares at once, so it is quicker than it looks.\n\n' +
          'After a one-step push the square runs from h3 up to h8 and across to c8. After the double ' +
          'step it runs from h4 to h8 and across to d8. Black’s king reaches the c-file next move.',
        fen: '8/8/8/1k6/8/8/7P/K7 w - - 0 1',
        shapes: ['h2h4', 'b5:red'],
        task: {
          prompt: 'Which push leaves Black’s king outside the square?',
          moves: ['h4'],
          reply: 'Kc5',
          hint: 'Count the files of the square after each push. Black’s king is on the b-file.',
          success:
            '**h4**: the double step starts the square from the d-file, so the king’s step to the c-file is still outside it.',
          replyNote:
            'The king takes the closest step it can, to the c-file, but it is still outside the square. Black is a file short, and the pawn is a move ahead.',
          why:
            'With a pawn on its starting square, count the double step. After h3 Kc5 the king is inside ' +
            'the square and catches the pawn. After the double step it stays outside, and the pawn ' +
            'queens: h5 Kd6 h6 Ke6 h7 Kf6 h8=Q+. A pawn that has not moved is faster than it looks.',
          wrong: {
            h3: {
              text: '**h3** is the natural push, but it wastes the double step. Black’s king steps to the c-file, inside the square, and catches the pawn: a draw. Count the square before you push.',
              refute: 'Kc5',
            },
          },
          failure:
            'That is not the idea of this step. The pawn is the fastest piece here, and a pawn on its starting square can move two squares.',
        },
      },
      {
        title: 'Counting a race',
        text:
          'When both sides have a passed pawn, count the moves. White’s a-pawn needs three moves to ' +
          'queen, and Black’s h-pawn needs three too. White moves first, so White queens first.\n\n' +
          'Now look at the long diagonal from a8. It runs straight through Black’s king on e4, so the ' +
          'new queen will give check, and then it also covers h1.',
        fen: '8/8/8/P7/4k2p/8/8/1K6 w - - 0 1',
        shapes: ['a8e4:red', 'a8h1:blue'],
        task: {
          prompt: 'Can you win the race?',
          moves: ['a6'],
          reply: 'h3',
          hint: 'Do not touch the king. Push the pawn and count.',
          success: '**a6**: the pawn starts the race, with the first move in hand.',
          replyNote:
            'Black races too, and the h-pawn also needs three moves. Running the king towards the a-pawn instead would not help: after Kd5 a7 the pawn still queens.',
          why:
            'Both pawns need three moves and you move first, so every move must be a push. A king move ' +
            'would give Black the extra tempo, and the race would be lost. Count first, then run.',
          failure:
            'Not that one. Your pawn needs three moves, Black’s pawn needs three, and you move first. Every move that is not a push gives that lead away.',
          then: {
            prompt: 'Keep pushing. Where does the pawn go?',
            moves: ['a7'],
            reply: 'h2',
            hint: 'Your pawn is on the sixth rank. Two more steps to queen.',
            success: '**a7**: the pawn is now one step from queening.',
            replyNote:
              'Both pawns are now one step from queening, but it is White’s move, and that is the whole difference.',
            why:
              'You are one move ahead, and pushing the pawn keeps it that way: next turn it queens. The ' +
              'check is what matters then, because a queen that arrives with check makes Black answer ' +
              'it first.',
            failure:
              'The idea of this step is to keep pushing: your pawn is a move ahead of Black’s, and pushing it keeps it there.',
            then: {
              prompt: 'Queen the pawn with check.',
              moves: ['a8=Q+'],
              reply: 'Ke5',
              hint: 'Look at the long diagonal from a8: the black king stands on it.',
              success:
                '**a8=Q+**: the new queen gives check along the long diagonal, so Black has to answer it.',
              replyNote:
                'The king must leave the diagonal, and now your queen sees h1. The pawn on h2 will fall before it can queen.',
              why:
                'Both pawns needed three moves and you moved first, so you queened first. The check is the ' +
                'bonus: Black must move the king, and then your queen, which watches h1, stops the last ' +
                'pawn. Count the race, and look at what your new queen will attack.',
              failure:
                'The idea of this step is to queen the pawn with check: a queen on a8 checks along the long diagonal and covers h1.',
            },
          },
        },
      },
    ],
    practiceThemes: ['pawnEndgame', 'promotion'],
  },
];
