import { fenAfter, type Lesson } from '../model';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const beginnerLessons: Lesson[] = [
  {
    id: 'the-board',
    title: 'The board and the notation',
    level: 'beginner',
    category: 'Rules',
    summary: 'Files, ranks, square names and how to read a chess move.',
    minutes: 6,
    steps: [
      {
        title: 'Files and ranks',
        text:
          'Before we move a single piece, let’s learn the map. The board is a grid of 64 squares, eight by ' +
          'eight. The columns are called **files** and are lettered **a** to **h**, from White’s left to right. ' +
          'The rows are **ranks**, numbered **1** to **8**, starting from White’s side.\n\n' +
          'Put the two together and every square has a name: file first, then rank. The circled corners are ' +
          '**a1** and **h8**. Learn these names early. Every book, video and game record uses them, and after a ' +
          'few weeks you will simply *see* e4 instead of counting to it.',
        fen: START,
        shapes: ['a1:blue', 'h8:blue'],
      },
      {
        title: 'Setting up: light on the right',
        text:
          'Two habits make setting up the board foolproof:\n\n' +
          '- **Light on the right.** Each player has a light square in the right-hand corner. For White that is h1.\n' +
          '- **The queen on her own colour.** The white queen starts on the light square d1, the black queen on the ' +
          'dark square d8.\n\n' +
          'The kings stand next to their queens on the e-file, facing each other. If a position ever looks strange, ' +
          'check the corner first: a board turned the wrong way swaps the kings and queens, and nothing you learn ' +
          'about openings will match.',
        fen: START,
        shapes: ['h1:blue', 'd1:green', 'd8:green'],
      },
      {
        title: 'Reading a move',
        text:
          'A move is written as the piece’s letter and the square it goes to. **Nf3** means a knight (N, because ' +
          'K is taken by the king) goes to f3; **Bc4** means a bishop goes to c4. Pawns get no letter at all: ' +
          '**e4** simply means a pawn goes to e4.\n\n' +
          'A few symbols complete the language: **x** for a capture (Bxe5), **+** for check, **#** for ' +
          'checkmate and **O-O** for castling.\n\nLet’s read and play the most popular first move in chess.',
        fen: START,
        shapes: ['e2e4'],
        task: {
          prompt: 'Can you play the move e4?',
          moves: ['e4'],
          hint: 'The e-file is the fifth column from the left, the one your king stands on. Move that pawn up to the fourth rank.',
          success:
            'That is **1. e4**: the pawn takes a central square and opens lines for your queen and the bishop on f1.',
          why:
            'Notation is how you replay any game ever played, your own included. Reading your moves back after a ' +
            'game is the quickest way to find where it turned, and every move in these lessons is written this way.',
          wrong: {
            e3: 'That is **e3**: the right pawn, but only one square. On its first move a pawn may go one or two squares, and e4 is two.',
            d4: 'That is **d4**, the pawn in front of the queen. Look one file to the right: the e-file runs through your king.',
          },
          failure:
            'Not quite. Find the e-file (the fifth column, where your king stands) and move that pawn up to the fourth rank.',
        },
      },
      {
        title: 'Reading a capture',
        text:
          'When a piece captures, an **x** goes between the piece and the square: **Nxe5** reads “knight takes ' +
          'on e5”. A pawn capture names the file the pawn came from, so a pawn on e4 taking on d5 is **exd5**.\n\n' +
          'Here Black has just played 2...Nf6. The three dots mean a Black move. Instead of defending the pawn on ' +
          'e5, Black attacks yours on e4. You can take first.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nf6'),
        shapes: ['f3e5'],
        task: {
          prompt: 'Read it and play it: Nxe5.',
          moves: ['Nxe5'],
          hint: 'N is a knight, x is a capture, e5 is where it lands. Which of your knights can reach e5?',
          success: '**3. Nxe5**: your knight takes the pawn on e5.',
          why:
            'This is a real opening, the Petrov Defence. Black usually answers 3...d6, chasing the knight away, and ' +
            'wins the e4 pawn back a move later. Being able to read lines like that is what lets you follow them in ' +
            'your head before you play them.',
          failure:
            'That is a different move. Read it again: N is the knight, x means it captures, and e5 is where it lands. Your knight on f3 can take there.',
        },
      },
      {
        title: 'Coordinates from Black’s side',
        text:
          'When you play Black the board turns round, but the squares keep their names: a1 is still White’s ' +
          'bottom-left corner, which now sits at your top right. Half of your games will be seen from this side, ' +
          'so it pays to read the board both ways.\n\nWhite has opened with 1. e4. The classic answer mirrors it.',
        fen: fenAfter('1. e4'),
        orientation: 'black',
        shapes: ['e7e5'],
        task: {
          prompt: 'Play e5 for Black.',
          moves: ['e5'],
          hint: 'From Black’s side the files run from h to a. Find the pawn in front of your king.',
          success: '**1...e5**: Black claims the same share of the centre as White.',
          why:
            'e5 takes a central square and opens lines for Black’s queen and the bishop on f8. Many of the great ' +
            'openings, the Italian Game and the Ruy Lopez among them, start from exactly this position, so you will ' +
            'see it again and again.',
          wrong: {
            e6: '**e6** is a real opening (the French Defence), but I asked for **e5**: two squares, to the fifth rank.',
            d5: 'That is **d5**, the queen’s pawn. It is a real opening too, but the e-pawn is the one in front of your king.',
          },
          failure:
            'Not that one. Find the pawn in front of your king, on e7, and move it two squares, to e5.',
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
    minutes: 9,
    steps: [
      {
        title: 'The rook',
        text:
          'Meet the **rook**. It moves in straight lines, along a rank or a file, as many squares as it likes, as ' +
          'long as nothing is in the way. It cannot jump over pieces, and it captures by landing on an enemy piece ' +
          'in its path.\n\nThe arrows show the rook’s four directions. On an empty board a rook reaches 14 ' +
          'squares wherever it stands.',
        fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1',
        shapes: ['d4d8', 'd4h4', 'd4a4', 'd4d1'],
        task: {
          prompt: 'Slide the rook to h4, at the far right of its rank.',
          moves: ['Rh4'],
          hint: 'The rook stands on the fourth rank. Follow that row to the right until the board ends.',
          success: 'One move along the fourth rank, from d4 all the way to h4.',
          why:
            'A rook is happiest on open lines, where nothing blocks it: from h4 it still sweeps the whole fourth ' +
            'rank and the h-file. In real games rooks wake up late, once pawns have cleared a file for them, and ' +
            'then they are worth about five pawns.',
          failure:
            'Not quite. Stay on the rook’s own row, the fourth rank, and slide it right until it reaches the h-file.',
        },
      },
      {
        title: 'The bishop',
        text:
          'The **bishop** moves diagonally, any distance, and it cannot jump either. Because it only ever moves ' +
          'diagonally, a bishop never changes colour: this one stands on the dark square d4, so it will live on ' +
          'dark squares all game. That is why each side gets two bishops, one for each colour.',
        fen: '4k3/8/8/8/3B4/8/8/4K3 w - - 0 1',
        shapes: ['d4g7', 'd4a1', 'd4a7', 'd4g1'],
        task: {
          prompt: 'Move the bishop to g7.',
          moves: ['Bg7'],
          hint: 'Go up and to the right, one diagonal step at a time: e5, f6, then g7.',
          success: 'Along the long diagonal from d4 to g7, dark squares all the way.',
          why:
            'Half of the board is out of this bishop’s reach for good: anything standing on a light square is safe ' +
            'from it. That is the bishop’s weakness, and the reason the two bishops work best as a pair, one ' +
            'covering each colour.',
          failure:
            'Not g7. Remember the bishop only moves diagonally: from d4, follow the diagonal up and to the right through e5 and f6.',
        },
      },
      {
        title: 'The queen',
        text:
          'The **queen** moves like a rook *and* a bishop: straight lines and diagonals, any distance. From the ' +
          'middle of an empty board she reaches 27 squares, which makes her the strongest piece, worth about nine ' +
          'pawns.\n\nShe is also the piece you can least afford to lose, so here is a habit worth starting now: ' +
          'before every queen move, check whether an enemy piece can take her where she lands.',
        fen: '4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1',
        shapes: ['d4h8', 'd4d8', 'd4h4', 'd4a1'],
        task: {
          prompt: 'Move the queen to h8, and notice what it does to the black king.',
          moves: ['Qh8+'],
          hint: 'h8 is the top-right corner. From d4 the diagonal through e5, f6 and g7 leads straight there.',
          success:
            'The queen lands in the corner and attacks the king along the eighth rank: check. The + sign marks it.',
          why:
            'In one move the queen crossed the board and attacked the king. That range is her power. It is also why ' +
            'strong players keep her back early in the game: out in the open, enemy pieces chase her and gain moves ' +
            'for themselves while doing it.',
          failure:
            'Not h8. Take the long diagonal from d4 up to the top-right corner: e5, f6, g7, h8.',
        },
      },
      {
        title: 'The knight',
        text:
          'The **knight** is the odd one out. It moves in an L: two squares in one direction, then one square to ' +
          'the side. It is the only piece that **jumps**, so pieces in its way do not matter.\n\nThe circles show ' +
          'every square this knight can reach. Notice that they are all light squares, while the knight stands on ' +
          'a dark one: a knight changes colour with every jump.',
        fen: '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1',
        shapes: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'],
        task: {
          prompt: 'Jump the knight to f5.',
          moves: ['Nf5'],
          hint: 'Two squares to the right takes you to f4; one more square up and you are there.',
          success: 'Two files across and one rank up: a perfect L.',
          why:
            'Knights are short-range, so they need to be near the action. In the centre this knight reaches eight ' +
            'squares; on the edge only four, and in a corner just two. Players say “a knight on the rim is dim”. ' +
            'And since a knight jumps, its attacks are the easiest to miss: always look for them.',
          failure:
            'Not f5. Count the L from d4: two squares to the right (to f4), then one square up.',
        },
      },
      {
        title: 'The king',
        text:
          'The **king** moves one square in any direction. It is the most important piece, yet one of the weakest: ' +
          'it may never step onto a square an enemy piece attacks, and when it is attacked and cannot escape, the ' +
          'game is over. That is **checkmate**.\n\nThe circles show where this king can go.',
        fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        shapes: ['d1', 'd2', 'e2', 'f2', 'f1'],
        task: {
          prompt: 'Step the king to d2.',
          moves: ['Kd2'],
          success: 'One diagonal step, up and to the left.',
          why:
            'While the board is full of pieces, the king hides behind its pawns: there is too much that could attack ' +
            'it. In the endgame, with few pieces left, it becomes a fighter that marches up the board to help its ' +
            'pawns. You will meet both sides of the king in later lessons.',
          failure:
            'Not d2. The king moves just one square: d2 is the square up and to the left of e1.',
        },
      },
      {
        title: 'The pawn',
        text:
          '**Pawns** move straight forward, one square at a time, but on its very first move a pawn may advance ' +
          'two squares instead. Pawns never move backwards or sideways.\n\nThis pawn is still on its starting ' +
          'square, so it has the choice.',
        fen: '4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1',
        shapes: ['e2e4'],
        task: {
          prompt: 'Advance the pawn two squares.',
          moves: ['e4'],
          success: 'Two squares in one go, allowed only from the starting square.',
          why:
            'A pawn can never come back, so every pawn move changes the position for good: the squares it used to ' +
            'guard stay unguarded for the rest of the game. That is a reason to think twice before pushing one.',
          wrong: {
            e3: 'That is legal (one square is always allowed), but I asked for two. On its first move the pawn can reach e4 in one go.',
          },
          failure: 'The pawn on e2 is the one to move: two squares straight forward, to e4.',
        },
      },
      {
        title: 'Pawns capture diagonally',
        text:
          'Here is the pawn’s quirk: it **captures differently from how it moves**. It moves straight ahead, but ' +
          'it takes one square diagonally forward. It cannot capture the piece directly in front of it, which is ' +
          'why two pawns face to face block each other.\n\nYour pawn on e3 and the black pawn on d4 touch diagonally.',
        fen: '4k3/8/8/8/3p4/4P3/8/4K3 w - - 0 1',
        shapes: ['e3d4:red'],
        task: {
          prompt: 'Capture the black pawn with your pawn.',
          moves: ['exd4'],
          hint: 'Diagonally forward from e3 means d4 or f4. Which one has a black pawn on it?',
          success:
            '**exd4**. A pawn capture is written with the file it came from: e, then x, then the square.',
          why:
            'Pawns guard the two squares diagonally in front of them, which makes them fine defenders of your other ' +
            'pieces. They are good attackers too: a pawn that attacks a knight or bishop wins time, because the ' +
            'piece is worth more and has to move away.',
          wrong: {
            e4: 'That pushes your pawn to e4, straight past the black pawn. Pawns never capture straight ahead: they take diagonally, and the black pawn sits diagonally in front of yours.',
          },
          failure:
            'Not quite. A pawn captures one square diagonally forward: from e3 the black pawn on d4 is in reach.',
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
    minutes: 8,
    steps: [
      {
        title: 'Castling kingside',
        text:
          '**Castling** is the one move where two pieces move at once: the king steps two squares toward a rook, ' +
          'and the rook hops over to the square on the king’s other side. In one move the king leaves the centre ' +
          'for a corner behind its pawns, and the rook comes toward the middle, where it can join the fight.\n\n' +
          'Black has castled already. Your knight and bishop have left g1 and f1, so your way is clear too. To ' +
          'castle, just move the king two squares toward the rook.',
        fen: fenAfter('1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5'),
        shapes: ['e1g1', 'h1f1:blue'],
        task: {
          prompt: 'Castle kingside: move the king two squares to the right.',
          moves: ['O-O'],
          success: '**O-O**: the king is tucked away on g1, and the rook has come to f1.',
          why:
            'The centre is where pawns get traded and files open, and a king left on e1 would soon face rooks and a ' +
            'queen down those files. Castling solves that and brings a rook toward the middle in the same move, ' +
            'which is why most strong players castle within their first ten moves.',
          wrong: {
            Kf1: 'That is a one-square king step, and once the king has moved it may never castle. Castling means the king goes **two** squares, to g1, with the rook hopping over.',
          },
          failure:
            'That is not castling. Put the king two squares to the right, on g1, and the rook jumps over to f1 by itself.',
        },
      },
      {
        title: 'Castling queenside',
        text:
          'You can also castle toward the other rook, on the queen’s side. The king still moves two squares, to ' +
          'c1, and the rook jumps to d1. It is written **O-O-O**: three O’s for the longer side.\n\nWhite has ' +
          'cleared b1, c1 and d1 on purpose here. With the king on c1, White plans to throw the kingside pawns ' +
          'forward at Black’s castled king, without exposing its own.',
        fen: fenAfter(
          '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6',
        ),
        shapes: ['e1c1', 'a1d1:blue'],
        task: {
          prompt: 'Castle queenside: move the king two squares to the left.',
          moves: ['O-O-O'],
          success: '**O-O-O**: king on c1, rook on d1, straight onto the central file.',
          why:
            'Castling long puts the rook on the d-file at once, though the king sits a little less snugly than on ' +
            'g1. Players choose it to attack on the other wing: when the kings castle on opposite sides, each side ' +
            'can storm with pawns without weakening its own king.',
          wrong: {
            Kd1: 'That is a one-square king step, and a king that has moved may never castle. Castling queenside means two squares, to c1.',
          },
          failure:
            'That is not castling. Move the king two squares to the left, onto c1, and the a1 rook jumps over to d1.',
        },
      },
      {
        title: 'When castling is not allowed',
        text:
          'Castling comes with conditions. You may **not** castle if:\n\n' +
          '- the king or that rook has already moved,\n' +
          '- the king is in check,\n' +
          '- the king would pass through or land on a square an enemy piece attacks,\n' +
          '- there are pieces between the king and the rook.\n\n' +
          'Here the black bishop on c4 attacks f1, the square the king would cross, so White cannot castle ' +
          'kingside right now. Not ever? No: once the bishop leaves that diagonal, castling is allowed again. Only ' +
          'moving the king or the rook takes the right away for good.',
        fen: '4k3/8/8/8/2b5/8/8/4K2R w K - 0 1',
        shapes: ['c4f1:red', 'f1:red'],
      },
      {
        title: 'En passant',
        text:
          '**En passant** (“in passing”) is the strangest rule. When a pawn uses its two-square first move to ' +
          'land right **beside** one of your pawns, your pawn may capture it as if it had moved only one square, ' +
          'landing on the square it skipped.\n\nBlack has just played d7–d5, right next to your pawn on e5. The ' +
          'square it skipped, d6, is where your pawn lands.',
        fen: fenAfter('1. e4 c5 2. e5 d5'),
        shapes: ['e5d6:red', 'd5:red'],
        task: {
          prompt: 'Capture the d5 pawn en passant.',
          moves: ['exd6'],
          hint: 'Your pawn on e5 captures diagonally onto d6, the square the black pawn passed over.',
          success: '**exd6**: your pawn lands on d6, and the pawn on d5 disappears from the board.',
          why:
            'Without this rule a pawn could use its double step to slip past an enemy pawn that guards the square it ' +
            'skips. En passant closes that loophole, but only at once: if you do not take on the very next move, the ' +
            'chance is gone for good.',
          wrong: {
            e6: {
              text: 'Pushing on lets the chance slip away: en passant is allowed only straight after the double step. And now Black simply takes your pawn.',
              refute: 'Bxe6',
            },
          },
          failure:
            'Not this time. Capture en passant: your e5 pawn moves diagonally onto d6, the square the black pawn skipped, and takes it.',
        },
      },
      {
        title: 'Promotion',
        text:
          'A pawn that reaches the far end of the board is **promoted**: it turns into a queen, rook, bishop or ' +
          'knight of its own colour, whichever you choose. You can even have two queens.\n\nThis pawn is one step ' +
          'from the end, and nothing can stop it.',
        fen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1',
        shapes: ['e7e8'],
        task: {
          prompt: 'Push the pawn to e8 and make it a queen.',
          moves: ['e8=Q'],
          hint: 'Move the pawn to e8, and the board will ask which piece you want. Choose the queen.',
          success: '**e8=Q**: a pawn worth one point has become a queen worth nine.',
          why:
            'That jump in value is why, in the endgame, a pawn no enemy pawn can stop is so dangerous, and why races ' +
            'to promote decide so many games. You will nearly always choose a queen; now and then a knight or a rook ' +
            'is the better choice, but that is rare.',
          failure: 'Promote to a queen: push the pawn to e8, then pick the queen.',
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
    minutes: 8,
    steps: [
      {
        title: 'Check',
        text:
          'When a king is attacked, it is **in check**. The rules do not let you ignore a check: your very next ' +
          'move must get your king out of it. And you may never make a move that puts your own king in check.\n\n' +
          'That makes a check the most forcing move in chess. Your opponent has to answer it, whatever else they ' +
          'had planned.',
        fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
        shapes: ['a1a8'],
        task: {
          prompt: 'Give check with your rook.',
          moves: ['Ra8+'],
          hint: 'The black king is on e8, on the eighth rank. Can your rook reach that rank?',
          success: '**Ra8+**: the rook attacks the king along the eighth rank. Check.',
          why:
            'For one move you decide what happens on the board, because Black has to deal with the check. But a ' +
            'check is only good when it gains something: a pointless check can drive the king to a better square. ' +
            'Before you give one, ask what it achieves.',
          failure:
            'That is not check. The rook needs a clear line to the king: the a-file leads up to the eighth rank, where the king stands.',
        },
      },
      {
        title: 'Three ways out of check',
        text:
          'There are exactly three ways out of a check:\n\n' +
          '- **Move** the king to a safe square,\n' +
          '- **Block** the line of attack with a piece,\n' +
          '- **Capture** the piece giving check.\n\n' +
          'The white rook on e1 checks your king down the e-file. The king could step aside, but there is a neater ' +
          'answer: put the bishop in the way.',
        fen: '4k3/8/2b5/5p2/8/8/8/K3R3 b - - 0 1',
        orientation: 'black',
        shapes: ['e1e8:red', 'c6e4'],
        task: {
          prompt: 'Block the check with your bishop.',
          moves: ['Be4'],
          hint: 'Which square on the e-file can the bishop on c6 reach?',
          success:
            '**Be4**: the bishop stands between the rook and the king, and the check is blocked.',
          why:
            'A block is only as good as its protection. The pawn on f5 guards e4, so if the rook takes the bishop, ' +
            'the pawn takes the rook, and White loses five points for three. An unprotected blocker would simply be ' +
            'captured, often with another check.',
          failure:
            'Moving the king is legal too, but this time block: find the square on the e-file that the bishop on c6 can reach.',
        },
      },
      {
        title: 'Capturing the attacker',
        text:
          'Now you are the one in check: the black rook on e1 attacks your king along the first rank. Before you ' +
          'run or block, always ask the simplest question first: **can I take the piece that is checking me?**',
        fen: '5k2/8/8/8/4Q3/8/8/K3r3 w - - 0 1',
        shapes: ['e1a1:red'],
        task: {
          prompt: 'What is the best way out of this check?',
          moves: ['Qxe1'],
          hint: 'Look at the rook on e1. Is it protected? Can any of your pieces reach it?',
          success: '**Qxe1**: the checking rook is gone, and you are a whole queen up.',
          why:
            'Taking the attacker ends the check and wins material in the same move, which beats both other answers ' +
            'here. With only the kings and your queen left, mate is now a matter of technique. Make it a habit: in ' +
            'check, look for a capture first.',
          wrong: {
            Qb1: {
              text: 'Blocking on b1 stops the check, but the rook takes your queen. After Kxb1 only the two kings are left: a draw.',
              refute: 'Rxb1+',
            },
          },
          failure:
            'That gets you out of check, but the rook lives on. Look again: your queen can reach it.',
        },
      },
      {
        title: 'Checkmate',
        text:
          '**Checkmate** is a check with no answer at all: the king cannot move to safety, nothing can block, and ' +
          'nothing can take the checking piece. The game ends on the spot, and the side giving mate wins.\n\nLook ' +
          'at Black’s king. Its own pawns on f7, g7 and h7 stand in front of it like a wall.',
        fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
        task: {
          prompt: 'Find the checkmate in one move.',
          moves: ['Ra8#'],
          acceptAnyMate: true,
          hint: 'The king cannot step forward past its pawns. Where can your rook attack it?',
          success:
            '**Ra8#**: the rook checks along the back rank, and the king is trapped behind its own pawns.',
          why:
            'This is the **back-rank mate**, one of the most common ways games end at every level. The pawns that ' +
            'shelter a castled king also cage it. Strong players often give their own king an escape square, with a ' +
            'pawn move such as h3, at a quiet moment.',
          failure:
            'Not mate yet. Find a check the king cannot step out of, cannot block and cannot capture.',
        },
      },
      {
        title: 'Stalemate',
        text:
          '**Stalemate** is the trap on the other side of checkmate. It happens when the player to move is ' +
          '**not** in check but has **no legal move**. The game ends at once as a **draw**, however much ' +
          'material the other side has.\n\nHere it is Black’s move. The king on h8 is not in check, yet every ' +
          'square it could go to (g8, g7 and h7) is covered by the white queen. Black cannot move, so the game is ' +
          'drawn. White was a queen up and threw the win away.',
        fen: '7k/5Q2/8/8/8/8/8/4K3 b - - 0 1',
        shapes: ['g8:red', 'h7:red', 'g7:red'],
      },
      {
        title: 'Avoid the stalemate trap',
        text:
          'So when you are winning, build one habit: before every move, ask **does my opponent still have a ' +
          'legal move?** Squeezing the king is good, but take away its last square only with a check.\n\nYour ' +
          'king on g6 already covers g7 and h7. One tempting queen move takes away g8 as well, and it is not check.',
        fen: '7k/8/4Q1K1/8/8/8/8/8 w - - 0 1',
        task: {
          prompt: 'Checkmate in one, without stalemating.',
          moves: ['Qe8#', 'Qc8#'],
          acceptAnyMate: true,
          hint: 'The black king can only move along the back rank. Which queen move checks it there?',
          success:
            'Checkmate: the queen checks along the eighth rank, and your king covers g7 and h7.',
          why:
            'The difference between this and Qf7 is a single thing: check. Qf7 covers every square but does not ' +
            'attack the king, so Black, with no move, is stalemated. A queen on the eighth rank covers those squares ' +
            '*and* attacks the king. With a lone king left, count its moves before every move you make.',
          wrong: {
            Qf7: 'That is the trap: the king is not in check, yet every square around it is covered. Black has no legal move, so it is stalemate, a draw. Give the king a check instead.',
          },
          failure:
            'Not mate: the black king still has a move. Your king covers g7 and h7, so the queen needs to check along the back rank.',
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
    minutes: 6,
    steps: [
      {
        title: 'What each piece is worth',
        text:
          'To judge a trade, players count in **points**:\n\n' +
          '- Pawn = **1**\n- Knight = **3**\n- Bishop = **3**\n- Rook = **5**\n- Queen = **9**\n\n' +
          'The king has no value: it can never be traded. Giving a knight for a rook gains two points, which ' +
          'players call **winning the exchange**; a bishop for a knight is an even trade.\n\nThe numbers are a ' +
          'guide, not a law. A well-placed knight can beat a buried rook, and checkmate beats any count. But when ' +
          'you are unsure whether to take, count.',
        fen: START,
      },
      {
        title: 'Take the more valuable piece',
        text:
          'Your knight on e5 attacks two black pieces: the rook on c6 and the pawn on g6. Neither one is ' +
          'protected. When you have a choice of captures, compare what you would win.',
        fen: '4k3/8/2r3p1/4N3/8/8/8/4K3 w - - 0 1',
        shapes: ['e5c6', 'e5g6'],
        task: {
          prompt: 'Which capture wins more?',
          moves: ['Nxc6'],
          hint: 'Count it out: a rook is worth five, a pawn one.',
          success: '**Nxc6**: a rook for nothing, five points.',
          why:
            'Both captures were free, so it came down to value. Make the comparison a habit before every capture: ' +
            'what do I win, and what can they take back? Nothing could recapture here, so the bigger piece was ' +
            'simply the better meal.',
          wrong: {
            Nxg6: 'A free pawn is nice, but the rook was free too, and it is worth five pawns. Take the bigger prize.',
          },
          failure:
            'That leaves both pieces where they are. Your knight can take the rook on c6 or the pawn on g6: pick the one worth more.',
        },
      },
      {
        title: 'Free pieces',
        text:
          'Most games between beginners are not decided by brilliant combinations but by pieces left **hanging**: ' +
          'attacked and unprotected. So before every move, take a quick look: is any enemy piece undefended and ' +
          'within my reach?\n\nThere is one on this board.',
        fen: '4k3/8/3b4/8/8/8/8/3QK3 w - - 0 1',
        task: {
          prompt: 'Win the piece that has no protection.',
          moves: ['Qxd6'],
          hint: 'Look up the d-file from your queen.',
          success: '**Qxd6**: the bishop had no defender, so it is simply yours.',
          why:
            'Nothing could take back on d6, so this was a clean three points. The same quick look works the other ' +
            'way too: before you let go of a piece, ask what of yours is left unprotected. Most blunders are missed ' +
            'in that one second.',
          failure:
            'Not that. One black piece has no protection at all, and your queen can reach it straight up the d-file.',
        },
      },
      {
        title: 'Is it really free?',
        text:
          'Now the other side of the coin. Before you grab something, check what can take back. The pawn on e5 ' +
          'looks tempting, but the pawn on d6 protects it: if your knight takes, the d6 pawn takes your knight, and ' +
          'you have given three points for one.\n\nIn the opening, the better plan is to bring out a new piece.',
        fen: fenAfter('1. e4 e5 2. Nf3 d6'),
        shapes: ['d6e5:blue', 'f3e5:red'],
        task: {
          prompt: 'Make a good developing move, and leave the e5 pawn alone.',
          moves: ['Bc4', 'Nc3', 'd4', 'Bb5+', 'Be2', 'c3', 'd3'],
          hint: 'A bishop or your other knight can come out, or a pawn can claim the centre.',
          success: 'A new piece or pawn joins the game, and your knight stays where it is safe.',
          why:
            'Development is worth more than a pawn you cannot keep. Every piece you bring out makes your later ' +
            'attacks stronger, while a capture that loses a piece leaves you a knight short for the rest of the ' +
            'game. A protected pawn is not a free pawn.',
          wrong: {
            Nxe5: {
              text: 'That is the trap: the pawn on d6 takes back, and you have given a knight (three points) for a pawn (one).',
              refute: 'dxe5',
            },
          },
          failure:
            'That is not the best use of the move. Bring out a new piece (a knight or a bishop), or claim the centre with d4.',
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
    minutes: 9,
    steps: [
      {
        title: 'Fight for the centre',
        text:
          'The four squares in the middle of the board (d4, e4, d5 and e5) are the most valuable ones. A piece in ' +
          'the centre reaches more squares than one on the edge, and from there it can switch quickly to either ' +
          'side.\n\nSo most good openings start by putting a pawn in the centre, which also opens lines for the ' +
          'pieces behind it.',
        fen: START,
        shapes: ['d4:blue', 'e4:blue', 'd5:blue', 'e5:blue'],
        task: {
          prompt: 'Start the game by putting a pawn in the centre.',
          moves: ['e4', 'd4'],
          hint: 'Which pawns stand in front of your king and your queen?',
          success:
            'The pawn controls central squares and opens a line for your queen and a bishop.',
          why:
            '1. e4 and 1. d4 are the two most popular first moves in history for exactly this reason: in one move ' +
            'they take space in the centre and free a bishop and the queen. Every opening principle after this one ' +
            'builds on it.',
          wrong: {
            c4: '**c4** is a good move too (the English Opening): it fights for d5 from the side. But here, put a pawn right in the middle: the d- or the e-pawn.',
            Nf3: '**Nf3** is a fine move as well: it watches d4 and e5. But this step is about putting a pawn right in the centre.',
            e3: '**e3** is solid but timid: the pawn stops on the third rank and closes the diagonal of your c1 bishop. Go two squares and claim the centre itself.',
          },
          failure:
            'That does not put a pawn in the centre. Push the pawn in front of your king or your queen two squares forward.',
        },
      },
      {
        title: 'Knights before bishops',
        text:
          'Next, bring your pieces out. That is **development**, and it wins games: the side with more pieces in ' +
          'play usually has the stronger attacks.\n\nStart with the knights. Their best squares (f3 and c3 for ' +
          'White) are clear from the first move, while the right square for a bishop often depends on what your ' +
          'opponent does. A knight on f3 also has a job right away: look at what it attacks.',
        fen: fenAfter('1. e4 e5'),
        shapes: ['g1f3'],
        task: {
          prompt: 'Develop your king’s knight toward the centre.',
          moves: ['Nf3'],
          hint: 'The king’s knight starts on g1. Which square in front of it points at the centre?',
          success: '**Nf3**: the knight develops and attacks the pawn on e5.',
          why:
            'Now Black has to spend the next move defending e5. Developing a piece *with a threat* is how you gain ' +
            'time in the opening: your piece comes out, and your opponent’s reply is decided for them. The best ' +
            'developing moves usually do something like this.',
          wrong: {
            Nc3: '**Nc3** develops too (the Vienna Game), but I asked for the king’s knight: the one on g1, which would also hit e5.',
            Bc4: '**Bc4** is playable, but the knight’s best square is already clear, while the bishop may want b5 instead once Black shows a plan. Knights first keeps your options open.',
            Qh5: 'The queen out on move two? Black’s pieces will chase her, and every chase gives Black a free developing move. Pieces first, queen later.',
            f4: '**f4** is the King’s Gambit: White offers a pawn to tear open the f-file. It is a real opening, but a sharp one, and this step is about the knight.',
          },
          failure:
            'This step is about the knight on g1: bring it out to the square where it points at the centre.',
        },
      },
      {
        title: 'Develop with purpose',
        text:
          'Black has defended e5 with a knight. Now your bishop. Do not just get it off its square: put it on a ' +
          'diagonal where it does something.\n\nFrom **c4** it would aim at f7, the weakest square near Black’s ' +
          'king, guarded only by the king. From **b5** it would pressure the knight on c6, the piece that defends e5.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6'),
        shapes: ['f1c4', 'f1b5'],
        task: {
          prompt: 'Develop your bishop to an active square.',
          moves: ['Bc4', 'Bb5'],
          hint: 'Look at the two arrows. Either square puts the bishop to work.',
          success: 'The bishop is out, and it is aiming at something.',
          why:
            'Both squares start famous openings: c4 is the **Italian Game**, b5 the **Ruy Lopez**. Each makes a ' +
            'target of something in Black’s camp. A developing move that also aims at a target is worth more than ' +
            'one that just leaves home.',
          wrong: {
            Bd3: 'From d3 the bishop blocks your own d-pawn, and while that pawn cannot move, your c1 bishop is stuck behind it. Find a diagonal where the bishop works without getting in the way.',
            Be2: '**Be2** is safe but passive: from there the bishop mostly looks at your own pieces. On c4 or b5 it would aim into Black’s camp.',
            d4: '**d4** is a strong move (the Scotch Game), but this step is about the bishop.',
          },
          failure:
            'This step is about the bishop on f1: find a diagonal where it aims into Black’s position.',
        },
      },
      {
        title: 'Castle early',
        text:
          'Your knight and bishop are out, and the squares between your king and the h1 rook are empty. That is ' +
          'the moment to castle.\n\nThe centre is closed for now, but it will not stay that way. As soon as pawns ' +
          'are traded there, the e-file opens, and a king still on e1 would face Black’s rooks and queen.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
        task: {
          prompt: 'Castle, and get your king to safety.',
          moves: ['O-O'],
          hint: 'Move the king two squares toward the h1 rook.',
          success: '**O-O**: your king is safe on g1, and the rook has come to f1.',
          why:
            'Castling early does two jobs at once: the king leaves the centre before the files open, and a rook ' +
            'comes toward the middle, ready to join the game. Next on the list: the pieces on the queen’s side, and ' +
            'then connecting the rooks.',
          wrong: {
            Kf1: 'A one-square king step gives up castling for good. Castle instead: the king goes two squares, to g1.',
          },
          failure:
            'This step is about castling: move the king two squares toward the h1 rook, and the rook hops over to f1.',
        },
      },
      {
        title: 'Do not rush the queen out',
        text:
          'After 1. e4 d5 2. exd5 Qxd5, Black’s queen is out on move two. That is not a blunder: strong players ' +
          'choose this opening, the Scandinavian. But it has a price, and you can make Black pay it.\n\n' +
          'An early queen is a target. Every time you attack her with a developing move, you bring out a piece and ' +
          'she has to move again.',
        fen: fenAfter('1. e4 d5 2. exd5 Qxd5'),
        shapes: ['d5:red'],
        task: {
          prompt: 'Develop a piece and attack the queen at the same time.',
          moves: ['Nc3'],
          hint: 'Which of your knights can reach a square that attacks d5?',
          success: '**Nc3**: a new piece in play, and the queen has to move again.',
          why:
            'That is a free move for you: Black’s next turn goes on rescuing the queen instead of developing. ' +
            'Gaining time like this is called winning a **tempo**, and it is the whole reason not to bring your own ' +
            'queen out early.',
          failure:
            'Look for a developing move that attacks the queen on d5. One of your knights can do both at once.',
          reply: 'Qa5',
          replyNote:
            'The queen steps aside to a5, out of reach for now. Count the moves: Black has spent two on the queen, and you are ready to bring out your next piece.',
          then: {
            prompt: 'Keep developing. What is a good next move?',
            moves: ['d4', 'Nf3', 'Bc4', 'Be2'],
            hint: 'Bring out another piece, or claim the centre with a pawn.',
            success:
              'Another piece or pawn joins the fight, while Black’s queen is still the only piece out.',
            why:
              'Look at the board: you have a knight out and the rest of your army ready to follow, while Black has a ' +
              'queen on a5 and nothing else. That is the price of an early queen. It does not lose by force, but ' +
              'every attack on her costs another move.',
            wrong: {
              Bd3: '**Bd3** develops, but it blocks your d-pawn, and your c1 bishop behind it. Pick a square that does not get in your own way.',
              Nge2: '**Nge2** develops, but on e2 the knight blocks your f1 bishop. f3 is its natural square.',
              'Bb5+':
                'A check, but after ...c6 the bishop has to move again, and Black’s pawn has gained the time. Develop to a square where the bishop can stay.',
            },
            failure:
              'This step is about development: bring out another knight or bishop, or claim the centre with d4.',
          },
        },
      },
      {
        title: 'Summary',
        text:
          'Every sound opening follows the same recipe:\n\n' +
          '1. Put a pawn or two in the centre.\n' +
          '2. Develop knights and bishops toward the centre, with threats when you can.\n' +
          '3. Castle early.\n' +
          '4. Bring the queen out modestly and connect the rooks; only then start a plan.\n\n' +
          'And three things to avoid: moving the same piece twice without a reason, pushing pawns instead of ' +
          'developing, and bringing the queen out early. Look at this position: both sides followed the recipe, ' +
          'and both are ready for the middlegame.',
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
          'Here is the most common mate in chess. Black’s king has castled, but its three pawns never moved, so ' +
          'it has no square to step to. If nothing guards the back rank, a rook or queen check there is mate.\n\n' +
          'Notice that your own king has the very same problem. Today it is Black who pays for it.',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        task: {
          prompt: 'Find the checkmate in one.',
          moves: ['Rd8#'],
          acceptAnyMate: true,
          hint: 'Is anything guarding d8?',
          success: '**Rd8#**: the rook checks on the back rank, and the pawns keep the king in.',
          why:
            'Black’s pawns, there to protect the king, took away every escape square. Two habits come from this ' +
            'position: when the enemy king has no air, look at the back rank; and when your own king has none, give ' +
            'it some at a quiet moment with a pawn move such as h3.',
          failure:
            'Not mate yet. The king cannot step past its own pawns, so a check along the back rank would leave it nowhere to go.',
        },
      },
      {
        title: 'The ladder mate',
        text:
          'Two rooks can force mate anywhere on the board with a **ladder**: one rook holds a rank so the king ' +
          'cannot come forward, and the other checks on the next rank, pushing the king back. Then they swap ' +
          'roles and climb again, one rank per move, until the king runs out of board.\n\nYour rook on a5 is ' +
          'already holding the fifth rank. Let’s climb.',
        fen: '8/8/4k3/R7/8/8/8/6KR w - - 0 1',
        shapes: ['a5h5:blue'],
        task: {
          prompt: 'The fifth rank is held. Where does the other rook check?',
          moves: ['Rh6+'],
          hint: 'The king stands on the sixth rank. Which rook can check it there?',
          success: '**Rh6+**: check on the sixth rank, while the a5 rook still holds the fifth.',
          why:
            'The king cannot come forward, because the a5 rook guards the fifth rank, and it cannot stay on the ' +
            'sixth. So it has to step back. Each check in a ladder pushes the king one rank closer to the edge.',
          failure:
            'Keep the ladder going: the rook on a5 already guards the fifth rank, so check with the other rook on the sixth.',
          reply: 'Kd7',
          replyNote:
            'The king steps back to the seventh rank. It cannot go forward: your rook on h6 now holds the sixth.',
          then: {
            prompt: 'Now the rooks swap roles. Climb one more rank.',
            moves: ['Ra7+'],
            hint: 'The rook on h6 holds the sixth rank now. Which rook can check on the seventh?',
            success: '**Ra7+**: the a-rook leapfrogs to the seventh rank with check.',
            why:
              'The rooks take turns: the one behind leaps over to check on the next rank, while the other holds the ' +
              'rank below. Keep them on the far side of the board from the king, so it can never attack them.',
            wrong: {
              'Rh7+':
                'That is check, but now nothing holds the sixth rank, and the king simply walks back. The rook that is behind is the one that leaps.',
            },
            failure:
              'Keep climbing: the rook on h6 holds the sixth rank, so the rook on a5 checks on the seventh.',
            reply: 'Ke8',
            replyNote:
              'Back on the edge. The rook on a7 holds the seventh rank, so one more check finishes it.',
            then: {
              prompt: 'Finish the ladder: checkmate in one.',
              moves: ['Rh8#'],
              acceptAnyMate: true,
              hint: 'Which rook can give check on the eighth rank?',
              success: '**Rh8#**: check on the eighth rank, and the a7 rook covers the seventh.',
              why:
                'One rank per move, up the board and off the end: that is the ladder. It works from anywhere, and ' +
                'with a queen and a rook it works the same way. Just keep both pieces far from the enemy king.',
              failure:
                'Not mate. Your rook on a7 holds the seventh rank; the other rook checks on the eighth.',
            },
          },
        },
      },
      {
        title: 'King and queen vs king',
        text:
          'With a queen you can always force mate, but not with the queen alone: she needs your king’s help. The ' +
          'method is to shrink the box the enemy king lives in with the queen (staying a knight’s move away, ' +
          'where the king cannot attack her), bring your own king closer, and mate on the edge.\n\nHere the black ' +
          'king is boxed into the corner: it can only shuffle between h8 and g8.',
        fen: '7k/4Q3/8/4K3/8/8/8/8 w - - 0 1',
        task: {
          prompt: 'The box is ready. What is the next step of the method?',
          moves: ['Kf6'],
          hint: 'The queen has done her job. Which of your pieces has not joined in yet?',
          success: '**Kf6**: your king joins in and guards g7, the square the queen wants.',
          why:
            'The queen cannot mate on her own: any check she gives right next to the king would simply be captured. ' +
            'Your king’s job is to protect her on the mating square. Notice it was a quiet king move, not another ' +
            'check, that tightened the net.',
          wrong: {
            Qf7: 'That is the stalemate trap: the king is not in check, and g8, g7 and h7 are all covered. Black has no legal move, so it is a draw. Leave the king a square until you can mate.',
          },
          failure:
            'Not yet. The queen has already boxed the king in; the piece that still needs to come closer is your king.',
          reply: 'Kg8',
          replyNote:
            'Black’s only move. The king steps to g8, and now the queen can land right next to it.',
          then: {
            prompt: 'Finish it: checkmate in one.',
            moves: ['Qg7#'],
            acceptAnyMate: true,
            hint: 'Put the queen next to the king, on the square your own king protects.',
            success: '**Qg7#**: the queen checks from g7, and your king protects her.',
            why:
              'Queen next to the king, guarded by your king: that is how almost every queen mate ends. From any ' +
              'position the method is the same: box the king in, march your king up, then mate. With practice it ' +
              'never takes more than ten moves.',
            failure:
              'Not mate: the king still has a square. Put the queen right next to it, where your king protects her.',
          },
        },
      },
      {
        title: 'King and rook vs king',
        text:
          'With a rook the idea is the same, it just takes longer: the rook cuts the king off, your king walks ' +
          'up, and the mate comes on the edge.\n\nThe finishing picture is worth remembering. The kings stand face ' +
          'to face with one square between them (that is called the **opposition**), so the black king cannot ' +
          'come forward, and the rook checks along the edge.',
        fen: '3k4/8/3K4/8/8/8/8/7R w - - 0 1',
        shapes: ['d6:blue', 'd8:blue'],
        task: {
          prompt: 'Find the checkmate in one.',
          moves: ['Rh8#'],
          acceptAnyMate: true,
          hint: 'Your king already guards c7, d7 and e7. Where can the rook check along the back rank?',
          success:
            '**Rh8#**: the rook checks along the back rank, and your king covers every square in front.',
          why:
            'This is the picture every rook mate aims for. The rook alone can only check; it is your king, standing ' +
            'opposite the enemy king, that takes away the squares in front. When you practise king and rook against ' +
            'king, steer toward it: enemy king on the edge, kings face to face, rook checks.',
          failure:
            'Not mate. Your king already covers c7, d7 and e7, so give a check along the back rank with the rook.',
        },
      },
    ],
    practiceThemes: ['mateIn1', 'backRankMate'],
  },
];
