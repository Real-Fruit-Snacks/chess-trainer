import { fenAfter, type Lesson } from '../model';

// Pawn endgames II.
const BREAK = '1k6/5ppp/8/5PPP/8/8/8/K7 w - - 0 1';
const OUTFLANK = '8/2k5/3p4/2pP4/2P5/3K4/8/8 w - - 0 1';
const TEMPO = '8/8/3k4/1p4p1/1P1K4/6P1/8/8 w - - 0 1';

// Rook endgames III.
const CUT_ONE = '1r6/8/5k2/3P4/3K4/8/8/R7 w - - 0 1';
const CUT_TWO = '1r6/8/6k1/8/3P4/3K4/8/R7 w - - 0 1';
const LONG_SIDE = '5k2/R7/3KP3/8/8/8/8/1r6 b - - 0 1';
const FROM_BEHIND = '5k2/R7/3KP3/8/8/8/8/7r b - - 0 1';
const VANCURA = 'R7/6k1/P7/8/3K4/8/8/5r2 b - - 0 1';

// How to study openings.
const ITALIAN_D5 = fenAfter(
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2',
);
const SHILLING = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4');
const ELEPHANT = '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5 6. Nxd5';
const ELEPHANT_1 = fenAfter(ELEPHANT);

export const intermediateLessons4: Lesson[] = [
  {
    id: 'pawn-endgames-2',
    title: 'Pawn endgames II: breakthrough, outflanking, the spare tempo',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'When the opposition is not enough: break through with a sacrifice, walk round the enemy king, and keep a spare pawn move in hand.',
    minutes: 12,
    steps: [
      {
        id: 'breakthrough',
        title: 'The breakthrough',
        text:
          'Three white pawns face three black ones, and none of them can walk past another. Both kings are far ' +
          'away, yours on a1 and Black’s on b8, so the pawns have to settle this alone.\n\n' +
          'The way through is a **breakthrough**: you give a pawn away, Black’s capture drags one of its pawns ' +
          'off its file, and a pawn behind it is suddenly free to run. Think of it as buying a passed pawn. The ' +
          'price is worth paying only if nobody can catch the runner, and Black’s king is on the far side of the ' +
          'board. So I count first, then sacrifice.',
        fen: BREAK,
        shapes: ['b8:red', 'g6:blue'],
        task: {
          prompt: 'Which push starts the breakthrough?',
          moves: ['g6'],
          hint: 'One push attacks two black pawns at once. Which pawn is it, and what does it hit?',
          success:
            '**g6**: the pawn attacks f7 and h7 together. Whichever pawn takes it, a black pawn leaves its file; if Black ignores it, **gxh7** or **gxf7** and the pawn queens.',
          why:
            'A breakthrough is a sacrifice with a count behind it. **f6** or **h6** attack only g7, so Black takes and ' +
            'you retake: your pawns get tangled up, and the black king walks over to collect them. After **g6** ' +
            'both captures pull a pawn off its file. Before you sacrifice, ask which pawn will end up passed, and ' +
            'whether the king can catch it.',
          wrong: {
            f6: {
              text: 'It attacks only g7, so Black simply takes: **gxf6**. Retaking leaves your f-pawn blocked by f7, and the black king walks over to win it. You gave a pawn and broke nothing through.',
              refute: 'gxf6',
            },
            h6: {
              text: 'It attacks only g7 as well: **gxh6**, and retaking leaves your h-pawn blocked by h7 and lost to the black king. The push that attacks two pawns is the one that breaks through.',
              refute: 'gxh6',
            },
            Kb2: '**Kb2** brings the king closer, but it costs a tempo and lets Black’s king come over too. With the kings this far apart, the pawns have to do the work.',
          },
          failure:
            'The kings are too far away to matter, so the pawns must do the work. Look for a push that forces Black to capture, so that a black pawn is pulled off its file.',
          reply: 'hxg6',
          replyNote:
            'Black takes with the h-pawn, and the pawn on g6 now attacks both f5 and h5. Taking it back would only trade pawns. (**fxg6** would be met by **h6**, the same idea on the other wing.)',
          then: {
            prompt: 'The g6 pawn attacks f5 and h5. Which pawn do you give next?',
            moves: ['f6'],
            hint: 'Do not take back. Your h-pawn needs h6 free, and one black pawn guards that square. Which push attacks it?',
            success:
              '**f6**: the pawn attacks g7. Take it, and nothing stands in front of your h-pawn; ignore it with ...gxh5, and **fxg7** queens next move.',
            why:
              'A breakthrough removes the guards one at a time. Your h-pawn needs h6, and only the g7 pawn guards it, so ' +
              '**f6** drags that pawn away. Retaking on g6 merely trades pawns: your last pawn ends up blocked by g7, ' +
              'and the black king walks over and wins it.',
            wrong: {
              hxg6: {
                text: 'That only trades pawns: **fxg6 fxg6**, and your last pawn is blocked by g7 while the black king walks over to win it. It loses.',
                refute: 'fxg6',
              },
              fxg6: {
                text: 'That trades the other way: **fxg6 hxg6**, and the pawn on g6 is blocked by g7 and falls to the black king. It loses as well.',
                refute: 'fxg6',
              },
            },
            failure:
              'Another sacrifice is needed, one that drags a black pawn off its file. The h-pawn needs h6 free, and one black pawn guards that square.',
            reply: 'gxf6',
            replyNote:
              'Black takes, and the g-pawn has left its file. Nothing guards h6 any more, and Black’s king is still far away on b8.',
            then: {
              prompt: 'Only the h-pawn is left, and the g6 pawn attacks it. What now?',
              moves: ['h6'],
              hint: 'A black pawn captures diagonally forward. Which squares does the pawn on g6 attack?',
              success:
                '**h6**: the pawn steps past the g6 pawn, which attacks only f5 and h5, and has a clear road to h8.',
              why:
                'Now count: the pawn needs three moves to queen, and the black king needs five to get anywhere near. ' +
                'The sacrifices only work because of that count; with the king nearby you would simply have lost two ' +
                'pawns. The pattern is sacrifice, count, run. **hxg6** instead throws the last pawn away.',
              wrong: {
                hxg6: {
                  text: 'Taking on g6 throws your last pawn away: **fxg6**, and Black has two pawns against none. The h-pawn could simply have run.',
                  refute: 'fxg6',
                },
              },
              failure:
                'A black pawn captures diagonally forward. Keep your h-pawn out of its range and keep it running.',
            },
          },
        },
      },
      {
        id: 'outflanking',
        title: 'Outflanking',
        text:
          'Now the pawns are locked and only the kings can move, and each king has a target. Yours wants the pawn ' +
          'on d6, which it attacks from e6. Black’s king wants your pawn on c4, and gets there by b6, a5 and b4. ' +
          'One tempo decides who is first, so count in king moves.\n\n' +
          'Remember that a king covers a diagonal as fast as a straight line: d3 to f5 is two moves, by e4, but ' +
          'three by way of e3 and f4. The opposition will not help here. What wins is getting round the other king.',
        fen: OUTFLANK,
        shapes: ['d6:red', 'c4:blue', 'e6:blue'],
        task: {
          prompt: 'Which king move starts the walk to e6?',
          moves: ['Ke4'],
          hint: 'Count the moves your king needs to reach f5 by each road. A diagonal step counts as one.',
          success:
            '**Ke4**: the shortest road to f5 and e6, using the diagonal. Even if Black races with ...Kb6, your king still reaches d6 first.',
          why:
            'Pawn endings are won by a single tempo, so count king moves and use the diagonals: they cost no more than ' +
            'straight steps. **Ke3** looks natural but is one move short: after **Kb6** Black’s king gets to c4 in ' +
            'time, and the game is drawn. From e4 your king takes d6 first, and your pawn queens first.',
          wrong: {
            Ke3: {
              text: '**Ke3** is one move short. After **Kb6** Black’s king is in time: Ke4 Ka5 Kf5 Kb4 Ke6 Kxc4 Kxd6 Kb5. Each side has won a pawn, and it is a draw.',
              refute: 'Kb6',
            },
          },
          failure:
            'Count the king moves from each square to e6. Only one first step puts you a tempo ahead of Black’s king.',
          reply: 'Kd7',
          replyNote:
            'Black keeps its king beside the d6 pawn instead of racing. Racing with ...Kb6 loses just the same: your king still reaches d6 first.',
          then: {
            prompt: 'Black’s king guards d6. Which move takes yours past it, not up to it?',
            moves: ['Kf5'],
            hint: 'Do not walk up to the black king. Find the square that gets round it.',
            success:
              '**Kf5**: the king goes past the black king, heading for g6 and f7. Black’s king must stay beside d6, so it cannot follow.',
            why:
              'Walking up to the black king only wins you the opposition, and Black can hold that. Going round works ' +
              'because the black king is tied to d6: if it leaves, the pawn falls. This is **outflanking**: getting ' +
              'past the defender on a side it cannot cover. When the opposition gets you nowhere, look for the road round.',
            wrong: {
              Kf4: 'That wins as well, only more slowly: the king still needs another step to get past. **Kf5** goes round at once.',
            },
            failure:
              'Moving back gives Black time to settle. Keep going forward, and find the square that takes your king past the black king.',
            reply: 'Ke7',
            replyNote:
              'Black’s king can only shuffle, because it must keep guarding d6. Yours can carry on round the board.',
            then: {
              prompt: 'Black’s king still guards d6. Where does yours go next?',
              moves: ['Kg6'],
              hint: 'Keep going round the black king, one step toward the seventh rank.',
              success:
                '**Kg6**: the king keeps going round, and next stands on f7 behind the black king. Black can only wait.',
              why:
                'Black’s king is tied to d6, and yours is arriving on the squares it cannot cover. After **Kf7** and ' +
                '**Ke6** Black has to move its king away from the pawn, and d6 falls. Going back with **Ke4** would ' +
                'let Black’s king settle, and the win is gone.',
              wrong: {
                Kg5: 'That wins as well, only more slowly. **Kg6** is already on the way round, one step nearer to f7.',
              },
              failure:
                'Moving back lets Black settle, and the win is gone. Keep going round the black king, toward the seventh rank.',
              reply: 'Kd7',
              replyNote:
                'Black shuffles beside the pawn. Yours goes to f7 and e6 next, and then Black has to move its king away from d6.',
            },
          },
        },
      },
      {
        id: 'spare-tempo',
        title: 'The spare tempo',
        text:
          'The kings face each other with one square between them, and it is White to move. Normally that side must ' +
          'give way, because a king step lets the other king walk in.\n\n' +
          'But look at the pawns. The b-pawns are locked and cannot move. Your g-pawn still has a move, **g4**, and ' +
          'once it is played Black’s g-pawn is blocked too. A pawn move that Black cannot answer with a pawn move ' +
          'hands the turn to Black’s king. That is a **spare tempo**, and I always count them before anything else.',
        fen: TEMPO,
        shapes: ['b4:red', 'b5:red', 'g3g4:blue'],
        task: {
          prompt: 'How do you hand the move to Black?',
          moves: ['g4'],
          hint: 'A king move gives up the opposition. Which pawn still has a move?',
          success:
            '**g4**: the kings keep their opposition, and now Black must move. Every black pawn is blocked, so its king has to give way.',
          why:
            'Count the spare pawn moves before you count the opposition. After **g4** Black has none, so its king must ' +
            'step aside and yours walks in. After a king move such as **Ke3**, Black takes the opposition with ' +
            '...Kd5, and it is Black’s king that walks in.',
          wrong: {
            Ke3: {
              text: '**Ke3** gives the opposition away. After **Kd5** Black’s king is the one that walks in, and it wins your pawns. Leave the kings where they are and pass the move.',
              refute: 'Kd5',
            },
            Ke4: '**Ke4** wins as well, but it hands Black the move that matters: after ...g4 you must find **Kd4**. **g4** passes the turn directly.',
          },
          failure:
            'A king move lets Black take the opposition. Look for a move that leaves both kings where they are and passes the turn.',
          reply: 'Kc6',
          replyNote:
            'Black has no pawn move, so the king has to give way, and every square lets yours in. This one runs toward the queenside, away from the g-pawns.',
          then: {
            prompt: 'Where does your king go?',
            moves: ['Ke5'],
            hint: 'The g5 pawn is the target, and Black’s king is far away. Which central square gets you close to it?',
            success:
              '**Ke5**: the king enters on the kingside, two moves from the g5 pawn, which the black king cannot defend.',
            why:
              'Now it is a count. Your king needs two more moves to take g5, and Black’s king is too far away to ' +
              'defend it. Your b-pawn is safe meanwhile, because it guards a5 and c5. The spare tempo won the fight ' +
              'for the key squares; the rest is counting.',
            wrong: {
              Ke4: 'That wins as well: f5 and the g5 pawn are two moves away from there too. **Ke5** is the more natural square, already level with the target.',
            },
            failure:
              'The g5 pawn is the target, and Black’s king is too far away to defend it. Put your king where it attacks the pawn soon.',
            reply: 'Kd7',
            replyNote:
              'Black’s king cannot help the g-pawn. Yours takes it in two more moves, and the passed g-pawn runs.',
          },
        },
      },
      {
        id: 'summary',
        title: 'Three questions',
        text:
          'When only pawns and kings are left, I ask three questions, in this order.\n\n' +
          '- **Pawns facing pawns, kings far away?** Look for a breakthrough: sacrifice so that one pawn gets an open road, and count that the enemy king cannot catch it.\n' +
          '- **Pawns locked, only the kings can move?** Count king moves, use the diagonals, and walk round the enemy king instead of up to it.\n' +
          '- **Kings in opposition?** Count the spare pawn moves first: whoever has the last one wins the fight for the key squares.\n\n' +
          'The endgame drills let you practise all three.',
        fen: TEMPO,
      },
    ],
    practiceThemes: ['pawnEndgame', 'endgame'],
  },

  {
    id: 'rook-endgames-3',
    title: 'Rook endgames III: cutting off, checking from behind, Vancura',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'The techniques that decide rook and pawn against rook once Lucena and Philidor are known.',
    minutes: 12,
    steps: [
      {
        id: 'cut-off',
        title: 'Cut the king off',
        text:
          'In rook and pawn against rook, the first question is always how far the defending king is from the ' +
          'pawn. Here Black’s king stands on f6, one step from e6, where it would attack the pawn, and your own ' +
          'king cannot be everywhere at once.\n\n' +
          'A rook on a file is a **fence**: the enemy king cannot cross it. Put the fence between the black king ' +
          'and the pawn, and that king never joins the fight. Pushing the pawn is the instinct, but there is a ' +
          'better order: fence first, push later.',
        fen: CUT_ONE,
        shapes: ['e6:red', 'f6:blue'],
        task: {
          prompt: 'How do you keep the black king away from the pawn?',
          moves: ['Re1'],
          hint: 'A rook on a file is a fence the king cannot cross. Which file should it close?',
          success:
            '**Re1**: the rook closes the e-file. The black king cannot cross it, so only the black rook is left to trouble the pawn.',
          why:
            'Ask first how far the enemy king is from the pawn. Here it is one file away, so a fence on the e-file shuts ' +
            'it out. **d6** at once runs into **Ke6**: the king attacks the pawn before yours can help, and the win ' +
            'is gone. Fence first, push later: once the king is shut out, the pawn is free to move.',
          wrong: {
            d6: {
              text: 'The pawn runs into **Ke6**: the black king attacks it before yours can help, and the win is gone. A pawn is safe to push only when the king cannot reach it.',
              refute: 'Ke6',
            },
            'Ra6+': {
              text: 'The check only helps Black: after **Ke7** the king has stepped across to the pawn’s side of the board, and the win is gone. A check that improves the enemy king is not worth making.',
              refute: 'Ke7',
            },
            Kc5: '**Kc5** wins as well, but it needs exact play: after ...Rc8+ only **Kd6** keeps the win. The fence on the e-file asks much less of you.',
          },
          failure:
            'Find the rook move that keeps the black king away from the pawn for good, before you push anything.',
          reply: 'Rc8',
          replyNote:
            'The black king cannot cross the e-file, so the rook has to work alone. It swings out to c8, ready to check or to attack the pawn from behind.',
          then: {
            prompt: 'The king is shut out. What can the pawn do now?',
            moves: ['d6'],
            hint: 'The black king can no longer reach e6. Is the pawn still in danger there?',
            success:
              '**d6**: the pawn steps up with the black king locked out, taking e7 and c7 away from the black rook and king.',
            why:
              'The move that failed a moment ago is safe now, because the fence keeps the black king from e6. This is ' +
              'the plan for the whole ending: shut the king out, then walk king and pawn up the board together.',
            failure:
              'The fence is built. What can the pawn do now that the black king cannot reach it?',
          },
        },
      },
      {
        id: 'two-files',
        title: 'One file is not enough',
        text:
          'Same plan, but now the pawn is only on d4 and the black king is on g6. A fence on the e-file shut the ' +
          'king out last time. Will it again?\n\n' +
          'The pawn has a long way to go, and that gives the defender time. So before you choose, ask where the black ' +
          'king will be when the pawn finally gets going. The less advanced the pawn, the further away the fence ' +
          'has to stand.',
        fen: CUT_TWO,
        shapes: ['f6:red', 'g6:blue'],
        task: {
          prompt: 'Which file should the rook close this time?',
          moves: ['Rf1'],
          hint: 'One file further from the pawn than last time. Look at the file next to the black king.',
          success:
            '**Rf1**: the rook shuts the black king out two files from the pawn. It cannot cross the f-file, and your king can walk up the board.',
          why:
            'With the pawn on the fourth rank the fence has to stand one file further back than with the pawn on the ' +
            'fifth. After **Re1** the king steps to f6, right beside the fence, and it is only a draw. From f1 the ' +
            'rook keeps it on the g-file. Before you push, ask how far the king is, and place the fence to match.',
          wrong: {
            Re1: {
              text: 'One file is not enough with the pawn this far back. After **Kf6** the black king stands right beside the fence, and the position is only a draw.',
              refute: 'Kf6',
            },
            d5: {
              text: 'Pushing without a fence lets the king back in: after **Kf6** it is close enough to harass the pawn, and the position is only a draw.',
              refute: 'Kf6',
            },
          },
          failure:
            'The black king is not far enough away yet. Which file stops it before it gets near your pawn?',
          reply: 'Kg7',
          replyNote:
            'The black king waits on the g-file, as far as the rook lets it come. Yours can now walk up the board beside the pawn.',
        },
      },
      {
        id: 'long-side',
        title: 'Defending: the long side',
        text:
          'Now the defender’s view. White has pushed the pawn to e6, and Black’s king stands on f8, on the ' +
          '**short side** of the pawn: only three files, f, g and h, lie on that side. A rook needs room for its ' +
          'checks, and the **long side**, with four files, gives it the most. From there it can check from far ' +
          'away, where the white king cannot get near it. King on the short side, rook on the long side: that is ' +
          'the rule. Your rook is on b1, and White threatens Ra8+ followed by e7+.',
        fen: LONG_SIDE,
        orientation: 'black',
        shapes: ['f8:green', 'a7a8:red'],
        task: {
          prompt: 'How does Black hold the draw?',
          moves: ['Rb6+'],
          hint: 'Make the white king move first, with a check along the rank from the far side of the board.',
          success:
            '**Rb6+**: the rook checks along the sixth rank from the long side, and the white king has to leave its post beside the pawn.',
          why:
            'Without a check, White plays Ra8+ and then e7. So Black must make the white king move first, and a check ' +
            'from far away does it without letting the king close in. **Rb2** loses to Ra8+ and e7, and **Ke8** ' +
            'walks into **Ra8+**: after ...Rb8 Rxb8 it is mate. Short side for the king, long side for the rook.',
          wrong: {
            'Rd1+':
              '**Rd1+** draws as well: the rook checks from the d-file and can get behind the pawn next. Here you have the long side, so use it; the next position is about that other idea.',
            Rb8: {
              text: 'The rook guards the back rank, but without a check White has time to bring the king round with **Kd7**, and Black is slowly squeezed. You needed a check first.',
              refute: 'Kd7',
            },
            Ke8: {
              text: 'The king steps in front of the pawn and into a back-rank mate: **Ra8+ Rb8 Rxb8#**. The king in front of the pawn has no air.',
              refute: 'Ra8+',
            },
          },
          failure:
            'Without a check White plays Ra8+ and then e7. Make the white king move first, with a check from far away.',
          reply: 'Kd7',
          replyNote:
            'The white king leaves the check and prepares **e7+**. Black has exactly one move that holds now: any other rook move or a king move loses.',
          then: {
            prompt: 'White threatens e7+. What holds?',
            moves: ['Rb8'],
            hint: 'Where does the rook control e8 whatever the pawn does?',
            success:
              '**Rb8**: the rook covers the eighth rank. After e7+ the king steps to f7 beside the pawn, and the checks go on.',
            why:
              'While the rook guards the eighth rank the pawn can never queen, and after **e7+ Kf7** the white king and ' +
              'rook are tied to the pawn. **Kg7** loses to **e7**, and **Rb5** loses to **e7+**, because the rook has ' +
              'left the back rank.',
            wrong: {
              Kg7: {
                text: 'The king steps aside, but **e7** follows and the rook cannot stop the pawn. The back rank is the rook’s post.',
                refute: 'e7',
              },
              Rb5: {
                text: 'A loose rook on the fifth does nothing: **e7+** and the pawn cannot be stopped from queening.',
                refute: 'e7+',
              },
            },
            failure:
              'White threatens e7+ and a new queen. The rook must stand where it controls e8 along the rank.',
          },
        },
      },
      {
        id: 'from-behind',
        title: 'Defending: from behind',
        text:
          'Same position, but Black’s rook stands on h1, on the short side, and the check along the sixth rank has ' +
          'gone. Attacking the pawn with **Rh6** fails to **Ra8+**, and the king steps up to d7 with e7 to come.\n\n' +
          'One idea is left, and it is a classic: check from **behind** the pawn. From there, or from the file ' +
          'beside it, the rook keeps checking from a distance, and the white king never gets the free move it ' +
          'needs to support the pawn.',
        fen: FROM_BEHIND,
        orientation: 'black',
        shapes: ['h1:blue', 'e6:red'],
        task: {
          prompt: 'How does Black hold the draw now?',
          moves: ['Rd1+'],
          hint: 'Only one check holds. Which file lets the rook check from a distance and reach the pawn’s file next?',
          success:
            '**Rd1+**: the rook checks from the d-file and is ready to get behind the pawn. Wherever the king goes, the checks keep coming.',
          why:
            'With no long side to use, the rook checks from the file beside the pawn and then from behind it, and ' +
            'White’s king cannot support the pawn while that goes on. **Rh6** hits the pawn but loses to **Ra8+**, ' +
            'and a quiet move like **Kg8** gives White the time for Ra8+ and e7. Check, and check again.',
          wrong: {
            Rh6: {
              text: '**Ra8+** drives the king to g7, and then **Kd7** and e7 queen the pawn. Attacking the pawn from the side is too slow here.',
              refute: 'Ra8+',
            },
            Kg8: {
              text: 'The king steps aside, but **Ra8+** comes with tempo: **Kh7**, and e7 follows. The rook needed to check first.',
              refute: 'Ra8+',
            },
          },
          failure:
            'Every quiet move gives White time for Ra8+ and e7. Look for a check that brings the rook to the pawn’s file.',
          reply: 'Ke5',
          replyNote:
            'The king steps toward the pawn’s file. **Re1+** comes next: the rook checks from behind the pawn, and White never gets a free move.',
        },
      },
      {
        id: 'vancura',
        title: 'Vancura’s position',
        text:
          'Rook pawns are different. White’s pawn stands on a6 and its rook is in front of it, on a8, where it ' +
          'blocks the pawn’s path. Going behind the pawn, as in the last position, is the wrong plan here.\n\n' +
          'Black’s drawing method is the **Vancura** position: the rook attacks the pawn from the side along the ' +
          'sixth rank, which ties White’s rook to the a-file, and the king waits on g7 or h7. Whenever the white ' +
          'king comes to help, the rook checks it from the side.',
        fen: VANCURA,
        orientation: 'black',
        shapes: ['a6:red', 'g7:green'],
        task: {
          prompt: 'Set up the fortress. Where does the rook go?',
          moves: ['Rf6'],
          hint: 'Put the rook on the pawn’s rank, to hit it from the side.',
          success:
            '**Rf6**: the rook attacks the pawn from the side along the sixth rank. White’s rook is tied to the a-file, and the white king cannot come to help without being checked.',
          why:
            'From the side the rook hits the pawn and checks the king as it comes to defend it. A rook behind the pawn ' +
            'cannot do that: after **Ra1 Kc5** the king walks to b6 and the pawn is escorted home. Keep the king on g7 ' +
            'or h7, out of the way, and the rook on the sixth rank.',
          wrong: {
            Ra1: {
              text: 'Behind the pawn the rook cannot check from the side. After **Kc5** the king walks to b6 and the pawn is escorted home.',
              refute: 'Kc5',
            },
            'Rf4+': {
              text: 'The check drives the king where it wants to go: after **Ke5** it heads for the pawn, and the rook has left the sixth rank.',
              refute: 'Ke5',
            },
          },
          failure:
            'The rook belongs on the sixth rank, where it hits the pawn from the side. Find the square on that rank.',
          reply: 'Kc5',
          replyNote:
            'White’s king heads for the pawn. The rook stays on the sixth rank, ready to check from the side, and the black king waits on g7.',
        },
      },
      {
        id: 'summary',
        title: 'What to remember',
        text:
          '- **Attacking:** cut the king off along a file before you push. The less advanced the pawn, the further away the fence has to stand.\n' +
          '- **Defending with the pawn on the sixth:** king on the short side, rook on the long side, and check from far away. With the rook on the short side, get behind the pawn.\n' +
          '- **Rook pawn, rook in front of it:** Vancura. Attack the pawn from the side and check from the side.\n\n' +
          'Run these in the endgame drills until the moves come without thinking.',
        fen: VANCURA,
        orientation: 'black',
      },
    ],
    practiceThemes: ['rookEndgame', 'endgame'],
  },

  {
    id: 'how-to-study-openings',
    title: 'How to study openings',
    level: 'intermediate',
    category: 'Openings',
    summary:
      'A method for learning openings that survives contact with a real opponent, and how this trainer supports it.',
    minutes: 10,
    steps: [
      {
        id: 'ideas-first',
        title: 'Learn the ideas, not the moves',
        text:
          'Memorising twenty moves of theory is wasted when your opponent leaves the book on move six, and in ' +
          'club games somebody always does. So study in this order. First **the ideas**: where the pieces belong ' +
          'and which pawn break each side wants. Then a short **repertoire**: one answer to everything, a few ' +
          'moves deep. Then **your own games**, to see where you left your lines. Last, **the traps**. Here is an ' +
          'Italian Game with the bishops traded off. White’s pawns on d4 and e4 hold the centre, and the whole ' +
          'question for Black is what this structure wants.',
        fen: ITALIAN_D5,
        orientation: 'black',
        shapes: ['e4:red', 'd4:red'],
        task: {
          prompt: 'Which pawn break challenges the centre?',
          moves: ['d5'],
          hint: 'Challenge the white pawn on e4 with a pawn of your own.',
          success:
            '**d5**: the pawn strikes at the centre. After exd5 Nxd5 Black can castle at once, and White is left with an isolated pawn on d4.',
          why: 'In an opening the question is not “what is the next move?” but “what does this structure want?” White’s pawns on d4 and e4 hold the centre, so Black hits them with **d5**. If you know the idea you can find the move in positions you have never seen; a memorised sequence cannot do that.',
          wrong: {
            Nxe4: '**Nxe4** works as well: after Nxe4 Nxe4 d5 the pawn forks bishop and knight, and Black wins the piece back. It is the same break with a tactic attached, but **d5** at once is simpler.',
            'O-O':
              '**O-O** is sound, but it leaves the centre to White, who gets time for Bd3 and keeps the strong pair of pawns. The break **d5** does more.',
          },
          failure:
            'Several moves are sound here, but one frees the position at once. Which pawn move challenges White’s centre?',
          reply: 'exd5',
          replyNote:
            'White takes, the main line. The other try, **Bd3**, meets ...dxe4 Nxe4, and Black is comfortable there too.',
          then: {
            prompt: 'How do you recapture?',
            moves: ['Nxd5'],
            hint: 'Black is a pawn down for a moment. Recapture with a piece that develops and stays safe.',
            success:
              '**Nxd5**: the knight recaptures on a strong central square. Black can castle at once, and White’s pawn on d4 is isolated.',
            why: 'A piece recapture keeps your development going, where the queen would walk into a bishop capture: Qxd5 Bxd5. The isolated pawn on d4 is the long-term target. That is what to take from this position: not the sequence, but the break and the structure it creates.',
            wrong: {
              Qxd5: {
                text: 'The pawn on d5 is guarded by the bishop on c4: **Bxd5** wins the queen for a bishop. Recapture with a piece.',
                refute: 'Bxd5',
              },
              Ne7: '**Ne7** holds too, planning ...Nexd5, but **Nxd5** recaptures at once with the more active piece and leaves White an isolated pawn straight away.',
            },
            failure:
              'The pawn on d5 has to come back. Which recapture develops a piece and keeps everything safe?',
          },
        },
      },
      {
        id: 'shilling',
        title: 'When they leave the book',
        text:
          'The Shilling Gambit: Black’s third move, Nd4, looks like a blunder, because the pawn on e5 simply ' +
          'hangs. But an odd move is a question, not a gift, so ask what your opponent wants before you grab. ' +
          'Black’s queen is ready to come out, and the pawn on e5 is bait for a greedy reply. You do not need ' +
          'theory for this. You need the habit of looking at the opponent’s threats before your own.',
        fen: SHILLING,
        shapes: ['d4:red', 'e5:blue'],
        task: {
          prompt: 'How do you answer the odd move?',
          moves: ['Nxd4', 'O-O', 'Nc3'],
          hint: 'The pawn on e5 looks free, but ask what Black wants first.',
          success:
            'White leaves the bait alone: **Nxd4** trades the intruder, and **O-O** or **Nc3** simply develops. Either way White keeps a lead in development.',
          why: 'An odd move is a question. Taking on e5 walks into **Qg5**, which attacks the knight and g2 at once, and greed with Nxf7 then loses to Qxg2 Rf1 Qxe4+ Be2 Nf3#. Trade the intruder or just develop, and your lead stays. Punish an odd move with development, not greed.',
          wrong: {
            Nxe5: {
              text: 'Black’s point: **Qg5** attacks the knight and g2 together. Grabbing more with Nxf7 loses at once: Qxg2 Rf1 Qxe4+ Be2 Nf3#. Even the calm O-O leaves Black a little better.',
              refute: 'Qg5',
            },
            'Bxf7+': {
              text: '**Bxf7+** grabs a pawn with check, but **Kxf7** and Nxe5+ Ke7 leave you with two pawns for a bishop, and Black is a little better.',
              refute: 'Kxf7',
            },
            c3: '**c3** is sound too: it prepares d4 and leaves the bait alone. But trading the intruder or developing at once keeps a bigger lead, and the point here is not to grab.',
          },
          failure:
            'The pawn on e5 is bait. Trade the knight that has jumped into your camp, or simply develop.',
        },
      },
      {
        id: 'elephant-trap',
        title: 'Know the traps in your lines',
        text:
          'The Elephant Trap, in the Queen’s Gambit Declined. White has just taken the pawn on d5 with the ' +
          'knight, and it looks as if White has won a pawn: your knight on f6 is pinned to the queen by the ' +
          'bishop on g5, so how can you take back? If this line is in your repertoire you must know the answer, ' +
          'because the trap only works on people who do not. A trap is an idea that you know and your opponent ' +
          'does not, and this one is worth learning move by move.',
        fen: ELEPHANT_1,
        orientation: 'black',
        shapes: ['f6d5:green', 'g5d8:red'],
        task: {
          prompt: 'How do you punish the capture on d5?',
          moves: ['Nxd5'],
          hint: 'The pinned knight may still capture. Count what happens after the bishop takes the queen.',
          success:
            '**Nxd5**: the knight takes the knight, and the black queen now attacks the bishop on g5. If White takes the queen, a check follows.',
          why: 'The pin is only real if the pinned piece has nothing better to do. Here the knight captures with a threat: the queen attacks the bishop in return. After **Bxd8** Black has a check that wins the queen back with interest. Avoiding the trap with ...Be7 just leaves you a pawn down.',
          wrong: {
            Be7: {
              text: 'Breaking the pin only accepts the loss of a pawn: after **Nxe7** Qxe7 White is a clean pawn up with the better game. The pin on f6 is an illusion.',
              refute: 'Nxe7',
            },
            'Bb4+': {
              text: 'A check, but the knight on d5 simply takes the bishop: **Nxb4**, and Black has dropped a piece.',
              refute: 'Nxb4',
            },
          },
          failure:
            'The knight on f6 can move: it only has to capture something. Which capture also uncovers an attack?',
          reply: 'Bxd8',
          replyNote:
            'White grabs the queen, which looks like the end for Black. But Black has a check that wins it all back.',
          then: {
            prompt: 'White has the queen. How do you win it back?',
            moves: ['Bb4+'],
            hint: 'A check that White can only meet by blocking with the queen.',
            success:
              '**Bb4+**: the bishop checks along the diagonal, and the only legal reply puts White’s queen on d2.',
            why: 'The check comes first. Recapturing the bishop at once with **Kxd8** lets White play **a3**: the check on b4 is gone, and White is winning. After Bb4+ the queen must go to d2, where it is pinned to the king and attacked in turn.',
            wrong: {
              Kxd8: {
                text: 'Taking the bishop at once lets White play **a3**: the check on b4 never happens, and White is winning. The check has to come first.',
                refute: 'a3',
              },
            },
            failure:
              'Your queen is gone, but you have a check. Which check forces White to put the queen in the way?',
            reply: 'Qd2',
            replyNote:
              'White’s only legal reply: the king has no square, so the queen has to block on d2.',
            then: {
              prompt: 'The queen is in the way. What do you take?',
              moves: ['Bxd2+'],
              hint: 'Your bishop attacks the queen. Which capture also comes with check?',
              success:
                '**Bxd2+**: the bishop takes the queen with check. The white king recaptures, and the bishop on d8 is still hanging.',
              why: 'The queens come off on your terms, and the bishop on d8 is the next thing to fall. **Kxd8** first also wins, since the queen is pinned to the king and the bishop on b4 attacks it, but the exchange on d2 is the clean way: White can no longer choose.',
              wrong: {
                Kxd8: 'That wins too, since the queen is pinned and cannot escape, but it leaves White a choice of replies. Taking the queen with check keeps matters simple.',
              },
              failure: 'Your bishop attacks the white queen. Which capture also comes with check?',
              reply: 'Kxd2',
              replyNote:
                'White recaptures with the king, which now stands in the middle of the board. The bishop on d8 is still hanging.',
              then: {
                prompt: 'One capture is left. What is it?',
                moves: ['Kxd8'],
                hint: 'The bishop that took your queen is still on d8.',
                success:
                  '**Kxd8**: the king takes the last bishop. Black has won a knight for a pawn, and White’s king is stuck in the centre.',
                why: 'Count the trade: Black gave a queen, a bishop and a pawn, and White gave a queen, a bishop and a knight. A trap is only worth something if you remember it, so put the line into your repertoire and let the trainer drill it.',
                failure:
                  'The white bishop on d8 has taken your queen. Take it back before White rescues it.',
              },
            },
          },
        },
      },
      {
        id: 'routine',
        title: 'A weekly routine',
        text:
          'Here is how I would spread this over a week.\n\n' +
          '- **Five minutes a day** in Openings: review the moves due today, and add a new line now and then.\n' +
          '- **After every serious game**, import it on My games and read the Repertoire check, which shows where you left your lines. Add the first new position to your repertoire.\n' +
          '- **Once a month**, pick one opening you play and read about its plans, not its moves.\n' +
          '- **When a position confuses you**, set it up on the Analyze board and play it out against the engine.\n\n' +
          'You will know far fewer moves than your opponents, and you will understand the positions they lead to.',
        fen: ITALIAN_D5,
        orientation: 'black',
      },
    ],
    practiceThemes: ['opening'],
  },
];
