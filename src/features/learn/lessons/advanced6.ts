import { fenAfter, type Lesson } from '../model';

// Rook and bishop versus rook.
const RB_PHILIDOR = '3k4/8/3K4/3B4/8/8/4r3/5R2 w - - 0 1';
const RB_PHILIDOR_2 = fenAfter('Rf8+ Re8', RB_PHILIDOR);
const RB_PHILIDOR_3 = fenAfter('Rf8+ Re8 Rf7 Re2', RB_PHILIDOR);
const RB_COCHRANE = '6k1/1R6/8/4K3/4B3/8/8/4r3 b - - 0 1';
const RB_COCHRANE_2 = '3k4/1R6/8/4K3/4B3/8/8/4r3 b - - 0 1';

// Catalan and Queen's Gambit Declined plans.
const CAT_OPEN = fenAfter('1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4');
const CAT_OPEN_2 = fenAfter('1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4 7. Qc2');
const CAT_OPEN_3 = fenAfter(
  '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4 7. Qc2 a6 8. Qxc4',
);
const CAT_OPEN_4 = fenAfter(
  '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O dxc4 7. Qc2 a6 8. Qxc4 b5 9. Qc2',
);
const CAT_CLOSED = fenAfter(
  '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O c6 7. Qc2 b6 8. Nbd2 Bb7 9. e4',
);
const QGD_CARLSBAD = fenAfter(
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 Re8 9. Nf3 c6 10. O-O Nf8',
);
const QGD_MINORITY = fenAfter(
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 Re8 9. Nf3 c6 10. O-O Nf8 11. Rab1 h6 12. Bh4 Ne4 13. Bxe7 Qxe7',
);
const QGD_TARTAKOWER = fenAfter(
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. Be2 Bb7 9. Bxf6 Bxf6 10. cxd5 exd5 11. O-O',
);

// French structures.
const FR_ADVANCE = fenAfter('1. e4 e6 2. d4 d5 3. e5');
const FR_ADVANCE_2 = fenAfter('1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3');
const FR_ADVANCE_3 = fenAfter('1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 Nh6 7. b4');
const FR_F6 = fenAfter(
  '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Bd7 6. Be2 Nge7 7. O-O Ng6 8. g3',
);
const FR_WINAWER = fenAfter('1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7');
const FR_WINAWER_2 = fenAfter(
  '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Qg4',
);
const FR_TARRASCH = fenAfter(
  '1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5 5. Ngf3 Nc6 6. Bb5 Bd6 7. O-O Nge7 8. dxc5 Bxc5 9. Nb3 Bd6 10. Re1 O-O',
);

// Exchange sacrifices II (positions from Lichess games, CC0 puzzle database).
const EX_SICILIAN = '2r2rk1/1p1qbppp/p2p1nn1/P2Pp1B1/1P2P3/2N2N2/5PPP/2RQ1RK1 b - - 2 15';
const EX_STRUCTURE = '2rq1k1r/p4ppp/1p1bpn2/7b/3PB3/1QN1P3/PP3PPP/R1B2RK1 b - - 2 13';
const EX_KING = 'r4rk1/1p1b2p1/p3pnQp/2pp2N1/3n2qP/2NB4/PPP3P1/1K1R1R2 w - - 6 21';
const EX_PIN = 'r3r1k1/p5p1/2p2nQ1/1p1p2B1/4q3/P7/2P3PP/1R3R1K w - - 1 23';
const EX_ENDGAME = '6k1/1p3pp1/2p2nbp/2P2p2/1PP2P2/2N1r3/4BKPP/2R5 b - - 4 21';

// Calculation III (positions from Lichess games, CC0 puzzle database).
const CALC_RACE = '8/8/8/2p4p/3k4/2rP1K1P/3R2P1/8 b - - 3 49';
const CALC_RACE_2 = fenAfter('Rxd3+ Rxd3+ Kxd3 g4', CALC_RACE);
const CALC_RACE_3 = fenAfter(
  'Rxd3+ Rxd3+ Kxd3 g4 hxg4 hxg4 c4 g5 c3 g6 c2 g7 c1=Q g8=Q',
  CALC_RACE,
);
const CALC_BREAK = '8/5p2/p3p3/7p/7P/6P1/P4Pk1/4K3 w - - 0 43';
const CALC_SIMPLIFY = fenAfter('Bxc3 Kxc3', '8/8/p7/1p3K2/1P1B4/2rkP3/8/8 w - - 0 63');
const CALC_QUIET = 'r2q1r2/pp1b1pk1/2n1pbp1/4N3/3P1PQ1/PB5R/1PP3P1/2KR4 w - - 3 21';
const CALC_KING = fenAfter('Kxg2 Kg5', '8/7p/p5pk/5p2/P2p4/3P4/1PP3q1/5K2 w - - 0 42');

// When there is nothing to do (positions from the classic games in this app).
const NOTHING_BA7 = 'r1rq1bk1/1n1b1p1p/3p1np1/1p1Pp3/1Pp1P3/2P1BNNP/R2Q1PP1/1B2R1K1 w - - 2 24';
const NOTHING_RA2 = 'r1r2bk1/1nqb1p1p/3p1np1/1ppPp3/1P2P3/2PBBNNP/3Q1PP1/R3R1K1 w - - 2 22';
const NOTHING_F4 = 'r1rnb1k1/B1n1qpbp/3p2p1/1p1Pp3/1Pp1P3/2P4P/R2QNPPN/RB4K1 w - - 14 30';
const NOTHING_NF1 = '1rb2rk1/1nq1bppp/3p1n2/1ppPp3/1P2P3/2P2N1P/2BN1PP1/R1BQR1K1 w - - 1 17';
const NOTHING_KING = '5k2/p1p4R/1pr5/3p1pP1/P2P1P2/2P2K2/8/8 w - - 0 35';
const NOTHING_ROOK = '8/p3k1pp/8/5R2/8/4PK2/Pr4PP/8 w - - 0 27';
const NOTHING_SAFETY = 'r1b1nr2/pp2pk1p/2n1p1p1/4b3/8/2N1B3/PPPQ1PPP/R3K2R w KQ - 0 14';

export const advancedLessons6: Lesson[] = [
  {
    id: 'rook-and-bishop-vs-rook',
    title: 'Rook and bishop versus rook',
    level: 'advanced',
    category: 'Endgames',
    summary:
      'Usually a draw, often lost in practice. The Philidor position that wins, and the Cochrane defence that holds — the two things to know before you get there.',
    minutes: 8,
    practiceThemes: ['rookEndgame', 'endgame'],
    steps: [
      {
        title: 'The Philidor position',
        text: 'Rook and bishop against rook is a theoretical draw — but with the defending king pushed to the edge and the kings facing each other, it is lost. This is Philidor’s position: White wins, and the method starts with a rook check that forces the black rook to the back rank, where it is passive.',
        fen: RB_PHILIDOR,
        shapes: ['f1f8', 'e2:red'],
        task: {
          prompt: 'White to move: begin the winning method.',
          moves: ['Rf8+'],
          reply: 'Re8',
          hint: 'A check on the back rank.',
          success:
            'Rf8+ Re8 (the only way to block) and now Rf7! takes the seventh rank, threatening Ra7 and Ra8 mate. The black rook has to leave e8 again.',
          failure: 'Rf8+! forces the rook to e8, where it blocks its own king. Then Rf7 wins.',
        },
      },
      {
        title: 'The seventh rank',
        text: 'With the black rook on e8 the king has no escape square. Take the seventh rank: the threat is Ra7 followed by Ra8 mate, and Black has to give the rook a worse square.',
        fen: RB_PHILIDOR_2,
        shapes: ['f8f7', 'a7:blue', 'a8:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Rf7'],
          reply: 'Re2',
          hint: 'The rook goes to the seventh, threatening mate.',
          success:
            'Rf7 Re2 (Re1 Rg7 and the same story) and now the rook swings to the other wing — Rg7 — so that the checks from the black rook run out of squares.',
          failure: 'Rf7! threatens Ra7 and Ra8#. The black rook must leave the back rank.',
        },
      },
      {
        title: 'Swing to the other side',
        text: 'The black rook checks along the e-file whenever the white king moves, so the white rook prepares to interpose: it goes to g7 (or b7), from where it can come back to the second rank with tempo. Philidor’s full solution takes about fifteen moves; the pattern is “rook to the seventh, then swing, then Bb3/Be6 to block the checks”.',
        fen: RB_PHILIDOR_3,
        shapes: ['f7g7', 'e2:red'],
        task: {
          prompt: 'White to move: keep the win.',
          moves: ['Rg7'],
          hint: 'The rook goes to the wing where the black rook has fewer checks.',
          success:
            'Rg7 Re1 Rb7 Rc1 Bb3! Rc3 Be6 Rd3+ Bd5 Rc3 Rd7+ Kc8 Rf7 Kb8 Rb7+ Kc8 Rb4 Kd8 Bc4 Kc8 Be6+ and the rook is won. Long, but every move has the same purpose: cut the checks.',
          failure:
            'Rg7! Re1 Rb7 Rc1 Bb3 and the bishop takes the checking squares away one by one.',
        },
      },
      {
        title: 'The Cochrane defence',
        text:
          'When you are the defender, keep your king **away from the edge opposite the attacking king** and pin the bishop against the king from behind. In the Cochrane defence the rook on e1 pins the bishop on e4 to the king on e5; White cannot make progress without unpinning, which lets the black king back to the centre.\n\n' +
          'Black to move: keep the king on the back rank but away from the mating corner.',
        fen: RB_COCHRANE,
        orientation: 'black',
        shapes: ['e1e4', 'e4:red', 'f8:green'],
        task: {
          prompt: 'Black to move: hold.',
          moves: ['Kf8', 'Kh8'],
          hint: 'A king move that keeps the pin and stays out of the corner mates.',
          success:
            'Kf8! (or Kh8) and White has nothing: Rh7 Ke8 and the king walks along the back rank while the rook keeps the pin. When the bishop moves, the black king returns to the centre.',
          failure:
            'Kf8 or Kh8 — keep the pin on the e-file and stay away from the rook on the seventh.',
        },
      },
      {
        title: 'Same defence, other side',
        text: 'The same pin with the king on d8. Choose the king move that keeps it out of the mating net on the c-file (where the rook on b7 and the bishop would combine).',
        fen: RB_COCHRANE_2,
        orientation: 'black',
        shapes: ['e1e4', 'e8:green'],
        task: {
          prompt: 'Black to move: hold.',
          moves: ['Ke8', 'Kc8'],
          hint: 'Stay on the back rank; the pin does the work.',
          success:
            'Ke8! (Kc8 also holds) and the pin stays. White’s only try, moving the king, releases the black king to the centre and the draw is safe.',
          failure: 'Ke8 (or Kc8) holds: the bishop stays pinned and the king cannot be mated.',
        },
      },
      {
        title: 'Summary',
        text:
          '- **Attacker**: aim for the Philidor position — enemy king on the edge, your king in front of it, bishop between them. Then Rf8+, Rf7, swing, and block the checks with the bishop.\n' +
          '- **Defender**: avoid the edge opposite the king; if you are pushed there, pin the bishop from behind (Cochrane) or keep the rook on the second rank with the king in front (the second-rank defence).\n' +
          '- Count the fifty-move rule: the attacker has time, but not unlimited time.',
        fen: RB_PHILIDOR,
      },
    ],
  },
  {
    id: 'catalan-and-qgd-plans',
    title: 'Catalan and Queen’s Gambit plans',
    level: 'advanced',
    category: 'Openings',
    summary:
      'The middlegame ideas behind 1.d4 d5 2.c4: the Catalan bishop and the ...dxc4/...c5 counter, the Carlsbad structure with the minority attack, and Black’s freeing breaks in the Queen’s Gambit Declined.',
    minutes: 9,
    practiceThemes: ['opening', 'middlegame'],
    steps: [
      {
        title: 'The Catalan: regain the pawn calmly',
        text: 'In the Catalan White fianchettoes the king’s bishop and lets Black take on c4, trusting the bishop on the long diagonal to win the pawn back with interest. After 6...dxc4 the quiet Qc2 (or Ne5) prepares Qxc4 while the bishop eyes b7.',
        fen: CAT_OPEN,
        shapes: ['d1c2', 'c2c4:blue', 'g2b7:blue'],
        task: {
          prompt: 'White to move: prepare to regain the pawn.',
          moves: ['Qc2', 'Ne5'],
          hint: 'Do not hurry — the pawn cannot run away.',
          success:
            'Qc2 (or Ne5) and the pawn comes back: after ...a6 Qxc4 b5 Qc2 Bb7 both sides have their plan — Black holds the extra pawn for a while, White presses on the c-file and the long diagonal.',
          failure:
            'Qc2 (or Ne5) regains the pawn in comfort. Grabbing with Qa4 is possible but less flexible.',
        },
      },
      {
        title: 'Black’s counter: ...a6 and ...b5',
        text: 'Black does not defend the c4-pawn; instead the plan is **...a6, ...b5 and ...Bb7**, gaining space on the queenside and developing the bishop to fight the Catalan bishop. Start it now.',
        fen: CAT_OPEN_2,
        orientation: 'black',
        shapes: ['a7a6', 'b7b5:blue', 'c8b7:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['a6'],
          hint: 'Prepare ...b5.',
          success:
            '...a6 Qxc4 b5 Qc2 Bb7 — the main line. Black’s bishop on b7 neutralises the Catalan bishop.',
          failure:
            '...a6! prepares ...b5 with tempo on the queen. ...b5 at once loses the pawn to Qxc4? no — to Ne5 and Bxa8 ideas.',
        },
      },
      {
        title: 'With tempo',
        text: 'The queen has taken on c4. Kick it while gaining space.',
        fen: CAT_OPEN_3,
        orientation: 'black',
        shapes: ['b7b5', 'c4:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['b5'],
          hint: 'Attack the queen with a pawn.',
          success:
            '...b5 Qc2 Bb7 and Black has completed the plan. Next come ...Nbd7 and ...c5 to open the c-file.',
          failure: '...b5! gains a tempo on the queen and prepares ...Bb7.',
        },
      },
      {
        title: 'The bishop to b7',
        text: 'Complete the set-up: the bishop belongs on the long diagonal, facing White’s Catalan bishop.',
        fen: CAT_OPEN_4,
        orientation: 'black',
        shapes: ['c8b7', 'g2:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['Bb7'],
          hint: 'Develop the bishop where it opposes White’s.',
          success:
            '...Bb7. Plans from here: Black plays ...Nbd7, ...c5 (or ...Nc6–b4) and uses the extra queenside space; White plays Bf4 or Bg5, Nbd2–b3 and pressure on c5 and c7.',
          failure: '...Bb7 is the point of ...a6 and ...b5: the bishop takes the long diagonal.',
        },
      },
      {
        title: 'The closed Catalan: the ...c5 break',
        text: 'If Black keeps the centre closed with ...c6 and ...b6, White plays e4 and gains space. Black’s counter is the **...c5 break** (or ...dxe4 followed by ...c5): open the c-file before White’s space becomes an attack.',
        fen: CAT_CLOSED,
        orientation: 'black',
        shapes: ['c6c5', 'd5e4:blue'],
        task: {
          prompt: 'Black to move: free the position.',
          moves: ['c5', 'dxe4'],
          hint: 'Strike at the centre before it strikes you.',
          success:
            '...c5! (or ...dxe4 first) and the position opens while Black is fully developed. Waiting with ...Nbd7? allows e5 and a bind.',
          failure:
            '...c5 (or ...dxe4) is the freeing break. Passive moves let White play e5 with a lasting space advantage.',
        },
      },
      {
        title: 'The Carlsbad structure',
        text: 'After cxd5 exd5 in the QGD, the pawn structure is the **Carlsbad**: White’s plan is the **minority attack** — b4–b5 to create a weak pawn on c6 — while Black attacks on the kingside or plays ...Ne4. First the rook goes to b1 (or h3 first, taking g4 from the knight). Choose a useful preparing move.',
        fen: QGD_CARLSBAD,
        shapes: ['a1b1', 'b2b4:blue', 'b4b5:blue', 'c6:red'],
        task: {
          prompt: 'White to move: prepare the minority attack.',
          moves: ['Rab1', 'h3'],
          hint: 'The rook supports b4; h3 stops ...Ng4 and ...Bg4.',
          success:
            'Rab1 (or h3) — every move serves the plan b4–b5. After ...h6 Bh4 Ne4 Bxe7 Qxe7 the pawn goes: b4!',
          failure:
            'Rab1 or h3: prepare b4–b5. The minority attack is slow but it creates a permanent weakness on c6.',
        },
      },
      {
        title: 'Push',
        text: 'The preparation is done: play the minority attack.',
        fen: QGD_MINORITY,
        shapes: ['b2b4', 'b4b5:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['b4'],
          hint: 'The pawn advance that starts the attack on c6.',
          success:
            'b4! and b5 follows. After bxc6 bxc6 Black has an isolated c-pawn; after ...cxb5 White gets the open c-file and a target on d5.',
          failure:
            'b4! — the minority attack. Two pawns against three on the queenside, and c6 becomes weak.',
        },
      },
      {
        title: 'The Tartakower: Black’s ...c5',
        text: 'In the Tartakower QGD (…b6 and …Bb7) Black keeps both bishops and prepares the freeing **...c5**. With the bishop on f6 supporting it and the b7-bishop on the diagonal, ...c5 equalises at once.',
        fen: QGD_TARTAKOWER,
        orientation: 'black',
        shapes: ['c7c5', 'f6d4:blue'],
        task: {
          prompt: 'Black to move: the freeing break.',
          moves: ['c5', 'Qe7'],
          hint: 'The break that opens the position for the bishops.',
          success:
            '...c5! dxc5 Bxc3 bxc3 bxc5 and Black’s isolated pawns are more than balanced by activity; or dxc5 bxc5 with hanging pawns and open lines for the bishops.',
          failure: '...c5 is Black’s equaliser in the Tartakower: the bishops need open lines.',
        },
      },
      {
        title: 'Plans at a glance',
        text:
          '- **Open Catalan** (…dxc4): White regains the pawn with Qc2/Ne5 and presses on the long diagonal; Black plays …a6, …b5, …Bb7, then …c5.\n' +
          '- **Closed Catalan** (…c6, …b6): White plays e4 for space; Black must break with …c5 or …dxe4 and …c5.\n' +
          '- **Carlsbad** (cxd5 exd5): the minority attack b4–b5 against c6; Black plays …Ne4, …Bf5 and looks at the kingside.\n' +
          '- **Tartakower**: …b6, …Bb7 and the freeing …c5.\n\n' +
          'The Queen’s Gambit repertoires in the Openings section put these plans into move orders.',
        fen: CAT_OPEN,
      },
    ],
  },
  {
    id: 'french-structures',
    title: 'French structures',
    level: 'advanced',
    category: 'Openings',
    summary:
      'The pawn chain of the Advance, the doubled c-pawns of the Winawer and the open lines of the Tarrasch — what each side is playing for in the French Defence, and the breaks that decide it.',
    minutes: 9,
    practiceThemes: ['opening', 'middlegame'],
    steps: [
      {
        title: 'The pawn chain',
        text: 'After 3.e5 the pawns form chains: d4–e5 for White, e6–d5 for Black. Nimzowitsch’s rule: **attack a chain at its base**. White’s base is d4, so Black’s first move is the pawn break ...c5, and the whole opening revolves around the d4-square.',
        fen: FR_ADVANCE,
        orientation: 'black',
        shapes: ['c7c5', 'd4:red', 'e5:blue'],
        task: {
          prompt: 'Black to move: attack the base of the chain.',
          moves: ['c5'],
          hint: 'The pawn break against d4.',
          success: '...c5! and then ...Nc6, ...Qb6 and ...Nh6–f5: everything against d4.',
          failure: '...c5 is the move: it attacks the base of White’s pawn chain at once.',
        },
      },
      {
        title: 'Pressure on d4',
        text: 'Black piles up on d4: knight on c6, queen on b6 (which also eyes b2), knight to f5 via h6 or e7. White defends with c3, Be2 and sometimes a3 and b4 to gain space. Add the queen.',
        fen: FR_ADVANCE_2,
        orientation: 'black',
        shapes: ['d8b6', 'b6d4:blue', 'c8d7:blue'],
        task: {
          prompt: 'Black to move: increase the pressure on d4.',
          moves: ['Qb6', 'Bd7'],
          hint: 'The queen goes to the diagonal that hits d4 and b2.',
          success:
            '...Qb6 (or ...Bd7 first). The queen ties the c1-bishop to b2 and adds a third attacker to d4.',
          failure:
            '...Qb6 (or ...Bd7) — pile up on d4. White is already committed to defending it.',
        },
      },
      {
        title: 'Exchange at the right moment',
        text: 'White has gained space with a3 and b4. Now Black exchanges on d4: after cxd4 the knight comes to f5 and d4 is a fixed target. Do not exchange earlier — the tension is Black’s asset until the knight is ready.',
        fen: FR_ADVANCE_3,
        orientation: 'black',
        shapes: ['c5d4', 'h6f5:blue', 'd4:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['cxd4'],
          hint: 'Exchange on d4 now that the knight can come to f5.',
          success:
            '...cxd4 cxd4 Nf5 and d4 is attacked three times. White has to play Bb2 or Be3 and Black has real pressure — the Advance French from Black’s side.',
          failure: '...cxd4! cxd4 Nf5 — the knight arrives with tempo on d4.',
        },
      },
      {
        title: 'The ...f6 break',
        text: 'Black’s second lever is **...f6**, attacking the head of the chain on e5. It is right when the pieces are ready to use the f-file and the e5-square after the exchange — here the knight on g6 and the bishop on d7 are, and White has just weakened the kingside with g3.',
        fen: FR_F6,
        orientation: 'black',
        shapes: ['f7f6', 'e5:red'],
        task: {
          prompt: 'Black to move: the second break.',
          moves: ['f6', 'Be7', 'cxd4'],
          hint: 'Attack the head of the chain.',
          success:
            '...f6! exf6 Qxf6 and Black has the f-file and the e5-square; the pawn on d4 is weaker than ever. Timing is everything: ...f6 too early only gives White the e5-square.',
          failure:
            '...f6 (or a preparing move like ...Be7) — the chain is attacked at the head now that the pieces are ready.',
        },
      },
      {
        title: 'The Winawer: doubled pawns, dark squares',
        text: 'In the Winawer Black gives up the dark-squared bishop for doubled c-pawns. White’s compensation is the bishop pair and the dark squares around Black’s king — hence the sharp **Qg4**, hitting g7 at once. Black answers ...Qc7 or ...O-O, and the game turns on whether White’s attack outruns Black’s queenside play against the weak pawns.',
        fen: FR_WINAWER,
        shapes: ['d1g4', 'g4g7:blue', 'c3:red'],
        task: {
          prompt: 'White to move: the main line.',
          moves: ['Qg4', 'Nf3', 'a4'],
          hint: 'The sharpest move attacks g7; the calm ones are Nf3 and a4.',
          success:
            'Qg4 — the Winawer main line. ...Qc7 (the Poisoned Pawn: Qxg7 Rg8 Qxh7 cxd4 with a wild fight) or ...O-O followed by ...f5. Nf3 and a4 are the positional alternatives.',
          failure:
            'Qg4 (or Nf3, a4). The dark squares are White’s asset once the g7-bishop is gone.',
        },
      },
      {
        title: 'Black’s reply',
        text: 'Against Qg4 Black has two roads: ...Qc7, offering the g-pawn for a lead in development and play against c3, or ...O-O, keeping the pawn and planning ...f5. Both are playable; choose one.',
        fen: FR_WINAWER_2,
        orientation: 'black',
        shapes: ['d8c7', 'e8g8:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Qc7', 'O-O', 'cxd4'],
          hint: 'The Poisoned Pawn (...Qc7) or castling.',
          success:
            '...Qc7 — after Qxg7 Rg8 Qxh7 cxd4 Black has the c-file, the initiative and White’s king still in the centre. ...O-O is the solid choice.',
          failure:
            '...Qc7 or ...O-O. Both are main lines; the point is to know the plan behind your choice.',
        },
      },
      {
        title: 'The Tarrasch: open lines',
        text: 'After 3.Nd2 c5 4.exd5 exd5 the centre opens and Black gets an isolated d-pawn — activity for a weakness (see the lesson on the isolated queen’s pawn). White blockades d4 and develops with Bd3, Bg5 and Nbd4. Pick a developing move that fits the plan.',
        fen: FR_TARRASCH,
        shapes: ['b5d3', 'c1g5:blue', 'd4:green'],
        task: {
          prompt: 'White to move.',
          moves: ['Bd3', 'Bg5', 'Nbd4'],
          hint: 'Develop towards the blockade of d4 and the kingside.',
          success:
            'Bd3 (Bg5 and Nbd4 are also good): White aims the bishop at h7, pins the knight and puts a knight on d4 in front of the isolated pawn.',
          failure: 'Bd3, Bg5 or Nbd4 — develop with the blockade on d4 in mind.',
        },
      },
      {
        title: 'Three structures, three plans',
        text:
          '- **Advance** (3.e5): Black attacks d4 with ...c5, ...Nc6, ...Qb6 and ...Nf5, then breaks with ...f6; White gains space with c3, a3, b4 and plays on the kingside.\n' +
          '- **Winawer** (3.Nc3 Bb4): doubled c-pawns against the dark squares; Qg4 and the bishop pair for White, ...c4 and the c-file for Black.\n' +
          '- **Tarrasch** (3.Nd2): an open game with an isolated pawn — blockade and pressure against activity.\n\n' +
          'The French repertoire in the Openings section trains the moves; this lesson is the “why”.',
        fen: FR_ADVANCE,
      },
    ],
  },
  {
    id: 'exchange-sacrifices-2',
    title: 'Exchange sacrifices II',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Beyond the tactical exchange sacrifice: ...Rxc3 in the Sicilian, wrecking the pawn structure, destroying the king’s cover, and the sacrifice that simplifies into a won ending.',
    minutes: 8,
    practiceThemes: ['sacrifice', 'capturingDefender'],
    steps: [
      {
        title: 'The Sicilian ...Rxc3',
        text: 'The most famous positional exchange sacrifice: Black’s rook takes the knight on c3. For the exchange Black gets a pawn, the bishop pair or a wrecked pawn structure, and pressure on e4 — often more than enough. Here the follow-up ...Nxe4 wins a pawn at once.',
        fen: EX_SICILIAN,
        orientation: 'black',
        shapes: ['c8c3', 'f6e4:blue', 'e4:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['Rxc3'],
          reply: 'Rxc3',
          hint: 'The thematic sacrifice on c3.',
          success:
            '...Rxc3! Rxc3 Nxe4 and the knight forks the rook and the bishop: Bd2 Nxc3 Bxc3 — Black has two pawns and a better structure for the exchange, and the white king is weak.',
          failure:
            '...Rxc3! Rxc3 Nxe4 regains the material with interest — the classic Sicilian sacrifice.',
        },
      },
      {
        title: 'Wreck the structure',
        text: 'The same capture with a different purpose: after bxc3 White’s queenside pawns are doubled and isolated, and ...Nxe4 picks up a pawn as well. A rook is worth a knight, a pawn and a ruined structure.',
        fen: EX_STRUCTURE,
        orientation: 'black',
        shapes: ['c8c3', 'e4:red'],
        task: {
          prompt: 'Black to move.',
          moves: ['Rxc3'],
          reply: 'bxc3',
          hint: 'Take the knight and count the pawns afterwards.',
          success:
            '...Rxc3 bxc3 Nxe4 and Black has a knight and a pawn for the rook, with the c-pawns doubled and the bishop pair. Structurally White is worse despite the material.',
          failure:
            '...Rxc3! bxc3 Nxe4 — a pawn, the structure and the initiative for the exchange.',
        },
      },
      {
        title: 'Destroy the cover',
        text: 'Against a king, the exchange is cheap. The knight on f6 is the only defender of h7 and g8; take it, and the queen comes in with check after check.',
        fen: EX_KING,
        shapes: ['f1f6', 'g6h7:blue'],
        task: {
          prompt: 'White to move: remove the defender.',
          moves: ['Rxf6'],
          reply: 'Rxf6',
          hint: 'Which piece holds the king’s position together?',
          success:
            'Rxf6! Rxf6 Qh7+ Kf8 Qh8+ Ke7 Qxg7+ and the king is hunted across the board. The rook was worth less than the knight that guarded the king.',
          failure: 'Rxf6! removes the last defender: Rxf6 Qh7+ Kf8 Qh8+ Ke7 Qxg7+ wins.',
        },
      },
      {
        title: 'Break the pin, win the queen',
        text: 'The queen on e4 is pinning nothing but is overloaded: it guards the knight on f6 and the g6-square. Rxf6 removes the knight with tempo and leaves the queen defending too much.',
        fen: EX_PIN,
        shapes: ['f1f6', 'e4:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Rxf6'],
          hint: 'Take the pinned knight — what does the queen have to do?',
          success:
            'Rxf6! Qxg6 Rxg6 and White has won a piece; ...gxf6 Qxf6 or ...Qxe... every recapture loses material. The exchange sacrifice was really a combination.',
          failure:
            'Rxf6! — the knight is pinned against the queen’s duties. Every recapture loses.',
        },
      },
      {
        title: 'Simplify into a win',
        text: 'In the endgame an exchange sacrifice can be a way to **simplify**: here ...Rxc3 followed by ...Ne4+ and ...Nxc3 wins the knight back with a fork, and Black ends up a pawn up in a minor-piece ending.',
        fen: EX_ENDGAME,
        orientation: 'black',
        shapes: ['e3c3', 'f6e4:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['Rxc3'],
          reply: 'Rxc3',
          hint: 'A capture that sets up a knight fork.',
          success:
            '...Rxc3! Rxc3 Ne4+ Ke3 Nxc3 — the fork wins the rook back, and the bishop-and-knight ending is a pawn up for Black.',
          failure: '...Rxc3 Rxc3 Ne4+ and the fork on c3 regains everything with interest.',
        },
      },
      {
        title: 'When to give the exchange',
        text:
          '- For a **pawn and the structure** (…Rxc3 in the Sicilian, Rxf6 against a fianchetto).\n' +
          '- For the **bishop pair** in an open position.\n' +
          '- To **remove the defender** of the king — count the attackers first.\n' +
          '- To **simplify** into a won ending or to break a blockade with a passed pawn.\n\n' +
          'Remember the rule of thumb: a rook is worth about a minor piece plus one and a half pawns. Get the pawns, the squares or the king, and the exchange was cheap.',
        fen: EX_SICILIAN,
      },
    ],
  },
  {
    id: 'calculation-3',
    title: 'Calculation III: to the end of the line',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'Long forcing lines, pawn races counted to the last move, quiet moves inside a combination, and the check at the end that decides the race. Calculate until the position is quiet.',
    minutes: 10,
    practiceThemes: ['quietMove', 'veryLong', 'advancedPawn'],
    steps: [
      {
        title: 'Count to the end',
        text: 'A pawn race is decided by counting — and by what happens after both pawns queen. Black can trade rooks and race: ...Rxd3+ Rxd3+ Kxd3, then ...hxg4 and the c-pawn against the g-pawn. Both queen — but Black queens **first**, and the new queen gives a check that skewers the other one. Only calculation to the last move can justify the trade.',
        fen: CALC_RACE,
        orientation: 'black',
        shapes: ['c3d3', 'c5c1:blue', 'g2g8:red'],
        task: {
          prompt: 'Black to move: start the race — if it wins.',
          moves: ['Rxd3+'],
          reply: 'Rxd3+',
          hint: 'Trade rooks and count: c-pawn against g-pawn, who queens first, and with what?',
          success:
            '...Rxd3+ Rxd3+ Kxd3 g4 hxg4 hxg4 c4 g5 c3 g6 c2 g7 c1=Q g8=Q Qf1+! and the skewer wins the new queen. Every tempo counted.',
          failure:
            '...Rxd3+! is right, but only because the race ends with ...Qf1+ skewering the queen on g8. Count it through.',
        },
      },
      {
        title: 'The race',
        text: 'The rooks are gone. Keep counting: take on g4 and run.',
        fen: CALC_RACE_2,
        orientation: 'black',
        shapes: ['h5g4', 'c5c1:blue'],
        task: {
          prompt: 'Black to move.',
          moves: ['hxg4'],
          reply: 'hxg4',
          hint: 'Capture, then push the c-pawn every move.',
          success: '...hxg4 hxg4 c4 g5 c3 g6 c2 g7 c1=Q g8=Q — both queen, and Black to move.',
          failure: '...hxg4! Any other move lets the g-pawn queen first with check.',
        },
      },
      {
        title: 'The check at the end',
        text: 'Both sides have queened. Black to move: the geometry decides.',
        fen: CALC_RACE_3,
        orientation: 'black',
        shapes: ['c1f1', 'f1g8:blue'],
        task: {
          prompt: 'Black to move: win the queen.',
          moves: ['Qf1+'],
          hint: 'A check that lines up king and queen.',
          success:
            '...Qf1+! Kg3 Qg1+ and the queen on g8 falls. This is the position Black had to see before trading rooks on move 49.',
          failure: '...Qf1+ skewers king and queen: Kg3 Qg1+ Kf4 Qxg8.',
        },
      },
      {
        title: 'The breakthrough inside a race',
        text: 'Two against two on the kingside and a black king on g2. White’s h-pawn can be sacrificed to create a passed pawn that queens with tempo — but it only works in one order. Calculate the pawn moves to the end.',
        fen: CALC_BREAK,
        shapes: ['g3g4', 'h4h5:blue'],
        task: {
          prompt: 'White to move: break through.',
          moves: ['g4'],
          hint: 'Offer the g-pawn so that the h-pawn runs.',
          success:
            'g4! hxg4 h5 and the h-pawn cannot be caught: ...f5 h6 f4 h7 f3 h8=Q and the new queen stops everything. Black’s king on g2 is on the wrong side.',
          failure: 'g4! is the breakthrough: after ...hxg4 h5 the h-pawn queens by force.',
        },
      },
      {
        title: 'Simplify only when it is counted',
        text: 'White has just traded rook for bishop, and the ending looks equal — but the e-pawn runs before Black’s king gets back, and the a-pawn decoys the b-pawn. Find the move that makes the pawn ending won.',
        fen: CALC_SIMPLIFY,
        shapes: ['e3e4', 'a6a5:red'],
        task: {
          prompt: 'White to move.',
          moves: ['e4'],
          hint: 'Push the pawn that Black’s king cannot catch.',
          success:
            'e4! a5 bxa5 b4 a6 b3 a7 b2 a8=Q b1=Q — both sides queen, but White queened first, keeps the e-pawn and has the safer king: a queen ending that is winning with care. Count the tempi: the a-pawn decoys the b-pawn while e4–e5 keeps running.',
          failure: 'e4! wins: the e-pawn is too fast, and the a-pawn distracts the b-pawn.',
        },
      },
      {
        title: 'The quiet move',
        text: 'Not every winning move is a check or a capture. White has the queen on g4 and a rook on h3, and Black’s king is on g7 with the h-file half open. Double on the h-file — the threat Rh8 cannot be met.',
        fen: CALC_QUIET,
        shapes: ['d1h1', 'h3h8:blue'],
        task: {
          prompt: 'White to move: the quiet move.',
          moves: ['Rdh1'],
          hint: 'Bring the second rook where the first one is.',
          success:
            'Rdh1! and Rh8 is unstoppable: ...Rh8 Rxh8 Qxh8 Rxh8 Rxh8 and White is a queen up. The quiet doubling was the whole combination.',
          failure: 'Rdh1! threatens Rh8. Black has no defence — the quiet move is the strong one.',
        },
      },
      {
        title: 'The king counts too',
        text: 'A queen has just been given up for a pawn ending. White is a pawn down on the kingside but has a passed a-pawn in the making. The king is the wrong piece to run with; a pawn move creates a passed pawn that Black’s king cannot catch. Calculate.',
        fen: CALC_KING,
        shapes: ['b2b4', 'a4a5:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['b4'],
          hint: 'Create a passed pawn on the queenside.',
          success:
            'b4! Kf6 b5 axb5 a5 and the a-pawn queens: Black’s king is three files too far. Kg5 first would lose the race.',
          failure: 'b4! Kf6 b5 axb5 a5 — the outside passed pawn wins the race.',
        },
      },
      {
        title: 'Habits of a calculator',
        text:
          '- **Count races to the last move** — including the check after both pawns queen.\n' +
          '- **Look for the quiet move** in the middle of the line: doubling rooks, a pawn push, a king step.\n' +
          '- **Trade into a pawn ending only after counting it.**\n' +
          '- **Stop only at a quiet position.** If the line ends in a capture, look one move further.\n\n' +
          'The “very long” and “quiet move” puzzles below are the training ground.',
        fen: CALC_RACE,
      },
    ],
  },
  {
    id: 'when-there-is-nothing-to-do',
    title: 'When there is nothing to do',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Improving the worst piece, prophylaxis, and the patience to keep a bind: the moves strong players make when no tactic is on offer, taken from Karpov, Capablanca and Rubinstein.',
    minutes: 9,
    practiceThemes: ['quietMove', 'middlegame'],
    steps: [
      {
        title: 'Improve the worst piece',
        text:
          'When there is no tactic and no clear plan, ask: **which of my pieces is doing least?** Move it to a better square. Karpov’s knight on d2 has nothing to do behind the pawns; it belongs on f1 and then g3 or e3, from where it sees f5 and h5.\n\n' +
          '(From Karpov–Unzicker, Nice 1974 — in the Classic games section.)',
        fen: NOTHING_NF1,
        shapes: ['d2f1', 'f1g3:blue', 'f1e3:blue'],
        task: {
          prompt: 'White to move: improve the worst piece.',
          moves: ['Nf1'],
          hint: 'The knight on d2 is blocked by its own pawns.',
          success:
            'Nf1! and the knight heads for g3. Nothing dramatic — but three moves later every white piece has a job.',
          failure: 'Nf1 re-routes the knight to g3 or e3. Look for the piece with the least to do.',
        },
      },
      {
        title: 'Prophylaxis on the open file',
        text: 'The a-file is half open and Black would like to contest it with ...Ra8 and a rook trade. Karpov prepares to **double** first: the rook goes to a2 so that a second rook can follow to a1 and the file is his. Prophylaxis: stop the opponent’s idea before it exists.',
        fen: NOTHING_RA2,
        shapes: ['a1a2', 'e1a1:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['Ra2'],
          hint: 'Which move makes ...Ra8 pointless?',
          success:
            'Ra2! followed by Rea1. If Black trades on a2 now, the queen recaptures and the file is still White’s.',
          failure:
            'Ra2! prepares Rea1. The open file is the only route into the position — take it before Black does.',
        },
      },
      {
        title: 'A piece that stops everything',
        text: 'The famous move of the game. Black would like ...Ra8 to fight for the a-file and ...Rb8 to support ...b4. The bishop goes to a7, where it cannot be attacked, takes the b8-square from the rooks and freezes the whole queenside. It does nothing else — and that is enough.',
        fen: NOTHING_BA7,
        shapes: ['e3a7', 'b8:red', 'a8:red'],
        task: {
          prompt: 'White to move: the quiet move.',
          moves: ['Ba7'],
          hint: 'Where can the bishop sit for the rest of the game without being touched?',
          success:
            'Ba7!! With the bishop on a7 and rooks on a1 and a2, Black’s rooks have no squares. Unzicker never got an active move again.',
          failure: 'Ba7! — the bishop takes b8 from the rooks and keeps the a-file for ever.',
        },
      },
      {
        title: 'Then open the other side',
        text: 'Once one wing is frozen, the play moves to the other. With the queenside sealed, Karpov advances f4: the pawn break that opens lines towards the black king while Black’s pieces are tied to the a-file.',
        fen: NOTHING_F4,
        shapes: ['f2f4', 'e5:red'],
        task: {
          prompt: 'White to move: open the other wing.',
          moves: ['f4'],
          hint: 'A pawn break where Black has no counterplay.',
          success:
            'f4! and after ...f6 f5 the g6- and h5-squares become targets: Bd1–h5, Qh5 and Ng3–h5 follow. Patience first, then the break.',
          failure: 'f4! — the queenside is fixed, so the break comes on the kingside.',
        },
      },
      {
        title: 'The king is a piece',
        text: 'In a rook ending with nothing to attack, the most useful piece to improve is often the king. Capablanca’s king goes to g3, h4 and g5 — giving up two pawns on the way — because a king on f6 next to the passed g-pawn is worth more than any pawn.',
        fen: NOTHING_KING,
        shapes: ['f3g3', 'g3h4:blue', 'h4g5:blue', 'g5f6:blue'],
        task: {
          prompt: 'White to move: start the king walk.',
          moves: ['Kg3'],
          hint: 'The king has a route to f6.',
          success:
            'Kg3! Rxc3+ Kh4 Rf3 g6 Rxf4+ Kg5 Re4 Kf6 — two pawns down and completely winning. The king is the piece that was doing nothing.',
          failure: 'Kg3! begins the walk to f6. The pawns on c3 and f4 are a fair price.',
        },
      },
      {
        title: 'Tie a piece down',
        text: 'Rubinstein, a pawn up: rather than push, he first ties Black’s rook to the a-pawn — Ra5 stops ...a5 and attacks a7, and Black’s rook must stay passive. Restrict before you advance.',
        fen: NOTHING_ROOK,
        shapes: ['f5a5', 'a7:red'],
        task: {
          prompt: 'White to move.',
          moves: ['Ra5'],
          hint: 'Which move gives Black’s rook a permanent job?',
          success:
            'Ra5! Rb7 Ra6 and the black rook is stuck on the seventh rank; then the king and pawns come forward at leisure.',
          failure:
            'Ra5! attacks a7 and stops ...a5: Black’s rook is tied down for the rest of the game.',
        },
      },
      {
        title: 'Safety first',
        text: 'A queen for two pieces, and every black piece is active. Fischer’s answer is not a threat but a tidy-up: castle, connect the rooks, and only then start the technique. When you are winning and there is no tactic, remove your own weaknesses first.',
        fen: NOTHING_SAFETY,
        shapes: ['e1g1', 'f8:blue'],
        task: {
          prompt: 'White to move.',
          moves: ['O-O'],
          hint: 'The move that makes every later move safer.',
          success:
            'O-O. Fischer took twenty-eight more moves to convert — and never gave Black a chance. Bh6 also works, but castling is the habit to build.',
          failure:
            'O-O — safety first. With the king safe and rooks connected the extra material wins itself.',
        },
      },
      {
        title: 'The list',
        text:
          '- **Improve the worst piece.** Every move that does so is a good move.\n' +
          '- **Prophylaxis**: ask what the opponent wants, and stop it.\n' +
          '- **Restrict** before you advance: a piece tied to a weakness is half a piece.\n' +
          '- **Fix one wing, play on the other.**\n' +
          '- **Use the king** in endings; **castle** in middlegames.\n' +
          '- **Do not hurry** — with a bind, the opponent’s position gets worse by itself.\n\n' +
          'Play through Karpov–Unzicker and Capablanca–Tartakower in the Classic games to see it move by move.',
        fen: NOTHING_BA7,
      },
    ],
  },
];
