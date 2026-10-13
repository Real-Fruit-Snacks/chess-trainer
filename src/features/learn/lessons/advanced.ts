import { fenAfter, type Lesson } from '../model';

// Both back ranks are weak; whoever moves first uses it.
const BACK_RANK_COMBO = '3r2k1/5ppp/8/8/8/8/1q2QPPP/4R1K1 w - - 0 1';
const QUEEN_TRADE_FORK = '3qk2r/pp3pp1/8/4N3/8/8/PPP5/3Q2K1 w - - 0 1';
// No good checks, nothing to take: the quiet Qh6 threatens Qg7#.
const QUIET_THREAT = '2r3k1/ppq2p1p/2n2Bp1/8/8/8/PP1Q1PPP/4R1K1 w - - 0 1';
// A French Advance structure with level material: every Greek-gift ingredient is present.
const GREEK_GIFT = 'r1b2rk1/pp1n1ppp/2n1p3/q1ppP3/3P4/2PB1N2/PP3PPP/R1BQ1RK1 w - - 0 12';
const FRENCH_CHAIN = fenAfter('1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. f4 c5 6. Nf3 Nc6');

export const advancedLessons: Lesson[] = [
  {
    id: 'calculation-method',
    title: 'How to calculate: checks, captures, threats',
    level: 'advanced',
    category: 'Thinking',
    summary: 'A repeatable method for finding combinations instead of hoping to see them.',
    minutes: 12,
    practiceDrills: [
      { title: 'What’s the threat?', to: '/drills/threats' },
      { title: 'Blind puzzles', to: '/puzzles/blind' },
    ],
    steps: [
      {
        title: 'Forcing moves first',
        text:
          'Most missed wins were not too deep to see. They were never looked at. Strong players do not ' +
          'calculate everything; they look at **forcing moves** first, the moves that leave the opponent the ' +
          'fewest replies, in this order:\n\n' +
          '1. **Checks**\n2. **Captures**\n3. **Threats**, above all threats of mate\n\n' +
          'For each one, ask “what are *all* the replies?” and follow the line until the position goes quiet. ' +
          'Only when nothing forcing works do you turn to quiet moves.\n\n' +
          'Try the list on this diagram. Both kings sit behind three unmoved pawns, and Black’s queen on b2 is ' +
          'hitting yours: Black threatens 1...Qxe2 2. Rxe2 Rd1+ 3. Re1 Rxe1#. But you move first.',
        fen: BACK_RANK_COMBO,
        shapes: ['b2e2:red'],
      },
      {
        title: 'Checks: a back-rank combination',
        text:
          'Your queen is attacked and Black is threatening mate, so there is no time for slow moves. Start at ' +
          'the top of the list. You have exactly one check, and it puts your queen where a rook can take her.\n\n' +
          'That is no reason to skip it. A check that leaves one legal reply is the easiest line in chess to ' +
          'calculate, because it has no branches. Follow it to the end before you decide.',
        fen: BACK_RANK_COMBO,
        shapes: ['b2e2:red'],
        task: {
          prompt: 'Checks first. Where does your only check lead?',
          moves: ['Qe8+'],
          hint: 'Count Black’s legal replies to a queen check on e8. Then ask what your rook on e1 can do.',
          success:
            '**Qe8+**: the queen checks on the back rank, and Black’s only legal reply is to take her with the rook.',
          why:
            'A check with one reply turns calculation into counting: Qe8+ Rxe8 Rxe8, and the king is boxed in by ' +
            'its own pawns. Because the line has no branches, you can see the end before you let the queen go. ' +
            'That is what the method buys you: the sacrifice is not a hunch, it is a line you have checked to the ' +
            'finish.',
          wrong: {
            Qxb2: 'That wins Black’s queen, and it would win the game, but you skipped a step of the method. Checks come before captures, and here the one check mates in two. Looking at captures first is how mates get missed.',
            h3: 'Making room for your king is a good habit, but it only answers Black’s threat and gives up yours: after 1...Qxe2 2. Rxe2 the queens are off and the game is level. Look at your own checks first.',
            Qd3: {
              text: '**Qd3** dodges the attack and sets a trap, since 1...Rxd3 2. Re8# mates, but Black just makes room with **...Rf8** and the game is level. Your one check mates in two: look at the checks first.',
              refute: 'Rf8',
            },
          },
          failure:
            'Start with the checks: you have exactly one. Count Black’s replies to it, then look at what your rook on e1 can do next.',
          reply: 'Rxe8',
          replyNote:
            'Black’s only legal move. The rook has left d8 for e8, and nothing else guards the back rank.',
          then: {
            prompt: 'Finish the line: checkmate in one.',
            moves: ['Rxe8#'],
            acceptAnyMate: true,
            hint: 'Recapture on e8. Does the king have a square to run to?',
            success:
              '**Rxe8#**: the rook takes back with check, and the pawns on f7, g7 and h7 keep the king in.',
            why:
              'A queen for mate two moves later. Notice that Black had exactly the same idea against you: both ' +
              'back ranks were weak, and the side that looked at its checks first won. Whenever a back rank has a ' +
              'single defender, ask whether a sacrifice can drag it away.',
            failure:
              'Not mate yet. Your rook on e1 can take on e8 with check, and the king has no square: f7, g7 and h7 hold its own pawns.',
          },
        },
      },
      {
        title: 'Captures: the order matters',
        text:
          'Material says Black is better: the exchange and a pawn up. But the queens face each other on the ' +
          'd-file, so whoever moves first decides what happens to them, and that is you.\n\n' +
          'Go down the list. The checks that are not captures lead nowhere. The captures are more interesting: **Nxf7** ' +
          'forks queen and rook, and **Qxd8+** trades queens with check. Before you play either, ask what the ' +
          'opponent can capture back, and where their king ends up.',
        fen: QUEEN_TRADE_FORK,
        shapes: ['d8d1:red', 'h8'],
        task: {
          prompt: 'Two captures look tempting. Which one comes first?',
          moves: ['Qxd8+'],
          hint: 'If you take on f7 first, what does Black’s queen do? Trade queens first and see where the king has to stand.',
          success:
            '**Qxd8+**: the queens come off with check, and the only way to recapture is with the king.',
          why:
            'The order is everything. Nxf7 at once forks queen and rook, but it is not check, and Black answers ' +
            'Qxd1+, taking your queen first. Trading first removes the queen that was hitting yours and drags the ' +
            'king to d8, a square your knight can check from f7. Before every capture, ask what comes back, and ' +
            'where.',
          wrong: {
            Nxf7: {
              text: 'That forks the queen and the rook, but it is not check, and your queen is loose: Black takes her first, with check. Trade queens first; then the same jump comes with check.',
              refute: 'Qxd1+',
            },
          },
          failure:
            'Look at the two captures and their order. Which one forces the king to recapture, and where does that leave it?',
          reply: 'Kxd8',
          replyNote:
            'Forced: only the king can take back. Now look at f7. A knight there would check the king on d8 and attack the rook on h8.',
          then: {
            prompt: 'Now the knight. Which capture checks the king and hits the rook?',
            moves: ['Nxf7+'],
            hint: 'Which squares does a knight on f7 attack?',
            success:
              '**Nxf7+**: the knight takes the f7 pawn with check and attacks the rook on h8 at the same time.',
            why:
              'Two moves ago this jump hit a queen and a rook and lost to a capture with check. Now it hits a king ' +
              'and a rook, and the king must move first, so the rook goes. A fork is strongest when one target is ' +
              'the king. After every trade, ask what the new king square allows.',
            wrong: {
              'Nc6+': {
                text: 'Check, but it attacks nothing else, and the pawn on b7 takes the knight. The check you want wins something as well.',
                refute: 'bxc6',
              },
            },
            failure: 'Look for a knight check that also attacks the rook in the corner.',
            reply: 'Ke7',
            replyNote: 'The king steps up and attacks the knight. It cannot save the rook as well.',
            then: {
              prompt: 'Collect the rook, then take stock: who is better, and why?',
              moves: ['Nxh8'],
              hint: 'The rook on h8 is still attacked.',
              success:
                '**Nxh8**: the knight takes the rook. The queens are gone and you are a knight up.',
              why:
                'Count the whole line: queens traded, a rook and a pawn won, and a lost position is now winning. ' +
                'Look one move further, though: the knight in the corner is short of squares, and ...Kf6 would take ' +
                'both of them. So the next job is a quiet one, bringing your king over to help. Every line ends in ' +
                'a position, and every position needs a plan.',
              failure: 'The rook on h8 is still attacked by your knight. Take it while you can.',
            },
          },
        },
      },
      {
        title: 'Threats: the quiet move',
        text:
          'Sometimes the list runs out early. Here the checks lose material: **Re8+** drops the rook and ' +
          '**Qd8+** the queen. There is nothing to capture. That is when you turn to the third item, ' +
          '**threats**, and above all threats of mate.\n\n' +
          'Look at the dark squares round Black’s king. Its bishop is gone, and yours sits on f6, covering g7 and ' +
          'h8. Black’s pieces are all on the queenside, and none of them can reach g7 in one move.',
        fen: QUIET_THREAT,
        shapes: ['g7'],
        task: {
          prompt: 'No good checks, nothing to take. What can you threaten?',
          moves: ['Qh6'],
          hint: 'Your bishop already guards g7. Which queen move threatens to land there next?',
          success:
            '**Qh6**: a quiet move that threatens **Qg7#**, and Black has no way to cover g7.',
          why:
            'Black can only delay it: 1...Qxh2+ 2. Kxh2 gives up the queen, and nothing stops **Qg7#** after that. ' +
            'A threat forces less than a check, so test every defence, the desperate checks included. When checks ' +
            'and captures fail, ask which squares near the king you already control, and which piece could join ' +
            'them.',
          wrong: {
            'Re8+': {
              text: 'A check, but the rook on c8 simply takes it, and you are a rook down. “Checks first” means look at every check and calculate the replies, not play the first one.',
              refute: 'Rxe8',
            },
            'Qd8+': {
              text: 'Check, but the rook on c8 takes the queen. A check is only worth playing when the replies to it are good for you.',
              refute: 'Rxd8',
            },
          },
          failure:
            'Look at the squares round Black’s king that you already control. Which queen move would threaten mate on one of them?',
        },
      },
      {
        title: 'Visualisation habits',
        text:
          'A few habits make calculation reliable:\n\n' +
          '- Look for the opponent’s **best** reply, not the one you hope for, above all their checks and captures.\n' +
          '- When a line ends, take a snapshot: *who is better, and why?* If you cannot say, calculate one move ' +
          'further. The knight stuck on h8 was that move.\n' +
          '- Finish one line before you start the next, and compare the candidates only at the end.\n' +
          '- Before you let go of the piece, do a **blunder check**: what does this move leave undefended, and ' +
          'which checks does it allow?\n\n' +
          'Every win in this lesson came from the same order: checks, captures, threats.',
        fen: QUEEN_TRADE_FORK,
      },
    ],
    practiceThemes: ['sacrifice', 'long', 'veryLong'],
  },

  {
    id: 'pawn-structures',
    title: 'Pawn structures and the plans they dictate',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Isolated pawns, hanging pawns, pawn chains and the minority attack: let the pawns choose the plan.',
    minutes: 11,
    steps: [
      {
        title: 'The isolated queen’s pawn',
        text:
          'Pawns are the slowest units and never move back, so the pawn structure tells both sides the plan ' +
          'long after the opening is over.\n\n' +
          'Here Black’s pawn on d5 has no neighbour on the c- or e-file: an **isolated queen’s pawn**. Its owner ' +
          'gets space, open lines and the ...d4 break, so Black wants active pieces and play before the endgame. ' +
          'White wants the opposite: a piece on d4, the square in front of the pawn that no black pawn can ever ' +
          'attack, then trades, and an endgame where d5 is simply weak.',
        fen: fenAfter(
          '1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 exd5 5. Nf3 Nc6 6. g3 Nf6 7. Bg2 Be7 8. O-O O-O 9. dxc5 Bxc5',
        ),
        shapes: ['d5:red', 'd4:blue'],
      },
      {
        title: 'Hanging pawns',
        text:
          'Two pawns side by side with no pawns on the files next to them, here c5 and d5, are **hanging ' +
          'pawns**. Together they control a lot of space, and either can advance with force. Their problem is ' +
          'that once one of them moves, the other is left behind, weak and fixed.\n\n' +
          'So the side facing them does not rush. White lines up on c5 and d5 with moves like Qc2, Rc1 and b3, ' +
          'and waits for the moment ...c4 or ...d4 has to be played, leaving a target behind. Striking at once ' +
          'with **b4** is premature here: it just drops a pawn to ...cxb4.',
        fen: 'r2q1rk1/p4ppp/4bn2/2pp4/8/4PN2/PP2BPPP/R2QR1K1 w - - 0 15',
        shapes: ['c5:red', 'd5:red'],
      },
      {
        title: 'Pawn chains',
        text:
          'Locked chains tell each side where to play. White’s chain d4–e5 points at the kingside, so White ' +
          'attacks there, in time with f4–f5. Black’s chain d5–e6 points at the queenside. The rule for both: ' +
          'attack the **base** of the enemy chain, the pawn at the back that holds it up.\n\n' +
          'White’s base is d4, and Black is already hitting it with the pawn on c5 and the knight on c6; ...Qb6 ' +
          'and ...cxd4 come next. If d4 falls, e5 loses its support and the chain wobbles. So before you think ' +
          'about f5, ask what Black wants.',
        fen: FRENCH_CHAIN,
        shapes: ['c5d4:red', 'c6d4:red', 'f4f5:blue'],
        task: {
          prompt: 'What does Black want here, and which developing move stops it?',
          moves: ['Be3'],
          hint: 'Black is lining up on d4. Which of your undeveloped pieces can guard it and come into play at once?',
          success: '**Be3**: the bishop develops and guards d4, so the base of your chain holds.',
          why:
            'Be3 is the main line for a reason: one move develops a piece and guards the base, and it keeps every ' +
            'plan open, Qd2 and castling, then f4–f5 when the time comes. Giving up the base with dxc5 is ' +
            'playable, but Black’s bishop recaptures on a fine diagonal and your e5 pawn loses its anchor. Protect ' +
            'the base before you attack with the head.',
          wrong: {
            dxc5: 'That gives up the base of your chain. It is playable, but after ...Bxc5 Black’s bishop has a fine diagonal and your e5 pawn has lost its anchor. Guard d4 instead, with a move that also develops.',
            Ne2: '**Ne2** guards d4 too and makes room for c3, a real plan, but it takes the knight back and shuts in your f1 bishop. Find the move that guards d4 and brings a new piece out.',
          },
          failure:
            'This step is about d4, the base of your chain. Black is hitting it twice: find a move that guards it and develops a piece.',
        },
      },
      {
        title: 'The minority attack',
        text:
          'This is the Carlsbad structure, from the Exchange Queen’s Gambit. White has two queenside pawns, on ' +
          'a2 and b2, against Black’s three on a7, b7 and c6. Pushing the smaller group against the bigger one ' +
          'sounds wrong, but that is the **minority attack**: the b-pawn runs to b5 and swaps itself for the c6 ' +
          'pawn. However Black recaptures, a weak pawn is left on c6 or d5 for White’s pieces to attack for the ' +
          'rest of the game.\n\nYour rook is already on b1, behind the pawn.',
        fen: fenAfter(
          '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. Qc2 Be7 7. e3 Nbd7 8. Bd3 O-O 9. Nf3 Re8 10. O-O Nf8 11. Rab1 Bd6',
        ),
        shapes: ['c6:red'],
        task: {
          prompt: 'How do you start the minority attack?',
          moves: ['b4'],
          hint: 'Which pawn heads for b5, and is its path safe today?',
          success: '**b4**: the pawn sets off for b5, backed by the rook on b1.',
          why:
            'Next comes b5, and Black has no comfortable answer: taking on b5 leaves d5 isolated, and letting you ' +
            'take on c6 leaves a backward pawn there on a half-open file. The attack is slow, so Black looks for ' +
            'play on the kingside, and that race is the whole middlegame of this structure. Your queen and rooks ' +
            'will soon want the b- and c-files.',
          wrong: {
            h3: '**h3** is a good move too, and the engine’s favourite here: it takes g4 from the bishop and knight. But this step is about the minority attack, and the b-pawn is ready to go.',
            Rbe1: '**Rbe1** is a sound move with a different plan, the central break e3–e4. This step is about the queenside, where your rook on b1 is waiting to support the b-pawn.',
          },
          failure:
            'This step is about the queenside, where you have fewer pawns. Which pawn goes first, with the rook on b1 behind it?',
        },
      },
      {
        title: 'Reading a structure',
        text:
          'Whenever the pawn structure changes, stop and ask four questions:\n\n' +
          '- Which pawns are **weak** (isolated, backward, doubled), and whose are they?\n' +
          '- Which **files** are open or half-open, and who can use them?\n' +
          '- Which way do the **chains point**? That is the wing to attack on.\n' +
          '- Which **pawn break** (...c5, f4–f5, b4–b5) improves your structure or damages theirs?\n\n' +
          'The answers usually hand you a plan for the next ten moves. They also hand you your opponent’s plan, ' +
          'which is the one you have to stop.',
        fen: FRENCH_CHAIN,
      },
    ],
    practiceThemes: ['middlegame', 'advantage'],
  },

  {
    id: 'defence-and-prophylaxis',
    title: 'Defence and prophylaxis',
    level: 'advanced',
    category: 'Thinking',
    summary:
      'See the opponent’s plan before it happens, and counter-attack when that is the best defence.',
    minutes: 9,
    practiceDrills: [{ title: 'What’s the threat?', to: '/drills/threats' }],
    steps: [
      {
        title: 'Prophylaxis: prevent, don’t react',
        text:
          '**Prophylaxis** means asking “what does my opponent want?” before you ask what you want, and then ' +
          'quietly taking it away. It is the habit that separates strong players from merely sharp ones.\n\n' +
          'This is a quiet Italian Game. Nothing is attacked and both sides are nearly developed, which is ' +
          'exactly when the question matters most. Look at Black’s last undeveloped piece, the bishop on c8. ' +
          'Where would it like to go, and what would it do there to your knight on f3?',
        fen: fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O a6 7. a4 Ba7'),
        task: {
          prompt: 'What does Black want to play next? Take that square away.',
          moves: ['h3'],
          hint: 'Follow the c8 bishop’s diagonal toward your kingside. Which square would let it pin your knight?',
          success:
            '**h3**: the pawn takes g4 away from the bishop, so the pin with ...Bg4 is off the menu.',
          why:
            'After ...Bg4 the bishop pins your knight to your queen, and ...Nd4 would add a second attacker to ' +
            'it. One modest pawn move takes all that away. Be3, Bb3 and a5 are good moves too; what makes h3 ' +
            'prophylaxis is that you find it by looking at Black’s plan, not yours. Name the opponent’s best idea ' +
            'before every move.',
          wrong: {
            Be3: '**Be3** is a good move too, offering to trade off the bishop on a7. But it leaves ...Bg4 available, and this step is about Black’s plan: which square does the c8 bishop want?',
            Bg5: '**Bg5** pins Black’s knight instead, a fine developing move. Ask the prophylactic question first, though: what does Black play next? The c8 bishop wants a pin of its own.',
          },
          failure:
            'Several moves are playable here. This step is about Black’s idea: which square does the c8 bishop want, and which pawn move takes it away?',
        },
      },
      {
        title: 'Defending a mate threat',
        text:
          'Now you are the defender, and the threat is concrete: White’s queen and bishop are lined up on the ' +
          'diagonal to h7, and Qxh7 would be mate. Under pressure, the first instinct is to grab the nearest ' +
          'defensive move. Strong players look a little further: of the moves that stop the mate, which one also ' +
          'improves the position, and which one creates a new weakness?\n\n' +
          'Count your candidates: block the diagonal, or guard h7 with a piece.',
        fen: 'r1b2rk1/pp1nqppp/2p1p3/8/8/2PQ4/PPBN1PPP/R3R1K1 b - - 0 14',
        orientation: 'black',
        shapes: ['d3h7:red', 'c2h7:red'],
        task: {
          prompt: 'How do you stop Qxh7#, and improve your position at the same time?',
          moves: ['Nf6', 'g6'],
          hint: 'Which of your pieces could guard h7 from its best square? Or which pawn can block the diagonal without loosening e6?',
          success:
            'The mate is stopped. **Nf6** guards h7 from the knight’s best square; **g6** blocks the diagonal and keeps everything else in place.',
          why:
            'Nf6 is the most useful defence: the knight on d7 was doing little, and on f6 it guards h7, d5 and e4 ' +
            'for good. g6 is sound too. Compare f5, which also blocks the diagonal but leaves e6 without a pawn to ' +
            'defend it: Rxe6 wins a pawn and opens your king. Of the moves that defend, prefer the one that ' +
            'develops.',
          wrong: {
            f5: {
              text: '**f5** blocks the diagonal, but it leaves the pawn on e6 with no pawn to defend it. **Rxe6** wins it at once, and your king is drafty too.',
              refute: 'Rxe6',
            },
            Qh4: '**Qh4** guards h7 too, and it holds, but the queen is out on a limb: Nf3 gains time against her, and your knight on d7 is still asleep. Defend with a piece that wants to come to f6 anyway.',
          },
          failure:
            'The threat is Qxh7#. Block the diagonal, or put a piece on guard of h7, and check that your answer does not create a new weakness.',
        },
      },
      {
        title: 'Counter-attack: check before you defend',
        text:
          'Defence is not always passive. Your rook on d1 is attacked by the queen, and you are already well ' +
          'behind on material, so the natural reaction is to save the rook.\n\n' +
          'That is the moment to stop and run through the list once more, from the top. Black’s king has never ' +
          'made luft, and the only black piece that could ever guard the back rank is the queen, far away on b3.',
        fen: '6k1/pp3ppp/8/8/8/Pq6/5PPP/3R2K1 w - - 0 1',
        shapes: ['b3d1:red'],
        task: {
          prompt: 'Your rook is attacked. Before you move it to safety, what are your checks?',
          moves: ['Rd8#'],
          acceptAnyMate: true,
          hint: 'Black’s king is behind three unmoved pawns. Which check has no answer?',
          success:
            '**Rd8#**: the attacked rook checks on the back rank, the pawns on f7, g7 and h7 keep the king in, and nothing can block.',
          why:
            'The best defence is often an attack, and the cheapest attack is a check. Saving the rook with **Rf1** ' +
            'keeps material but leaves you a queen against a rook, which is lost. Before every defensive move, run ' +
            'through your checks, captures and threats: the piece that is attacked may be the one that wins.',
          wrong: {
            Rf1: {
              text: 'That saves the rook, but you stay a rook against a queen, and Black has all the time in the world: here a free pawn on a3. Look at your checks before you retreat.',
              refute: 'Qxa3',
            },
            Rd2: {
              text: 'The rook escapes, but it leaves your back rank: **...Qb1+** and mate next move, the very trick you could have played yourself. Look at your checks before you retreat.',
              refute: 'Qb1+',
            },
            Rd4: {
              text: 'Safe from the queen, but off the back rank: **...Qb1+** and mate next move. Black’s back rank is as weak as yours, and it is your move.',
              refute: 'Qb1+',
            },
            Rd6: {
              text: 'The rook leaves the back rank, and **...Qb1+** mates in two. Before any retreat, ask what your own checks do: one of them ends the game.',
              refute: 'Qb1+',
            },
          },
          failure:
            'Before you save the rook, look at your checks. Black’s king has no luft, and nothing guards the back rank.',
        },
      },
      {
        title: 'Drawing resources',
        text:
          'When you are worse, defend with a goal: not just surviving the next move, but reaching a position the ' +
          'opponent cannot win. Know the ways to hold:\n\n' +
          '- **Perpetual check**: a king that cannot escape a series of checks means a draw by repetition.\n' +
          '- **Fortresses**: positions the stronger side cannot break. Here White has an extra bishop and pawn, ' +
          'but the bishop is light-squared and the h-pawn queens on h8, a dark square. Black shuffles in the ' +
          'corner, and it is a draw.\n' +
          '- **Stalemate**: with almost nothing left, look for a way to have no legal move.\n' +
          '- **Trade pawns**: the fewer pawns remain, the more endings a piece down are drawn.',
        fen: '7k/8/6KP/8/8/8/8/5B2 w - - 0 1',
        shapes: ['h8:red'],
      },
    ],
    practiceThemes: ['defensiveMove', 'quietMove', 'equality'],
  },

  {
    id: 'converting-advantages',
    title: 'Converting an advantage',
    level: 'advanced',
    category: 'Strategy',
    summary:
      'Winning a won position is a skill of its own: simplify, create passed pawns, use the king.',
    minutes: 9,
    steps: [
      {
        title: 'Principles of technique',
        text:
          'Being winning and winning the game are two different skills. When you are ahead:\n\n' +
          '- **Trade pieces, not pawns.** Fewer pieces leave fewer swindles; more pawns leave more possible queens.\n' +
          '- **Do not hurry.** Take away the counterplay first, then push.\n' +
          '- **Create a passed pawn**, and support it with king and rook.\n' +
          '- **Activate the king.** In the endgame it is a fighting piece worth about three pawns.\n' +
          '- **Two weaknesses.** If the opponent can hold one target, create a second on the other wing.\n\n' +
          'One exception to “do not hurry”: when the position is a race, count the moves. This diagram is one.',
        fen: '8/ppp5/8/PPP5/8/8/8/k6K w - - 0 1',
      },
      {
        title: 'The pawn breakthrough',
        text:
          'Three pawns against three, and both kings are far away, so this is pure counting. If Black gets to ' +
          'play ...b6, the pawns lock and nothing gets through. If you can force one pawn past, it queens long ' +
          'before either king arrives.\n\n' +
          'Calculate the captures to the end before you start. Black can take in two different ways, and you ' +
          'need an answer to both.',
        fen: '8/ppp5/8/PPP5/8/8/8/k6K w - - 0 1',
        task: {
          prompt: 'Which pawn move forces a passed pawn, however Black captures?',
          moves: ['b6'],
          hint: 'Offer a pawn so that whichever black pawn takes it, another of yours gets a free path.',
          success:
            '**b6**: the middle pawn offers itself. Taking with either pawn opens a path for one of yours, and not taking lets you capture on a7 or c7.',
          why:
            'This is the classic breakthrough: 1...axb6 2. c6! bxc6 3. a6, or 1...cxb6 2. a6! bxa6 3. c6, and a ' +
            'pawn runs through. Either way the new passed pawn needs two more moves to queen, Black’s pawns need ' +
            'five, and both kings are out of play. When pawns face pawns, calculate the captures before you count ' +
            'the squares.',
          wrong: {
            a6: {
              text: 'That gives Black the move that locks everything: after **...b6** the queenside is closed, and Black’s king, the closer one, collects your pawns. Offer the pawn in the middle instead.',
              refute: 'b6',
            },
            c6: {
              text: 'After **...bxc6** you are simply a pawn down, and Black’s king is the closer one. The pawn you give away has to be the middle one, so that every capture opens a path.',
              refute: 'bxc6',
            },
            Kg2: {
              text: 'Bringing the king closer is too slow: **...b6** locks the pawns, and the ending is a draw. In a race, count first: the pawns decide this one, not the kings.',
              refute: 'b6',
            },
          },
          failure:
            'Only one move forces a passed pawn. Try giving up the middle pawn: can Black take it without opening a path for another of yours?',
          reply: 'cxb6',
          replyNote:
            'Black takes with the c-pawn, the better of the two captures. Now the pawn on b6 attacks a5 and c5, so there is no time to lose.',
          then: {
            prompt: 'Black took with the c-pawn. Which pawn do you offer now?',
            moves: ['a6'],
            hint: 'Your c-pawn needs the c6 square, and the pawn on b7 guards it. Can you lure that pawn away?',
            success:
              '**a6**: the a-pawn offers itself to deflect the b7 pawn, the only one guarding c6.',
            why:
              'If ...bxa6, your c-pawn walks through c6. If Black ignores it, axb7 queens on b8 next, and ...bxc5 ' +
              'fails to axb7 as well. Every answer opens a path, which is what a breakthrough is: a sacrifice that ' +
              'turns a blocked majority into a passed pawn.',
            wrong: {
              c6: {
                text: 'Right idea, wrong pawn: after **...bxc6** your a-pawn is still blocked, and Black is the one with the extra pawns. Lure the b7 pawn away from c6 first.',
                refute: 'bxc6',
              },
              axb6: {
                text: 'Taking back just trades pawns: after **...axb6** there is nothing left to break through with, and Black’s king is closer. The pawn you need must go forward, not sideways.',
                refute: 'axb6',
              },
            },
            failure:
              'Your c-pawn needs c6, and the pawn on b7 guards it. Which pawn can you offer to lure it away?',
            reply: 'bxa6',
            replyNote: 'Black takes, and the pawn that guarded c6 has gone.',
            then: {
              prompt: 'Finish the breakthrough.',
              moves: ['c6'],
              hint: 'Which of your pawns now has a clear road to the eighth rank?',
              success:
                '**c6**: the c-pawn is passed, two moves from queening, and nothing can catch it.',
              why:
                'Count it out: c7 and c8 take two moves, while Black’s fastest pawn needs five and both kings are ' +
                'far away. Three pawns were blocked by three, and two sacrifices turned them into a queen. Remember ' +
                'the shape: pawns facing pawns on three neighbouring files can often be broken by giving up the ' +
                'middle one.',
              failure: 'The c-pawn has a free road now. Push it before Black’s pawns get moving.',
            },
          },
        },
      },
      {
        title: 'Passed pawns must be pushed, with support',
        text:
          'A passed pawn is a candidate for promotion, but on its own it just gets rounded up. It needs an ' +
          'escort: the king in front of it or beside it, and a rook that keeps the enemy king away.\n\n' +
          'Here you are a whole rook up, so the win is easy, which makes this a clean picture of the method. ' +
          'Black’s king is eyeing d4 and the pawn on e4. Your king comes up via e2 and f3 to stand beside the ' +
          'pawn, and the rook either guards it from the side, on g4, or cuts the black king off along a file. ' +
          'Only then does the pawn advance.',
        fen: '8/8/8/8/2k1P3/8/8/4K1R1 w - - 0 1',
        shapes: ['e1e2:blue', 'e2f3:blue', 'g1g4:green'],
      },
      {
        title: 'Beware the draw when winning',
        text:
          'Advantages slip away in three ways: **stalemate**, when the opponent has almost no moves left; ' +
          '**perpetual check**, when your king has no shelter; and the **wrong trade**, into an ending that ' +
          'cannot be won.\n\n' +
          'This diagram is the classic wrong trade. White is a bishop and a pawn up, but the bishop is ' +
          'light-squared and the h-pawn queens on h8, a dark square. The black king sits in the corner, and ' +
          'White can never drive it out: the most White can do is stalemate it. Before every simplifying move, ' +
          'picture the ending you are heading for and ask whether it is really won.',
        fen: '7k/8/6KP/8/8/8/8/5B2 w - - 0 1',
        shapes: ['h8:red'],
      },
    ],
    practiceThemes: ['endgame', 'advancedPawn', 'promotion'],
  },

  {
    id: 'attacking-the-king',
    title: 'Attacking the king: the Greek gift',
    level: 'advanced',
    category: 'Tactics',
    summary: 'Recognise when Bxh7+ works, and the follow-up that decides the game.',
    minutes: 10,
    steps: [
      {
        title: 'Ingredients of a king attack',
        text:
          'Before you sacrifice for an attack, check the ingredients:\n\n' +
          '- **More attackers than defenders** near the king.\n' +
          '- An **open line** toward it, or the means to open one.\n' +
          '- A pawn on **e5** that keeps a defending knight off f6.\n' +
          '- The opponent’s pieces **far away**, on the other wing.\n\n' +
          'The classic sacrifice on h7, the **Greek gift**, needs exactly these: a bishop on the b1–h7 diagonal, ' +
          'a knight on f3 ready to jump to g5, a queen that can reach h5, and no black knight on f6. Here Black’s ' +
          'queen and knight on c6 are busy on the queenside, and every ingredient is on the board.',
        fen: GREEK_GIFT,
        shapes: ['d3h7:red', 'f3g5:blue', 'd1h5:blue', 'e5:green'],
      },
      {
        title: 'The Greek gift',
        text:
          'The ingredients are all there, but a sacrifice is only as good as your calculation of it. The plan ' +
          'is three moves deep: give the bishop on h7, bring the knight to g5 with check, then bring the queen ' +
          'to the h-file.\n\n' +
          'Black has choices along the way, and the important one is where the king goes after the knight check. ' +
          'We follow the most natural defence here and meet the toughest one in the next step.',
        fen: GREEK_GIFT,
        task: {
          prompt: 'All the ingredients are here. How do you start?',
          moves: ['Bxh7+'],
          hint: 'Your bishop on d3 is already aimed at h7, and only a pawn stands there. What follows a capture with check?',
          success:
            '**Bxh7+**: the bishop takes the h7 pawn with check and rips open the king’s cover.',
          why:
            'Declining with ...Kh8 is even worse: the bishop retreats and you have won a pawn with the attack still ' +
            'on. So Black takes, and the king is dragged into the open. The sacrifice works only because the ' +
            'follow-up is forcing, a knight check and then a queen threat on h7. Without that follow-up it would ' +
            'just be a lost piece.',
          wrong: {
            b4: '**b4** is strong too: it chases Black’s queen first, and the sacrifice still follows. But there is no reason to wait, and every move you spend gives Black a chance to bring a defender over.',
          },
          failure:
            'The bishop on d3 is aimed at h7. Can you calculate what follows if you take there with check?',
          reply: 'Kxh7',
          replyNote:
            'Black accepts. Declining with ...Kh8 keeps the king hidden, but it simply leaves you a pawn up with the attack still going.',
          then: {
            prompt: 'The king is on h7. Which piece joins the attack with check?',
            moves: ['Ng5+'],
            hint: 'Your knight on f3 is one jump from a square that hits h7.',
            success:
              '**Ng5+**: the knight checks from g5, and in the same move it clears the d1–h5 diagonal for your queen.',
            why:
              'The check gives Black no time to bring a defender, and the knight on g5 covers h7, f7 and e6. Black ' +
              'has three retreats. **Kg8**, the most natural, and **Kh6** both run into mate within a few moves. ' +
              '**Kg6** is the toughest defence, and it gets a step of its own.',
            wrong: {
              'Qd3+':
                'A check, but Black blocks it with ...f5 or steps back to g8, and your knight on f3 still stands in the queen’s way. Check with the knight first: it brings a new attacker and opens the d1–h5 diagonal.',
              b4: 'A queenside pawn move in the middle of a king hunt. Black gets a free move to defend, and the bishop you gave is gone for good. After a sacrifice, every move has to come with a threat.',
              Rb1: 'Too slow: the rook is not part of the attack, and Black gets a free move to defend. After a sacrifice, every move has to come with a threat.',
            },
            failure:
              'Bring a new attacker in with check, so Black has no time to defend. Which piece can jump to a square that hits h7?',
            reply: 'Kg8',
            replyNote:
              'The natural retreat and the classic line, though not the best: ...Kg6 is the toughest defence, and the next step is about it. On g8 the king is back behind f7 and g7, with no defender near.',
            then: {
              prompt: 'Now the queen. Where does she threaten mate?',
              moves: ['Qh5'],
              hint: 'With the knight gone from f3, the diagonal from d1 is open. Where does it lead?',
              success:
                '**Qh5**: the queen joins on the h-file and threatens **Qh7#**, with the knight on g5 guarding h7.',
              why:
                'Black has no good answer. **Nf6** is met by exf6, and the moves that free f8 for the king, ...Rd8 ' +
                'or ...Re8, run into Qxf7+ and mate within three moves. That is the Greek gift in full: bishop, ' +
                'knight and queen, each arriving with a threat Black must answer, so the defenders never get time to ' +
                'come back.',
              wrong: {
                Qd3: '**Qd3** threatens Qh7# too, but Black can block the diagonal with ...f5, and the attack slows down. On h5 the queen cannot be blocked: the threat comes straight down the h-file.',
                Qc2: '**Qc2** threatens Qh7# too, but from c2 the queen can be shut out: ...g6 blocks the diagonal, and your attack runs out of pieces. On h5 the queen cannot be blocked.',
                Qg4: '**Qg4** keeps the attack alive, but it threatens no mate yet, and Black gets a move to defend. **Qh5** threatens Qh7# at once.',
                Qf3: '**Qf3** eyes f7, but it is not a mate threat, and Black gets time for ...f6 or ...Re8. **Qh5** threatens Qh7# at once.',
                Qe2: '**Qe2** heads for the h-file the slow way. Black uses the extra move for ...f6 or ...Re8, and the moment passes. **Qh5** gets there in one move, with a mate threat.',
                Re1: 'Guarding e5 is useful, but it is not a threat, and Black gets time for ...f6 or ...Re8. With your bishop gone, the queen has to arrive now.',
                b4: 'A queenside pawn move in the middle of a king hunt: Black gets a free move to defend, and the bishop you gave is gone for good. The queen has to arrive now, with a threat.',
                c4: 'Too slow. You have given a bishop to get here, so every move must keep Black busy. A quiet pawn move gives Black time to bring a defender, and the attack fades. The queen has to arrive now.',
                Rb1: 'Too slow: the rook is not part of the attack. You have given a bishop to get here, so every move must keep Black busy, and the queen has to arrive now, with a threat.',
              },
              failure:
                'Bring the queen to the h-file with a threat on h7. Which square can she reach in one move now that the knight has left f3?',
            },
          },
        },
      },
      {
        title: 'The toughest defence: ...Kg6',
        text:
          'Go back one move. Instead of retreating, Black’s king steps forward to g6, next to your knight, ' +
          'hoping to run via f5 or h6 to safety. This is the defence you must calculate before you play ' +
          'Bxh7+, because it is the one a strong opponent chooses.\n\n' +
          'A king in the open can be hunted, but only with checks and threats that come with tempo. Give Black ' +
          'one quiet move and the king slips away, or the defenders arrive.',
        fen: fenAfter('Bxh7+ Kxh7 Ng5+ Kg6', GREEK_GIFT),
        task: {
          prompt: 'Which check keeps the king in the open?',
          moves: ['Qd3+'],
          hint: 'The bishop has left d3, and the b1–h7 diagonal still runs to the king. Which piece can use it?',
          success:
            '**Qd3+**: the queen checks along the diagonal the bishop has just left, before Black can organise.',
          why:
            'Black’s answers are few: 1...Kh6 2. Qh7# and 1...Kh5 2. Qh7+ Kg4 3. Qh3# are mates, so ...f5 is ' +
            'forced, blocking the diagonal at the cost of the king’s f5 square. Checks that leave one reply keep a ' +
            'king hunt under control. **h4**, with h5+ to come, is strong too, but it gives Black a move to organise.',
          wrong: {
            h4: '**h4** is strong too, with h5+ coming, but it is not check, and Black gets a free move to organise. Keep the king busy: a check now leaves Black only one sensible reply.',
            Qg4: '**Qg4** is at least as strong: it lines up behind your knight, so every knight move becomes a discovered check. This line follows **Qd3+**, the check that leaves Black a single reply.',
            Re1: '**Re1** is nearly as strong: it guards e5 and gets the rook ready to swing over to the kingside. But it is not check, and this line follows **Qd3+**, which leaves Black a single reply.',
            'Qc2+':
              '**Qc2+** checks along the same diagonal, but from c2 the queen is too far away: after ...f5 she cannot reach the h-file in one move. From d3 she can, via h3.',
          },
          failure:
            'Keep checking. The b1–h7 diagonal is open again now that the bishop has gone. Which piece can check along it?',
          reply: 'f5',
          replyNote:
            'Forced: ...Kh6 and ...Kh5 both walk into mate. The pawn blocks the check, but it also takes the f5 square away from its own king.',
          then: {
            prompt:
              'The diagonal is blocked. How does the queen get back into the attack, with a threat?',
            moves: ['Qh3'],
            hint: 'The queen wants the h-file. From d3, which square on it can she reach, and what would she threaten there?',
            success:
              '**Qh3**: the queen swings to the h-file and threatens **Qh7#**, with the knight on g5 guarding h7.',
            why:
              'Now Black has to give material back just to stop Qh7#: ...Nf6 loses the knight to exf6, and the ' +
              'attack goes on. The pattern to remember: when ...f5 shuts the diagonal, the queen goes round ' +
              'it to h3. Taking en passant is tempting, but after exf6+ Kxf6 the king escapes the h-file and your ' +
              'pawn on e5, which kept the defenders off f6, is gone.',
            wrong: {
              'exf6+':
                'Check, and a pawn back, but it frees Black: after **...Kxf6** the king steps away from the h-file, and your e5 pawn, which kept f6 from the defenders, is gone.',
              Qg3: '**Qg3** is nearly as strong: the queen lines up behind your knight on the g-file, ready for a discovered check. But **Qh3** threatens mate at once and gives Black no time at all.',
              Nxe6: '**Nxe6** is strong too: it takes the e6 pawn, which guarded f5, so your queen can take on f5 with check, and it hits the rook on f8. This step is about the other idea, the queen swinging round to h3 with a mate threat.',
            },
            failure:
              'The queen needs a new route to the king. Look for a square on the h-file from which she threatens mate on h7.',
          },
        },
      },
      {
        title: 'When it does not work',
        text:
          'The Greek gift fails when the defender has time or help. Before you play Bxh7+, check four things:\n\n' +
          '- Can the king go to **g6** and escape via f5 or h6, because your queen cannot follow with a check ' +
          'from d3 or g4?\n' +
          '- Can a **knight reach f6** in time, because there is no pawn on e5?\n' +
          '- Can a black **queen or bishop guard g5**, ready to take the knight?\n' +
          '- Can a piece defend **h7**, such as a bishop on the b1–h7 diagonal or a rook on the seventh rank?\n\n' +
          'If all four answers are no, as here, the sacrifice is usually sound. If one is yes, calculate twice.',
        fen: GREEK_GIFT,
      },
    ],
    practiceThemes: ['kingsideAttack', 'sacrifice', 'attackingF2F7'],
  },
];
