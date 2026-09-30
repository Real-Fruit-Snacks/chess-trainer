import { fenAfter, type Lesson } from '../model';

const FRENCH_ADVANCE = fenAfter('1. e4 e6 2. d4 d5 3. e5');
const ITALIAN_PASSIVE = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Be7');
const KID_MAINLINE = fenAfter(
  '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Nd3',
);
const AFTER_E4_E5_NF3_NC6 = fenAfter('1. e4 e5 2. Nf3 Nc6');
const AFTER_D4_D5 = fenAfter('1. d4 d5');
const AFTER_E4 = fenAfter('1. e4');

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
          'A bishop is better than a knight when:\n\n' +
          '- there are **pawns on both wings** (the bishop covers both from afar);\n' +
          '- the position is **open**;\n' +
          '- there is a **passed pawn** to support from a distance.\n\n' +
          'A knight is better when:\n\n' +
          '- pawns are **fixed on one wing** or the position is **blocked**;\n' +
          '- the bishop is **bad** (its own pawns sit on its colour);\n' +
          '- there is a strong **outpost** the knight cannot be driven from.\n\n' +
          'Knight endgames behave like pawn endgames: an extra pawn usually wins. Bishop endgames of the *same* colour are similar. Bishops of *opposite* colours are a special case — the next lesson.',
        fen: '8/pp3kpp/2n5/8/8/2B5/PP3PPP/6K1 w - - 0 1',
        shapes: ['c3g7:green', 'c3a5:green', 'c6:blue'],
      },
      {
        title: 'The wrong rook pawn',
        text:
          'A bishop and a **rook pawn** win only if the bishop controls the promotion square. Here the pawn is on the ' +
          'h-file, the promotion square h8 is dark, and White’s bishop is light-squared: the *wrong* bishop.\n\n' +
          'Black draws by getting the king to h8 — nothing can ever push it out of the corner.',
        fen: '8/5k2/8/5K2/7P/3B4/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:blue', 'f7g8', 'f7g7'],
        task: {
          prompt: 'Black to move: head for the saving corner.',
          moves: ['Kg7', 'Kg8'],
          hint: 'Which corner does the h-pawn promote in? Get there.',
          success:
            'Right. Once the king reaches h8 (or g8/g7 next to it) White can never make progress: h7+ is met by ...Kh8 and it is stalemate or the pawn falls.',
          failure: 'That lets the white king cut you off. Go straight for g7/g8 and then h8.',
        },
      },
      {
        title: 'The right rook pawn',
        text:
          'With the *right* bishop — one that controls the corner — the win is easy. Here the bishop on c5 covers f8, ' +
          'so the black king has only one square after the pawn advances with check.',
        fen: '6k1/8/6KP/2B5/8/8/8/8 w - - 0 1',
        shapes: ['c5f8', 'h6h7'],
        task: {
          prompt: 'White to move: mate in two.',
          moves: ['h7+'],
          reply: 'Kh8',
          hint: 'Push the pawn with check; the bishop controls f8.',
          success: 'h7+ Kh8 is forced. One bishop move mates.',
          failure: 'The direct way: give check with the pawn and see where the king must go.',
        },
      },
      {
        title: 'The right rook pawn: mate',
        text: 'The king is in the corner and cannot move. Deliver mate with the bishop.',
        fen: '7k/7P/6K1/2B5/8/8/8/8 w - - 0 1',
        task: {
          prompt: 'Checkmate.',
          moves: ['Bd4#'],
          acceptAnyMate: true,
          hint: 'The bishop must attack h8 along the long diagonal.',
          success: 'Bd4 mate. The bishop of the right colour is what made this possible.',
          failure: 'Not mate — the bishop needs to reach the a1–h8 diagonal.',
        },
      },
      {
        title: 'Knights and rook pawns',
        text:
          'Knights are clumsy against **rook pawns**: from the edge of the board a knight controls only two or three ' +
          'squares, and it cannot lose a tempo. A knight *in front* of a passed pawn is a fine blockader; a knight ' +
          'chasing a rook pawn from behind usually arrives too late.\n\n' +
          'Practical rules: with a knight, keep the pawns on one wing and look for a blockade; with a bishop, open ' +
          'the position and play on both wings.',
        fen: '8/8/8/8/8/2k5/p7/N3K3 w - - 0 1',
        shapes: ['a1:blue', 'a2a1:red', 'c3:red'],
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
          'When each side has one bishop and they move on **opposite colours**, the bishops never meet. The defender ' +
          'puts king and bishop on the squares the attacker’s bishop cannot touch and builds a **blockade**. Even two ' +
          'extra pawns are often not enough.\n\nThe defending recipe: the king blocks one pawn, the bishop stops the ' +
          'other from a safe diagonal, and you never move unless you have to.',
        fen: '8/8/3b1k2/3P1P2/2B1K3/8/8/8 b - - 0 1',
        shapes: ['d6:blue', 'f6:blue', 'd5d6:red', 'f5f6:red'],
      },
      {
        title: 'Hold the blockade',
        text:
          'Black is two pawns down. The king on f6 stops the f-pawn and the bishop guards d6, the d-pawn’s next square. ' +
          'Black must make a move — pick one that keeps both jobs done.',
        fen: '8/8/3b1k2/3P1P2/2B1K3/8/8/8 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Black to move: keep the blockade.',
          moves: ['Bc5', 'Bb4', 'Ba3', 'Be7', 'Bf8', 'Bc7', 'Bb8'],
          hint: 'Move the bishop along a diagonal from which it still controls d6.',
          success:
            'The bishop still watches d6 and the king still blocks f6. White cannot make progress: draw.',
          failure: 'That gives up control of d6 or f6 — one of the pawns will run through.',
        },
      },
      {
        title: 'In the middlegame: the attacker is a piece up',
        text:
          'With queens and rooks still on, opposite bishops favour the **attacker**. Whoever attacks on the colour of ' +
          'their own bishop is effectively a piece up on those squares, because the defender’s bishop can never help.\n\n' +
          'Here White’s light-squared bishop and queen aim at h7. Black’s dark-squared bishop on f6 is a spectator.',
        fen: '3q1rk1/5ppp/5b2/8/4Q3/3B4/8/6K1 w - - 0 1',
        shapes: ['e4h7:red', 'd3h7:red'],
        task: {
          prompt: 'White to move: checkmate.',
          moves: ['Qxh7#'],
          acceptAnyMate: true,
          hint: 'Two pieces attack h7; only the king defends it.',
          success:
            'Qxh7 mate. Black’s bishop, a whole piece, could do nothing on the light squares.',
          failure: 'Look at h7: it is attacked twice and defended once.',
        },
      },
      {
        title: 'Practical advice',
        text:
          '- **Ahead in material?** Avoid trading into an opposite-bishop endgame — keep a rook or the queens on.\n' +
          '- **Defending?** Trade towards it. Put your pawns on the colour your bishop does *not* control, so the bishop is free and the pawns are safe from the enemy bishop.\n' +
          '- **Attacking?** Put your pieces on your bishop’s colour and aim at the enemy king. The defender cannot cover those squares.',
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
      'A queen beats a pawn on the seventh — except two stalemate tricks every player must know.',
    minutes: 7,
    steps: [
      {
        title: 'The winning method',
        text:
          'A queen against a pawn on the seventh rank, supported by its king, is usually a win — but only with a ' +
          'plan:\n\n' +
          '1. Give **checks** and **pin** until the enemy king is forced *in front of* its own pawn.\n' +
          '2. That gains a **tempo**: while the king blocks the pawn, bring your own king one step closer.\n' +
          '3. Repeat until your king arrives, then win the pawn or mate.\n\n' +
          'It works for centre pawns and knight pawns. Bishop and rook pawns are different — see the following boards.',
        fen: 'K7/8/8/8/7Q/8/3kp3/8 w - - 0 1',
        shapes: ['e2e1:red', 'h4d4', 'd4d2:red'],
      },
      {
        title: 'Centre pawn: start the dance',
        text:
          'White’s king is far away on a8. Begin the checking sequence: force the black king onto e1, in front of ' +
          'its pawn, so that White’s king can approach.',
        fen: 'K7/8/8/8/7Q/8/3kp3/8 w - - 0 1',
        task: {
          prompt: 'White to move: begin the winning method.',
          moves: ['Qd4+', 'Qf2'],
          hint: 'Check along the d-file (or pin the pawn along the second rank).',
          success:
            'Qd4+ Kc2 Qe3 Kd1 Qd3+ Ke1 — the king is in front of the pawn and White’s king steps closer. Repeat and win.',
          failure:
            'That lets the pawn promote or loses time. Check from the d-file or pin the pawn.',
        },
      },
      {
        title: 'Bishop pawn: the stalemate trick',
        text:
          'Against a **bishop pawn** (c- or f-file) the defender has a trick. White has just checked on b4; Black is ' +
          'about to be forced in front of the pawn... or not. If the black king goes to the **corner**, the queen ' +
          'cannot take the pawn: Qxc2 would be *stalemate*.\n\nWith the white king far away, the game is a draw.',
        fen: '8/7K/8/8/1Q6/8/1kp5/8 b - - 0 1',
        orientation: 'black',
        shapes: ['a1:blue', 'b4c2:red'],
        task: {
          prompt: 'Black to move: save the draw.',
          moves: ['Ka1', 'Ka2'],
          hint: 'Which king move makes Qxc2 stalemate?',
          success:
            'Into the corner! Now Qxc2 is stalemate, and Qc3+ Kb1 Qb3+ Ka1 just repeats. The white king is too far away.',
          failure:
            'After that the queen wins the pawn with the usual method. Use the stalemate trick: head for a1.',
        },
      },
      {
        title: 'Rook pawn: same trick',
        text:
          'A **rook pawn** draws for the same reason: with the king on a1 and the pawn on a2, the queen can never ' +
          'approach without stalemating. Again the attacker needs the king nearby to win.',
        fen: '8/7K/8/8/1Q6/8/pk6/8 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Black to move: draw.',
          moves: ['Ka1'],
          hint: 'Step into the corner.',
          success:
            'Ka1! Qb3 would be stalemate, so White can only check — and the checks lead nowhere.',
          failure:
            'Only the corner saves this. Anything else and the queen wins the pawn with tempo.',
        },
      },
      {
        title: 'Summary',
        text:
          '- Queen vs **centre or knight pawn** on the seventh: win with the check-and-approach method.\n' +
          '- Queen vs **bishop or rook pawn**: draw if the attacking king is far away (stalemate tricks); win if it is close.\n' +
          '- With the pawn on the **sixth** rank or further back, the queen always wins.\n\n' +
          'This matters in pawn races: sometimes the side that queens second still draws.',
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
      'Rooks behind passed pawns, rooks on the seventh, and the Lucena and Philidor positions.',
    minutes: 10,
    steps: [
      {
        title: 'Rooks belong behind passed pawns',
        text:
          '**Tarrasch’s rule**: put your rook *behind* a passed pawn — your own or your opponent’s. Behind its own ' +
          'pawn a rook gains scope with every step the pawn takes; behind an enemy pawn it stops the pawn without ' +
          'being tied down.\n\nHere Black’s rook already sits behind White’s a-pawn. White’s rook should join the fight ' +
          'from the same side.',
        fen: 'r7/5kpp/5p2/P7/8/6P1/5PKP/1R6 w - - 0 1',
        shapes: ['a8a5:red', 'b1a1'],
        task: {
          prompt: 'White to move: place the rook according to Tarrasch.',
          moves: ['Ra1'],
          hint: 'Get behind your own passed pawn.',
          success:
            'Ra1! Now a6 comes, and every pawn step widens the rook’s reach. Black’s rook is stuck on a8.',
          failure:
            'Not the best square. Behind the pawn — on the a-file — is where the rook wants to be.',
        },
      },
      {
        title: 'Seventh heaven',
        text:
          'A rook on the **seventh rank** attacks pawns that have not moved and boxes the enemy king onto the back ' +
          'rank. Here the d-file is open and White’s king already has an escape square on h3, so there is no ' +
          'back-rank danger.',
        fen: '2r3k1/pp3ppp/8/8/8/7P/PP3PP1/3R2K1 w - - 0 1',
        shapes: ['d1d7', 'd7b7:red', 'd7f7:red'],
        task: {
          prompt: 'White to move: invade.',
          moves: ['Rd7'],
          hint: 'Which rank hits a7 and b7 at once?',
          success:
            'Rd7! The rook attacks b7 and ties Black down. Rooks are made for open files and the seventh rank.',
          failure: 'Passive. The open d-file leads straight to the seventh rank — use it.',
        },
      },
      {
        title: 'Lucena: drive the king away',
        text:
          'The **Lucena position** is the classic win with rook and pawn against rook: the pawn is on the seventh, ' +
          'your king in front of it, the enemy king cut off. First, push the enemy king one more file away with a ' +
          'check.',
        fen: '4K3/4P1k1/8/8/8/8/r7/5R2 w - - 0 1',
        shapes: ['f1g1'],
        task: {
          prompt: 'White to move: drive the king further from the pawn.',
          moves: ['Rg1+'],
          reply: 'Kh7',
          hint: 'A rook check along the g-file.',
          success: 'Rg1+ Kh7. Now the “bridge” can be built.',
          failure: 'The winning plan starts with a check that pushes the black king to the h-file.',
        },
      },
      {
        title: 'Lucena: build the bridge',
        text:
          'The king wants to step out from e8, but the black rook would check it forever along the files. So White ' +
          'first lifts the rook to the **fourth rank**: later it will interpose on e4 and shield the king.',
        fen: '4K3/4P2k/8/8/8/8/r7/6R1 w - - 0 1',
        shapes: ['g1g4', 'g4e4:blue'],
        task: {
          prompt: 'White to move: start building the bridge.',
          moves: ['Rg4'],
          hint: 'The rook goes to the fourth rank.',
          success:
            'Rg4! After ...Ra1 Kd7 Rd1+ Ke6 Re1+ Kd6 Rd1+ Ke5 Re1+ Re4 the checks end and the pawn queens.',
          failure:
            'Remember the bridge: the rook must reach the fourth rank before the king comes out.',
        },
      },
      {
        title: 'Philidor: the third-rank defence',
        text:
          'The **Philidor position** is the mirror image: the defender holds a draw against rook and pawn. Keep the ' +
          'rook on your **third rank** (the sixth from White’s side) so the enemy king cannot advance. The moment the ' +
          'pawn steps forward to take that rank away, swing the rook *behind* the king and check from a distance.\n\n' +
          'White has just played e5. Now the pawn no longer shields the king from behind.',
        fen: '4k3/R7/1r6/3KP3/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['b6b1', 'b1d1:blue'],
        task: {
          prompt: 'Black to move: switch to checking from behind.',
          moves: ['Rb1', 'Rb2', 'Rb3'],
          hint: 'Take the rook as far down the b-file as you can.',
          success:
            'Rb1! Now Kd6 Rd1+ Ke6 Re1 and the king has no shelter from the checks. A textbook draw.',
          failure:
            'The pawn took away your third rank; the rook must go behind the king now — down the b-file.',
        },
      },
      {
        title: 'Summary',
        text:
          '- Rook **behind** passed pawns.\n' +
          '- Rook to the **seventh** when the file is open.\n' +
          '- Winning with an extra pawn: reach **Lucena** — king in front, pawn on the seventh, then the bridge.\n' +
          '- Defending: reach **Philidor** — king in front of the pawn, rook on the third rank, then checks from behind.\n\n' +
          'Both positions can be practised against the engine in the Drills section.',
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
    summary: 'In the endgame the king is a fighting piece. Centralise it, and know the only moves.',
    minutes: 7,
    steps: [
      {
        title: 'Centralise the king',
        text:
          'Once the queens are off, the king stops hiding. A king in the centre attacks pawns, supports its own ' +
          'passed pawns and keeps the enemy king out. The first move of most endgames is simply a king move towards ' +
          'the centre.\n\nWhite is a pawn up. Before pushing anything, bring the king in.',
        fen: '6k1/pp3ppp/2p5/8/3P4/2P5/PP3PPP/6K1 w - - 0 1',
        task: {
          prompt: 'White to move: activate the king.',
          moves: ['Kf1'],
          hint: 'The king heads for e2, d3 and the centre.',
          success: 'Kf1, then Ke2–d3–c4. With the king centralised, the extra pawn will win.',
          failure:
            'Pawn moves can wait. The king is the piece that needs to get into the game first.',
        },
      },
      {
        title: 'Only moves: outflanking',
        text:
          'King and pawn against king is won or drawn by *one* king move. The idea is **outflanking**: step ' +
          'diagonally past the enemy king so it must give way, rather than pushing the pawn too early.\n\nHere White ' +
          'wins with either diagonal king move (or even d4), but Kd4?? would let Black take the opposition and draw.',
        fen: '8/3k4/8/3K4/8/3P4/8/8 w - - 0 1',
        shapes: ['d5c5', 'd5e5', 'd5d4:red'],
        task: {
          prompt: 'White to move: keep the win.',
          moves: ['Kc5', 'Ke5', 'd4'],
          hint: 'Do not step straight back. Go past the black king.',
          success:
            'The white king outflanks and the pawn will be escorted home. Kd4 instead would be a draw.',
          failure:
            'That throws away the win — Black takes the opposition. Outflank with a diagonal king move.',
        },
      },
      {
        title: 'Only moves: the key square',
        text:
          'The pawn is on d5 and the black king on d8. The pawn must **not** move yet: d6? Kd7 and the position is ' +
          'a dead draw. Only one white king move wins.',
        fen: '3k4/8/4K3/3P4/8/8/8/8 w - - 0 1',
        task: {
          prompt: 'White to move: find the only winning move.',
          moves: ['Kd6'],
          hint: 'Take the opposition with the king; the pawn waits.',
          success:
            'Kd6! Now ...Kc8 Ke7 or ...Ke8 Kc7 and the pawn walks through. d6 or Kf7 would only draw.',
          failure: 'Only Kd6 wins. Pushing the pawn or stepping aside lets Black hold.',
        },
      },
      {
        title: 'Only moves: don’t let the king in',
        text:
          'Same idea from a different angle. White’s king on c5 and pawn on d4: the winning plan is to reach d5 with ' +
          'the king *before* the pawn advances.',
        fen: '8/3k4/8/2K5/3P4/8/8/8 w - - 0 1',
        task: {
          prompt: 'White to move: find the only winning move.',
          moves: ['Kd5'],
          hint: 'Which king move takes the opposition?',
          success:
            'Kd5! Opposition. Black must step aside and the king outflanks: ...Ke7 Kc6 or ...Kc7 Ke6.',
          failure:
            'That draws. Kd5 is the only move: it takes the opposition and keeps the pawn behind the king.',
        },
      },
      {
        title: 'Habits',
        text:
          '- Trade queens when your king is safe and your structure is better: the king becomes a strong piece.\n' +
          '- In pawn endings, count and calculate — every move can be the only move.\n' +
          '- Use the king to attack weak pawns while the enemy king is tied down elsewhere.\n\n' +
          'Practise the king-and-pawn drills to make these reflexes automatic.',
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
          'A **repertoire** is your prepared answer to whatever the opponent plays: one system with White, one ' +
          'defence against 1. e4 and one against 1. d4. That is enough for years.\n\nChoose openings that fit how you ' +
          'like to play — solid and structural, or open and tactical — and stick with them long enough to learn from ' +
          'your own games. The **Openings** section of this site trains complete repertoires move by move.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      {
        title: 'With White: 1. e4',
        text:
          'After **1. e4 e5 2. Nf3 Nc6** you must decide where the bishop goes. **Bc4** (Italian) targets f7 and leads ' +
          'to natural play; **Bb5** (Ruy Lopez) pressures the e5 pawn indirectly and is the choice of most masters. ' +
          'Both are excellent — play the one you enjoy.',
        fen: AFTER_E4_E5_NF3_NC6,
        shapes: ['f1c4', 'f1b5:blue'],
        task: {
          prompt: 'Develop the bishop the way your repertoire says.',
          moves: ['Bc4', 'Bb5'],
          hint: 'The king’s bishop comes out to c4 or b5.',
          success:
            'Either move is sound. Italian: quick development, then c3 and d3. Ruy Lopez: pressure on e5 and a long fight for the centre.',
          failure: 'Playable, but not the repertoire move. Develop the king’s bishop to c4 or b5.',
        },
      },
      {
        title: 'With White: 1. d4',
        text:
          'After **1. d4 d5** the main choices are **2. c4** (the Queen’s Gambit — the most principled fight for the ' +
          'centre), **2. Nf3** (flexible) and **2. Bf4** (the London System — a setup you can play against everything).',
        fen: AFTER_D4_D5,
        shapes: ['c2c4', 'c1f4:blue', 'g1f3:yellow'],
        task: {
          prompt: 'Play a repertoire move.',
          moves: ['c4', 'Bf4', 'Nf3'],
          hint: 'Queen’s Gambit, London or Nf3.',
          success:
            'Good. Whichever you choose, learn the *plans* — where the pieces go and which pawn breaks matter.',
          failure: 'That is not one of the main repertoire moves. Try c4, Bf4 or Nf3.',
        },
      },
      {
        title: 'With Black',
        text:
          'Against **1. e4** every serious defence is fine at club level: **1...e5** (classical), **1...c5** (Sicilian, ' +
          'sharp), **1...e6** (French, solid), **1...c6** (Caro-Kann, solid) or **1...d5** (Scandinavian, simple). ' +
          'Pick one and learn its typical middlegames.',
        fen: AFTER_E4,
        orientation: 'black',
        task: {
          prompt: 'Black to move: answer 1. e4 with your defence.',
          moves: ['e5', 'c5', 'e6', 'c6', 'd5'],
          hint: 'Any of the main defences.',
          success:
            'A sound choice. Now go and learn the first eight to ten moves of your main lines.',
          failure:
            'Playable, but choose one of the mainstream defences to build on: e5, c5, e6, c6 or d5.',
        },
      },
      {
        title: 'How to study openings',
        text:
          '1. **Plans before moves.** Know where the pieces belong and which pawn break you are aiming for.\n' +
          '2. **Short lines.** Ten moves deep is plenty; below master level games leave theory early.\n' +
          '3. **Spaced repetition.** Review lines just before you would forget them — the Openings trainer schedules this for you.\n' +
          '4. **Check your games.** After every game, find the first move where you left your repertoire and look up what you should have played.\n' +
          '5. **Expand slowly.** Add a line only when a real game shows you need it.',
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
    minutes: 8,
    steps: [
      {
        title: 'Space and pawn chains',
        text:
          '**Space** is the territory your pawns control. More space means more room for your pieces and less for ' +
          'your opponent’s — but a big pawn centre also has a base that can be attacked.\n\nA **pawn break** is a pawn ' +
          'move that challenges the enemy pawn chain: it opens files and diagonals. Most middlegame plans are ' +
          'built around one pawn break.',
        fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
        shapes: ['e5:red', 'd4:red', 'c7c5'],
      },
      {
        title: 'Attack the base of the chain',
        text:
          'In the French Advance White’s pawns on d4 and e5 cramp Black. The chain’s **base** is d4, so Black’s ' +
          'thematic break is **...c5**, attacking it. Play it at once.',
        fen: FRENCH_ADVANCE,
        orientation: 'black',
        task: {
          prompt: 'Black to move: play the thematic pawn break.',
          moves: ['c5'],
          hint: 'Which pawn attacks the base of White’s chain?',
          success:
            'c5! Black attacks d4, gets play on the c-file and later ...f6 hits the front of the chain.',
          failure: 'That does not challenge the centre. Hit the base of the pawn chain with ...c5.',
        },
      },
      {
        title: 'Open the centre when you are better developed',
        text:
          'After **1. e4 e5 2. Nf3 Nc6 3. Bc4 Be7** Black has chosen a passive bishop square. When you are ahead in ' +
          'development, open the position before the opponent catches up.',
        fen: ITALIAN_PASSIVE,
        task: {
          prompt: 'White to move: open the centre.',
          moves: ['d4', 'O-O', 'c3'],
          hint: 'The central break is d4.',
          success:
            'd4! exd4 Nxd4 and White’s pieces are more active. (Castling or c3 first is also fine.)',
          failure: 'Not the most purposeful. Strike in the centre with d4 while Black is passive.',
        },
      },
      {
        title: 'The King’s Indian break: ...f5',
        text:
          'In the King’s Indian the centre is locked (d5 against e5). Black’s whole plan is the pawn break **...f5**, ' +
          'prepared by moving the f6-knight away. Here everything is ready: the knight went to d7, the other to e7.',
        fen: KID_MAINLINE,
        orientation: 'black',
        shapes: ['f7f5', 'e4:red'],
        task: {
          prompt: 'Black to move: play the thematic break.',
          moves: ['f5'],
          hint: 'The f-pawn strikes at e4.',
          success:
            'f5! Black opens the f-file and starts the kingside attack; White will play on the queenside with c5.',
          failure: 'The King’s Indian lives on ...f5. Everything was prepared for it — play it.',
        },
      },
      {
        title: 'Timing a break',
        text:
          'Rules of thumb:\n\n' +
          '- Break in the centre when you are **better developed**; keep it closed when you are behind.\n' +
          '- Attack a pawn chain at its **base**, or at the front if the base cannot be reached.\n' +
          '- With **more space**, avoid trades and prepare your break; with less space, trade pieces and break early.\n' +
          '- Before every break, count what happens on the files and diagonals that will open — for both sides.',
        fen: KID_MAINLINE,
      },
    ],
    practiceThemes: ['middlegame'],
  },
];
