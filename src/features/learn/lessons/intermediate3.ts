import { fenAfter, type Lesson } from '../model';

// Two Knights Defence, Fried Liver Attack.
const FRIED_LIVER = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5';
const FRIED_NXF7 = fenAfter(FRIED_LIVER);
const FRIED_DEFENCE = fenAfter(`${FRIED_LIVER} 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3`);
const FRIED_CASTLE = fenAfter(`${FRIED_LIVER} 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4`);
// Queen's Gambit Accepted sideline: gaining time against a king still in the centre.
const QGA_E5 = fenAfter('1. d4 d5 2. c4 dxc4 3. e4 Nf6 4. Nc3 c6 5. Bxc4 e6');
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
        title: 'Usually a draw',
        text:
          'A rook against a lone knight or bishop, with no pawns, is a **draw** in almost every position. The stronger ' +
          'side wins only when the defender goes wrong: a knight that wanders away from its king, or a king that runs ' +
          'into the wrong corner.\n\n' +
          'The golden rule for the defender: **keep the minor piece next to the king**, so that neither can be ' +
          'attacked without the other defending it.',
        fen: '8/R3n1k1/8/4K3/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['g7f8', 'e7:blue'],
      },
      {
        title: 'Keep them together',
        text:
          'The rook attacks the knight along the seventh rank. Black has two ways to defend it — but only one of ' +
          'them survives the white king’s next move.',
        fen: '8/R3n1k1/8/4K3/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['a7e7:red'],
        task: {
          prompt: 'Black to move: defend the knight and hold the draw.',
          moves: ['Kf8'],
          hint: 'Which king square defends e7 and cannot be shaken by Kd6?',
          success:
            'Kf8! The knight is covered, and after Kd6 the king still guards it while the knight has g8 and c8 to hop to. Kf7? Kd6! attacks the knight twice and it is lost.',
          failure:
            'Kf7? Kd6! attacks the knight a second time — it has no safe square. Kf8 is the only move: the knight stays protected whatever White does.',
        },
      },
      {
        title: 'A knight on the rim',
        text:
          'When the knight is cut off from its king it can be trapped on the edge. Here the black knight on b1 has no ' +
          'safe squares: a3 is covered by the rook, c3 and d2 by the king. It just needs to be attacked.',
        fen: '6k1/8/8/8/8/3K3R/8/1n6 w - - 0 1',
        shapes: ['b1:red', 'a3:blue', 'c3:blue', 'd2:blue'],
        task: {
          prompt: 'White to move: win the knight.',
          moves: ['Kc2', 'Rh1'],
          hint: 'Attack the knight while keeping all of its squares covered.',
          success:
            'Kc2! attacks the knight, which has nowhere to go: Na3 Rxa3, Nd2 Kxd2, Nc3 Kxc3. (Rh1 also wins — the knight is driven to a3 and hunted down.) A knight far from its king is a knight in danger.',
          failure: 'The knight is already trapped — just attack it: Kc2 or Rh1 wins it.',
        },
      },
      {
        title: 'Rook against bishop: the safe corner',
        text:
          'With a bishop, everything depends on **which corner** the defending king reaches. In the corner of the ' +
          '*opposite* colour to the bishop the defence is easy: every check can be met by interposing the bishop, ' +
          'because the squares next to the king are of the bishop’s colour.\n\n' +
          'In the corner of the *same* colour as the bishop, the king is mated or the bishop is lost.\n\n' +
          'Here the bishop is light-squared, so the safe corners are the dark ones: **h8** and **a1**.',
        fen: '5k2/8/8/4K3/8/1b6/8/2R5 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:green', 'a8:red', 'h1:red', 'a1:green'],
      },
      {
        title: 'Choose the corner',
        text: 'Black’s king is one step from both h8 and e8. Which way?',
        fen: '5k2/8/8/4K3/8/1b6/8/2R5 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Black to move: head for the safe corner.',
          moves: ['Kg7', 'Kg8'],
          hint: 'The bishop is light-squared. Which corner square is dark?',
          success:
            'Kg7! and then Kh8. With the king on h8 and the bishop covering g8 and h7 — both light squares — White has no way in. Heading for a8 would be a mistake: that corner is the bishop’s colour.',
          failure:
            'That does not lose yet, but it does not head for safety either. The bishop is light-squared, so the drawing corner is h8 (dark): Kg7 or Kg8.',
        },
      },
      {
        title: 'Punishing the wrong corner',
        text:
          'Black has ended up in the h8 corner with a **dark-squared** bishop — the corner of the bishop’s own colour. ' +
          'The g8 and h7 squares are light, so the bishop can never block a check on the back rank or the h-file.',
        fen: '7k/8/6K1/4b3/8/8/8/R7 w - - 0 1',
        shapes: ['a1a8', 'g8:red', 'h7:red'],
        task: {
          prompt: 'White to move: force mate.',
          moves: ['Ra8+'],
          hint: 'A check the bishop can only block for one move.',
          success:
            'Ra8+! Bb8 is the only defence, and Rxb8 is mate. This is why the corner matters.',
          failure: 'There is a mate in two. Check on the back rank — the bishop cannot hold it.',
        },
      },
      {
        title: 'Remember',
        text:
          '- Rook against knight or bishop: a **draw** with correct defence.\n' +
          '- Defender with a knight: keep the knight **next to the king**, never on the edge.\n' +
          '- Defender with a bishop: run to the corner of the **opposite colour** to your bishop.\n' +
          '- Attacker: separate the knight from the king, or steer the king into the wrong corner.',
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
    minutes: 8,
    steps: [
      {
        title: 'A game of checks',
        text:
          'With queens on the board, an extra pawn is worth much less than in other endgames because the defender can ' +
          '**check for ever**. Three ideas decide almost every queen endgame:\n\n' +
          '- The **passed pawn**: push it as far as it will go — a pawn on the seventh ties the enemy queen down.\n' +
          '- **King shelter**: the attacker’s king walks towards the pawn (or towards the enemy queen) to escape the checks.\n' +
          '- **Perpetual check**: the defender’s only real drawing weapon. If you cannot keep checking, you are usually lost.\n\n' +
          'Here White has queen and pawn against queen. The pawn is on b6, the black queen is far away — a good moment to push.',
        fen: '8/8/1PK5/2Q5/8/8/7k/q7 w - - 0 1',
        shapes: ['b6b7', 'b7b8:blue'],
      },
      {
        title: 'Push the pawn',
        text:
          'Black threatens nothing concrete yet. Every move the pawn spends on the sixth rank is a move Black can use ' +
          'to bring the queen into a better checking position.',
        fen: '8/8/1PK5/2Q5/8/8/7k/q7 w - - 0 1',
        task: {
          prompt: 'White to move: make progress.',
          moves: ['b7'],
          hint: 'The pawn to the seventh rank.',
          success:
            'b7! The queen on c5 shields the king from checks along the c-file and the long diagonal. After Qa4+ Kc7 the checks are already over: b8=Q follows and White has two queens.',
          failure:
            'Every move that is not b7 gives Black time to improve the queen. Push the pawn to the seventh.',
        },
      },
      {
        title: 'Shelter the king',
        text:
          'The pawn is on b7, but the black queen watches b8 down the b-file, so it cannot promote yet. White’s king ' +
          'needs a square from which it both supports b8 and blocks the coming checks.',
        fen: '8/1P6/2K5/3Q4/8/8/7k/1q6 w - - 0 1',
        shapes: ['c6c7', 'b1b8:red'],
        task: {
          prompt: 'White to move: prepare the promotion.',
          moves: ['Kc7', 'Qe5+', 'Qd6+'],
          hint: 'Step the king next to the promotion square.',
          success:
            'Kc7! After Qh7+ White answers Qd7 — a block that is also a threat — and after Qc2+ Kd8 the checks are over: the pawn queens. (A check first with Qe5+ or Qd6+ also works.)',
          failure:
            'Black keeps checking. Kc7 walks the king to the pawn: it covers b8 and gives the queen a blocking square with tempo on d7.',
        },
      },
      {
        title: 'The defender’s weapon',
        text:
          'Now the other side. White’s pawn is on a7 and the queen on b8 guards the promotion square: next move White ' +
          'gets a second queen. Black has exactly one resource — but it must be **checks all the way**.',
        fen: '1Q6/P4pk1/6p1/7p/4q3/6P1/5P1P/6K1 b - - 0 1',
        orientation: 'black',
        shapes: ['e4e1', 'g1:red'],
        task: {
          prompt: 'Black to move: save the game.',
          moves: ['Qe1+'],
          hint: 'Only a check stops a8=Q. Which one keeps the checks coming?',
          success:
            'Qe1+! Kg2 Qe4+ and the white king never escapes: Kf1 Qc4+, Kg1 Qc1+, or f3 Qc2+ — perpetual check. Any quiet move loses to a8=Q.',
          failure:
            'That allows a8=Q and White has two queens. Only Qe1+ — followed by more checks — holds the draw.',
        },
      },
      {
        title: 'Summary',
        text:
          '**Attacker:** push the passed pawn, centralise the queen so it both attacks and blocks checks, and march ' +
          'the king towards the pawn or towards the enemy queen. Avoid a king on an open board far from everything.\n\n' +
          '**Defender:** check from far away, aim for perpetual check, and keep your own king close to the enemy ' +
          'pawn if the checks run out. A rook pawn or a bishop pawn on the seventh is often a draw even for the ' +
          'queen alone — see the lesson on queen against pawn.',
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
      'A king in the centre is a target: sacrifice on f7, open the e-file, and never give the opponent time to castle.',
    minutes: 9,
    steps: [
      {
        title: 'Why the centre is dangerous',
        text:
          'Until the king castles it sits on the e-file, protected only by the f7 pawn and whatever pieces have not ' +
          'moved yet. Three things make an attack on it work:\n\n' +
          '- **f7 (or f2)** is defended only by the king.\n' +
          '- **Open files** in the centre let rooks and queens reach the king.\n' +
          '- **Time**: every move the opponent spends not castling is a move for you.\n\n' +
          'The Fried Liver Attack is the classic example. White’s knight and bishop both look at f7.',
        fen: FRIED_NXF7,
        shapes: ['g5f7:red', 'c4f7:red', 'e8:red'],
      },
      {
        title: 'The sacrifice',
        text: 'The knight on d5 is loose and the black king has only one defender of f7. Drag it into the open.',
        fen: FRIED_NXF7,
        task: {
          prompt: 'White to move: start the attack.',
          moves: ['Nxf7', 'd4'],
          hint: 'Sacrifice on the square only the king protects.',
          success:
            'Nxf7! Kxf7 Qf3+ and the king must come to e6 to save the knight on d5 — the Fried Liver. (d4, the Lolli Attack, is the calmer way to keep the initiative.)',
          failure:
            'Too slow — Black castles next move and the attack is over. Nxf7 (or the quieter d4) is the way.',
        },
      },
      {
        title: 'Defending with precision',
        text:
          'Now the black side. After Nxf7 Kxf7 Qf3+ Ke6 White brought the knight to c3, attacking d5 a second time. Black’s ' +
          'knight on c6 must help — but it also has to keep an eye on the d5 square and give the king air.',
        fen: FRIED_DEFENCE,
        orientation: 'black',
        shapes: ['c3d5:red', 'f3d5:red', 'c6b4'],
        task: {
          prompt: 'Black to move: hold the position together.',
          moves: ['Nb4'],
          hint: 'A knight move that defends d5 and threatens the c2 fork.',
          success:
            'Nb4! The knight defends d5, threatens Nxc2+ and keeps c6 free for the king. Every other move loses material or the king.',
          failure:
            'Only Nb4 holds: it protects d5 and creates a counter-threat on c2. Anything else and White’s attack crashes through.',
        },
      },
      {
        title: 'Bring the last piece',
        text:
          'White has a knight for a pawn, but Black’s king on e6 is exposed. Attacks need every piece — the rook on ' +
          'h1 is not yet playing, and Black is threatening Nxc2+.',
        fen: FRIED_CASTLE,
        shapes: ['e1g1', 'f1e1:blue'],
        task: {
          prompt: 'White to move: get the rook into the game and the king out of danger.',
          moves: ['O-O', 'Bb3'],
          hint: 'A move that answers Nxc2 and brings a rook towards the centre.',
          success:
            'O-O! The king is safe and the f-rook is ready for the e-file. Nxc2? now loses to Bxd5+ Kd6 Bb3 — the exposed king costs Black the game. (Bb3 at once is the other main move.)',
          failure:
            'Remember what the attack needs: castle (or Bb3) so the rook joins in and Nxc2+ is no longer a fork.',
        },
      },
      {
        title: 'Gaining time',
        text:
          'Not every attack needs a sacrifice. Black has developed only one piece and the king is still on e8. ' +
          'A pawn advance that kicks the knight gains a tempo and keeps the king in the centre a little longer.',
        fen: QGA_E5,
        shapes: ['e4e5', 'f6:red'],
        task: {
          prompt: 'White to move: gain a tempo against the undeveloped opponent.',
          moves: ['e5', 'Nf3'],
          hint: 'Push the pawn that attacks the knight.',
          success:
            'e5! The knight must move again (Nd5 or Ne4), White develops with tempo and Black’s king is stuck in the centre for several more moves. Nf3 is a good alternative.',
          failure:
            'Fine, but e5 gains a tempo and keeps the king in the centre — that is the point.',
        },
      },
      {
        title: 'The attacker’s checklist',
        text:
          '- Is f7 (f2) defended only by the king? A sacrifice there may drag the king out.\n' +
          '- Can you open the e-file or the a2–g8 diagonal while the king is still on it?\n' +
          '- Can you **prevent castling** — with a check, a pin, or a bishop on the a2–g8 diagonal?\n' +
          '- Do you have more pieces in play than the defender? If not, develop with tempo first.\n\n' +
          'And the defender’s answer: castle early, and when you cannot, trade the attacking pieces.',
        fen: FRIED_NXF7,
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
      'Seeing the position after the moves, not before them: the skill behind every calculation.',
    minutes: 9,
    steps: [
      {
        title: 'See the board that is not there yet',
        text:
          'Calculation is only useful if you can *see* the position at the end of the line clearly enough to judge ' +
          'it. That skill is **visualisation**, and it can be trained like a muscle:\n\n' +
          '- Play the line in your head **one move at a time**, noting which squares change.\n' +
          '- At the end, ask three questions: *what is attacked? what is hanging? whose king is safer?*\n' +
          '- Then — and only then — play the first move.\n\n' +
          'The tasks in this lesson all need two to four moves seen in advance. Do not move the pieces on the board ' +
          'until you are sure.',
        fen: FORK_TRICK,
        orientation: 'black',
      },
      {
        title: 'The fork trick',
        text:
          'Italian Game, and White has just played Nc3. It looks as if e4 is well defended. Visualise ' +
          '**...Nxe4 Nxe4 d5**: what does Black get back?',
        fen: FORK_TRICK,
        orientation: 'black',
        shapes: ['f6e4', 'd7d5:blue'],
        task: {
          prompt: 'Black to move: play the fork trick.',
          moves: ['Nxe4'],
          hint: 'A temporary piece sacrifice; the pawn fork on d5 wins it back.',
          success:
            'Nxe4! Nxe4 d5 forks bishop and knight, and Black regains the piece with a good centre. Seeing the second and third moves is what makes the first one possible.',
          failure:
            'Bc5 and Be7 are fine moves, but the lesson is about seeing ahead: Nxe4! Nxe4 d5 wins the piece back with interest.',
        },
      },
      {
        title: 'Three moves deep',
        text:
          'White’s queen and knight are aimed at the black king. Find a check, visualise the reply, and see the ' +
          'knight fork that follows.',
        fen: '2bq1rk1/ppp3pp/8/6N1/8/8/PQ3PPP/R5K1 w - - 0 1',
        shapes: ['b2b3', 'g5f7:blue'],
        task: {
          prompt: 'White to move: win material by force.',
          moves: ['Qb3+'],
          hint: 'Check on the long diagonal first; the fork comes next.',
          success:
            'Qb3+! Kh8 (Be6 Nxe6 wins a piece) Nf7+ Rxf7 Qxf7 and White has won the exchange with a crushing position.',
          failure:
            'Nf7 at once simply loses the knight to Rxf7. Check first: Qb3+ drives the king to h8, and then Nf7+ forks king and queen.',
        },
      },
      {
        title: 'Count the race',
        text:
          'Two pawns, two kings, no other pieces. Both pawns need three moves to promote and it is White’s move. ' +
          'Visualise the final position: where will the new queens stand, and does one of them arrive with check?',
        fen: '8/8/8/1P6/6p1/8/7k/1K6 w - - 0 1',
        shapes: ['b5b8', 'g4g1:red'],
        task: {
          prompt: 'White to move: win the race.',
          moves: ['b6'],
          hint: 'Trace the diagonal from b8. Where does it end?',
          success:
            'b6! g3 b7 g2 b8=Q+ — the new queen checks along the b8–h2 diagonal, and the g-pawn never gets to promote. Any king move first and both sides queen: a draw.',
          failure:
            'Every king move lets Black queen too. Push: b6 g3 b7 g2 b8=Q comes with check and wins.',
        },
      },
      {
        title: 'Visualise the endgame after the trade',
        text:
          'Should White trade rooks? The answer is in the pawn ending that follows. Picture the board after ' +
          'Rxd8 Kxd8: White’s king goes to the kingside, White’s a-pawn pulls the black king away. Is that a win?',
        fen: '3r4/4kppp/8/8/P7/5KP1/5P1P/3R4 w - - 0 1',
        shapes: ['d1d8', 'a4a8:blue', 'f3g5:blue'],
        task: {
          prompt: 'White to move: choose the right plan.',
          moves: ['Rxd8'],
          hint: 'An outside passed pawn is worth the most when there are no pieces left.',
          success:
            'Rxd8! Kxd8 Ke4 and the black king cannot both stop the a-pawn and protect the kingside: White’s king walks to f5-g5 and eats the pawns. With rooks on, Black would have counterplay; without them, none.',
          failure:
            'Keeping the rooks gives Black chances. Visualise Rxd8 Kxd8 Ke4: the outside passed a-pawn decides the pawn ending.',
        },
      },
      {
        title: 'Training visualisation',
        text:
          'Habits that build the skill:\n\n' +
          '- In puzzles, **decide the whole line before touching a piece**, then check it.\n' +
          '- Replay master games from the notation with the board hidden for a few moves at a time.\n' +
          '- Use the **blindfold** option in the board vision drills: name the squares a piece attacks from memory.\n' +
          '- After each game, review one critical position and calculate it again without moving the pieces.\n\n' +
          'Aim for accuracy first: three moves seen correctly are worth more than seven seen vaguely.',
        fen: '3r4/4kppp/8/8/P7/5KP1/5P1P/3R4 w - - 0 1',
      },
    ],
    practiceThemes: ['long', 'advantage'],
  },
];
