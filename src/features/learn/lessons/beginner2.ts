import { fenAfter, type Lesson } from '../model';

const SCHOLAR = fenAfter('1. e4 e5 2. Qh5 Nc6 3. Bc4');
const SCHOLAR_2 = fenAfter('1. e4 e5 2. Qh5 Nc6 3. Bc4 g6 4. Qf3');
const LEGAL = fenAfter('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1');
const LEGAL_MATE = fenAfter('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7');
const SHILLING = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5');
const SHILLING_MATE = fenAfter(
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2',
);
const SHILLING_AVOID = fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4');

export const beginnerLessons2: Lesson[] = [
  {
    id: 'how-games-end',
    title: 'Draws and how games end',
    level: 'beginner',
    category: 'Rules',
    summary: 'Checkmate is not the only ending: stalemate, repetition, the 50-move rule and more.',
    minutes: 7,
    steps: [
      {
        title: 'Seven ways a game can end',
        text:
          'A game ends in one of these ways:\n\n- **Checkmate** — the king is attacked and cannot escape. The ' +
          'attacker wins.\n- **Resignation** — a player gives up.\n- **Time** — a clock runs out (a draw if the ' +
          'opponent could never mate).\n- **Stalemate** — the side to move has *no legal move* but is *not* in ' +
          'check. Draw.\n- **Insufficient material** — nobody can mate, as with king and bishop against king. ' +
          'Draw.\n- **Threefold repetition** — the same position three times, same side to move: a draw on a ' +
          'claim.\n- **Fifty-move rule** — fifty moves each with no capture or pawn move: a draw on a claim.\n\nA ' +
          'draw can also be **agreed**. The next two boards are about stalemate, the draw beginners give away ' +
          'most.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      {
        title: 'Do not stalemate a beaten opponent',
        text:
          'White is a queen up and wants to finish the game. **Qf7** looks natural — it takes away every square ' +
          'around the black king — but the king is *not in check* and Black has no other piece. That is stalemate, ' +
          'and the win evaporates.\n\nBefore you play a “strangling” move, always ask: *does my opponent still have a ' +
          'legal move?* Find the move that mates instead.',
        fen: '7k/3Q4/5K2/8/8/8/8/8 w - - 0 1',
        shapes: ['d7f7:red'],
        task: {
          prompt: 'Checkmate in one — and avoid the stalemate trap.',
          moves: ['Qg7#'],
          acceptAnyMate: true,
          hint: 'The queen needs to give check on a square the king cannot capture. Your own king protects g7.',
          success:
            'Qg7 is mate: the queen checks, the king protects her, and h7 and g8 are covered too.',
          failure:
            'Careful — check whether Black has any legal move after your move. Qf7 would be stalemate.',
        },
      },
      {
        title: 'Stalemate as a lifeline',
        text:
          'Now the other side of the coin. Black is hopelessly behind — but look at the black king: it has **no ' +
          'moves at all**, and the black pawns are blocked. If Black could get rid of the queen, it would be stalemate.\n\n' +
          'So Black offers the queen with check. Taking it is stalemate; and every other reply lets the queen keep ' +
          'checking or take the white queen.',
        fen: '7k/7p/6pP/3Q2P1/2B5/8/1q6/6K1 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:red', 'g6:red', 'h7:red'],
        task: {
          prompt: 'Black to move: force a draw.',
          moves: ['Qg2+'],
          hint: 'Give a check that the king can only answer by capturing the queen.',
          success:
            'Qg2+! Kxg2 (or Qxg2) is stalemate — Black has no legal move and is not in check. Half a point from nothing.',
          failure:
            'Not that. Look for a queen check where every reply captures the queen — leaving Black without a legal move.',
        },
      },
      {
        title: 'Draws by rule',
        text:
          'Some draws happen without anyone doing anything clever:\n\n' +
          '- **Insufficient material.** With only a bishop or a knight left, you cannot force mate — the game is drawn at once. Two knights against a lone king cannot force mate either.\n' +
          '- **Threefold repetition.** If the same position (same pieces, same side to move, same castling and en passant rights) appears three times, the game may be claimed as a draw. This is how “perpetual check” draws are usually ended.\n' +
          '- **Fifty-move rule.** Fifty consecutive moves by *each* side without a capture or pawn move: draw on claim. It punishes players who cannot convert an advantage.\n\n' +
          'In this position White has a bishop and Black nothing — the game is already a draw, no matter how badly Black plays.',
        fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1',
      },
      {
        title: 'Resigning and offering draws',
        text:
          'Resign when you are certain the position is lost against *this* opponent — not just when you are a pawn down. ' +
          'Beginners should resign later rather than earlier: opponents blunder, and stalemate tricks like the one you ' +
          'just found are real.\n\nOffer a draw after making your move, before pressing the clock. Declining is fine — ' +
          'you simply play on. Against the engine on this site the game ends only by checkmate, a rule draw, resignation or the clock.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    ],
  },

  {
    id: 'opening-traps',
    title: 'Opening traps and how to avoid them',
    level: 'beginner',
    category: 'Openings',
    summary:
      'Scholar’s mate, Légal’s mate and the Blackburne Shilling: see them once, never fall for them again.',
    minutes: 9,
    steps: [
      {
        title: 'Scholar’s mate: the threat',
        text:
          'The most common trap at beginner level: **1. e4 e5 2. Qh5 Nc6 3. Bc4**. White threatens **Qxf7#** — ' +
          'f7 is protected only by the king.\n\nDefend it calmly. The best move blocks the queen’s path *and* ' +
          'gains a tempo on her.',
        fen: SCHOLAR,
        orientation: 'black',
        shapes: ['h5f7:red', 'c4f7:red'],
        task: {
          prompt: 'Stop the mate on f7.',
          moves: ['g6', 'Qe7', 'Qf6', 'Nh6'],
          hint: 'Block the h5–f7 diagonal with a pawn, or defend f7 with the queen or knight.',
          success:
            'Safe. g6 is best: it blocks the diagonal, attacks the queen, and prepares ...Bg7. Qe7, Qf6 and Nh6 also hold.',
          failure: 'That still allows Qxf7 mate. Cover f7 or block the queen’s diagonal.',
        },
      },
      {
        title: 'Scholar’s mate: the second wave',
        text:
          'After **3...g6** the queen retreats to **f3**, aiming at f7 again. Do not panic — one more developing move ' +
          'with tempo and White has wasted three queen moves for nothing.',
        fen: SCHOLAR_2,
        orientation: 'black',
        shapes: ['f3f7:red'],
        task: {
          prompt: 'Defend f7 again — with development.',
          moves: ['Nf6', 'Qf6', 'Qe7'],
          hint: 'Which knight move guards f7 and blocks the queen’s file?',
          success:
            'Nf6 covers f7, blocks the f-file and develops. Black is already better: White’s queen has moved three times.',
          failure:
            'Qxf7 is still mate after that. Put a piece between the queen and f7, or defend the square.',
        },
      },
      {
        title: 'Légal’s mate: punishing a greedy bishop',
        text:
          'After **1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6?** White played **5. Nxe5!** — apparently hanging the queen. ' +
          'Black grabbed it: **5...Bxd1??**\n\nWhite now mates in two with the minor pieces. Find the first move.',
        fen: LEGAL,
        shapes: ['c4f7', 'e5f7:red'],
        task: {
          prompt: 'White to move: start the mating combination.',
          moves: ['Bxf7+'],
          reply: 'Ke7',
          hint: 'A bishop check drags the king forward.',
          success: 'Bxf7+ Ke7 is forced. Now finish it.',
          failure: 'The queen is gone — you need to mate, and only a check keeps the initiative.',
        },
      },
      {
        title: 'Légal’s mate: the finish',
        text:
          'The king has been dragged to e7. Every escape square is covered: e8 by the bishop, d7 by the knight on e5, ' +
          'd8 by Black’s own queen. One knight move delivers mate.',
        fen: LEGAL_MATE,
        task: {
          prompt: 'Checkmate.',
          moves: ['Nd5#'],
          acceptAnyMate: true,
          hint: 'Which knight can reach a square attacking e7?',
          success:
            'Nd5 mate. The lesson: when a piece “hangs” in the opening, check for a forcing sequence before you take it.',
          failure: 'Not mate. Look for a knight check the king cannot run from.',
        },
      },
      {
        title: 'The Blackburne Shilling Gambit',
        text:
          '**1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4?!** offers the e5 pawn. If White grabs it with **4. Nxe5?**, Black has a ' +
          'venomous reply: a queen move that attacks the knight *and* g2 at the same time.',
        fen: SHILLING,
        orientation: 'black',
        shapes: ['d8g5', 'g5e5:red', 'g5g2:red'],
        task: {
          prompt: 'Black to move: attack the knight and the g2 pawn.',
          moves: ['Qg5'],
          hint: 'The queen wants a square on the fifth rank that also looks down the g-file.',
          success:
            'Qg5! Now 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 and Black mates. (5. Bxf7+ Ke7 also loses for White.)',
          failure: 'Look for the queen move that hits e5 and g2 simultaneously.',
        },
      },
      {
        title: 'The Blackburne Shilling: mate',
        text:
          'White took on f7 and then had to give up the g2 pawn: **5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2**. The white king ' +
          'is boxed in by its own pieces. Finish the game.',
        fen: SHILLING_MATE,
        orientation: 'black',
        task: {
          prompt: 'Checkmate in one.',
          moves: ['Nf3#'],
          acceptAnyMate: true,
          hint: 'The knight on d4 can give a check that nothing can capture — the bishop is pinned.',
          success:
            'Nf3 is mate: the bishop on e2 is pinned by the queen, and the king has no squares.',
          failure:
            'Not mate. Think about the knight: which square gives check with the bishop pinned?',
        },
      },
      {
        title: 'Do not fall for it',
        text:
          'Now the other side. After **3...Nd4**, taking on e5 is the trap. The calm move simply removes the annoying ' +
          'knight — or ignores it and castles. Either way White keeps a comfortable edge.',
        fen: SHILLING_AVOID,
        shapes: ['f3e5:red', 'f3d4'],
        task: {
          prompt: 'White to move: decline the bait.',
          moves: ['Nxd4', 'O-O'],
          hint: 'Trade off the knight that jumped into your position, or simply castle.',
          success:
            'Right. Nxd4 exd4 and Black has nothing but a weak pawn; O-O is fine too. Greed on e5 was the only mistake.',
          failure: 'Not the best. Nxe5 walks into Qg5. Take the knight on d4, or simply castle.',
        },
      },
    ],
    practiceThemes: ['opening', 'mateIn2'],
  },

  {
    id: 'trading-pieces',
    title: 'When to trade pieces',
    level: 'beginner',
    category: 'Strategy',
    summary: 'Ahead? Trade pieces. Behind? Keep them. Under attack? Trade the attackers.',
    minutes: 7,
    steps: [
      {
        title: 'The three rules of trading',
        text:
          'Every capture that leads to an equal exchange is a **trade**. Trades are not neutral — they change who is ' +
          'winning:\n\n' +
          '- **When you are ahead in material, trade pieces** (not pawns). A queen up in a full board is messy; a queen up with nothing else left is trivial.\n' +
          '- **When you are behind, avoid trades.** Keep pieces on the board to create complications and chances.\n' +
          '- **When you are under attack, trade the attacking pieces** — especially the queen.\n\n' +
          'The next boards show the last two rules in action.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      {
        title: 'Trade the attacker',
        text:
          'White is a knight and a pawn up, but Black threatens **Qxg2 mate** (the bishop on b7 supports the ' +
          'queen). Instead of defending awkwardly, kill the attack at the root: trade queens. With the queens off, ' +
          'the extra material wins easily.',
        fen: '4r1k1/pb3p2/1p6/7p/N5q1/2N5/PP3PPP/3QR1K1 w - - 0 1',
        shapes: ['g4g2:red', 'b7g2:red', 'd1g4'],
        task: {
          prompt: 'Stop the mate by trading queens.',
          moves: ['Qxg4+'],
          reply: 'hxg4',
          hint: 'Which white piece can capture the black queen?',
          success:
            'Qxg4+ hxg4 and the attack is over. Two knights and a rook against a rook and bishop: the rest is technique.',
          failure:
            'The threat is Qxg2 mate. Capture the queen: with the queens off the attack is over and the extra knight decides.',
        },
      },
      {
        title: 'Trade the defender',
        text:
          'A trade can also remove a key defender. Material is level, but White’s queen and knight both aim at h7, and ' +
          'Black’s knight on f6 is its only defender. Give the bishop for that knight and h7 falls, whichever way ' +
          'Black takes back.',
        fen: 'r4rk1/pb2qppp/1p2pn2/6N1/2P5/1P1Q4/PB3PPP/3RR1K1 w - - 0 1',
        shapes: ['b2f6', 'd3h7:red', 'g5h7:red'],
        task: {
          prompt: 'Remove the defender of h7.',
          moves: ['Bxf6'],
          hint: 'The bishop on b2 can capture the piece that guards h7.',
          success:
            'Bxf6! If Black takes back with the pawn or the queen, Qxh7 is mate — the knight on g5 guards the ' +
            'queen. Stopping the mate with ...g6 leaves the queen on e7 to the bishop. Removing a defender is worth ' +
            'more than the pieces the trade swaps.',
          failure:
            'Look at h7: the queen and the knight attack it, and only the knight on f6 defends it. Which white piece can take that knight?',
        },
      },
      {
        title: 'Which pieces to trade',
        text:
          'Beyond material, think about *quality*:\n\n' +
          '- Trade your **bad bishop** (blocked by your own pawns) for their good one.\n' +
          '- Trade a **passive piece** for an active one.\n' +
          '- Keep **knights** in closed positions and **bishops** in open ones.\n' +
          '- With a **space advantage**, avoid trades — your opponent is cramped and wants them.\n\n' +
          'Here White’s bishop on d3 is blocked by its own e4 pawn; Black’s knight on e5 is a monster, protected by a ' +
          'pawn and eyeing both wings. Trading the bishop for that knight (Bxe5, when possible) would be a good deal ' +
          'even though a bishop is “worth” slightly more.',
        fen: '4k3/8/3p4/4n3/4P3/3B2P1/5P2/4K3 w - - 0 1',
        shapes: ['d3:red', 'e5:green'],
      },
    ],
  },

  {
    id: 'pawn-races',
    title: 'Pawn races and the square',
    level: 'beginner',
    category: 'Endgames',
    summary: 'Can the king catch the pawn? Count the square — and count the race.',
    minutes: 7,
    steps: [
      {
        title: 'The rule of the square',
        text:
          'Draw an imaginary square from the pawn to its promotion square. If the defending king can step **into ' +
          'that square** on its move, it catches the pawn; if not, the pawn queens.\n\nThe pawn on h4 needs four ' +
          'moves to queen. Its square runs from h4 to h8 and back to d4. The black king on c4 is *outside*.',
        fen: '8/8/8/8/2k4P/8/1K6/8 w - - 0 1',
        shapes: ['h4h8', 'h8d8', 'd8d4', 'd4h4', 'c4:red'],
      },
      {
        title: 'Outside the square: run!',
        text:
          'It is White to move. The black king is outside the square, so the pawn cannot be caught — as long as ' +
          'White does not waste time. (Note: a pawn on its starting square moves two steps, so count its square from ' +
          'one rank further forward.)',
        fen: '8/8/8/8/2k4P/8/1K6/8 w - - 0 1',
        task: {
          prompt: 'Win the race.',
          moves: ['h5'],
          hint: 'Every king move lets Black into the square. Push!',
          success:
            'h5! Black is one step short: after ...Kd5 h6 Ke6 h7 Kf7 h8=Q the pawn queens first.',
          failure: 'Too slow — after that the black king reaches the square and catches the pawn.',
        },
      },
      {
        title: 'Inside the square: catch it',
        text:
          'Same pawn, but now the black king stands on d4 — on the edge of the square — and it is **Black** to move. ' +
          'Stepping towards the pawn keeps the king inside every smaller square that follows.',
        fen: '8/8/8/8/3k3P/8/1K6/8 b - - 0 1',
        orientation: 'black',
        shapes: ['h4h8', 'h8d8', 'd8d4', 'd4h4'],
        task: {
          prompt: 'Black to move: make sure you catch the pawn.',
          moves: ['Ke5', 'Ke4', 'Kd5'],
          hint: 'Move the king towards the h-file.',
          success: 'The king stays inside the shrinking square and catches the pawn. Draw.',
          failure: 'That takes the king out of the square — the pawn queens.',
        },
      },
      {
        title: 'Counting a race',
        text:
          'When both sides have a passed pawn, **count moves**. White’s a-pawn needs three moves; Black’s h-pawn needs ' +
          'three too. White moves first — and look at the diagonal from a8: when the pawn queens it gives *check*, ' +
          'and the new queen also covers h1.',
        fen: '8/8/8/P7/4k2p/8/8/1K6 w - - 0 1',
        shapes: ['a8e4:red', 'a8h1:blue'],
        task: {
          prompt: 'White to move: win the race.',
          moves: ['a6'],
          hint: 'Do not touch the king — push the pawn and count.',
          success:
            'a6 h3 a7 h2 a8=Q+! The check wins a tempo, and from a8 the queen stops h1. White wins.',
          failure: 'Too slow. After that Black queens in time and the game is a draw at best.',
        },
      },
      {
        title: 'Which pawn to push',
        text:
          'Two more habits:\n\n' +
          '- The **outside passed pawn** — the one furthest from the kings — is the strongest. It drags the enemy king away while your king eats the other pawns.\n' +
          '- **Promote with check** when you can: it gains a whole tempo in a race.\n\n' +
          'Here both pawns are equally far advanced, but the a-pawn is far from Black’s king and promotes with check on a8. Count before every race.',
        fen: '8/8/8/P6P/8/5k2/8/K7 w - - 0 1',
        shapes: ['a5a8', 'h5h8:blue'],
      },
    ],
    practiceThemes: ['pawnEndgame', 'promotion'],
  },
];
