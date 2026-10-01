/** Reference content: rules, notation, glossary and FAQ. Plain data so it stays easy to edit. */

export interface ReferenceSection {
  id: string;
  title: string;
  /** Lightweight markdown paragraphs (same subset as lessons). */
  body: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  /** Lesson id to link to, if one covers the idea. */
  lesson?: string;
}

export const RULES: ReferenceSection[] = [
  {
    id: 'objective',
    title: 'The objective',
    body:
      'Chess is played by two players, White and Black, on an 8×8 board. White moves first and the players alternate. ' +
      'The goal is to **checkmate** the opponent’s king: attack it so that it cannot escape capture on the next move.\n\n' +
      'A player may never make a move that leaves their own king in check.',
  },
  {
    id: 'moves',
    title: 'How the pieces move',
    body:
      '- **King** — one square in any direction. It can also castle (see below).\n' +
      '- **Queen** — any number of squares along a rank, file or diagonal.\n' +
      '- **Rook** — any number of squares along a rank or file.\n' +
      '- **Bishop** — any number of squares along a diagonal; each bishop stays on one colour forever.\n' +
      '- **Knight** — an “L”: two squares in one direction then one to the side. The only piece that jumps over others.\n' +
      '- **Pawn** — one square forward (two from its starting square), never backwards. It captures diagonally forward.\n\n' +
      'Pieces capture by moving onto the square of an enemy piece, which is removed. Only the knight can jump; every other piece is blocked by anything in its path.',
  },
  {
    id: 'special',
    title: 'Special moves',
    body:
      '**Castling.** The king moves two squares towards a rook and the rook jumps to the square the king crossed. Allowed only if neither the king nor that rook has moved, the squares between them are empty, and the king is not in check, does not cross an attacked square and does not land in check.\n\n' +
      '**En passant.** When a pawn advances two squares and lands beside an enemy pawn, that enemy pawn may capture it *as if it had moved one square* — but only on the very next move.\n\n' +
      '**Promotion.** A pawn reaching the last rank must immediately become a queen, rook, bishop or knight of the same colour (usually a queen). You may have more than one queen.',
  },
  {
    id: 'check',
    title: 'Check, checkmate and stalemate',
    body:
      '**Check**: the king is attacked. You must get out of check at once — move the king, block the attack, or capture the attacker.\n\n' +
      '**Checkmate**: check with no legal escape. The game ends; the side giving mate wins.\n\n' +
      '**Stalemate**: the side to move is *not* in check but has no legal move. The game is a draw.',
  },
  {
    id: 'draws',
    title: 'Draws',
    body:
      '- **Agreement** — both players agree.\n' +
      '- **Stalemate** — see above.\n' +
      '- **Insufficient material** — neither side can possibly checkmate (e.g. king vs king, king and bishop vs king, king and knight vs king).\n' +
      '- **Threefold repetition** — the same position with the same side to move occurs three times (a fivefold repetition is automatic).\n' +
      '- **Fifty-move rule** — fifty moves by each side with no capture and no pawn move (seventy-five is automatic).\n' +
      '- **Dead position** — no sequence of legal moves can lead to checkmate.',
  },
  {
    id: 'clocks',
    title: 'Clocks and time controls',
    body:
      'In timed games each player has a clock that runs on their move. Running out of time loses — unless the opponent has no way to checkmate, in which case the game is drawn. ' +
      '“**10+5**” means ten minutes each plus five seconds added after every move. Bullet is under 3 minutes, blitz 3–10, rapid 10–60, classical longer.',
  },
  {
    id: 'touch',
    title: 'Over-the-board etiquette',
    body:
      'In tournament play, **touch-move** applies: if you touch a piece you must move it, and if you touch an enemy piece you must capture it if you legally can. Say “j’adoube” (I adjust) before straightening a piece. ' +
      'Shake hands before and after, do not talk during the game, and press the clock with the same hand you moved with.',
  },
];

export const NOTATION: ReferenceSection[] = [
  {
    id: 'squares',
    title: 'Naming the squares',
    body: 'Files (columns) are lettered **a–h** from White’s left; ranks (rows) are numbered **1–8** from White’s side. Every square is a file letter plus a rank number: the white king starts on **e1**, the black queen on **d8**.',
  },
  {
    id: 'san',
    title: 'Algebraic notation',
    body:
      'A move is written as the piece letter plus the destination square: **Nf3** (knight to f3), **Bb5**. Pawn moves have no letter: **e4**. Captures use **x**: **Bxe5**, **exd5** (pawn from the e-file captures on d5).\n\n' +
      '- **K** king, **Q** queen, **R** rook, **B** bishop, **N** knight.\n' +
      '- **O-O** castles kingside, **O-O-O** queenside.\n' +
      '- **+** check, **#** checkmate, **=Q** promotion (**e8=Q**).\n' +
      '- When two identical pieces can reach the square, add the file or rank of the one that moves: **Nbd2**, **R1e2**.\n' +
      '- **1-0** White wins, **0-1** Black wins, **½-½** draw.\n\n' +
      'Annotators add **!** (good move), **!!** (brilliant), **?** (mistake), **??** (blunder), **!?** (interesting), **?!** (dubious).',
  },
  {
    id: 'pgn',
    title: 'PGN and FEN',
    body:
      '**PGN** (Portable Game Notation) is a text format for whole games: some header lines in square brackets, then the moves — `1. e4 e5 2. Nf3 Nc6 …` — with comments in braces and variations in parentheses. Every site can import and export it; the Analysis board here reads it with variations.\n\n' +
      '**FEN** (Forsyth–Edwards Notation) describes a single position in one line: the piece placement rank by rank from the 8th, the side to move, castling rights, the en passant square, the half-move clock and the move number. The starting position is `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`.',
  },
  {
    id: 'eval',
    title: 'Reading an engine evaluation',
    body:
      'Engines score positions in **centipawns** from White’s point of view: **+1.0** means White is about a pawn better, **−0.5** slightly better for Black. **M5** means mate in five. As a rough guide, ±0.3 is equal, ±1 is a clear edge, and ±3 is usually winning with good technique.\n\n' +
      'The evaluation bar on the analysis board is the same number drawn as a proportion. Depth is how many half-moves ahead the engine searched; higher is more reliable but slower.',
  },
];

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Back rank',
    definition:
      'The rank where the pieces start (1 for White, 8 for Black). A “back-rank mate” happens when a king is trapped there by its own pawns.',
    lesson: 'mating-patterns',
  },
  {
    term: 'Battery',
    definition:
      'Two pieces lined up on the same file, rank or diagonal, such as a queen behind a bishop.',
  },
  {
    term: 'Blockade',
    definition:
      'Placing a piece directly in front of an enemy passed pawn so it cannot advance. Knights are ideal blockaders.',
    lesson: 'opposite-bishops',
  },
  {
    term: 'Blunder',
    definition: 'A serious mistake that loses material or the game. Written “??”.',
  },
  {
    term: 'Castling',
    definition:
      'The king moves two squares towards a rook, and the rook jumps over it. See Rules › Special moves.',
    lesson: 'special-moves',
  },
  {
    term: 'Centralisation',
    definition:
      'Bringing pieces (especially the king in the endgame) towards the centre, where they control the most squares.',
    lesson: 'the-active-king',
  },
  {
    term: 'Centipawn',
    definition: 'One hundredth of a pawn — the unit engines use for evaluations.',
  },
  {
    term: 'Deflection',
    definition: 'Forcing a defending piece away from its post, usually with a sacrifice.',
    lesson: 'removing-the-defender',
  },
  {
    term: 'Discovered attack',
    definition:
      'Moving one piece uncovers an attack from another piece behind it. With check it is a discovered check.',
    lesson: 'discovered-attacks',
  },
  {
    term: 'Doubled pawns',
    definition:
      'Two pawns of the same colour on the same file. Usually a weakness because they cannot protect each other.',
    lesson: 'pawn-structures',
  },
  {
    term: 'Elo',
    definition:
      'A rating system that predicts results: a 200-point gap means the higher-rated player scores about 75%. The puzzle rating here uses Glicko-2, a refinement of Elo that also tracks how certain the rating is (the ± number).',
  },
  {
    term: 'En passant',
    definition:
      'A pawn capturing an enemy pawn that has just advanced two squares past it. See Rules › Special moves.',
    lesson: 'special-moves',
  },
  {
    term: 'Exchange (the)',
    definition:
      'A rook against a minor piece. “Winning the exchange” means giving a bishop or knight for a rook.',
    lesson: 'exchange-sacrifice',
  },
  {
    term: 'Fianchetto',
    definition:
      'Developing a bishop to b2/g2 (or b7/g7) after moving the knight’s pawn one square, so it controls the long diagonal.',
  },
  {
    term: 'Fork',
    definition: 'One piece attacking two or more enemy pieces at the same time.',
    lesson: 'forks',
  },
  {
    term: 'Gambit',
    definition:
      'An opening that gives up a pawn (or more) for development, time or attacking chances.',
  },
  {
    term: 'Initiative',
    definition:
      'Being the side that makes threats, so the opponent must react rather than carry out their own plans.',
  },
  {
    term: 'Isolated pawn',
    definition:
      'A pawn with no friendly pawns on the adjacent files. It cannot be protected by pawns.',
    lesson: 'pawn-structures',
  },
  {
    term: 'Luft',
    definition:
      'An escape square for the king made by moving a pawn in front of it, e.g. h3, to avoid back-rank mates.',
  },
  {
    term: 'Minority attack',
    definition:
      'Advancing fewer pawns against more (typically b4–b5 against a6/b7/c6) to create a weakness.',
  },
  {
    term: 'Opposition',
    definition:
      'Kings facing each other with one square between them. The side *not* to move has the opposition and can force the other king to give way.',
    lesson: 'king-and-pawn-endgames',
  },
  {
    term: 'Outpost',
    definition:
      'A square, protected by a pawn, that enemy pawns can never attack — a perfect home for a knight.',
  },
  {
    term: 'Passed pawn',
    definition:
      'A pawn with no enemy pawns in front of it on its own or adjacent files. It can only be stopped by pieces.',
    lesson: 'pawn-races',
  },
  {
    term: 'Perpetual check',
    definition:
      'An endless series of checks the opponent cannot escape, leading to a draw by repetition.',
  },
  {
    term: 'Pin',
    definition:
      'An attack on a piece that cannot (or should not) move because a more valuable piece stands behind it. Absolute if the piece behind is the king.',
    lesson: 'pins-and-skewers',
  },
  {
    term: 'Prophylaxis',
    definition: 'A move that prevents the opponent’s plan before it starts.',
    lesson: 'defence-and-prophylaxis',
  },
  {
    term: 'Sacrifice',
    definition:
      'Deliberately giving up material for a bigger gain: an attack, a promotion, or a mating net.',
  },
  {
    term: 'Skewer',
    definition:
      'A pin in reverse: the more valuable piece is in front and must move, exposing the piece behind it.',
    lesson: 'pins-and-skewers',
  },
  {
    term: 'Tempo',
    definition:
      'One move as a unit of time. “Gaining a tempo” means making a useful move that also forces the opponent to lose time.',
  },
  {
    term: 'Transposition',
    definition: 'Reaching the same position by a different order of moves.',
  },
  {
    term: 'Zugzwang',
    definition:
      'A position where every legal move makes things worse and the player would prefer to pass. Common in endgames.',
    lesson: 'king-and-pawn-endgames',
  },
  {
    term: 'Zwischenzug',
    definition:
      '“In-between move”: an unexpected forcing move inserted before the expected recapture or reply.',
  },
];

export const FAQ: { question: string; answer: string }[] = [
  {
    question: 'Which piece should I move first in the opening?',
    answer:
      'Start with a centre pawn (e4 or d4), then knights before bishops, castle early, and connect your rooks. Avoid moving the same piece twice or bringing the queen out before your minor pieces.',
  },
  {
    question: 'How much are the pieces worth?',
    answer:
      'Roughly: pawn 1, knight 3, bishop 3 (slightly more with the pair), rook 5, queen 9. The king is priceless. Values shift with the position — an active piece is worth more than a passive one.',
  },
  {
    question: 'What is a good rating?',
    answer:
      'Online ratings differ between sites. As a rough guide: under 800 is a beginner still learning tactics, 1000–1400 is a regular club player, 1600–2000 is strong, 2200+ is master level. The puzzle rating here follows the Lichess puzzle scale, which runs a few hundred points above game ratings; the Progress page shows what yours roughly corresponds to on Lichess, chess.com and FIDE.',
  },
  {
    question: 'What does the ± next to my puzzle rating mean?',
    answer:
      'How uncertain the rating still is (Glicko-2 calls it the rating deviation). ± 350 means the trainer has almost no idea yet and each puzzle moves the rating a lot; ± 60 means it is settled and moves about ten points at a time. Long breaks make it grow again, and you can restart a calibration run from the Progress page.',
  },
  {
    question: 'How do I get better fastest?',
    answer:
      'Play games at a slow enough pace to think, solve tactics every day, learn the basic endgames, and review your own games to find one lesson each time. Everything on this site is built around that loop.',
  },
  {
    question: 'Does Chess Trainer need an internet connection?',
    answer:
      'Only for the first visit. Everything — the engine, the puzzles, the lessons — is stored on your device so it works offline afterwards, and it can be installed like an app from your browser’s menu. Three optional features use the network when you ask: importing your games from Lichess or chess.com, the opening explorer and the endgame tablebase lookups; the last two are off by default.',
  },
  {
    question: 'What does Chess Trainer know about me?',
    answer:
      'Nothing. There is no account, no server and no tracking: the site is static files, and everything you do — your rating, progress, games and settings — stays in this browser on this device. The only requests that leave your device are the ones you trigger yourself (importing your games, the explorer and tablebase lookups), and they go straight to Lichess or chess.com. Sharing a link puts the game inside the link itself.',
  },
  {
    question: 'Is my progress backed up anywhere?',
    answer:
      'Progress is stored only in this browser, so clearing site data or switching browsers loses it. Use Export on the Settings page to save a backup file (or share it straight to another device) and Import to restore it. A backup made by any version imports into every later version.',
  },
  {
    question: 'How much can the app store?',
    answer:
      'Browsers allow a site roughly 5 MB of local storage. The Settings page shows how much is in use; imported games and the analysis library take the most room. If storage ever fills up, the app says so and keeps running — export a backup, then remove old analyses or games.',
  },
];
