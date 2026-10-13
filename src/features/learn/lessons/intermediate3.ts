import { fenAfter, type Lesson } from '../model';

// Two Knights Defence, Fried Liver Attack.
const FRIED_LIVER = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5';
const FRIED_NXF7 = fenAfter(FRIED_LIVER);
const FRIED_DEFENCE = fenAfter(`${FRIED_LIVER} 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3`);
// Philidor Defence: a king left in the centre, three positions of the same attack.
const OPEN_KING =
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5';
const OPEN_KING_START = fenAfter(OPEN_KING);
const OPEN_KING_ROOK = fenAfter(`${OPEN_KING} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8`);
const OPEN_KING_FINISH = fenAfter(
  `${OPEN_KING} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7`,
);
// Italian Game: the fork trick.
const FORK_TRICK = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Nc3');

export const intermediateLessons3: Lesson[] = [
  {
    id: 'rook-vs-minor-piece',
    title: 'Rook against a minor piece',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Rook against knight or bishop is normally a draw — if the defender keeps the piece next to the king and knows which corner is safe.',
    minutes: 9,
    steps: [
      {
        id: 'keep-them-together',
        title: 'Keep them together',
        text:
          'A rook against a lone knight, with no pawns left, is a **draw** in almost every position. The stronger ' +
          'side wins only when the defender goes wrong, and the classic mistake is letting the knight drift away ' +
          'from its king.\n\n' +
          'So the defender’s rule is simple: **keep the knight next to your king**, where the king protects it and ' +
          'nothing can pin it.\n\n' +
          'Here White’s rook attacks your knight along the seventh rank, and the white king on e5 is ready to come ' +
          'to d6 and attack it a second time. Your king has to defend the knight from a square where that second ' +
          'attack changes nothing.',
        fen: '8/R3n1k1/8/4K3/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['a7e7:red'],
        task: {
          prompt: 'Where should your king go to defend the knight?',
          moves: ['Kf8'],
          hint: 'Two king moves defend e7. Follow the seventh rank from the rook on a7: after each of them, what stands behind the knight?',
          success:
            '**Kf8**: the king defends the knight from the back rank, off the seventh, so the knight stays free to move.',
          why:
            'On f7 your king would stand on the seventh rank right behind the knight, and the rook would pin it: Kd6 ' +
            'attacks it a second time, and a pinned knight cannot run. On f8 nothing is pinned, and Kd6 even runs ' +
            'into Nc8+, forking king and rook. With a minor piece, ask before every king move: can my piece still ' +
            'move afterwards?',
          wrong: {
            Kf7: {
              text: 'That defends the knight, but your king now stands on the seventh rank behind it, so the rook pins it. After **Kd6** it is attacked twice, defended once, and cannot move: the knight is lost.',
              refute: 'Kd6',
            },
          },
          failure:
            'Your king has to stay in touch with the knight, on a square where the rook cannot pin it. Which defending square is off the seventh rank?',
          reply: 'Ke6',
          replyNote:
            'White brings the king to e6 instead. Now king and rook both attack the knight, and only your king defends it. Something has to give, and where the knight goes decides the game.',
          then: {
            prompt: 'Where does the knight go?',
            moves: ['Ng8'],
            hint: 'It needs a square next to your king, where the king still protects it. Which one can it reach?',
            success:
              '**Ng8**: the knight steps next to its king, which protects it there, and nothing attacks it on g8.',
            why:
              'Next to the king is where a knight survives: the king protects it, and it can hop out and back as ' +
              'needed. **Nc6** looks more active, but far from its king the knight can be cut off and hunted down. ' +
              'Keep the picture for every such ending: knight and king touching, never apart.',
            wrong: {
              Nc6: {
                text: 'The centre looks active, but it takes the knight away from its king. **Ra8+** drives your king off, and then the white rook and king hunt the lonely knight down.',
                refute: 'Ra8+',
              },
              Ng6: {
                text: 'That square is not next to your king, so after **Kf6** the knight is attacked and nothing defends it. Keep it on a square your king touches.',
                refute: 'Kf6',
              },
              Nc8: {
                text: 'On c8 the knight stands on your back rank, and **Ra8** pins it to your king. It cannot move, your king cannot reach it, and the rook takes it next.',
                refute: 'Ra8',
              },
              Ke8: {
                text: 'The knight stays defended, but your king has walked into a back-rank check: Ra8+ Nc8 Rxc8#.',
                refute: 'Ra8+',
              },
            },
            failure:
              'The knight must move, and it needs a square next to your king, where the king still protects it.',
          },
        },
      },
      {
        id: 'knight-on-the-rim',
        title: 'A knight on the rim',
        text:
          'Now swap sides. You have the rook, and the black knight has wandered to b1, far from its king on g8: ' +
          'exactly what a defender must never allow.\n\n' +
          'A knight on the edge has few squares, and this one has three: a3, c3 and d2. Your king covers c3 and ' +
          'd2. Your rook could cover a3 and c3 along the third rank, but your own king is standing in its way. ' +
          'So the king has to step aside, and the best step attacks the knight at the same moment.',
        fen: '6k1/8/8/8/8/3K3R/8/1n6 w - - 0 1',
        shapes: ['b1:red', 'a3:blue', 'c3:blue', 'd2:blue'],
        task: {
          prompt: 'Which king move traps the knight?',
          moves: ['Kc2'],
          hint: 'Your king blocks the rook along the third rank. Which king move clears the rank and attacks b1 as well?',
          success:
            '**Kc2**: the king attacks the knight and steps off the third rank, so the rook now covers a3 and c3. The king itself covers d2.',
          why:
            'Wherever the knight goes it is taken: Na3+ Rxa3, Nc3 Kxc3, Nd2 Kxd2. **Rh1** attacks it too, but the ' +
            'rook leaves the third rank, Na3 slips out and the chase goes on for ages. Count a piece’s squares ' +
            'before you attack it, and let the attacking move do a second job.',
          wrong: {
            Rh1: 'That attacks the knight too, but the rook leaves the third rank and **Na3** slips out. The win is still there, but it has become a long, careful chase.',
            Ke2: 'That wins as well: the king covers d2 and the rook, now free, covers a3 and c3, so the knight is stuck. But it takes **Rb3** next to attack it, where **Kc2** attacks it at once.',
          },
          failure:
            'The knight’s squares are a3, c3 and d2. Find the move that attacks it while your king and rook between them cover all three.',
        },
      },
      {
        id: 'safe-corner',
        title: 'Rook against bishop: the safe corner',
        text:
          'With a bishop, everything depends on **which corner** the defending king reaches. In a corner of the ' +
          'colour the bishop does *not* move on, the two squares beside the king on the edge are the bishop’s ' +
          'colour, so it can block a check right next to the king. In a corner of the bishop’s own colour it ' +
          'cannot, and the king can be mated.\n\n' +
          'Your bishop on b3 runs on light squares, so the dark corners, **h8** and **a1**, are your safe ones; ' +
          'a8 and h1 are dangerous. Your king on f8 stands between h8 and a8, and nothing is attacked yet. This ' +
          'is the moment to choose.',
        fen: '5k2/8/8/4K3/8/1b6/8/2R5 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:green', 'a1:green', 'a8:red', 'h1:red'],
        task: {
          prompt: 'Which way should your king head?',
          moves: ['Kg7', 'Kg8'],
          hint: 'Your bishop moves on light squares. Which corner near your king is dark?',
          success:
            'Toward h8, the dark corner. Beside it, g8 and h7 are light squares, so your bishop can block a check on the back rank or the h-file next to the king.',
          why:
            'In the h8 corner a rook check along the eighth rank is met by ...Bg8, and a check down the h-file by ' +
            '...Bh7, each block defended by the king. The a8 corner is the opposite: b8 and a7 are dark, the ' +
            'bishop cannot block there, and the king can be mated, as the next step shows. Pick your corner early, ' +
            'while the king still has the choice.',
          wrong: {
            Ke8: 'That holds for now, but it heads for a8, a light corner. Beside it, b8 and a7 are dark, so your bishop could never block a check next to the king. Head the other way, toward h8.',
            Ke7: 'That holds for now, but it drifts toward the a8 corner, where your light-squared bishop cannot block a check next to the king. Toward h8 is the way.',
          },
          failure:
            'Choose the corner first: with a light-squared bishop the safe corners are the dark ones, h8 and a1. Which king move heads for h8?',
        },
      },
      {
        id: 'wrong-corner',
        title: 'Punishing the wrong corner',
        text:
          'Now you have the rook, and Black’s king has run into h8 with a **dark-squared** bishop: the corner of ' +
          'the bishop’s own colour. The squares beside the king, g8 and h7, are light, and that bishop can never ' +
          'stand on them.\n\n' +
          'Your king on g6 already takes g7 and h7, so the black king is left with one square, g8. A check on the ' +
          'back rank takes that too, and then the only defence is a block by the bishop, far from its king.',
        fen: '7k/8/6K1/4b3/8/8/8/R7 w - - 0 1',
        shapes: ['g8:red', 'h7:red'],
        task: {
          prompt: 'Mate in two. Which check starts it?',
          moves: ['Ra8+'],
          hint: 'A check along the eighth rank leaves the king no square. Where can the bishop block it, and is that square defended?',
          success:
            '**Ra8+**: check along the back rank. The king has no square, so the bishop must block on b8.',
          why:
            'Count the king’s squares before you check: your king covers g7 and h7, and a rook on the eighth rank ' +
            'covers g8. That leaves only a block, and the one dark square the bishop can reach on the back rank is ' +
            'b8, far from its king. **Rh1+** is the natural check, but the king just steps to g8.',
          wrong: {
            'Rh1+':
              'A check, but down the h-file the king simply steps to g8. It still wins in the end, only slowly. The back rank is the check the king cannot step out of.',
          },
          failure:
            'Look for a check the king cannot step out of: along the back rank, where only the bishop can block, far from its king.',
          reply: 'Bb8',
          replyNote:
            'Black’s only move. The bishop blocks on b8, the one dark square on the back rank it can reach, and nothing defends it there.',
          then: {
            prompt: 'Finish it.',
            moves: ['Rxb8#'],
            acceptAnyMate: true,
            hint: 'Is anything defending the bishop on b8?',
            success:
              '**Rxb8#**: the rook takes the blocker with check, and your king still covers g7 and h7.',
            why:
              'The bishop had to give itself up, because no square beside its king was its colour. That is the whole ' +
              'difference between the corners: with a light-squared bishop, ...Bg8 would have blocked right next to ' +
              'the king, defended. Attacking, drive the king toward the bishop’s colour; defending, run the other way.',
            failure: 'Not mate yet. The bishop on b8 is undefended: take it with check.',
          },
        },
      },
      {
        id: 'remember',
        title: 'Remember',
        text:
          'Rook against a minor piece is a draw with good defence, and a win when the defender drifts. The whole ' +
          'lesson in four lines:\n\n' +
          '- With a knight: keep it **next to your king**, where it can never be pinned or cut off.\n' +
          '- With a bishop: run to the corner of the **opposite colour** to your bishop, where it can block every check.\n' +
          '- With the rook: separate the knight from its king, or drive the king toward the corner of the bishop’s colour.\n' +
          '- Either way, count the minor piece’s squares before every move. That is where these endings are won and lost.',
        fen: '5k2/8/8/4K3/8/1b6/8/2R5 b - - 0 1',
        orientation: 'black',
      },
    ],
    practiceThemes: ['knightEndgame', 'bishopEndgame'],
  },

  {
    id: 'queen-endgames',
    title: 'Queen endgames',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Queen endgames are about checks: the attacker hides from them, the defender lives on them. Learn both sides.',
    minutes: 9,
    steps: [
      {
        id: 'push-the-pawn',
        title: 'Push the pawn, then hide the king',
        text:
          'With queens on the board, an extra pawn is worth less than in any other ending, because the defending ' +
          'queen can **check for ever**. Three ideas decide most queen endings:\n\n' +
          '- The **passed pawn**: push it as far as it will go. On the seventh rank it ties the enemy queen down.\n' +
          '- **King shelter**: walk your king toward the pawn and your queen, where the checks run out.\n' +
          '- **Perpetual check**: the defender’s drawing weapon.\n\n' +
          'Here you have queen and pawn against queen. Your king and queen already stand beside the pawn’s path, ' +
          'and Black’s king is far away on h2. Every tempo counts.',
        fen: '8/8/1PK5/2Q5/8/8/7k/q7 w - - 0 1',
        shapes: ['b6b7', 'b7b8:blue'],
        task: {
          prompt: 'Which move makes the most progress?',
          moves: ['b7'],
          hint: 'Count how many moves the pawn needs to promote. What can the black queen do while you wait?',
          success:
            '**b7**: the pawn reaches the seventh rank, one step from queening. Black has to start checking at once.',
          why:
            'A pawn on the seventh ties the black queen to b8 and leaves Black nothing but checks to hope for. A check ' +
            'first, such as **Qf2+**, only drives the king to a square it is happy on, and the pawn still has two ' +
            'steps to go. In queen endings, push the passed pawn whenever the checks allow it.',
          wrong: {
            'Qf2+': {
              text: 'A check, but it only drives the king to h1, and the pawn still has two steps to go. In theory it still wins, but a check that gains nothing gives Black’s queen time to find better squares.',
              refute: 'Kh1',
            },
            Kc7: {
              text: 'The king walks next to the pawn, but the pawn is still on b6, and **Qg7+** starts the checks. Push first: the king can step across once the checks begin.',
              refute: 'Qg7+',
            },
          },
          failure:
            'The pawn is your winning chance, and every move it waits gives Black’s queen time. How far can it go right now?',
          reply: 'Qa4+',
          replyNote:
            'Black starts checking from the side. Your king needs a square where the checks run out, and the best ones are next to your own pawn.',
          then: {
            prompt: 'Where does your king go?',
            moves: ['Kc7'],
            hint: 'Look for a square next to the pawn, where the king guards b8 and stands close to your queen.',
            success:
              '**Kc7**: the king steps next to its pawn and guards b8. Your queen on c5 shields it, and Black has just one safe check left.',
            why:
              'A king in the open gets checked for ever; a king next to its pawn and queen soon runs out of checks. ' +
              'On c7 your queen shuts the c-file and covers a5 and a7, so ...Qf4+ is the only safe check left. **Kd6** ' +
              'also wins, but c7 is where king, queen and pawn work together. When the checks start, walk toward your pawn.',
            wrong: {
              Kd6: 'That also wins, but on d6 the king is a step away from its pawn and more exposed. On c7 it guards b8 itself and stands behind your queen, which leaves Black almost no checks.',
              Kb6: {
                text: 'Behind the pawn the king is still out in the open: **Qb3+** and the checks go on, with no shelter in sight.',
                refute: 'Qb3+',
              },
              Qb5: {
                text: 'Blocking with the queen gives up the c-file: **Qc2+** and the checks start again. Move the king to a square where they run out.',
                refute: 'Qc2+',
              },
            },
            failure:
              'Your king needs shelter from the checks. Which square next to the pawn also guards b8?',
            reply: 'Qf4+',
            replyNote:
              'The last safe check, along the diagonal from f4. No king move ends the checks from here, so look at your other pieces.',
            then: {
              prompt: 'How do you answer this check?',
              moves: ['Qd6'],
              hint: 'A king move lets the checks go on. Can something block the diagonal with an offer Black cannot accept?',
              success:
                '**Qd6**: the queen blocks the check and offers a trade. If Qxd6+ Kxd6, nothing can stop b8=Q, and if Black declines, the pawn promotes anyway.',
              why:
                'With an extra passed pawn, a queen trade is the best thing that can happen to you: the pawn ending is ' +
                'an easy win. So when you are checked, look for a block that offers the trade. **Qe5** blocks too, but ' +
                'nothing protects it, and Qxe5+ takes it. The defender, in turn, must avoid queen trades at all costs.',
              wrong: {
                Kc8: {
                  text: 'The king runs to the back rank, but the checks follow it: **Qg4+**, and they go on. In the open, a king does not escape a queen by running.',
                  refute: 'Qg4+',
                },
                Kb6: {
                  text: 'Away from the pawn the king is even more exposed: **Qf6+**, and the checks continue. Block the check instead.',
                  refute: 'Qf6+',
                },
              },
              failure:
                'Every king move lets the checks go on. Look for a block on the diagonal that offers a queen trade, which your extra pawn would win.',
            },
          },
        },
      },
      {
        id: 'check-that-guards',
        title: 'A check that guards b8',
        text:
          'Same material, a different picture. Your pawn is already on b7, but Black’s queen on b1 watches b8 straight ' +
          'up the b-file, so promoting now would just lose the new queen.\n\n' +
          'Look at the diagonal from b8 to h2. The black king stands at one end of it and the promotion square at ' +
          'the other. A queen anywhere on that diagonal checks the king and guards b8 at the same time. That is the ' +
          'kind of move that wins queen endings: a check that also does a job.',
        fen: '8/1P6/2K5/3Q4/8/8/7k/1q6 w - - 0 1',
        shapes: ['b1b8:red'],
        task: {
          prompt: 'How do you get the pawn through?',
          moves: ['Qd6+', 'Qe5+'],
          hint: 'Find a queen move that checks the king on h2 and covers b8 in one go.',
          success:
            'A check along the b8–h2 diagonal that also guards b8. The king has to step aside, and next move the pawn promotes under your queen’s protection.',
          why:
            'Checks are usually the defender’s weapon, but this one gains a tempo: Black must answer it, and by then ' +
            'b8 is covered. **b8=Q** at once fails to Qxb8, and queen against queen is a draw. Before you promote, ask ' +
            'what guards the queening square, and whether a check can add a guard for free.',
          wrong: {
            'b8=Q+': {
              text: 'The new queen even gives check, but the black queen on b1 simply takes it: **Qxb8**, and queen against queen is a draw. Guard b8 first.',
              refute: 'Qxb8',
            },
            Kc7: 'That wins as well, the way we saw before: the king shelters next to its pawn. But a check that guards b8 is quicker, because the pawn promotes on the very next move.',
          },
          failure:
            'Look for a check that also covers b8: the diagonal from b8 to h2 runs straight to the black king.',
          reply: 'Kh3',
          replyNote:
            'The king steps off the diagonal, as any king move would, and b8 is now guarded by your queen.',
          then: {
            prompt: 'Now finish the job.',
            moves: ['b8=Q'],
            hint: 'What guards b8 now?',
            success:
              '**b8=Q**: the pawn promotes under your queen’s protection, and you have two queens against one.',
            why:
              'Black can still check for a while, but two queens soon block the checks or force a trade, and the extra ' +
              'queen decides. The order mattered: first the check that guards b8, then the promotion. In your own games, ' +
              'look for checks that do a second job: they are how the side with the extra pawn gains time.',
            wrong: {
              Kc7: 'That also wins, but there is nothing to wait for: b8 is guarded now, so the pawn can promote at once.',
            },
            failure:
              'Your queen guards b8 now, so the pawn can promote, and a queen is the piece you want.',
          },
        },
      },
      {
        id: 'defenders-weapon',
        title: 'The defender’s weapon',
        text:
          'Now the other side of the board. White’s pawn is on a7, and the queen on b8 guards a8: next move White ' +
          'makes a second queen, and there is no time to stop it in the ordinary way.\n\n' +
          'That is the moment for the defender’s weapon, **perpetual check**. If Black checks on every move, White ' +
          'never has time for a8=Q, and endless checks end in a draw by repetition. But the checks must come without ' +
          'a pause: one quiet move, and the pawn promotes. Look at White’s king on g1 and the squares around it.',
        fen: '1Q6/P4pk1/6p1/7p/4q3/6P1/5P1P/6K1 b - - 0 1',
        orientation: 'black',
        shapes: ['a7a8:red', 'g1:red'],
        task: {
          prompt: 'How does Black save the game?',
          moves: ['Qe1+'],
          hint: 'Only a check stops a8=Q. Which one does not hand White your queen?',
          success: '**Qe1+**: check along the back rank. The king has only one square, g2.',
          why:
            'Qb1+ and Qh1+ are checks too, but the queen is simply taken, and every quiet move loses to a8=Q. The ' +
            'defender’s job is to find the next safe check, every move, preferably from a distance where the king ' +
            'cannot approach the queen. Before you start, ask: does the king have anywhere to hide?',
          wrong: {
            Qd5: {
              text: 'The queen guards a8, but it is not a check, so White promotes anyway: a8=Q Qxa8 Qxa8, and White is a queen up.',
              refute: 'a8=Q',
            },
            h4: {
              text: 'Counterplay comes too late: **a8=Q**, and White has two queens. With the pawn one step from promoting, a quiet move is almost always the last one.',
              refute: 'a8=Q',
            },
          },
          failure:
            'Only a check stops a8=Q, and it must be a check the white pieces cannot simply take.',
          reply: 'Kg2',
          replyNote:
            'The only move. The king steps up to g2, and a8=Q is threatened again. Black needs another check.',
          then: {
            prompt: 'Which check keeps it going?',
            moves: ['Qe4+'],
            hint: 'Look for a check from a distance, on a square no white piece covers.',
            success:
              '**Qe4+**: back to e4, checking along the long diagonal. The king has to move again.',
            why:
              'From e4 the queen checks from a distance, where the king cannot attack her; even the block f3 only ' +
              'opens the second rank for ...Qc2+. ' +
              '**Qa1**, attacking the pawn from behind, looks logical but loses to a8=Q, since the queen on b8 ' +
              'defends the new one. The rule of the defence is simple: check, and check again.',
            wrong: {
              Qa1: {
                text: 'Attacking the pawn from behind looks logical, but it is not a check: **a8=Q**, the new queen is defended by the one on b8, and Black is lost.',
                refute: 'a8=Q',
              },
            },
            failure:
              'Keep checking: find a check from a distance that no white piece can take or block.',
            reply: 'Kf1',
            replyNote:
              'The king runs for the queenside, toward its own queen, where it could hide from the checks. It has a long way to go.',
            then: {
              prompt: 'The king is running. What now?',
              moves: ['Qc4+', 'Qh1+', 'Qd3+'],
              hint: 'There is more than one way to keep checking. Any safe check will do.',
              success:
                'Another check, and the king is no closer to shelter. The checks will keep coming until White settles for a draw.',
              why:
                'This is perpetual check. From c4, h1 or d3 the queen checks again, and the king cannot cross the board ' +
                'without walking into more checks, so White never gets the free move for a8=Q. Remember the habit: when ' +
                'your opponent’s pawn is about to queen and you have a queen, look for a perpetual first.',
              failure:
                'Keep checking, and make sure every check is safe: one quiet move gives White the free move a8=Q needs.',
            },
          },
        },
      },
      {
        id: 'summary',
        title: 'Summary',
        text:
          '**Attacker:** push the passed pawn as far as the checks allow, and walk your king toward the pawn and your ' +
          'queen, where the checks run out. Block a check with your queen when the block offers a trade, and look ' +
          'for checks that also guard the queening square.\n\n' +
          '**Defender:** check from a distance, without a pause, and aim for perpetual check. Avoid queen trades: ' +
          'with the enemy pawn still on the board, the pawn ending is usually lost. If the checks do run out, keep ' +
          'your king close to the pawn.\n\n' +
          'A rook pawn or a bishop pawn on the seventh is often a draw even against a lone queen; the lesson on ' +
          'queen against pawn shows why.',
        fen: '1Q6/P4pk1/6p1/7p/4q3/6P1/5P1P/6K1 b - - 0 1',
        orientation: 'black',
      },
    ],
    practiceThemes: ['queenEndgame', 'promotion'],
  },

  {
    id: 'attacking-the-uncastled-king',
    title: 'Attacking the uncastled king',
    level: 'intermediate',
    category: 'Tactics',
    summary:
      'A king stuck in the centre is a target: give a piece to drag it out, open the lines against it, and keep making threats so it never gets home.',
    minutes: 15,
    steps: [
      {
        id: 'fried-liver',
        title: 'Drag the king into the open',
        text:
          'Look at Black’s king: still on e8, with f7 in front of it guarded by the king alone. Your knight on g5 ' +
          'attacks that pawn, but Black’s queen attacks your knight, so a quiet move gives Black time to chase it ' +
          'away. This is the Fried Liver Attack, and it shows the whole idea of this lesson: give up a piece to ' +
          'pull the king out of its shelter, then keep it in the open with threats while Black’s pieces are still ' +
          'at home. It costs a knight, so be sure what you are buying.',
        fen: FRIED_NXF7,
        shapes: ['f7:red', 'd8g5:blue'],
        task: {
          prompt: 'How do you start the attack?',
          moves: ['Nxf7'],
          hint: 'Only the king guards f7, and your knight is attacked too, so it will not stay there long. Make it count.',
          success:
            '**Nxf7**: the knight takes a pawn that only the king guards, and attacks the queen on d8 and the rook on h8 at once.',
          why: 'A quiet move gives Black a free turn to chase the knight with ...f6 or take it with ...Qxg5, and the chance is gone for good. So the knight goes with a purpose: the king must take, and on f7 it is in the open, with its knight on d5 pinned against it by the bishop. When the king alone guards f7 (or f2), ask what a sacrifice there would buy.',
          wrong: {
            d4: '**d4** is a strong move too: it opens the centre and gives White a quick lead in development. But this step is about the idea that drags the king out of its shelter.',
            Nc3: {
              text: 'It attacks the knight on d5, but your own knight on g5 is hanging: **Qxg5**. Bxd5 wins a piece back, but the attack is gone and Black stands a little better.',
              refute: 'Qxg5',
            },
          },
          failure:
            'Your knight on g5 is attacked, and f7 is guarded only by the king. Look for the move that uses the knight before it is lost.',
          reply: 'Kxf7',
          replyNote:
            'Black has to take: every other reply leaves White more than four pawns ahead. Now the king stands on f7, in the open, and its knight on d5 is pinned to it by the bishop.',
          then: {
            prompt: 'How do you keep the king in the open?',
            moves: ['Qf3+'],
            hint: 'Look for a check that also attacks something, so the king has two problems at once.',
            success:
              '**Qf3+**: the queen checks along the f-file and attacks the knight on d5, which the bishop on c4 pins to the king.',
            why: 'A quiet move lets Black bring the king home or cover with ...Be6, and the knight you gave has bought nothing. The check keeps the initiative, and with the knight on d5 attacked twice and pinned, Black must find ...Ke6, which leaves the king even more exposed. After a sacrifice, keep making threats: give the defender no time to regroup.',
            wrong: {
              'Bxd5+': {
                text: 'It checks and takes the knight, but **Qxd5** takes the bishop. The sacrificed piece is not coming back, and with the pin gone White has no attack left.',
                refute: 'Qxd5',
              },
              'Qh5+': {
                text: 'It checks, but **Kg8** takes the king home and out of the pin, and the queen on h5 attacks nothing important. White is a piece down with no attack left.',
                refute: 'Kg8',
              },
              Nc3: {
                text: 'It attacks the pinned knight, but it is not a check: **Be6** blocks the bishop’s diagonal, the pin disappears, and White is a piece down.',
                refute: 'Be6',
              },
            },
            failure:
              'A quiet move gives the king time to hide. Which check also attacks a black piece?',
            reply: 'Ke6',
            replyNote:
              'Black’s best: the king guards the pinned knight itself, so the pin does not cost a piece. It now stands in the open, on the bishop’s diagonal.',
            then: {
              prompt: 'Which piece joins the attack?',
              moves: ['Nc3'],
              hint: 'Count the attackers and defenders of d5. Which of your pieces is still undeveloped?',
              success:
                '**Nc3**: the third attacker on the pinned knight. White threatens **Nxd5**, and Black cannot take back, because the queen would be captured with check.',
              why: 'Every piece you add to the attack is worth more than a trade. Bishop and queen already hit d5, and a third attacker settles it, since no recapture then works. Taking on d5 yourself releases the pin and leaves White a piece down, and castling hands Black a tempo: ...b5 chases the bishop away.',
              wrong: {
                'Bxd5+': {
                  text: 'This releases the pin: **Qxd5**, and with the queens off White is simply a piece down. Trades help the side that is ahead, so keep the pin and add attackers.',
                  refute: 'Qxd5',
                },
                'O-O': {
                  text: 'Castling is natural, but it gives Black a free move: **b5** attacks the bishop, and once it leaves the pin the knight on d5 is safe. White is a piece down with little to show for it.',
                  refute: 'b5',
                },
                d4: {
                  text: '**d4** opens the centre, but the knight takes it with a hit on the queen: **Nxd4**. The attack loses its momentum, and the extra piece is Black’s.',
                  refute: 'Nxd4',
                },
              },
              failure:
                'Count the attackers on the pinned knight against its defenders. Which developing move adds one?',
            },
          },
        },
      },
      {
        id: 'fried-liver-defence',
        title: 'Defend with a threat of your own',
        text:
          'Now take Black’s side. You are a piece up, but your king stands on e6 and the bishop pins your knight ' +
          'on d5 to it. White attacks d5 three times, with bishop, queen and knight, and you defend it only twice, ' +
          'so **Nxd5** is a real threat and nothing could take back. The pinned knight cannot move, so you need a ' +
          'third defender. Choose one that makes a threat of its own: a defender that only defends leaves White ' +
          'free to bring up still more attackers.',
        fen: FRIED_DEFENCE,
        orientation: 'black',
        shapes: ['c4d5:red', 'f3d5:red', 'c3d5:red'],
        task: {
          prompt: 'How do you defend the pinned knight?',
          moves: ['Nb4'],
          hint: 'A knight move can add a defender of d5. Pick the square from which it also attacks something.',
          success:
            '**Nb4**: the knight defends d5 a third time and attacks c2, threatening **Nxc2+**, which would fork White’s king and rook.',
          why: 'The pinned knight cannot move, so it needs help, and the best help comes with a threat. Nb4 defends d5 and eyes **Nxc2+**, so White must deal with that as well as with the pin. Ne7 defends too, but passively: **d4** opens the centre against your king. When you are under attack, prefer the defence that threatens something.',
          wrong: {
            Ne7: 'It defends d5, but passively: **d4** opens the centre against your king, and you have made no threat of your own. White’s attack keeps growing.',
            Nd4: 'It hits the queen, but the knight on d5 is pinned, and **Bxd5+** takes it with check first. Once the king has answered, the queen steps away, and White has the piece back with the better game.',
            Qf6: {
              text: 'A queen trade looks like relief, but the knight is pinned: **Qxd5+** takes it with check, and White wins a piece back with the attack still on.',
              refute: 'Qxd5+',
            },
            Kd7: {
              text: 'Stepping off the pin blocks the queen’s guard of d5: **Qxd5+** wins the knight with check, and Ke7 Qf7+ Kd6 Ne4# is mate.',
              refute: 'Qxd5+',
            },
            Kd6: {
              text: 'The same mistake: the king blocks the queen’s guard of d5, and **Qxd5+** again leads to mate: Ke7 Qf7+ Kd6 Ne4#.',
              refute: 'Qxd5+',
            },
            e4: {
              text: 'It hits the queen, but the knight on d5 is still pinned and now has less support: **Qxe4+** wins the pawn with check, and the knight falls next.',
              refute: 'Qxe4+',
            },
          },
          failure:
            'The knight on d5 is pinned and attacked three times, so it needs a third defender. Which knight move guards it and creates a threat?',
          reply: 'O-O',
          replyNote:
            'White castles, which also removes the fork. Taking on c2 now would run into **Bxd5+**. **Bb3** was just as good a reply.',
          then: {
            prompt: 'The knight on d5 is still pinned. How do you strengthen its defence?',
            moves: ['c6'],
            hint: 'A pawn can guard d5 too, and a pawn is the hardest guard to exchange.',
            success:
              '**c6**: the pawn guards d5, so the knight has four defenders against three attackers and White cannot win it.',
            why: 'A pawn is the best guard of a square: White cannot exchange on d5 without giving up more than it wins, and none of your pieces is tied down. It is also clearly the best move: ...b5 hits the bishop, but **Bb3** keeps the pin and the attack on d5 goes on.',
            wrong: {
              b5: {
                text: 'It attacks the bishop, but **Bb3** keeps the pin, and the pawn on b5 does nothing for d5. White’s attack on the knight goes on.',
                refute: 'Bb3',
              },
            },
            failure:
              'The attackers on d5 outnumber the defenders. Which pawn move adds a guard without leaving a piece loose?',
            reply: 'd4',
            replyNote:
              'White opens the centre, the most testing move: the king on e6 is still exposed, and the pawn on e5 comes under fire. Black has an extra piece but must defend with care.',
          },
        },
      },
      {
        id: 'open-the-position',
        title: 'Open the position',
        text:
          'Different opening, same theme. Black has played pawn moves and traded a bishop, and its king, queen’s ' +
          'knight, bishop and both rooks have not moved. White has far more pieces in play, and that is the ' +
          'moment to open the position, even at a price. Your queen and bishop already aim at f7, the bishop on ' +
          'g5 pins the knight on f6 to the queen, and ...b5 has just attacked your bishop. The only thing ' +
          'shielding the king on the diagonal from b5 to e8 is the pawn on c6.',
        fen: OPEN_KING_START,
        shapes: ['b5:red', 'c4f7:red', 'g5e7:blue'],
        task: {
          prompt: 'How do you open the position?',
          moves: ['Nxb5'],
          hint: 'Three of your pieces attack the pawn on b5. Which capture drags the pawn on c6 off the diagonal to the king?',
          success:
            '**Nxb5**: the knight takes the pawn. If the c-pawn recaptures, the diagonal to the king opens and **Bxb5+** comes with check.',
          why: 'With the king in the centre and more pieces in play, open lines even at a price: the knight is worth less than the attack. **Bxb5** wins the pawn too, but after ...cxb5 you have swapped your best attacker for it, and the winning advantage shrinks to a small edge. Pay with the piece you can spare.',
          wrong: {
            Bxb5: {
              text: 'It wins a pawn, but **cxb5** takes your best attacker for it. **Nd5** keeps a small edge, but the winning attack has gone.',
              refute: 'cxb5',
            },
            Qxb5: {
              text: 'The queen cannot take: **cxb5** wins it for a pawn, and Bxb5+ only gets a second pawn back. Capture first with the piece you can afford to lose.',
              refute: 'cxb5',
            },
            Bxf6: {
              text: 'It trades off the bishop that pins the knight, and **Qxf6** recaptures. White keeps an edge after Nxb5, but nothing like the attack the knight sacrifice gives.',
              refute: 'Qxf6',
            },
          },
          failure:
            'Black’s king and most of its pieces are still at home. A quiet move lets them catch up; look for a capture that opens lines against the king.',
          reply: 'cxb5',
          replyNote:
            'Black takes the knight, the natural reply. The tougher ...Qb4+ Qxb4 Bxb4+ c3 still leaves White well ahead.',
          then: {
            prompt: 'How do you take the pawn back?',
            moves: ['Bxb5+'],
            hint: 'Both the bishop and the queen can recapture with check. Which one keeps the other attacking f7?',
            success:
              '**Bxb5+**: the bishop recaptures with check along the diagonal to e8, and the queen stays on b3, still aiming at f7.',
            why: 'The bishop leaves the queen on b3, still aiming at f7, and the check makes Black block with a piece that is then pinned. After **Qxb5+** Black offers a queen trade with ...Qd7 and the attack evaporates. Recapture with the piece that keeps the most pressure, not the most valuable one.',
            wrong: {
              'Qxb5+': {
                text: 'It checks too, but **Qd7** offers a queen trade, and the pin and the attack on f7 are gone. White’s edge shrinks to almost nothing.',
                refute: 'Qd7',
              },
            },
            failure:
              'Black’s king has no cover on that diagonal. Which recapture gives check and leaves your queen on b3?',
            reply: 'Nbd7',
            replyNote:
              'Black blocks with the knight, which is now pinned to its king. ...Kd8 is a little tougher, but **O-O-O+** still wins: the rook arrives on the d-file with check.',
            then: {
              prompt: 'The knight on d7 is pinned. What is your best developing move?',
              moves: ['O-O-O'],
              hint: 'The d-file is open, and your own king is still in the centre. One move deals with both.',
              success:
                '**O-O-O**: the rook lands on d1 and attacks the pinned knight on d7, and the king leaves the centre in the same move.',
              why: 'Develop with tempo: castling long puts a rook on the open file with a threat, and your own king leaves the centre. **Rd1** attacks d7 too, but it leaves the king on e1, and ...Qb4+ trades queens and relieves the pressure. Add attackers to a pinned piece, and keep your own king out of the line of fire.',
              wrong: {
                Rd1: {
                  text: 'It attacks d7 too, but your king stays on e1: **Qb4+** trades queens and takes the sting out of the attack. White is still ahead, but far less than after O-O-O.',
                  refute: 'Qb4+',
                },
                'Bxd7+': {
                  text: '**Bxd7+** gives up the bishop that holds the pin, and **Qxd7** recaptures. The pins are gone, Black’s king is safe again, and it is Black who is better.',
                  refute: 'Qxd7',
                },
                f4: {
                  text: '**f4** attacks e5, but it loosens your own king: **Qb4+** offers a queen trade, and Black is the one who is better.',
                  refute: 'Qb4+',
                },
              },
              failure:
                'The knight on d7 is pinned and cannot run, so bring up more force. Which move develops a rook with a threat and tidies your king?',
              reply: 'Rd8',
              replyNote:
                'Black adds the rook as a defender of d7. The knight on f6 guards it too, but it is pinned to the queen, so it hardly counts.',
            },
          },
        },
      },
      {
        id: 'add-attackers',
        title: 'Add attackers to the pins',
        text:
          'Look at how tied up Black is. The bishop on b5 pins the knight on d7 to the king, and the bishop on g5 ' +
          'pins the knight on f6 to the queen, so that knight cannot recapture without losing the queen. You have given a ' +
          'knight for two pawns, but a pinned piece cannot run, so every new attacker adds real pressure. The rule ' +
          'for the next few moves: add attackers, and do not cash in early with a capture that releases a pin.',
        fen: OPEN_KING_ROOK,
        shapes: ['b5e8:red', 'g5e7:red'],
        task: {
          prompt: 'The knight on d7 has plenty of defenders. How do you break in?',
          moves: ['Rxd7'],
          hint: 'Count the defenders of d7 and ask which of them cannot really recapture.',
          success:
            '**Rxd7**: the rook takes the pinned knight. The knight on f6 cannot take back without losing the queen to **Bxe7**, so the natural recapture is with the rook.',
          why: 'Black has more defenders than you have attackers, but the knight on f6 is pinned, so it hardly counts. Rxd7 gives up the exchange to drag a rook onto d7, where it is pinned in turn. The tempting **Bxd7+** gives up the bishop that does the pinning.',
          wrong: {
            'Bxd7+': {
              text: '**Bxd7+** gives up the bishop that holds the pin, and **Rxd7** recaptures. White keeps a small edge, but the pins that did the work are gone and so is the winning attack.',
              refute: 'Rxd7',
            },
            Qc3: {
              text: '**Qc3** still leaves White clearly ahead, but it gives Black time to relieve the pins with **Qc5**, and the attack loses its force.',
              refute: 'Qc5',
            },
            f4: {
              text: '**f4** attacks e5 but loosens your king: **a6** hits the bishop and Black starts to untangle. White is still better, but Rxd7 wins much more.',
              refute: 'a6',
            },
          },
          failure:
            'Count the attackers and defenders of d7, and remember that the knight on f6 is pinned. Which capture changes the count?',
          reply: 'Rxd7',
          replyNote:
            'Black takes with the rook, the natural move. It is now pinned by the bishop on b5. Taking with the knight instead drops the queen for a bishop.',
          then: {
            prompt: 'How do you add to the pressure on the pinned rook?',
            moves: ['Rd1'],
            hint: 'The rook on d7 cannot move. Which of your pieces can attack it again?',
            success:
              '**Rd1**: the second rook attacks the pinned rook on d7, which cannot leave because of the bishop on b5.',
            why: 'A pinned piece cannot run, so you can keep adding attackers: d7 is now attacked twice, and Black has no good answer. Cashing in with **Bxd7+** at once lets the queen recapture, and the pin is gone. Add before you capture.',
            wrong: {
              'Bxd7+': {
                text: '**Bxd7+** takes the rook, but **Qxd7** recaptures and the pin is gone. White has no attacker left on d7 and the attack has lost its force.',
                refute: 'Qxd7',
              },
            },
            failure:
              'The rook on d7 cannot move, but it is defended. Which of your pieces can attack it again without releasing the bishop’s pin?',
            reply: 'Qe6',
            replyNote:
              'Black’s queen defends d7 and offers a trade. Nothing saves Black here, but this loses fastest.',
            then: {
              prompt: 'Black offers a queen trade. What do you play?',
              moves: ['Bxd7+'],
              hint: 'You do not have to take the queen. What can your bishop capture with check?',
              success:
                '**Bxd7+**: the bishop takes the pinned rook with check, and Black has to recapture on d7.',
              why: 'Whichever way Black recaptures, a defender has to leave its post: the knight leaves f6 and the king’s cover is gone. Taking on e6 first would trade off the queen that you need for the finish. Keep the pieces that carry the attack, and let the opponent come to you.',
              wrong: {
                'Qxe6+':
                  'That is still good for White, but it trades off your own queen, the piece that gives the finish. After **fxe6** the attack is over and you have a long game ahead.',
              },
              failure:
                'You do not have to take the queen. Which capture keeps your own queen on the board and comes with check?',
            },
          },
        },
      },
      {
        id: 'queen-sacrifice',
        title: 'Give the queen to mate',
        text:
          'Black has recaptured with the knight, and on paper you are a knight down for two pawns. Your queen is ' +
          'even attacked by Black’s queen on e6. But look at Black’s king: the bishop on g5 covers d8 and e7, ' +
          'and its own pieces fill every other square. The knight on d7 is the only guard of the back rank. ' +
          'Drag it away, and a check on the eighth rank is mate, with your rook already on the d-file. Your ' +
          'queen can reach the back rank, but only by giving itself up.',
        fen: OPEN_KING_FINISH,
        shapes: ['g5d8:blue', 'd1d7:red'],
        task: {
          prompt: 'How do you finish?',
          moves: ['Qb8+'],
          hint: 'Look at the eighth rank. Which black piece guards it, and what happens if that piece is forced to take?',
          success:
            '**Qb8+**: the queen checks on the back rank, and the only legal reply is to take it with the knight.',
          why: 'Black’s king has no flight squares, so a back-rank check is mate unless a piece can capture or block. Only the knight can, and the moment it takes, d7 is empty and the rook has a clear path. Look for sacrifices that remove the one piece holding the position together.',
          wrong: {
            Rxd7: {
              text: 'It takes the knight back, but **Kxd7** and the king runs: after Qb7+ Kd6 the checks run out and the game is level, with a forced mate thrown away.',
              refute: 'Kxd7',
            },
            Qb7: {
              text: 'It threatens Qb8+ again, but **f6** hits the bishop and gives the king the f7 square. White is still well ahead, but the forced mate has gone.',
              refute: 'f6',
            },
            g4: {
              text: '**g4** ignores the black queen: **Qxb3** takes yours off the board, and the attack is over with White a piece down.',
              refute: 'Qxb3',
            },
          },
          failure:
            'Black’s king has no flight squares, so a check on the back rank decides. Which of your pieces can give itself up to drag the guard away?',
          reply: 'Nxb8',
          replyNote:
            'The only legal reply: no other piece can capture or block, and the king has no square.',
          then: {
            prompt: 'The d-file is open. How do you end the game?',
            moves: ['Rd8#'],
            hint: 'The rook can reach the eighth rank with check. Look at what covers the squares around the king.',
            success:
              '**Rd8#**: the rook gives mate on the back rank. The bishop on g5 guards d8 and e7, so the king can neither take the rook nor step aside.',
            why: 'The bishop that pinned the knight at the start now covers d8 and e7. Every piece took part: the knight and bishop opened the lines, the pins tied Black down, the rooks arrived with tempo, and the queen gave itself up to clear the way. That is what an attack on a king in the centre looks like when it works.',
            failure:
              'The d-file is open and the eighth rank has no defenders. Which rook move ends the game at once?',
          },
        },
      },
      {
        id: 'checklist',
        title: 'The attacker’s checklist',
        text:
          'Both attacks ran on the same checklist, which I use whenever a king is still in the centre.\n\n' +
          '- **Is f7 (or f2) guarded only by the king?** A sacrifice there may drag it out.\n' +
          '- **Can you open a line while the king is on it?** **Nxb5** opened a diagonal; the e-file and d-file are the usual routes.\n' +
          '- **Can you stop it castling?** A check or a pin does it, and so does a bishop on the a2–g8 diagonal.\n' +
          '- **Do you have more pieces in play?** If not, develop with tempo first: an attack without attackers just loses a piece.\n\n' +
          'From the other side, castle early; when you cannot, trade the attackers and answer a threat with a threat, as **Nb4** did.',
        fen: OPEN_KING_START,
        shapes: ['e8:red', 'c4f7:red'],
      },
    ],
    practiceThemes: ['exposedKing', 'attackingF2F7'],
  },

  {
    id: 'visualisation',
    title: 'Visualisation',
    level: 'intermediate',
    category: 'Thinking',
    summary:
      'Seeing the position at the end of a line before you play its first move: the skill behind every calculation, and how to hold a line in your head.',
    minutes: 12,
    practiceDrills: [{ title: 'Blind puzzles', to: '/puzzles/blind' }],
    steps: [
      {
        id: 'see-the-end',
        title: 'See the end before you start',
        text:
          'Calculation is only as good as the picture at the end of the line. So play it in your head one move ' +
          'at a time, and after each move update the picture: which square emptied, which piece landed where, ' +
          'what it now attacks. Only then judge the result with three questions: *what is attacked, what is ' +
          'hanging, whose king is safer?* Here White has just played Nc3, and the pawn on e4 looks safely ' +
          'defended, so most players move on. Don’t. A capture that seems to lose a piece deserves a look to ' +
          'the end of the line, and the end is two moves further than it seems.',
        fen: FORK_TRICK,
        orientation: 'black',
        shapes: ['c3e4:red'],
        task: {
          prompt: 'Which capture works, even though e4 looks safe?',
          moves: ['Nxe4'],
          hint: 'After the capture and the recapture, look at your d-pawn: which square lets it attack two pieces at once?',
          success:
            '**Nxe4**: the knight takes the pawn. If White recaptures, **d5** forks the bishop on c4 and the knight on e4, and Black gets a piece back.',
          why: 'It looks like a knight for a pawn, so many players reject it at once. Played out in your head it is Nxe4 Nxe4 d5, and White cannot save both attacked pieces: after Bd3 dxe4 Bxe4 the material is level and Black has an easy game. When a sacrifice looks bad, do not stop at the second move. Play it to the end.',
          wrong: {
            Bc5: '**Bc5** is a good move too: it develops with a hit on f2 and keeps the balance. But it asks nothing of your vision, and this step is about the capture that only works if you can see where the line ends.',
            Be7: '**Be7** is sound as well, a quiet developing move. The point here is the capture that needs a picture of the position three moves ahead.',
            Nh5: {
              text: 'The knight goes to the edge, and **d4** strikes at e5 at once: White is clearly better.',
              refute: 'd4',
            },
          },
          failure:
            'Several quiet moves are fine here, but one capture works because of what follows it. Play the line out in your head: what do you get after the recapture?',
          reply: 'Nxe4',
          replyNote:
            'White recaptures and is a knight up for a pawn, for the moment. Now picture the position you reasoned about: the bishop on c4 and the knight on e4 stand on squares a pawn can attack.',
          then: {
            prompt: 'You are a knight down. Which pawn move wins a piece back?',
            moves: ['d5'],
            hint: 'A pawn attacks the squares diagonally ahead of it. Which push hits both the bishop and the knight?',
            success:
              '**d5**: the pawn attacks the knight on e4 and the bishop on c4 at once, and White can save only one.',
            why: 'The fork works because both targets stand on squares the d-pawn attacks, and picturing that is the whole idea: the capture before it was only the means. ...Na5 attacks the bishop too, but a single attacker is easy to meet: **Be2** retreats it and the knight on e4 stays. You need two targets at once.',
            wrong: {
              Na5: {
                text: 'It attacks the bishop, but the bishop simply retreats with **Be2**, and the knight on e4 is still there. Black stays a piece down.',
                refute: 'Be2',
              },
            },
            failure:
              'You have given up a knight, so the next move has to win something back. Which pawn move attacks two pieces at once?',
            reply: 'Bd3',
            replyNote:
              'White saves the bishop, and ...dxe4 Bxe4 follows: the material is level and the position is open. You found the piece back before you played the first move.',
          },
        },
      },
      {
        id: 'checks-first',
        title: 'Start with the forcing moves',
        text:
          'A line is far easier to hold in your head when the replies are nearly forced, so start with the ' +
          'forcing moves: checks first, then captures, then threats. Here Black’s queen attacks your knight on ' +
          'g5, and a quiet retreat leaves you worse. But your queen has a check on the diagonal to g8. Each ' +
          'forcing move cuts down Black’s choices, so a short forced line is one you can hold to the very end. ' +
          'Picture where the king can go after the check, and what your knight does from f7.',
        fen: '2bq1rk1/ppp3pp/8/6N1/8/8/PQ3PPP/R5K1 w - - 0 1',
        shapes: ['g5f7:blue', 'b2g7:red'],
        task: {
          prompt: 'How do you win material by force?',
          moves: ['Qb3+'],
          hint: 'A check on the diagonal to g8 comes first. Picture where Black’s king can go, then ask what your knight attacks from f7.',
          success:
            '**Qb3+**: the queen checks along the diagonal to g8, and every reply loses something. After ...Kh8 the knight forks king and queen on f7.',
          why: 'A knight move at once loses the piece, because nothing forces the king to stay. With the check first, Black has four replies and each one is bad: ...Be6 loses the bishop, ...Rf7 and ...Qd5 lose to Qxf7+ and Qxd5+, and ...Kh8 allows the fork. A forcing move turns a hope into a calculation.',
          wrong: {
            Nf7: {
              text: 'Without the check nothing forces the king anywhere: **Rxf7**, and White has simply lost the knight. The fork only works because the check drags the king to h8 first.',
              refute: 'Rxf7',
            },
            Nf3: {
              text: 'Saving the knight is natural, but it hands Black the initiative: **Qf6** hits your queen on the long diagonal, and Black is a clean pawn up with the easier game. The forcing move comes before the retreat.',
              refute: 'Qf6',
            },
          },
          failure: 'Check first, fork second. Which checking move takes away Black’s choices?',
          reply: 'Kh8',
          replyNote:
            'The king goes to h8. ...Be6 loses a piece to Qxe6+, and ...Rf7 or ...Qd5 lose at once. Now picture the knight on f7.',
          then: {
            prompt: 'Which knight move forks king and queen?',
            moves: ['Nf7+'],
            hint: 'Look at the squares your knight attacks from f7.',
            success:
              '**Nf7+**: the knight checks the king on h8 and attacks the queen on d8 at the same time.',
            why: 'Black cannot ignore the check. Running with ...Kg8 meets Nh6+ and a smothered mate, so the rook has to take the knight. You can see all this at once only because the first check narrowed the choices to one.',
            failure:
              'The king is boxed in on h8 by its own pawns. Which knight move attacks it and something else?',
            reply: 'Rxf7',
            replyNote:
              'The rook has to take the knight, or the queen is lost. It lands on a square the white queen attacks.',
            then: {
              prompt: 'Black took the knight. Is the recapture safe?',
              moves: ['Qxf7'],
              hint: 'Before you recapture, check whether any black piece can take your queen on the new square.',
              success:
                '**Qxf7**: the queen takes the rook, and nothing can take it back. White has won the exchange, a rook for a knight.',
              why: 'The whole line was forced from the first check, which is why you could see it to the end. At the end of any line, check that your last piece is safe: the queen on f7 is covered by nothing, but no black piece attacks it either. Check, fork, recapture.',
              failure: 'The rook on f7 is unprotected. Which of your pieces can take it safely?',
            },
          },
        },
      },
      {
        id: 'count-the-race',
        title: 'Count the race',
        text:
          'Not every line is made of captures. Here two pawns race, and the question is simply who queens first, ' +
          'so count it move by move rather than by eye. Your pawn needs three moves to promote: b6, b7, b8. ' +
          'Black’s needs three as well: g3, g2, g1. You are to move, so you arrive first. But the count is only ' +
          'half the job: picture what the new queen does when it arrives. A queen that comes with check wins a ' +
          'tempo, and tempi decide races like this one.',
        fen: '8/8/8/1P6/6p1/8/7k/1K6 w - - 0 1',
        shapes: ['b8:blue', 'g1:red'],
        task: {
          prompt: 'Which move wins the race?',
          moves: ['b6'],
          hint: 'Count the moves each pawn needs, then trace the diagonal from b8. Where does it end?',
          success:
            '**b6**: the pawn runs and promotes first, and the new queen on b8 will check along the long diagonal to h2.',
          why: 'A king move gives Black the tempo it needs: Kc2 g3 b6 g2 b7 g1=Q b8=Q+ and both sides have a queen, a draw at best. Running wins because b8=Q+ arrives with check before the g-pawn promotes. In races, count the moves for both sides and look at what the new queen attacks when it arrives.',
          wrong: {
            Kc2: {
              text: 'Bringing the king looks useful, but it costs a tempo. Black runs with **g3**, and both pawns queen: Kc2 g3 b6 g2 b7 g1=Q b8=Q+ is only a draw.',
              refute: 'g3',
            },
          },
          failure:
            'Count the moves each pawn needs and who is first. A king move loses a tempo; which move keeps it?',
          reply: 'g3',
          replyNote:
            'Black runs as well. Both pawns now need two more moves, and it is White’s turn.',
          then: {
            prompt: 'Keep running. What is the next move?',
            moves: ['b7'],
            hint: 'Each pawn needs two more moves, and you are first.',
            success: '**b7**: one step from promotion, and the g-pawn is still two steps away.',
            why: 'Nothing has changed in the count: you queen next move, Black needs two more. Do not stop to look for something cleverer: when the count says you are first, run.',
            wrong: {
              Kc2: {
                text: 'A king move now gives Black a tempo: **g2**, and after b7 g1=Q b8=Q+ both sides have a queen. The race is level again, and only a draw.',
                refute: 'g2',
              },
            },
            failure:
              'Count again: your pawn needs two moves, Black’s needs two as well, and you are to move. What keeps the lead?',
            reply: 'g2',
            replyNote: 'Black’s pawn is one step from promoting, but White moves first.',
            then: {
              prompt: 'Your pawn reaches the eighth rank. What do you promote to?',
              moves: ['b8=Q+'],
              hint: 'Two promotions give check. Which one still wins after the king moves?',
              success:
                '**b8=Q+**: the new queen checks along the diagonal to h2. The king has to move, and the pawn on g2 never promotes.',
              why: 'The check is the point: Black must answer it instead of queening, and the queen then stops the pawn. A bishop also checks but cannot stop the pawn, and a rook gives no check, so Black queens with check itself. This is why you traced the diagonal from b8 at the start.',
              wrong: {
                'b8=R': {
                  text: 'A rook gives no check and so no tempo: Black queens with **g1=Q+**, check, and the rook cannot compete with a queen.',
                  refute: 'g1=Q+',
                },
              },
              failure:
                'The new piece decides the race only if it comes with check and can stop the pawn. Which promotion does both?',
            },
          },
        },
      },
      {
        id: 'picture-the-ending',
        title: 'Picture the ending',
        text:
          'Sometimes the best way to calculate is to simplify into a position you can see completely. The rooks ' +
          'face each other on the d-file, and you can trade them. Before you do, picture the board that results: ' +
          'kings and pawns only, with no tricks hiding anywhere. You have an outside passed pawn on the a-file, ' +
          'and the black king cannot be in two places at once. If you can count that ending, you can judge the ' +
          'trade, and if you refuse to picture it you will either dodge a winning trade or walk into a losing one.',
        fen: '3r4/4kppp/8/8/P7/5KP1/5P1P/3R4 w - - 0 1',
        shapes: ['d1d8:red', 'a4a8:blue'],
        task: {
          prompt: 'Should the rooks come off?',
          moves: ['Rxd8'],
          hint: 'After the trade, count the pawns and look at the a-pawn. Which king has to run where?',
          success:
            '**Rxd8**: the rooks come off, and the pawn ending is winning. You have an outside passed pawn, and the black king cannot stop it and guard the kingside too.',
          why: 'Picture the ending: after Rxd8 Kxd8, if the black king goes after the a-pawn, your king walks in and eats the kingside pawns; if it stays home, the a-pawn runs. It cannot do both. With rooks on, an extra pawn is worth much less, so trade when the ending, which you can see, is won.',
          wrong: {
            a5: {
              text: 'Pushing the passed pawn is tempting, but your rook is attacked and unprotected: **Rxd1**, and White has simply lost a rook.',
              refute: 'Rxd1',
            },
          },
          failure:
            'Your rook on d1 is attacked and nothing protects it. Think about which trade leaves an ending you can count.',
          reply: 'Kxd8',
          replyNote:
            'Black recaptures, and it is a pure pawn ending with you to move. Picture the king walking in: Ke4 Kd7 Kd5 Kc7 a5, and the black king is too far from the kingside.',
        },
      },
      {
        id: 'training',
        title: 'Training your visualisation',
        text:
          'Visualisation is a muscle, and the exercises are plain.\n\n' +
          '- **Decide the whole line before you touch a piece.** In puzzles, say the moves to yourself first, then check.\n' +
          '- **Blind puzzles** (Puzzles, Blind mode): the board stays on the starting position while you play the line in notation.\n' +
          '- **Guess the position** (Drills, Vision): an opening appears as text on an empty board, and you place the pieces from memory.\n' +
          '- **Find every check** and **Find every capture** (same drill): the forcing-moves habit from step two.\n' +
          '- After each of your own games, calculate one critical position again without moving the pieces.\n\n' +
          'Accuracy first: three moves seen correctly are worth more than seven seen vaguely.',
        fen: FORK_TRICK,
        orientation: 'black',
      },
    ],
    practiceThemes: ['long', 'advantage'],
  },
];
