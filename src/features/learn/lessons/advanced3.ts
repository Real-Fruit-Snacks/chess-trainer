import { fenAfter, type Lesson } from '../model';

// Caro-Kann, Panov Attack: a textbook isolated queen's pawn for White.
const PANOV =
  '1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 Nf6 5. Nc3 e6 6. Nf3 Be7 7. cxd5 Nxd5 8. Bd3 Nc6 9. O-O O-O 10. Re1';
const PANOV_BLACK = fenAfter(PANOV);
const PANOV_NE5 = fenAfter(`${PANOV} Bf6 11. Be4 Nce7`);
// Queen's Gambit Accepted: the d4-d5 break.
const QGA_D5 = fenAfter(
  '1. d4 d5 2. c4 dxc4 3. e3 Nf6 4. Bxc4 e6 5. Nf3 c5 6. O-O a6 7. Qe2 cxd4 8. exd4 Be7 9. Nc3 O-O 10. Rd1 Nc6',
);

// Sicilian Sveshnikov: the hole on d5.
const SVESH = '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5';
const SVESH_BXF6 = fenAfter(SVESH);
const SVESH_ND5 = fenAfter(`${SVESH} 9. Bxf6 gxf6`);
const SVESH_F5 = fenAfter(`${SVESH} 9. Bxf6 gxf6 10. Nd5`);

// Queen's Gambit Declined, Exchange Variation: the Carlsbad structure.
const CARLSBAD =
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 c6 9. Nf3 Re8 10. O-O Nf8';
const CARLSBAD_PREP = fenAfter(CARLSBAD);
const CARLSBAD_B4 = fenAfter(`${CARLSBAD} 11. Rab1 Ne4 12. Bxe7 Qxe7`);
const CARLSBAD_DEF = fenAfter(`${CARLSBAD} 11. Rab1`);

export const advancedLessons3: Lesson[] = [
  {
    id: 'isolated-queens-pawn',
    title: 'The isolated queen’s pawn',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'A weakness and a strength at once: attack the isolani in the endgame, use it for activity in the middlegame.',
    minutes: 9,
    steps: [
      {
        title: 'One pawn, two stories',
        text:
          'An **isolated queen’s pawn** (IQP) is a d-pawn with no friendly pawn on the c- or e-file. It can never be ' +
          'defended by a pawn, so in an endgame it is a target. But in the middlegame it gives its owner **space**, ' +
          'the **e5 outpost**, open lines for the pieces and the threat of the **d4-d5 break**.\n\n' +
          'Here White has the isolani after a Panov Attack. The plans are fixed for both sides:\n\n' +
          '- White: pieces to e5 and towards the king, then d4-d5 at the right moment.\n' +
          '- Black: blockade d5, put pressure on d4, and **trade pieces** — every exchange makes the pawn weaker.',
        fen: PANOV_BLACK,
        orientation: 'black',
        shapes: ['d4:red', 'e5:blue', 'd5:green'],
      },
      {
        title: 'Pressure on d4',
        text:
          'Black wants every piece aimed at d4. The bishop on e7 is doing nothing on the diagonal it stands on — ' +
          'find it a better one.',
        fen: PANOV_BLACK,
        orientation: 'black',
        shapes: ['d4:red'],
        task: {
          prompt: 'Black to move: put a piece on the isolani.',
          moves: ['Bf6', 'Nf6'],
          hint: 'Aim a bishop or knight straight at d4.',
          success:
            'Bf6! (Nf6 is fine too.) With bishop, knight and soon the queen on d4, White must spend pieces defending a pawn instead of attacking.',
          failure:
            'Playable, but the plan is pressure on d4: Bf6 or Nf6 both hit the isolated pawn directly.',
        },
      },
      {
        title: 'The e5 outpost',
        text:
          'White’s side of the story. The isolani controls **e5** and no black pawn can ever attack that square. ' +
          'A knight there stares at f7 and g6 and cramps Black’s whole kingside.',
        fen: PANOV_NE5,
        shapes: ['f3e5', 'e5:blue'],
        task: {
          prompt: 'White to move: use the outpost.',
          moves: ['Ne5'],
          hint: 'The knight belongs on the square the d-pawn protects.',
          success:
            'Ne5! From here the knight supports a kingside attack (Qd3, Qh3, Bg5 ideas) and cannot be driven away by a pawn.',
          failure: 'Not the plan. The knight belongs on e5, the outpost the isolani gives you.',
        },
      },
      {
        title: 'The d4-d5 break',
        text:
          'From a Queen’s Gambit Accepted. Black has just developed the knight to c6, but the c8 bishop and the queen ' +
          'are still at home. When your pieces are ready and the opponent’s are not, the isolani becomes a **battering ram**.',
        fen: QGA_D5,
        shapes: ['d4d5', 'c4:blue', 'd1:blue'],
        task: {
          prompt: 'White to move: open the position with the pawn break.',
          moves: ['d5'],
          hint: 'The pawn that was a weakness advances and opens every file and diagonal.',
          success:
            'd5! exd5 Nxd5 Nxd5 Bxd5 and White’s bishop, queen and rook all have open lines while Black is undeveloped. The “weak” pawn dissolved into activity.',
          failure:
            'A normal move, but the thematic choice is d5: break while Black is undeveloped, before the pawn becomes a target.',
        },
      },
      {
        title: 'Plans in one breath',
        text:
          '**With the isolani:** knight to e5, pieces towards the king, d4-d5 when it opens lines for you and not for ' +
          'the opponent. Avoid trades.\n\n' +
          '**Against the isolani:** blockade d5 with a knight, hit d4 with everything, trade pieces and head for an ' +
          'endgame where the pawn is simply weak. Never let the d5 break happen for free.',
        fen: PANOV_BLACK,
        orientation: 'black',
      },
    ],
    practiceThemes: ['middlegame', 'advantage'],
  },

  {
    id: 'outposts-and-weak-squares',
    title: 'Outposts and weak squares',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'A square that no pawn can ever attack is a home for a knight. Create it, remove its defenders, then move in.',
    minutes: 8,
    steps: [
      {
        title: 'What an outpost is',
        text:
          'An **outpost** is a square in the opponent’s half that is protected by your pawn and can never be ' +
          'attacked by an enemy pawn. In the Sveshnikov Sicilian Black plays ...e5 early and gives up **d5** ' +
          'forever: no black pawn can ever challenge a piece there.\n\n' +
          'A knight on an outpost is a permanent asset. The fight is about **who controls the square**: Black’s ' +
          'knight on f6 covers d5, so that defender has to go first.',
        fen: SVESH_BXF6,
        shapes: ['d5:red', 'f6d5:blue', 'g5f6'],
      },
      {
        title: 'Remove the defender',
        text: 'The knight on f6 is the only black piece guarding d5. White has a bishop attacking it.',
        fen: SVESH_BXF6,
        task: {
          prompt: 'White to move: take control of d5.',
          moves: ['Bxf6', 'Nd5'],
          hint: 'Which black piece is defending d5? Remove it.',
          success:
            'Bxf6! gxf6 also damages Black’s kingside. (Nd5 immediately is the other main line — the knight cannot be chased off.)',
          failure:
            'Too slow. Bxf6 removes the only defender of d5 — or jump in with Nd5 right away.',
        },
      },
      {
        title: 'Occupy it',
        text: 'The defender is gone and Black’s kingside pawns are doubled. Now claim the square.',
        fen: SVESH_ND5,
        shapes: ['c3d5', 'd5:red'],
        task: {
          prompt: 'White to move: plant a piece on the outpost.',
          moves: ['Nd5'],
          hint: 'The knight, of course. Which knight can reach d5?',
          success:
            'Nd5! A knight on d5 in the Sveshnikov is worth a pawn: it eyes c7, e7 and f6, and only a bishop can ever trade it off.',
          failure: 'Occupy the outpost first: Nd5 is the whole point of Bxf6.',
        },
      },
      {
        title: 'Fighting an outpost',
        text:
          'Black’s turn. You cannot chase a d5 knight with pawns, but you can **fight for the centre** so that the ' +
          'knight’s support disappears, or exchange it with a bishop. Here the doubled f-pawn becomes a weapon.',
        fen: SVESH_F5,
        orientation: 'black',
        shapes: ['f6f5', 'e4:red'],
        task: {
          prompt: 'Black to move: take the fight to the centre.',
          moves: ['f5', 'Bg7'],
          hint: 'Attack the pawn that supports the knight.',
          success:
            'f5! attacks e4, the pawn that protects the knight. If exd5 ever happens the knight loses its support. (Bg7 first is the other main line.)',
          failure:
            'The main lines are f5 — striking at e4 — or Bg7. Passive play leaves the knight on d5 unchallenged.',
        },
      },
      {
        title: 'Weak squares in your own camp',
        text:
          'Outposts are created by **pawn moves**. Every pawn you advance stops guarding the squares behind it, ' +
          'and every pawn exchange can leave a hole. Before you push a pawn, ask which squares it will never guard again.\n\n' +
          'The best piece for an outpost is a **knight**: it cannot be challenged along a line. A bishop on an outpost ' +
          'can be traded by a knight. And if the opponent has a knight on your outpost, the standard remedy is to ' +
          '**trade it for a bishop**, even at the cost of the bishop pair.',
        fen: SVESH_F5,
        orientation: 'black',
      },
    ],
    practiceThemes: ['middlegame', 'quietMove'],
  },

  {
    id: 'minority-attack',
    title: 'The minority attack',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Two pawns attack three: b4-b5 in the Carlsbad structure creates a weak pawn on c6 that lasts all game.',
    minutes: 8,
    steps: [
      {
        title: 'The Carlsbad structure',
        text:
          'After the Exchange Queen’s Gambit both sides have a symmetrical-looking centre: White’s pawns a2, b2 ' +
          'against Black’s a7, b7, c6. That imbalance is the point. White pushes **b4-b5** — two pawns against ' +
          'three — and after bxc6 bxc6 Black is left with a **backward c6 pawn** on a half-open file.\n\n' +
          'Black’s counterplay is on the other wing: ...Ne4 with kingside play, or ...a5 to slow the pawn down.',
        fen: CARLSBAD_PREP,
        shapes: ['b2b4', 'b4b5', 'c6:red'],
      },
      {
        title: 'Prepare the advance',
        text: 'Before b4 the b-pawn needs support, and White’s rook on a1 is doing nothing. One move fixes both.',
        fen: CARLSBAD_PREP,
        shapes: ['a1b1'],
        task: {
          prompt: 'White to move: prepare b4-b5.',
          moves: ['Rab1'],
          hint: 'Bring the rook behind the pawn you are about to push.',
          success:
            'Rab1! The rook supports b4-b5 and will later stare down the b-file. b4 straight away would hang the pawn to the bishop on e7.',
          failure:
            'The plan is the minority attack: Rab1 supports b4 without giving up anything. (b4 at once loses a pawn to Bxb4.)',
        },
      },
      {
        title: 'Push',
        text: 'Black challenged with ...Ne4 and the bishops were traded. Nothing now stops the pawn.',
        fen: CARLSBAD_B4,
        shapes: ['b2b4', 'b4b5'],
        task: {
          prompt: 'White to move: start the minority attack.',
          moves: ['b4'],
          hint: 'The pawn move this lesson is about.',
          success:
            'b4! Next comes b5, and after bxc6 bxc6 Black spends the rest of the game defending c6 while White’s rooks own the b- and c-files.',
          failure: 'Play the plan: b4, then b5.',
        },
      },
      {
        title: 'Defending against it',
        text:
          'Now the black side. White has just played Rab1 and b4 is coming. Black can **slow it down** with ...a5 ' +
          '(after b4 axb4 the a-file opens for Black too) or **ignore it** and take the fight to the kingside with ...Ne4.',
        fen: CARLSBAD_DEF,
        orientation: 'black',
        shapes: ['a7a5', 'f6e4:blue'],
        task: {
          prompt: 'Black to move: choose a counter to the minority attack.',
          moves: ['a5', 'Ne4'],
          hint: 'Either meet the pawn advance on the a-file or grab the e4 outpost.',
          success:
            'Both a5 and Ne4 are the standard answers. a5 makes b4 cost a tempo and opens the a-file; Ne4 uses Black’s own outpost and starts kingside play.',
          failure:
            'Too passive. Against the minority attack Black must either slow the pawn (a5) or start their own play (Ne4).',
        },
      },
      {
        title: 'Why it works',
        text:
          'After b5 Black has no good answer: **...cxb5** gives White the c-file and an isolated d5 pawn, **...c5** ' +
          'leaves d5 isolated after dxc5, and doing nothing allows bxc6 bxc6 with a weak pawn on c6 for ever. ' +
          'The attack is slow, so Black gets time for kingside play — that race is the whole middlegame of the Exchange QGD.',
        fen: CARLSBAD_B4,
      },
    ],
    practiceThemes: ['middlegame', 'advantage'],
  },

  {
    id: 'fortresses-and-zugzwang',
    title: 'Fortresses and zugzwang',
    level: 'advanced',
    category: 'Endgames',
    summary:
      'When every move makes things worse, and when a position simply cannot be broken: the two endgame secrets.',
    minutes: 9,
    steps: [
      {
        title: 'Zugzwang: the obligation to move',
        text:
          'In chess you must move. Sometimes that is a curse: every legal move makes your position worse. That is ' +
          '**zugzwang**, and it decides more endgames than any tactic.\n\n' +
          'The simplest case: king and pawn against king. White’s pawn can only get through if the black king is ' +
          'forced to step aside. Instead of pushing, White takes the **opposition** — after Ke4 the kings face each ' +
          'other, and it is Black who must move and give way.',
        fen: '8/8/8/2k5/8/3KP3/8/8 w - - 0 1',
        shapes: ['d3e4', 'c5:red'],
      },
      {
        title: 'Take the opposition',
        text: 'Only one move wins here. Pushing the pawn lets the black king sit in front of it for ever.',
        fen: '8/8/8/2k5/8/3KP3/8/8 w - - 0 1',
        task: {
          prompt: 'White to move: put Black in zugzwang.',
          moves: ['Ke4'],
          hint: 'A king move that leaves Black’s king no good square.',
          success:
            'Ke4! Now Black must move: Kd6 Kf5, Kc6 Ke5 or Kb4 Kd5 — every king move lets White’s king walk forward and escort the pawn. e4? and the black king simply stays in front of the pawn: a draw.',
          failure:
            'That lets the black king stay in front of the pawn. Ke4 takes the opposition and forces Black to give way.',
        },
      },
      {
        title: 'Mutual zugzwang: the trebuchet',
        text:
          'Two kings, two blocked pawns, each king attacking the other’s pawn. **Whoever has to move loses**: the ' +
          'king must step away, the pawn falls, and the other pawn walks home. This position is called the *trebuchet*.\n\n' +
          'Positions like this are traps — the trick is never to arrive in them with your own move.',
        fen: '8/8/8/3Kp3/4Pk2/8/8/8 w - - 0 1',
        shapes: ['d5:red', 'f4:red', 'e5:blue', 'e4:blue'],
      },
      {
        title: 'Do not step in first',
        text: 'One square from the trebuchet. Black’s king is heading for f4. Where does White’s king go?',
        fen: '8/8/8/4p3/2K1P1k1/8/8/8 w - - 0 1',
        shapes: ['d5:red', 'e4:blue'],
        task: {
          prompt: 'White to move: hold the draw.',
          moves: ['Kd3', 'Kc3'],
          hint: 'Stay in touch with your pawn, but do not go to d5.',
          success:
            'Kd3 (or Kc3)! If ...Kf4 White simply plays Kd2 and after ...Kxe4 Ke2 takes the opposition — a known draw. Kd5? Kf4 is the trebuchet with White to move, and Kc5? Kf3! wins the same way one move later.',
          failure:
            'That loses the e4 pawn or steps into the trebuchet. Kd3 or Kc3 keeps the pawn protected without walking into d5.',
        },
      },
      {
        title: 'Fortresses',
        text:
          'A **fortress** is a position the stronger side cannot break no matter how much material it has. The most ' +
          'famous is the **wrong rook pawn**: a bishop and a rook pawn cannot win if the bishop does not control the ' +
          'promotion square and the defending king reaches the corner.\n\n' +
          'Here White’s bishop is light-squared and the h-pawn promotes on the dark square h8. Black draws by sitting ' +
          'in the corner — as long as the king gets there.',
        fen: '8/5k2/8/4K2P/8/3B4/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['h8:green', 'f7g7', 'g7h8'],
      },
      {
        title: 'Run to the corner',
        text: 'White’s king is about to cut you off. There is exactly one direction to go.',
        fen: '8/5k2/8/4K2P/8/3B4/8/8 b - - 0 1',
        orientation: 'black',
        task: {
          prompt: 'Black to move: reach the fortress.',
          moves: ['Kg7', 'Kg8'],
          hint: 'Head for h8, the square the bishop cannot control.',
          success:
            'Kg7! Now the king shuffles between g7, g8 and h8 for ever. White can give stalemate but never mate, and the pawn never promotes.',
          failure:
            'Ke7? Bc4! and the king is cut off from the corner: the h-pawn runs to h8 unopposed. Only Kg7 (or Kg8) reaches the fortress.',
        },
      },
      {
        title: 'Recognising fortresses',
        text:
          'Other classic fortresses worth knowing:\n\n' +
          '- **Queen against rook and pawn** when the rook stands on its third rank protected by a pawn, with the king tucked behind.\n' +
          '- **Rook against bishop** with the defending king in the corner *opposite* to the bishop’s colour.\n' +
          '- **Opposite-coloured bishops** with a blockade on the colour the attacker’s bishop cannot touch.\n' +
          '- **Rook against rook and rook pawn** with the defender using the Vancura method (see the drills).\n\n' +
          'When you are losing, ask: is there a position I can reach that the opponent cannot break? When you are ' +
          'winning, ask the same question before you trade — and avoid it.',
        fen: '8/5k2/8/4K2P/8/3B4/8/8 b - - 0 1',
        orientation: 'black',
      },
    ],
    practiceThemes: ['zugzwang', 'defensiveMove'],
  },
];
