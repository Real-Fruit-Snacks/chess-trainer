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
  /** Lichess opening tags this repertoire covers, for "tactics from your openings" (a tag matches its sub-variations). */
  openingTags: string[];
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
    openingTags: ['Italian_Game', 'Giuoco_Piano'],
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
    openingTags: ['London_System', 'Queens_Pawn_Game_London_System'],
    pgn: `1. d4 d5 (1... Nf6 2. Bf4 e6 (2... g6 3. e3 Bg7 4. Nf3 O-O 5. Be2 d6 6. h3 {Keep the bishop safe from ...Nh5.} Nbd7 7. O-O) (2... c5 3. e3 Nc6 4. c3 d5 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3) 3. e3 c5 4. c3 Nc6 5. Nd2 d5 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5) 2. Bf4 {The London: the bishop comes out before e3 locks it in.} Nf6 (2... c5 3. e3 Nc6 4. c3 Nf6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 Bb7 10. f4 {A Stonewall grip on e5.}) (2... e6 3. e3 Bd6 4. Bg3 Nf6 5. Nd2 O-O 6. Ngf3 c5 7. c3 Nc6 8. Bd3) (2... Bf5 3. e3 e6 4. c4 {Hit the centre once Black's bishop has left c8.} c6 5. Nc3 Nf6 6. Qb3 Qb6 7. c5 Qxb3 8. axb3) 3. e3 e6 (3... c5 4. c3 Nc6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 Bb7 10. f4) (3... Bf5 4. c4 e6 5. Nc3 c6 6. Qb3 Qb6 7. c5 Qxb3 8. axb3 Nbd7 9. Nf3) 4. Nd2 c5 5. c3 Nc6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 {The knight lands on e5, backed by the bishop on g3.} Bb7 10. f4 Ne7 11. Qf3 *`,
  },
  {
    id: 'queens-gambit',
    name: 'Queen’s Gambit',
    color: 'white',
    line: '1. d4 d5 2. c4',
    description:
      'The most principled way to meet 1...d5: offer the c-pawn to win the centre. Covers the Declined, Accepted, Slav and Tarrasch.',
    level: 'intermediate',
    openingTags: [
      'Queens_Gambit_Declined',
      'Queens_Gambit_Accepted',
      'Queens_Gambit',
      'Slav_Defense',
      'Semi-Slav_Defense',
      'Tarrasch_Defense',
    ],
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
    openingTags: ['Caro-Kann_Defense'],
    pgn: `1. e4 c6 {The Caro-Kann: solid, and the c8-bishop gets out.} 2. d4 (2. Nc3 d5 3. Nf3 Bg4 {Pin, then trade for the knight.} 4. h3 Bxf3 5. Qxf3 e6 6. d4 Nf6 7. Bd3 dxe4 8. Nxe4 Nxe4 9. Qxe4 Nd7) (2. Nf3 d5 3. Nc3 Bg4 4. h3 Bxf3 5. Qxf3 e6 6. d4 Nf6) (2. c4 d5 3. exd5 cxd5 4. cxd5 Nf6 5. Nc3 Nxd5 6. Nf3 Nc6 7. d4 Bg4) 2... d5 3. Nc3 (3. e5 {The Advance.} Bf5 4. Nf3 (4. Nc3 e6 5. g4 Bg6 6. Nge2 c5 7. h4 h6 8. Be3 Nc6) (4. c3 e6 5. Be2 c5 6. Nf3 Nc6 7. O-O cxd4 8. cxd4 Nge7) 4... e6 5. Be2 c5 6. O-O Nc6 7. c3 cxd4 8. cxd4 Nge7 9. Nc3 Nc8 {The knight reroutes to b6 or d6.}) (3. exd5 cxd5 4. Bd3 {The Exchange.} Nc6 5. c3 Qc7 {Stop Bf4.} 6. Ne2 Bg4 7. f3 Bd7 8. Bf4 Qd8 9. O-O e6) (3. Nd2 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6) 3... dxe4 4. Nxe4 Bf5 {The classical main line.} (4... Nd7 {Karpov's move.} 5. Nf3 Ngf6 6. Nxf6+ Nxf6 7. Bc4 Bf5 8. O-O e6 9. c3 Be7) 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bd2 Ngf6 12. O-O-O Be7 *`,
  },
  {
    id: 'qgd',
    name: 'Queen’s Gambit Declined',
    color: 'black',
    line: '1. d4 d5 2. c4 e6',
    description:
      'The classical answer to 1. d4: keep the centre with ...e6, develop naturally, and equalise with the Tartakower ...b6.',
    level: 'intermediate',
    openingTags: ['Queens_Gambit_Declined'],
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
    openingTags: ['Scandinavian_Defense'],
    pgn: `1. e4 d5 {The Scandinavian: challenge e4 at once.} 2. exd5 (2. Nc3 d4 3. Nce2 e5 4. Ng3 Be6 5. Nf3 Nc6 6. Bb5 Bd6) (2. e5 c5 3. Nf3 Nc6 4. Bb5 Bg4 5. h3 Bxf3 6. Qxf3 e6) 2... Qxd5 3. Nc3 (3. Nf3 Bg4 4. Be2 Nc6 5. d4 O-O-O 6. c4 Qf5 7. Be3 Bxf3 8. Bxf3 Nxd4) (3. d4 Nf6 4. Nf3 Bg4 5. Be2 Nc6 6. c4 Qf5 7. Be3 O-O-O) 3... Qa5 {The classical square: the queen will pin the c3-knight once ...Bb4 arrives.} 4. d4 (4. Nf3 Nf6 5. d4 c6 6. Bc4 Bf5 7. Bd2 e6 8. Qe2 Bb4 9. O-O-O Nbd7) (4. Bc4 Nf6 5. d3 c6 6. Bd2 Bf5 7. Qe2 e6 8. Nf3 Bb4 9. O-O Nbd7) 4... Nf6 5. Nf3 (5. Bd2 c6 6. Bc4 Bf5 7. Nf3 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7) (5. Bc4 c6 6. Nf3 Bf5 7. Bd2 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7) 5... c6 {Secure the queen's retreat and the d5-square.} 6. Bc4 (6. Bd2 Bf5 7. Bc4 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7) (6. Ne5 Be6 7. Bd3 Nbd7 8. Nxd7 Nxd7 9. O-O g6) 6... Bf5 7. Bd2 e6 8. Qe2 Bb4 9. O-O-O Nbd7 10. a3 Bxc3 11. Bxc3 Qc7 12. Ne5 Nxe5 13. dxe5 Nd5 *`,
  },
  {
    id: 'kia',
    name: 'King’s Indian Attack',
    color: 'white',
    line: '1. Nf3 d5 2. g3',
    description:
      'A system, not a set of lines: Nf3, g3, Bg2, O-O, d3, Nbd2, e4 against almost anything, then a kingside attack with e5 and Nf1–h2–g4.',
    level: 'beginner',
    openingTags: ['Kings_Indian_Attack'],
    pgn: `1. Nf3 d5 (1... Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O 5. d3 d5 6. Nbd2 c5 7. e4 Nc6 8. Re1 e5 9. c3 {Fight for d4 and keep the centre closed.} 9... h6 10. a4) (1... c5 2. g3 Nc6 3. Bg2 e5 4. O-O d6 5. d3 Nf6 6. e4 Be7 7. Nbd2 O-O 8. c3 {A reversed King's Indian with an extra tempo.} 8... h6 9. a4 Be6 10. Nc4) 2. g3 {The King's Indian Attack: the same setup against everything.} 2... Nf6 (2... c5 3. Bg2 Nc6 4. O-O e6 5. d3 Nf6 6. Nbd2 Be7 7. e4 O-O 8. Re1 b5 9. e5 {Space and a kingside attack; the knight goes to f1 and h2.} 9... Nd7 10. Nf1 a5 11. h4 b4 12. Bf4) (2... Bg4 3. Bg2 Nd7 4. O-O e6 5. d3 Ngf6 6. Nbd2 Bd6 7. h3 Bh5 8. e4 O-O 9. Qe1 {Prepare e5 without allowing ...dxe4 with tempo.}) (2... c6 3. Bg2 Bg4 4. O-O Nd7 5. d3 Ngf6 6. Nbd2 e5 7. e4 dxe4 8. dxe4 Bc5 9. h3 Bh5 10. Qe1 O-O 11. Nh4) 3. Bg2 e6 (3... c6 4. O-O Bf5 5. d3 e6 6. Nbd2 h6 7. Qe1 {The queen steps off the d-file and supports e4.} 7... Be7 8. e4 Bh7 9. Qe2 O-O 10. Re1) (3... g6 4. O-O Bg7 5. d3 O-O 6. Nbd2 c5 7. e4 Nc6 8. Re1 e5 9. c3 h6 10. a4 Be6 11. exd5 Nxd5 12. Nc4) (3... Bf5 4. O-O e6 5. d3 h6 6. Nbd2 Be7 7. Qe1 O-O 8. e4 Bh7 9. Qe2 c5 10. e5 Nfd7 11. Re1 Nc6 12. Nf1) 4. O-O Be7 (4... c5 5. d3 Nc6 6. Nbd2 Be7 7. e4 O-O 8. Re1 b5 9. e5 Nd7 10. Nf1 a5 11. h4 b4 12. Bf4 a4 13. N1h2 {The knight heads for g4; the attack plays itself.}) 5. d3 O-O 6. Nbd2 c5 7. e4 Nc6 8. Re1 b5 9. e5 Nd7 10. Nf1 {The classic KIA plan: knight to f1, h4, Bf4, Nh2–g4.} 10... b4 11. h4 a5 12. Bf4 a4 13. N1h2 Ba6 14. Ng4 *`,
  },
  {
    id: 'slav',
    name: 'Slav Defence',
    color: 'black',
    line: '1. d4 d5 2. c4 c6',
    description:
      'Solid against 1. d4 without locking in the light-squared bishop: ...c6, ...dxc4 and ...Bf5, with the a6 Slav and the Exchange covered.',
    level: 'intermediate',
    openingTags: ['Slav_Defense', 'Semi-Slav_Defense'],
    pgn: `1. d4 d5 2. c4 c6 {The Slav: support d5 with the c-pawn and keep the c8-bishop free.} 3. Nf3 (3. Nc3 Nf6 4. e3 (4. Nf3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 Bg6 {Keep the bishop safe and prepare ...e5.} 10. e4 O-O) 4... Bf5 5. cxd5 cxd5 6. Qb3 Qc7 7. Bd2 e6 8. Rc1 Nc6 9. Nf3 a6) (3. cxd5 cxd5 {The Exchange Slav: symmetrical but not dead.} 4. Nc3 Nf6 5. Bf4 Nc6 6. e3 Bf5 7. Nf3 e6 8. Bb5 Nd7 9. Qa4 Qb6 10. Bxc6 bxc6 11. Ne5 Nxe5) (3. e3 Bf5 4. Nc3 e6 5. Nf3 Nd7 6. Bd3 Bxd3 7. Qxd3 Ngf6 8. O-O Be7 9. e4 dxe4 10. Nxe4 O-O) 3... Nf6 4. Nc3 (4. e3 Bf5 5. Nc3 e6 6. Nh4 Bg6 7. Nxg6 hxg6 8. Bd3 Nbd7 9. O-O Bd6 10. h3 O-O) (4. Qc2 dxc4 5. Qxc4 Bf5 6. Nc3 e6 7. g3 Nbd7 8. Bg2 Be7 9. O-O O-O 10. e4 Nxe4) (4. Qb3 dxc4 5. Qxc4 Bf5 6. Nc3 e6 7. g3 Nbd7 8. Bg2 Be7 9. O-O O-O) 4... dxc4 {Take the pawn: White must spend a tempo on a4 to win it back.} 5. a4 (5. e4 b5 6. e5 Nd5 7. a4 e6 8. axb5 Nxc3 9. bxc3 cxb5 10. Ng5 Bb7 11. Qh5 g6 12. Qg4 Be7) (5. e3 b5 6. a4 b4 7. Nb1 Ba6 8. Be2 e6 9. O-O Be7 10. Nbd2 O-O) 5... Bf5 6. e3 (6. Ne5 Nbd7 7. Nxc4 Qc7 8. g3 e5 9. dxe5 Nxe5 10. Bf4 Nfd7 11. Bg2 f6 12. O-O Be7) (6. Nh4 e6 7. Nxf5 exf5 8. e3 Bb4 9. Bxc4 O-O 10. O-O Nbd7 11. Qc2 g6) 6... e6 7. Bxc4 Bb4 {Pin the knight and prepare ...O-O and ...Nbd7.} 8. O-O (8. Qb3 Qe7 9. O-O O-O 10. Bd2 Nbd7 11. Rfd1 Bg6) 8... Nbd7 9. Qe2 (9. Nh4 O-O 10. Nxf5 exf5 11. Qc2 g6 12. f3 Rc8) 9... Bg6 10. e4 O-O 11. Bd3 Bh5 12. e5 Nd5 13. Nxd5 cxd5 *`,
  },
  {
    id: 'french',
    name: 'French Defence',
    color: 'black',
    line: '1. e4 e6 2. d4 d5',
    description:
      'A solid, strategic answer to 1.e4: a pawn chain, a counter-punch with ...c5, and clear plans against every white setup.',
    level: 'intermediate',
    openingTags: ['French_Defense'],
    pgn: `1. e4 e6 2. d4 d5 {The French: a solid pawn chain and play against White's centre.} 3. Nc3 (3. e5 {The Advance: hit the chain at its base with ...c5 and ...Qb6.} c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 (6. Be2 cxd4 7. cxd4 Nh6 {The knight goes to f5 to pressure d4.} 8. Nc3 Nf5 9. Na4 Qa5+ 10. Bd2 Bb4 11. Bc3 b5) 6... Nh6 7. b4 cxd4 8. cxd4 Nf5 9. Bb2 Be7 10. Bd3 Bd7 11. O-O O-O) (3. exd5 {The Exchange: develop actively and use the open e-file.} exd5 4. Nf3 Bd6 5. Bd3 Ne7 6. O-O Bf5 7. Re1 O-O 8. Nc3 c6 9. Bxf5 Nxf5 10. Ne2 Nd7 11. c3 Re8) (3. Nd2 {The Tarrasch: strike immediately with ...c5.} c5 4. exd5 (4. Ngf3 cxd4 5. exd5 Qxd5 6. Bc4 Qd6 7. O-O Nf6 8. Nb3 Nc6 9. Nbxd4 Nxd4 10. Nxd4 a6 11. Re1 Qc7 12. Bb3 Bd6) 4... exd5 5. Ngf3 Nc6 6. Bb5 Bd6 7. O-O Ne7 {The isolated d-pawn buys free development and active pieces.} 8. dxc5 Bxc5 9. Nb3 Bd6 10. Re1 O-O 11. Bd3 h6) (3. Bd3 {A rare sideline: take the centre.} dxe4 4. Bxe4 Nf6 5. Bf3 c5 6. Ne2 Nc6 7. Be3 cxd4 8. Nxd4 Nxd4 9. Bxd4 Bd6 10. O-O O-O) 3... Bb4 {The Winawer: pin the knight and double White's pawns.} 4. e5 (4. exd5 exd5 5. Bd3 Nc6 6. a3 Bxc3+ 7. bxc3 Nge7 8. Qh5 Be6 9. Ne2 Qd7 10. O-O O-O-O {Opposite-side castling: the h-file and ...g5 are Black's play.}) 4... c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Nf3 (7. Qg4 {The poisoned pawn: allow Qxg7 and take the centre.} Qc7 8. Qxg7 Rg8 9. Qxh7 cxd4 10. Ne2 Nbc6 11. f4 Bd7 12. Qd3 dxc3) 7... Nbc6 8. Bd3 Qa5 9. Bd2 c4 {Close the queenside; White's bishop pair has no targets.} 10. Be2 Bd7 11. O-O O-O-O 12. a4 Kb8 *`,
  },
  {
    id: 'english',
    name: 'English Opening',
    color: 'white',
    line: '1. c4',
    description:
      'A flexible flank opening: fianchetto the bishop, control d5 and choose between a reversed Sicilian and a quiet Symmetrical.',
    level: 'intermediate',
    openingTags: ['English_Opening'],
    pgn: `1. c4 {The English: control d5 from the side and fianchetto the bishop.} 1... e5 (1... c5 {The Symmetrical: mirror images until someone breaks in the centre.} 2. Nc3 Nc6 (2... Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nc7 6. Nf3 Nc6 7. O-O e5 8. d3 Be7 9. Nd2 Bd7 10. Nc4 f6 11. f4) 3. g3 g6 4. Bg2 Bg7 5. Nf3 Nf6 6. O-O O-O 7. d4 {Break first: the symmetry favours the side that acts.} 7... cxd4 8. Nxd4 Nxd4 9. Qxd4 d6 10. Qd3 Bf5 11. e4 Be6 12. b3) (1... Nf6 2. Nc3 e6 (2... g6 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6 6. O-O e5 7. d3 Nc6 8. Rb1 {The queenside expansion b4-b5 is White's plan against the King's Indian setup.} 8... a5 9. a3 h6 10. b4 axb4 11. axb4 Be6 12. b5) 3. e4 {The Mikenas Attack: grab the centre before Black is ready.} 3... d5 4. e5 d4 5. exf6 dxc3 6. bxc3 Qxf6 7. d4 c5 8. Nf3 h6 9. Bd3 Nc6 10. O-O cxd4 11. cxd4 Bb4) (1... e6 2. Nc3 d5 3. Nf3 Nf6 4. g3 Be7 5. Bg2 O-O 6. O-O c5 7. cxd5 exd5 8. d4 Nc6 9. Bg5 cxd4 10. Nxd4 h6 11. Be3 Re8) (1... c6 2. e4 {Against the Slav move order, take the centre.} 2... d5 3. exd5 cxd5 4. d4 Nf6 5. Nc3 e6 6. Nf3 Bb4 7. cxd5 Nxd5 8. Bd2 Nc6 9. Bd3 O-O 10. O-O Be7 11. Re1) 2. Nc3 Nf6 (2... Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6 6. e4 {The Botvinnik setup: a wall of pawns and play on both wings.} 6... Nge7 7. Nge2 O-O 8. O-O f5 9. exf5 gxf5 10. f4 Be6 11. Be3 Qd7 12. Qd2) 3. g3 d5 (3... Bb4 4. Bg2 O-O 5. e4 {Take the centre; the bishop pair after ...Bxc3 is a long-term asset.} 5... Bxc3 6. bxc3 d6 7. Ne2 c5 8. O-O Nc6 9. d3 Ne8 10. f4 exf4 11. gxf4 f5 12. Be3) (3... c6 4. Nf3 e4 5. Nd4 d5 6. cxd5 Qb6 7. Nb3 cxd5 8. Bg2 Be6 9. d3 Nc6 10. O-O Be7 11. Be3) 4. cxd5 Nxd5 5. Bg2 Nb6 {The reversed Dragon: White has an extra tempo on a famous Sicilian.} 6. Nf3 Nc6 7. O-O Be7 8. d3 O-O 9. Be3 f5 10. Rc1 Kh8 11. a3 Bf6 12. b4 *`,
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    color: 'white',
    line: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
    description:
      'The Spanish: long-term pressure on e5 and the c6 knight, the classical c3–d4 build-up, and answers to the Berlin, the Open and the Schliemann.',
    level: 'intermediate',
    openingTags: ['Ruy_Lopez'],
    pgn: `1. e4 e5 2. Nf3 Nc6 3. Bb5 {The Spanish: pressure on e5 through the c6 knight, and a long strategic game.} 3... a6 (3... Nf6 {The Berlin.} 4. d3 {Keep the pieces on and avoid the Berlin endgame.} 4... Bc5 (4... d6 5. c3 g6 6. O-O Bg7 7. Re1 O-O 8. Nbd2 Bd7 9. Nf1 h6 10. Ng3 Re8 11. h3) 5. c3 O-O 6. O-O d6 7. Nbd2 a6 8. Ba4 Ba7 9. h3 Ne7 10. Re1 Ng6 11. Nf1 c6 12. Ng3) (3... d6 {The Steinitz.} 4. d4 exd4 5. Nxd4 Bd7 6. Nc3 Nf6 7. O-O Be7 8. Re1 O-O 9. Bxc6 bxc6 10. b3 Re8 11. Bb2) (3... f5 {The Schliemann.} 4. d3 {Simple and sound.} 4... fxe4 5. dxe4 Nf6 6. O-O Bc5 7. Bxc6 bxc6 8. Nxe5 O-O 9. Nc3 d6 10. Nd3 Bb6 11. Qe2) (3... Nd4 {Bird's Defence.} 4. Nxd4 exd4 5. O-O Bc5 6. d3 c6 7. Ba4 Ne7 8. f4 d5 9. f5 O-O 10. Qh5 dxe4 11. dxe4) 4. Ba4 Nf6 (4... d6 5. c3 Bd7 6. d4 Nf6 7. O-O Be7 8. Re1 O-O 9. Nbd2 Re8 10. Nf1 Bf8 11. Ng3) (4... b5 5. Bb3 Na5 6. O-O d6 7. d4 Nxb3 8. axb3 f6 9. Nc3 Bb7 10. Qe2 Ne7 11. Be3) 5. O-O Be7 (5... Nxe4 {The Open Spanish.} 6. d4 b5 7. Bb3 d5 8. dxe5 Be6 9. Nbd2 Nc5 10. c3 d4 11. Bxe6 Nxe6 12. cxd4 Ncxd4 13. Ne4 Be7 14. Be3) (5... b5 6. Bb3 Bc5 7. a4 Rb8 8. c3 d6 9. d4 Bb6 10. Na3 O-O 11. axb5 axb5 12. Nxb5 Bg4 13. Be3) 6. Re1 b5 7. Bb3 d6 (7... O-O 8. c3 d6 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6 14. Nb3) 8. c3 O-O 9. h3 {The classical Spanish: stop ...Bg4 and prepare d4.} 9... Na5 (9... Nb8 {The Breyer.} 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 g6 15. a4) (9... Bb7 {The Zaitsev.} 10. d4 Re8 11. Nbd2 Bf8 12. a4 h6 13. Bc2 exd4 14. cxd4 Nb4 15. Bb1) (9... h6 {The Smyslov.} 10. d4 Re8 11. Nbd2 Bf8 12. Nf1 Bb7 13. Ng3 Na5 14. Bc2 Nc4 15. b3) 10. Bc2 c5 11. d4 Qc7 {The Chigorin.} 12. Nbd2 cxd4 (12... Nc6 13. d5 Nd8 14. a4 Rb8 15. axb5 axb5 16. b4) 13. cxd4 Nc6 14. Nb3 a5 15. Be3 a4 16. Nbd2 *`,
  },
  {
    id: 'vienna',
    name: 'Vienna Game',
    color: 'white',
    line: '1. e4 e5 2. Nc3',
    description:
      'Sidestep the Petroff and keep f4 in reserve: the Vienna Gambit against 2...Nf6 and a quiet Italian-style set-up against 2...Nc6.',
    level: 'intermediate',
    openingTags: ['Vienna_Game', 'Vienna_Gambit_with_Max_Lange_Defense'],
    pgn: `1. e4 e5 2. Nc3 {The Vienna: keep f4 in reserve and avoid the Petroff.} 2... Nf6 (2... Nc6 3. Bc4 {An Italian-like set-up without allowing ...Nf6 hitting e4 at once.} 3... Bc5 (3... Nf6 4. d3 Bb4 5. Ne2 d5 6. exd5 Nxd5 7. O-O) 4. d3 Nf6 5. f4 d6 6. Nf3 Ng4 7. Ng5 O-O 8. f5 Bf2+ 9. Kf1 Ne3+ 10. Bxe3 Bxe3 11. h4) (2... Bc5 3. Nf3 d6 4. Na4 {Trade off the strong bishop.} 4... Bb6 5. Nxb6 axb6 6. d4 exd4 7. Nxd4 Nf6 8. Bd3 O-O 9. O-O Re8 10. Bg5 Nbd7 11. Qd2) 3. f4 {The Vienna Gambit.} 3... d5 (3... exf4 4. e5 {The point: the knight must move and the centre is White's.} 4... Ng8 (4... Qe7 5. Qe2 Ng8 6. Nf3 Nc6 7. d4) 5. Nf3 d6 6. d4 dxe5 7. Qe2 Bb4 8. Qxe5+ Qe7 9. Bxf4 Nc6 10. Qxe7+ Ngxe7 11. O-O-O) (3... d6 4. Nf3 Nc6 5. Bb5 Bd7 6. d3 a6 7. Bxc6 Bxc6 8. O-O exf4 9. Bxf4 Be7 10. Qe1 O-O 11. Qg3) 4. fxe5 Nxe4 5. Nf3 {Develop; d3 will kick the knight.} 5... Be7 (5... Nc6 6. Bb5 Nxc3 7. bxc3 Be7 8. O-O O-O 9. d4 Bg4 10. Be2 f6 11. exf6 Bxf6 12. Qd3) (5... Bc5 6. d4 Bb4 7. Bd2 c5 8. Bd3 Nxc3 9. bxc3) (5... Nxc3 6. bxc3 Be7 7. d4 O-O 8. Bd3 c5 9. O-O Nc6 10. Qe1 f6 11. exf6 Bxf6 12. dxc5) 6. d4 O-O 7. Bd3 f5 (7... Nc6 8. O-O Bg4 9. Bxe4 dxe4 10. Nxe4) 8. exf6 Bxf6 9. O-O Nc6 10. Ne2 Bg4 11. c3 Qd7 12. Qe1 Rae8 13. Bf4 *`,
  },
  {
    id: 'alapin',
    name: 'Alapin Sicilian',
    color: 'white',
    line: '1. e4 c5 2. c3',
    description:
      'The anti-Sicilian for club players: build the centre with d4, dodge the Open Sicilian theory, and get clear plans against 2...d5 and 2...Nf6.',
    level: 'intermediate',
    openingTags: ['Sicilian_Defense_Alapin_Variation'],
    pgn: `1. e4 c5 2. c3 {The Alapin: prepare d4 and dodge the Open Sicilian.} 2... d5 (2... Nf6 3. e5 Nd5 4. d4 cxd4 5. Nf3 Nc6 6. cxd4 d6 7. Bc4 Nb6 8. Bb5 dxe5 9. Nxe5 Bd7 10. Nxd7 Qxd7 11. Nc3 e6 12. O-O Be7 13. d5) (2... e6 3. d4 d5 4. exd5 exd5 5. Nf3 Nc6 6. Bb5 Bd6 7. dxc5 Bxc5 8. O-O Ne7 9. Nbd2 O-O 10. Nb3 Bb6 11. Re1 Bg4 12. Be3) (2... d6 3. d4 Nf6 4. Bd3 Nc6 5. Nf3 Bg4 6. d5 Ne5 7. Nxe5 dxe5 8. Qa4+) (2... Nc6 3. d4 cxd4 4. cxd4 d5 5. exd5 Qxd5 6. Nf3 Bg4 7. Nc3 Bxf3 8. gxf3 Qxd4 9. Qxd4 Nxd4 10. Nb5 Nxb5 11. Bxb5+ Kd8 12. Bf4 e6 13. O-O-O+) (2... g6 3. d4 cxd4 4. cxd4 d5 5. e5 Nc6 6. Nc3 Bg7 7. Bb5 Bd7 8. Nf3 e6 9. O-O Nge7 10. Bg5 h6 11. Be3) 3. exd5 Qxd5 4. d4 Nf6 (4... Nc6 5. Nf3 Bg4 6. Be2 cxd4 7. cxd4 e6 8. Nc3 Qa5 9. O-O Nf6 10. h3 Bh5 11. a3 Bd6 12. Nb5) (4... e6 5. Nf3 Nf6 6. Bd3 Be7 7. O-O O-O 8. c4 Qd8 9. Nc3 cxd4 10. Nxd4 Nc6 11. Nxc6 bxc6 12. Qe2 Bb7 13. Rd1) 5. Nf3 e6 (5... Bg4 6. Be2 e6 7. h3 Bh5 8. O-O Nc6 9. Be3 cxd4 10. cxd4 Be7 11. Nc3 Qd6 12. Qb3 O-O 13. Rfd1) 6. Bd3 {Aim at h7 before the c-pawn moves to c4.} 6... Nc6 (6... Be7 7. O-O O-O 8. c4 Qd8 9. Nc3 Nc6 10. dxc5 Bxc5 11. Qe2 b6 12. Rd1) 7. O-O cxd4 8. cxd4 Be7 9. Nc3 Qd6 10. Nb5 Qd8 11. Bf4 Nd5 12. Bg3 a6 13. Nc3 O-O 14. Rc1 *`,
  },
  {
    id: 'nimzo-indian',
    name: 'Nimzo-Indian Defence',
    color: 'black',
    line: '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4',
    description:
      'The most respected answer to 1. d4: pin the knight, fight for e4 and give White doubled pawns to attack. Covers the Rubinstein, Classical, Sämisch and Leningrad.',
    level: 'intermediate',
    openingTags: ['Nimzo-Indian_Defense'],
    pgn: `1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 {The Nimzo-Indian: pin the knight and fight for e4.} 4. e3 (4. Qc2 {The Classical.} O-O 5. a3 Bxc3+ 6. Qxc3 b6 7. Bg5 Bb7 8. f3 h6 9. Bh4 d5 10. e3 Nbd7 11. cxd5 Nxd5 12. Bxd8 Nxc3 13. Bh4 Nd5 14. Bf2 c5) (4. f3 {The Sämisch spirit.} d5 5. a3 Bxc3+ 6. bxc3 c5 7. cxd5 Nxd5 8. dxc5 Qa5 9. e4 Ne7 10. Be3 O-O 11. Qb3 Qc7 12. Bb5 Nbc6 13. Ne2 Na5) (4. Nf3 c5 5. g3 cxd4 6. Nxd4 O-O 7. Bg2 d5 8. cxd5 Nxd5 9. Qb3 Qa5 10. Bd2 Nc6 11. Nxc6 bxc6 12. O-O Bxc3 13. bxc3 Ba6 14. Rfd1 Qc5) (4. Bg5 {The Leningrad.} h6 5. Bh4 c5 6. d5 d6 7. e3 Bxc3+ 8. bxc3 e5 9. Qc2 Nbd7 10. Bd3 Qe7) (4. a3 {The Sämisch.} Bxc3+ 5. bxc3 c5 6. e3 Nc6 7. Bd3 O-O 8. Ne2 b6 9. e4 Ne8 10. O-O Ba6 11. f4 f5 12. Ng3 g6) 4... O-O 5. Bd3 (5. Nf3 d5 6. Bd3 c5 7. O-O Nc6 8. a3 Bxc3 9. bxc3 dxc4 10. Bxc4 Qc7 11. Bd3 e5 12. Qc2 Re8 13. e4 c4 14. Bxc4 exd4) (5. Ne2 d5 6. a3 Bd6 7. c5 Be7 8. b4 b6 9. Nb5 bxc5 10. bxc5 Nc6) 5... d5 6. Nf3 c5 7. O-O Nc6 8. a3 Bxc3 9. bxc3 dxc4 10. Bxc4 Qc7 {The main line: pressure on c3, and ...e5 comes next.} 11. Bd3 e5 12. Qc2 Re8 13. e4 c4 14. Bxc4 exd4 15. cxd4 Na5 *`,
  },
  {
    id: 'kings-indian',
    name: 'King’s Indian Defence',
    color: 'black',
    line: '1. d4 Nf6 2. c4 g6',
    description:
      'Give up the centre, then attack it: ...e5, ...f5 and a kingside storm against the Classical, with answers to the Sämisch, Averbakh and Four Pawns.',
    level: 'intermediate',
    openingTags: ['Kings_Indian_Defense'],
    pgn: `1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 (5. f3 {The Sämisch.} O-O 6. Be3 c5 7. Nge2 Nc6 8. d5 Ne5 9. Ng3 e6 10. Be2 exd5 11. cxd5 a6 12. a4 Bd7 13. O-O b5) (5. Be2 O-O 6. Bg5 {The Averbakh.} 6... Na6 7. Qd2 e5 8. d5 c6 9. f3 cxd5 10. cxd5 Bd7 11. Bd3 Qb6 12. Nge2 Nc5) (5. f4 {The Four Pawns.} O-O 6. Nf3 c5 7. d5 e6 8. Be2 exd5 9. cxd5 Re8 10. e5 dxe5 11. fxe5 Ng4 12. Bg5 Qb6 13. O-O Nxe5) (5. h3 O-O 6. Be3 e5 7. d5 Na6 8. g4 Nc5 9. f3 c6 10. Qd2 cxd5 11. cxd5 a5 12. Nge2 Bd7) 5... O-O 6. Be2 e5 7. O-O (7. d5 a5 8. Bg5 h6 9. Bh4 Na6 10. Nd2 Qe8 11. O-O Bd7 12. b3 Nh7 13. a3 h5) (7. Be3 Ng4 8. Bg5 f6 9. Bh4 Nc6 10. d5 Ne7 11. Nd2 Nh6 12. f3 c5 13. a3 f5) (7. dxe5 dxe5 8. Qxd8 Rxd8 9. Bg5 Re8 10. Nd5 Nxd5 11. cxd5 c6 12. Bc4 cxd5 13. Bxd5 Nd7 14. O-O-O Nb6) 7... Nc6 8. d5 (8. Be3 Ng4 9. Bg5 f6 10. Bc1 f5 11. d5 Ne7 12. Ng5 h6 13. Ne6 Bxe6 14. dxe6 Nf6) 8... Ne7 9. Ne1 (9. b4 {The Bayonet.} Nh5 10. Re1 f5 11. Ng5 Nf6 12. Bf3 c6 13. Be3 h6 14. Ne6 Bxe6 15. dxe6 fxe4 16. Nxe4 Nxe4) (9. Nd2 a5 10. a3 Nd7 11. Rb1 f5 12. b4 Kh8 13. f3 Ng8 14. Qc2 Ngf6 15. Nb3 axb4) 9... Nd7 10. Be3 f5 11. f3 f4 12. Bf2 g5 13. a4 Ng6 14. a5 Rf7 15. Nb5 Nf6 *`,
  },
  {
    id: 'najdorf',
    name: 'Najdorf Sicilian',
    color: 'black',
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    description:
      'The Sicilian of champions: ...e5 against the English Attack and 6. Be2, the Poisoned Pawn against 6. Bg5, and a line against every sideline.',
    level: 'intermediate',
    openingTags: ['Sicilian_Defense_Najdorf_Variation'],
    pgn: `1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 {The Najdorf: ...e5 and ...b5 are coming, and Nb5 is stopped for good.} 6. Be3 (6. Bg5 {The classical main line.} e6 7. f4 Be7 (7... Qb6 {The Poisoned Pawn.} 8. Qd2 Qxb2 9. Rb1 Qa3 10. f5 Nc6 11. fxe6 fxe6 12. Nxc6 bxc6 13. e5 dxe5 14. Bxf6 gxf6 15. Ne4 Qxa2) 8. Qf3 Qc7 9. O-O-O Nbd7 10. g4 b5 11. Bxf6 Nxf6 12. g5 Nd7 13. f5 Nc5 14. f6 gxf6 15. gxf6 Bf8 16. Rg1 h5) (6. Be2 e5 7. Nb3 Be7 8. O-O O-O 9. Be3 Be6 10. f4 exf4 11. Bxf4 Nc6 12. Kh1 d5 13. e5 Ne4 14. Nxe4 dxe4 15. Qe1 Qb6) (6. Bc4 {The Sozin.} e6 7. Bb3 b5 8. O-O Be7 9. Qf3 Qc7 10. Qg3 O-O 11. Bh6 Ne8 12. Rad1 Bd7 13. f4 Nc6 14. Nxc6 Bxc6) (6. f3 e5 7. Nb3 Be6 8. Be3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4) (6. h3 e5 7. Nde2 h5 8. g3 Be6 9. Bg2 Nbd7 10. O-O Be7 11. a4 Rc8 12. Be3 O-O 13. Qd2 Qc7) (6. g3 e5 7. Nde2 Be7 8. Bg2 O-O 9. O-O Nbd7 10. h3 b5 11. a3 Bb7 12. g4 Rc8 13. Ng3 Nb6) (6. a4 e5 7. Nf3 Be7 8. Bc4 O-O 9. O-O Be6 10. Bxe6 fxe6 11. Ng5 Qd7 12. Qe2 Nc6 13. Be3 h6) 6... e5 7. Nb3 Be6 8. f3 Be7 (8... h5 {Stop g4 at once.} 9. Qd2 Nbd7 10. O-O-O Be7 11. Kb1 Rc8 12. g3 O-O) 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 *`,
  },
];

export function getBuiltInRepertoire(id: string): Repertoire | undefined {
  return BUILT_IN_REPERTOIRES.find((r) => r.id === id);
}
