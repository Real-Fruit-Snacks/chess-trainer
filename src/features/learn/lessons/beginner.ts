import { fenAfter, type Lesson } from '../model';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const beginnerLessons: Lesson[] = [
  {
    id: 'the-board',
    title: 'The board and the notation',
    level: 'beginner',
    category: 'Rules',
    summary: 'Files, ranks, square names and how to read a chess move.',
    minutes: 5,
    steps: [
      {
        title: 'Files and ranks',
        text:
          'A chessboard has 64 squares in an 8×8 grid. The columns are called **files** and are lettered ' +
          '**a** to **h** from White’s left to right. The rows are **ranks**, numbered **1** to **8** starting ' +
          'from White’s side.\n\nEvery square has a name made of its file letter and rank number. The circled ' +
          'squares are **a1** (bottom-left corner for White) and **h8** (top-right).',
        fen: START,
        shapes: ['a1:blue', 'h8:blue'],
      },
      {
        title: 'Setting up: light on the right',
        text:
          'Two things to remember when setting up a board:\n\n' +
          '- Each player has a **light square in their right-hand corner** (for White, that is h1).\n' +
          '- The **queen stands on her own colour**: the white queen on the light square d1, the black queen on the dark square d8.\n\n' +
          'The kings then go next to the queens on the e-file.',
        fen: START,
        shapes: ['h1:blue', 'd1:green', 'd8:green'],
      },
      {
        title: 'Reading a move',
        text:
          'Moves are written with a letter for the piece followed by the destination square: **Nf3** means a knight ' +
          'moves to f3, **Bc4** a bishop to c4. Pawn moves use just the square: **e4**.\n\n' +
          'Other symbols: **x** for a capture (Bxe5), **+** for check, **#** for checkmate, **O-O** for castling.\n\n' +
          'Try it: play the move **e4** by dragging the pawn in front of the white king two squares forward.',
        fen: START,
        shapes: ['e2e4'],
        task: {
          prompt: 'Play the move e4.',
          moves: ['e4'],
          hint: 'The e-pawn starts on e2. Move it to the circled square e4.',
          success: 'That is 1. e4 — the most popular first move in chess.',
          failure:
            'Not that one. Find the pawn on the e-file (in front of the king) and move it two squares forward.',
        },
      },
      {
        title: 'Coordinates from Black’s side',
        text:
          'When you play Black the board is flipped, but the names stay the same: a1 is still in the bottom-left ' +
          'from **White’s** point of view. Get used to reading both ways — you will see the board from Black’s side ' +
          'in half of your games.\n\nPlay **e5** for Black, the classic reply to 1. e4.',
        fen: fenAfter('1. e4'),
        orientation: 'black',
        shapes: ['e7e5'],
        task: {
          prompt: 'Play e5 for Black.',
          moves: ['e5'],
          success: 'Perfect. Now both sides have staked a claim in the centre.',
          failure: 'Move the pawn on e7 two squares forward to e5.',
        },
      },
    ],
  },

  {
    id: 'how-pieces-move',
    title: 'How the pieces move',
    level: 'beginner',
    category: 'Rules',
    summary: 'Rook, bishop, queen, knight, king and pawn — one interactive exercise each.',
    minutes: 8,
    steps: [
      {
        title: 'The rook',
        text:
          'The **rook** moves any number of squares along a rank or a file, as far as its path is clear. It ' +
          'cannot jump over pieces.\n\nMove the rook to the far right end of its rank.',
        fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1',
        shapes: ['d4d8', 'd4h4', 'd4a4', 'd4d1'],
        task: {
          prompt: 'Move the rook to h4.',
          moves: ['Rh4'],
          failure: 'Rooks move in straight lines only. Slide it along the 4th rank to h4.',
        },
      },
      {
        title: 'The bishop',
        text:
          'The **bishop** moves diagonally, any distance. Notice that a bishop stays on squares of one colour for ' +
          'the whole game — this one lives on the dark squares.\n\nMove the bishop to g7.',
        fen: '4k3/8/8/8/3B4/8/8/4K3 w - - 0 1',
        shapes: ['d4g7', 'd4a1', 'd4a7', 'd4g1'],
        task: {
          prompt: 'Move the bishop to g7.',
          moves: ['Bg7'],
          failure: 'Bishops only move diagonally. Follow the long diagonal up and to the right.',
        },
      },
      {
        title: 'The queen',
        text:
          'The **queen** combines rook and bishop: straight lines *and* diagonals. She is the most powerful ' +
          'piece — and the most valuable one to lose.\n\nMove the queen to h8. That also attacks the black king: a **check**.',
        fen: '4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1',
        shapes: ['d4h8', 'd4d8', 'd4h4', 'd4a1'],
        task: {
          prompt: 'Move the queen to h8.',
          moves: ['Qh8+'],
          success: 'Qh8+ — the plus sign shows the move gives check.',
          failure: 'From d4, h8 is reached along the diagonal e5–f6–g7–h8.',
        },
      },
      {
        title: 'The knight',
        text:
          'The **knight** moves in an L-shape: two squares in one direction, then one square sideways. It is the ' +
          'only piece that can **jump over** other pieces, and it always lands on the opposite colour.\n\n' +
          'The circles show every square this knight can reach. Jump to f5.',
        fen: '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1',
        shapes: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'],
        task: {
          prompt: 'Move the knight to f5.',
          moves: ['Nf5'],
          failure:
            'Two squares one way, one square the other. f5 is two files right and one rank up.',
        },
      },
      {
        title: 'The king',
        text:
          'The **king** moves one square in any direction. It can never move onto a square attacked by an enemy ' +
          'piece, and it can never be captured — if it is attacked and cannot escape, the game ends in **checkmate**.\n\n' +
          'Move the king to d2.',
        fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        shapes: ['d1', 'd2', 'e2', 'f2', 'f1'],
        task: {
          prompt: 'Move the king to d2.',
          moves: ['Kd2'],
          failure: 'The king only moves one square at a time.',
        },
      },
      {
        title: 'The pawn',
        text:
          '**Pawns** move straight forward one square — or two squares on their very first move. They never move ' +
          'backwards.\n\nThis pawn has not moved yet. Advance it two squares.',
        fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
        shapes: ['e2e4'],
        task: {
          prompt: 'Advance the pawn two squares.',
          moves: ['e4'],
          failure: 'Pawns move forward. On its first move it may go two squares, to e4.',
        },
      },
      {
        title: 'Pawns capture diagonally',
        text:
          'Unlike every other piece, a pawn **captures differently from how it moves**: one square diagonally ' +
          'forward. It cannot capture the piece directly in front of it.\n\nCapture the black pawn.',
        fen: '4k3/8/8/8/3p4/4P3/8/4K3 w - - 0 1',
        shapes: ['e3d4:red'],
        task: {
          prompt: 'Capture the black pawn with your pawn.',
          moves: ['exd4'],
          success: 'exd4 — written with the file the pawn came from, then x, then the square.',
          failure: 'A pawn captures one square diagonally forward. Your pawn on e3 can take on d4.',
        },
      },
    ],
  },

  {
    id: 'special-moves',
    title: 'Castling, en passant and promotion',
    level: 'beginner',
    category: 'Rules',
    summary: 'The three special rules that trip up every new player.',
    minutes: 7,
    steps: [
      {
        title: 'Castling kingside',
        text:
          '**Castling** is the only move where two pieces move at once: the king slides two squares toward a rook, ' +
          'and the rook jumps over the king to the square next to it. It tucks the king into safety and brings a rook ' +
          'into play.\n\nTo castle on the board, move the king two squares toward the rook. Castle kingside now.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6'),
        shapes: ['e1g1', 'h1f1:blue'],
        task: {
          prompt: 'Castle kingside (O-O).',
          moves: ['O-O'],
          success: 'O-O — the king is safe behind its pawns and the rook is ready for action.',
          failure: 'Drag the king two squares to the right, onto g1. The rook moves automatically.',
        },
      },
      {
        title: 'Castling queenside',
        text:
          'You can also castle toward the queen’s rook. The king still moves two squares, to c1, and the rook ' +
          'lands on d1. It is written **O-O-O**.',
        fen: fenAfter('1. d4 d5 2. Nc3 Nf6 3. Bg5 Nbd7 4. Qd2 e6'),
        shapes: ['e1c1', 'a1d1:blue'],
        task: {
          prompt: 'Castle queenside (O-O-O).',
          moves: ['O-O-O'],
          failure: 'Move the king two squares to the left, onto c1.',
        },
      },
      {
        title: 'When castling is not allowed',
        text:
          'You may **not** castle if:\n\n' +
          '- the king or that rook has already moved,\n' +
          '- the king is in check,\n' +
          '- the king would pass through or land on an attacked square,\n' +
          '- there are pieces between the king and the rook.\n\n' +
          'Here the black bishop attacks f1, the square the king would cross — so kingside castling is illegal right now.',
        fen: '4k3/8/8/8/2b5/8/8/4K2R w K - 0 1',
        shapes: ['c4f1:red', 'f1:red'],
      },
      {
        title: 'En passant',
        text:
          'When a pawn advances two squares and lands **beside** an enemy pawn, that enemy pawn may capture it ' +
          '“in passing” (**en passant**) as if it had only moved one square. This is only possible on the very ' +
          'next move.\n\nBlack just played d7–d5, landing next to your e5 pawn. Capture it en passant.',
        fen: fenAfter('1. e4 c5 2. e5 d5'),
        shapes: ['e5d6:red', 'd5:red'],
        task: {
          prompt: 'Capture the d5 pawn en passant.',
          moves: ['exd6'],
          success: 'exd6 — the pawn on d5 disappears even though your pawn landed on d6.',
          failure: 'Move your e5 pawn diagonally to d6, the square the black pawn skipped over.',
        },
      },
      {
        title: 'Promotion',
        text:
          'A pawn that reaches the last rank is **promoted**: it must become a queen, rook, bishop or knight ' +
          'of the same colour. Almost always you will want a queen.\n\nPush the pawn to e8 and choose a queen.',
        fen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1',
        shapes: ['e7e8'],
        task: {
          prompt: 'Promote the pawn to a queen.',
          moves: ['e8=Q'],
          success: 'e8=Q. From a humble pawn to the strongest piece on the board.',
          failure: 'Move the pawn to e8, then pick the queen from the menu.',
        },
      },
    ],
  },

  {
    id: 'check-checkmate-stalemate',
    title: 'Check, checkmate and stalemate',
    level: 'beginner',
    category: 'Rules',
    summary: 'How games end — and the draw you must learn to avoid when you are winning.',
    minutes: 7,
    steps: [
      {
        title: 'Check',
        text:
          'When a king is attacked it is **in check**. You must deal with it immediately — you are not allowed to ' +
          'make any move that leaves your own king in check.\n\nGive check with your rook.',
        fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
        shapes: ['a1a8'],
        task: {
          prompt: 'Give check with the rook.',
          moves: ['Ra8+'],
          failure: 'The rook needs a clear line to the king. Try the a-file up to the back rank.',
        },
      },
      {
        title: 'Three ways out of check',
        text:
          'There are exactly three ways to answer a check:\n\n' +
          '- **Move** the king to a safe square,\n' +
          '- **Block** the attack with another piece,\n' +
          '- **Capture** the checking piece.\n\n' +
          'Black is in check from the rook on e1. Block the check with the bishop.',
        fen: '4k3/8/2b5/8/8/8/8/K3R3 b - - 0 1',
        orientation: 'black',
        shapes: ['e1e8:red', 'c6e4'],
        task: {
          prompt: 'Block the check with your bishop.',
          moves: ['Be4'],
          success: 'Be4 puts the bishop between the rook and the king.',
          failure:
            'The king can step aside too, but the task is to block: put the bishop on the e-file.',
        },
      },
      {
        title: 'Capturing the attacker',
        text: 'The rook on e1 is giving check along the first rank. The cleanest answer is to capture it.',
        fen: '5k2/8/8/8/4Q3/8/8/K3r3 w - - 0 1',
        shapes: ['e1a1:red', 'e4e1'],
        task: {
          prompt: 'Capture the rook that is giving check.',
          moves: ['Qxe1'],
          failure: 'Your queen can travel straight down the e-file and take the rook.',
        },
      },
      {
        title: 'Checkmate',
        text:
          '**Checkmate** is a check that cannot be answered at all: no escape square, no block, no capture. The game ' +
          'is over and the side giving mate wins.\n\nBlack’s king is hemmed in by its own pawns. Deliver checkmate in one move.',
        fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
        task: {
          prompt: 'Checkmate in one move.',
          moves: ['Ra8#'],
          acceptAnyMate: true,
          hint: 'The king cannot move forward because of its own pawns. Attack it along the back rank.',
          success:
            'Ra8# — a back-rank mate. Remember this pattern; it wins thousands of games every day.',
          failure:
            'That is not mate — the king can still escape. Look for a check the king cannot get away from.',
        },
      },
      {
        title: 'Stalemate',
        text:
          '**Stalemate** happens when the side to move is *not* in check but has **no legal move**. It is a draw — no ' +
          'matter how much material the other side has.\n\nHere Black is to move. The king on h8 is not in check, yet ' +
          'every square it could go to is attacked by the queen. Draw!',
        fen: '7k/5Q2/8/8/8/8/8/4K3 b - - 0 1',
        shapes: ['g8:red', 'h7:red', 'g7:red'],
      },
      {
        title: 'Avoid the stalemate trap',
        text:
          'When you are far ahead, always ask before each move: *does my opponent still have a legal move?* Here ' +
          'one natural queen move stalemates. Find the checkmate instead.',
        fen: '7k/8/4Q1K1/8/8/8/8/8 w - - 0 1',
        task: {
          prompt: 'Checkmate in one — and do not stalemate!',
          moves: ['Qe8#', 'Qc8#'],
          acceptAnyMate: true,
          hint: 'Your king already controls g7 and h7. Give check along the back rank.',
          success: 'Checkmate. The king covers g7 and h7, the queen covers the rest.',
          failure:
            'Not mate. If you played Qf7, look closely: Black has no legal moves but is not in check — that is stalemate, a draw.',
        },
      },
    ],
  },

  {
    id: 'piece-values',
    title: 'Piece values and good trades',
    level: 'beginner',
    category: 'Basics',
    summary: 'Count material like a strong player and stop losing pieces for nothing.',
    minutes: 5,
    steps: [
      {
        title: 'What each piece is worth',
        text:
          'A simple point system helps you judge trades:\n\n' +
          '- Pawn = **1**\n- Knight = **3**\n- Bishop = **3**\n- Rook = **5**\n- Queen = **9**\n\n' +
          'The king has no value because it can never be traded. Winning a rook for a knight (“winning the exchange”) ' +
          'gains 2 points; trading a bishop for a knight is roughly even.',
        fen: START,
      },
      {
        title: 'Take the more valuable piece',
        text:
          'Your knight can capture two different pieces. When you have a choice, take the one worth more — unless ' +
          'there is a good reason not to.',
        fen: '4k3/8/2r3p1/4N3/8/8/8/4K3 w - - 0 1',
        shapes: ['e5c6', 'e5g6'],
        task: {
          prompt: 'Capture the more valuable piece.',
          moves: ['Nxc6'],
          success: 'A rook (5) beats a pawn (1) every time.',
          failure: 'The pawn is worth 1 point; the rook is worth 5. Take the rook.',
        },
      },
      {
        title: 'Free pieces',
        text:
          'Before every move, glance around: is any enemy piece **undefended** and within reach? Here a bishop is ' +
          'hanging. Take it.',
        fen: '4k3/8/3b4/8/8/8/8/3QK3 w - - 0 1',
        task: {
          prompt: 'Win material by capturing the undefended piece.',
          moves: ['Qxd6'],
          failure: 'Look down the d-file: the bishop on d6 has nothing protecting it.',
        },
      },
      {
        title: 'Is it really free?',
        text:
          'The flip side: before you grab something, check what recaptures. A pawn protected by another pawn is ' +
          'not free — taking it with a knight loses 3 points for 1.\n\nHere the pawn on e5 is guarded by the pawn on ' +
          'd6. Do **not** take it; develop a piece instead.',
        fen: fenAfter('1. e4 e5 2. Nf3 d6'),
        shapes: ['d6e5:blue', 'f3e5:red'],
        task: {
          prompt: 'Develop a piece (do not take the protected pawn).',
          moves: ['Bc4', 'Nc3', 'd4', 'Bb5+', 'Be2', 'c3', 'd3'],
          failure:
            'Nxe5 loses a knight for a pawn after dxe5. Bring out a bishop or a knight instead.',
          success: 'Good. Solid development beats a greedy capture that loses material.',
        },
      },
    ],
  },

  {
    id: 'opening-principles',
    title: 'Opening principles',
    level: 'beginner',
    category: 'Basics',
    summary: 'Centre, development, king safety — the three ideas that make any opening work.',
    minutes: 8,
    steps: [
      {
        title: 'Fight for the centre',
        text:
          'The four central squares — d4, e4, d5, e5 — are the most important on the board. Pieces placed there ' +
          'reach the most squares. Start the game by claiming space in the centre with a pawn.',
        fen: START,
        shapes: ['d4:blue', 'e4:blue', 'd5:blue', 'e5:blue'],
        task: {
          prompt: 'Occupy the centre with a pawn.',
          moves: ['e4', 'd4'],
          success:
            'Both 1. e4 and 1. d4 are excellent — they are the two most popular moves in chess history.',
          failure: 'Move a central pawn (the d- or e-pawn) two squares forward.',
        },
      },
      {
        title: 'Knights before bishops',
        text:
          'Bring your pieces out toward the centre — that is **development**. Knights usually come first: their best ' +
          'squares (f3 and c3 for White) are obvious, while a bishop’s best diagonal depends on what the opponent does.',
        fen: fenAfter('1. e4 e5'),
        shapes: ['g1f3'],
        task: {
          prompt: 'Develop your king’s knight toward the centre.',
          moves: ['Nf3'],
          success: 'Nf3 develops a piece and attacks the e5 pawn at the same time.',
          failure: 'Move the knight from g1 to f3, where it eyes the centre.',
        },
      },
      {
        title: 'Develop with purpose',
        text:
          'Now the bishop. Put it on a diagonal where it does something: from **c4** it points at f7, the weakest ' +
          'square next to Black’s king; from **b5** it pressures the knight that defends e5.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6'),
        shapes: ['f1c4', 'f1b5'],
        task: {
          prompt: 'Develop your bishop to an active square.',
          moves: ['Bc4', 'Bb5'],
          failure: 'Aim for c4 (the Italian Game) or b5 (the Ruy Lopez).',
        },
      },
      {
        title: 'Castle early',
        text:
          'Once your knight and bishop are out, castle. Your king gets behind a wall of pawns and your rook joins ' +
          'the game. Most strong players castle within the first ten moves.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
        task: {
          prompt: 'Castle kingside.',
          moves: ['O-O'],
          failure: 'Move the king two squares toward the h1 rook.',
        },
      },
      {
        title: 'Do not rush the queen out',
        text:
          'Beginners love early queen raids, hoping for the four-move “Scholar’s mate” on f7. Against a careful ' +
          'opponent the queen just gets chased around while the other side develops.\n\nWhite threatens **Qxf7#**. ' +
          'Defend f7 — ideally with a move that also helps you develop.',
        fen: fenAfter('1. e4 e5 2. Qh5 Nc6 3. Bc4'),
        orientation: 'black',
        shapes: ['h5f7:red', 'c4f7:red'],
        task: {
          prompt: 'Stop the mate threat on f7.',
          moves: ['g6', 'Qe7', 'Qf6', 'Nh6'],
          hint: 'You can block the queen’s path, attack the queen, or put a defender on f7.',
          success: 'Well defended. Now Black will gain time chasing the exposed queen.',
          failure: 'That allows Qxf7 checkmate. Cover f7 or block the h5–f7 diagonal.',
        },
      },
      {
        title: 'Summary',
        text:
          'Every good opening follows the same recipe:\n\n' +
          '1. Take space in the centre with pawns.\n' +
          '2. Develop knights, then bishops, toward the centre.\n' +
          '3. Castle early.\n' +
          '4. Connect the rooks and only then start a plan.\n\n' +
          'Avoid moving the same piece twice, pushing too many pawns, or bringing the queen out before your pieces.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O'),
      },
    ],
    practiceThemes: ['opening'],
  },

  {
    id: 'basic-checkmates',
    title: 'Basic checkmates',
    level: 'beginner',
    category: 'Checkmates',
    summary:
      'Back-rank mate, the two-rook ladder, and mating with king and queen or king and rook.',
    minutes: 10,
    steps: [
      {
        title: 'The back-rank mate',
        text:
          'A king that castled and never moved its pawns is trapped on its back rank. If nothing guards that rank, ' +
          'a rook or queen check is mate.\n\nFind it.',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rd8#'],
          acceptAnyMate: true,
          failure: 'Look at the black king’s back rank — is anything defending d8?',
        },
      },
      {
        title: 'The ladder mate: cut off the king',
        text:
          'With two rooks you can force mate anywhere on the board using a **ladder**: one rook takes a rank away ' +
          'from the king, the other gives check on the next rank, and they leapfrog toward the edge.\n\nThe black king ' +
          'is already on the edge. First take away the 7th rank so it can never leave.',
        fen: '3k4/8/8/8/8/8/R7/4K2R w - - 0 1',
        shapes: ['a2a7'],
        task: {
          prompt: 'Confine the king to the back rank.',
          moves: ['Ra7'],
          reply: 'Kc8',
          success: 'Now the king can only shuffle along the 8th rank.',
          failure: 'Put a rook on the 7th rank. The king will then be unable to come forward.',
        },
      },
      {
        title: 'The ladder mate: finish',
        text: 'The king is stuck on the back rank. Deliver mate with the other rook — from far away, so it cannot be captured.',
        fen: '2k5/R7/8/8/8/8/8/4K2R w - - 2 2',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rh8#'],
          acceptAnyMate: true,
          failure:
            'Give check along the back rank with the rook on h1. The other rook already guards the 7th rank.',
        },
      },
      {
        title: 'King and queen vs king',
        text:
          'The queen alone cannot mate — you need your king’s help. The method: use the queen to shrink the ' +
          '“box” around the enemy king, bring your king up, and mate on the edge.\n\nKeep the queen a **knight’s move** ' +
          'away from the enemy king while boxing it in: it can never be attacked there, and stalemate is impossible.\n\n' +
          'Here the box is complete. Finish the job.',
        fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Qg7#'],
          acceptAnyMate: true,
          hint: 'The queen needs to be protected by your king when she goes next to the enemy king.',
          failure:
            'Not mate. Move the queen right next to the black king, on a square your own king protects.',
        },
      },
      {
        title: 'King and rook vs king',
        text:
          'With a rook it is slower but the idea is the same: push the king to the edge with the rook, and use your ' +
          'king to take away escape squares. When the kings face each other with one square between them (the ' +
          '**opposition**), a rook check on the edge is mate.',
        fen: '3k4/8/3K4/8/8/8/8/7R w - - 0 1',
        shapes: ['d6:blue', 'd8:blue'],
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Rh8#'],
          acceptAnyMate: true,
          failure:
            'Your king already stops the black king from coming forward. Check along the back rank.',
        },
      },
    ],
    practiceThemes: ['mateIn1', 'backRankMate'],
  },
];
