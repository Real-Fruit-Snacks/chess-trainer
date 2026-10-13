import { fenAfter, type Lesson } from '../model';

/** From a Lichess puzzle (CC0): White to move after Black captured on g4. */
const DEFLECTION = fenAfter('Bxg4', '4rk2/ppp2p1p/3pbPp1/6B1/3n2N1/P6P/2P3P1/4R2K b - - 2 25');

export const intermediateLessons: Lesson[] = [
  {
    id: 'forks',
    title: 'Forks',
    level: 'intermediate',
    category: 'Tactics',
    summary:
      'Attack two things at once, the most common tactic in chess, and learn to see it coming.',
    minutes: 8,
    steps: [
      {
        title: 'One move, two targets',
        text:
          'A **fork** is one move that attacks two things at once. Your opponent gets a single move to answer, so ' +
          'one of them falls. Knights are the great forkers: their jump cannot be blocked, and because a knight ' +
          'never moves along a line, its attacks are the easiest ones to overlook.\n\n' +
          'Look at the black rook on d5: nothing protects it. Now look at the king on e8. When one of the two ' +
          'targets is the king, a fork is at its strongest, because the check has to be answered first and the ' +
          'other piece is left to its fate.',
        fen: '4k3/p6p/8/3r4/4N3/8/P6P/4K3 w - - 0 1',
        task: {
          prompt: 'Which knight move attacks the king and the rook at the same time?',
          moves: ['Nf6+'],
          hint: 'List the knight’s checks first. Then, for each one, ask what else the knight attacks from that square.',
          success:
            '**Nf6+**: check to the king on e8, and from f6 the knight also attacks the rook on d5.',
          why:
            'Black must deal with the check, so there is no time to save the rook. **Nd6+** is check too, but from ' +
            'd6 the knight does not touch d5, and the rook simply takes it. Take this habit into your games: ' +
            'whenever an enemy piece is loose, look for a check that hits it as well.',
          wrong: {
            'Nd6+': {
              text: 'Check, but from d6 the knight no longer attacks the rook, and it lands right in front of it: **Rxd6** takes it for free.',
              refute: 'Rxd6',
            },
            Nc3: {
              text: 'That attacks the rook, but it is not check, so Black has time to move it. After **Rh5** the rook is safe, and now your h-pawn is the one under attack.',
              refute: 'Rh5',
            },
          },
          failure:
            'Look for a knight move that gives check and attacks the rook on d5 at the same time.',
          reply: 'Ke7',
          replyNote:
            'The king steps out of check and attacks your knight on f6. It hopes you will retreat, but the rook is still hanging.',
          then: {
            prompt: 'Your knight is attacked. What is the best way out?',
            moves: ['Nxd5+'],
            hint: 'Your knight has to move anyway. Is there a square where it captures something, with check?',
            success:
              '**Nxd5+**: the knight takes the rook, with check, and gets away from the king at the same time.',
            why:
              'Collecting is the easy part, but do it carefully: a capture with check leaves the opponent no time for ' +
              'tricks. You are now a whole knight up, which is plenty to win. Notice that the fork worked even though ' +
              'Black chose the most annoying reply, the one that attacked your forking piece.',
            wrong: {
              Nxh7: {
                text: 'A pawn, but the rook escapes with **Rh5**, and then your knight is trapped on h7: every square it could flee to is covered.',
                refute: 'Rh5',
              },
            },
            failure:
              'The rook on d5 is still attacked. Take it, and look at where the black king stands.',
          },
        },
      },
      {
        title: 'Queen forks',
        text:
          'The queen forks along ranks, files and diagonals, all at once, so she has more fork squares than any ' +
          'other piece. They are also the forks people forget to look for.\n\n' +
          'Strong players hunt for forks with two questions: which enemy pieces are loose, and where is the king? ' +
          'Here the rook on b2 has no defender at all, and the black king on h8 has nobody to hide behind but a ' +
          'single pawn.',
        fen: '7k/7p/8/8/8/8/1r6/3QK3 w - - 0 1',
        task: {
          prompt: 'Which queen move checks the king and attacks the rook?',
          moves: ['Qd4+'],
          hint: 'Find the squares where the queen gives check. From which of them does she also see b2?',
          success:
            '**Qd4+**: check along the long diagonal to h8, and the rook on b2 is attacked along the other diagonal.',
          why:
            'The king has to step out of check, and **Qxb2** follows. **Qd8+** also wins in the end, because after ' +
            'Kg7 the same fork comes from d4, but it hands Black an extra move for nothing. With a queen, look first ' +
            'for a check from a square that also lines up with a loose piece.',
          wrong: {
            'Qd8+':
              'That also wins the rook, one move later: after Kg7, **Qd4+** is the same fork. But why give Black a free move? The fork is there right now.',
            Qa1: 'That wins the rook too, with a different tactic: the rook stands between your queen and the king on the long diagonal, so it cannot move. That is a pin, the next lesson. Here, find the fork.',
          },
          failure: 'Find a queen move that gives check and lands on a line with the rook on b2.',
        },
      },
      {
        title: 'Pawn forks',
        text:
          'Even the smallest piece can fork, and a pawn fork hurts the most: whatever Black saves, the piece that is ' +
          'lost is worth three of your pawns.\n\n' +
          'Look at the black knight on c6 and the bishop on e6. They stand on the same rank with one square ' +
          'between them, which is exactly the shape a pawn can fork. Then check the square in front of your pawn: ' +
          'is it safe to go there?',
        fen: 'r3k3/8/2n1b3/8/3PP3/8/8/3QK3 w - - 0 1',
        shapes: ['c6:red', 'e6:red'],
        task: {
          prompt: 'Which pawn move attacks the knight and the bishop at once?',
          moves: ['d5'],
          hint: 'A pawn attacks the two squares diagonally in front of it. Which square is diagonally in front of both c6 and e6?',
          success:
            '**d5**: the pawn attacks the knight on c6 and the bishop on e6, and your pawn on e4 protects it.',
          why:
            'If **Bxd5**, **exd5** and the knight is still attacked, so Black loses a piece either way. The fork was ' +
            'possible because of three things: two loose pieces, one square apart, and a protected square in front of ' +
            'your pawn. Look for that shape in your own games, for your pawns and for your opponent’s.',
          wrong: {
            Qa4: {
              text: 'That pins the knight to the king, but look down the a-file: nothing stands between your queen and the rook on a8. **Rxa4** takes her.',
              refute: 'Rxa4',
            },
            'Qh5+':
              'Not a bad check, but it gives Black’s king a useful move: from d7 it guards both c6 and e6. Fork first, while both pieces are still loose.',
            Qe2: {
              text: 'Watch the open a-file. **Ra1+**, and once your king steps up to the second rank, **Ra2** attacks your king and queen along it together: the queen is lost for a rook.',
              refute: 'Ra1+',
            },
            Qd2: {
              text: 'Watch the open a-file. **Ra1+**, and once your king steps up to the second rank, **Ra2** attacks your king and queen along it together: the queen is lost for a rook.',
              refute: 'Ra1+',
            },
          },
          failure:
            'Find the pawn move that attacks c6 and e6 together, on a square your other pawn protects.',
          reply: 'Nd8',
          replyNote:
            'Black’s best: the knight escapes to d8, where it guards the bishop on e6. Black hopes that a defended bishop is safe.',
          then: {
            prompt: 'The knight now guards e6. What is your best move?',
            moves: ['dxe6'],
            hint: 'Your pawn still attacks the bishop. Count it out: what would you give, and what would you get?',
            success:
              '**dxe6**: the pawn takes the bishop. If the knight takes back, you have given a pawn for a bishop.',
            why:
              'Defending the bishop does not save it: a pawn for a bishop is still a gain of two points. Do not let ' +
              'the fork slip: **Qh5+** or a quiet queen move just gives Black time to move the bishop away, and the ' +
              'extra piece is gone. When a pawn attacks a piece, taking it is usually right.',
            failure:
              'Your pawn still attacks the bishop on e6. A pawn for a bishop is a good trade, even when the bishop is defended.',
            reply: 'Nxe6',
            replyNote:
              'Black takes back. Count: your queen and pawn against a rook and a knight, ten points against eight. The fork turned a level game into a clear advantage.',
          },
        },
      },
      {
        title: 'Spotting forks',
        text:
          'How do strong players find so many forks? They look for targets first, and only then for moves.\n\n' +
          '- **Loose pieces.** Any piece with no defender is a target.\n' +
          '- **The king and the queen.** A check must be answered and a queen must run, so a fork that hits either ' +
          'one wins time.\n' +
          '- **One square, two targets.** Once you have two targets, look for a square that attacks both, then ' +
          'check that your piece can land there safely.\n\n' +
          'The arrows show the first fork again: two targets, one square. Ask the same questions for your ' +
          'opponent before every move, and you will stop walking into forks too.',
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
    summary: 'Two pieces on one line: attack the one that cannot move, or the one that has to.',
    minutes: 9,
    steps: [
      {
        title: 'The absolute pin',
        text:
          'A **pin** is an attack on a piece that cannot move without exposing something more valuable behind it. ' +
          'Look at your bishop on b5: it attacks the knight on c6, and right behind the knight stands the black ' +
          'king. The knight may not move at all, because that would leave its own king in check. That is an ' +
          '**absolute pin**.\n\n' +
          'A pinned piece is a sitting target. The pawn on b7 defends the knight, so taking it with the bishop ' +
          'would only be a trade. The question a strong player asks here is: what can attack the knight that is ' +
          'worth less than a knight?',
        fen: '4k2r/1p5p/2n5/1B6/3P4/8/P6P/4K2R w - - 0 1',
        shapes: ['b5e8:red'],
        task: {
          prompt: 'How do you win the pinned knight?',
          moves: ['d5'],
          hint: 'The knight cannot run. Which of your pieces is the cheapest one that could attack it?',
          success:
            '**d5**: the pawn attacks the knight, and the knight cannot step away, because the bishop pins it to the king.',
          why:
            'Pile up on a pinned piece with something cheap, and it is lost: next move the pawn takes it. **Bxc6+** ' +
            'looks natural, but after bxc6 you have only swapped a bishop for a knight, and the pin is gone. ' +
            'Whenever you pin a piece, ask whether a pawn can attack it.',
          wrong: {
            'Bxc6+': {
              text: 'That only trades: **bxc6**, and your bishop is gone for the knight. The pin was worth more than that. Keep the bishop where it is and attack the knight with something cheaper.',
              refute: 'bxc6',
            },
          },
          failure: 'Keep the pin, and attack the knight on c6 with your cheapest piece.',
          reply: 'Kd7',
          replyNote:
            'Black’s best try: the king steps up to d7 to defend the knight. But the knight is still pinned, now to the king on d7.',
          then: {
            prompt: 'Time to collect. Which piece should take on c6?',
            moves: ['dxc6+'],
            hint: 'Two of your pieces attack the knight. If Black takes back, which of them would you rather lose?',
            success:
              '**dxc6+**: the pawn takes the knight, with check. If bxc6, your bishop steps back and you are a whole piece up.',
            why:
              'Capture with the cheapest piece. With the pawn, Black can only win a pawn back. With the bishop, ' +
              '**Bxc6+** bxc6 dxc6+ Kxc6 trades everything off and leaves you just a pawn up. Before every capture, ' +
              'ask what the opponent takes back.',
            wrong: {
              'Bxc6+': {
                text: 'That gives the bishop back: **bxc6**, and after dxc6+ Kxc6 everything has been traded and you are only a pawn up. Take with the pawn, and keep the bishop.',
                refute: 'bxc6',
              },
            },
            failure:
              'Your pawn and your bishop both attack the pinned knight on c6. Take it, and choose the capturing piece with care.',
            reply: 'bxc6',
            replyNote:
              'Black takes back, and the new pawn on c6 attacks your bishop. Step it back to safety: you are a piece up, and the pin did all the work.',
          },
        },
      },
      {
        title: 'The relative pin',
        text:
          'When the piece behind is not the king, the pin is **relative**. The pinned piece may move; it just costs ' +
          'something.\n\n' +
          'Here your bishop on g5 pins the knight on f6 to the queen on d8. If the knight moves, **Bxd8** takes the ' +
          'queen, so in practice it is frozen, and the same idea works: attack it with something cheap. But a ' +
          'relative pin can be fought. Black may break it, or attack the piece that makes it, and you have to be ' +
          'ready for that.',
        fen: '3q3k/pp4pp/5n2/6B1/4P3/8/5PPP/2Q3K1 w - - 0 1',
        shapes: ['g5d8:red'],
        task: {
          prompt: 'How do you make the pin on the knight count?',
          moves: ['e5'],
          hint: 'Count the knight’s defenders. Then look for an attacker that is worth less than a knight.',
          success:
            '**e5**: the pawn attacks the knight. It cannot step away without giving up the queen, and nothing can take your pawn.',
          why:
            'Moving the knight loses the queen, and defending it does not help: a pawn for a knight is a bargain for ' +
            'you. **Qa1**, piling on with the queen, is the natural try, but the knight is defended twice and ' +
            'Black simply kicks your bishop. Against a pinned piece, the cheapest attacker is the strongest.',
          wrong: {
            Qa1: {
              text: 'That attacks the knight a second time, but the queen and the g7 pawn defend it twice. Black answers **h6**, hitting your bishop, and the pin falls apart. Look for a cheaper attacker.',
              refute: 'h6',
            },
            Bxf6: {
              text: 'That gives up the pin for a plain trade: **gxf6**, bishop for knight. A pin is worth more while it lasts. Keep it, and attack the pinned piece.',
              refute: 'gxf6',
            },
            Qc3: {
              text: 'That piles up on f6 along the long diagonal, but your queen has left the back rank: **Qd1+** Qe1 Qxe1#. Before you pile on, check what your queen was guarding.',
              refute: 'Qd1+',
            },
          },
          failure:
            'Keep the pin, and attack the knight on f6 with something worth less than a knight.',
          reply: 'h6',
          replyNote:
            'Black’s best defence: the h-pawn attacks the bishop that makes the pin. If your bishop leaves that diagonal, the knight is free.',
          then: {
            prompt: 'Your bishop is attacked. Where does it go?',
            moves: ['Bh4'],
            hint: 'Which square keeps the bishop on the diagonal that runs through f6 and d8?',
            success:
              '**Bh4**: the bishop steps back along the same diagonal. The knight stays pinned, and your pawn still attacks it.',
            why:
              'When the pinning piece is attacked, look for a retreat that keeps the pin: now the knight cannot be ' +
              'saved. Taking first fails: after **exf6** hxg5, Black has won a bishop back. **Bxf6** gxf6 exf6 wins ' +
              'only a pawn. Before you capture, check what of yours is still hanging.',
            wrong: {
              exf6: {
                text: 'The pawn takes the knight, but your bishop is still attacked: **hxg5**, and Black has won a piece back. Material is level again.',
                refute: 'hxg5',
              },
              Bxf6: {
                text: 'That wins a pawn after gxf6 exf6, but it gives up the pin. Retreat along the diagonal instead, and the whole knight falls.',
                refute: 'gxf6',
              },
              Bxh6: {
                text: 'A pawn, but your bishop has left the diagonal and the pin is gone: **Nd5**, and the knight walks away from your pawn.',
                refute: 'Nd5',
              },
              Qc3: {
                text: 'Your queen leaves the back rank, and the bishop is still hanging: **Qd1+** Qe1 Qxe1#. Deal with the attacked bishop first.',
                refute: 'Qd1+',
              },
            },
            failure:
              'Keep the pin: find the retreat that leaves your bishop on the diagonal through f6 and d8.',
          },
        },
      },
      {
        title: 'The skewer',
        text:
          'A **skewer** is a pin turned around: the more valuable piece stands in front. When it is attacked it has ' +
          'to move, and the piece behind is left exposed. Kings are the favourite victims, because a king in check ' +
          'has no choice.\n\n' +
          'The black king on h5 and the queen on h8 share the h-file, with the king in front. Your rook is one move ' +
          'away from that file.',
        fen: '7q/8/8/7k/8/8/8/1K4R1 w - - 0 1',
        shapes: ['h5:red', 'h8:red'],
        task: {
          prompt: 'Which rook move skewers the king and the queen?',
          moves: ['Rh1+'],
          hint: 'Put the rook on the line that runs through both black pieces, with check.',
          success:
            '**Rh1+**: check along the h-file. The king has to step off it, and then the rook takes the queen on h8.',
          why:
            'Nothing can block the check, and the king cannot stay on the file, so the queen falls. Notice that the ' +
            'rook checks from far away. A check right next to the king, like **Rg5+**, only hands it a free rook. ' +
            'Skewers come from long range: look along the files, ranks and diagonals that pass through the king.',
          wrong: {
            'Rg5+': {
              text: 'A check, but the rook lands right next to the king with nothing protecting it: **Kxg5**. Check from a distance, along the line the king shares with the queen.',
              refute: 'Kxg5',
            },
            Rg8: {
              text: 'That attacks the queen, but she attacks your rook too: **Qxg8**. Attack the king first, and the queen falls with it.',
              refute: 'Qxg8',
            },
          },
          failure:
            'Find a rook check along the h-file, where the king and the queen stand one behind the other.',
        },
      },
      {
        title: 'Skewers on the diagonal',
        text:
          'Bishops and queens skewer along diagonals too. Look at the long diagonal from h1 to a8: the black king on ' +
          'd5 and the rook on a8 both stand on it, with nothing in between. Your bishop on h3 is not on that ' +
          'diagonal yet.\n\n' +
          'Every skewer needs the same two things: a check, and something valuable behind the king on the same line.',
        fen: 'r7/p6p/8/3k4/8/7B/P6P/4K3 w - - 0 1',
        task: {
          prompt: 'Which bishop move skewers the king and the rook?',
          moves: ['Bg2+'],
          hint: 'Which square on the long diagonal can your bishop reach in one move?',
          success:
            '**Bg2+**: check along the long diagonal. The king has to step off it, and **Bxa8** wins the rook.',
          why:
            'The king cannot block the check, and every square on the diagonal is still in the line of fire, so ' +
            'the rook on a8 is lost. **Be6+** is check too, but it puts the bishop next to the king, which simply ' +
            'takes it. The pattern to remember: a king and a loose piece on one line, and a long-range check along it.',
          wrong: {
            'Be6+': {
              text: 'A check, but the bishop lands next to the king with nothing protecting it: **Kxe6**. Look for a check from further away, on the diagonal the king shares with the rook.',
              refute: 'Kxe6',
            },
          },
          failure:
            'Find a check along the long diagonal, where the king and the rook on a8 stand one behind the other.',
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
    summary:
      'Move one piece to unleash another: two threats in one move, and the double check no block can stop.',
    minutes: 9,
    steps: [
      {
        title: 'The discovered attack',
        text:
          'In a **discovered attack**, one piece moves out of the way and uncovers an attack by the piece behind it. ' +
          'The point is that the piece that moves is free to make a threat of its own, so your opponent faces two ' +
          'threats with one move to answer them.\n\n' +
          'Here your knight on e4 stands between your rook on e1 and the black king on e8. Every knight move gives a ' +
          'discovered check. The black queen on h7 is the second target, so the real question is what the knight can ' +
          'attack on its way.',
        fen: '4k3/7q/8/8/4N3/8/8/4RK2 w - - 0 1',
        shapes: ['e1e8:blue'],
        task: {
          prompt: 'Which knight move wins the black queen?',
          moves: ['Nf6+'],
          hint: 'Find the squares from which the knight attacks h7. After each one, could Black block the rook’s check?',
          success:
            '**Nf6+**: the rook checks along the e-file and the knight checks from f6 as well. It is a double check, and the knight also attacks the queen.',
          why:
            'Against two checks at once Black cannot block, so the king must move and the queen falls. **Ng5+** also ' +
            'uncovers the rook and hits the queen, but Black blocks with **Qe7**, and after Rxe7+ Kxe7 only a lone ' +
            'knight is left: a draw. When a discovered check is on, look for the square where the moving piece checks too.',
          wrong: {
            'Ng5+': {
              text: 'A discovered check, and the knight attacks the queen. But Black blocks with **Qe7**, and after Rxe7+ Kxe7 you are left with a lone knight, which cannot mate: a draw.',
              refute: 'Qe7',
            },
            'Nd6+': {
              text: 'A double check, so the king must move, but from d6 the knight does not attack the queen. After **Kd7** the king chases your knight away, and Black keeps the queen.',
              refute: 'Kd7',
            },
          },
          failure:
            'Every knight move uncovers a check from your rook. Find the square where the knight also attacks the queen and leaves Black no way to block.',
          reply: 'Kd8',
          replyNote:
            'The king has to move, and d8 is its best square. Nothing can protect the queen on h7.',
          then: {
            prompt: 'The king has stepped aside. What do you take?',
            moves: ['Nxh7'],
            hint: 'Which black piece is your knight attacking?',
            success:
              '**Nxh7**: the knight takes the queen. A rook and a knight against a lone king is an easy win.',
            why:
              'That is the payoff of the double check: the king had to move, so the queen was left hanging. Make a ' +
              'habit of it: whenever the enemy king shares a line with your rook, bishop or queen, look at what stands ' +
              'in between. If it is one of your pieces, every move it makes is a check.',
            wrong: {
              'Re8+':
                'That also wins the queen: after Kc7 the knight takes on h7 next. But there is no need for a detour. The queen can be taken right now.',
              'Rd1+':
                'That also wins the queen in the end, but it gives Black an extra move for nothing. Your knight attacks the queen right now: take her.',
            },
            failure:
              'Your knight on f6 attacks the queen on h7, and nothing protects her. Take her.',
          },
        },
      },
      {
        title: 'Double check',
        text:
          'When the piece that moves gives check as well as the piece it uncovers, it is a **double check**. Two ' +
          'pieces attack the king at once, and that changes the defence: a block stops only one line, and a capture ' +
          'removes only one checker. So against a double check, **the king must move**.\n\n' +
          'Imagine **Nd6+** here. The queen on c7 attacks d6, yet taking the knight would be illegal, because the ' +
          'rook on e1 would still be giving check. Here the double check would win nothing, since from d6 the knight ' +
          'attacks no target. It pays when the king has no good square, or when the moving piece hits something.',
        fen: '4k3/2q5/8/8/4N3/8/8/4RK2 w - - 0 1',
        shapes: ['e4d6', 'd6e8:red', 'e1e8:red'],
      },
      {
        title: 'Double check mate',
        text:
          'Because the only answer to a double check is a king move, a double check against a king with no free ' +
          'square is mate, even when the checking pieces could be captured.\n\n' +
          'Your knight on e5 blocks the long diagonal from your bishop on b2 to the black king on h8. The king is ' +
          'boxed in by its own rook on g8 and pawn on h7, and as soon as the knight moves, the bishop covers g7 too.',
        fen: '6rk/7p/8/4N3/8/8/1B6/4K3 w - - 0 1',
        shapes: ['b2h8:blue'],
        task: {
          prompt: 'Which knight move is a double check, and mate?',
          moves: ['Nf7#', 'Ng6#'],
          acceptAnyMate: true,
          hint: 'The knight has to uncover the bishop and give check itself. From which squares does a knight attack h8?',
          success:
            'Checkmate: the knight checks the king, and the bishop on b2 checks along the long diagonal at the same time.',
          why:
            '**Ng6#** even lands next to the h7 pawn, which could take the knight after a normal check. Against a ' +
            'double check captures and blocks do not count, and the king has no square. A plain discovered check, ' +
            'such as **Nd7**, is not enough: **Rg7** blocks the diagonal. Both pieces must check.',
          wrong: {
            Nd7: {
              text: 'A discovered check, but only one: Black blocks the diagonal with **Rg7**. To mate, the knight must give check as well, so that a block is no defence.',
              refute: 'Rg7',
            },
          },
          failure:
            'Not mate. The knight has to uncover the bishop and give check itself, so that two pieces attack the king at once.',
        },
      },
      {
        id: 'opening-trap',
        title: 'A trap from the opening',
        text:
          'Discovered attacks win real games, often in the opening. This position comes from a well-known trap in the ' +
          'Petrov Defence: 1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4 4. Qe2 Nf6. Black copied your capture on move three, a ' +
          'known mistake, and when your queen attacked the knight on e4, it ran back to f6.\n\n' +
          'Now look down the e-file: your queen on e2, your knight on e5, the black king on e8, and nothing else in ' +
          'between. Your knight is the only thing blocking a check.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4 4. Qe2 Nf6'),
        shapes: ['e2e8:blue'],
        task: {
          prompt: 'Your knight can move with check. Where does it do the most damage?',
          moves: ['Nc6+'],
          hint: 'Wherever the knight goes, the queen gives check. Which square lets the knight attack the biggest target?',
          success:
            '**Nc6+**: a discovered check from your queen, and the knight on c6 attacks the black queen on d8.',
          why:
            'Black has to answer the check, so the queen cannot be saved. **Ng6+** also wins material, the rook on h8, ' +
            'but why take a rook when the queen is on offer? With a discovered check, the moving piece cannot be ' +
            'punished at once, so send it after the biggest target.',
          wrong: {
            'Ng6+':
              'A discovered check, and the knight attacks the rook on h8, so it does win material. But another knight move wins the queen.',
            'Nxf7+': {
              text: 'A discovered check, but the knight is unprotected on f7, and the king steps out of check by taking it: **Kxf7**. The moving piece still needs a safe square.',
              refute: 'Kxf7',
            },
            b4: {
              text: 'A quiet pawn move gives Black a turn, and Black uses it to block the file. After **Be7** your knight can no longer move with check, and the trap is gone. A discovered check only works when you play it at once.',
              refute: 'Be7',
            },
          },
          failure:
            'Every knight move gives a discovered check. Find the square where the knight also attacks Black’s most valuable piece.',
          reply: 'Be7',
          replyNote:
            'Black blocks the check with the bishop. Blocking with the queen would not help either: your knight would take her on e7.',
          then: {
            prompt: 'What do you take?',
            moves: ['Nxd8'],
            hint: 'Which black piece is your knight attacking?',
            success:
              '**Nxd8**: the knight takes the queen. After Kxd8 you have won a queen for a knight.',
            why:
              'Nine points for three. Remember the shape: the enemy king on a file or diagonal with your queen or ' +
              'rook, and one of your own pieces in between. Every move of that piece is a check, so look for the one ' +
              'with a second threat. And as Black, never leave your king on such a line.',
            wrong: {
              Nxe7: {
                text: 'The bishop is protected: **Qxe7** takes back, and you have only swapped your knight for a bishop. The queen on d8 was the prize.',
                refute: 'Qxe7',
              },
            },
            failure:
              'Your knight on c6 attacks the queen on d8. Take her before Black gets a move.',
          },
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
    summary:
      'When a piece rests on a single defender, take the defender, chase it, lure it away or overload it.',
    minutes: 11,
    steps: [
      {
        title: 'Trade off the guard',
        text:
          'Your rook on d1 attacks the knight on d6. Count its defenders: just one, the queen on f6. Whenever a ' +
          'capture almost works, look for the piece that holds the target up. If there is only one, the real ' +
          'target is that defender.\n\n' +
          'Notice what else the queen is doing. She looks at your queen along the long diagonal, and yours looks ' +
          'straight back. The material is level and nothing hangs, but a piece that rests on one guard is only as ' +
          'safe as the guard. So ask what happens when the queen is no longer there to do her job.',
        fen: 'r1b1k2r/pp3ppp/2pn1q2/8/8/2Q5/PPP1NPPP/3RKB1R w Kkq - 0 1',
        shapes: ['d1d6', 'f6d6:red', 'c3f6:blue'],
        task: {
          prompt: 'How do you win a piece here?',
          moves: ['Qxf6'],
          hint: 'Do not take the knight yet. Who defends it, and could you take that piece instead?',
          success:
            '**Qxf6**: your queen takes the knight’s only defender. Black has to retake with the g-pawn, and d6 is left with no guard.',
          why:
            'The obvious **Rxd6** loses material: **Qxd6** and you have swapped a rook for a knight. Trading queens ' +
            'first takes away the one piece that could retake. A strong player counts the defenders before every ' +
            'capture, and when there is only one, asks: can I take it, chase it or trade it off? Ask the same about ' +
            'your own pieces.',
          wrong: {
            Rxd6: {
              text: 'The knight is defended, and the queen takes your rook: **Qxd6**. You have given five points for three. Remove the defender first, then take the knight.',
              refute: 'Qxd6',
            },
          },
          failure:
            'Look at the knight’s only defender, the queen on f6. Your own queen is facing her: what could you do about that?',
          reply: 'gxf6',
          replyNote:
            'Forced: anything else loses the queen for nothing. The g-pawn takes back, and the knight on d6 has no defender left at all.',
          then: {
            prompt: 'The guard has gone. What do you take?',
            moves: ['Rxd6'],
            hint: 'What is your rook attacking now, and what defends it?',
            success:
              '**Rxd6**: the rook takes the knight, and nothing can take it back. You are a clean piece up.',
            why:
              'That was the whole combination: one queen trade, one free knight. Your rook had been attacking d6 all ' +
              'along, but the capture only worked once the defender was gone. Black even ends up with doubled ' +
              'f-pawns. Ask yourself the same question about your own position: which of your pieces hang by a ' +
              'single thread?',
            failure:
              'The knight on d6 is attacked and no longer defended. Take it before it moves away.',
          },
        },
      },
      {
        title: 'Take the guard first',
        text:
          'From a Lichess game. You are Black, and your queen on d5 attacks the bishop on g5. A free piece? Count ' +
          'its defenders: one, the knight on f3. And that knight is exactly what your bishop on g4 is attacking.\n\n' +
          'So there are two captures to compare, the bishop and its guard. Before you play either, ask what White ' +
          'can take back and what you have left afterwards. One of them wins a piece. The other loses your queen.',
        fen: 'r3kb1r/pppn1ppp/4pn2/3q2B1/6b1/3P1N2/PPP1BPPP/RN1Q1RK1 b kq - 2 7',
        orientation: 'black',
        shapes: ['d5g5:blue', 'g4f3:blue', 'f3g5:red'],
        task: {
          prompt: 'Which capture wins a piece?',
          moves: ['Bxf3'],
          hint: 'Who defends g5? Think about taking that piece, and about what White’s recapture does to your queen.',
          success:
            '**Bxf3**: the bishop takes the knight that guards g5. White has to take back, and then the bishop on g5 is loose.',
          why:
            '**Qxg5** is the trap: **Nxg5** takes your queen for a bishop. With the knight gone, nothing guards g5, ' +
            'so the bishop falls whichever way White retakes. Before you capture a defended piece, ask whether you ' +
            'can capture its defender instead. Take the guard first, then the piece it was guarding.',
          wrong: {
            Qxg5: {
              text: 'The bishop is defended by the knight on f3, and **Nxg5** takes your queen for a bishop. Look at the defender first: if it goes, the bishop is yours.',
              refute: 'Nxg5',
            },
          },
          failure:
            'Do not rush to take the bishop on g5. Find the piece that defends it, and see whether you can remove that piece first.',
          reply: 'Bxf3',
          replyNote:
            'White takes back with the bishop, which now attacks your queen on d5. The bishop on g5 is still without a defender.',
          then: {
            prompt: 'Your queen is attacked. Is there a move that saves her and wins something?',
            moves: ['Qxg5'],
            hint: 'Look at the bishop on g5 again. What defends it now?',
            success:
              '**Qxg5**: the queen takes the bishop and leaves the attack on d5. Nothing can take her on g5.',
            why:
              'The queen did not have to run: she took the loose bishop on her way. You traded bishop for knight and ' +
              'then won a whole bishop, so you are a piece up from a level position. The recipe: capture the ' +
              'defender, accept the recapture, and take what it was guarding.',
            wrong: {
              Qxf3: {
                text: 'That takes the bishop that attacks her, but it is protected: **Qxf3** (or gxf3), and you have given your queen for a bishop. Count what takes back before you capture.',
                refute: 'Qxf3',
              },
            },
            failure:
              'The bishop on g5 has lost its defender. Your queen can use that before she does anything else.',
          },
        },
      },
      {
        title: 'Make the defender leave',
        text:
          'From a Lichess game. You are White, a knight and two pawns behind, so quiet moves will not save you. ' +
          'When you are losing, look for forcing moves, and look at the king.\n\n' +
          'Black’s rook on e8 is attacked by yours, and its only defender is the king on f8. Taking at once with ' +
          '**Rxe8+** fails, because the king takes back. But a king has to answer every check, and your bishop on ' +
          'g5 can give one.',
        fen: DEFLECTION,
        shapes: ['e1e8:blue', 'f8e8:red', 'g5f8:blue'],
        task: {
          prompt: 'Which check forces the king away from the rook?',
          moves: ['Bh6+'],
          hint: 'The king is the rook’s only defender, and a check cannot be ignored. Which of your pieces can give check?',
          success:
            '**Bh6+**: check along the diagonal to f8. The king’s only square is g8, and from there it no longer defends the rook.',
          why:
            'After **Kg8** the rook on e8 stands alone, and **Rxe8#** is mate. **Rxe8+** at once loses the rook to ' +
            'Kxe8, and **hxg4** wins the bishop back but allows **Rxe1+**. A check is the best way to move a ' +
            'defender, because it cannot be ignored. When the defender is a king, look for the check that makes it ' +
            'step off its post.',
          wrong: {
            'Rxe8+': {
              text: 'The king is the defender, and it simply takes: **Kxe8**. The rooks are traded and you are still a knight and two pawns down, with nothing left to attack with. Make the king leave first.',
              refute: 'Kxe8',
            },
            hxg4: {
              text: 'It wins the bishop back, but your rook on e1 is attacked by theirs and has no protection: **Rxe1+**, and the rook is gone. Before you collect a piece, check what of yours is attacked.',
              refute: 'Rxe1+',
            },
            Be3: {
              text: 'That attacks the knight, but it is not forcing. Black gets a move, and **g5** shuts the diagonal to h6: the check is gone, and you are still a knight and two pawns down.',
              refute: 'g5',
            },
          },
          failure:
            'You are behind in material, so look for something forcing. A check leaves the king one square, and that square decides everything.',
          reply: 'Kg8',
          replyNote:
            'Black’s only move: e7 and g7 are covered by the pawn on f6. The king has left f8, and the rook on e8 has lost its defender.',
          then: {
            prompt: 'The rook has lost its guard. How do you finish?',
            moves: ['Rxe8#'],
            acceptAnyMate: true,
            hint: 'Which of your pieces attacks the rook, and what could take it back?',
            success:
              '**Rxe8#**: the rook takes the rook with check. The king cannot take it, and f8, g7 and h8 are all covered.',
            why:
              'This is **deflection**: a forcing move drags a defender off its post, and what it was guarding falls ' +
              'with tempo, here with mate. It works because the deflecting move cannot be ignored. Look for checks, ' +
              'captures and threats that leave your opponent no choice.',
            failure: 'Not mate. The rook on e8 is no longer defended: take it with check.',
          },
        },
      },
      {
        title: 'Lure the defender away',
        text:
          'Sometimes the defender will not leave on its own, so you invite it. Black’s rook on f8 is attacked by ' +
          'your rook on f2, and its only protection is the king on g8. Taking at once is just a trade: **Rxf8+** ' +
          'Kxf8, and the king is the piece that takes back.\n\n' +
          'Your bishop on d3 looks along the diagonal to h7. A sacrifice that pulls a defender onto a bad square ' +
          'is called an **attraction**. What would the king do if the bishop took the pawn with check?',
        fen: '5rk1/pp4pp/2b5/3p4/8/3B3P/PP3RP1/7K w - - 1 25',
        shapes: ['f2f8:blue', 'g8f8:red', 'd3h7'],
        task: {
          prompt: 'How do you win the rook on f8?',
          moves: ['Bxh7+'],
          hint: 'The king guards the rook. Can you give it a reason to go somewhere else?',
          success:
            '**Bxh7+**: the bishop takes a pawn with check. If the king takes it, it leaves g8, and the rook on f8 loses its only guard.',
          why:
            'Declining does not help: after **Kh8** the rook takes on f8 with check, and the king only gets the ' +
            'bishop afterwards. You were a pawn down and you give up a bishop, yet you win a whole rook. The lure ' +
            'works because the sacrifice is a check: the king must answer it, so it cannot go on guarding the rook.',
          wrong: {
            'Rxf8+': {
              text: 'The king is the defender, and it simply takes: **Kxf8**. The rooks are traded and the attack is gone; even if Bxh7 wins a pawn back, you are no better off. Make the king leave first.',
              refute: 'Kxf8',
            },
          },
          failure:
            'The rook on f8 has one defender, the king. Look for a forcing move that makes the king step away from it.',
          reply: 'Kxh7',
          replyNote:
            'Black takes the bishop. The king now stands on h7, and f8 has lost its only guard.',
          then: {
            prompt: 'The rook is loose. Take it.',
            moves: ['Rxf8'],
            hint: 'What does your rook on f2 attack, and what defends it now?',
            success: '**Rxf8**: the rook takes the rook, which nothing defends any more.',
            why:
              'You gave a bishop and won a rook: the exchange, from a position where you were a pawn down. A ' +
              'sacrifice pays when what you win is worth more than what you give, and a check leaves the opponent ' +
              'no time to choose. Ask of every defender: what happens if I invite it away?',
            failure: 'The rook on f8 has lost its defender. Take it.',
          },
        },
      },
      {
        title: 'One defender, two jobs',
        text:
          'There is a quieter way to remove a defender: give it two jobs and let it fail at one. A piece that ' +
          'guards two things at once is **overloaded**.\n\n' +
          'From a Lichess game. White’s queen has just taken a bishop on g3, and you are down material. But look ' +
          'at the knight on e2. It guards the queen on g3, and it guards the rook on e1. Your queen on g7 faces ' +
          'White’s along the g-file. If she is taken, which piece has to retake, and what does it leave behind?',
        fen: '4r1k1/pp4q1/2p5/1n1p1B2/3P4/1P3PQP/P3N1P1/4R2K b - - 0 34',
        orientation: 'black',
        shapes: ['e2g3:blue', 'e2e1:blue', 'g7g3'],
        task: {
          prompt: 'Which move makes the knight drop one of its jobs?',
          moves: ['Qxg3'],
          hint: 'Your queen faces White’s queen on the g-file. If she is taken, which piece has to take back?',
          success:
            '**Qxg3**: you take the queen on g3. Only the knight can retake, and it must leave e2 to do so.',
          why:
            '**Nxg3** is forced, and then **Rxe1+** wins a whole rook, because nothing guards e1 any more. The ' +
            'knight was overloaded: it had to guard the queen and the rook, and it could not do both. **Rxe2** ' +
            'looks like taking the defender, but White trades queens first. Look for the piece with two jobs, and ' +
            'attack one of them.',
          wrong: {
            Rxe2: {
              text: 'Taking the knight looks like removing the defender, but White trades queens with check first: **Qxg7+** Kxg7, and **Rxe2** takes your rook. You have given a rook for a knight.',
              refute: 'Qxg7+',
            },
          },
          failure:
            'Your queen faces White’s queen. Think about which piece must retake if she is traded, and what it stops guarding.',
          reply: 'Nxg3',
          replyNote:
            'The knight has to retake, because nothing else can. But it has left e2, and nothing protects the rook on e1 any more.',
          then: {
            prompt: 'The knight has left its post. What do you take?',
            moves: ['Rxe1+'],
            hint: 'Look at the first rank: the rook on e1 has lost its only guard.',
            success: '**Rxe1+**: the rook takes the rook with check, and nothing can take it back.',
            why:
              'You started a bishop and two pawns behind and have now won a whole rook, with check. The three ' +
              'ways to remove a defender you saw before were to capture it, chase it away or lure it. This one is ' +
              'the quietest: make the defender choose, and it loses either way.',
            failure:
              'The knight has left e2, so a piece on the first rank is now unprotected. Take it.',
          },
        },
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
      'Five mating pictures to recognise at a glance: smothered, Anastasia’s, Arabian, Boden’s and the h-file mate.',
    minutes: 11,
    steps: [
      {
        title: 'Smothered mate',
        text:
          'This comes from a real game, and it ends in one of the best-known mates in chess. Black’s king stands on g8, ' +
          'hemmed in by its own rook on f8 and its pawns on g7 and h7. Your knight on f7 attacks the black queen, ' +
          'and behind it your queen on e6 looks at g8.\n\n' +
          '**Nxd8+** wins the queen with a discovered check, so it is tempting. But before you take anything, look ' +
          'at the king: nearly every square around it is blocked by its own pieces, and a king with no air is ' +
          'in far more danger than the material suggests.',
        fen: '2bq1rk1/5Npp/1p2Q3/r1n2p2/1p6/3B4/P1P3PP/R4RK1 w - - 5 22',
        shapes: ['f7d8:red', 'e6g8:blue'],
        task: {
          prompt: 'Which knight move gives a check that no capture or block can answer?',
          moves: ['Nh6+'],
          hint: 'A discovered check can be answered by capturing the queen. Find the square where the knight gives check itself as well.',
          success:
            '**Nh6+**: the knight steps away, so the queen checks along the diagonal, and the knight checks from h6 too. It is a double check.',
          why:
            'Against a double check there is no capture and no block, so the king has to move, and it has one ' +
            'square: h8. **Nxd8+** is only a single check, and Black answers it by taking your queen with ' +
            '**Nxe6**. The same goes for **Ng5+**. When your knight blocks your own long-range piece, look for ' +
            'the move where it checks as well.',
          wrong: {
            'Nxd8+': {
              text: 'It wins the queen with a discovered check, but a single check can be answered by capturing the checking piece: **Nxe6**. The queens come off, and the mate has gone.',
              refute: 'Nxe6',
            },
            'Ng5+': {
              text: 'Another discovered check, and again Black can simply capture the checking queen with **Nxe6**. Only a double check takes that option away.',
              refute: 'Nxe6',
            },
          },
          failure:
            'Black’s king has almost no squares of its own. Look for a knight move that gives check itself, so the queen’s check cannot be captured or blocked.',
          reply: 'Kh8',
          replyNote:
            'Black’s only move. Its own rook holds f8 and its own pawns hold g7 and h7, so the king can only step into the corner.',
          then: {
            prompt: 'The king is stuck in the corner. What is your next forcing move?',
            moves: ['Qg8+'],
            hint: 'Your knight protects some of the squares next to the king. Can your queen give check from one of them?',
            success:
              'The queen goes to g8 with check. The king cannot take her, because the knight on h6 protects g8, so the rook has to.',
            why:
              'Black’s only reply is **Rxg8**. That feels like throwing the queen away, and you have given up nine ' +
              'points. But look where the rook ends up: right beside its own king, closing the last square. A mate ' +
              'that costs the queen is still a mate. Count the mate, not the material.',
            wrong: {
              'Nf7+': {
                text: 'Check, but the rook on f8 simply takes the knight: **Rxf7**, and your queen has to take back. The queen sacrifice is what drags the rook onto g8, so it has to come first.',
                refute: 'Rxf7',
              },
            },
            failure:
              'The king has one flight square left in the corner. Is there a check on g8 that only the rook can answer?',
            reply: 'Rxg8',
            replyNote:
              'Forced: the king cannot take the queen because the knight protects her, and nothing else can capture. The rook now blocks the king’s last square.',
            then: {
              prompt: 'Checkmate in one.',
              moves: ['Nf7#'],
              acceptAnyMate: true,
              hint: 'The knight needs a square from which it attacks h8.',
              success:
                '**Nf7#**: the knight checks the king, and nothing can take it. The rook on g8 and the pawns on g7 and h7 seal every square.',
              why:
                'That is the **smothered mate**: a king boxed in by its own pieces and mated by a knight, the one ' +
                'attacker nobody can block. It almost always needs a sacrifice to put a defender on g8 first. When an ' +
                'enemy king has no air, look at every knight check.',
              failure:
                'Not mate. The king is boxed in by its own pieces: which knight check can neither be blocked nor taken?',
            },
          },
        },
      },
      {
        title: 'Anastasia’s mate',
        text:
          'Anastasia’s mate is a knight and a rook against a king on the edge. Look at the king on h7. The knight ' +
          'on e7 covers g8 and g6, and the king’s own pawn blocks g7, so the whole g-file is shut. Only h8 and h6 ' +
          'are left, and both lie on the h-file, which a rook can cover with check.\n\n' +
          'Notice who built the trap. The pawn that stands beside the king and seems to protect it is what closes ' +
          'the door.',
        fen: '8/4N1pk/8/8/8/8/4K3/R7 w - - 0 1',
        shapes: ['e7g8:blue', 'e7g6:blue', 'g7:red'],
        task: {
          prompt: 'Which rook move is checkmate?',
          moves: ['Rh1#'],
          acceptAnyMate: true,
          hint: 'The knight already covers g6 and g8. Which file is the king standing on?',
          success:
            '**Rh1#**: the rook checks along the h-file. The knight covers g8 and g6, the pawn blocks g7, and h8 and h6 lie on the rook’s line.',
          why:
            'The mate needs three things: a king on the edge, its own pawn beside it, and a knight covering the ' +
            'squares on the other side. Look for it whenever you can land a knight on e7 and bring a rook or ' +
            'queen to the h-file. As a defender, remember that a pawn next to your king can take away its squares ' +
            'as well as guard it.',
          failure:
            'Not mate. The knight already shuts the g-file, so the rook has to check along the h-file.',
        },
      },
      {
        title: 'Arabian mate',
        text:
          'The Arabian mate lives in the corner. Your knight on f6 guards g8 and h7, the two squares a king on h8 ' +
          'would run to, and that leaves only g7. A rook on the seventh rank covers g7, so the king is already ' +
          'boxed in: all that is missing is a check.\n\n' +
          'The rook has to give it from a square the knight protects, or the king will simply take it.',
        fen: '7k/R7/5N2/8/8/8/8/4K3 w - - 0 1',
        shapes: ['f6g8:blue', 'f6h7:blue', 'a7g7:green'],
        task: {
          prompt: 'Which rook move is checkmate?',
          moves: ['Rh7#'],
          acceptAnyMate: true,
          hint: 'The rook must check from a square next to the king, and the knight must protect it.',
          success:
            '**Rh7#**: the rook checks from h7, protected by the knight on f6. The knight covers g8, and the rook covers g7.',
          why:
            'A rook next to the king is normally a gift, but here the knight protects h7, so the king cannot take ' +
            'it. **Ra8+** also gives check, but it leaves the seventh rank and lets the king out to g7. Before you ' +
            'give a check, count the squares the king keeps afterwards.',
          wrong: {
            'Ra8+': {
              text: 'A check, but it leaves the seventh rank, and the king steps out to g7 and attacks your knight. Count the squares the king keeps before you check.',
              refute: 'Kg7',
            },
          },
          failure:
            'Not mate. The knight guards g8 and h7: find the check that keeps the rook on the seventh rank.',
        },
      },
      {
        title: 'Boden’s mate',
        text:
          'Boden’s mate belongs to a king that has castled long. Two bishops on crossing diagonals do the work: ' +
          'the one on f4 covers b8 and c7, and the one on e2 will check along a6, b7 and c8. The king’s own rook ' +
          'and knight close the other doors.\n\n' +
          'There is one problem. The pawn on b7 stands in the way, and a bishop on a6 would just be captured. ' +
          'First the pawn has to be dragged out of the line.',
        fen: '2kr4/1p1n4/2p5/8/5B2/8/4B3/2R3K1 w - - 0 1',
        shapes: ['f4b8:blue', 'e2a6:blue', 'b7:red'],
        task: {
          prompt: 'How do you drag the b-pawn out of the way?',
          moves: ['Rxc6+'],
          hint: 'The pawn on b7 blocks the diagonal to c8. What could you give up to make it capture and leave?',
          success:
            '**Rxc6+**: the rook takes the pawn on c6 with check. The king cannot take it, so the b-pawn has to.',
          why:
            'Black’s only reply is **bxc6**, because b8 and c7 are covered and nothing else can capture. That ' +
            'pawn move opens the diagonal from a6 to c8. The rook sacrifice is the key: **Ba6** at once ' +
            'just loses the bishop to bxa6.',
          wrong: {
            Ba6: {
              text: 'It is the right square, but the b7 pawn is still there to take the bishop: **bxa6**. The pawn has to be removed from the diagonal first.',
              refute: 'bxa6',
            },
          },
          failure:
            'The bishop on e2 needs the diagonal to c8 open. Which sacrifice forces the pawn on b7 to leave it?',
          reply: 'bxc6',
          replyNote:
            'Forced: the king cannot take a rook two squares away, and only the b-pawn can capture. It leaves b7, and the diagonal to c8 is open.',
          then: {
            prompt: 'Checkmate in one.',
            moves: ['Ba6#'],
            acceptAnyMate: true,
            hint: 'Which bishop can now reach the diagonal that runs through b7?',
            success:
              '**Ba6#**: the bishop checks along a6, b7 and c8. The other bishop covers b8 and c7, and the king’s own pieces hold d7 and d8.',
            why:
              'That is **Boden’s mate**: two bishops on crossing diagonals and a king boxed in by its own pieces. ' +
              'The bishops strike from far away, which is why it is easy to miss. When the enemy king has castled ' +
              'long, look at the diagonals that run to c8.',
            failure:
              'Not mate. One bishop covers b8 and c7: bring the other to the diagonal that checks through b7.',
          },
        },
      },
      {
        title: 'The h-file mate',
        text:
          'The last picture is a close cousin of Anastasia’s mate, with a bishop in place of the knight. The ' +
          'bishop on d5 covers g8 along the diagonal, the king’s own pawn blocks g7, and the king on h8 has only ' +
          'the h-file left.\n\n' +
          'The same three ingredients appear again: a king in the corner, a pawn beside it, and one attacker that ' +
          'covers the square in front while a rook checks from behind.',
        fen: '7k/6p1/5p2/3B4/8/8/4K3/R7 w - - 0 1',
        shapes: ['d5g8:blue', 'g7:red'],
        task: {
          prompt: 'Which rook move is checkmate?',
          moves: ['Rh1#'],
          acceptAnyMate: true,
          hint: 'The bishop has taken g8 away. Which file does the king have left?',
          success:
            '**Rh1#**: the rook checks along the h-file. The bishop covers g8, the pawn blocks g7, and the king cannot go anywhere.',
          why:
            'Long-range pieces make the same mate as a knight: one covers the corner square, the other checks ' +
            'on the file. Countless attacks on the h-file end like this. As a defender, give your king some room ' +
            'with a pawn move before the open h-file and a bishop on that diagonal appear.',
          wrong: {
            'Ra8+': {
              text: 'A check, but along the eighth rank: the king simply steps out to h7. The mate needs the rook on the h-file, where it also takes h7 away.',
              refute: 'Kh7',
            },
          },
          failure:
            'Not mate. The bishop already covers g8: the rook has to check along the h-file.',
        },
      },
      {
        title: 'Spot it yourself',
        text:
          'One more picture, with no help from me. Every pattern in this lesson answers the same three questions ' +
          'about the enemy king: which squares can it reach, which are shut by its own pieces, and which can ' +
          'I cover?\n\n' +
          'Count those first and the right check usually shows itself. Black’s king here has a rook and three ' +
          'pawns around it, and your knight is one jump from a square that attacks it.',
        fen: '6rk/5ppp/8/4N3/8/8/8/4K3 w - - 0 1',
        shapes: ['e5f7', 'h8:red'],
        task: {
          prompt: 'Find the checkmate in one.',
          moves: ['Nxf7#'],
          acceptAnyMate: true,
          hint: 'The king’s only neighbours are its own pieces. Which knight check cannot be captured?',
          success:
            '**Nxf7#**: the knight takes a pawn with check. The rook on g8 and the pawns on g7 and h7 block every square, and nothing can capture the knight.',
          why:
            'The smothered mate again, in its shortest form. **Ng6+** gives check too, but the f7 and h7 pawns can ' +
            'both capture on g6. The mating square is the one nothing can take. When you give a check, ask first ' +
            'what can capture the checking piece.',
          wrong: {
            'Ng6+': {
              text: 'A check, but the knight can be captured by the f7 pawn or the h7 pawn: **hxg6**. A mating check has to come from a square nothing can take.',
              refute: 'hxg6',
            },
          },
          failure: 'Not mate. Find the knight check from a square that no black piece can capture.',
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
      'The square of the pawn, the opposition and the rook-pawn draw: win the won endings and hold the drawn ones.',
    minutes: 12,
    steps: [
      {
        title: 'The square of the pawn',
        text:
          'A king can catch a runaway pawn only if it can step into the pawn’s **square**: the square whose side ' +
          'runs from the pawn to its queening square. When it is the king’s turn and it can step inside, the pawn ' +
          'is caught. If it cannot, the pawn queens.\n\n' +
          'Your king is far away on a8, so the g-pawn must run alone, and the black king on a3 is already on its ' +
          'way. A pawn on its starting rank may take one step or two, and the choice changes the square by a whole ' +
          'file.',
        fen: 'K7/8/8/8/8/k7/6P1/8 w - - 0 1',
        shapes: ['c4:blue', 'c8:blue', 'g8:blue', 'g4:blue'],
        task: {
          prompt: 'Which pawn move leaves the black king outside the pawn’s square?',
          moves: ['g4'],
          hint: 'Count the squares from the pawn to g8 for each push, then see how many files the black king needs to reach the square. Black moves next.',
          success:
            '**g4**: the double step puts the pawn four squares from g8, and the square it makes spans the c- to g-files. The black king on a3 cannot reach it in one move.',
          why:
            'After **g4** the black king is outside the square whatever it does: Kb4 g5, Kc5 g6, Kd6 g7, and the ' +
            'pawn queens with the king one step short. After **g3** the square is one size bigger and **Kb4** steps ' +
            'inside it, so the pawn is caught. Count the square before you push, and use the double step from the ' +
            'second rank.',
          wrong: {
            g3: {
              text: 'One step leaves the pawn five moves from queening, and the square now reaches the b-file. Black steps inside with **Kb4**, the king catches the pawn, and the game is drawn. Look at what the double step gains.',
              refute: 'Kb4',
            },
          },
          failure:
            'The pawn is the runner here. Count the squares from the pawn to g8 and see whether the black king can step into the square.',
        },
      },
      {
        title: 'Take the opposition',
        text:
          'You are a pawn up, but a pawn does not win by itself. The black king stands on the pawn’s file, and if ' +
          'you push **e5** it simply steps to e6 and blocks the way. Your king has to get ahead of the pawn first, ' +
          'and the two kings meet there.\n\n' +
          'That is the **opposition**. When the kings face each other on a file with one square between them, the ' +
          'player who has to move must give way, and a king that gives way lets the other through. The squares d6, ' +
          'e6 and f6 are the **key squares** of this pawn: a white king on any of them wins.',
        fen: '8/4k3/8/8/3KP3/8/8/8 w - - 0 1',
        shapes: ['d6:blue', 'e6:blue', 'f6:blue'],
        task: {
          prompt: 'Which move wins the game?',
          moves: ['Ke5'],
          hint: 'The pawn can wait. Find the square where your king faces the black king, one square between them, with Black to move.',
          success:
            '**Ke5**: the king steps in front of the pawn and faces the black king, one square between them. It is Black’s turn, so Black must give way.',
          why:
            'The king goes first, not the pawn. **Kd5** lets Black answer **Kd7**, and now it is you who must give ' +
            'way: e5 Ke7, and the pawn gets nowhere. **e5** runs into **Ke6**, and your king cannot pass. With the ' +
            'kings facing each other, the side that is not to move wins the fight for squares. The pawn is only ' +
            'the prize.',
          wrong: {
            Kd5: {
              text: 'It looks natural, but Black answers **Kd7**, and now the kings face each other with you to move. You must give way, and e5 Ke7 e6 Ke8 leaves the pawn stuck short of the queening square.',
              refute: 'Kd7',
            },
            e5: {
              text: 'The pawn runs into **Ke6** and cannot move. Your king is stuck behind it, because the black king covers d5 and f5. The pawn went forward before the king got in front of it.',
              refute: 'Ke6',
            },
          },
          failure:
            'The king has a job before the pawn does. Which square puts it in front of the pawn, facing the black king, with Black to move?',
          reply: 'Kf7',
          replyNote:
            'Black has to move, and every king move gives ground. The king steps aside to f7, and the way along the d-file is open.',
          then: {
            prompt: 'Reach a key square: d6, e6 or f6. Which king move gets there?',
            moves: ['Kd6'],
            hint: 'Kings may never stand next to each other. Check which of the three squares your king can step to without touching the black king.',
            success:
              '**Kd6**: the king reaches a key square. The other two, e6 and f6, touch the black king, so d6 is the only one open to you.',
            why:
              'From d6 the king leads the pawn home and Black cannot stop it: Kf8 Kd7 Kf7 e5, and the pawn marches. ' +
              '**Kf5** and **Kd5** also win here, but a king on a key square needs no further care. Take the ' +
              'opposition, reach a key square, then push the pawn.',
            wrong: {
              Kf5: 'That wins too, but this question asks for a key square. **Kd6** gets there at once, and a king on the sixth rank cannot be shut out.',
              Kd5: 'That wins too, but this question asks for a key square. **Kd6** gets there at once, and a king on the sixth rank cannot be shut out.',
            },
            failure:
              'Look at the three key squares, d6, e6 and f6. Which of them can your king reach without touching the black king?',
          },
        },
      },
      {
        title: 'Hold the opposition',
        text:
          'Now sit on the other side. You are Black, a pawn down, and the white king stands on e5, in front of its ' +
          'pawn. If it reaches d6, e6 or f6, the game is lost, so the whole defence is the opposition: keep your ' +
          'king facing the white king, one square between, with White the one to move.\n\n' +
          'It is a defender’s job, and it needs accuracy rather than tricks: in this line every move you make is ' +
          'the only one that holds the draw.',
        fen: '4k3/8/8/4K3/4P3/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['d6:red', 'e6:red', 'f6:red'],
        task: {
          prompt: 'Which move holds the draw?',
          moves: ['Ke7'],
          hint: 'White’s king is on the pawn’s file. Which square keeps your king facing it, with one square between, so that White must move?',
          success:
            '**Ke7**: your king faces the white king with one square between. White has to move, so White must give way.',
          why:
            'This is the opposition from the defender’s side. **Kd7** lets **Kf6** in, and from f6 the white king ' +
            'is on a key square. **Kf8** lets **Ke6** in. Only from e7 do you cover d6, e6 and f6 together. ' +
            'A defender keeps the king on the pawn’s file, in front of the attacking king.',
          wrong: {
            Kd7: {
              text: 'Stepping aside lets the white king round the other way: **Kf6** reaches a key square, and the pawn walks home. Your king must stay on the pawn’s file.',
              refute: 'Kf6',
            },
            Kf8: {
              text: 'Backing away along the back rank lets White in: **Ke6** reaches a key square at once, and you are a step too far to stop the pawn.',
              refute: 'Ke6',
            },
          },
          failure:
            'The white king is ahead of its pawn. Which square keeps your king facing it with one square between, so that White is the one to move?',
          reply: 'Kd5',
          replyNote:
            'White tries to slip past on the side. The kings no longer face each other, and the white king is a step from the key squares d6 and e6.',
          then: {
            prompt: 'White stepped aside. How do you answer?',
            moves: ['Kd7'],
            hint: 'Copy White’s move: step to the same side, so that the kings face each other again with one square between.',
            success:
              '**Kd7**: your king steps to the same side and faces the white king again. White has to move, so White must give way.',
            why:
              'Copying the attacking king keeps the opposition, and the key squares stay out of reach. **Kf6** would ' +
              'let **Kd6** in, and **Ke8** lets White in with **Ke6**: either way the white king reaches a key ' +
              'square and the pawn follows. Mirror the king, and never leave its file for a square it can use.',
            wrong: {
              Kf6: {
                text: 'That steps past the pawn’s file, and **Kd6** wins at once: the white king stands on a key square and yours is on the wrong side of it. Face the white king instead.',
                refute: 'Kd6',
              },
              Ke8: {
                text: 'Backing off lets the white king through: **Ke6** reaches a key square, and you can no longer face it. Keep one square between the kings.',
                refute: 'Ke6',
              },
            },
            failure:
              'White has stepped to the side. Your king must follow, so that the kings face each other again with one square between.',
            reply: 'e5',
            replyNote:
              'The pawn steps up beside the white king. From d7 your king no longer covers f6, so it has to go back in front of the pawn.',
            then: {
              prompt: 'The pawn has advanced. Where does your king go?',
              moves: ['Ke7'],
              hint: 'The pawn on e5 makes d6, e6 and f6 the squares to guard. Which single square covers all three?',
              success:
                '**Ke7**: from e7 the king guards d6, e6 and f6 together and stands in front of the pawn. White cannot make progress.',
              why:
                'The pawn has moved on, so your king goes back in front of it. If White now plays **e6**, **Ke8** keeps ' +
                'the draw. Mirror the attacking king sideways, return to the pawn’s file when the pawn advances, and ' +
                'the white king never reaches a key square.',
              failure:
                'The pawn has stepped up. Which square covers d6, e6 and f6 together and stands in front of the pawn?',
            },
          },
        },
      },
      {
        title: 'A pawn on the edge',
        text:
          'An extra pawn does not always win. A pawn on the a- or h-file is the exception: its king can only ' +
          'approach from one side, and the defender has a refuge in the corner. A king that reaches it can usually ' +
          'hold the draw, because driving it out risks stalemate.\n\n' +
          'You are Black. The white king stands on g6, in front of its h-pawn, and the pawn needs three moves to ' +
          'queen. Your king is on e8, and the corner is a long way off. Where it goes now decides whether you ' +
          'lose or draw.',
        fen: '4k3/8/6K1/7P/8/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['h5h8:red', 'h8:blue'],
        task: {
          prompt: 'Which move saves the game?',
          moves: ['Kf8'],
          hint: 'Think of where the pawn is heading, and where your king would be safe. Which move heads for those squares?',
          success:
            '**Kf8**: the king heads for g8 and the corner. It is the only one of your four moves that arrives in time.',
          why:
            'Every other move leaves the corner behind and loses: **Ke7** h6, and the pawn queens, because your king ' +
            'is too far from the corner. From f8 you reach g8 in time, and then the pawn cannot pass. With a rook ' +
            'pawn, bring your king to the corner or in front of the pawn.',
          wrong: {
            Ke7: {
              text: 'It runs away from the corner. **h6** and the pawn is too fast: your king is out of range of g8 and h8, and the pawn queens.',
              refute: 'h6',
            },
          },
          failure:
            'The pawn needs only three moves to queen. Look for the king move that brings you closest to the squares in front of it.',
          reply: 'h6',
          replyNote:
            'White pushes on. Next comes h7, and then h8. Your king has one move to get in front of the pawn.',
          then: {
            prompt: 'The pawn is on h6. Where does your king go?',
            moves: ['Kg8'],
            hint: 'The pawn wants h7 and h8. Which move puts your king in its way?',
            success:
              '**Kg8**: the king stands in front of the pawn. When it reaches h7 it gives check, and the king steps into the corner.',
            why:
              '**Ke7** and **Ke8** let the pawn through: h7, and it queens. From g8 you meet h7 with Kh8, and the ' +
              'white king on g6 has nothing to attack. Never run from a rook pawn: sit in front of it.',
            wrong: {
              Ke7: {
                text: 'The king runs away from the corner, and **h7** is unstoppable: the pawn queens next move. A pawn on h6 can only be stopped from g8 or h8.',
                refute: 'h7',
              },
            },
            failure:
              'The pawn needs h7 and h8. Look for the move that puts your king in front of it.',
            reply: 'h7+',
            replyNote:
              'The pawn gives check. The king has two squares to choose from, and only one of them keeps the game.',
            then: {
              prompt: 'The pawn checks from h7. Where does the king go?',
              moves: ['Kh8'],
              hint: 'One of the two squares lets the pawn queen with check. The other leaves White with a problem.',
              success:
                '**Kh8**: the king sits on the pawn’s queening square, so it cannot promote. Whatever White does now is a draw: **Kh6** is stalemate, and any other king move lets Black take the pawn.',
              why:
                'White is in a bind: the pawn on h7 needs the king on g6 to protect it, yet the king has to move. ' +
                'Stalemate or a lost pawn, and either way a draw. A defender who reaches the corner in front of a rook ' +
                'pawn draws, so before you trade into a pawn ending, count how far each king is from it.',
              wrong: {
                Kf8: {
                  text: 'That lets the pawn queen with check: **h8=Q+**, and you are lost. The king had to go to the corner, not away from it.',
                  refute: 'h8=Q+',
                },
              },
              failure:
                'The pawn gives check from h7. Only one of the king’s squares keeps it from queening.',
            },
          },
        },
      },
    ],
    practiceThemes: ['pawnEndgame'],
  },

  {
    id: 'rook-endgames',
    title: 'Rook endgames: Lucena and Philidor',
    level: 'intermediate',
    category: 'Endgames',
    summary:
      'The two positions that decide most rook endings, one won and one drawn, and the rule for where the rook belongs.',
    minutes: 12,
    steps: [
      {
        title: 'The Lucena position',
        text:
          'You are White, a pawn up in the most famous winning position in rook endings. The pawn stands ' +
          'on c7, your king sits in front of it on c8, and your rook cuts the black king off along the d-file. The ' +
          'pawn cannot queen while the king blocks it, and when the king steps aside, the black rook checks it.\n\n' +
          'This is the **Lucena position**. It is won, but only with a plan: the **bridge**. You put your rook on ' +
          'the fourth rank, walk the king out of the pawn’s shelter, and when the checks run out, the rook steps ' +
          'between the king and the checking rook.',
        fen: '2K5/2P2k2/8/8/8/8/r7/3R4 w - - 0 1',
        shapes: ['d1d8:blue', 'c7c8:red'],
        task: {
          prompt: 'Which rook move starts the bridge?',
          moves: ['Rd4'],
          hint: 'The bridge is built on the fourth rank, and the rook must keep the black king cut off while it goes there.',
          success:
            '**Rd4**: the rook climbs to the fourth rank and stays on the d-file, so the black king is still cut off.',
          why:
            'The rook on the fourth rank is your shelter: when the king walks out and the black rook checks from ' +
            'the side, you can block with it. Many moves win here, so what matters is the method. This is the one ' +
            'that you can repeat in a game without calculating.',
          wrong: {
            Kd7: 'That wins as well, but it is a different method. This step builds the fourth-rank bridge, because it works in every Lucena position, wherever the black king stands.',
          },
          failure:
            'Other moves may win too, but this step is about the bridge: the rook goes to the fourth rank, and the black king must stay cut off.',
          reply: 'Ra1',
          replyNote:
            'Black’s rook goes to the first rank, ready to check your king from the side as soon as it steps out. It is the classic defence, though not the toughest: Black is lost whatever it plays.',
          then: {
            prompt: 'How does the king leave the pawn’s shelter?',
            moves: ['Kb7'],
            hint: 'Keep the pawn protected: the king can go to b7, b8, d7 or d8. Which of them starts the walk down the b-file?',
            success:
              '**Kb7**: the king steps out and still guards the pawn on c7. From here it can walk down the board, one step at a time.',
            why:
              'The king has to come down the board to meet the rook, and the black rook will check it at every ' +
              'step. Staying beside the pawn keeps the pawn safe while the checks push the king down the board. ' +
              '**Kd7** and **Kd8** win too, but this is the walk you can repeat.',
            wrong: {
              Kd7: 'That wins as well. This step teaches the textbook walk, down the b- and c-files, because it works in every Lucena position.',
            },
            failure:
              'The king must leave c8 while the pawn stays protected. Which square next to the pawn starts the walk down the board?',
            reply: 'Rb1+',
            replyNote:
              'Black checks from the side, as expected. This is the rhythm of the whole technique: step, check, step.',
            then: {
              prompt: 'Which king move answers the check and heads down the board?',
              moves: ['Kc6'],
              hint: 'The black rook checks along the b-file. Step off it, but stay beside the pawn and head for your rook.',
              success:
                '**Kc6**: the king leaves the b-file, keeps guarding the pawn on c7, and comes one step closer to the rook on d4.',
              why:
                'Each check pushes the king to the other file, and it zigzags down the board towards your rook. The block ' +
                'comes later, when the king stands beside the rook. **Rb4** now would be taken with check, and the ' +
                'game is a draw.',
              wrong: {
                Rb4: {
                  text: 'It offers a block at once, but the black rook simply takes it with check, and the king cannot recapture. Walk the king first, and block only when the king is beside the bridge.',
                  refute: 'Rxb4+',
                },
              },
              failure:
                'Step out of the check along the b-file. Which square also keeps the pawn guarded and takes the king down the board?',
            },
          },
        },
      },
      {
        title: 'Crossing the bridge',
        text:
          'Black’s rook has checked you again, this time along the c-file. Your king has left the shelter of the ' +
          'pawn, and your own rook still waits on the fourth rank. Black’s king is cut off on f7, so the checks are ' +
          'Black’s only hope.\n\n' +
          'Keep walking in step with the checks. Every square the king takes must still guard the pawn, until it ' +
          'stands next to the rook. Then the rook can step in, and the checks are over.',
        fen: '8/2P2k2/2K5/8/3R4/8/8/2r5 w - - 0 1',
        shapes: ['c1c6:red', 'd4c4:blue'],
        task: {
          prompt: 'Which king move answers the check and keeps the walk going?',
          moves: ['Kb6'],
          hint: 'Go back to the b-file, one rank further down: the king still guards the pawn and gets closer to your rook.',
          success:
            '**Kb6**: out of check, still guarding the pawn on c7, and one rank further down the board.',
          why:
            'The king zigzags down the board between the b- and c-files, and every step keeps the pawn protected. ' +
            '**Kd5** and **Kb5** leave it alone: Rxc7, and the game is drawn. The king stays beside the pawn until ' +
            'the bridge is ready.',
          wrong: {
            Kb5: {
              text: 'The king steps out of check, but the pawn is left alone: Rxc7 takes it, and the game is drawn.',
              refute: 'Rxc7',
            },
            Kb7: 'That wins as well, but it goes back up the board. The walk goes down: this step takes the king to b6.',
            Kd6: 'That wins as well, because the king stays beside the pawn. This step shows the textbook walk down the board towards your rook, which ends with the bridge.',
            Kd7: 'That wins as well, because the king stays beside the pawn. This step shows the textbook walk down the board towards your rook, which ends with the bridge.',
          },
          failure:
            'The black rook checks along the c-file. Answer with the king, and keep it beside the pawn on c7.',
          reply: 'Rb1+',
          replyNote:
            'The rook checks again, now along the b-file. Black has nothing else to try: the rook is the only piece that can bother your king.',
          then: {
            prompt: 'Which king move brings the king next to your rook?',
            moves: ['Kc5'],
            hint: 'Step out of the check towards your rook: the king wants to stand beside it on the fifth rank.',
            success: '**Kc5**: the king steps next to the rook on d4, so the bridge is ready.',
            why:
              'From c5 the king and the rook are neighbours, which is exactly what the bridge needs. **Rb4** now ' +
              'would be taken with check, and the king cannot recapture. Walk with the checks, and wait to block ' +
              'until the king can protect the rook.',
            wrong: {
              Rb4: {
                text: 'It blocks the check at once, but the black rook takes it with check and the king cannot recapture. Without your rook the winning chances are gone.',
                refute: 'Rxb4+',
              },
              Kc6: '**Kc6** goes back to the position you started this step from: Rc1+ checks again, and you have made no progress. Step towards your rook instead.',
            },
            failure:
              'Step out of the check towards your rook, not away from it. The king wants to end up beside the rook on the fourth rank.',
            reply: 'Rc1+',
            replyNote:
              'Black checks one more time along the c-file. This is the check that the bridge was built for.',
            then: {
              prompt: 'How do you stop the checks?',
              moves: ['Rc4'],
              hint: 'Your rook is on the fourth rank, next to your king. Which square puts it between the king and the black rook?',
              success:
                '**Rc4**: the rook steps between the checking rook and the king, and the king protects it. The checks are over.',
              why:
                'Now the pawn cannot be stopped: if Black takes, Rxc4+ Kxc4 and the pawn queens, because the black ' +
                'king is too far away. **Kd6** and **Kb6** win as well, but the bridge ends the checks at once. ' +
                'Remember the plan: a rook on the fourth rank, and the king walks down to meet it.',
              wrong: {
                Kb5: {
                  text: 'The king steps out of check, but the pawn is left alone: Rxc7 takes it, and the game is drawn.',
                  refute: 'Rxc7',
                },
                Kd6: 'That wins as well: the king stands beside the pawn and the rook can shield it. But the bridge is clearer, because it ends the checks at once.',
                Kb6: 'That wins too, but it is less clear. The bridge ends the checks at once and leaves Black nothing to try.',
              },
              failure:
                'Your king is in check from the rook on the c-file. Use the rook beside it to end the checks, instead of running away from them.',
            },
          },
        },
      },
      {
        title: 'The Philidor position',
        text:
          'Now the other side of the coin. You are Black, a pawn down, and White’s pawn has just reached e6. Your ' +
          'king is in front of it on e8. While the pawn stood on the fifth rank, your rook on the sixth rank kept ' +
          'the white king from stepping forward, and that was the first half of the defence.\n\n' +
          'Now the pawn stands on the sixth rank itself, and the rook’s job changes. This is the **Philidor ' +
          'position**, and it is a draw if you know what to do with the rook now.',
        fen: '4k3/8/r3P3/3K4/7R/8/8/8 b - - 0 1',
        orientation: 'black',
        shapes: ['a6a1:blue', 'd5d6:red'],
        task: {
          prompt: 'The pawn has reached the sixth rank. Where does your rook go?',
          moves: ['Ra1'],
          hint: 'Go to the far end of the board, behind the white king, where the rook can check it from behind.',
          success:
            '**Ra1**: the rook goes behind the white king, as far from it as possible, ready to check from behind.',
          why:
            'Once the pawn reaches the sixth rank, the rook belongs behind the king: Kd6 Rd1+, and the king never ' +
            'finds shelter. **Rxe6** loses the rook to Kxe6, and a lone king cannot hold against king and rook. ' +
            'Hold the sixth rank while the pawn is behind it, and go behind the king when the pawn arrives there.',
          wrong: {
            Rxe6: {
              text: 'The pawn is protected by the king: **Kxe6** takes the rook, and with no rook left you cannot hold king against king and rook. Never grab a pawn that the king protects.',
              refute: 'Kxe6',
            },
          },
          failure:
            'Several moves hold the draw here, but this step teaches the checks from behind. Where is the rook furthest from the white king?',
          reply: 'Kd6',
          replyNote:
            'White’s king steps forward and threatens Rh8, which would be mate. Black has to keep checking.',
          then: {
            prompt: 'White threatens Rh8, which would be mate. How do you answer?',
            moves: ['Rd1+'],
            hint: 'You need a check that cannot be ignored. Your rook is far behind the white king: use it.',
            success:
              '**Rd1+**: the rook checks from behind along the d-file, and the king has to step away.',
            why:
              'The check stops the mate at once and chases the king away from the pawn. From behind, the checks never ' +
              'run out, because the king has no shelter. **Ra6+** also holds the draw, but it checks from the side. ' +
              'The checks from behind are the method that is easy to repeat.',
            wrong: {
              'Ra6+': {
                text: 'That check holds the draw too, but it comes from the side. The checks from behind are the method that is easy to repeat, and the king finds no shelter from them.',
              },
            },
            failure:
              'White threatens Rh8, which would be mate. Look for a check from behind that the king cannot ignore.',
          },
        },
      },
      {
        title: 'Rooks behind passed pawns',
        text:
          'One more rule fits in a sentence: **rooks belong behind passed pawns**. Tarrasch’s rule applies to your ' +
          'own pawn and to the enemy’s. A rook behind its own pawn protects it from a distance and supports every ' +
          'step it takes; a rook in front of it, or beside it, gets in the way.\n\n' +
          'Black’s rook stands in front of your a-pawn and attacks it, and your own rook is far away on h1. Your king ' +
          'is still some way off, so the pawn needs the rook’s help.',
        fen: 'r7/6k1/8/P7/3K4/8/8/7R w - - 0 1',
        shapes: ['a8a5:red', 'h1a1:blue'],
        task: {
          prompt: 'Your pawn is attacked and your king is far away. Where does the rook belong?',
          moves: ['Ra1'],
          hint: 'Put the rook where it protects the pawn from a distance without ever blocking it. Which end of the file?',
          success:
            '**Ra1**: the rook stands behind the pawn on the a-file, protects it from a distance and supports every step.',
          why:
            'Behind the pawn, the rook protects it and keeps its path clear, while Black’s rook in front can only ' +
            'watch. Now the king is free to march: Ra1 Kf7 Kc5 Ke6 Kb6, and the pawn is ready to run. Put the rook ' +
            'behind the pawn first, and bring the king afterwards.',
          wrong: {
            a6: {
              text: 'The pawn runs on alone: **Rxa6** takes it, and the rook ending is a draw. The pawn needs a protector before it advances.',
              refute: 'Rxa6',
            },
            Kc5: {
              text: 'The king is not near enough to protect the pawn: **Rxa5+** takes it with check. Look after the pawn with the rook first.',
              refute: 'Rxa5+',
            },
            Rh5: {
              text: 'That protects the pawn along the fifth rank, but only from the side, and the guard is gone as soon as the pawn advances. Behind the pawn, the rook keeps guarding it.',
            },
          },
          failure:
            'The pawn on a5 is attacked by the rook in front of it. Which end of the a-file would be the best home for your rook?',
        },
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
      'No tactic in sight? Put a rook on an open file or the seventh rank, plant a knight on an outpost and bring your worst piece into play.',
    minutes: 10,
    steps: [
      {
        title: 'Use the open file',
        text:
          'You are a pawn down, and Black has the two bishops, so a slow developing move is unlikely to ' +
          'help. Look instead at what Black has left behind. Neither side has an e-pawn, so the e-file is open, ' +
          'and Black’s king is still standing on it, with a bishop in front of it on e5.\n\n' +
          'A rook on an open file attacks whatever stands on it. Yours is one move from that file, and Black ' +
          'has not castled. Your knight on b1 still wants developing, but ask first whether the rook has ' +
          'something better to do.',
        fen: 'r3k2r/pb3ppp/1pp5/3pb3/8/2PB4/PP3PPP/RN3RK1 w kq - 2 16',
        shapes: ['e1e8:blue', 'e5:red'],
        task: {
          prompt: 'Which move makes the most of the open file?',
          moves: ['Re1'],
          hint: 'A rook on an open file attacks whatever stands on it. What stands on the e-file, and what is behind it?',
          success:
            '**Re1**: the rook takes the open file and pins the bishop on e5 to the king. The bishop cannot move, because that would leave Black’s king in check from the rook.',
          why:
            'Every other move leaves you a pawn down and lets Black castle out of trouble. **Re1** makes the ' +
            'bishop a target instead: a pinned piece cannot run, so you can attack it again. Before you ' +
            'develop, look for three things together: an open file, a king still on it, and a piece in the way.',
          wrong: {
            Nd2: {
              text: 'Natural development, but it gives Black time. After **O-O** his king has left the e-file, so the pin never happens and you are still a pawn down against two bishops.',
              refute: 'O-O',
            },
            f4: {
              text: 'The pawn attacks the bishop, but it simply steps away with **Bd6**. It has left the e-file before your rook arrived, so there is no pin, and the pawn on f4 is now a target.',
              refute: 'Bd6',
            },
          },
          failure:
            'Black is a pawn up with two bishops, so a quiet move will not do. The e-file is open and Black’s king is standing on it: use that.',
          reply: 'f6',
          replyNote:
            'Black defends the bishop with a pawn. But it is still pinned, and a pinned piece can be attacked again.',
          then: {
            prompt: 'How do you win the pinned bishop?',
            moves: ['f4'],
            hint: 'The bishop cannot move. Which of your pawns could attack it, and why is a pawn the ideal attacker?',
            success:
              '**f4**: the pawn attacks the pinned bishop. It cannot run, and the pawn on f6 is its only defender.',
            why:
              'A pawn is the best attacker of a pinned piece, because it is worth less than anything it can ' +
              'take. Black’s only way out of the pin is to move the king, and then **fxe5** wins the bishop ' +
              'anyway. Pin first, then add attackers: that is how a pinned piece is won.',
            failure:
              'The bishop is pinned and defended once, by the pawn on f6. Find a way to attack it that costs you less than the bishop is worth.',
            reply: 'Kf7',
            replyNote:
              'Black unpins by moving the king. It is too late: the bishop is attacked by a pawn and a rook and defended only by a pawn.',
            then: {
              prompt: 'The king has left the file. How do you win the bishop?',
              moves: ['fxe5'],
              hint: 'The pawn on f4 attacks e5. Taking with the pawn wins more than taking with the rook.',
              success:
                '**fxe5**: the pawn takes the bishop. Black can retake on e5, but a bishop for a pawn is a clear gain.',
              why:
                'You started a pawn down and have won a bishop for a pawn: a piece up for two pawns. The order was the lesson: rook to the ' +
                'open file first, while the king was still on it, and the pawn second. If you had developed ' +
                'first, Black would have castled and the chance would have gone.',
              failure:
                'The bishop is attacked twice and defended once. Which capture wins it for the least?',
            },
          },
        },
      },
      {
        title: 'The seventh rank',
        text:
          'Rooks love the seventh rank, which is Black’s second. That is where his pawns start, and where his ' +
          'king and pieces tend to get stuck. A rook there attacks them from the side, and the pieces on that ' +
          'rank have trouble guarding one another.\n\n' +
          'Count what stands on it here: Black’s king, both bishops and two pawns. You are a pawn down, but ' +
          'your bishop on b5 already guards a square on that rank, and the only black piece guarding it is ' +
          'the king.',
        fen: '1r4r1/1bb1kp1p/4pp2/1B2p3/2P1N3/8/5PPP/3RR1K1 w - - 1 24',
        shapes: ['b5e8:blue', 'e7:red', 'c7:red', 'b7:red'],
        task: {
          prompt: 'Which move makes use of the seventh rank?',
          moves: ['Rd7+'],
          hint: 'Your bishop on b5 guards one square on the seventh rank. Which rook can reach it, and what does it attack there?',
          success:
            '**Rd7+**: the rook lands on the seventh rank with check. The bishop on b5 guards d7, so the king cannot take it, and the rook attacks the bishop on c7.',
          why:
            'A supported rook on the seventh is a monster: the king must answer, and whatever shares the rank ' +
            'is attacked. Waiting with **h3** lets Black play …Rgd8 and take the d-file himself. When you can ' +
            'reach the seventh rank with check, ask first what that rook will attack.',
          wrong: {
            Nxf6: {
              text: 'The knight on e4 shields your g2 pawn from the bishop on b7. Once it leaves, **Rxg2+** wins a pawn with check, and your king is in danger. Ask what a piece is doing before you move it.',
              refute: 'Rxg2+',
            },
            h3: {
              text: 'A useful-looking move, but it gives Black a tempo for **Rgd8**. Then the d-file is his, and your chance to land a rook on the seventh rank has gone.',
              refute: 'Rgd8',
            },
          },
          failure:
            'You are a pawn down, so waiting favours Black. Look at the seventh rank: what stands on it, and which square on it do you already guard?',
          reply: 'Kf8',
          replyNote:
            'The king has two squares. …Ke8 is worse, because any move of the rook would then give a discovered check from the bishop on b5, so Black steps back to f8.',
          then: {
            prompt: 'The king has stepped back. What wins material now?',
            moves: ['Rxc7'],
            hint: 'Look along the seventh rank from d7. Which black piece stands next to your rook, and can anything take it back?',
            success:
              '**Rxc7**: the rook takes the bishop, and nothing can recapture on c7. It now attacks the bishop on b7 as well.',
            why:
              'Pieces lined up on one rank cannot guard each other, so the rook simply collects them. Black’s ' +
              'best is …Bxe4, taking the knight, but your other rook recaptures. **Rxf7+** instead loses the ' +
              'rook to the king: take what is free before you reach for pawns.',
            wrong: {
              'Rxf7+': {
                text: 'It is check and wins a pawn, but the king takes the rook: **Kxf7**. A rook for a pawn is a poor trade when a bishop was free next door.',
                refute: 'Kxf7',
              },
            },
            failure:
              'One black piece stands next to your rook with no defender. Take what is free first.',
            reply: 'Bxe4',
            replyNote:
              'Black takes the knight, the only compensation on offer. Your other rook is ready to recapture.',
            then: {
              prompt: 'Black has taken your knight. Which recapture keeps your extra piece?',
              moves: ['Rxe4'],
              hint: 'One rook attacks e4. The other should stay on the seventh rank.',
              success:
                '**Rxe4**: the rook on e1 takes the bishop, while the other rook stays on the seventh rank. You are a bishop up for a pawn.',
              why:
                'You came into this position a pawn down and leave it a bishop up, with a rook still on the ' +
                'seventh rank to collect more. The recipe: reach the seventh with support and check, take what ' +
                'is loose, and recapture with the piece that is not doing the invading.',
              wrong: {
                'Rxf7+': {
                  text: 'Another check that wins a pawn, but **Kxf7** takes the rook. Recapture the bishop first: your rook on e1 is doing nothing else.',
                  refute: 'Kxf7',
                },
              },
              failure:
                'Your knight was taken by a bishop, which now stands on e4. Take it back with the rook that is not on the seventh rank.',
            },
          },
        },
      },
      {
        title: 'Plant a knight on an outpost',
        text:
          'This is the Sveshnikov Sicilian. Black has played …e5 and …b5 to grab space, but that has left a ' +
          'permanent hole in his camp. His c-pawn has gone and his e-pawn stands on e5, so there is a square in ' +
          'the centre that no black pawn can ever attack, and your pawn on e4 supports it.\n\n' +
          'A square like that is called an **outpost**. A knight planted there cannot be chased away by a ' +
          'pawn, and from the middle of Black’s camp it hits b6, c7, e7 and f6. One of your knights can reach ' +
          'it at once.',
        fen: fenAfter(
          '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5',
        ),
        shapes: ['e5:red', 'e4:blue'],
        task: {
          prompt: 'Which move plants a knight on the outpost?',
          moves: ['Nd5'],
          hint: 'Look for a square that no black pawn can attack and that your pawn on e4 supports.',
          success:
            '**Nd5**: the knight lands on the outpost, supported by the pawn on e4 and out of reach of every black pawn. It also attacks the knight on f6.',
          why:
            'Only a piece can challenge a knight on a hole, and every trade costs Black something. Grabbing ' +
            'the pawn on b5 would only lose a knight. Look for the squares your opponent’s pawns have left ' +
            'behind, and put a knight on the best one.',
          wrong: {
            Naxb5: {
              text: 'Greedy: **axb5** takes the knight. You have swapped a knight for a pawn, and the outpost is still empty.',
              refute: 'axb5',
            },
            Ncxb5: {
              text: 'Greedy: **axb5** takes the knight. You have swapped a knight for a pawn, and the outpost is still empty.',
              refute: 'axb5',
            },
            Bxf6: 'A good move too: after **gxf6** the knight still lands on the outpost. This step is about the outpost itself, so go straight there.',
          },
          failure:
            'Black’s c-pawn has gone and his e-pawn is on e5. Find the square in the centre that no black pawn can attack and that your own pawn supports.',
          reply: 'Be7',
          replyNote:
            'Black adds a defender to the knight on f6 and is ready to trade on the outpost with …Nxd5. It is his best move here.',
          then: {
            prompt: 'Black’s knight on f6 can trade itself for yours. How do you stop that?',
            moves: ['Bxf6'],
            hint: 'Your bishop on g5 attacks the very knight that could capture on d5.',
            success:
              '**Bxf6**: the bishop takes the only black knight that could challenge the outpost. Black must recapture, and your knight stays where it is.',
            why:
              'Keep the outpost, and trade off the pieces that can challenge it. **Nxe7** would swap your best ' +
              'piece for a bishop and leave the square empty again. As long as the knight stays on d5, Black’s ' +
              'pieces have to work around it.',
            wrong: {
              Nxe7: 'Playable, but it gives up your best piece for a bishop, and the outpost is empty again. A knight on a permanent outpost is worth more; trade the challenger instead.',
              Be3: 'That lets Black trade on d5: **Nxd5** exd5 and his other knight jumps to d4. The outpost is gone and Black is at least equal. Remove the challenger instead of stepping aside.',
            },
            failure:
              'Black has a knight that can capture on d5. Find a way to remove it while your own knight stays where it is.',
            reply: 'Bxf6',
            replyNote:
              'Black retakes with the bishop. You have traded a bishop for a knight, and your knight is still on d5, attacking the bishop on f6.',
          },
        },
      },
      {
        title: 'Improve your worst piece',
        text:
          'There is no file to take, no outpost to occupy and no tactic in sight. A strong player still has a ' +
          'plan: find the piece that is doing the least, and give it a better job.\n\n' +
          'Go through your pieces. The bishop on c4 and the knight on f3 are active, a rook stands in the ' +
          'centre, and the pawns hold e4. The knight on b1 is the obvious candidate: it has not moved and does ' +
          'nothing from there. On the right route it could be on g3 in three moves, watching f5 and h5.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1 a6'),
        shapes: ['b1:red'],
        task: {
          prompt: 'Which move starts to bring the knight on b1 into play?',
          moves: ['Nbd2'],
          hint: 'From b1 the knight can go to a3 or d2. Which of the two leads towards the kingside?',
          success:
            '**Nbd2**: the knight leaves its starting square for d2, where it supports e4 and is one step from f1 and the kingside.',
          why:
            'The knight had no future on b1, so you give it one. The move to d2 is only the first stop; the ' +
            'route runs on to f1 and then g3. Quiet positions are won like this: not by one big move, but by ' +
            'improving the worst piece again and again.',
          wrong: {
            Na3: 'A knight on the rim covers only four squares, and none of them points at the kingside. It is a different square, not a better one.',
          },
          failure:
            'Find the piece that has not moved yet. It needs a square from which it can reach the kingside in a few moves.',
          reply: 'Ba7',
          replyNote:
            'Black retreats the bishop out of reach of d4 while keeping its diagonal towards f2. Nothing is under attack, so you can carry on with the plan.',
          then: {
            prompt: 'The knight on d2 blocks your bishop. Where does it go next?',
            moves: ['Nf1'],
            hint: 'The route is d2, then one more square, then g3. The middle square is on the first rank.',
            success:
              '**Nf1**: the knight steps back, clearing d2 for the bishop and eyeing both g3 and e3.',
            why:
              'A retreat can be progress when the next square is better. On d2 the knight blocked the bishop on ' +
              'c1 and could go nowhere useful; on f1 it frees the bishop and has two good squares ahead, g3 and ' +
              'e3.',
            failure:
              'The knight on d2 sits in front of the bishop. Which retreat on the first rank gives it a route to the kingside?',
            reply: 'h6',
            replyNote:
              'Black gives his king a flight square and rules out Bg5 and Ng5. It is a sensible waiting move, and it does not touch your plan.',
            then: {
              prompt: 'Where does the knight settle?',
              moves: ['Ng3'],
              hint: 'From f1 the knight can reach g3 in one move. What will it watch from there?',
              success:
                '**Ng3**: the knight arrives on g3, where it guards e4 and watches f5 and h5.',
              why:
                'In three quiet moves your worst piece has become one of your best, and nothing has been ' +
                'exchanged, attacked or lost. That is a plan, and it is available in almost every quiet ' +
                'position. Ask: which piece does least, and where does it want to go?',
              failure:
                'The knight is one step from its post. Which square on the g-file lets it guard e4 and watch f5 and h5?',
            },
          },
        },
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
      'Italian, Ruy Lopez, Sicilian, Caro-Kann, Queen’s Gambit, London and King’s Indian: the idea behind each, and the trap that goes with it.',
    minutes: 15,
    steps: [
      {
        title: 'The Italian Game',
        text:
          'Each side has played two moves, and the position is yours to shape. The Italian Game begins with a bishop ' +
          'move that points at f7, the one square Black’s king guards alone until he castles. Then the plan is simple ' +
          'and sound: **c3** and **d4** to build a big centre, castle, and bring out the rest.\n\n' +
          'That is why club players love it. There are few moves to learn, and the traps are real, for both sides.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6'),
        shapes: ['f1c4', 'c4f7:red'],
        task: {
          prompt: 'Which bishop move aims at f7?',
          moves: ['Bc4'],
          hint: 'Look along the diagonal that ends on f7, and find the square on it that your bishop can reach.',
          success:
            '**Bc4**: the bishop looks down the diagonal at f7, where only the king stands guard, and it eyes d5 in the centre as well.',
          why:
            'From c4 the bishop pressures f7 and d5 and clears f1 for castling. It is a developing move, which a pawn ' +
            'grab is not: **Nxe5** looks like free material, but the knight on c6 guards e5. Develop first, and take ' +
            'pawns when they really hang.',
          wrong: {
            Nxe5: {
              text: 'The pawn looks loose, but the knight on c6 guards it. Black simply recaptures, and you have given a knight for a pawn.',
              refute: 'Nxe5',
            },
            Bb5: '**Bb5** is the Ruy Lopez, the next step: a fine move, but it pressures the knight that guards e5 rather than the f7 square. Here we are playing the Italian.',
          },
          failure:
            'Think about what you want the bishop to attack: f7 is guarded only by the king. Which square gives the bishop that diagonal?',
          reply: 'Bc5',
          replyNote:
            'Black copies you. The bishop on c5 aims at f2, your own weak square, so both sides are playing for the same ideas. This is the Giuoco Piano, Italian for “quiet game”.',
          then: {
            prompt: 'Which pawn move prepares d4 and a pawn centre?',
            moves: ['c3'],
            hint: 'A pawn on d4 needs a friend beside it that can retake. Which pawn can stand next to it?',
            success:
              '**c3**: the pawn now supports **d4**, which will hit Black’s centre and attack the bishop on c5.',
            why:
              'Without c3, d4 can be met by exd4 and you cannot retake with a pawn, so your centre disappears. ' +
              'Resist **Ng5**: it hits f7 twice, but the black queen sees g5 across the empty e7 and f6 squares, ' +
              'and the knight has no protection.',
            wrong: {
              Ng5: {
                text: 'It attacks f7 twice, but the black queen looks straight at g5 along the diagonal. Nothing protects the knight, so Qxg5 simply wins it.',
                refute: 'Qxg5',
              },
              Nxe5: {
                text: 'Still no good: the knight on c6 guards e5, so Nxe5 Nxe5 leaves you a knight down for one pawn.',
                refute: 'Nxe5',
              },
              d4: '**d4** at once is playable, but after exd4 you cannot retake with a pawn. **c3** first keeps the centre in your hands.',
              b4: '**b4** is the Evans Gambit, a real opening: White gives a pawn for a quick centre, and the game stays level. This step plays the quieter **c3**.',
            },
            failure:
              'You want a pawn that can retake on d4 if Black captures there. Which pawn move prepares that?',
            reply: 'Nf6',
            replyNote:
              'Black develops and attacks your e4 pawn, so the fight is in the centre. The knight on f6 now blocks the queen’s diagonal to g5.',
            then: {
              prompt: 'Which pawn move strikes the centre and hits the bishop on c5?',
              moves: ['d4'],
              hint: 'The pawn you have just prepared can now go forward two squares. Which one attacks both the bishop and the e5 pawn?',
              success:
                '**d4**: the pawn attacks the bishop on c5 and the pawn on e5 at once, and if Black takes it, c3 lets you retake with a pawn.',
              why:
                'If Black takes, exd4 cxd4 Bb4+ Bd2 keeps your pawn on d4 and your centre intact. Notice the order: ' +
                'c3 first, then d4, because the pawn that retakes must already be waiting on c3.',
              wrong: {
                Nxe5: {
                  text: 'The same mistake again: the knight on c6 still guards e5, so you lose a knight for a pawn. The d-pawn is the piece to use now.',
                  refute: 'Nxe5',
                },
                d3: '**d3** is the quiet, solid way to play the Italian, and just as good. This step is about the plan with c3 and d4.',
              },
              failure:
                'Your c3 pawn was the preparation. Which pawn move now uses it to take space in the centre?',
            },
          },
        },
      },
      {
        title: 'The Ruy Lopez',
        text:
          'Same position, different plan. In the Ruy Lopez the bishop does not aim at f7. It goes after the knight on ' +
          'c6, the piece that guards e5, so Black has to think about the pawn in the centre.\n\n' +
          'There is no immediate threat. This is an opening of slow pressure, and it has been a main road of chess for ' +
          'centuries. It also holds a trap for the impatient, which you will meet in a moment.',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6'),
        shapes: ['f1b5', 'b5c6:red'],
        task: {
          prompt: 'Which bishop move puts pressure on the knight that defends e5?',
          moves: ['Bb5'],
          hint: 'Find the square on the bishop’s diagonal from which it attacks the knight on c6.',
          success:
            '**Bb5**: the bishop attacks the knight on c6, the defender of e5. Nothing is threatened yet, but Black must keep an eye on the e5 pawn.',
          why:
            'The bishop does not threaten to win anything by force, but if the c6 knight goes, e5 loses its guard. ' +
            'That slow pressure is the whole idea of the Ruy Lopez, and it is why Black almost always asks the ' +
            'bishop a question at once.',
          wrong: {
            Bc4: '**Bc4** is the Italian from the last step: a fine move, aimed at f7. Here the idea is to pressure the knight that guards e5.',
          },
          failure:
            'You want the bishop to attack the knight on c6, the defender of e5. Which square on its diagonal does that?',
          reply: 'a6',
          replyNote:
            'Black asks the bishop a question: take, retreat, or be captured. This is the Morphy Defence, and almost every Ruy Lopez player meets it.',
          then: {
            prompt: 'Your bishop is attacked. Which retreat keeps the pressure on c6?',
            moves: ['Ba4'],
            hint: 'Keep the bishop on the same diagonal, one step back, so that it still looks at the knight.',
            success:
              '**Ba4**: the bishop retreats along the same diagonal and still eyes the knight on c6, so the pressure on e5 stays.',
            why:
              'The a6 pawn makes you choose. **Ba4** keeps the pressure and keeps the bishop. The exchange **Bxc6** ' +
              'is playable but gives your bishop for a knight. The captures **Bxa6** and **Nxe5** both lose a piece: ' +
              'when a pawn attacks your bishop, retreat it, or trade it on purpose.',
            wrong: {
              Bxa6: {
                text: 'It takes a pawn, but the rook on a8 takes the bishop back, and you are a piece down for one pawn.',
                refute: 'Rxa6',
              },
              Nxe5: {
                text: 'This hopes to win the pawn while the knight on c6 is busy, but axb5 simply captures your bishop first.',
                refute: 'axb5',
              },
              Bxc6: 'The Exchange Variation is a perfectly good move. This step keeps the bishop, because a retreat to a4 holds the pressure on c6 and e5.',
            },
            failure:
              'The bishop is attacked by the a6 pawn. It must move, and you want it to keep eyeing the knight on c6. Which retreat does that?',
            reply: 'Nf6',
            replyNote:
              'Black develops and attacks the e4 pawn, the most natural move in this position.',
            then: {
              prompt: 'Your king is still in the centre. Which move brings it to safety?',
              moves: ['O-O'],
              hint: 'Think of the king and the rook on h1 together: one move can improve both.',
              success:
                '**O-O**: the king goes to g1 behind its pawns, and the rook comes to f1, ready for the centre.',
              why:
                'Castling first is the Ruy Lopez habit: the king is safe, the rook joins the game, and if Black grabs ' +
                'the pawn with **Nxe4**, d4 lets you win a pawn back. A knight grab on e5 loses the piece instead.',
              wrong: {
                Nxe5: {
                  text: 'The knight on c6 still guards e5. After Nxe5 Nxe5 you have lost a knight for a pawn, and the bishop on a4 does not change that.',
                  refute: 'Nxe5',
                },
                b3: {
                  text: 'It prepares Bb2, but it takes the b3 square away from your own bishop. After b5 the bishop on a4 has no retreat, and you lose a piece.',
                  refute: 'b5',
                },
                Bxc6: '**Bxc6** is playable, but it gives up your bishop for a knight. Castle first and keep the pressure on c6.',
                d4: '**d4** is a good move too: after exd4 O-O Be7 e5 Ne4 Nxd4 you have the pawn back and an active game. This step castles first, the quieter main line.',
              },
              failure:
                'Your king is still on e1 and your rook on h1 is out of play. Which move deals with both?',
            },
          },
        },
      },
      {
        title: 'The Sicilian Defence',
        text:
          'You are Black, and White has opened with the king’s pawn. Instead of copying with …e5, the Sicilian answers ' +
          'with a flank pawn that attacks d4, the square White’s d-pawn wants. Black gives up a wing pawn for White’s ' +
          'central one and gets a half-open c-file for the rooks.\n\n' +
          'The game is unbalanced on purpose: White usually has more space and an attack on the kingside, Black has ' +
          'the queenside and the counter-punch. That is why strong players pick it when they play for a win.',
        fen: fenAfter('1. e4'),
        orientation: 'black',
        shapes: ['c7c5', 'c5d4:blue'],
        task: {
          prompt: 'Which pawn move fights for d4 from the flank?',
          moves: ['c5'],
          hint: 'Look for a pawn that eyes d4 from the side, so that it can trade itself for White’s centre pawn.',
          success:
            '**c5**: the pawn attacks d4 and starts the fight for the centre from the flank, keeping the e-pawn at home for later.',
          why:
            'The Sicilian trades a wing pawn for White’s d-pawn: after …cxd4 Black has a half-open c-file and a healthy ' +
            'central pawn, and the game is not symmetrical. That makes it the choice for players who want winning ' +
            'chances, and the opening you will meet most often against 1. e4.',
          wrong: {
            e5: '**e5** is a good, solid reply too, and the natural way to meet the king’s pawn. This step is about the Sicilian, which fights for d4 from the flank.',
          },
          failure:
            'You want a pawn that attacks d4 without standing in the centre. Which pawn move does that?',
          reply: 'Nf3',
          replyNote:
            'White develops and prepares d4. This is the most common move by far, and the Open Sicilian is coming.',
          then: {
            prompt: 'Which pawn move prepares a knight on f6 and takes e5 away from White?',
            moves: ['d6'],
            hint: 'A pawn that guards e5 and opens the diagonal of the c8 bishop.',
            success:
              '**d6**: the pawn guards e5, so White’s e-pawn cannot advance with a gain of time, and the c8 bishop gets its diagonal.',
            why:
              'Black wants …Nf6 to hit e4, and d6 stops e5 from coming with tempo. Pushing **d5** at once is too ' +
              'early: White takes, and Nc3 chases the queen away. **e5** simply drops a pawn to Nxe5. Prepare, then ' +
              'strike.',
            wrong: {
              d5: 'Too early. White takes with exd5, and after Qxd5 Nc3 chases the queen away with a gain of time. Prepare the centre first.',
              e5: {
                text: 'The e5 pawn has no defender yet, so Nxe5 wins it for nothing. A pawn that guards e5 has to come first.',
                refute: 'Nxe5',
              },
              Nc6: '**Nc6** is a good move too, and very common. This step prepares …Nf6 with d6 first, which also takes e5 away from White.',
            },
            failure:
              'You want a pawn move that guards e5 and prepares the knight. Which pawn move does both?',
            reply: 'd4',
            replyNote:
              'White opens the centre. This is what Black has been waiting for: the c-pawn can now trade itself for White’s d-pawn.',
            then: {
              prompt: 'Which capture trades your wing pawn for White’s d-pawn?',
              moves: ['cxd4'],
              hint: 'Your c-pawn attacks the pawn on d4. Take it, and White has to recapture with a piece.',
              success:
                '**cxd4**: Black trades the c-pawn for White’s d-pawn, so White must recapture with a piece, and the c-file is half-open for the rooks.',
              why:
                'After Nxd4 Nf6 Nc3 a6 you are in the Najdorf, one of the most popular Sicilians. Black has traded a ' +
                'wing pawn for a central one, owns a half-open file and has a flexible game. The trade is the whole ' +
                'point of …c5, so make it.',
              wrong: {
                e5: {
                  text: 'This loses a pawn: dxe5 dxe5 Qxd8+ Kxd8 Nxe5, and the king has lost the right to castle as well.',
                  refute: 'dxe5',
                },
                Nf6: '**Nf6** is a good move too: after Nc3 cxd4 Nxd4 the game reaches the same position. This step plays the capture first.',
              },
              failure:
                'The c-pawn attacks the pawn on d4. Which capture does the whole Sicilian plan rely on?',
            },
          },
        },
      },
      {
        title: 'The Caro-Kann Defence',
        text:
          'You are Black again. The Caro-Kann is solid: the c-pawn backs up …d5, and compared with the French ' +
          '(1…e6) it has one big plus. The bishop on c8 is not locked in behind a pawn on e6, so it can come out first.\n\n' +
          'White has defended the e4 pawn with a knight, and Black’s plan is to trade it off and then develop ' +
          'calmly. The line has a famous trap, and it catches players who play the natural developing move.',
        fen: fenAfter('1. e4 c6 2. d4 d5 3. Nc3'),
        orientation: 'black',
        shapes: ['d5e4', 'c8h3:blue'],
        task: {
          prompt: 'Which move trades off White’s e4 pawn?',
          moves: ['dxe4'],
          hint: 'Your d-pawn attacks the pawn on e4, and the knight on c3 is its only defender.',
          success:
            '**dxe4**: the pawn takes on e4, and after Nxe4 the c8 bishop still has its whole diagonal, from c8 to h3, free.',
          why:
            'Taking on e4 clears the centre: White’s knight must retake, and Black keeps a sound pawn structure. Do ' +
            'not hurry the bishop out with **Bf5** first, because the e4 pawn takes it. Trade first, then develop.',
          wrong: {
            Bf5: {
              text: 'The e4 pawn attacks f5, so exf5 wins the bishop for nothing. The bishop comes out after the pawn on e4 has been traded off.',
              refute: 'exf5',
            },
            Nf6: {
              text: 'White answers e5, attacking the knight with a pawn, and the knight must retreat. White gains space and time. Trade on e4 first.',
              refute: 'e5',
            },
            c5: {
              text: 'The c6 pawn is what supports d5. After exd5 nothing can retake, because Qxd5 runs into Nxd5, and you are a pawn down for nothing.',
              refute: 'exd5',
            },
          },
          failure:
            'Your d5 pawn can capture on e4. Which capture starts the plan of trading White’s centre pawn?',
          reply: 'Nxe4',
          replyNote:
            'The knight retakes and lands on a strong central square. Now Black develops a knight and prepares to challenge it.',
          then: {
            prompt: 'Which knight move prepares to meet Nxf6+ with a knight, not a pawn?',
            moves: ['Nd7'],
            hint: 'If the g8 knight goes to f6 first, a trade there leaves doubled pawns. Which other knight move prepares the same square?',
            success:
              '**Nd7**: the queenside knight prepares …Ngf6, so a trade on f6 can be answered by a knight and the pawns stay intact.',
            why:
              'With the knight on d7, Black plays …Ngf6 next and recaptures on f6 with a knight. **Nf6** at once is ' +
              'good too, but after Nxf6+ exf6 the pawns are doubled, in return for open lines. Both are sound, and ' +
              'this one comes with a trap you must know.',
            wrong: {
              Nf6: '**Nf6** is a good move too. After Nxf6+ exf6 Black accepts doubled pawns for open lines. This step shows the other way, with the b8 knight.',
              Bf5: '**Bf5** is the classical main line, and a fine move. The trap this step shows comes after Nd7.',
            },
            failure:
              'Black wants to recapture on f6 with a knight. Which knight move prepares that?',
            reply: 'Qe2',
            replyNote:
              'The queen steps out and sets a trap. Look at the e-file: queen, knight, pawn, king. Black’s most natural developing move now loses at once.',
            then: {
              prompt: 'Which developing move is safe here?',
              moves: ['Ndf6'],
              hint: 'Look at the e-file: White’s queen, knight, your pawn and your king. What could the knight do with check?',
              success:
                '**Ndf6**: the knight leaves d7 and opens the d-file, so Nd6+ can now be answered by Qxd6. The mate is gone and a piece is developed.',
              why:
                'Ngf6?? walks into a smothered mate. When the knight jumps to d6 with check, the e-file opens, the e7 ' +
                'pawn is pinned by the queen, the d7 knight blocks the queen, and every flight square is taken. ' +
                'Before a developing move, look for knight checks against your king.',
              wrong: {
                Ngf6: {
                  text: 'The natural move, and the trap. Nd6 is checkmate: the pinned e-pawn cannot take, the knight on d7 blocks the queen, and the king has no square.',
                  refute: 'Nd6#',
                },
                Qc7: '**Qc7** also stops the mate, because the queen guards d6, and it is a fine move. This step wants the knight development.',
                e6: '**e6** also stops the mate, since the f8 bishop can now take on d6. But it locks the c8 bishop in behind the pawn, which is what the Caro-Kann avoids.',
              },
              failure:
                'White’s last move is a trap. Check which knight move gives check, and whether your king could answer it.',
            },
          },
        },
      },
      {
        title: 'The Queen’s Gambit',
        text:
          'The Queen’s Gambit offers a pawn that White can always win back: 1. d4 d5 2. c4 dxc4 3. e3 Nf6 4. Bxc4, ' +
          'and White owns the centre. Here Black declined with …e6, the main reply, and both sides have developed a ' +
          'knight.\n\n' +
          'White’s usual idea is to pile pressure on d5 by pinning the knight on f6, its main defender. One famous ' +
          'trap belongs to this position, and it is set for the player who grabs a pawn too quickly.',
        fen: fenAfter('1. d4 d5 2. c4 e6 3. Nc3 Nf6'),
        shapes: ['c1g5', 'f6d8:red'],
        task: {
          prompt: 'Which bishop move pins the knight on f6 to the queen?',
          moves: ['Bg5'],
          hint: 'Look for the square on the c1 bishop’s diagonal from which it attacks the knight, with the queen behind it.',
          success:
            '**Bg5**: the bishop pins the knight on f6 against the queen on d8, so the main defender of d5 cannot move freely.',
          why:
            'Bg5 develops a piece with a threat: if the knight on f6 goes, d5 loses a guard. Pinning a defender is ' +
            'a better habit than attacking the pawn it guards, and this pin is the backbone of the Queen’s Gambit ' +
            'Declined.',
          wrong: {
            cxd5: '**cxd5** is a good move too: the exchange gives White a stable game. This step keeps the tension and adds the pin first.',
            Nf3: '**Nf3** is solid, and a good move too. This step shows the more active choice, the pin.',
          },
          failure:
            'The knight on f6 guards d5. Which developing bishop move attacks it, with the queen standing behind?',
          reply: 'Nbd7',
          replyNote:
            'Black develops the other knight, which also supports f6, so the pin does not win material by itself.',
          then: {
            prompt: 'Which capture changes the pawn structure in the centre?',
            moves: ['cxd5'],
            hint: 'Your c-pawn can take on d5. Black will then have to decide how to take back.',
            success:
              '**cxd5**: the c-pawn takes on d5, and Black must recapture with the e-pawn, because the pinned knight cannot.',
            why:
              'The exchange fixes the structure. With the c-pawn gone, White can aim at the queenside with b4 and ' +
              'b5, the minority attack. The knight on f6 is pinned, so …exd5 is forced. Then the d5 pawn looks ' +
              'loose, and you should look hard before you grab it.',
            wrong: {
              e3: '**e3** is a good move too. This step takes on d5, which forces the pawn recapture and clears the centre.',
              Bxf6: '**Bxf6** gives up the bishop for a knight and releases the pin; Black recaptures comfortably. Keep the pin for now.',
              Nf3: '**Nf3** is a good move too, a natural developing move. This step takes on d5 first, which forces Black to recapture with a pawn and keeps the pin on f6.',
            },
            failure:
              'Your c-pawn can capture in the centre. Which capture forces Black to recapture with a pawn?',
            reply: 'exd5',
            replyNote:
              'Black recaptures with the e-pawn, the only sensible way. The d5 pawn now looks like a loose target.',
            then: {
              prompt: 'Black’s d5 pawn looks loose. What is the safest way to carry on?',
              moves: ['e3'],
              hint: 'If your knight takes on d5, what could the knight on f6 do, and what would your bishop on g5 then take?',
              success:
                '**e3**: a quiet developing move that opens the bishop on f1 and supports d4. The d5 pawn is not worth capturing yet.',
              why:
                'The Elephant Trap: 6. Nxd5? Nxd5! 7. Bxd8 Bb4+ 8. Qd2 Bxd2+ 9. Kxd2 Kxd8, and Black has won a ' +
                'piece for a pawn. The queen is the bait, and the check on b4 is the point. Develop with **e3**; the ' +
                'pawn on d5 is not going anywhere.',
              wrong: {
                Nxd5: {
                  text: 'It wins a pawn on paper, but the pinned knight can take back. After Bxd8 Bb4+ the queens come off, and you are left a piece down for a pawn.',
                  refute: 'Nxd5',
                },
                Nf3: '**Nf3** is a good move too: it develops with no risk. This step plays e3, which also opens the bishop on f1.',
                Qc2: '**Qc2** is a good move too. This step plays e3, which brings the bishop on f1 into the game as well.',
              },
              failure:
                'Some captures that win a pawn lose more. Check what the knight on f6 could do, and look for a quiet developing move.',
            },
          },
        },
      },
      {
        title: 'The London System',
        text:
          'The London lets you play the same set-up against almost anything: d4, Nf3, **Bf4**, e3, c3, Bd3, Nbd2 ' +
          'and castle. Club players love it because it needs very little theory, and the position is solid.\n\n' +
          'Its one rule is about move order. The bishop on c1 must come out before the pawn on e3 shuts it in. Push ' +
          'e3 first and that bishop is stuck behind its own pawn, which wastes the best piece in the system.',
        fen: fenAfter('1. d4 d5'),
        shapes: ['c1f4', 'f4b8:blue'],
        task: {
          prompt: 'Which bishop move develops outside the pawn chain, before e3?',
          moves: ['Bf4'],
          hint: 'The d-pawn has moved, so the c1 bishop is free. Find the square where it looks along the b8–h2 diagonal.',
          success:
            '**Bf4**: the bishop comes out before e3 and eyes the b8–h2 diagonal, controlling e5 and pointing at c7.',
          why:
            'The c1 bishop is the piece the system is built around. Outside the pawn chain it controls e5 and ' +
            'eyes c7. Develop it before you close the diagonal with e3, and the rest of the set-up, with e3, Nf3, ' +
            'c3 and Bd3, falls into place.',
          wrong: {
            e3: '**e3** is playable, but it shuts the c1 bishop in behind the pawn. In the London that bishop comes out first, so e3 waits.',
            c4: '**c4** is the Queen’s Gambit from the last step: a fine move, but a different opening.',
          },
          failure:
            'You want the c1 bishop out on its diagonal before the e-pawn gets in its way. Which square does that?',
          reply: 'c5',
          replyNote:
            'Black hits d4 with a pawn. This is a common reply, and it asks you to support the centre.',
          then: {
            prompt: 'Which pawn move supports d4 and opens the bishop on f1?',
            moves: ['e3'],
            hint: 'A pawn move that guards d4 and gives the f1 bishop its diagonal.',
            success:
              '**e3**: the pawn supports d4 and opens the diagonal for the bishop on f1. The bishop on f4 is already outside the chain.',
            why:
              'Now e3 is safe, because the bishop is already out. The pawn guards d4, and the f1 bishop can reach ' +
              'd3 to join the attack. Nf3, c3 and Bd3 follow, and the position needs no special knowledge.',
            wrong: {
              Nf3: '**Nf3** is a good move too, and many London players prefer it. This step plays e3 first.',
            },
            failure:
              'The d4 pawn needs support, and the bishop on f1 needs room. Which pawn move does both?',
            reply: 'Qb6',
            replyNote:
              'Black’s queen goes for the b2 pawn, a very common reaction against the London. It is not Black’s best move, but you must know how to meet it.',
            then: {
              prompt: 'The queen attacks b2, which has lost its bishop. What is your best reply?',
              moves: ['Nc3'],
              hint: 'Think development, not defence: which developing move makes …Qxb2 a mistake? Look at d5 and b5.',
              success:
                '**Nc3**: the knight develops and attacks d5, leaving b2 as bait: if the queen takes, **Nxd5** threatens Nc7+ and Black is in trouble.',
              why:
                'If the queen takes, Qxb2 Nxd5 wins the d5 pawn and threatens Nc7+, and Black is already in deep ' +
                'trouble. Defending with **Qd2** does not even work, because the pawn on c2 blocks the queen from ' +
                'b2. Answer a pawn grab with a developing move that makes it expensive.',
              wrong: {
                Qd2: {
                  text: 'It looks like a defence, but the pawn on c2 blocks the queen from b2. Qxb2 wins a pawn and keeps the initiative.',
                  refute: 'Qxb2',
                },
                Nf3: '**Nf3** develops too, and is a good move. It does not set the b2 trap, which is why Nc3 is stronger here.',
                Qc1: '**Qc1** defends the pawn and is playable, but it is passive: the queen goes back, while Nc3 develops with a trap.',
                Na3: 'The knight on the rim does nothing about b2 or d5, and it will take time to come back into play. Develop where the knight attacks something.',
                c4: '**c4** is a good move too, a Queen’s Gambit idea: after dxc4 Bxc4 you have the pawn back. But Nc3 develops and sets the b2 trap, so this step prefers it.',
              },
              failure:
                'Black’s queen attacks b2. Look for a developing move that makes taking that pawn expensive.',
            },
          },
        },
      },
      {
        title: 'The King’s Indian Defence',
        text:
          'You are Black, and White has built a big centre: pawns on c4, d4 and e4. The King’s Indian allows it on ' +
          'purpose. Black fianchettoes the bishop to g7, castles, and then attacks the centre with …e5 or …c5, ' +
          'so that the bishop on g7 comes to life when the centre opens.\n\n' +
          'The risk is that White’s space turns into an attack, so the order of your moves matters. It is a ' +
          'sharp, dynamic defence, and many world champions have chosen it.',
        fen: fenAfter('1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4'),
        orientation: 'black',
        shapes: ['g7a1:blue', 'e7e5'],
        task: {
          prompt: 'Which pawn move supports a later …e5?',
          moves: ['d6'],
          hint: 'Think of the pawn that will stand behind e5 and guard it, and that also frees the c8 bishop.',
          success:
            '**d6**: the pawn will support …e5 and gives the c8 bishop its diagonal. The bishop on g7 already points at White’s centre.',
          why:
            'The pawn on d6 prepares the break …e5 that is the heart of the King’s Indian. Do not take **Nxe4**: ' +
            'the knight on c3 guards the pawn. And **d5** at once fails to cxd5. Be patient: support, castle, then ' +
            'strike.',
          wrong: {
            Nxe4: {
              text: 'The e4 pawn is guarded by the knight on c3, so Nxe4 Nxe4 leaves you a knight down for a pawn. The bishop on g7 does not rescue it.',
              refute: 'Nxe4',
            },
            d5: {
              text: 'It hits the centre at once, but cxd5 wins a pawn: if Nxd5, exd5 takes the knight. Attack the centre later, with more pieces in place.',
              refute: 'cxd5',
            },
            'O-O':
              '**O-O** is just as good: move orders in the King’s Indian often transpose. This step plays d6 first.',
          },
          failure:
            'You want a pawn that will support the central break …e5 later. Which pawn move does that?',
          reply: 'Nf3',
          replyNote:
            'White develops and keeps the centre ready. Black has not castled yet, so …e5 would be premature.',
          then: {
            prompt: 'Which move should come before …e5?',
            moves: ['O-O'],
            hint: 'Safety first: one move puts the king behind the bishop on g7 and brings a rook towards the centre.',
            success:
              '**O-O**: the king goes to g8 behind its pawns and the bishop, and the rook joins the game on f8.',
            why:
              'In the King’s Indian you castle before you strike. The immediate e5 dxe5 dxe5 Qxd8+ Kxd8 Nxe5 ' +
              'costs a pawn and the right to castle. With the king safe, the break comes next move without such ' +
              'worries.',
            wrong: {
              e5: {
                text: 'Too early: dxe5 dxe5 Qxd8+ Kxd8, and the king can no longer castle, while Nxe5 wins a pawn. Castle first, then strike.',
                refute: 'dxe5',
              },
              Bg4: '**Bg4** is a good move too, pinning the knight. This step castles first.',
            },
            failure:
              'Your king is still in the middle. Which move puts it behind the fianchettoed bishop?',
            reply: 'Be2',
            replyNote:
              'White develops the bishop and prepares to castle. Now Black has everything ready for the strike.',
            then: {
              prompt: 'Which pawn move challenges White’s big centre?',
              moves: ['e5'],
              hint: 'The d6 pawn supports it. Which central pawn can now advance to hit d4?',
              success:
                '**e5**: the pawn strikes at d4 and challenges the centre White built, with the king already safe on g8.',
              why:
                'This is the King’s Indian plan: let White build the centre, then attack it. If White closes it with ' +
                '**d5**, Black plays …Nd7 and …f5 with a kingside attack. If the centre opens, the bishop on g7 ' +
                'grows strong. Black is happy with either.',
              wrong: {
                c5: '**c5** is a good move too. This step shows the classical strike with e5.',
                Bf5: {
                  text: 'Developing the bishop is natural, but the pawn on e4 attacks f5: exf5 wins the piece. White’s e4 pawn also stops …d5.',
                  refute: 'exf5',
                },
              },
              failure:
                'Your king is safe and the d6 pawn supports the centre. Which pawn move now attacks d4?',
            },
          },
        },
      },
    ],
    practiceThemes: ['opening'],
  },
];
