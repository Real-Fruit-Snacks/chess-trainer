import { fenAfter, type Lesson } from '../model';

const OPERA =
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5';
const OPERA_RXD7 = fenAfter(`${OPERA} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8`);
const OPERA_QB8 = fenAfter(
  `${OPERA} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7`,
);
const OPERA_SIX = fenAfter('1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4');
const OPERA_MATE = fenAfter(
  `${OPERA} 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#`,
);
const SICILIAN = 'r1r3k1/4ppbp/p2p1np1/qp6/4P3/2NB4/PPP1QPPP/R4RK1 b - - 0 15';
const FORK = '2r2rk1/1p1qbppp/p2p1nn1/P2Pp1B1/1P2P3/2N2N2/5PPP/2RQ1RK1 b - - 2 15';
const FORK_BISHOP_ON_E3 = '2r2rk1/1p1qbppp/p2p1nn1/P2Pp3/1P2P3/2N1BN2/5PPP/2RQ1RK1 b - - 2 15';
const NIMZO = fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4');
const NIMZO_PAIR = fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2 d5 5. a3 Bxc3+ 6. Qxc3');
const TWO_BISHOPS_MATE = '1r1q2kr/p1p1b2p/2Bp1p1B/8/6b1/8/PPP2PPP/R3R1K1 w - - 1 17';
const DOUBLE_SACRIFICE = fenAfter(
  '1. f4 d5 2. e3 Nf6 3. b3 e6 4. Bb2 Be7 5. Bd3 b6 6. Nc3 Bb7 7. Nf3 Nbd7 8. O-O O-O 9. Ne2 c5 10. Ng3 Qc7 11. Ne5 Nxe5 12. Bxe5 Qc6 13. Qe2 a6 14. Nh5 Nxh5',
);
const QUIET_MOVE =
  'That is not a check. Black is a queen up, so a quiet move gives it time to defend and the attack is gone. Look for a check.';
const QUEEN_RETREAT =
  'A retreat gives up the whole idea. Black plays **...f6** or **...h6**, the bishop on g5 is challenged, and the extra knight decides.';

export const advancedLessons2: Lesson[] = [
  {
    id: 'exchange-sacrifice',
    title: 'The exchange sacrifice',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Giving a rook for a minor piece pays when it wrecks a structure, removes a defender or feeds an attack. Count what you get before you pay.',
    minutes: 11,
    steps: [
      {
        title: 'Pay for a wrecked structure',
        text:
          'A rook is worth about five pawns and a knight about three, so giving up the exchange costs roughly two ' +
          'pawns. I only pay that for something lasting: a wrecked pawn structure, a dominant piece, a passed pawn or ' +
          'an attack.\n\n' +
          'Look at White’s knight on c3. One pawn, b2, defends it. Your rook on c8 and your queen on a5 attack it, and ' +
          'your bishop on g7 would join in if the knight on f6 stepped aside.',
        fen: SICILIAN,
        orientation: 'black',
        shapes: ['c8c3', 'a5c3:blue', 'g7c3:yellow'],
        task: {
          prompt: 'Which capture gives up the exchange to wreck White’s queenside?',
          moves: ['Rxc3'],
          hint: 'Only the b2 pawn defends the knight. Ask what that recapture does to White’s pawns.',
          success:
            '**Rxc3**: the rook takes the knight, and only the b-pawn can recapture. White is left with weak pawns on a2, c2 and c3, and your queen already attacks two of them.',
          why:
            'Before I pay, I ask three questions. What does it cost? About two pawns. What do I get? Pawns that can ' +
            'never be repaired, a bishop about to be freed and a queen already attacking. Can White give anything ' +
            'back? Not easily. Quiet moves such as **...b4** are good too, but they leave White’s structure whole, ' +
            'and this plan damages it for good.',
          wrong: {
            b4: '**...b4** is an excellent move too: it attacks the knight, and the engine rates it about the same. But it leaves White’s pawns intact, and this step is about the sacrifice that wrecks them.',
            Nxe4: {
              text: '**...Nxe4** takes a pawn that White defends three times, with the knight, the bishop and the queen: **Bxe4** wins a piece for a pawn. The e4 pawn is not what this sacrifice is for.',
              refute: 'Bxe4',
            },
            d5: {
              text: '**...d5** is the usual way to hit the centre, but here **e5** attacks the knight and **Nxd5** then wins the pawn. Take the knight with the rook first.',
              refute: 'e5',
            },
          },
          failure:
            'This step is about giving up the exchange. Look at the knight on c3, and ask what White’s pawns will look like once it is taken.',
          reply: 'bxc3',
          replyNote:
            'White’s only recapture. Now a2, c2 and c3 are all weak, and the bishop on g7 would attack c3 if the knight on f6 were out of the way.',
          then: {
            prompt: 'Which knight move unmasks the bishop and aims for c5?',
            moves: ['Nd7'],
            hint: 'The knight on f6 stands on the bishop’s diagonal. Which retreat gives it a route to c5?',
            success:
              '**Nd7**: the knight leaves the long diagonal, so the bishop and the queen both attack c3. From d7 it can go to c5 and hit the bishop on d3.',
            why:
              'Now c3 is attacked twice and no pawn can defend it, so White has to tie pieces down or lose it. Order ' +
              'matters. Taking at once with **...Qxc3** lets White hit back with **a4**, and **...Nxe4** just loses a ' +
              'knight. The e4 pawn was never the point: your compensation is the structure, the bishop and the ' +
              'initiative.',
            wrong: {
              Qxc3: '**...Qxc3** regains the pawn at once and is playable, but White replies **a4**, hitting b5 and opening the a-file for counterplay. Unmasking the bishop first keeps more pressure on.',
              Nxe4: {
                text: '**...Nxe4** unmasks the bishop, but the pawn is defended by the queen and the bishop: **Qxe4** wins a knight for a pawn.',
                refute: 'Qxe4',
              },
            },
            failure:
              'Your own knight blocks the long diagonal. Move it to a square from which it can reach c5.',
            reply: 'f4',
            replyNote:
              'White cannot defend c3 for long, so it takes e5 away from your knight and prepares to push the e-pawn. But the pawn on c3 is still attacked twice.',
            then: {
              prompt: 'Which capture regains the pawn and hits the rook on a1?',
              moves: ['Bxc3'],
              hint: 'Two of your pieces attack c3 and nothing defends it. Which capture also makes a threat?',
              success:
                '**Bxc3**: the bishop takes the pawn and attacks the rook on a1, so White must move it or give back the exchange.',
              why:
                'Count again. In material you are the exchange down for a pawn. In position, White’s pawns on a2, c2 ' +
                'and e4 have no pawn to defend them, your queen already hits a2 and your knight is heading for c5 to ' +
                'hit e4. The engine now prefers Black. A good exchange sacrifice does not have to win material back at ' +
                'once; it has to leave the opponent with the problems.',
              wrong: {
                Ra7: '**Ra7** is a good move too, and the engine rates it almost as high. But **Bxc3** wins the pawn back at once, with a threat, so White has no time to reorganise.',
                Qxc3: '**Qxc3** wins the pawn too, and the engine rates it somewhat lower. **Bxc3** wins the pawn with a threat on the rook, so White gets no free move to reorganise.',
              },
              failure:
                'Two of your pieces attack c3. Find the capture that wins the pawn back and makes a threat to the rook on a1.',
            },
          },
        },
      },

      {
        title: 'Take away the defender',
        text:
          'Material is level and White’s position looks sound. Look at what holds it together: the pawn on e4 is ' +
          'attacked by your knight on f6 but defended by the knight on c3, and that knight is defended only by the ' +
          'rook on c1, which has just arrived on the open file facing your own rook.\n\n' +
          'A rook is worth more than a knight, so a trade on c3 costs you the exchange. The question is what you win ' +
          'in return.',
        fen: FORK,
        orientation: 'black',
        shapes: ['c8c3', 'f6e4:blue', 'e4:red'],
        task: {
          prompt: 'Which capture removes the defender of e4?',
          moves: ['Rxc3'],
          hint: 'After a trade on c3 the rook stands there, and your knight can jump to e4. What would it attack from there?',
          success:
            '**Rxc3**: the rook takes the defender of e4. After the recapture, a knight on e4 would attack the rook on c3 and the bishop on g5 together.',
          why:
            'A defender can be a target. Count the whole sequence, not just the first capture: after **Rxc3 Rxc3 ' +
            'Nxe4** the rook and the bishop are both attacked, White cannot answer both, and the exchange comes ' +
            'straight back with a pawn on top. Quiet moves such as **...Rc4** keep a small edge, but this one wins ' +
            'by force.',
          wrong: {
            Nxe4: {
              text: '**...Nxe4** takes a pawn that is defended: **Nxe4** and you have lost a knight for a pawn. Remove the defender first.',
              refute: 'Nxe4',
            },
            Rc4: '**...Rc4** adds a second attacker to e4 and is a sound move, but it only keeps a small edge. The sacrifice wins by force.',
          },
          failure:
            'The knight on c3 defends e4, and your rook faces it. Find the capture that removes the defender, then see what your own knight can do next.',
          reply: 'Rxc3',
          replyNote:
            'White has to recapture, or it is simply a knight down. But the rook has left c1 for c3, a square your knight can attack from e4.',
          then: {
            prompt: 'Which capture makes a double attack?',
            moves: ['Nxe4'],
            hint: 'Your knight on f6 has a capture available. From its new square, which two white pieces would it attack?',
            success:
              '**Nxe4**: the knight takes the pawn and attacks both the rook on c3 and the bishop on g5.',
            why:
              'The rook is on c3 only because it had to recapture, and the bishop on g5 stands outside the pawn ' +
              'chain, so one knight jump hits both. White cannot meet both threats, and the engine already puts Black almost four pawns ahead. ' +
              'This is what the sacrifice was for. Always look at the square the recapturing piece lands on.',
            failure:
              'Your knight is the piece to use. Find the capture that attacks two pieces at once.',
            reply: 'Bd2',
            replyNote:
              'White saves the bishop and guards the rook, but the knight can still take the rook. The exchange is coming back.',
            then: {
              prompt: 'Which capture wins the rook?',
              moves: ['Nxc3'],
              hint: 'The knight on e4 attacks the rook on c3. After the capture it attacks the queen as well.',
              success:
                '**Nxc3**: the knight takes the rook and attacks the queen. After Bxc3 you have won back the exchange and a pawn.',
              why:
                'Count it: you gave a rook for a knight, then won a pawn, then a rook for a knight. The exchange is ' +
                'back and you are a pawn ahead, with **...Qb5** next, hitting the rook on f1 and the pawn on b4. A sacrifice is only as ' +
                'good as its last move: read the line to the end before you pay.',
              failure:
                'White has saved the bishop, but the rook on c3 is still attacked. Find the capture that wins it.',
            },
          },
        },
      },

      {
        title: 'Keep every piece in the attack',
        text:
          'From the Opera Game, one of the most famous games ever played. White is ahead in development and ' +
          'Black’s king is stuck on e8. Black has just brought a rook to the d-file, giving the knight on d7 a ' +
          'fourth defender: the rook, the knight on f6, the queen and the king.\n\n' +
          'That knight is pinned by the bishop on b5 and attacked by the rook on d1, so on paper it holds. But the ' +
          'knight on f6 is pinned as well, against the queen, by the bishop on g5. So d7 has fewer defenders than ' +
          'it seems.',
        fen: OPERA_RXD7,
        shapes: ['d1d7', 'b5d7:blue', 'g5e7:red'],
        task: {
          prompt: 'Which capture tears the defence of d7 apart?',
          moves: ['Rxd7'],
          hint: 'The knight on f6 cannot recapture without losing the queen. Which capture uses that, even at the cost of a rook?',
          success:
            '**Rxd7**: the rook takes the pinned knight, a rook for a knight. Black’s king is stuck in the centre, and the pins make every recapture costly.',
          why:
            'White pays about two pawns, and Black has no good recapture: **...Nxd7** runs into **Bxe7**, and ' +
            '**...Rxd7** meets **Rd1**, with the pinned rook attacked twice. **Rd5** is strong too, but this keeps ' +
            'every piece working and every defender overloaded. Sacrifice when the king is stuck and you are better ' +
            'developed.',
          wrong: {
            Bd2: '**Bd2** steps out of the pin on f6, and the attack goes with it: after a move such as **...a6** White is only a pawn or so ahead, where **Rxd7** wins outright. Keep the pins and pay the exchange.',
            Qc3: '**Qc3** is strong too, and the engine still has White clearly winning. But Black can offer a queen trade with **...Qc5**, and the pins that make **Rxd7** so powerful are gone.',
            f4: '**f4** is strong too, and the engine still has White well ahead, but it gives Black a move: **...h6** asks the bishop on g5 a question. **Rxd7** does not give Black that time.',
          },
          failure:
            'Count who can really recapture on d7. Find the capture that takes the pinned knight and leaves Black short of defenders.',
          reply: 'Rxd7',
          replyNote:
            'Black takes with the rook, the natural way. The rook is now pinned on d7 against the king, and the d-file is open for the other rook.',
          then: {
            prompt: 'Which rook move attacks the pinned rook a second time?',
            moves: ['Rd1'],
            hint: 'The rook on h1 has not moved yet. Put it where it attacks d7 again.',
            success:
              '**Rd1**: the second rook attacks the pinned rook on d7, which the bishop on b5 attacks as well. The knight on f6 cannot recapture on d7 without losing the queen.',
            why:
              'Two attackers, bishop and rook, against a rook that cannot move and a knight that cannot capture: only ' +
              'the queen and the king guard d7. Black is lost whatever it plays. In the game it tried **...Qe6**, ' +
              'which allows a mate in three. Every white piece took part, and that is the point of the sacrifice: ' +
              'the exchange bought the initiative, and the initiative never stopped.',
            wrong: {
              'Bxd7+': {
                text: '**Bxd7+** wins the rook, but it gives up the pin that made the attack work. After **...Qxd7** White keeps an edge, but the attack has lost its force.',
                refute: 'Qxd7',
              },
            },
            failure: 'The rook on h1 has not joined yet. Find the move that attacks d7 again.',
          },
        },
      },

      {
        title: 'The queen sacrifice',
        text:
          'In the game Black defended with 14...Qe6, and after 15. Bxd7+ Nxd7 we reach this position. Count the ' +
          'material: Black has an extra knight for two pawns, so on paper it is winning. But the king has no moves: ' +
          'the bishop on g5 covers e7 and d8, and Black’s own pieces fill f7, f8 and d7. A single check along the ' +
          'back rank would be mate, if only it could not be captured.',
        fen: OPERA_QB8,
        shapes: ['g5d8', 'd1d7'],
        task: {
          prompt: 'Which queen sacrifice forces mate in two?',
          moves: ['Qb8+'],
          hint: 'Only one black piece can capture on b8. Which file does it leave when it does?',
          success:
            '**Qb8+**: the queen checks along the back rank, and Black’s only reply is **Nxb8**. Then **Rd8#** is mate.',
          why:
            'The knight on d7 is the only piece that can take on b8, and it is also the piece that blocked the ' +
            'd-file. Dragging it away opens the file for the rook, which the bishop on g5 protects. You give a queen ' +
            'to deliver mate. When the king has no squares, look at the king before you count the material.',
          wrong: {
            g4: {
              text: '**g4** is not forcing, and Black answers **...Qxb3**: with the queens off, the extra knight decides. The king has no squares, so only a check can finish the game.',
              refute: 'Qxb3',
            },
            Qe3: QUEEN_RETREAT,
            Qf3: QUEEN_RETREAT,
            Qg3: QUEEN_RETREAT,
          },
          failure:
            'The king has no moves, so a check on the back rank would be mate if it could not be captured. Find the check that forces the capture you want.',
          reply: 'Nxb8',
          replyNote:
            'Forced: the knight is the only piece that can deal with the check. But it has left the d-file.',
          then: {
            prompt: 'The d-file is open. Which rook move is mate?',
            moves: ['Rd8#'],
            acceptAnyMate: true,
            hint: 'The rook on d1 now sees the whole d-file. Which square on it gives check and is protected by the bishop?',
            success:
              '**Rd8#**: the rook checks along the back rank, protected by the bishop on g5. The king cannot take it, d7 and e7 are covered, and Black’s own pieces block f7 and f8.',
            why:
              'Two pieces made the net and neither was the queen. The bishop sealed e7 and d8, and the rook arrived ' +
              'once the knight was dragged away. The queen was the decoy. Whenever a king has no squares, ask which ' +
              'defender holds the key, then force it to leave.',
            failure: 'Look at the open d-file: find the check that the king cannot capture.',
          },
        },
      },

      {
        title: 'Before you give the rook',
        text:
          'Here is the earlier position with one change: White’s bishop stands on e3, not g5. The sacrifice looks ' +
          'the same, and it is not. After **Rxc3 Rxc3 Nxe4** the knight attacks the rook but no second piece, so the ' +
          'rook just steps away. You have paid a rook for a knight and a pawn.\n\n' +
          'So before I give up a rook, I ask four things. What does it cost? What exactly do I get, and can I name ' +
          'it? Can the opponent give the material back or neutralise the damage? And is there a quieter move that ' +
          'keeps most of the edge?',
        fen: FORK_BISHOP_ON_E3,
        orientation: 'black',
        shapes: ['c8c3', 'f6e4:blue'],
        task: {
          prompt: 'Which knight move offers to trade off White’s bishop instead of paying a rook?',
          moves: ['Nf4'],
          hint: 'The knight on g6 has a square where the bishop on e3 may take it and the e5 pawn recaptures. Find it.',
          success:
            '**Nf4**: the knight offers to trade itself for the bishop on e3. If **Bxf4 exf4** the position stays roughly level, and you have paid nothing.',
          why:
            'In the earlier position the last move of the line forked two pieces; here it hits only the rook, so ' +
            'the exchange is gone for good and the sacrifice costs about a pawn. A strong player keeps the idea in ' +
            'reserve until the tactic is there, and meanwhile improves a piece. Calculation decides, not enthusiasm.',
          wrong: {
            Rxc3: '**Rxc3** copies the last position, but the fork is gone: after **Rxc3 Rxc3 Nxe4** White simply moves the rook, and you have paid the exchange for a pawn. The engine puts it about a pawn behind a quiet move.',
          },
          failure:
            'Several quiet moves hold here, but this step asks for a knight move. Look at the knight on g6 and the bishop on e3.',
        },
      },
    ],
    practiceThemes: ['sacrifice', 'attackingF2F7'],
  },

  {
    id: 'bishop-pair',
    title: 'The bishop pair',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Two bishops cover every square. Win them cleanly, keep them, open the position and give the opponent nowhere to hide.',
    minutes: 9,
    steps: [
      {
        title: 'Two bishops, two colours',
        text:
          'One bishop controls only half the board: the squares of its own colour. Two bishops control all of it, ' +
          'and that is what makes the pair so dangerous in an attack.\n\n' +
          'Black is a queen up, but look at its king on g8. Your bishop on h6 covers the dark squares g7 and f8. ' +
          'The light squares f7 and e6 are the other half, and your bishop on c6 can reach them through d5. ' +
          'Black’s rook and pawn fill h8 and h7.',
        fen: TWO_BISHOPS_MATE,
        shapes: ['h6f8', 'c6g2'],
        task: {
          prompt: 'Mate in two. Which check starts it?',
          moves: ['Bd5+'],
          hint: 'The bishop on h6 already takes g7 and f8 away. Which check along the light squares leaves the king nowhere to go?',
          success:
            '**Bd5+**: the bishop checks along the light diagonal. The king has no square, since the bishop on h6 covers g7 and f8, so Black must block on e6.',
          why:
            'Each bishop has its own job: one covers the dark squares behind the king, the other gives the checks on ' +
            'the light ones. A single bishop could do only half of that, and the king would have escaped. That is ' +
            'the pair’s real value: the opponent has no square of either colour to hide on, in an attack and in ' +
            'an endgame alike.',
          wrong: {
            Be4: QUIET_MOVE,
            a3: QUIET_MOVE,
            a4: QUIET_MOVE,
            b4: QUIET_MOVE,
            c3: QUIET_MOVE,
            c4: QUIET_MOVE,
            f4: QUIET_MOVE,
            g3: QUIET_MOVE,
            h4: QUIET_MOVE,
            Rac1: QUIET_MOVE,
            Rad1: QUIET_MOVE,
            Re2: QUIET_MOVE,
            Re3: QUIET_MOVE,
            Rf1: QUIET_MOVE,
            Red1: QUIET_MOVE,
            Rec1: QUIET_MOVE,
            Kh1: QUIET_MOVE,
            Kf1: QUIET_MOVE,
          },
          failure:
            'The bishop on h6 already covers g7 and f8. Look for a check on the light squares that the king cannot step away from.',
          reply: 'Be6',
          replyNote:
            'The only way to meet the check: the bishop on g4 blocks on e6. But the bishop on d5 can take it, and the capture is check again.',
          then: {
            prompt: 'Finish it: checkmate in one.',
            moves: ['Bxe6#'],
            acceptAnyMate: true,
            hint: 'Black’s blocker on e6 is the target. Which of your pieces can take it with check?',
            success:
              '**Bxe6#**: the bishop takes on e6 with check. The bishop on h6 still covers g7 and f8, the pawn blocks h7, and nothing can capture on e6.',
            why:
              'Mate by two bishops that never stood on the same diagonal: one checked, the other sealed the escape ' +
              'squares. When you hold the pair, look for the king’s weak squares of both colours. One bishop covers ' +
              'one colour, the other covers the second.',
            failure:
              'The bishop on d5 can capture on e6 with check. Look at which squares the king still has.',
          },
        },
      },

      {
        title: 'Keep the pair',
        text:
          'The Nimzo-Indian is a fight over this very pair. Black has pinned your knight on c3 and threatens ' +
          '...Bxc3+, which would force you to recapture with the b-pawn and double your pawns. You can live with ' +
          'that, because the pair is worth a lot, but there is a cleaner way: let the queen recapture, and the ' +
          'bishops come with a healthy pawn structure.',
        fen: NIMZO,
        shapes: ['b4c3:red', 'd1c2'],
        task: {
          prompt: 'Which queen move guards c3 and leaves both bishops free?',
          moves: ['Qc2', 'Qb3'],
          hint: 'Black takes on c3 next. Put the queen where it can recapture there.',
          success:
            '**Qc2**, the main line (**Qb3** works too): the queen guards c3, so if Black takes there, the queen recaptures and your pawns stay healthy.',
          why:
            'Black wants to give up the bishop for your knight and double your pawns. After **e3** or **Nf3** you ' +
            'accept that deal: you get the pair but pay in structure. With the queen guarding c3 you decline the ' +
            'price and still keep the pair. The cost is that the queen comes out early, so you keep an eye on ' +
            '**...c5** and **...Nc6**.',
          wrong: {
            e3: '**e3** is a good move too, and the engine likes it. After ...Bxc3+ bxc3 you keep the pair but pay in doubled pawns. This step is about keeping both.',
            Nf3: '**Nf3** is a good move too. Black can take on c3 and double your pawns: you get the pair, and the structure is the price. This step is about keeping both.',
          },
          failure:
            'Black threatens ...Bxc3+, which would double your pawns. Find the queen move that guards c3 without blocking either bishop.',
          reply: 'd5',
          replyNote:
            'Black takes the centre and keeps the pin. Now it is your turn to ask the bishop on b4 a question.',
          then: {
            prompt: 'Which pawn move forces Black to decide about the bishop?',
            moves: ['a3'],
            hint: 'Your queen guards c3, so you can afford to ask. Which pawn attacks the bishop?',
            success:
              '**a3**: the pawn attacks the pinning bishop. Black must take on c3 or retreat, and either way you have gained something.',
            why:
              'If the bishop retreats, you have gained a free move and the pin is gone. If it takes, you recapture ' +
              'with the queen and own the pair. Waiting would let Black choose the moment. Making the bishop decide ' +
              'is the practical way to cash in the pair.',
            failure:
              'The bishop on b4 is the piece Black is relying on. Which pawn move asks it a question?',
            reply: 'Bxc3+',
            replyNote:
              'Black gives up the bishop for the knight, as expected. How you recapture decides what the trade is worth to you.',
            then: {
              prompt: 'Which recapture keeps the pair and the pawn structure?',
              moves: ['Qxc3'],
              hint: 'Your queen has been guarding c3 all along.',
              success:
                '**Qxc3**: the queen recaptures, your pawns stay intact, and you own both bishops.',
              why:
                'This is the payoff: you traded a knight for a bishop and now own the pair, with no weaknesses. ' +
                'The pair grows stronger as lines open, so Black’s task from here is to keep the position closed, ' +
                'and yours is to open it. That is why the structure mattered.',
              wrong: {
                bxc3: '**bxc3** keeps the pair too and is almost as good, but you get doubled c-pawns and an isolated a-pawn. The queen recapture is the point of Qc2.',
              },
              failure:
                'There is a recapture that keeps your pawns intact. Look at the piece that was guarding c3.',
            },
          },
        },
      },

      {
        title: 'Two bishops aimed at the king',
        text:
          'This is one of the most famous attacking patterns there is, and it needs both bishops: Emanuel Lasker ' +
          'first showed it against Bauer in 1889 (the game is in Classic games). Black has just ' +
          'taken White’s knight on h5, so Black is a knight up, but that knight is hanging to your queen and you ' +
          'could simply take it back.\n\n' +
          'Look at the bishops first. The one on d3 points at h7 along the light diagonal; the one on e5 points at ' +
          'g7 along the dark one. The pawn on h7 is guarded by the king alone. Before you recapture anything, ask ' +
          'what the bishops can do while the knight is still loose.',
        fen: DOUBLE_SACRIFICE,
        shapes: ['d3h7:blue', 'e5g7:blue', 'h5:red'],
        task: {
          prompt: 'Which bishop move cracks open the king’s shelter?',
          moves: ['Bxh7+'],
          hint: 'The pawn on h7 has only the king to guard it, and your queen is one move from h5. What could a bishop do there?',
          success:
            '**Bxh7+**: the bishop takes the pawn with check, and the king has to capture it or be mated.',
          why:
            'The sacrifice drags the king to h7, where **Qxh5+** takes the knight with check. Each bishop has its own ' +
            'job: the light-squared one breaks the shelter on h7, and the dark-squared one, already aimed at g7, is ' +
            'waiting for its turn. With a single bishop none of this works, because only one of the two squares ' +
            'would be under attack.',
          wrong: {
            Qxh5: {
              text: '**Qxh5** simply regains the knight, and the engine calls it level. But after **...f5** the diagonal to h7 is shut and the attack has gone. Strike while the king has no defender.',
              refute: 'f5',
            },
          },
          failure:
            'Your queen can take the knight later. First ask which bishop can attack the pawn that shelters the king, and what the king can do about it.',
          reply: 'Kxh7',
          replyNote:
            'Declining with **Kh8** loses to **Qxh5** and a mating attack, so the king captures. Now your queen can take the knight with check.',
          then: {
            prompt: 'Which capture regains the knight with check?',
            moves: ['Qxh5+'],
            hint: 'The king is on the h-file, and the knight on h5 is still loose.',
            success:
              '**Qxh5+**: the queen takes the knight with check along the h-file, and the king has only one square to go to.',
            why:
              'The scoreboard says you are a bishop for a pawn down, and the attack has to make up the difference. ' +
              'It can: the king has lost its shelter and your second bishop is already aimed at g7. A sacrifice is ' +
              'only as good as its follow-up, so before you play the first bishop you must see the second.',
            failure:
              'The knight on h5 is still loose, and the king stands in line with it. Find the capture that comes with check.',
            reply: 'Kg8',
            replyNote:
              'The only legal move. The king is back behind the f- and g-pawns, and the bishop on e5 has been waiting.',
            then: {
              prompt: 'Which move gives up the second bishop?',
              moves: ['Bxg7'],
              hint: 'The bishop on e5 has stared at g7 all along. What would the queen threaten on h8?',
              success:
                '**Bxg7**: the second bishop takes the pawn and threatens **Qh8#**, so the king has to capture it.',
              why:
                'After **Kxg7** the queen checks on g4, and the rook lift decides: Qg4+ Kh7 Rf3 e5 Rh3+ Qh6, and ' +
                'Black has to give up the queen. Before you sacrifice like this, check three things: bishops on ' +
                'the b1–h7 and a1–h8 diagonals, a queen that can reach h5, and a rook that can lift.',
              wrong: {
                Rf3: {
                  text: '**Rf3** brings the rook at once, but it gives Black a move: **...f6** kicks the bishop away and the attack is gone. The second sacrifice has to come first.',
                  refute: 'f6',
                },
                Bf6: {
                  text: '**Bf6** puts the bishop next to g7, but f6 is guarded by the g-pawn and the bishop on e7, so **...Bxf6** simply wins it. **Bxg7** works because only the king can take.',
                  refute: 'Bxf6',
                },
              },
              failure:
                'Your second bishop has been aimed at g7 all along. Find the move that uses it, and ask what the queen on h5 then threatens.',
            },
          },
        },
      },

      {
        title: 'Using the pair, and playing against it',
        text:
          'Owning the pair is not enough; you have to use it. This is my checklist:\n\n' +
          '- **Open the position.** Pawn trades and breaks give the bishops long diagonals. In a closed centre the ' +
          'same bishops are tall pawns.\n' +
          '- **Play on both wings.** A bishop changes wing in one move; a knight needs several.\n' +
          '- **Trade knights, not bishops.** Give up a bishop for a knight only for something concrete: a won pawn, ' +
          'a wrecked structure, a won endgame.\n\n' +
          'Against the pair, do the opposite: close the position, put your pawns where they block the diagonals, ' +
          'and take the first good chance to swap one bishop off.',
        fen: NIMZO_PAIR,
        orientation: 'white',
        shapes: ['c1h6', 'f1a6'],
      },
    ],
    practiceThemes: ['middlegame'],
  },

  {
    id: 'analysing-your-games',
    title: 'Analysing your own games',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'The fastest way to improve: find the turning point of every game and learn one thing from it.',
    minutes: 8,
    practiceDrills: [{ title: 'Analyze a game yourself', to: '/games' }],
    steps: [
      {
        title: 'A ten-minute routine',
        text:
          'Playing is how you practise; analysing is how you improve. After a serious game I spend ten minutes on ' +
          'it, and I follow the same four steps every time.\n\n' +
          '1. **Write down what you thought** at the critical moments, before the engine tells you the truth.\n' +
          '2. **Find the turning point**: the first move after which the evaluation changed for good. The Analyze ' +
          'page’s *Review game* marks the swings.\n' +
          '3. **Understand why**: calculation, a missed pattern, a bad plan, time trouble, a gap in your opening?\n' +
          '4. **Write one lesson** in a sentence. A notebook of these is worth more than any book.\n\n' +
          'We will practise on a famous short game, from the loser’s side.',
        fen: OPERA_MATE,
      },

      {
        title: 'The first real drop',
        text:
          'Let’s review the game on the board, the way I would, from Black’s side. Black lost in seventeen moves, so ' +
          'I open the evaluation graph and look for the swings. As a rule of thumb, a change of 0.3 is noise, a ' +
          'pawn is a real mistake and two pawns is the game. The first moves cost a few tenths each. The first real ' +
          'drop comes at move 6; this is the position just before it. White threatens **Qxf7#**, and the game ' +
          'continued 6...Nf6.',
        fen: OPERA_SIX,
        orientation: 'black',
        shapes: ['c4f7:red', 'f3f7:red'],
        task: {
          prompt: 'Which reply meets the mate threat better than ...Nf6?',
          moves: ['Qf6', 'Qd7', 'Qe7'],
          hint: 'Both of White’s pieces aim at f7. Look for a reply that deals with the threat without walking into a double attack.',
          success:
            '**Qf6**, **Qd7** and **Qe7** all meet the threat with the queen. After any of them Black is worse, but not lost.',
          why:
            'Ask of every natural move what it allows. **...Nf6** develops and blocks the f-file, but **Qb3** ' +
            'attacks b7 and f7 together and Black cannot hold both. A queen move guards f7 at once, and ' +
            '**...Qd7** can follow with **...c6** to guard b7 too. You do not have to find the engine’s move; you ' +
            'have to understand why it holds.',
          wrong: {
            Nf6: {
              text: '**...Nf6** is the move played in the game. It develops a piece and blocks the f-file, but **Qb3** attacks b7 and f7 at once, and Black cannot hold both.',
              refute: 'Qb3',
            },
          },
          failure:
            'White’s queen and bishop both aim at f7. Find a reply that meets that threat and does not walk into a double attack from Qb3.',
        },
      },

      {
        title: 'What did ...b5 allow?',
        text:
          'By move 9 the game was decided. Black was already worse, about +2.6 for White on the engine’s scale, but ' +
          '...b5 took it to about +4. That is another swing of more than a pawn. Black’s idea was to chase ' +
          'the bishop, and in my notebook I would write exactly that.\n\n' +
          'The review asks a different question: not what Black wanted, but what the move allowed.',
        fen: fenAfter(OPERA),
        shapes: ['b5:red', 'c3b5'],
        task: {
          prompt: 'Which move punishes ...b5?',
          moves: ['Nxb5'],
          hint: 'The pawn on b5 is defended by the c-pawn. But what does the recapture open up toward the king on e8?',
          success:
            '**Nxb5**: the knight is given up on a defended pawn. If Black takes, White recaptures on b5 with check, and the king is stuck in the centre.',
          why:
            'This is the question I ask in every review: not “what did Black want?” but “what did the move ' +
            'allow?” After ...b5 the pawn on c6 had two jobs, guarding b5 and shielding the diagonal to the king, ' +
            'and the king was still on e8. The lesson for Black is not “never play ...b5”. It is: do not open lines ' +
            'near an uncastled king while the opponent is better developed.',
          wrong: {
            Bxb5: {
              text: '**Bxb5** takes the pawn with the wrong piece: after ...cxb5 **Nxb5** you have given a bishop for two pawns, and most of the attack has gone.',
              refute: 'cxb5',
            },
            Bxf6: '**Bxf6** is a strong move too, and the engine still has White clearly ahead. But **Nxb5** is much stronger.',
          },
          failure:
            'The pawn on b5 has opened a line toward the king. Look for the way to punish that, even at the cost of a piece.',
          reply: 'cxb5',
          replyNote:
            'Black takes the piece. The engine prefers ...Qb4+, but White is winning there too.',
          then: {
            prompt: 'Which recapture keeps the attack at full strength?',
            moves: ['Bxb5+'],
            hint: 'Two pieces can recapture with check. One lets Black offer a queen trade; the other leaves Black’s blocker pinned.',
            success:
              '**Bxb5+**: the bishop recaptures with check. Black must block or move the king, and the king stays in the centre.',
            why:
              'The pawn on c6 used to cover the diagonal to e8, and it is gone. Black has to block with a piece, and ' +
              'a blocker on d7 is pinned for good. A recapture with check wins a tempo, and tempo is exactly what ' +
              'the sacrifice buys.',
            wrong: {
              'Qxb5+': {
                text: '**Qxb5+** is check too, but Black answers **...Qd7** and the queens can come off. White keeps only a small edge. Take with the bishop and keep the pressure on.',
                refute: 'Qd7',
              },
            },
            failure:
              'Black has taken on b5. Find the recapture that gives check and keeps the queens on the board.',
          },
        },
      },

      {
        title: 'Turning lessons into training',
        text:
          'The notebook entry for this game would read: “I opened lines near my king while behind in ' +
          'development.” That is a lesson I can train. Match each kind of mistake with a tool:\n\n' +
          '- Missed a **tactic**? Practise that theme in puzzles; the Progress page shows which themes you miss ' +
          'most.\n' +
          '- Lost the **opening**? Add the line to your repertoire and review it in the Openings trainer.\n' +
          '- Misplayed an **endgame**? Drill it against the engine until it is automatic.\n' +
          '- **Time trouble**? Play a few games with an increment and practise deciding faster in familiar ' +
          'structures.\n\n' +
          'Prefer the mistake that repeats across games to the spectacular one-off. One game, one lesson, one ' +
          'drill.',
        fen: OPERA_MATE,
      },
    ],
  },
];
