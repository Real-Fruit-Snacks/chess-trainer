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
const KARPOV_RD5 = fenAfter(
  `${KARPOV} 14. h5 Nxh5 15. g4 Nf6 16. Nde2 Qa5 17. Bh6 Bxh6 18. Qxh6 Rfc8 19. Rd3 R4c5 20. g5 Rxg5`,
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
const RETI_2 = fenAfter(`${RETI} 9. Qd8+ Kxd8`);
const RETI_3 = fenAfter(`${RETI} 9. Qd8+ Kxd8 10. Bg5+ Kc7`);
const ELIMINATION = '3r2k1/pp3ppp/1q6/8/4b3/5N2/PPP1QPPP/3R2K1 w - - 0 1';
const ELIMINATION_2 = fenAfter('1. Rxd8+ Qxd8', ELIMINATION);
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
      'A bishop is only as good as the pawns around it. Trade the bad one, fix the enemy pawns on the wrong colour, and win the endgame with the good one.',
    minutes: 9,
    steps: [
      {
        title: 'Which bishop is bad?',
        text:
          'A bishop is **bad** when its own pawns stand on squares of its colour: they block its diagonals and ' +
          'it is reduced to defending them. It is **good** when the pawns stand on the other colour, leaving the ' +
          'diagonals open and the enemy pawns as targets.\n\n' +
          'The French Defence is the classic case. Black’s pawns on d5 and e6 are light squares, exactly the ' +
          'colour of the c8 bishop. Black has spent two moves (...b6 and ...Qd7) preparing to solve the problem ' +
          'the simplest way: **trade it**.',
        fen: FRENCH_BA6,
        orientation: 'black',
        shapes: ['c8a6', 'd5:red', 'e6:red', 'd3:blue'],
        task: {
          prompt: 'Black to move: exchange the bad bishop.',
          moves: ['Ba6'],
          reply: 'Bxa6',
          hint: 'Offer the bishop for White’s good one.',
          success:
            'Ba6! Bxa6 Nxa6 and the bad bishop is gone while White’s good one — the piece that would have attacked h7 — has left the board. (...Qd7 prepared it: with the queen on d7 there is no Qa4+ against the knight that recaptures on a6.)',
          failure:
            'Playable, but the point of ...b6 and ...Qd7 was to play Ba6 and trade the bishop that the pawns on d5 and e6 lock in.',
        },
      },
      {
        title: 'The same bishops, opposite fates',
        text:
          'Both sides have a light-squared bishop and five pawns. White’s pawns stand on **dark** squares: the bishop ' +
          'on c2 is free and the black pawns on b5, f5, g6 and h5 are all targets. Black’s pawns stand on **light** ' +
          'squares: the bishop on d7 is a big pawn, chained to their defence.\n\n' +
          'The plan for White has two parts: the king goes to the dark squares d4 and c5, which the bad bishop can ' +
          'never cover, and the bishop attacks from the other side.',
        fen: BISHOPS,
        shapes: ['b5:red', 'f5:red', 'g6:red', 'h5:red', 'f3e3', 'e3d4', 'd4c5'],
      },
      {
        title: 'Race for the centre',
        text:
          'Only one move keeps the win. If the black king reaches **d5** first (...Ke6-d5), the white king is shut out ' +
          'and the position is a draw. Every tempo counts.',
        fen: BISHOPS,
        task: {
          prompt: 'White to move: the king must reach d4 before Black’s reaches d5.',
          moves: ['Ke3'],
          hint: 'A king move, and the most direct one.',
          success:
            'Ke3! Now Kd4 comes next: ...Be6 Kd4 Ba2 Bd1 Bb1 Bb3+ Ke7 Kc5 and the king walks to b6 to collect the queenside. A bishop move first (Bd3? Ke6! Ke3 Kd5) lets Black in.',
          failure:
            'Too slow: ...Ke6! and ...Kd5 shuts the white king out. Ke3 first, heading straight for d4.',
        },
      },
      {
        title: 'Attack from the other side',
        text:
          'Black kept the king on d6, so the front door is closed. The good bishop has a second route: from b3 it goes ' +
          'to **f7**, attacking g6 from behind, and the bad bishop cannot defend g6 and the queenside at the same time.',
        fen: BISHOPS_2,
        shapes: ['c2b3', 'b3f7:blue', 'g6:red'],
        task: {
          prompt: 'White to move: start the bishop manoeuvre.',
          moves: ['Bb3'],
          hint: 'The diagonal a2–g8 leads behind the black pawns.',
          success:
            'Bb3! Bc6 Bf7 and g6 falls: ...Bf3 Bxg6 and the h-pawn goes next. Against Bd3? Black holds with ...Bc8, because a bishop on d3 can never get behind the pawns.',
          failure:
            'Not this. The bishop belongs on the a2–g8 diagonal: Bb3 and Bf7 hits g6 from behind, where the black bishop cannot defend it.',
        },
      },
      {
        title: 'Rules for bishops',
        text:
          '- Put your **pawns on the opposite colour** to your bishop — especially the central and fixed ones.\n' +
          '- Fix the **enemy pawns on the colour of their bishop** (...h5 against g4 and h4, for instance), then attack them.\n' +
          '- **Trade a bad bishop** for a good one whenever you can; keep a good bishop against a bad one, even at the cost of a pawn.\n' +
          '- In the endgame, the good bishop plus an **active king** on the squares the bad bishop cannot cover is usually a win.',
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
      'When the kings live on opposite wings, pawns become the attackers. Karpov shows how to open the file and finish; the Dragon shows how to slow the storm.',
    minutes: 11,
    steps: [
      {
        title: 'Why the pawns attack',
        text:
          'With both kings on the same wing, advancing the pawns in front of your king weakens it. When the kings ' +
          'stand on **opposite wings**, the pawns in front of your king are far away from the fight and the pawns on ' +
          'the other wing are free to charge: **h4-h5**, **g4-g5**, and each pawn that is exchanged opens a file ' +
          'towards the enemy king.\n\n' +
          'The rules of these races:\n\n' +
          '- **Speed**: every tempo counts; do not stop to defend small things.\n' +
          '- **Open a file**, then put a rook and the queen on it.\n' +
          '- **Trade the defender** — usually the fianchettoed bishop.\n' +
          '- The defender needs counterplay of the same kind on the other wing, or must **slow the storm**.\n\n' +
          'This is the Sicilian Dragon with the Yugoslav Attack: White has just played 12.h4 and wants h5.',
        fen: YUGOSLAV,
        orientation: 'black',
        shapes: ['h4h5:red', 'h5g6:red', 'c8c3:blue'],
      },
      {
        title: 'Slow the storm',
        text:
          'Black cannot stop the attack, but can make it cost time. The pawn on h5 stops h4-h5 and forces White ' +
          'to prepare g2-g4 first — a whole extra tempo for Black’s counterplay on the c-file.',
        fen: YUGOSLAV,
        orientation: 'black',
        task: {
          prompt: 'Black to move: the pawn move that slows White down.',
          moves: ['h5'],
          hint: 'Meet a pawn storm with a pawn.',
          success:
            'h5! Now White needs g4 (after preparation) to open lines, and Black gets time for ...Nc4, ...Qa5 and ...Rc8 pressure on c3. Weakening g5 is a small price.',
          failure:
            'A normal move, but the thematic answer to h4 is ...h5, which costs White a tempo before it can open the h-file.',
        },
      },
      {
        title: 'Karpov – Korchnoi, 1974',
        text:
          'Korchnoi chose a different plan: 12...Nc4 13.Bxc4 Rxc4, trading the bishop that eyes f7 and opening ' +
          'the c-file. It is a reasonable idea — but it does nothing to slow White on the kingside, and Karpov ' +
          'plays the attack at full speed.',
        fen: KARPOV_H5,
        shapes: ['h4h5', 'h5g6:red'],
        task: {
          prompt: 'White to move: open the file.',
          moves: ['h5'],
          reply: 'Nxh5',
          hint: 'The pawn that has already advanced keeps going.',
          success:
            'h5! Nxh5 g4 Nf6 and the h-file is open for the queen and rook. A pawn for an open file next to the king is always a good deal.',
          failure:
            'Too slow. When the kings are on opposite wings, the pawn storm comes first: h5! opens the h-file immediately.',
        },
      },
      {
        title: 'Trade the defender',
        text:
          'After 15.g4 Nf6 16.Nde2 Qa5 Black is finally getting counterplay. The bishop on g7 is the best defender ' +
          'of the black king — it covers h6, h8 and the long diagonal.',
        fen: KARPOV_BH6,
        shapes: ['e3h6', 'g7:red'],
        task: {
          prompt: 'White to move: remove the defender.',
          moves: ['Bh6'],
          reply: 'Bxh6',
          hint: 'Offer a trade the bishop on g7 cannot refuse.',
          success:
            'Bh6! Bxh6 Qxh6 and the queen sits next to the black king with the h-file about to open. Without the g7 bishop the dark squares around the king belong to White.',
          failure:
            'The fianchettoed bishop is the defender that must go: Bh6! Bxh6 Qxh6 brings the queen to h6 with tempo.',
        },
      },
      {
        title: 'The decisive deflection',
        text:
          '17.Bh6 Bxh6 18.Qxh6 Rfc8 19.Rd3 R4c5 20.g5 Rxg5. Black has grabbed a pawn and covers h5 with the ' +
          'rook, so Qxh7 is not yet possible — as long as that rook stays on the g-file.',
        fen: KARPOV_RD5,
        shapes: ['g5:red', 'd3d5:blue'],
        task: {
          prompt: 'White to move: deflect the defender of the h-file.',
          moves: ['Rd5'],
          reply: 'Rxd5',
          hint: 'Attack the rook on g5 with a piece it must take.',
          success:
            'Rd5!! The rook must leave the g-file (Rxd5 Nxd5), and after ...Re8 Nef4 Bc6 e5! the queen returns to h7 with decisive effect. 21.Nd5? instead is met by ...Rxd5 exd5 Qxa2.',
          failure:
            'The point is the rook on g5: it guards h5 and the h-file. Rd5! attacks it and forces it away — a deflection.',
        },
      },
      {
        title: 'The finish',
        text:
          '21.Rd5 Rxd5 22.Nxd5 Re8 23.Nef4 Bc6 24.e5 Bxd5 25.exf6 exf6 26.Qxh7+ Kf8. The black king is caught ' +
          'in the open; find the check that decides.',
        fen: KARPOV_END,
        task: {
          prompt: 'White to move: the winning check.',
          moves: ['Qh8+'],
          hint: 'Drive the king towards your knight.',
          success:
            'Qh8+! Ke7 Nxd5+ Qxd5 Re1+ and Black is lost — Korchnoi resigned. The whole game took White 27 moves and every one of them served the attack.',
          failure:
            'Only Qh8+ wins: after ...Ke7 comes Nxd5+ with check, and Re1+ finishes. Other checks let the king escape.',
        },
      },
      {
        title: 'The recipe',
        text:
          '**Attacker**: pawns first (h4-h5, g4-g5), open a file, trade the fianchettoed bishop, bring the queen and a rook to the file. Count tempi, not material.\n\n' +
          '**Defender**: slow the storm (...h5 against h4), start your own attack on the other wing at once, and look for the exchange sacrifice on c3 (or c6) that wrecks the attacker’s pawn cover. The side that waits loses.',
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
      'A pawn up is a win only if you know the steps: trade pieces, create a passed pawn — ideally an outside one — and use the king.',
    minutes: 9,
    steps: [
      {
        title: 'The steps',
        text:
          'Winning a pawn is the easy part. Converting it follows a routine:\n\n' +
          '1. **Trade pieces, not pawns.** Every piece exchange makes the extra pawn count for more; every pawn exchange makes a draw more likely.\n' +
          '2. **Create a passed pawn**, preferably an **outside** one, far from the other pawns.\n' +
          '3. **Use the king** — in the endgame it is a fighting piece.\n' +
          '4. **Do not hurry.** Improve every piece first; the pawn is not running away.\n' +
          '5. Make the opponent defend **two weaknesses**: the passed pawn and something on the other wing.\n\n' +
          'White is a pawn up with rooks on. Step one is available right now.',
        fen: TRADE_ROOKS,
        shapes: ['d1d8:green', 'b2:blue', 'a2:blue'],
      },
      {
        title: 'Trade into the pawn ending',
        text:
          'Before trading the last pieces, check the resulting pawn ending: White’s queenside majority (a- and b-pawn against ' +
          'the a-pawn) will make a passed pawn, and the black king cannot watch both wings.',
        fen: TRADE_ROOKS,
        task: {
          prompt: 'White to move: simplify.',
          moves: ['Rxd8+'],
          reply: 'Kxd8',
          hint: 'Exchange the rooks with check.',
          success:
            'Rxd8+! Kxd8 Ke2 — the king heads for d4 while b4 and a4 create the passed pawn. With the rooks on, Black’s rook would reach the second rank and the win would be far harder.',
          failure:
            'With rooks on, Black has counterplay on the second rank. Rxd8+ Kxd8 and the pawn ending is a textbook win: king to the centre, then the queenside majority.',
        },
      },
      {
        title: 'The outside passed pawn',
        text:
          'Material is level here, yet White wins. The a-pawn is an **outside passed pawn**: it costs the black king ' +
          'four moves to catch it, and while the king is away on a7 the white king eats c5 and walks into the kingside. ' +
          'A passed pawn far from the other pawns is a decoy, not a runner.\n\n' +
          '1.a5 g5 2.h4 Kd5 3.a6 Kc6 4.a7 Kb7 5.Kc4 Ka8 6.Kxc5 Kxa7 7.Kd6 and the kingside pawns fall.',
        fen: OUTSIDE_PASSER,
        shapes: ['a4a5', 'a5a7', 'd3c4:blue', 'c5:red'],
      },
      {
        title: 'Trade the queens',
        text:
          'Queens are the hardest pieces to convert against: they give checks forever. White is a pawn up with a ' +
          'queenside majority. Keeping the queens (Qb4?) leads nowhere; there is a cleaner path.',
        fen: TRADE_QUEENS,
        task: {
          prompt: 'White to move: simplify into a won ending.',
          moves: ['Qxe6'],
          hint: 'Exchange the queens even though it doubles Black’s pawns — especially because it does.',
          success:
            'Qxe6! fxe6 Kf1 Kf7 Ke2 Kf6 Kd3 and the white king reaches the centre first, the queenside majority produces a passed pawn, and the doubled e-pawns cannot help. A draw with queens on became a win without them.',
          failure:
            'With the queens on the board Black checks forever. Qxe6! fxe6 leaves a pawn ending where the king and the queenside majority decide.',
        },
      },
      {
        title: 'Checklist',
        text:
          '- Ahead in material? **Trade pieces**, and check the resulting ending before the last exchange.\n' +
          '- Make a **passed pawn**, and prefer the **outside** one — it wins by decoying the king.\n' +
          '- **Centralise the king** before pushing anything.\n' +
          '- Ask what the opponent’s counterplay is and remove it first: **do not hurry**.\n\n' +
          'Play the drills “Convert an extra pawn” against the engine to build the habit.',
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
      'Before calculating anything, list the forcing moves — checks, captures, threats — then eliminate them one by one.',
    minutes: 9,
    steps: [
      {
        title: 'List first, calculate second',
        text:
          'Strong players do not calculate the first move they see. They **list the candidates** and only then ' +
          'calculate — and the list starts with the forcing moves, because they limit the opponent’s replies:\n\n' +
          '1. **Checks**\n' +
          '2. **Captures**\n' +
          '3. **Threats** (mate threats, attacks on undefended pieces)\n\n' +
          'Then **eliminate**: for each candidate find the opponent’s best reply. If it refutes the move, cross it off ' +
          'and move on. Whatever survives is your move — and quite often a candidate you would never have looked at ' +
          'seriously turns out to be the only one that works.\n\n' +
          'Réti – Tartakower, Vienna 1910. Black has just taken a knight on e4. Which checks does White have?',
        fen: RETI_1,
        shapes: ['d3d8:red', 'd1d8:blue'],
      },
      {
        title: 'Checks first',
        text:
          'Qxe4 wins the knight back but leaves an equal game. The list of checks has exactly one entry — and it ' +
          'is a queen sacrifice, which is why most players cross it off without calculating. Do not.',
        fen: RETI_1,
        task: {
          prompt: 'White to move: the only check on the board.',
          moves: ['Qd8+'],
          reply: 'Kxd8',
          hint: 'Give the queen away with check.',
          success:
            'Qd8+!! Kxd8 and the discovered check on the d-file decides: the bishop moves with double check.',
          failure:
            'You never even looked at the check. Qd8+! Kxd8 and now a double check ends the game.',
        },
      },
      {
        title: 'Double check',
        text: 'The king is on d8, the rook on d1, and the bishop on d2 stands between them.',
        fen: RETI_2,
        task: {
          prompt: 'White to move: the double check.',
          moves: ['Bg5+'],
          reply: 'Kc7',
          hint: 'Move the bishop with check so that the rook checks too.',
          success:
            'Bg5+! Double check: the king must move. After ...Ke8 Rd8 is mate immediately; Tartakower chose ...Kc7.',
          failure:
            'Bg5+ gives check with the bishop and uncovers the rook — a double check the king cannot escape.',
        },
      },
      {
        title: 'Mate',
        text: 'One more check and it is over.',
        fen: RETI_3,
        task: {
          prompt: 'White to move: mate in one.',
          moves: ['Bd8#'],
          acceptAnyMate: true,
          hint: 'Back to the square the queen died on.',
          success:
            'Bd8 mate. Three checks in a row — none of them needed more than a moment once they were on the list.',
          failure: 'Bd8 is mate: the bishop covers c7 and e7 with the rook behind it.',
        },
      },
      {
        title: 'Elimination among captures',
        text:
          'Two captures are available: Qxe4 and Rxd8+. Both win material. The order decides everything: after ' +
          'Qxe4?? Rxd1+ Black wins the rook with check, because the queen on e4 no longer defends d1. Eliminate ' +
          'the move whose reply refutes it.',
        fen: ELIMINATION,
        shapes: ['d1d8:green', 'e2e4:red'],
        task: {
          prompt: 'White to move: the capture that survives elimination.',
          moves: ['Rxd8+'],
          reply: 'Qxd8',
          hint: 'The capture with check comes first.',
          success: 'Rxd8+! Qxd8 and now the bishop on e4 is simply hanging.',
          failure:
            'Qxe4?? Rxd1+ and White has lost a rook for a bishop, because the queen no longer guards d1. Check the opponent’s best reply before you capture: Rxd8+ first.',
        },
      },
      {
        title: 'Collect',
        text: 'Now the second capture is safe.',
        fen: ELIMINATION_2,
        task: {
          prompt: 'White to move.',
          moves: ['Qxe4'],
          hint: 'Take the piece.',
          success: 'Qxe4 — a clean extra piece. Checks and captures in the right order.',
          failure: 'The bishop on e4 is free: Qxe4.',
        },
      },
      {
        title: 'The quiet move',
        text:
          'Levitsky – Marshall, Breslau 1912. Black has plenty of forcing moves — Rxh2, Nf3+, Ne2+ — and none of ' +
          'them works. When every forcing move fails, look at the **threats**: a move that attacks so much that the ' +
          'opponent cannot meet everything. Marshall found what has been called the most beautiful move ever played.',
        fen: MARSHALL,
        orientation: 'black',
        shapes: ['c3g3:green', 'h2:red', 'e2:red'],
        task: {
          prompt: 'Black to move: the quiet move that wins.',
          moves: ['Qg3'],
          hint: 'Put the queen where three pawns and a queen can take it.',
          success:
            'Qg3!! The queen can be captured three ways and every one loses: hxg3 Ne2 mate, fxg3 Ne2+ Kh1 Rxf1 mate, Qxg3 Ne2+ Kh1 Nxg3+ and Black is a piece up. Legend says the spectators showered the board with gold coins.',
          failure:
            'A forcing move that does not work. When the checks and captures fail, list the threats: Qg3!! attacks h2 and prepares Ne2+ at the same time.',
        },
      },
      {
        title: 'The habit',
        text:
          '- Before calculating, **write the list**: checks, captures, threats — for both sides.\n' +
          '- Calculate the **most forcing** candidate first; it is quickest to eliminate.\n' +
          '- For every candidate, find the opponent’s **best reply**, not the one you hope for.\n' +
          '- Keep an eye on **quiet moves** when the forcing ones fail.\n\n' +
          'Every puzzle in the trainer is practice for this: say the list out loud before you touch a piece.',
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
    minutes: 10,
    steps: [
      {
        title: 'Structure decides the plan',
        text:
          'When you do not know what to do, look at the pawns. Every structure comes with a plan for each side, ' +
          'and the pieces follow the plan.\n\n' +
          '**Hanging pawns** are two pawns side by side on the c- and d-files with no neighbours to protect them — ' +
          'here Black’s c5 and d5. They control the centre, give space and can advance with **...d5-d4** or **...c5-c4** ' +
          'to open lines. But they can be attacked from the front and the side, and once one of them advances the ' +
          'other becomes weak.\n\n' +
          '- Owner: keep pieces active, and **advance at the right moment** — before the pawns become targets.\n' +
          '- Opponent: **blockade** the squares in front, pile up on the pawns, and provoke a premature advance.',
        fen: HANGING_WHITE,
        shapes: ['c5:red', 'd5:red', 'c4:blue', 'd4:blue'],
      },
      {
        title: 'Against the hanging pawns',
        text: 'White’s turn. Start the pressure: a piece to attack c5, and the rook belongs on the c-file.',
        fen: HANGING_WHITE,
        task: {
          prompt: 'White to move: put pressure on the pawns.',
          moves: ['Na4', 'Rc1'],
          hint: 'The knight can attack c5 from the rim; the rook wants the c-file.',
          success:
            'Na4 (or Rc1 first) — c5 is attacked and Black must either defend passively or advance. Both continue the plan: Rc1, Qe2 and Bb5 add to the pressure.',
          failure:
            'Playable, but the plan against hanging pawns is pressure: Na4 hits c5 and Rc1 takes the c-file.',
        },
      },
      {
        title: 'With the hanging pawns',
        text:
          'White played 12.Na4, attacking c5. The passive answer is ...Qe7 or ...Nd7. The active one uses what the ' +
          'pawns are for: advance while the pieces are behind them and the white knight on a4 is offside.',
        fen: HANGING_BLACK,
        orientation: 'black',
        shapes: ['d5d4', 'a4:red'],
        task: {
          prompt: 'Black to move: use the pawns.',
          moves: ['d4'],
          hint: 'Push the pawn the knight cannot take.',
          success:
            'd4! The pawn gains space, hits e3 and opens the long diagonal for the bishop on b7 — while the knight on a4 is far from the kingside. Hanging pawns are strong when they move at the right time.',
          failure:
            'Defending passively is what White wants. ...d4! turns the pawns into a battering ram while White’s knight is offside.',
        },
      },
      {
        title: 'The Maróczy Bind',
        text:
          'Pawns on **c4 and e4** against a Sicilian pawn on d6: the Maróczy Bind. White has a grip on **d5** and **b5**, ' +
          'so Black’s freeing breaks (**...b5** and **...d5**) need long preparation, and Black often settles for ' +
          '**...f5** or a knight on c5.\n\n' +
          '- White: **Nd5** at the right moment, or the **b2-b4** lever to drive the knight off c5, then push on the queenside.\n' +
          '- Black: keep pieces active, exchange when possible, and prepare one break with everything.',
        fen: MAROCZY_WHITE,
        shapes: ['c4:blue', 'e4:blue', 'd5:green', 'b5:green', 'c5:red'],
      },
      {
        title: 'Prepare the lever',
        text: 'The knight on c5 is Black’s best piece. White wants b3-b4 to drive it away; prepare it with a rook.',
        fen: MAROCZY_WHITE,
        task: {
          prompt: 'White to move: prepare b2-b4.',
          moves: ['Rab1', 'Rad1', 'Rfd1'],
          hint: 'A rook move — the one that stands behind the b-pawn is the most direct.',
          success:
            'Rab1! prepares b4, and after the knight leaves c5 the c4-c5 push gains space. Centralising a rook first (Rad1 or Rfd1) is a fine alternative — the point is that White does not hurry.',
          failure:
            'The plan is the b4 lever: Rab1 prepares it. Direct Nd5 lets Black trade pieces, and f4? weakens e4.',
        },
      },
      {
        title: 'Stop the lever',
        text:
          '15.Rab1 Qb6 16.Rfc1. Black has spotted the plan. The queen goes to the square where it stops b4 and ' +
          'pins the knight on c3 against the queen.',
        fen: MAROCZY_BLACK,
        orientation: 'black',
        shapes: ['b6b4', 'b3b4:red'],
        task: {
          prompt: 'Black to move: prevent b2-b4.',
          moves: ['Qb4'],
          hint: 'Occupy the square the pawn wants.',
          success:
            'Qb4! Now b4 is impossible, the knight on c3 is pinned against the queen, and ...a4 comes next. Prophylaxis: see the plan, take the square.',
          failure:
            'White plays b4 next and the knight is driven away. ...Qb4! stops the lever and pins the knight.',
        },
      },
      {
        title: 'Reading a structure',
        text:
          'Ask three questions in any middlegame:\n\n' +
          '1. Which pawns are fixed, and what squares do they leave weak?\n' +
          '2. What is my **pawn break**, and what is the opponent’s?\n' +
          '3. Which piece is doing the least — and where is the square the structure gives it?\n\n' +
          'Hanging pawns: advance or be attacked. The Bind: levers and outposts, no hurry. Compare the isolated queen’s pawn and the Carlsbad structure from the earlier lessons.',
        fen: MAROCZY_BLACK,
        orientation: 'black',
      },
    ],
    practiceThemes: ['middlegame', 'advantage'],
  },
];
