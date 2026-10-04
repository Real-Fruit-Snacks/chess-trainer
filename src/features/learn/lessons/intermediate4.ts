import { fenAfter, type Lesson } from '../model';

// Pawn endgames II.
const BREAK = 'k7/5ppp/8/5PPP/8/8/8/K7 w - - 0 1';
const BREAK_2 = fenAfter('1. g6 hxg6', BREAK);
const OUTFLANK = '8/2k5/3p4/2pP4/2P5/3K4/8/8 w - - 0 1';
const OUTFLANK_2 = fenAfter('1. Ke4 Kd7', OUTFLANK);
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
const ELEPHANT_2 = fenAfter(`${ELEPHANT} Nxd5 7. Bxd8`);

export const intermediateLessons4: Lesson[] = [
  {
    id: 'pawn-endgames-2',
    title: 'Pawn endgames II: breakthrough, outflanking, the spare tempo',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Three ideas that decide king-and-pawn endgames when the opposition alone is not enough.',
    minutes: 10,
    steps: [
      {
        title: 'Beyond the opposition',
        text:
          'You know the square of the pawn and the opposition. Pawn endgames are decided by three more ' +
          'ideas that come up again and again:\n\n' +
          '- The **breakthrough**: a pawn sacrifice that creates a passed pawn out of nothing.\n' +
          '- **Outflanking**: the king walks *round* the enemy king instead of straight at it.\n' +
          '- The **spare tempo**: a pawn move kept in reserve so that the opponent has to move the king.\n\n' +
          'Here three pawns face three pawns and both kings are far away. Whoever creates a passed pawn first wins.',
        fen: BREAK,
        shapes: ['g5g6:red', 'f5:blue', 'h5:blue'],
      },
      {
        title: 'The breakthrough',
        text: 'Only one pawn move works. Ask which pawn attacks **two** pawns, and what happens after each capture.',
        fen: BREAK,
        task: {
          prompt: 'White to move: create a passed pawn.',
          moves: ['g6'],
          reply: 'hxg6',
          hint: 'The pawn in the middle goes first — it attacks both f7 and h7.',
          success:
            'g6! Whichever way Black captures, a white pawn breaks through: after ...hxg6 comes f6!, after ...fxg6 comes h6!',
          failure:
            'Only g6 creates a passed pawn at once. f6 or h6 is simply captured, and the remaining pawns are blocked.',
        },
      },
      {
        title: 'Finish it',
        text: 'Black took with the h-pawn. Now the second sacrifice: make sure the pawn that runs has **no black pawn in front of it**.',
        fen: BREAK_2,
        task: {
          prompt: 'White to move: the second sacrifice.',
          moves: ['f6'],
          hint: 'Which white pawn can reach the eighth rank with nothing in its way?',
          success:
            'f6! gxf6 h6 and the h-pawn queens — the black king on a8 is hopelessly far away.',
          failure:
            'After h6? gxh6 the f-pawn advances straight into the pawn on f7, and Black is simply three pawns to one.',
        },
      },
      {
        title: 'Outflanking',
        text:
          'Nothing is passed here and nothing can move except the kings. White wants to reach **e6** (winning d6) ' +
          'or to win a race after ...Kb6-a5-b4xc4. The straight route Kd3-e3-f4 is a tempo too slow: the king ' +
          'must **step diagonally** so that it approaches both f5 and the c-pawn at once.',
        fen: OUTFLANK,
        shapes: ['d3e4', 'e4f5', 'f5e6', 'd6:red', 'c4:blue'],
        task: {
          prompt: 'White to move: start the king walk.',
          moves: ['Ke4'],
          reply: 'Kd7',
          hint: 'A diagonal king move gains a tempo over a straight one.',
          success:
            'Ke4! If Black defends d6 with ...Kd7-e7 White goes round via g6; if Black counterattacks with ...Kb6-a5-b4 White wins the pawn race by exactly one tempo: Kxd6, Kxc4 and Kc6!',
          failure:
            'A tempo too slow. After Ke3? Kb6! Kf4 Ka5 Kf5 Kb4 Ke6 Kxc4 Kxd6 Kb4 both sides queen and the game is drawn.',
        },
      },
      {
        title: 'Keep going round',
        text:
          'Black guards d6 from d7. Do not stand in front of the black king — go past it. The white king aims for ' +
          'g6 and f7, after which Black runs out of squares and e6 falls into White’s hands.',
        fen: OUTFLANK_2,
        shapes: ['e4f5', 'f5g6', 'g6f7:blue'],
        task: {
          prompt: 'White to move: continue outflanking.',
          moves: ['Kf5'],
          hint: 'Sideways and forward — the king wants g6.',
          success:
            'Kf5! Ke7 Kg6 Kd8 Kf6 Kd7 Kf7 Kd8 Ke6 and the d6 pawn falls. The king never stood opposite the black king; it went round it.',
          failure:
            'Kf5! — forward and round, heading for g6 and f7. A step back lets Black take the opposition and hold; Kf4 still wins, but only by coming back to the same plan.',
        },
      },
      {
        title: 'The spare tempo',
        text:
          'The kings stand in opposition and it is White to move — normally bad news for White. But look at the ' +
          'g-pawns: White has a pawn move in reserve, Black has none. Whoever has the last spare pawn move forces the ' +
          'other king to give way.',
        fen: TEMPO,
        shapes: ['g3g4', 'b5:red'],
        task: {
          prompt: 'White to move: use the spare tempo.',
          moves: ['g4', 'Ke4'],
          hint: 'Pass the move to Black with a pawn.',
          success:
            'g4! Now Black must move the king: ...Kc6 Ke5 or ...Ke6 Kc5 and a pawn falls. (Ke4, going round, also wins.) Count spare pawn moves before you count the opposition.',
          failure:
            'After Ke3? Kd5! Kd3 g4! it is Black who has the spare tempo, and the white king has to give way.',
        },
      },
      {
        title: 'Summary',
        text:
          '- Pawns facing pawns with the kings away: look for a **breakthrough** sacrifice.\n' +
          '- The king goes **round** the enemy king; diagonal steps cost nothing extra.\n' +
          '- Before counting the opposition, count **spare pawn moves**. The side with the last one wins the fight for the key squares.\n\n' +
          'Practise all three in the Endgame drills and the endgame studies.',
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
    minutes: 11,
    steps: [
      {
        title: 'Files are fences',
        text:
          'A rook on a file is a fence the enemy king cannot cross. In rook and pawn against rook the question ' +
          'is usually: **how far is the defending king from the pawn?** If it is cut off by enough files, the ' +
          'attacking king escorts the pawn and Lucena follows.\n\n' +
          'The black king is not yet cut off — it is about to reach e7 and e6. One rook move keeps it out.',
        fen: CUT_ONE,
        shapes: ['e1:blue', 'f6e7:red', 'f6e6:red'],
      },
      {
        title: 'Cut the king off',
        text: 'Pushing the pawn first lets the king catch it. Fence first, push later.',
        fen: CUT_ONE,
        task: {
          prompt: 'White to move: cut the black king off from the pawn.',
          moves: ['Re1'],
          hint: 'Put the rook on the file between the king and the pawn.',
          success:
            'Re1! The king can never cross the e-file, so the white king and pawn advance together: ...Rc8 d6 Kf7 Kd5 and d7 comes next. A pawn on the fifth rank with the king cut off by one file is a win.',
          failure:
            'After d6? Ke6! the king attacks the pawn and Re1+ Kxd6 is a draw. Cut the king off first: Re1.',
        },
      },
      {
        title: 'How many files?',
        text:
          'With the pawn only on the **fourth** rank one file is not enough: after Re1? Kf6! the king reaches ' +
          'f7-e7 in time and the checks from the side hold the draw. Cut it off by **two** files instead.',
        fen: CUT_TWO,
        shapes: ['f1:blue', 'e1:red'],
        task: {
          prompt: 'White to move: cut the king off far enough.',
          moves: ['Rf1'],
          hint: 'One file more than you think.',
          success:
            'Rf1! Two files away the black king is too slow: ...Rd8 Kc4 Rc8+ Kb5 Rd8 Kc5 Rc8+ Kb6 and the pawn runs. Rule of thumb: pawn on the fourth — two files; on the fifth — one file is enough.',
          failure:
            'Re1? Kf6! — with the pawn still on the fourth rank one file is not enough: ...Rc8+ and ...Rd8+ harass the king and the pawn never gets going. Rf1 keeps the king two files away.',
        },
      },
      {
        title: 'The defender: long side and short side',
        text:
          'Now the other side of the board. White has reached the sixth rank and Philidor is no longer available. ' +
          'Two things save Black here:\n\n' +
          '- The black king stands on the **short side** of the pawn (f8, where there are only three files), so ' +
          'the rook has the **long side** (a–d) for checks along the rank: **Rb6+!** and the king has nowhere to hide.\n' +
          '- Or the rook goes **behind the pawn** and checks from there: **Rd1+!**\n\n' +
          'Both draw. Remember the rule: king to the short side, rook to the long side.',
        fen: LONG_SIDE,
        orientation: 'black',
        shapes: ['b1b6', 'b1d1:blue', 'f8:green'],
      },
      {
        title: 'When the rook is on the wrong side',
        text:
          'Same position, but the rook is on the h-file — the short side. From here a check along the rank is not ' +
          'even possible (the pawn on e6 blocks it), and attacking the pawn with Rh6? loses to Ra8+ Kg7 Kd7 and e7. ' +
          'One idea is left.',
        fen: FROM_BEHIND,
        orientation: 'black',
        shapes: ['h1d1:blue', 'e6:red'],
        task: {
          prompt: 'Black to move: hold the draw.',
          moves: ['Rd1+'],
          hint: 'Get behind the pawn with check.',
          success:
            'Rd1+! Wherever the king goes the checks continue from behind: Kc7 Ke7! (attacking the pawn) or Ke5 Re1+ Kf6 Rf1+ Kg5 Re1. The king cannot shelter from a rook behind the pawn and support it at the same time.',
          failure:
            'That loses. The only defence is Rd1+, checking from behind the pawn — the white king has no shelter.',
        },
      },
      {
        title: 'Vancura’s position',
        text:
          'Rook pawns are special. White’s rook is *in front* of its own a-pawn — normally a bad sign for Black, ' +
          'because the pawn advances and the rook escapes with check. Vancura’s defence: the black rook attacks the ' +
          'pawn **from the side along the sixth rank**, and checks from the side whenever the white king approaches. ' +
          'The black king stays on g7/h7.',
        fen: VANCURA,
        orientation: 'black',
        shapes: ['f1f6', 'a6:red', 'g7:green'],
        task: {
          prompt: 'Black to move: set up the fortress.',
          moves: ['Rf6'],
          hint: 'The rook goes to the rank of the pawn, not behind it.',
          success:
            'Rf6! Now Kc5 Kh7! Kb5 Rf5+ Kc6 Rf6+ — the checks never end, and Ra7+ Kg6 Ra8 Kg7 changes nothing. Compare Ra1? Kc5 Kf6 Kb6 Rb1+ Ka7 and the rook on a8 escapes with a decisive gain of tempo.',
          failure:
            'Behind the pawn is wrong here: after Ra1? Kc5 Kf6 Kb6 the king supports the pawn and Ka7 lets the rook out. Vancura: rook to f6, attacking the pawn from the side.',
        },
      },
      {
        title: 'Summary',
        text:
          '- Attacking: **cut the king off** by files before pushing; the further back the pawn, the more files you need.\n' +
          '- Defending with the pawn on the sixth: king to the **short side**, rook to the **long side** or **behind the pawn**, and keep checking.\n' +
          '- Against a rook pawn with the rook in front of it: **Vancura** — attack the pawn from the side and check from the side.\n\n' +
          'Run these in the Endgame drills until the moves are automatic.',
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
      'A method for learning openings that survives contact with a real opponent — and how this trainer supports it.',
    minutes: 8,
    steps: [
      {
        title: 'Moves are not the point',
        text:
          'Memorising twenty moves of theory does not help when the opponent leaves the book on move six — as ' +
          'happens in most club games. Study openings in this order:\n\n1. **The ideas**: where the pieces ' +
          'belong, which pawn breaks each side wants, the typical middlegame.\n2. **A short repertoire**: one ' +
          'answer to everything, a few moves deep, drilled with spaced repetition in the Openings section.\n3. ' +
          '**Your own games**: import them on the My games page to see where you or your opponents left your ' +
          'lines; Review turns your mistakes into puzzles.\n4. **The traps**: every opening has two or three you ' +
          'must know.\n\nHere is the Italian Game after 8.Nbxd2. Black has traded bishops; what is the idea now?',
        fen: ITALIAN_D5,
        orientation: 'black',
        shapes: ['d7d5', 'e4:red'],
      },
      {
        title: 'Know the freeing break',
        text:
          'Black is slightly behind in development but the centre is the target. The thematic move strikes at e4 ' +
          'and frees the whole position — the kind of idea worth learning instead of a move order.',
        fen: ITALIAN_D5,
        orientation: 'black',
        task: {
          prompt: 'Black to move: the freeing pawn break.',
          moves: ['d5'],
          hint: 'Challenge the e4 pawn with a pawn.',
          success:
            'd5! exd5 Nxd5 and Black has equalised: the isolated d-pawn is under pressure and every black piece is developed. Learn the break, not the sequence.',
          failure:
            'Playable, but the idea of the position is ...d5, challenging the centre while White’s pieces are not yet coordinated.',
        },
      },
      {
        title: 'When they leave the book',
        text:
          'The Blackburne Shilling Gambit: 3...Nd4?! looks like a blunder — the e5 pawn hangs. Before grabbing, ' +
          'ask what the opponent wants. After 4.Nxe5? Qg5! the knight and g2 are attacked and 5.Nxf7 Qxg2 6.Rf1 ' +
          'Qxe4+ 7.Be2 Nf3 is mate. Punish an odd move with development, not greed.',
        fen: SHILLING,
        shapes: ['d4:red', 'e5:blue'],
        task: {
          prompt: 'White to move: the calm answer.',
          moves: ['Nxd4', 'O-O'],
          hint: 'Trade the intruder or just castle — do not take on e5.',
          success:
            'Nxd4 exd4 and White simply has a better position (O-O is fine too). The pawn on e5 was poisoned: 4.Nxe5? Qg5! is the whole point of Black’s gambit.',
          failure:
            'That walks into Black’s idea. After 4.Nxe5? Qg5! White is already in trouble. Nxd4 or O-O keeps a calm advantage.',
        },
      },
      {
        title: 'Know the traps in your lines',
        text:
          'The Elephant Trap in the Queen’s Gambit Declined. White has just played 6.Nxd5?, which seems to win a pawn ' +
          'because the knight on f6 is pinned to the queen. If this line is in your repertoire, you must know the refutation.',
        fen: ELEPHANT_1,
        orientation: 'black',
        shapes: ['f6d5:green', 'g5d8:red'],
        task: {
          prompt: 'Black to move: refute 6.Nxd5.',
          moves: ['Nxd5'],
          reply: 'Bxd8',
          hint: 'The pin is not real — take the knight and see what happens after Bxd8.',
          success: 'Nxd5! White takes the queen with Bxd8, but Black has a check in reserve...',
          failure:
            'Take the knight! The pin on f6 only looks dangerous: Nxd5 Bxd8 and now a check wins the bishop back.',
        },
      },
      {
        title: 'The point',
        text: 'White has won the queen — for a moment.',
        fen: ELEPHANT_2,
        orientation: 'black',
        task: {
          prompt: 'Black to move: win the piece back with interest.',
          moves: ['Bb4+'],
          hint: 'A check that White can only block with the queen.',
          success:
            'Bb4+! Qd2 Bxd2+ Kxd2 Kxd8 and Black has won a piece for a pawn. A trap is just an idea you know ' +
            'and the opponent does not.',
          failure:
            'Bb4+ is the move: White must block with Qd2, and after Bxd2+ Kxd2 Kxd8 Black has won a piece ' +
            'for a pawn.',
        },
      },
      {
        title: 'A weekly routine',
        text:
          '- **Five minutes a day** on the repertoire trainer clears the due lines.\n' +
          '- After every serious game: import it, look at the Repertoire tab, and add the first new position to your notes.\n' +
          '- Once a month: pick one opening from the Explore openings page and read its plans, not its moves.\n' +
          '- When you hit a position you do not understand, play it out against the engine from the Analyze page.\n\n' +
          'You will know far fewer moves than your opponents — and you will understand the positions they lead to.',
        fen: ITALIAN_D5,
        orientation: 'black',
      },
    ],
    practiceThemes: ['opening'],
  },
];
