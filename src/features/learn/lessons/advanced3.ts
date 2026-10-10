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
const SVESH_F5 = fenAfter(`${SVESH} 9. Bxf6 gxf6 10. Nd5`);

// Queen's Gambit Declined, Exchange Variation: the Carlsbad structure.
const CARLSBAD =
  '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 c6 9. Nf3 Re8 10. O-O Nf8';
const CARLSBAD_PREP = fenAfter(CARLSBAD);
const CARLSBAD_DEF = fenAfter(`${CARLSBAD} 11. Rab1`);
const CARLSBAD_B4 = fenAfter(`${CARLSBAD} 11. Rab1 Ne4 12. Bxe7 Qxe7 13. b4`);

// King and pawn endings, and the wrong rook pawn.
const OPPOSITION = '8/8/4k3/8/3K4/4P3/8/8 w - - 0 1';
const TREBUCHET = '8/8/8/3Kp3/4Pk2/8/8/8 w - - 0 1';
const TREBUCHET_APPROACH = '8/8/8/4p3/2K1P1k1/8/8/8 w - - 0 1';
const WRONG_ROOK_PAWN = '8/5k2/8/4K2P/8/3B4/8/8 b - - 0 1';

export const advancedLessons3: Lesson[] = [
  {
    id: 'isolated-queens-pawn',
    title: 'The isolated queen’s pawn',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'A weakness and a strength at once: attack the isolani in the endgame, use it for activity in the middlegame.',
    minutes: 10,
    steps: [
      {
        title: 'One pawn, two stories',
        text:
          'An **isolated queen’s pawn** (IQP, or isolani) is a d-pawn with no friendly pawn on the c- or e-file. ' +
          'No pawn can ever defend it, so in an endgame it is a target. In the middlegame it gives its owner ' +
          '**space**, the **e5 square** for a knight, open lines and the threat of the **d4–d5 break**.\n\n' +
          'Here White has the isolani after a Panov Attack, and you are Black. The plans are set for both sides:\n\n' +
          '- White: pieces to e5 and toward your king, then d4–d5 at the right moment.\n' +
          '- Black: blockade d5, pile up on d4, and **trade pieces**: every exchange makes the pawn weaker.',
        fen: PANOV_BLACK,
        orientation: 'black',
        shapes: ['d4:red', 'e5:blue', 'd5:green'],
      },
      {
        title: 'Pressure on d4',
        text:
          'Your knight on d5 is a perfect blockader: it stops the pawn, and no white pawn can ever chase it. ' +
          'The next job is to make d4 a burden. Right now it is attacked once, by the knight on c6, and ' +
          'defended once, by the knight on f3.\n\n' +
          'Look at your bishop on e7 and your queen on d8: neither touches d4 yet. Every piece you add against ' +
          'it is a piece White must tie to its defence instead of the attack.',
        fen: PANOV_BLACK,
        orientation: 'black',
        shapes: ['d4:red', 'c6d4:red'],
        task: {
          prompt: 'Which move adds a piece against d4?',
          moves: ['Bf6', 'Qb6'],
          hint: 'Find a diagonal that runs into d4. Which of your pieces can step onto it in one move?',
          success:
            'Another attacker on d4. **Bf6** aims the bishop straight at it; **Qb6** hits it along the diagonal and eyes b2 as well.',
          why:
            'Each attacker you add ties a white piece to defence: with d4 hit twice, White must keep a guard on ' +
            'it and cannot throw everything at your king. That is how you fight an isolani: blockade in front, ' +
            'pressure from the sides, and trades whenever they come. After 10...Bf6, a main line, White usually ' +
            'answers Be4 to challenge the blockader.',
          wrong: {
            Nf6: '**Nf6** is playable, but it gives up the blockade: the knight leaves d5, the pawn is free to advance, and nothing new hits d4. Keep the knight where it is and add pressure with another piece.',
            Bd7: '**Bd7** is a useful developing move, but it does nothing to d4. This step is about the isolani: which piece can you aim at it in one move?',
            b5: {
              text: 'That loses a pawn: after Nxd5 exd5 Bxb5 your blockader has been traded off and the b-pawn is gone. Queenside play can wait; the job now is to pile up on d4.',
              refute: 'Nxd5',
            },
          },
          failure:
            'This step is about d4. Which of your pieces can reach a square that attacks it, without moving the knight off d5?',
        },
      },
      {
        title: 'The e5 square',
        text:
          'Now White’s side. After 10...Bf6 11. Be4 Nce7, Black has doubled the guard on d5. But the isolani ' +
          'gives you something in return: the **e5 square**, guarded by the d4 pawn. A knight there eyes f7 and ' +
          'd7, supports an attack on the king, and can only be challenged by a piece trade or by ...f6, which ' +
          'would leave e6 weak.\n\n' +
          'The IQP owner wants pieces, not trades: occupy the squares the pawn gives you and point everything at ' +
          'the king.',
        fen: PANOV_NE5,
        shapes: ['e5:blue'],
        task: {
          prompt: 'Where does your knight belong in an IQP position?',
          moves: ['Ne5'],
          hint: 'Which square in front of your pieces does the d4 pawn protect?',
          success:
            '**Ne5**: the knight lands on the square the isolani guards, in the middle of Black’s position.',
          why:
            'This is the square the isolani pays for: the knight covers f7 and d7 and supports the queen when she ' +
            'heads for the king. Activity is your compensation for the weak pawn, so put pieces on active squares ' +
            'before Black can trade them, and avoid trades yourself: each one makes d4 weaker.',
          wrong: {
            Qd3: '**Qd3** is just as good, lining up behind the bishop against h7, and it often comes next. But first put the knight on its best square: this step is about e5.',
          },
          failure:
            'Look at the square in front of your pieces that the d4 pawn guards. Which piece belongs there?',
          reply: 'Bd7',
          replyNote:
            'Black develops the last minor piece, heading for c6 to trade off your strong bishop. Now bring your queen toward the king.',
          then: {
            prompt: 'Bring the queen into the attack. Where is she most dangerous?',
            moves: ['Qd3', 'Qh5'],
            hint: 'Your bishop on e4 already looks at h7. Which queen move adds a second attacker there?',
            success:
              'Both aim the queen at h7 with the bishop on e4: **Qd3** forms a battery behind it, and **Qh5** attacks h7 directly. She can swing to g3 or h3 next.',
            why:
              'With the knight on e5 and the queen near the king, White aims to win on the kingside before d4 ' +
              'becomes a problem. That is the race in every IQP middlegame: the owner must create threats while the ' +
              'pieces are on, and the defender wants to reach an ending, where the pawn is simply weak.',
            failure:
              'Bring the queen toward Black’s king. Which squares let her join the bishop in looking at h7?',
          },
        },
      },
      {
        title: 'The d4–d5 break',
        text:
          'From a Queen’s Gambit Accepted: White has the isolani again, and Black has just developed the knight ' +
          'to c6. Compare the two armies. White’s queen, rook on d1, both knights and the bishop on c4 are in play; Black’s ' +
          'bishop on c8 and queen are still at home.\n\n' +
          'That is when the isolani stops being a weakness and becomes a **battering ram**. Pushing it opens ' +
          'files and diagonals at the moment your pieces are ready to use them and the opponent’s are not.',
        fen: QGA_D5,
        shapes: ['c8:red', 'd8:red'],
        task: {
          prompt: 'Your pieces are ready and Black’s are not. How do you open the position?',
          moves: ['d5'],
          hint: 'The weak pawn can also be a weapon. What happens if it advances now?',
          success:
            '**d5**: the isolani advances and offers itself, to open the d-file and the diagonals for your pieces.',
          why:
            'Left alone, the pawn is a long-term target; pushed at the right moment, it dissolves into activity. ' +
            'Black cannot ignore it: ...Na5 runs into dxe6, which wins at least a pawn, and taking with the knight ' +
            'costs Black even more. The right moment is now, while the c8 bishop and the queen are still at home.',
          wrong: {
            a3: '**a3** is a good move too, keeping Black’s pieces off b4. But it gives Black a move to develop, and every developing move makes the break less dangerous. This step is about timing.',
            Ne5: '**Ne5** is a good move too, putting the knight on the IQP’s favourite square. But this step is about the break and its timing: right now Black is not ready for it.',
          },
          failure:
            'This step is about the d4 pawn. Black is behind in development: what happens if the pawn advances now?',
          reply: 'exd5',
          replyNote:
            'Black takes, the natural answer. The d-file is open for your rook, and the new pawn on d5 is attacked three times and defended twice.',
          then: {
            prompt: 'Three attackers, two defenders. How do you recapture?',
            moves: ['Nxd5'],
            hint: 'Which capture also threatens to take a black piece with check?',
            success:
              '**Nxd5**: the knight takes and attacks the bishop on e7 and the knight on f6, and either capture would come with check.',
            why:
              'Taking with the knight keeps your bishop on c4 in reserve and gives Black no time: Nxf6+ or Nxe7+ ' +
              'is coming. **Bxd5** is playable too, but it threatens nothing and hands Black a free move. In the ' +
              'break, every capture should come with a threat, so the opponent never catches up.',
            wrong: {
              Bxd5: '**Bxd5** is playable, but it threatens nothing, and Black gets a free move to develop. The knight recapture keeps the initiative, because it hits e7 and f6 at once.',
            },
            failure:
              'Recapture on d5 with a piece that also creates a threat. Which one attacks Black’s pieces on e7 and f6?',
            reply: 'Nxd5',
            replyNote: 'Black trades knights, the natural answer, and you recapture again on d5.',
            then: {
              prompt: 'Recapture, and look at what your pieces now control.',
              moves: ['Bxd5'],
              hint: 'Which piece recaptures on d5 and lands in the centre, with the rook behind it?',
              success:
                '**Bxd5**: the bishop recaptures and stands in the centre, eyeing b7 and f7, with your rook behind it on the open d-file.',
              why:
                'The isolani has gone, and with it Black’s target. In return you have the open d-file, a bishop in ' +
                'the centre and a lead in development, while Black still has to find squares for the c8 bishop and ' +
                'the queen. That is the point of the break: play it while the opponent is behind, and the weakness ' +
                'turns into activity.',
              wrong: {
                Rxd5: '**Rxd5** is playable, but the rook in the centre becomes a target for Black’s bishop and queen, and your c4 bishop stays out of play. The bishop recapture is more harmonious: bishop in the centre, rook behind it.',
              },
              failure: 'Recapture on d5, and choose the piece that is best placed there.',
            },
          },
        },
      },
      {
        title: 'Plans in one breath',
        text:
          '**With the isolani:** knight to e5, pieces toward the king, and d4–d5 when it opens lines for you and ' +
          'not for the opponent. Avoid trades: every exchange removes an attacker and leaves the pawn more ' +
          'exposed.\n\n' +
          '**Against the isolani:** blockade d5 with a knight, aim everything at d4, trade pieces, and head for ' +
          'an endgame where the pawn is simply weak. Never let the d4–d5 break happen for free.\n\n' +
          'Both plans start from the same question: who benefits from the next trade?',
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
    minutes: 9,
    steps: [
      {
        title: 'What an outpost is',
        text:
          'An **outpost** is a square in the opponent’s half that your pawn protects and that no enemy pawn can ' +
          'ever attack. In the Sveshnikov Sicilian, Black plays ...e5 early and accepts a hole on **d5**: with the ' +
          'c-pawn gone and the e-pawn on e5, no black pawn can ever challenge a piece there.\n\n' +
          'A knight on an outpost is a lasting asset, so the fight is about **who controls the square**. Right ' +
          'now one black piece guards d5, the knight on f6. Remove it, and the square is yours.',
        fen: SVESH_BXF6,
        shapes: ['d5:red', 'f6d5:blue'],
      },
      {
        title: 'Remove the defender, then move in',
        text:
          'White’s plan has two moves, and the order matters: first remove the guard, then occupy the square.\n\n' +
          'Your bishop on g5 can take the knight on f6. Giving up a bishop for a knight is a real concession, ' +
          'so ask what you get for it: the only black piece guarding d5 disappears, and the natural recapture ' +
          'damages Black’s kingside pawns.',
        fen: SVESH_BXF6,
        shapes: ['d5:red'],
        task: {
          prompt: 'Which piece guards d5? Remove it.',
          moves: ['Bxf6'],
          hint: 'Only one black piece covers d5. Which of your pieces attacks it?',
          success: '**Bxf6**: the bishop takes the only black piece that guarded d5.',
          why:
            'After ...gxf6 Black’s kingside pawns are doubled and d5 has no defender left; ...Qxf6 instead loses ' +
            'time, since Nd5 then comes with tempo. The bishop pair is a fair price for a square Black can never ' +
            'contest with a pawn. **Nd5** at once, the other main line, is just as good and leads to the same ' +
            'fight for d5.',
          wrong: {
            Nd5: '**Nd5** at once is the other main line and just as good: the knight jumps in and offers a trade on f6. This step follows **Bxf6**, which removes the guard first and damages Black’s pawns.',
          },
          failure:
            'This step is about d5. Which black piece guards it, and which of your pieces can take that guard?',
          reply: 'gxf6',
          replyNote:
            'Black recaptures with the pawn and keeps the queen at home. The kingside pawns are doubled, and nothing guards d5 any more.',
          then: {
            prompt: 'Nothing guards d5. Plant your piece.',
            moves: ['Nd5'],
            hint: 'Which of your knights can reach d5 in one jump?',
            success:
              '**Nd5**: the knight lands on the outpost, protected by the e4 pawn, eyeing f6, e7 and c7.',
            why:
              'No black pawn can ever attack this knight, so Black can only trade it off: with the c6 knight via ' +
              'e7, or with the light-squared bishop, which Black needs for the weakened squares round the king. A ' +
              'knight like this is often stronger than any black minor piece. Remember the order: remove the ' +
              'defender, then occupy.',
            failure: 'The outpost is free. Which knight can jump to d5?',
          },
        },
      },
      {
        title: 'Fighting an outpost',
        text:
          'Switch sides. As Black you cannot chase a knight on d5 with pawns, so fight it another way: attack ' +
          'the pawn that supports it, or prepare to trade it.\n\n' +
          'Your doubled f-pawns look ugly, but one of them is a weapon. The pawn on e4 is the knight’s only ' +
          'support, and it can be hit.',
        fen: SVESH_F5,
        orientation: 'black',
        shapes: ['d5:red', 'e4'],
        task: {
          prompt: 'How do you fight the knight on d5?',
          moves: ['f5', 'Bg7'],
          hint: 'Either attack the pawn that supports the knight, or develop the piece that prepares to trade it off.',
          success:
            'Both are main lines. **f5** strikes at e4, the knight’s only support; **Bg7** develops first and prepares ...Ne7, to trade the knight off.',
          why:
            'Your doubled pawn on f6 is the key: pushed to f5 it hits e4, and if e4 goes, the knight on d5 loses ' +
            'its support. Trading the knight with ...Ne7 is the other remedy. The tempting ...Be6, offering the ' +
            'bishop for the knight, comes too early here: that bishop guards the light squares round your king, ' +
            'and after ...Bxd5 White recaptures with the queen, which takes over the outpost.',
          wrong: {
            Be6: 'Offering the bishop for the knight is a standard remedy, but here it comes too early: after **...Bxd5** and Qxd5 White’s queen sits on the outpost, and the light squares round your king lose their best defender.',
          },
          failure:
            'Against an outpost, attack the pawn that supports the piece, or prepare to trade it off. Which of your moves does one of those?',
        },
      },
      {
        title: 'Weak squares in your own camp',
        text:
          'Outposts are made by **pawn moves**. Every pawn that advances stops guarding the squares behind it for ' +
          'good, and every pawn exchange can leave a hole. Before you push a pawn, ask which squares it will never ' +
          'guard again. Black’s ...e5 in the Sveshnikov gave up d5 on purpose, for space and activity; make that ' +
          'trade knowingly, never by accident.\n\n' +
          'The best piece for an outpost is a **knight**: it cannot be challenged along a line, and from the ' +
          'centre it hits eight squares. When the opponent has a knight on your outpost, the standard remedy is ' +
          'to **trade it**, even at the cost of a good bishop.',
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
    minutes: 9,
    steps: [
      {
        title: 'The Carlsbad structure',
        text:
          'This structure comes from the Exchange Queen’s Gambit. White’s c-pawn has been traded for Black’s ' +
          'e-pawn, so White has two queenside pawns, on a2 and b2, against Black’s three, on a7, b7 and c6.\n\n' +
          'The plan that follows is the **minority attack**: White pushes the b-pawn to b5 and swaps it for the ' +
          'c6 pawn. Black then has to accept a weakness, a backward pawn on c6 on a half-open file or an isolated ' +
          'pawn on d5. Black’s counterplay is on the other wing: a knight on e4, pieces toward White’s king, and ' +
          'sometimes ...a5 to slow the b-pawn down.',
        fen: CARLSBAD_PREP,
        shapes: ['c6:red', 'd5:red'],
      },
      {
        title: 'Prepare, then push',
        text:
          'Before the pawn can move, it needs support. Right now **b4** would simply lose it to the bishop on e7, ' +
          'and your rook on a1 is doing nothing.\n\n' +
          'So the minority attack starts with a quiet move that fixes both. Then watch Black’s answer: the ' +
          'standard idea is ...Ne4, offering trades to ease the cramp, and you must meet it without losing the ' +
          'thread of your plan.',
        fen: CARLSBAD_PREP,
        task: {
          prompt: 'Which quiet move prepares b4?',
          moves: ['Rab1'],
          hint: 'Bring a piece behind the pawn you want to push.',
          success:
            '**Rab1**: the rook steps behind the b-pawn, so b4 can follow, and later it will use the b-file.',
          why:
            'Pawn advances need support, and a rook behind the pawn is the cheapest kind. Pushing at once, b4 ' +
            'Bxb4, just drops a pawn. **h3**, taking g4 from Black’s pieces, is a fine move too and the engine likes ' +
            'it, but it prepares a kingside set-up rather than the minority attack this lesson is about.',
          wrong: {
            b4: 'Too early: the bishop on e7 takes it, and the pawn was your whole plan. Support it first, then push.',
            h3: '**h3** is a good move too, the engine’s favourite: it takes g4 from Black’s bishop and knight. But it does not prepare b4, and the minority attack is this lesson’s plan.',
            Rfb1: '**Rfb1** also puts a rook behind the b-pawn and is playable, but it takes the f1 rook away from the centre and the kingside, where Black’s counterplay will come. The rook on a1 has nothing else to do.',
          },
          failure: 'This step is about b4. What does the pawn need before it can advance safely?',
          reply: 'Ne4',
          replyNote:
            'Black challenges your bishop on g5, the standard idea: trades ease a cramped position. Your bishop is now attacked by the knight and the bishop on e7.',
          then: {
            prompt: 'Your bishop on g5 is attacked. How do you deal with it?',
            moves: ['Bxe7'],
            hint: 'The bishop on e7 was the piece guarding b4. Can you trade it off?',
            success:
              '**Bxe7**: the bishops come off, and with them the piece that was guarding b4.',
            why:
              'This trade suits the plan: once the e7 bishop is gone, nothing stops b4. **Bf4** keeps the bishops ' +
              'on and is just as good, but then b4 needs more preparation. When you have a plan, ask which trades ' +
              'help it.',
            wrong: {
              Bf4: '**Bf4** is a good move too, keeping the bishops on, and the engine even prefers it slightly. But then the e7 bishop still guards b4. This line trades it, so the minority attack can start at once.',
              Bxe4: '**Bxe4** is playable, trading your other bishop for the knight, but after ...dxe4 the pawn hits your knight on f3 and Black’s game frees up. And the bishop on e7 still guards b4.',
            },
            failure:
              'Your bishop on g5 is attacked twice. Which answer also helps your plan of b4?',
            reply: 'Qxe7',
            replyNote: 'Black recaptures with the queen. Now nothing guards b4.',
            then: {
              prompt: 'Nothing guards b4 any more. Start the attack.',
              moves: ['b4'],
              hint: 'The rook on b1 is behind a pawn. Which one is it there to support?',
              success:
                '**b4**: the minority attack begins. Next comes b5, to swap the b-pawn for Black’s c6 pawn.',
              why:
                'Now b5 is coming, and Black’s queenside will be left with a weak pawn whatever happens. Black will ' +
                'answer with play on the kingside, and the knight on e4 is the start of it. That race, your ' +
                'queenside pressure against Black’s kingside chances, is the middlegame of the Carlsbad structure.',
              wrong: {
                Ne5: '**Ne5** is a good move too, and the engine rates it as highly, but it is a different plan. This step is about the minority attack, and the pawn can go now.',
              },
              failure:
                'This step is about the minority attack. The rook on b1 supports one pawn: push it.',
            },
          },
        },
      },
      {
        title: 'Defending against it',
        text:
          'Switch sides. White has just played Rab1, and b4 is coming. Passive waiting is the worst plan: the ' +
          'minority attack is slow but sure, and a pawn on c6 under fire for the rest of the game is no fun.\n\n' +
          'Black has two good ways to play. **Slow the pawns down**, so that b4–b5 costs White something. Or ' +
          '**ignore them** and play where your pieces point, on the kingside and in the centre.',
        fen: CARLSBAD_DEF,
        orientation: 'black',
        shapes: ['b2b4:red'],
        task: {
          prompt: 'Which plan do you choose, and which move starts it?',
          moves: ['a5', 'Ne4', 'Ng6'],
          hint: 'Either meet the pawns on the queenside, or start your own play near White’s king. Which knight or pawn move does that?',
          success:
            'A real plan. **a5** makes b4 cost something, while **Ne4** and **Ng6** start Black’s play in the centre and on the kingside.',
          why:
            'Against the minority attack you need counterplay, not a fortress. After ...a5, b4 can be met by ' +
            'taking on b4, which opens the a-file for your rook. The knight moves aim at White’s king: from e4 the ' +
            'knight offers trades and eyes f2 and g5, and from g6 it heads for f4 or h4. Which plan fits depends ' +
            'on where your pieces already stand.',
          wrong: {
            a6: '**a6** is playable, and it prepares to meet b5 by taking with the a-pawn, but it does nothing to slow b4. Choose a move with more bite: slow the pawns down, or go for the king.',
            Bg4: '**Bg4** develops with a pin, a decent move, but it is not yet a plan against the pawns. Choose: slow them down with a pawn, or start the kingside play with a knight.',
          },
          failure:
            'Choose a plan: slow White’s pawns down on the queenside, or start your own play on the kingside. Which move does one of those?',
        },
      },
      {
        title: 'Why it works',
        text:
          'Once the pawn reaches b5, Black runs out of comfortable answers:\n\n' +
          '- **...cxb5** leaves d5 isolated, and the c-file opens for White’s rooks.\n' +
          '- **...c5** leaves d5 isolated too, once White takes on c5.\n' +
          '- **Doing nothing** lets White take on c6, and after the recapture with the b-pawn, c6 is a backward ' +
          'pawn on a half-open file.\n\n' +
          'The attack is slow, so Black uses the time for play against White’s king. That race, queenside ' +
          'weaknesses against kingside threats, is the whole middlegame of the Exchange Queen’s Gambit.',
        fen: CARLSBAD_B4,
        shapes: ['b4b5:blue', 'c6:red'],
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
    minutes: 10,
    steps: [
      {
        title: 'Zugzwang and the opposition',
        text:
          'In chess you must move, and sometimes that is a curse: every legal move makes your position worse. ' +
          'That is **zugzwang**, and it decides more endgames than any tactic.\n\n' +
          'Its simplest form is the **opposition**: kings on the same file with one square between them block ' +
          'each other, and whoever has to move must step aside. Here the pawn wins only if your king reaches ' +
          'one of the **key squares** in front of it, d5, e5 or f5. Black’s king on e6 guards all three. Your ' +
          'job is to make it move away.',
        fen: OPPOSITION,
        shapes: ['d5', 'e5', 'f5'],
        task: {
          prompt: 'Which king move puts Black in zugzwang?',
          moves: ['Ke4'],
          hint: 'Put your king opposite Black’s, with one square between them, and let Black move.',
          success:
            '**Ke4**: the kings face each other on the e-file with one square between, and it is Black who must move.',
          why:
            'Black’s king has to give way, and whichever side it goes, your king walks round the other side onto ' +
            'a key square. Every other move draws: a pawn push or any other king move hands Black the ' +
            'opposition, and the black king stays in front of the pawn. Taking the opposition is the first ' +
            'technique of every pawn ending.',
          wrong: {
            e4: {
              text: 'The pawn should follow the king, not lead it. After **...Kd6** Black takes the opposition in front of your king, and the pawn alone cannot make progress: it is a draw.',
              refute: 'Kd6',
            },
            Kc4: {
              text: 'That steps away from the key squares: after **...Ke5** Black’s king stands in front of your pawn, and yours cannot get back in front of it. It is a draw.',
              refute: 'Ke5',
            },
          },
          failure:
            'Look for the king move that puts the two kings face to face, one square apart, with Black to move.',
          reply: 'Kd6',
          replyNote:
            'Black has to give way. On d6 the king still guards d5 and e5, but f5 is left unguarded.',
          then: {
            prompt: 'Black stepped to one side. Where does your king go?',
            moves: ['Kf5'],
            hint: 'Which key square does Black’s king no longer guard?',
            success:
              '**Kf5**: your king steps round onto a key square, and the pawn will follow it all the way.',
            why:
              'With the king on f5 the pawn cannot be stopped: the king leads, and the pawn advances under its ' +
              'protection. This outflanking move is the partner of the opposition: when the enemy king steps aside, ' +
              'go round the other side. **Kd4** and **Kf4** keep the win too, but they only repeat the dance, ' +
              'while Kf5 gets there at once.',
            wrong: {
              Kd4: 'That keeps the win, since after ...Ke6 Ke4 Black must give way again, but it only repeats the position. One key square is free right now: step onto it.',
              Kf4: 'That keeps the win too, but it wastes a move: Black’s king comes back to e6 and you start again. Step round onto the free key square at once.',
            },
            failure: 'Black’s king has left one key square unguarded. Step onto it with your king.',
          },
        },
      },
      {
        title: 'Mutual zugzwang: the trebuchet',
        text:
          'Two kings, two blocked pawns, and each king attacks the other’s pawn. **Whoever has to move loses**: ' +
          'the king must step away, its pawn falls, and the other pawn walks home. This position is called the ' +
          '**trebuchet**, and it is the purest case of mutual zugzwang.\n\n' +
          'Positions like this are traps for both sides. You win them by making the opponent move in them, and ' +
          'you lose them by walking in with your own move.',
        fen: TREBUCHET,
        shapes: ['d5:red', 'f4:red', 'e5:blue', 'e4:blue'],
      },
      {
        title: 'Do not step in first',
        text:
          'One move from the trebuchet. Black’s king is heading for f4 or f3 to attack your pawn on e4. The ' +
          'natural move, your king to d5 to attack e5, walks into the trap: after ...Kf4 it is the trebuchet, and ' +
          'you are the one to move.\n\n' +
          'The defence is to stay back, keep the pawn guarded as long as you can, and know where your king must ' +
          'stand when the pawn falls: in front of Black’s king, with the opposition.',
        fen: TREBUCHET_APPROACH,
        shapes: ['d5:red'],
        task: {
          prompt: 'Where does your king go to hold the draw?',
          moves: ['Kd3'],
          hint: 'Stay in touch with your pawn, but do not go to d5.',
          success: '**Kd3**: the king guards the pawn from behind and stays out of the trebuchet.',
          why:
            'On d3 your king guards e4 and stays close to the squares in front of Black’s pawn. **Kd5** walks into ' +
            'the trebuchet after ...Kf4, and **Kc5** loses the same way a move later. **Kc3** holds too, by the ' +
            'same idea. Black will win the pawn anyway; what matters is where your king stands when it falls.',
          wrong: {
            Kd5: {
              text: 'That is the trap: after **...Kf4** the trebuchet is on the board with you to move. Your king has to step away from e5, and your pawn on e4 falls.',
              refute: 'Kf4',
            },
            Kc5: {
              text: 'Too far from the pawn: after **...Kf3** you can only guard it from d5, and that is the trebuchet with you to move. Keep your king in touch with e4 from behind.',
              refute: 'Kf3',
            },
            Kc3: '**Kc3** holds too, by the same idea: the king stays close enough to meet ...Kxe4 by taking the opposition. This line follows **Kd3**, which keeps the pawn guarded.',
          },
          failure:
            'Keep your king close to the pawn without stepping onto d5, and think about where it must stand when the pawn falls.',
          reply: 'Kf3',
          replyNote:
            'Black attacks the pawn again, and now you are in zugzwang yourself: every king move leaves e4. The pawn is lost; the draw depends on where your king goes.',
          then: {
            prompt: 'The pawn will fall. Where must your king stand when it does?',
            moves: ['Kd2'],
            hint: 'After ...Kxe4 you want to put your king right in front of Black’s, one square between. Which square lets you do that?',
            success:
              '**Kd2**: one step back, so that after ...Kxe4 your king can step to e2, in front of Black’s, with the opposition.',
            why:
              'Count ahead to the moment the pawn falls. From d2 you reach e2 just as Black’s king lands on e4, and ' +
              'then Black has to move and cannot get past. **Kc2**, **Kc3** and **Kc4** leave you a step too far ' +
              'away, and Black’s king and pawn walk through. In pawn endings, plan the opposition before you need it.',
            wrong: {
              Kc4: {
                text: 'Too far away: after **...Kxe4** Black’s king stands in front of its pawn, and yours cannot get in front of it in time.',
                refute: 'Kxe4',
              },
              Kc2: {
                text: 'One file too far: after **...Kxe4** your king cannot reach e2 in time to take the opposition, and Black’s king leads its pawn home.',
                refute: 'Kxe4',
              },
              Kc3: {
                text: 'From c3 your king is a step too far: after **...Kxe4** it cannot reach e2 in time to take the opposition, and Black’s king leads its pawn home.',
                refute: 'Kxe4',
              },
            },
            failure:
              'Picture the position after ...Kxe4. Your king must be able to step in front of Black’s, with one square between.',
            reply: 'Kxe4',
            replyNote: 'Black wins the pawn, and now everything depends on your next move.',
            then: {
              prompt: 'Take the opposition.',
              moves: ['Ke2'],
              hint: 'Stand directly in front of Black’s king, with one square between.',
              success:
                '**Ke2**: the kings face each other on the e-file, and Black is the one who must move.',
              why:
                'Black’s king has to give way, and whichever side it goes, your king follows on the same side and ' +
                'keeps the opposition, so it never reaches a key square in front of its pawn: a draw. The same idea ' +
                'that won the first step saves this one. In pawn endings, whoever holds the opposition at the ' +
                'critical moment decides the result.',
              failure:
                'Put your king directly in front of Black’s, with one square between them, so that Black has to move.',
            },
          },
        },
      },
      {
        title: 'The wrong rook pawn',
        text:
          'A **fortress** is a position the stronger side cannot break, however much extra material it has. The ' +
          'most famous is the **wrong rook pawn**: a bishop and a rook pawn cannot win if the bishop does not ' +
          'control the promotion square and the defending king reaches the corner.\n\n' +
          'White’s bishop runs on light squares, and the h-pawn promotes on h8, a dark square. If your king gets ' +
          'to h8, White can never drive it out. White’s king is about to cut you off, so the only question is: ' +
          'can you get there?',
        fen: WRONG_ROOK_PAWN,
        orientation: 'black',
        shapes: ['h8:green'],
        task: {
          prompt: 'Where is your fortress, and which move heads for it?',
          moves: ['Kg7', 'Kg8', 'Kf8'],
          hint: 'Head for h8, the corner the bishop can never control.',
          success:
            'Toward the corner. Once your king is in and around h8, White can never force it out, and the pawn never promotes.',
          why:
            'Kg7, Kg8 and Kf8 all reach the corner in time. **Ke7** or **Ke8**, the other way, lose to Bc4, ' +
            'which cuts your king off along the light squares while the pawn runs. In the corner, the worst that ' +
            'can happen is that White stalemates you. When you are losing, ask whether a position exists that the ' +
            'opponent cannot break, and head straight for it.',
          wrong: {
            Ke7: {
              text: 'The wrong way: **Bc4** takes f7 and g8 from your king, and the h-pawn runs to h8 while you are cut off. Head for the corner while the road is open.',
              refute: 'Bc4',
            },
            Ke8: {
              text: 'Away from the corner: **Bc4** cuts your king off along the light squares, and the pawn promotes. Only the corner draws.',
              refute: 'Bc4',
            },
          },
          failure: 'Head for h8: the bishop can never control it.',
        },
      },
      {
        title: 'Recognising fortresses',
        text:
          'Other fortresses worth knowing:\n\n' +
          '- **Queen against rook and pawn**, with the rook on its third rank protected by a pawn and the king ' +
          'tucked behind.\n' +
          '- **Rook against bishop**, with the defending king in the corner of the colour the bishop cannot reach.\n' +
          '- **Opposite-coloured bishops**, with a blockade on squares the attacking bishop cannot touch.\n' +
          '- **Rook and rook pawn against rook**, with the defending rook checking from the side.\n\n' +
          'When you are losing, ask: is there a position I can reach that the opponent cannot break? When you are ' +
          'winning, ask the same question before every trade, and steer around the answer.',
        fen: WRONG_ROOK_PAWN,
        orientation: 'black',
      },
    ],
    practiceThemes: ['zugzwang', 'defensiveMove'],
  },
];
