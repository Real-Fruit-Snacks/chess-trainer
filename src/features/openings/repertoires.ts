import type { LongColor } from '@/chess/types';

export interface Repertoire {
  id: string;
  name: string;
  /** Side the learner plays. */
  color: LongColor;
  /** First moves, for display. */
  line: string;
  description: string;
  level: 'beginner' | 'intermediate';
  /** PGN with variations; comments become tips shown when a move is played. */
  pgn: string;
}

export const BUILT_IN_REPERTOIRES: readonly Repertoire[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    color: 'white',
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4',
    description:
      'The classic beginner-to-master opening: fast development, a safe king and a slow, purposeful build-up with c3 and d3.',
    level: 'beginner',
    pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 {The Italian: develop, castle, then play c3 and d3.} Bc5 (3... Nf6 {The Two Knights.} 4. d3 {Solid — avoid the theory of 4. Ng5.} Bc5 (4... Be7 5. O-O O-O 6. Re1 d6 7. a4 {Gain space on the queenside.} a5 8. c3) 5. c3 d6 6. O-O O-O 7. Re1 a6 8. Bb3 Ba7 9. h3 {Stop ...Bg4 pinning the knight.} h6 10. Nbd2) (3... Be7 4. d4 {Hit the centre while Black is passive.} exd4 5. Nxd4 Nf6 6. Nc3 O-O 7. O-O) (3... d6 4. c3 Nf6 5. d3 Be7 6. O-O O-O 7. Re1) 4. c3 {Prepare d4 and give the bishop a retreat square on c2.} Nf6 (4... d6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 Nf6 9. O-O O-O 10. Re1) (4... Qe7 5. d4 Bb6 6. O-O d6 7. a4 a6 8. Re1) 5. d3 {The slow Italian: keep the tension and improve every piece.} d6 (5... a6 6. O-O d6 7. Re1 Ba7 8. Bb3 O-O 9. h3 h6 10. Nbd2) (5... O-O 6. O-O d6 7. Re1 a6 8. Bb3 Ba7 9. h3 h6 10. Nbd2 Re8) 6. O-O O-O (6... a6 7. Re1 Ba7 8. Bb3 O-O 9. h3 h6 10. Nbd2) 7. Re1 a6 8. Bb3 Ba7 9. h3 h6 10. Nbd2 Re8 11. Nf1 {The knight heads for g3, eyeing f5.} Be6 12. Ng3 *`,
  },
  {
    id: 'london',
    name: 'London System',
    color: 'white',
    line: '1. d4 d5 2. Bf4',
    description:
      'One setup against nearly everything: Bf4, e3, c3, Nd2, Nf3, Bd3. Easy to learn, hard to break down.',
    level: 'beginner',
    pgn: `1. d4 d5 (1... Nf6 2. Bf4 e6 (2... g6 3. e3 Bg7 4. Nf3 O-O 5. Be2 d6 6. h3 {Keep the bishop safe from ...Nh5.} Nbd7 7. O-O) (2... c5 3. e3 Nc6 4. c3 d5 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3) 3. e3 c5 4. c3 Nc6 5. Nd2 d5 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5) 2. Bf4 {The London: the bishop comes out before e3 locks it in.} Nf6 (2... c5 3. e3 Nc6 4. c3 Nf6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 Bb7 10. f4 {A Stonewall grip on e5.}) (2... e6 3. e3 Bd6 4. Bg3 Nf6 5. Nd2 O-O 6. Ngf3 c5 7. c3 Nc6 8. Bd3) (2... Bf5 3. e3 e6 4. c4 {Hit the centre once Black's bishop has left c8.} c6 5. Nc3 Nf6 6. Qb3 Qb6 7. c5 Qxb3 8. axb3) 3. e3 e6 (3... c5 4. c3 Nc6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 Bb7 10. f4) (3... Bf5 4. c4 e6 5. Nc3 c6 6. Qb3 Qb6 7. c5 Qxb3 8. axb3 Nbd7 9. Nf3) 4. Nd2 c5 5. c3 Nc6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 {The knight lands on e5, backed by the bishop on g3.} Bb7 10. f4 Ne7 11. Qf3 *`,
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    color: 'white',
    line: '1. d4 d5 2. c4',
    description:
      'The most principled way to meet 1...d5: offer the c-pawn to win the centre. Covers the Declined, Accepted, Slav and Tarrasch.',
    level: 'intermediate',
    pgn: `1. d4 d5 2. c4 {Offer the c-pawn to fight for the centre.} e6 (2... dxc4 {The Queen's Gambit Accepted.} 3. e3 {Simple: take the pawn back with Bxc4.} Nf6 (3... e5 4. Bxc4 exd4 5. exd4 Nf6 6. Nf3 Be7 7. O-O O-O 8. Nc3) (3... Be6 4. Nf3 Nf6 5. Nc3) 4. Bxc4 e6 5. Nf3 c5 6. O-O a6 7. Qe2 {Prepare Rd1 and e4.} b5 8. Bb3 Bb7 9. Rd1 Nbd7 10. Nc3) (2... c6 {The Slav.} 3. Nf3 Nf6 4. Nc3 dxc4 (4... e6 5. e3 Nbd7 6. Bd3 Bd6 7. O-O O-O 8. e4 dxe4 9. Nxe4 Nxe4 10. Bxe4) (4... a6 5. c5 Nbd7 6. Bf4 Nh5 7. Bd2) 5. a4 {Stop ...b5 so Black cannot keep the pawn.} Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 O-O 10. e4) (2... Nc6 {The Chigorin.} 3. Nf3 Bg4 4. cxd5 Bxf3 5. gxf3 Qxd5 6. e3 e5 7. Nc3 Bb4 8. Bd2) 3. Nc3 Nf6 (3... c5 {The Tarrasch.} 4. cxd5 exd5 5. Nf3 Nc6 6. g3 Nf6 7. Bg2 Be7 8. O-O O-O 9. Bg5 {Pressure the isolated d-pawn.} cxd4 10. Nxd4) (3... Be7 4. Nf3 Nf6 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 8. Bd3 Bb7 9. O-O Nbd7 10. Qe2) 4. Bg5 {The classical Queen's Gambit Declined.} Be7 (4... Nbd7 5. e3 c6 6. Nf3 Qa5 {The Cambridge Springs.} 7. Nd2 Bb4 8. Qc2 O-O 9. Be2) (4... Bb4 5. cxd5 exd5 6. e3 h6 7. Bh4 c5 8. Bd3 Nc6 9. Nge2) 5. e3 O-O 6. Nf3 h6 (6... Nbd7 7. Rc1 c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 11. O-O Nxc3 12. Rxc3) 7. Bh4 b6 8. Bd3 Bb7 9. O-O Nbd7 10. Qe2 c5 11. Rfd1 *`,
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    color: 'black',
    line: '1. e4 c6',
    description:
      'A rock-solid answer to 1. e4: support ...d5 with the c-pawn and get the light-squared bishop out before ...e6.',
    level: 'beginner',
    pgn: `1. e4 c6 {The Caro-Kann: solid, and the c8-bishop gets out.} 2. d4 (2. Nc3 d5 3. Nf3 Bg4 {Pin, then trade for the knight.} 4. h3 Bxf3 5. Qxf3 e6 6. d4 Nf6 7. Bd3 dxe4 8. Nxe4 Nxe4 9. Qxe4 Nd7) (2. Nf3 d5 3. Nc3 Bg4 4. h3 Bxf3 5. Qxf3 e6 6. d4 Nf6) (2. c4 d5 3. exd5 cxd5 4. cxd5 Nf6 5. Nc3 Nxd5 6. Nf3 Nc6 7. d4 Bg4) 2... d5 3. Nc3 (3. e5 {The Advance.} Bf5 4. Nf3 (4. Nc3 e6 5. g4 Bg6 6. Nge2 c5 7. h4 h6 8. Be3 Nc6) (4. c3 e6 5. Be2 c5 6. Nf3 Nc6 7. O-O cxd4 8. cxd4 Nge7) 4... e6 5. Be2 c5 6. O-O Nc6 7. c3 cxd4 8. cxd4 Nge7 9. Nc3 Nc8 {The knight reroutes to b6 or d6.}) (3. exd5 cxd5 4. Bd3 {The Exchange.} Nc6 5. c3 Qc7 {Stop Bf4.} 6. Ne2 Bg4 7. f3 Bd7 8. Bf4 Qd8 9. O-O e6) (3. Nd2 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6) 3... dxe4 4. Nxe4 Bf5 {The classical main line.} (4... Nd7 {Karpov's move.} 5. Nf3 Ngf6 6. Nxf6+ Nxf6 7. Bc4 Bf5 8. O-O e6 9. c3 Be7) 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bd2 Ngf6 12. O-O-O Be7 *`,
  },
  {
    id: 'qgd',
    name: "Queen's Gambit Declined",
    color: 'black',
    line: '1. d4 d5 2. c4 e6',
    description:
      'The classical answer to 1. d4: keep the centre with ...e6, develop naturally, and equalise with the Tartakower ...b6.',
    level: 'intermediate',
    pgn: `1. d4 d5 2. c4 e6 {Decline the gambit and keep a solid centre.} 3. Nc3 (3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 8. Bd3 Bb7 9. O-O Nbd7 10. Qe2 c5) (3. cxd5 exd5 4. Nc3 Nf6 5. Bg5 c6 6. e3 Bf5 7. Qf3 Bg6 8. Bxf6 Qxf6 9. Qxf6 gxf6) 3... Nf6 4. Bg5 (4. Nf3 Be7 5. Bf4 {The Harrwitz.} O-O 6. e3 c5 7. dxc5 Bxc5 8. Qc2 Nc6 9. a3 Qa5 10. Rd1) (4. cxd5 exd5 5. Bg5 c6 6. e3 Bf5 7. Qf3 Bg6 8. Bxf6 Qxf6 9. Qxf6 gxf6 10. Nf3 Nd7) (4. e3 Be7 5. Nf3 O-O 6. Bd3 dxc4 7. Bxc4 c5 8. O-O a6 9. a4 Nc6) 4... Be7 5. e3 O-O 6. Nf3 h6 {Ask the bishop first.} 7. Bh4 (7. Bxf6 Bxf6 8. Qc2 c5 9. dxc5 dxc4 10. Bxc4 Qa5 11. O-O Bxc3 12. Qxc3 Qxc3 13. bxc3 Nd7) 7... b6 {The Tartakower: fianchetto and equalise.} 8. Bd3 (8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8) (8. Be2 Bb7 9. Bxf6 Bxf6 10. cxd5 exd5 11. b4 c6 12. O-O Nd7) 8... Bb7 9. O-O Nbd7 10. Qe2 c5 11. Rfd1 Ne4 12. Bg3 Nxc3 13. bxc3 *`,
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defence',
    color: 'black',
    line: '1. e4 d5',
    description:
      'Meet 1. e4 head-on. Few lines to learn, a clear plan (…c6, …Bf5, …e6, …Bb4) and a queen that is annoying on a5.',
    level: 'beginner',
    pgn: `1. e4 d5 {The Scandinavian: challenge e4 at once.} 2. exd5 (2. Nc3 d4 3. Nce2 e5 4. Ng3 Be6 5. Nf3 Nc6 6. Bb5 Bd6) (2. e5 c5 3. Nf3 Nc6 4. Bb5 Bg4 5. h3 Bxf3 6. Qxf3 e6) 2... Qxd5 3. Nc3 (3. Nf3 Bg4 4. Be2 Nc6 5. d4 O-O-O 6. c4 Qf5 7. Be3 Bxf3 8. Bxf3 Nxd4) (3. d4 Nf6 4. Nf3 Bg4 5. Be2 Nc6 6. c4 Qf5 7. Be3 O-O-O) 3... Qa5 {The classical square: the queen will pin the c3-knight once ...Bb4 arrives.} 4. d4 (4. Nf3 Nf6 5. d4 c6 6. Bc4 Bf5 7. Bd2 e6 8. Qe2 Bb4 9. O-O-O Nbd7) (4. Bc4 Nf6 5. d3 c6 6. Bd2 Bf5 7. Qe2 e6 8. Nf3 Bb4 9. O-O Nbd7) 4... Nf6 5. Nf3 (5. Bd2 c6 6. Bc4 Bf5 7. Nf3 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7) (5. Bc4 c6 6. Nf3 Bf5 7. Bd2 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7) 5... c6 {Secure the queen's retreat and the d5-square.} 6. Bc4 (6. Bd2 Bf5 7. Bc4 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7) (6. Ne5 Be6 7. Bd3 Nbd7 8. Nxd7 Nxd7 9. O-O Nb6) 6... Bf5 7. Bd2 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7 12. Ne5 Nxe5 13. dxe5 Nd5 *`,
  },
  {
    id: 'kia',
    name: "King's Indian Attack",
    color: 'white',
    line: '1. Nf3 d5 2. g3',
    description:
      'A system, not a set of lines: Nf3, g3, Bg2, O-O, d3, Nbd2, e4 against almost anything, then a kingside attack with e5 and Nf1–h2–g4.',
    level: 'beginner',
    pgn: `1. Nf3 d5 (1... Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O 5. d3 d5 6. Nbd2 c5 7. e4 Nc6 8. Re1 e5 9. c3 {Fight for d4 and keep the centre closed.} h6 10. a4) (1... c5 2. g3 Nc6 3. Bg2 e5 4. O-O d6 5. d3 Nf6 6. e4 Be7 7. Nbd2 O-O 8. c3 {A reversed King's Indian with an extra tempo.} h6 9. a4 Be6 10. Nc4) 2. g3 {The King's Indian Attack: the same setup against everything.} Nf6 (2... c5 3. Bg2 Nc6 4. O-O e6 5. d3 Nf6 6. Nbd2 Be7 7. e4 O-O 8. Re1 b5 9. e5 {Space and a kingside attack; the knight goes to f1 and h2.} Nd7 10. Nf1 a5 11. h4 b4 12. Bf4) (2... Bg4 3. Bg2 Nd7 4. O-O e6 5. d3 Ngf6 6. Nbd2 Bd6 7. h3 Bh5 8. e4 O-O 9. Qe1 {Prepare e5 without allowing ...dxe4 with tempo.} c6 10. e5 Be7 11. g4 Bg6 12. Nh4) (2... c6 3. Bg2 Bg4 4. O-O Nd7 5. d3 Ngf6 6. Nbd2 e5 7. e4 dxe4 8. dxe4 Bc5 9. h3 Bh5 10. Qe1 O-O 11. Nh4) 3. Bg2 e6 (3... c6 4. O-O Bf5 5. d3 e6 6. Nbd2 h6 7. Qe1 {The queen steps off the d-file and supports e4.} Be7 8. e4 Bh7 9. Qe2 O-O 10. Re1) (3... g6 4. O-O Bg7 5. d3 O-O 6. Nbd2 c5 7. e4 Nc6 8. Re1 e5 9. c3 h6 10. a4 Be6 11. exd5 Nxd5 12. Nc4) (3... Bf5 4. O-O e6 5. d3 h6 6. Nbd2 Be7 7. Qe1 O-O 8. e4 Bh7 9. Qe2 c5 10. e5 Nfd7 11. Re1 Nc6 12. Nf1) 4. O-O Be7 (4... c5 5. d3 Nc6 6. Nbd2 Be7 7. e4 O-O 8. Re1 b5 9. e5 Nd7 10. Nf1 a5 11. h4 b4 12. Bf4 a4 13. N1h2 {The knight heads for g4; the attack plays itself.}) 5. d3 O-O 6. Nbd2 c5 7. e4 Nc6 8. Re1 b5 9. e5 Nd7 10. Nf1 {The classic KIA plan: knight to f1, h4, Bf4, Nh2–g4.} b4 11. h4 a5 12. Bf4 a4 13. N1h2 Ba6 14. Ng4 *`,
  },
  {
    id: 'slav',
    name: 'Slav Defence',
    color: 'black',
    line: '1. d4 d5 2. c4 c6',
    description:
      'Solid against 1. d4 without locking in the light-squared bishop: ...c6, ...dxc4 and ...Bf5, with the a6 Slav and the Exchange covered.',
    level: 'intermediate',
    pgn: `1. d4 d5 2. c4 c6 {The Slav: support d5 with the c-pawn and keep the c8-bishop free.} 3. Nf3 (3. Nc3 Nf6 4. e3 (4. Nf3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 Bg6 {Keep the bishop safe and prepare ...e5.} 10. e4 O-O) 4... Bf5 5. cxd5 cxd5 6. Qb3 Qc7 7. Bd2 e6 8. Rc1 Nc6 9. Nf3 Bd6) (3. cxd5 cxd5 {The Exchange Slav: symmetrical but not dead.} 4. Nc3 Nf6 5. Bf4 Nc6 6. e3 Bf5 7. Nf3 e6 8. Bb5 Nd7 9. Qa4 Qb6 10. Bxc6 bxc6 11. Ne5 Rc8) (3. e3 Bf5 4. Nc3 e6 5. Nf3 Nd7 6. Bd3 Bxd3 7. Qxd3 Ngf6 8. O-O Be7 9. e4 dxe4 10. Nxe4 O-O) 3... Nf6 4. Nc3 (4. e3 Bf5 5. Nc3 e6 6. Nh4 Bg6 7. Nxg6 hxg6 8. Bd3 Nbd7 9. O-O Bd6 10. h3 O-O) (4. Qc2 dxc4 5. Qxc4 Bf5 6. Nc3 e6 7. g3 Nbd7 8. Bg2 Be7 9. O-O O-O 10. e4 Bg6) (4. Qb3 dxc4 5. Qxc4 Bf5 6. Nc3 e6 7. g3 Nbd7 8. Bg2 Be7 9. O-O O-O) 4... dxc4 {Take the pawn: White must spend a tempo on a4 to win it back.} 5. a4 (5. e4 b5 6. e5 Nd5 7. a4 e6 8. axb5 Nxc3 9. bxc3 cxb5 10. Ng5 Bb7 11. Qh5 g6 12. Qg4 Be7) (5. e3 b5 6. a4 b4 7. Nb1 Ba6 8. Be2 e6 9. O-O Be7 10. Nbd2 O-O) 5... Bf5 6. e3 (6. Ne5 Nbd7 7. Nxc4 Qc7 8. g3 e5 9. dxe5 Nxe5 10. Bf4 Nfd7 11. Bg2 f6 12. O-O Be7) (6. Nh4 e6 7. Nxf5 exf5 8. e3 Bb4 9. Bxc4 O-O 10. O-O Nbd7 11. Qc2 g6) 6... e6 7. Bxc4 Bb4 {Pin the knight and prepare ...O-O and ...Nbd7.} 8. O-O (8. Qb3 Qe7 9. O-O O-O 10. Bd2 Nbd7 11. Rfd1 Bg6) 8... Nbd7 9. Qe2 (9. Nh4 O-O 10. Nxf5 exf5 11. Qc2 g6 12. f3 Re8) 9... Bg6 10. e4 O-O 11. Bd3 Bh5 12. e5 Nd5 13. Nxd5 cxd5 *`,
  },
  {
    id: 'french',
    name: 'French Defence',
    color: 'black',
    line: '1. e4 e6 2. d4 d5',
    description:
      'A solid, strategic answer to 1.e4: a pawn chain, a counter-punch with ...c5, and clear plans against every white setup.',
    level: 'intermediate',
    pgn: `1. e4 e6 2. d4 d5 {The French: a solid pawn chain and play against White's centre.} 3. Nc3 (3. e5 {The Advance: hit the chain at its base with ...c5 and ...Qb6.} c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 (6. Be2 cxd4 7. cxd4 Nh6 {The knight goes to f5 to pressure d4.} 8. Nc3 Nf5 9. Na4 Qa5+ 10. Bd2 Bb4 11. Bc3 b5) Nh6 7. b4 cxd4 8. cxd4 Nf5 9. Bb2 Be7 10. Bd3 Bd7 11. O-O O-O) (3. exd5 {The Exchange: develop actively and use the open e-file.} exd5 4. Nf3 Bd6 5. Bd3 Ne7 6. O-O Bf5 7. Re1 O-O 8. Nc3 c6 9. Bxf5 Nxf5 10. Ne2 Nd7 11. c3 Re8) (3. Nd2 {The Tarrasch: strike immediately with ...c5.} c5 4. exd5 (4. Ngf3 cxd4 5. exd5 Qxd5 6. Bc4 Qd6 7. O-O Nf6 8. Nb3 Nc6 9. Nbxd4 Nxd4 10. Nxd4 a6 11. Re1 Qc7 12. Bb3 Bd6) exd5 5. Ngf3 Nc6 6. Bb5 Bd6 7. O-O Nge7 {The isolated d-pawn buys free development and active pieces.} 8. dxc5 Bxc5 9. Nb3 Bd6 10. Re1 O-O 11. Bd3 Bg4) (3. Bd3 {A rare sideline: take the centre.} dxe4 4. Bxe4 Nf6 5. Bf3 c5 6. Ne2 Nc6 7. Be3 cxd4 8. Nxd4 Nxd4 9. Bxd4 Bd6 10. O-O O-O) Bb4 {The Winawer: pin the knight and double White's pawns.} 4. e5 (4. exd5 exd5 5. Bd3 Nc6 6. a3 Bxc3+ 7. bxc3 Nge7 8. Qh5 Be6 9. Ne2 Qd7 10. O-O O-O-O {Opposite-side castling: the h-file and ...g5 are Black's play.}) c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Nf3 (7. Qg4 {The poisoned pawn: allow Qxg7 and take the centre.} Qc7 8. Qxg7 Rg8 9. Qxh7 cxd4 10. Ne2 Nbc6 11. f4 Bd7 12. Qd3 dxc3) Nbc6 8. Bd3 Qa5 9. Bd2 c4 {Close the queenside; White's bishop pair has no targets.} 10. Be2 Bd7 11. O-O O-O-O 12. a4 Kb8 *`,
  },
  {
    id: 'english',
    name: 'English Opening',
    color: 'white',
    line: '1. c4',
    description:
      'A flexible flank opening: fianchetto the bishop, control d5 and choose between a reversed Sicilian and a quiet Symmetrical.',
    level: 'intermediate',
    pgn: `1. c4 {The English: control d5 from the side and fianchetto the bishop.} e5 (1... c5 {The Symmetrical: mirror images until someone breaks in the centre.} 2. Nc3 Nc6 (2... Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nc7 6. Nf3 Nc6 7. O-O e5 8. d3 Be7 9. Nd2 Bd7 10. Nc4 f6 11. f4) 3. g3 g6 4. Bg2 Bg7 5. Nf3 Nf6 6. O-O O-O 7. d4 {Break first: the symmetry favours the side that acts.} cxd4 8. Nxd4 Nxd4 9. Qxd4 d6 10. Qd3 Bf5 11. e4 Be6 12. b3) (1... Nf6 2. Nc3 e6 (2... g6 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6 6. O-O e5 7. d3 Nc6 8. Rb1 {The queenside expansion b4-b5 is White's plan against the King's Indian setup.} a5 9. a3 h6 10. b4 axb4 11. axb4 Be6 12. b5) 3. e4 {The Mikenas Attack: grab the centre before Black is ready.} d5 4. e5 d4 5. exf6 dxc3 6. bxc3 Qxf6 7. d4 c5 8. Nf3 h6 9. Bd3 Nc6 10. O-O cxd4 11. cxd4 Bb4) (1... e6 2. Nc3 d5 3. Nf3 Nf6 4. g3 Be7 5. Bg2 O-O 6. O-O c5 7. cxd5 exd5 8. d4 Nc6 9. Bg5 cxd4 10. Nxd4 h6 11. Be3 Re8) (1... c6 2. e4 {Against the Slav move order, take the centre.} d5 3. exd5 cxd5 4. d4 Nf6 5. Nc3 e6 6. Nf3 Bb4 7. cxd5 Nxd5 8. Bd2 Nc6 9. Bd3 O-O 10. O-O Be7 11. Re1) 2. Nc3 Nf6 (2... Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6 6. e4 {The Botvinnik setup: a wall of pawns and play on both wings.} Nge7 7. Nge2 O-O 8. O-O f5 9. exf5 gxf5 10. f4 Be6 11. Be3 Qd7 12. Qd2) 3. g3 d5 (3... Bb4 4. Bg2 O-O 5. e4 {Take the centre; the bishop pair after ...Bxc3 is a long-term asset.} Bxc3 6. bxc3 d6 7. Ne2 c5 8. O-O Nc6 9. d3 Ne8 10. f4 exf4 11. gxf4 f5 12. Be3) (3... c6 4. Nf3 e4 5. Nd4 d5 6. cxd5 Qb6 7. Nb3 cxd5 8. Bg2 Be6 9. d3 Nc6 10. O-O Be7 11. Bg5) 4. cxd5 Nxd5 5. Bg2 Nb6 {The reversed Dragon: White has an extra tempo on a famous Sicilian.} 6. Nf3 Nc6 7. O-O Be7 8. d3 O-O 9. Be3 f5 10. Rc1 Kh8 11. a3 Bf6 12. b4 *`,
  },
];

export function getBuiltInRepertoire(id: string): Repertoire | undefined {
  return BUILT_IN_REPERTOIRES.find((r) => r.id === id);
}
