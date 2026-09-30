import { fenAfter, type Lesson } from '../model';

// Attacking the fianchetto (positions from Lichess games, CC0 puzzle database).
const FIAN_STRUCTURE = fenAfter(
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. O-O-O',
);
const FIAN_TRADE = 'r2q1rk1/ppp1ppbp/6p1/3P4/2nB4/5R2/PP4PP/RN1Q2K1 w - - 0 15';
const FIAN_TRADE_2 = 'r3r1k1/1ppq1pbp/p2p2p1/3N4/2P1n3/1P1QP1P1/PB3PK1/R4R2 w - - 5 19';
const FIAN_DARK = 'r5k1/pbp2p1p/2q1rBp1/1p6/1P5Q/P2P1R2/5PPP/R5K1 w - - 6 21';
const FIAN_DARK_2 = fenAfter('Qxh7+ Kxh7', FIAN_DARK);
const FIAN_DARK_3 = fenAfter('Qxh7+ Kxh7 Rh3+ Kg8', FIAN_DARK);
const FIAN_HFILE = 'r1b2rk1/pp2qp1p/4p1p1/2np3P/3p4/6RQ/PPP1NPP1/1K4NR w - - 5 17';
const FIAN_QH6 = '2r2rk1/pp1n1p1p/1q2p1p1/3p3R/8/P2B1n1P/2PQNP2/6RK w - - 0 21';

// Defending the Greek gift (positions from Lichess games, CC0 puzzle database).
const GG_WORKS = 'r1bq1rk1/pp2nppp/2n1p3/2bpP3/8/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 4 9';
const GG_TAKE = 'rn1q1rk1/pb3ppB/1p2p3/3n4/1b1P4/2N2N2/PP1B1PPP/R2Q1RK1 b - - 0 11';
const GG_TAKE_2 = fenAfter('Kxh7 Ng5+', GG_TAKE);
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
const BE_WRONG = '7k/8/6K1/7P/8/3B4/8/8 b - - 0 1';

// Pawn endgames III.
const PE_SQUARE = '8/8/8/5k2/1P6/8/8/6K1 b - - 0 1';
const PE_KEY = '8/8/8/2k5/8/3K4/3P4/8 w - - 0 1';
const PE_OUTSIDE = '8/8/3k4/5p2/5P2/1P1K4/8/8 w - - 0 1';
const PE_TRIANGLE = '8/2k5/3p4/1K1P4/8/8/8/8 w - - 0 1';
const PE_BREAK = '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1';
const PE_RETI = '7K/8/k1P5/7p/8/8/8/8 w - - 0 1';

// Bishop and knight mate.
const BN_WRONG_CORNER = 'k7/8/2K5/4N3/5B2/8/8/8 w - - 0 1';
const BN_EDGE = '1k6/8/2K5/4N3/5B2/8/8/8 w - - 0 1';
const BN_MATE_A = 'k7/7B/NK6/8/8/8/8/8 w - - 0 1';
const BN_MATE_H = '7k/8/6KN/6B1/8/8/8/8 w - - 0 1';

// Queen vs rook.
const QR_START = '1k6/1r6/2K5/8/8/8/8/4Q3 w - - 0 1';
const QR_2 = fenAfter('Qe5+ Ka8', QR_START);
const QR_3 = fenAfter('Qe5+ Ka8 Qa1+ Kb8', QR_START);
const QR_SKEWER = '1k6/8/2K5/Q7/8/8/8/1r6 w - - 0 1';

export const intermediateLessons6: Lesson[] = [
  {
    id: 'attacking-the-fianchetto',
    title: 'Attacking the fianchetto',
    level: 'intermediate',
    category: 'Tactics',
    summary:
      'A fianchettoed king is solid until its bishop goes. How to trade or remove the g7-bishop, open the h-file, and use the dark squares f6 and h6 that are left behind.',
    minutes: 8,
    practiceThemes: ['kingsideAttack', 'sacrifice'],
    steps: [
      {
        title: 'The strong points and the weak ones',
        text:
          'A fianchetto (pawn on g6, bishop on g7) gives the king a wall of pawns and a bishop that guards the dark squares around it. It has two weak points:\n\n' +
          '- **The bishop itself.** Trade it — with Be3–h6, Nd5xf6 followed by Bxg7, or a direct Bxg7 — and the squares f6, h6 and g7 belong to you.\n' +
          '- **The h-file.** The pawn on g6 is a hook for h4–h5: after hxg6 the h-file opens and a rook or queen lands on h7 or h8.\n\n' +
          'The Sicilian Dragon set-up here shows the plan for White in its purest form: Bh6 to trade the bishop, h4–h5 to open the file.',
        fen: FIAN_STRUCTURE,
        shapes: ['e3h6', 'h2h4:blue', 'h4h5:blue', 'g7:red'],
      },
      {
        title: 'Take the bishop, then fork',
        text: 'The bishop on d4 and the queen on d1 both look at g7. Trade the defender first — the king has to recapture, and then a queen check on the long diagonal picks up the loose knight on c4.',
        fen: FIAN_TRADE,
        shapes: ['d4g7', 'c4:red'],
        task: {
          prompt: 'White to move: remove the defender.',
          moves: ['Bxg7'],
          reply: 'Kxg7',
          hint: 'Which piece guards the king’s dark squares?',
          success:
            'Bxg7 Kxg7 Qd4+ and the check on the long diagonal wins the knight on c4. Without the g7-bishop, every dark square near the king is a target.',
          failure: 'Trade the g7-bishop first: Bxg7 Kxg7 Qd4+ forks the king and the c4-knight.',
        },
      },
      {
        title: 'The same idea, one move deeper',
        text: 'Again a bishop on the long diagonal against the bishop on g7, again a queen ready to check on d4. This time the fork needs one more move — after ...f6 blocks the diagonal, f3 wins the knight on e4 anyway.',
        fen: FIAN_TRADE_2,
        shapes: ['b2g7', 'e4:red'],
        task: {
          prompt: 'White to move: win material.',
          moves: ['Bxg7'],
          reply: 'Kxg7',
          hint: 'Same recipe: trade the bishop, then check on the diagonal.',
          success:
            'Bxg7 Kxg7 Qd4+ f6 f3 and the knight on e4 has no square. The fianchetto bishop was the only thing holding the position together.',
          failure: 'Bxg7! Kxg7 Qd4+ f6 f3 wins the knight on e4.',
        },
      },
      {
        title: 'The dark squares after the bishop is gone',
        text: 'Here the fianchetto bishop has already been traded, and a white bishop sits on f6 — the square it used to guard. With the queen on h4 and a rook on f3 ready to swing to h3, the king on g8 is in a mating net. Find the sacrifice that starts it.',
        fen: FIAN_DARK,
        shapes: ['f6:red', 'h4h7', 'f3h3:blue'],
        task: {
          prompt: 'White to move: mate in three.',
          moves: ['Qxh7+'],
          reply: 'Kxh7',
          hint: 'The queen goes first; the rook follows on the h-file.',
          success: 'Qxh7+! Kxh7 Rh3+ Kg8 Rh8 mate — the bishop on f6 covers g7 and h8.',
          failure: 'Qxh7+! Kxh7 Rh3+ Kg8 Rh8#. The bishop on f6 takes away g7 and h8.',
        },
      },
      {
        title: 'Follow through',
        text: 'The queen is gone; the rook finishes the job.',
        fen: FIAN_DARK_2,
        shapes: ['f3h3'],
        task: {
          prompt: 'White to move.',
          moves: ['Rh3+'],
          reply: 'Kg8',
          hint: 'Check on the h-file.',
          success: 'Rh3+ Kg8 and now the rook comes to h8.',
          failure: 'Rh3+ is the only way: the king must go back to g8 and Rh8 is mate.',
        },
      },
      {
        title: 'The mate',
        text: 'Deliver the mate.',
        fen: FIAN_DARK_3,
        task: {
          prompt: 'White to move: mate in one.',
          moves: ['Rh8#'],
          acceptAnyMate: true,
          success:
            'Rh8 mate. Queen and rook against a fianchetto without its bishop: the pattern is Bf6 (or Qh6), then a sacrifice on h7 and a rook on the h-file.',
          failure: 'Rh8#: the bishop on f6 guards g7, so the king has no escape.',
        },
      },
      {
        title: 'Open the h-file',
        text: 'The pawn on h5 has done its job: the g6-pawn is the hook. Capture on g6 and the h-file opens with the queen already on h3 and the rook on g3 pointing at the king.',
        fen: FIAN_HFILE,
        shapes: ['h5g6', 'h3h8:blue'],
        task: {
          prompt: 'White to move: open the file.',
          moves: ['hxg6'],
          reply: 'fxg6',
          hint: 'Which capture opens the h-file?',
          success:
            'hxg6! fxg6 Rxg6+! hxg6 Qh8+ Kf7 Rh7+ and the king is chased to its death. Once the h-file is open, every piece joins with check.',
          failure:
            'hxg6! opens the h-file: after ...fxg6 Rxg6+ hxg6 Qh8+ Kf7 Rh7+ the attack is decisive.',
        },
      },
      {
        title: 'The queen on h6',
        text: 'A queen on h6 next to a fianchettoed king (pawn g6, no bishop on g7) threatens mate on g7 and h7 whenever another piece joins. Here the rook on h5 and the bishop on d3 are ready — put the queen in.',
        fen: FIAN_QH6,
        shapes: ['d2h6', 'h5h7:blue', 'd3g6:blue'],
        task: {
          prompt: 'White to move: bring the queen in.',
          moves: ['Qh6'],
          hint: 'The mating square is h6; the threat is Bxg6.',
          success:
            'Qh6! threatens Bxg6 and Qxh7 mate. After ...Nf6 Bxg6! fxg6 Rxg6+ the king’s cover is gone. Against a fianchetto, the queen on h6 is the goal of every plan.',
          failure:
            'Qh6! threatens Bxg6 followed by mate on h7. Nothing holds: ...Nf6 Bxg6! fxg6 Rxg6+.',
        },
      },
      {
        title: 'Checklist',
        text:
          '- **Trade the g7-bishop** (Bh6, Nd5xf6 and Bxg7, or Bxg7 directly) before anything else.\n' +
          '- **h4–h5** is the lever; hxg6 opens the file when your rook or queen can use it.\n' +
          '- **f6 and h6** are the squares to occupy once the bishop is gone: a bishop on f6 or a queen on h6 makes h7/h8 mating squares.\n' +
          '- Look for **sacrifices on g7 and h7** when a rook can reach the h-file with check.\n\n' +
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
      'Bxh7+ is the most common sacrifice in chess — and half the time it is unsound. When to take, when to decline, and the defences that make the attacker regret it.',
    minutes: 9,
    practiceThemes: ['defensiveMove', 'kingsideAttack'],
    steps: [
      {
        title: 'When it works',
        text:
          'The Greek gift: **Bxh7+ Kxh7 Ng5+** followed by **Qh5**. It works when the attacker has all three pieces ready, the pawn on e5 keeps the f6-knight away, and the king has no safe square: g6 is met by Qd3+ or h4–h5, g8 by Qh5 and mate on h7.\n\n' +
          'Here every condition is met. Play the sacrifice yourself before learning to defend against it.',
        fen: GG_WORKS,
        shapes: ['d3h7', 'f3g5:blue', 'd1h5:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Bxh7+'],
          reply: 'Kxh7',
          hint: 'The classic sacrifice on h7.',
          success:
            'Bxh7+! Kxh7 Ng5+ Kg8 Qh5 and mate on h7 cannot be stopped: ...Re8 Qxf7+ Kh8 Qh5+ Kg8 Qh7+ Kf8 Qh8+ Ke7 Qxg7 mate.',
          failure: 'Bxh7+! is decisive here: Kxh7 Ng5+ Kg8 Qh5 and mate follows on h7.',
        },
      },
      {
        title: 'Before accepting, count',
        text:
          'Three questions decide whether to take the bishop:\n\n' +
          '- **Can the knight reach g5 with check, and can the queen follow to h5?** If either is slow, the attack fails.\n' +
          '- **Do I have a defender?** A knight that can come to f6, a bishop or queen that can capture on g5, a rook that can lift to h6.\n' +
          '- **Where does my king go?** g8 needs a defence of h7; g6 needs the h-file and the b1–h7 diagonal to be safe; h6 usually loses.\n\n' +
          'In this position the sacrifice was unsound. Take the bishop — the knight on d5 covers f6 and e7, the bishop on b4 can return to e7, and the white queen is far away.',
        fen: GG_TAKE,
        orientation: 'black',
        shapes: ['h7:red', 'd5f6:blue', 'b4e7:blue'],
        task: {
          prompt: 'Black to move: accept the sacrifice.',
          moves: ['Kxh7'],
          reply: 'Ng5+',
          hint: 'The bishop is simply a piece — count the attackers.',
          success:
            'Kxh7 Ng5+ and now the king goes back: Kg8! (next step). White has no follow-up: Qh5 is met by ...Nf6, and the knight on g5 hangs to ...Bxc3 and ...Qxg5 ideas.',
          failure:
            'Take it: Kxh7. Declining leaves the bishop on h7 with tempo and a pawn down for nothing.',
        },
      },
      {
        title: 'Back to g8',
        text: 'After Ng5+ the king has three squares. Going forward (g6, h6) is only right when the attacker has nothing on the h-file. Here White’s queen cannot reach h5 with effect because ...Nf6 and ...Bxc3 are available — so the king simply steps back.',
        fen: GG_TAKE_2,
        orientation: 'black',
        shapes: ['g8:green', 'g6:red', 'h6:red'],
        task: {
          prompt: 'Black to move: put the king on the safest square.',
          moves: ['Kg8'],
          hint: 'The square that keeps the king out of every check.',
          success:
            'Kg8! and White has nothing: Qh5 Nf6 covers h7; Qd3 f5 and the king is safe. Black is a piece up.',
          failure:
            'Kg8! is the only good square. On g6 or h6 the king walks into Qd3+ and Qg4/Qh4 ideas.',
        },
      },
      {
        title: 'The rook lift',
        text: 'The sacrifice has gone in and the queen has reached h5 — but the black rook on f6 can come to h6 and block the h-file. A defender that arrives in one move is worth more than the piece White gave up.',
        fen: GG_ROOK,
        orientation: 'black',
        shapes: ['f6h6', 'h5h7:red'],
        task: {
          prompt: 'Black to move: stop the mate.',
          moves: ['Rh6'],
          hint: 'Block the h-file with the rook.',
          success:
            'Rh6! and the attack is over: the queen has to retreat, the knight on g5 is loose, and Black is a piece up.',
          failure: 'Rh6! blocks the h-file; nothing else stops Qxh7 mate.',
        },
      },
      {
        title: 'Take the knight',
        text: 'Sometimes the piece that arrives with check can simply be captured. The bishop on e7 covers g5 — after ...Bxg5 the queen recaptures with check, but the bishop comes back to h6 and the king is safe.',
        fen: GG_BISHOP,
        orientation: 'black',
        shapes: ['e7g5', 'h5:red'],
        task: {
          prompt: 'Black to move: remove the attacker.',
          moves: ['Bxg5'],
          hint: 'Which black piece attacks g5?',
          success:
            'Bxg5! Qxh5+ Bh6 and White has a queen and a pawn for two pieces — and no attack. The bishop on e7 was the defender White forgot to count.',
          failure:
            'Bxg5! takes the checking piece. After Qxh5+ Bh6 the king is safe and Black keeps the extra material.',
        },
      },
      {
        title: 'Recapture with the knight',
        text: 'A knight on f6 guards h7 twice: once from f6, and once more by recapturing on h7. When the bishop takes on h7 and the knight can take back, the sacrifice was just a blunder — here White’s desperate Qxd8 does not save the piece either.',
        fen: GG_KNIGHT,
        orientation: 'black',
        shapes: ['f6h7', 'd8:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Nxh7'],
          hint: 'Recapture with the piece that keeps the king covered.',
          success:
            'Nxh7! and the knight also guards g5. After Qxd8 Rxd8 Rxd8+ Nf8 Black is a piece up with the safer king.',
          failure: 'Nxh7! wins a piece: the knight was the second defender of h7.',
        },
      },
      {
        title: 'Calm is the defence',
        text: 'The last case is the most common in club games: the sacrifice is unsound, but only if the defender stays calm. Here the bishop on f6 covers g5 and h4, so the white queen never gets to the h-file. Which king move keeps everything covered?',
        fen: GG_CALM,
        orientation: 'black',
        shapes: ['g8:green', 'f6g5:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Kg8'],
          hint: 'Do not grab the knight — the queen would recapture with check. Step back.',
          success:
            'Kg8! and the attack is over: Qf3 is met by ...Bxg5 and ...Nf6. Taking the knight at once (...Bxg5?) would allow hxg5 with the h-file open and the queen coming to h5.',
          failure:
            'Kg8! keeps the h-file closed. ...Bxg5? hxg5 opens the h-file and the queen arrives on h5 with a winning attack.',
        },
      },
      {
        title: 'The defender’s checklist',
        text:
          '- **Count the attackers** before the sacrifice lands: knight to g5, queen to h5, a pawn on e5. Missing one? Take the bishop.\n' +
          '- **Count the defenders**: a knight for f6, a bishop or queen for g5, a rook for h6 or f5.\n' +
          '- **King squares**: g8 when h7 can be defended, g6 only when the h-file and the b1–h7 diagonal are safe, never h6.\n' +
          '- **Prevention** is cheaper than defence: with a knight on f6 or a pawn on h6 the sacrifice rarely works.\n\n' +
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
      'Same-coloured bishop endings: good bishop against bad, when to trade into a pawn ending, the decoy with a passed pawn, and why the wrong rook pawn never wins.',
    minutes: 8,
    practiceThemes: ['bishopEndgame'],
    steps: [
      {
        title: 'Good bishop, bad bishop',
        text:
          'With bishops of the same colour, the side whose **pawns stand on the other colour** has the good bishop: its pawns cannot be attacked and its bishop moves freely. The side whose pawns are fixed on its bishop’s colour has a bad bishop — a tall pawn.\n\n' +
          'Here every white pawn stands on a light square, the colour of both bishops, and Black’s bishop attacks them from behind. Find the square from which the bishop hits g4 and cannot be driven off.',
        fen: BE_GOOD_BAD,
        orientation: 'black',
        shapes: ['b3d1', 'd1g4:blue', 'g4:red'],
        task: {
          prompt: 'Black to move: attack the pawns from behind.',
          moves: ['Bd1'],
          hint: 'A route to the g4-pawn that the white bishop cannot block.',
          success:
            'Bd1! and the pawn on g4 falls: Bf1 Bxg4 and the black bishop is the good one, eating pawns on its own colour while White’s bishop can only watch.',
          failure:
            'Bd1! aims at g4 through f3 and e2. White’s bishop cannot cover the pawn from behind.',
        },
      },
      {
        title: 'Trade into a won pawn ending',
        text: 'The simplest plan in a bishop ending is often to **remove the bishops** — if the pawn ending that follows is winning. Count it first: here White’s king reaches b5 and wins the queenside pawns while Black’s king is tied to the d-pawn.',
        fen: BE_TRADE,
        shapes: ['d3b5', 'b4b5:blue', 'a7:red'],
        task: {
          prompt: 'White to move: force the trade.',
          moves: ['Bb5+'],
          reply: 'Kd6',
          hint: 'A check that offers the bishop trade.',
          success:
            'Bb5+ Kd6 Bxd7 Kxd7 Kb5 and the king walks to a6 and b7. Black’s king cannot leave the centre because of the d-pawn.',
          failure:
            'Bb5+! Kd6 Bxd7 Kxd7 Kb5 wins the pawn ending: the white king reaches the queenside first.',
        },
      },
      {
        title: 'Force the trade',
        text: 'Black has just offered a bishop trade with ...Bf7, hoping to keep the h-pawn. Accept it: after Bxf7 Kxf7 Kg5 the white king wins the h-pawn and stands in front of its own passed pawns — a pawn ending that plays itself.',
        fen: BE_TRADE_2,
        shapes: ['g6f7', 'f4g5:blue', 'h5:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Bxf7'],
          reply: 'Kxf7',
          hint: 'Count the pawn ending after the trade.',
          success:
            'Bxf7 Kxf7 Kg5 Kg7 Kxh5 and the king is in front of the f- and g-pawns with the h-file to walk up: a won pawn ending. Trading bishops was right because the count said so.',
          failure: 'Bxf7! Kxf7 Kg5 wins the h-pawn and the pawn ending.',
        },
      },
      {
        title: 'The decoy',
        text: 'A passed pawn is a decoy as well as a threat. Push it, and the piece that stops it has to leave something else: here the black king must take on d7, and the bishop on d5 is lost.',
        fen: BE_DECOY,
        shapes: ['d6d7', 'd5:red'],
        task: {
          prompt: 'White to move: use the passed pawn.',
          moves: ['d7'],
          reply: 'Kxd7',
          hint: 'Push the pawn — where does the king have to go?',
          success: 'd7! Kxd7 Kxd5 and White is a piece up with the pawns to prove it.',
          failure: 'd7! decoys the king: Kxd7 Kxd5 wins the bishop.',
        },
      },
      {
        title: 'The wrong rook pawn',
        text: 'One ending every player must know: a bishop and a rook pawn **cannot win** if the bishop does not control the queening square and the defending king reaches the corner. White’s bishop is light-squared, the queening square h8 is dark — so the king in the corner can never be forced out. Stalemate is your friend.',
        fen: BE_WRONG,
        orientation: 'black',
        shapes: ['h8:green', 'g8:green', 'd3:red'],
        task: {
          prompt: 'Black to move: hold the draw.',
          moves: ['Kg8'],
          hint: 'Stay next to the corner.',
          success:
            'Kg8 (or any move that keeps the king on g8/h8/g7/h7). h6 Kh8 h7 and it is stalemate; the bishop can never cover h8.',
          failure:
            'Keep the king on g8 or h8. Any attempt to leave the corner lets the pawn through.',
        },
      },
      {
        title: 'Summary',
        text:
          '- **Fix the enemy pawns on the colour of their bishop**, keep yours on the other colour.\n' +
          '- **Trade bishops only after counting the pawn ending.**\n' +
          '- **Passed pawns decoy** the enemy king or bishop.\n' +
          '- **The wrong rook pawn draws** — remember it before you trade into it, or when you are the one defending.\n\n' +
          'The Minor pieces drills let you play these positions out against the engine.',
        fen: BE_GOOD_BAD,
      },
    ],
  },
  {
    id: 'pawn-endgames-3',
    title: 'Pawn endgames III: tricks of the trade',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'The square of the pawn, key squares, the outside passed pawn, triangulation, the breakthrough and Réti’s manoeuvre — the ideas that decide pawn endings that look simple.',
    minutes: 9,
    practiceThemes: ['pawnEndgame'],
    steps: [
      {
        title: 'The square of the pawn',
        text: 'Draw a square from the pawn to its queening square, as wide as it is tall. If the defending king can step into the square, it catches the pawn; if not, the pawn queens. The king on f5 is inside the square of the b4-pawn (b4–b8–f8–f4) — but only just, so it must go straight for it.',
        fen: PE_SQUARE,
        orientation: 'black',
        shapes: ['b4b8:blue', 'b8f8:blue', 'f8f4:blue', 'f4b4:blue'],
        task: {
          prompt: 'Black to move: catch the pawn.',
          moves: ['Ke5', 'Ke6', 'Ke4'],
          hint: 'Stay inside the square — every move must keep you within reach of b8.',
          success:
            'Ke5 (or Ke4/Ke6) and the king stays in the square: b5 Kd6 b6 Kc6 and the pawn falls. Remember: a pawn on its starting square counts as if it were one rank further on.',
          failure:
            'The king must stay inside the square: any move towards the e-file catches the pawn; a move towards the h-file loses.',
        },
      },
      {
        title: 'Key squares',
        text:
          'With king and pawn against king, the game is decided by **key squares**: if the attacking king reaches one, the pawn queens whoever has the move. For a pawn on d2 the key squares are c4, d4 and e4 (two ranks in front); for a pawn on the fifth rank they are the squares on the sixth.\n\n' +
          'White is to move and can reach a key square before Black can take the opposition.',
        fen: PE_KEY,
        shapes: ['c4:green', 'd4:green', 'e4:green'],
        task: {
          prompt: 'White to move: head for a key square.',
          moves: ['Ke4', 'Kc3'],
          hint: 'Get the king in front of the pawn on the fourth rank.',
          success:
            'Ke4! Kd6 Kd4 and White has the opposition with the king on a key square: Kc6 Ke5 Kd7 Kd5 wins. Moving the pawn first would only give Black the opposition.',
          failure:
            'Ke4! (or Kc3 and Kc4) — the king goes to the fourth rank in front of the pawn. Pushing the pawn first lets Black take the opposition.',
        },
      },
      {
        title: 'The outside passed pawn',
        text: 'A passed pawn far from the other pawns wins by **decoying** the enemy king: while it goes to stop the b-pawn, the white king eats the f-pawn and escorts its own. Do not rush the b-pawn — first bring the king to the centre, where it supports both plans.',
        fen: PE_OUTSIDE,
        shapes: ['d3d4', 'b3b4:blue', 'f5:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Kd4', 'b4', 'Kc4'],
          hint: 'Centralise the king or start the outside pawn — both keep the win.',
          success:
            'Kd4! Kc6 Ke5 and the f-pawn falls while the b-pawn ties the black king to the queenside. The outside passer is worth more than the pawn it costs.',
          failure:
            'Kd4 (or b4) wins: the black king cannot stop the b-pawn and defend f5 at the same time.',
        },
      },
      {
        title: 'Triangulation',
        text: 'Kings on b5 and c7, pawns blocked on d5 and d6. White wants to reach c6 **with Black to move**: then the black king must abandon d6. The direct route fails — after Kc4 Kd7 Kb5 Kc7 the kings just shuffle. Instead the white king takes the long way round: a6 (or a5), then b6, then c6, and Black runs out of waiting moves.',
        fen: PE_TRIANGLE,
        shapes: ['b5a6', 'a6b6', 'b6c6', 'd6:red', 'c4:red'],
        task: {
          prompt: 'White to move: lose a tempo.',
          moves: ['Ka6', 'Ka5'],
          hint: 'Not towards the centre — round the outside.',
          success:
            'Ka6! Kd7 (Kc8 Kb6 Kd7 Kb7 and Kc6 next; Kb8 Kb6 Kc8 Kc6) Kb6 Ke7 Kc6 and it is Black to move with the king on e7: the d-pawn falls. Kc4? or Kb4? only draw.',
          failure:
            'Ka6 (or Ka5) is the way: the king goes round via b6 to reach c6 with Black to move. Kc4 lets Black keep the opposition for ever.',
        },
      },
      {
        title: 'The breakthrough',
        text: 'Three pawns against three, kings far away. White wins with a sacrifice that creates a passed pawn outside the black king’s reach — push the **middle** pawn first, and whichever pawn takes it, push on the other side.',
        fen: PE_BREAK,
        shapes: ['b5b6', 'a5a6:blue', 'c5c6:blue'],
        task: {
          prompt: 'White to move: break through.',
          moves: ['b6'],
          hint: 'The middle pawn goes first.',
          success:
            'b6! axb6 (cxb6 a6! bxa6 c6 and the c-pawn queens) c6! bxc6 a6 and the a-pawn cannot be caught. Two pawns for a queen.',
          failure: 'b6! is the breakthrough: axb6 c6! bxc6 a6, or cxb6 a6! bxa6 c6.',
        },
      },
      {
        title: 'Réti’s manoeuvre',
        text: 'The most famous pawn study: White’s king is far outside the square of the h-pawn, and the c-pawn seems lost to the black king. Yet White draws — the king walks **diagonally**, so that every step towards the h-pawn is also a step towards supporting its own pawn. Two goals at once.',
        fen: PE_RETI,
        shapes: ['h8g7', 'g7f6:blue', 'f6e5:blue', 'c6c8:green'],
        task: {
          prompt: 'White to move: draw.',
          moves: ['Kg7'],
          hint: 'Diagonally — towards both pawns at once.',
          success:
            'Kg7! h4 Kf6 Kb6 (h3 Ke6 and the c-pawn queens) Ke5! h3 Kd6 h2 c7 Kb7 Kd7 and both pawns queen — a draw. Straight after the h-pawn with Kh7 would lose.',
          failure:
            'Kg7! is the only move: the king goes diagonally so that it can turn towards c7 the moment the black king goes for the c-pawn.',
        },
      },
      {
        title: 'Summary',
        text:
          '- **The square**: can the king get in? Count before you push or run.\n' +
          '- **Key squares** decide king and pawn against king; get the king in front.\n' +
          '- **The outside passed pawn** decoys; the king does the winning elsewhere.\n' +
          '- **Triangulation** hands the move to the opponent in a blocked position.\n' +
          '- **Breakthrough**: sacrifice pawns to create a passed one the king cannot catch.\n' +
          '- **Réti**: a king walking diagonally chases two goals.\n\n' +
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
      'The hardest of the basic mates, made simple: drive the king to the edge, then to the corner of the bishop’s colour with the knight’s “W”, and finish with one of two pictures.',
    minutes: 8,
    practiceThemes: ['mate', 'endgame'],
    steps: [
      {
        title: 'The two pictures',
        text:
          'Mate is only possible in a **corner of the bishop’s colour**. Everything in this ending aims at one of two final pictures: the king on the edge next to the corner, the knight taking away the squares along the edge, and the bishop giving the check along the long diagonal.\n\n' +
          'Here the light-squared bishop and the light corner a8: the knight on a6 covers b8, the king covers a7 and b7, and one bishop move ends it.',
        fen: BN_MATE_A,
        shapes: ['h7e4', 'e4a8:blue', 'a6b8:blue'],
        task: {
          prompt: 'White to move: mate in one.',
          moves: ['Be4#'],
          acceptAnyMate: true,
          success: 'Be4 mate — the picture to aim for on the light corner.',
          failure: 'Be4# — a check along the long diagonal with b8 covered by the knight.',
        },
      },
      {
        title: 'The other picture',
        text: 'On the dark corner h8 the pieces swap roles: the knight on h6 covers g8, the king on g6 covers g7 and h7, and the dark-squared bishop checks along the a1–h8 diagonal.',
        fen: BN_MATE_H,
        shapes: ['g5f6', 'h6g8:blue'],
        task: {
          prompt: 'White to move: mate in one.',
          moves: ['Bf6#'],
          acceptAnyMate: true,
          success: 'Bf6 mate. Learn both pictures and the ending is half solved.',
          failure:
            'Bf6# — check on the long diagonal, g8 covered by the knight, g7 and h7 by the king.',
        },
      },
      {
        title: 'From the wrong corner',
        text:
          'The defender will run to the **wrong** corner — here a8, a light square, against a dark-squared bishop. The plan is to walk the king along the edge to the right corner (h8 or a1) without letting it escape to the centre. The knight makes a “W” shape: from e5 it goes to d7, then c5, then e6 … each jump taking a square from the king.\n\n' +
          'First moves: bring the king to b6 or the knight to d7 so that the king on a8 has only b8 and a7.',
        fen: BN_WRONG_CORNER,
        shapes: ['e5d7', 'd7c5:blue', 'c5e6:blue', 'a8:red', 'h8:green'],
        task: {
          prompt: 'White to move: start the W.',
          moves: ['Nd7', 'Kb6', 'Nc4'],
          hint: 'The knight goes to d7 (or the king to b6): take squares away, do not give check.',
          success:
            'Nd7! Kb7 (Ka7 Kc7) Kb5 and the net tightens: the king is walked along the eighth rank with the knight covering the squares in front of it.',
          failure:
            'Nd7 (or Kb6) — take the squares away one by one. Checks that let the king out to the centre only make the job longer.',
        },
      },
      {
        title: 'Along the edge',
        text: 'The king has been pushed to b8. Now the W begins in earnest: the knight checks from d7 to drive the king from b8 to a7? No — Nd7+ sends it to a8 or c8, and the bishop takes the squares on the other side. Keep the king on the edge at all times: **never let it step to the seventh rank** towards the centre.',
        fen: BN_EDGE,
        shapes: ['e5d7', 'f4:blue', 'c8:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Nd7+', 'Kb6'],
          hint: 'A knight check that keeps the king on the back rank.',
          success:
            'Nd7+ Kc8 (Ka8 Kb6 and the mating picture is near) Kd6! and the king cannot leave the eighth rank; the knight and bishop escort it to h8.',
          failure:
            'Nd7+ (or Kb6 first). The king must stay on the edge; every white move takes another square.',
        },
      },
      {
        title: 'The method in one list',
        text:
          '- **Phase 1**: drive the king to any edge with king and bishop working together; the knight helps from the centre.\n' +
          '- **Phase 2**: if it is the wrong corner, walk it along the edge with the knight’s W (for the king on a8: knight to d7, c5, e6? — the pattern is d7–c5–… jumping every second square) and the bishop taking the squares behind.\n' +
          '- **Phase 3**: the picture — king next to the corner, knight covering the edge square, bishop check.\n' +
          '- Budget: about 33 moves from the worst position, so start early and count the fifty-move rule.\n\n' +
          'The drills “Bishop and knight vs king” and “Bishop and knight: wrong corner” let you practise both phases against the engine.',
        fen: BN_WRONG_CORNER,
      },
    ],
  },
  {
    id: 'queen-vs-rook',
    title: 'Queen versus rook',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'Winning with the queen against a rook: keep the rook tied to its king, hand the move over with a quiet queen move, and win the rook with a skewer or a fork when it has to leave.',
    minutes: 7,
    practiceThemes: ['queenRookEndgame', 'endgame'],
    steps: [
      {
        title: 'The Philidor position',
        text:
          'Queen against rook is a win, but the rook is a stubborn defender as long as it stays **next to its king**. The winning method: push the king to the edge, tie the rook to it, then make a quiet queen move that leaves Black no good move — zugzwang. The rook has to move away, and the queen wins it with a check.\n\n' +
          'Start with a check that drives the king into the corner.',
        fen: QR_START,
        shapes: ['e1e5', 'e5b8:blue', 'b7:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Qe5+', 'Qe8+'],
          hint: 'Check along the diagonal or the rank.',
          success:
            'Qe5+ Ka8 and the king is in the corner. Now a second check brings the queen to the a-file.',
          failure:
            'Qe5+ (or Qe8+) drives the king into the corner, where the rook is most tied down.',
        },
      },
      {
        title: 'Check from the side',
        text: 'The king is on a8. Bring the queen to the a-file with check, so that it can then take up the key square a5.',
        fen: QR_2,
        shapes: ['e5a1'],
        task: {
          prompt: 'White to move.',
          moves: ['Qa1+'],
          hint: 'A check on the a-file.',
          success: 'Qa1+ Kb8 and now the quiet move.',
          failure: 'Qa1+! Kb8 prepares Qa5 — the zugzwang.',
        },
      },
      {
        title: 'Zugzwang',
        text: 'The famous position: **Qa5!** No check, no capture — but Black has nothing to do. The king cannot move (a8 and c8 are covered), so the rook must leave b7, and wherever it goes the queen wins it: ...Rb1 Qd8+ Ka7 Qd4+ and a skewer; ...Rh7 Qe5+ Ka8 Qa1+ and Qh1 catches it; ...Rb3 Qd8+ Ka7 Qd4+ and again.',
        fen: QR_3,
        shapes: ['a1a5', 'a8:red', 'c8:red'],
        task: {
          prompt: 'White to move: the quiet move.',
          moves: ['Qa5'],
          hint: 'A queen move that gives no check and leaves Black no safe move.',
          success:
            'Qa5! and Black is in zugzwang. Whatever the rook does, a check along the eighth rank or the diagonal wins it.',
          failure:
            'Qa5! is the move — not a check but a zugzwang. The rook has to leave its king and is lost to a skewer.',
        },
      },
      {
        title: 'Collect the rook',
        text: 'The rook has run to b1. Now the checks: a check on the eighth rank forces the king to a7, and a check on the diagonal skewers king and rook. Find the first move.',
        fen: QR_SKEWER,
        shapes: ['a5d8', 'd8a7:blue', 'b1:red'],
        task: {
          prompt: 'White to move: win the rook.',
          moves: ['Qd8+', 'Qe5+'],
          hint: 'Check, then check again on the long diagonal.',
          success:
            'Qe5+ Ka7 Qd4+ Kb8 (Ka8 Qh8+ Ka7 Qh7+ skewers the rook on the h7–b1 diagonal) Qh8+ Ka7 Qh7+ and again the rook on b1 is on the diagonal behind the king. Every check gains a tempo until the skewer lands.',
          failure:
            'Qd8+ (or Qe5+) — a series of checks along the eighth rank and the diagonals ends with a skewer of king and rook.',
        },
      },
      {
        title: 'Summary',
        text:
          '- Drive the king to the **edge**, ideally the corner.\n' +
          '- Keep the rook **tied** to the king: attack it when it is loose, restrict it when it is close.\n' +
          '- Find the **quiet move** (zugzwang) that forces the rook away.\n' +
          '- Win it with a **skewer** or **fork** on the diagonals and the eighth rank.\n' +
          '- Watch for **stalemate** and for perpetual check by the rook when your queen wanders.\n\n' +
          'The drill “Queen vs rook” plays this against the engine from several starting positions.',
        fen: QR_START,
      },
    ],
  },
];
