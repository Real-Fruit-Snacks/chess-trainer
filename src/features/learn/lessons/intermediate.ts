import { fenAfter, type Lesson } from '../model';

/** From a Lichess puzzle (CC0): White to move after Black captured on g4. */
const DEFLECTION = fenAfter('Bxg4', '4rk2/ppp2p1p/3pbPp1/6B1/3n2N1/P6P/2P3P1/4R2K b - - 2 25');

export const intermediateLessons: Lesson[] = [
  {
    id: 'forks',
    title: 'Forks',
    level: 'intermediate',
    category: 'Tactics',
    summary: 'Attack two things at once — the most common tactic in chess.',
    minutes: 6,
    steps: [
      {
        title: 'One move, two targets',
        text:
          'A **fork** is a single move that attacks two (or more) enemy pieces. The opponent can save only one of ' +
          'them. Knights are the best forkers because their attacks are hard to see and cannot be blocked.\n\n' +
          'Here the knight can give check and attack the rook at the same time. After the king moves, the rook is ' +
          'simply taken.',
        fen: '4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1',
        task: {
          prompt: 'Fork the king and the rook.',
          moves: ['Nf6+'],
          hint: 'Which knight move gives check? Then see what else that square attacks.',
          success: 'Nf6+ — check and an attack on d5. Whatever Black does, the rook is lost.',
          failure: 'Not quite. You want a knight move that attacks e8 *and* d5 at the same time.',
        },
      },
      {
        title: 'Queen forks',
        text:
          'The queen forks along any line. Look for a square from which she gives **check** and simultaneously hits ' +
          'a loose piece — the check forces the reply, so the loose piece cannot be saved.',
        fen: '7k/7p/8/8/8/8/1r6/3QK3 w - - 0 1',
        task: {
          prompt: 'Fork the king and the rook.',
          moves: ['Qd4+'],
          hint: 'Find a square that gives check on one diagonal and attacks the rook on another.',
          success:
            'Qd4+ checks along one diagonal and hits the rook along the other. After the king moves, Qxb2.',
          failure: 'Not quite. You want a check that also attacks the undefended rook on b2.',
        },
      },
      {
        title: 'Pawn forks',
        text:
          'Even a pawn can fork. A pawn attacking two pieces is especially annoying because trading a piece for a ' +
          'pawn is a bad deal.\n\nThe bishop could capture on d5, but the e4 pawn protects that square.',
        fen: 'r3k3/8/2n1b3/8/3PP3/8/8/3QK3 w - - 0 1',
        task: {
          prompt: 'Fork the knight and the bishop with a pawn.',
          moves: ['d5'],
          success: 'd5 attacks both pieces. If Bxd5 then exd5, and the knight is still attacked.',
          failure: 'Push the pawn to a square that attacks c6 and e6 at the same time.',
        },
      },
      {
        title: 'Spotting forks',
        text:
          'To find forks, look for **loose pieces** — pieces with no defender — and for the enemy **king**. Any ' +
          'square that attacks two of them is a candidate. Checks are the strongest forks because the reply is forced.\n\n' +
          'Practise the theme with the puzzles below.',
        fen: '4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1',
        shapes: ['e4f6', 'f6e8:red', 'f6d5:red'],
      },
    ],
    practiceThemes: ['fork'],
  },

  {
    id: 'pins-and-skewers',
    title: 'Pins and skewers',
    level: 'intermediate',
    category: 'Tactics',
    summary: 'Two pieces on one line — exploit the one that cannot move.',
    minutes: 7,
    steps: [
      {
        title: 'The absolute pin',
        text:
          'A **pin** is an attack on a piece that cannot move without exposing something more valuable behind it. ' +
          'When the piece behind is the **king**, the pinned piece cannot legally move at all: an *absolute pin*.\n\n' +
          'The bishop pins the knight to the king. Simply taking it (Bxc6+ bxc6) is only an even trade. Instead, ' +
          'attack the pinned knight with something cheaper.',
        fen: '4k2r/1p5p/2n5/1B6/3P4/8/P6P/4K2R w - - 0 1',
        shapes: ['b5e8:red'],
        task: {
          prompt: 'Win the pinned knight.',
          moves: ['d5'],
          success: 'd5! The knight cannot move, and next move you capture it for just a pawn.',
          failure:
            'Bxc6+ only trades bishop for knight. Pile up on the knight with your pawn instead.',
        },
      },
      {
        title: 'The relative pin',
        text:
          'If the piece behind is not the king, the pinned piece *can* legally move — it just loses material if it ' +
          'does. The knight on f6 is pinned to the queen on d8.\n\nAttack the knight with a pawn: moving it would ' +
          'drop the queen.',
        fen: '3q3k/8/5n2/6B1/4P3/8/5PPP/2Q3K1 w - - 0 1',
        shapes: ['g5d8:red'],
        task: {
          prompt: 'Attack the pinned knight.',
          moves: ['e5', 'Qa1'],
          success:
            'The pinned knight cannot run: if it moves, Bxd8. e5 attacks it with a pawn; piling on with Qa1 works too.',
          failure: 'The pawn on e4 can attack f6 in one move.',
        },
      },
      {
        title: 'The skewer',
        text:
          'A **skewer** is a pin in reverse: the *more* valuable piece is in front and must move, exposing the piece ' +
          'behind. Kings are the usual victims because they have to get out of check.\n\nGive check so that the queen ' +
          'behind the king falls.',
        fen: '7q/8/8/7k/8/8/8/1K4R1 w - - 0 1',
        task: {
          prompt: 'Skewer the king and queen.',
          moves: ['Rh1+'],
          success: 'Rh1+! The king must leave the h-file and the queen on h8 is lost.',
          failure:
            'Put the rook on the same line as the king and the queen, with the king in front.',
        },
      },
      {
        title: 'Skewers on the diagonal',
        text: 'Bishops skewer too. Find the check that wins the rook.',
        fen: 'r7/p6p/8/3k4/8/7B/P6P/4K3 w - - 0 1',
        task: {
          prompt: 'Skewer the king and rook.',
          moves: ['Bg2+'],
          success: 'Bg2+ — the king steps off the long diagonal and Bxa8 follows.',
          failure:
            'The king on d5 and the rook on a8 are on the same diagonal. Give check along it.',
        },
      },
    ],
    practiceThemes: ['pin', 'skewer'],
  },

  {
    id: 'discovered-attacks',
    title: 'Discovered attacks and double check',
    level: 'intermediate',
    category: 'Tactics',
    summary: 'Move one piece to unleash another. The most violent tactic there is.',
    minutes: 6,
    steps: [
      {
        title: 'The discovered attack',
        text:
          'When a piece moves off a line and **uncovers** an attack from the piece behind it, that is a discovered ' +
          'attack. It is doubly dangerous when the moving piece creates a threat of its own.\n\nHere the knight ' +
          'blocks your rook’s line to the black king. Move it so that the rook gives **check** while the knight ' +
          'attacks the queen.',
        fen: '4k3/7q/8/8/4N3/8/8/4RK2 w - - 0 1',
        shapes: ['e1e8:blue'],
        task: {
          prompt: 'Uncover a check and attack the queen.',
          moves: ['Nf6+'],
          hint: 'Which knight squares attack h7 — and which of them also gives check itself?',
          success:
            'Nf6+! It is even a double check, so Black cannot block with Qe7. The king moves and Nxh7 follows.',
          failure:
            'Ng5+ also uncovers the rook, but Black simply blocks with Qe7. Find the knight move that attacks h7 *and* gives check itself.',
        },
      },
      {
        title: 'Double check',
        text:
          'If the moving piece **also** gives check, it is a **double check**. Blocking or capturing cannot stop two ' +
          'checks at once — the king *must* move.\n\nHere Nd6+ would be double check. Black’s queen on c7 could ' +
          'capture the knight… but that would leave the rook’s check unanswered, so it is illegal. Only king moves ' +
          'are allowed.',
        fen: '4k3/2q5/8/8/4N3/8/8/4RK2 w - - 0 1',
        shapes: ['e4d6', 'd6e8:red', 'e1e8:red'],
      },
      {
        title: 'Double check mate',
        text:
          'Because only king moves answer a double check, it is a lethal mating weapon. The knight blocks your ' +
          'bishop’s long diagonal. Find the double check that is also checkmate.',
        fen: '6rk/7p/8/4N3/8/8/1B6/4K3 w - - 0 1',
        shapes: ['b2h8:blue'],
        task: {
          prompt: 'Checkmate with a double check.',
          moves: ['Nf7#', 'Ng6#'],
          acceptAnyMate: true,
          success:
            'The rook could take the knight — but the bishop is giving check too, so the king is simply mated.',
          failure:
            'Move the knight to a square that attacks h8 while the bishop’s diagonal opens up.',
        },
      },
    ],
    practiceThemes: ['discoveredAttack', 'doubleCheck'],
  },

  {
    id: 'removing-the-defender',
    title: 'Removing the defender',
    level: 'intermediate',
    category: 'Tactics',
    summary: 'When a key square is guarded by a single piece, get rid of that piece.',
    minutes: 6,
    steps: [
      {
        title: 'Capture the defender',
        text: 'Black’s rook on e8 is the only thing stopping Rd8 mate. Trade it off, and the back rank collapses.',
        fen: '4r1k1/5ppp/8/nB6/8/8/5PPP/3R2K1 w - - 0 1',
        shapes: ['d1d8:blue', 'b5e8:red'],
        task: {
          prompt: 'Remove the only defender of the back rank.',
          moves: ['Bxe8'],
          success:
            'Bxe8. Black must now spend a move on the king (Kf8) and you have won a rook for a bishop.',
          failure: 'Rd8 runs into Rxd8. First remove the rook that guards d8.',
        },
      },
      {
        title: 'Drag the defender away',
        text:
          'You do not always have to capture the defender — you can **force it to leave**. Here the black king ' +
          'is the only defender of the rook on e8. A check will drag it away.',
        fen: DEFLECTION,
        shapes: ['e1e8:blue', 'f8e8:red'],
        task: {
          prompt: 'Deflect the defender of e8.',
          moves: ['Bh6+'],
          reply: 'Kg8',
          hint: 'Give check with the bishop so the king has to leave f8.',
          success: 'Bh6+! The king must step to g8 — and it no longer protects e8.',
          failure: 'Rxe8+ runs into Kxe8. First make the king leave the square next to the rook.',
        },
      },
      {
        title: 'Collect',
        text: 'The defender has gone. Finish.',
        fen: fenAfter('Bh6+ Kg8', DEFLECTION),
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rxe8#'],
          acceptAnyMate: true,
          success: 'Rxe8# — deflection turned a defended rook into a back-rank mate.',
          failure: 'Take the rook that used to be protected. It is mate.',
        },
      },
      {
        title: 'Overloaded pieces',
        text:
          'A piece with **two jobs** is overloaded: it cannot do both. When you spot one, force it to choose. ' +
          'Ask yourself, for every enemy defender: *what is it guarding, and can I make it leave, capture it, or ' +
          'give it a second task?*',
        fen: DEFLECTION,
        shapes: ['f8e8:blue', 'g5h6', 'h6f8:red'],
      },
    ],
    practiceThemes: ['capturingDefender', 'deflection', 'attraction'],
  },

  {
    id: 'mating-patterns',
    title: 'Mating patterns every player should know',
    level: 'intermediate',
    category: 'Checkmates',
    summary:
      'Smothered, Anastasia’s, Arabian, Boden’s and the h-file mate — recognise them instantly.',
    minutes: 8,
    steps: [
      {
        title: 'Smothered mate',
        text:
          'A king surrounded by its own pieces can be mated by a lone knight — nothing can block a knight, and ' +
          'here nothing can capture it either.',
        fen: '6rk/5ppp/8/4N3/8/8/8/4K3 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Nxf7#'],
          acceptAnyMate: true,
          failure:
            'The king on h8 has no free squares. Give check with the knight from a square nothing can capture.',
        },
      },
      {
        title: 'Anastasia’s mate',
        text:
          'A knight on e7 takes away g8 and g6; a rook then checks along the h-file. The king is trapped between ' +
          'the edge and its own pawn.',
        fen: '8/4N1pk/8/8/8/8/4K3/R7 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rh1#'],
          acceptAnyMate: true,
          failure:
            'The knight already controls the king’s escape squares. Bring the rook to the h-file.',
        },
      },
      {
        title: 'Arabian mate',
        text:
          'Rook and knight team up in the corner: the knight on f6 guards g8 and h7, and the rook mates on the ' +
          '7th rank, protected by the knight.',
        fen: '7k/R7/5N2/8/8/8/8/4K3 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rh7#'],
          acceptAnyMate: true,
          failure: 'Check on the h-file next to the king — the knight protects the rook.',
        },
      },
      {
        title: 'Boden’s mate',
        text:
          'Two bishops on criss-crossing diagonals mate a king that castled queenside, with its own pieces ' +
          'blocking the escape.',
        fen: '2kr4/3n4/2p5/8/5B2/8/4B3/6K1 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Ba6#'],
          acceptAnyMate: true,
          failure:
            'One bishop already covers b8 and c7. Bring the other to a square that checks through b7.',
        },
      },
      {
        title: 'The h-file mate',
        text:
          'A bishop covering g8 plus a rook (or queen) on the h-file is mate whenever the king’s own pawn blocks g7. ' +
          'Countless attacking games end this way.',
        fen: '7k/6p1/5p2/3B4/8/8/4K3/R7 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rh1#'],
          acceptAnyMate: true,
          failure: 'The bishop on d5 guards g8. Check along the h-file.',
        },
      },
    ],
    practiceThemes: ['smotheredMate', 'anastasiaMate', 'arabianMate', 'bodenMate', 'mateIn2'],
  },

  {
    id: 'king-and-pawn-endgames',
    title: 'King and pawn endgames',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'The square of the pawn, opposition and the king in front — win the won ones, hold the drawn ones.',
    minutes: 9,
    steps: [
      {
        title: 'The square of the pawn',
        text:
          'Can a king catch a runaway pawn? Draw a **square** from the pawn to its promotion square, extended toward ' +
          'the king. If the king can step into that square, it catches the pawn; if not, the pawn queens.\n\n' +
          'Here g3 would let the black king reach the square. Find the move that runs away for good.',
        fen: 'K7/8/8/8/8/k7/6P1/8 w - - 0 1',
        shapes: ['c4:blue', 'c8:blue', 'g8:blue', 'g4:blue'],
        task: {
          prompt: 'Push the pawn so the king cannot catch it.',
          moves: ['g4'],
          success: 'g4! The square is c4–g8, and the black king cannot enter it in one move.',
          failure:
            'Count again: after that move, can the black king step inside the pawn’s square?',
        },
      },
      {
        title: 'Opposition',
        text:
          'When the kings face each other with one square between them, the side that does **not** have to move ' +
          'has the **opposition** — the other king must step aside.\n\nWith the pawn on the 4th rank and White’s king ' +
          'directly in front, Black can hold the draw — but only by keeping the opposition. Find the only move.',
        fen: '4k3/8/8/4K3/4P3/8/8/8 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Black to move. Hold the draw.',
          moves: ['Ke7'],
          success:
            'Ke7! Now White has to give ground. Keep stepping straight in front of the pawn and it is a draw.',
          failure: 'That lets the white king slip past to the side. Face the white king directly.',
        },
      },
      {
        title: 'King in front of the pawn',
        text:
          'The attacker’s rule of thumb: get your **king in front of the pawn**, with the pawn far enough back to ' +
          'spare a tempo move when you need it.\n\nHere White wins with almost any sensible move: the king is in ' +
          'front and the pawn can wait on e3 until it is time to take the opposition with a pawn move.',
        fen: '8/8/4k3/8/4K3/4P3/8/8 w - - 0 1',
        shapes: ['e4:blue', 'e3e4:green'],
      },
      {
        title: 'Rook pawns are different',
        text:
          'A pawn on the a- or h-file is often only a draw even when the attacking king is in front: the defending ' +
          'king hides in the corner and cannot be driven out without stalemating it. Remember that when you are ' +
          'choosing which pawn to keep.',
        fen: '7k/8/6KP/8/8/8/8/8 w - - 0 1',
        shapes: ['h8:red', 'g8:red'],
      },
    ],
    practiceThemes: ['pawnEndgame'],
  },

  {
    id: 'rook-endgames',
    title: 'Rook endgames: Lucena and Philidor',
    level: 'intermediate',
    category: 'Endgames',
    summary: 'The two positions that decide most rook endgames — one wins, one draws.',
    minutes: 9,
    steps: [
      {
        title: 'The Lucena position (winning)',
        text:
          'White’s pawn is on the 7th, the white king in front of it, and the black king cut off. The winning ' +
          'technique is **building a bridge**: the rook goes to the 4th rank so that later, when the king walks out ' +
          'and gets checked, the rook can shield it.\n\nStart the bridge.',
        fen: '2K5/2P1k3/8/8/8/8/r7/3R4 w - - 0 1',
        shapes: ['d1d4', 'c8b7:blue'],
        task: {
          prompt: 'Begin building the bridge.',
          moves: ['Rd4'],
          hint: 'Lift the rook to the rank where it will later block the checks.',
          success:
            'Rd4! Now Kb7 walks out; after Rb1+ Kc6 Rc1+ Kb6 Rb1+ Kc5 Rc1+ the rook interposes with Rc4 and the pawn queens.',
          failure:
            'Other moves may also win, but practise the technique: the rook belongs on the 4th rank — the classic bridge.',
        },
      },
      {
        title: 'The Philidor position (drawing)',
        text:
          'With the pawn on the 6th rank and Black’s king in front of it, the defence is: keep your rook on the ' +
          '**third rank** (from your side, the 6th) as long as the pawn is behind it — the white king can never come ' +
          'forward. As soon as the pawn advances to that rank, drop your rook to the **first rank** and check from behind ' +
          'forever.\n\nWhite has just played e5–e6. Black to move.',
        fen: '4k3/7R/r3P3/3K4/8/8/8/8 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Black to move. Set up the endless checks.',
          moves: ['Ra1', 'Ra2', 'Ra3', 'Ra4'],
          success:
            'The rook drops back — Ra1 is the classic square. Now Kd6 is met by Rd1+ and the king has no shelter from the checks.',
          failure:
            'Checking right away only helps the king forward. First get the rook far away, then check from behind.',
        },
      },
      {
        title: 'Rooks belong behind passed pawns',
        text:
          '**Tarrasch’s rule**: place your rook *behind* a passed pawn — yours or the opponent’s. Behind its own pawn ' +
          'the rook gains activity as the pawn advances; behind an enemy pawn it stays active while the enemy rook ' +
          'in front of the pawn is tied down.',
        fen: 'r7/6k1/8/P7/8/8/8/R3K3 w - - 0 1',
        shapes: ['a1a5:blue', 'a8a5:red'],
      },
    ],
    practiceThemes: ['rookEndgame'],
  },

  {
    id: 'planning-basics',
    title: 'Planning: open files, outposts and the 7th rank',
    level: 'intermediate',
    category: 'Strategy',
    summary:
      'What to do when there is no tactic: improve your worst piece and grab the good squares.',
    minutes: 7,
    steps: [
      {
        title: 'Open files',
        text:
          'A file with no pawns on it is an **open file**. Rooks need them — a rook behind its own pawns does ' +
          'nothing. When a file opens, be the first to occupy it.',
        fen: 'r4rk1/pp3ppp/2pp4/8/8/2PP4/PP3PPP/R4RK1 w - - 0 1',
        shapes: ['e1e8:blue'],
        task: {
          prompt: 'Seize the open file with a rook.',
          moves: ['Rfe1', 'Rae1'],
          success: 'Now your rook controls the e-file and can invade on e7 later.',
          failure: 'Which file has no pawns at all? Put a rook on it.',
        },
      },
      {
        title: 'The 7th rank',
        text:
          'A rook on the opponent’s **second rank** (the 7th, for White) attacks pawns from the side and ' +
          'imprisons the king on the back rank. Here the rook on d7 hits b7 and f7 at once and Black is reduced to ' +
          'passive defence. Two rooks on the 7th often force mate.',
        fen: '2r3k1/pp1R1ppp/4p3/8/8/8/PP3PPP/6K1 w - - 0 1',
        shapes: ['d7b7:red', 'd7f7:red', 'g8:blue'],
      },
      {
        title: 'Outposts',
        text:
          'An **outpost** is a square in enemy territory that no enemy pawn can ever attack, ideally protected by ' +
          'one of your pawns. A knight on an outpost is worth a rook’s ransom.\n\nHere the knight on d5 is untouchable ' +
          'by pawns: Black has no c-pawn and the e-pawn has advanced past d5.',
        fen: fenAfter(
          '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5 9. Nd5',
        ),
        shapes: ['d5:green', 'e4d5:blue'],
      },
      {
        title: 'Improve your worst piece',
        text:
          'When you cannot find a tactic or a clear target, ask: **which of my pieces is doing the least?** Find ' +
          'it a better square. Repeat. Positions win themselves when every piece is working.\n\n' +
          'A simple checklist for every quiet move:\n\n' +
          '- Is any piece of mine undefended or attacked?\n' +
          '- Is there an open file, an outpost or a weak pawn to target?\n' +
          '- Which piece is worst placed, and where does it want to go?',
        fen: fenAfter(
          '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1 a6 8. Nbd2',
        ),
        shapes: ['d2f1', 'f1g3', 'g3f5'],
      },
    ],
    practiceThemes: ['quietMove', 'advantage'],
  },

  {
    id: 'common-openings',
    title: 'The openings you will meet most',
    level: 'intermediate',
    category: 'Openings',
    summary:
      'Italian, Ruy Lopez, Sicilian, French, Caro-Kann, Queen’s Gambit, London — one idea each.',
    minutes: 10,
    steps: [
      {
        title: 'The Italian Game',
        text:
          '1. e4 e5 2. Nf3 Nc6 3. **Bc4**. The bishop eyes f7, the weakest point in Black’s camp. White usually ' +
          'follows with c3 and d3 for a slow, solid game.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6'),
        shapes: ['f1c4', 'c4f7:red'],
        task: {
          prompt: 'Play the Italian bishop move.',
          moves: ['Bc4'],
          failure: 'The Italian bishop goes to c4, staring at f7.',
        },
      },
      {
        title: 'The Ruy Lopez',
        text:
          'From the same position, 3. **Bb5** is the Ruy Lopez (Spanish Game): the bishop pressures the knight that ' +
          'defends e5. It has been the main line of chess for 500 years.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6'),
        shapes: ['f1b5', 'b5c6:red'],
        task: {
          prompt: 'Play the Ruy Lopez.',
          moves: ['Bb5'],
          failure: 'In the Spanish, the bishop goes to b5 to pressure c6.',
        },
      },
      {
        title: 'The Sicilian Defence',
        text:
          'Black’s most popular and most combative reply to 1. e4 is 1…**c5**. Black fights for d4 with a flank ' +
          'pawn, keeping the e-pawn for later and aiming for an unbalanced game with winning chances.',
        fen: fenAfter('1. e4'),
        orientation: 'black',
        shapes: ['c7c5', 'c5d4:blue'],
        task: {
          prompt: 'Play the Sicilian.',
          moves: ['c5'],
          failure: 'The Sicilian starts with the c-pawn to c5.',
        },
      },
      {
        title: 'The French and the Caro-Kann',
        text:
          'Two solid answers to 1. e4 prepare …d5 with a pawn:\n\n' +
          '- **French**: 1…e6 then 2…d5. Rock solid, but the bishop on c8 is often stuck behind the e6 pawn.\n' +
          '- **Caro-Kann**: 1…c6 then 2…d5. Similar idea, but the c8 bishop keeps its diagonal.\n\n' +
          'Shown: the French after 2. d4 d5.',
        fen: fenAfter('1. e4 e6 2. d4 d5'),
        shapes: ['d5e4:red', 'c8h3:blue'],
      },
      {
        title: 'The Queen’s Gambit',
        text:
          '1. d4 d5 2. **c4** offers a pawn to deflect Black’s d-pawn from the centre. Black can accept (2…dxc4) ' +
          'or decline (2…e6, 2…c6). It is not a real sacrifice — White regains the pawn easily.',
        fen: fenAfter('1. d4 d5'),
        shapes: ['c2c4', 'c4d5:red'],
        task: {
          prompt: 'Offer the Queen’s Gambit.',
          moves: ['c4'],
          failure: 'The gambit pawn is the c-pawn, to c4.',
        },
      },
      {
        title: 'The London System',
        text:
          'A favourite of club players: 1. d4 followed by **Bf4**, e3, Nf3, c3 and Bd3 — the same setup against ' +
          'almost anything. Easy to learn and hard to break.',
        fen: fenAfter('1. d4 Nf6'),
        shapes: ['c1f4'],
        task: {
          prompt: 'Start the London System.',
          moves: ['Bf4'],
          failure: 'The London bishop comes out to f4 early.',
        },
      },
      {
        title: 'The King’s Indian Defence',
        text:
          'Against 1. d4, Black can let White build a big centre and then attack it: 1…Nf6 2. c4 g6 3. Nc3 Bg7 ' +
          '4. e4 d6. Sharp, dynamic, and the choice of many world champions.',
        fen: fenAfter('1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6'),
        shapes: ['g7a1:blue', 'e7e5'],
      },
    ],
    practiceThemes: ['opening'],
  },
];
