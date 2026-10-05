import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LichessRatings } from '@/lib/lichess/auth';
import {
  isLichessPuzzleId,
  LICHESS_STORAGE_KEY,
  MAX_PENDING_PUZZLES,
  MAX_SENT,
  onLichessQueue,
  repairLichess,
  useLichess,
} from './lichess';
import { PROFILE_SCOPED_KEYS } from './profiles';
import type { GameRecord } from './progress';

const game = (id: string, pgn = '1. e4 *'): GameRecord => ({
  id,
  at: 1,
  level: 1,
  color: 'white',
  result: '1-0',
  reason: 'resignation',
  plies: 1,
  pgn,
  source: 'play',
});

const RATINGS: LichessRatings = {
  puzzle: { rating: 1800, rd: 60, games: 100, prov: false },
  bullet: null,
  blitz: null,
  rapid: null,
  classical: null,
  at: 1,
};

const ACCOUNT = { id: 'learner', username: 'Learner', token: 'lip_a', expiresAt: null };

function connect(username = 'Learner', now = 1000) {
  useLichess.getState().connect({ ...ACCOUNT, username, id: username.toLowerCase() }, RATINGS, now);
}

describe('Lichess connection store', () => {
  beforeEach(() => {
    localStorage.clear();
    useLichess.getState().forget();
  });

  it('is kept per profile and recognises Lichess puzzle ids', () => {
    expect(PROFILE_SCOPED_KEYS).toContain(LICHESS_STORAGE_KEY);
    expect(isLichessPuzzleId('6Mhmf')).toBe(true);
    expect(isLichessPuzzleId('own-123')).toBe(false);
    expect(isLichessPuzzleId('abcdef')).toBe(false);
  });

  it('queues results only while connected with puzzles on, a clean solve as a win', () => {
    const lichess = () => useLichess.getState();
    lichess().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true }, 1);
    expect(lichess().outbox.puzzles).toEqual([]);
    connect();
    lichess().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true }, 2);
    lichess().notePuzzle({ id: 'BBBBB', solved: true, clean: false, rated: true }, 3);
    lichess().notePuzzle({ id: 'CCCCC', solved: false, clean: true, rated: false }, 4);
    lichess().notePuzzle({ id: 'own-1', solved: true, clean: true, rated: true }, 5);
    expect(lichess().outbox.puzzles).toEqual([
      { id: 'AAAAA', win: true, rated: true, at: 2 },
      { id: 'BBBBB', win: false, rated: true, at: 3 },
      { id: 'CCCCC', win: false, rated: false, at: 4 },
    ]);
    lichess().setOption('puzzles', false);
    lichess().notePuzzle({ id: 'DDDDD', solved: true, clean: true, rated: true }, 6);
    expect(lichess().outbox.puzzles).toHaveLength(3);
  });

  it('keeps the newest results past the cap', () => {
    connect();
    for (let i = 0; i < MAX_PENDING_PUZZLES + 5; i++) {
      useLichess.getState().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true }, i);
    }
    const queued = useLichess.getState().outbox.puzzles;
    expect(queued).toHaveLength(MAX_PENDING_PUZZLES);
    expect(queued[0]?.at).toBe(5);
  });

  it('queues each game once, only while connected with games on', () => {
    const lichess = () => useLichess.getState();
    lichess().noteGame(game('g1'), 1);
    connect();
    lichess().noteGame(game('g1'), 2);
    lichess().noteGame(game('g1'), 3);
    expect(lichess().outbox.games).toEqual([{ record: game('g1'), at: 2 }]);
    lichess().gameDone('g1');
    expect(lichess().outbox.games).toEqual([]);
  });

  it('announces what joins the outbox', () => {
    const heard = vi.fn();
    const stop = onLichessQueue(heard);
    connect();
    useLichess.getState().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true });
    useLichess.getState().noteGame(game('g'));
    useLichess.getState().queueBacklog([], []);
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    useLichess.getState().noteGame(game('h'));
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('merges the backlog oldest first without doubling games, and marks it done', () => {
    connect();
    useLichess.getState().notePuzzle({ id: 'NEWER', solved: true, clean: true, rated: true }, 50);
    useLichess.getState().noteGame(game('g2'), 60);
    useLichess.getState().queueBacklog(
      [{ id: 'OLDER', win: false, rated: true, at: 10 }],
      [
        { record: game('g1'), at: 5 },
        { record: game('g2'), at: 60 },
      ],
    );
    const state = useLichess.getState();
    expect(state.outbox.puzzles.map((p) => p.id)).toEqual(['OLDER', 'NEWER']);
    expect(state.outbox.games.map((g) => g.record.id)).toEqual(['g1', 'g2']);
    expect(state.backlog).toBe('done');
  });

  it('clears sent results and remembers their ids, newest kept past the cap', () => {
    connect();
    const lichess = () => useLichess.getState();
    lichess().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true }, 1);
    lichess().notePuzzle({ id: 'AAAAA', solved: false, clean: true, rated: true }, 2);
    lichess().puzzlesSent([{ id: 'AAAAA', win: true, rated: true, at: 1 }], 99);
    expect(lichess().outbox.puzzles.map((p) => p.at)).toEqual([2]);
    expect(lichess().sent).toEqual({ AAAAA: 99 });

    const batch = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `P${String(from + i).padStart(4, '0')}`,
        win: true,
        rated: true,
        at: i,
      }));
    lichess().puzzlesSent(batch(0, MAX_SENT), 1000);
    lichess().puzzlesSent(batch(MAX_SENT, 3), 2000);
    expect(Object.keys(lichess().sent)).toHaveLength(MAX_SENT);
    expect(lichess().sent[`P${MAX_SENT + 2}`]).toBe(2000);
  });

  it('keeps the bookkeeping for the same account and starts afresh for another', () => {
    connect('Learner', 1000);
    const lichess = () => useLichess.getState();
    lichess().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true }, 1);
    lichess().setCursor('activity', 77);
    lichess().setStudySync({ links: {}, refused: { 'rep:x': 'h' } });
    lichess().finishBacklog();
    lichess().disconnect();
    expect(lichess().account).toBeNull();
    expect(lichess().outbox.puzzles).toHaveLength(1);

    connect('learner', 2000);
    expect(lichess().outbox.puzzles).toHaveLength(1);
    expect(lichess().cursors.activity).toBe(77);
    expect(lichess().account?.connectedAt).toBe(2000);
    // Offered again: what was recorded while disconnected is not in the outbox.
    expect(lichess().backlog).toBe('unasked');

    connect('Someone', 3000);
    expect(lichess().outbox.puzzles).toEqual([]);
    expect(lichess().cursors.activity).toBeNull();
    expect(lichess().refused).toEqual({});
    expect(lichess().syncedUser).toBe('Someone');
  });

  it('starts the matching over after an import, keeping the account and the outbox', () => {
    connect();
    const lichess = () => useLichess.getState();
    lichess().notePuzzle({ id: 'AAAAA', solved: true, clean: true, rated: true }, 1);
    lichess().setStudySync({
      links: {
        'rep:x': {
          studyId: 'st000001',
          chapterId: 'ch000001',
          localHash: 'a',
          remoteHash: 'b',
          name: 'X',
          group: 'Repertoires',
          color: 'white',
        },
      },
      studyStamps: { st000001: 5 },
    });
    lichess().setCursor('activity', 5);
    lichess().markSynced(9);
    lichess().restartSync();
    expect(lichess().links).toEqual({});
    expect(lichess().studyStamps).toEqual({});
    expect(lichess().cursors).toEqual({ activity: null, games: null, studies: null });
    expect(lichess().lastSyncAt).toBeNull();
    expect(lichess().account?.username).toBe('Learner');
    expect(lichess().outbox.puzzles).toHaveLength(1);
    lichess().forget();
    expect(lichess().account).toBeNull();
    expect(lichess().outbox.puzzles).toEqual([]);
  });

  it('offers the backlog again when puzzles or games are switched back on', () => {
    connect();
    useLichess.getState().finishBacklog();
    useLichess.getState().setOption('puzzles', false);
    expect(useLichess.getState().backlog).toBe('done');
    useLichess.getState().setOption('studies', true);
    expect(useLichess.getState().backlog).toBe('done');
    useLichess.getState().setOption('puzzles', true);
    expect(useLichess.getState().backlog).toBe('unasked');
  });

  it('remembers the deletion of a linked item only, once', () => {
    connect();
    useLichess.getState().setStudySync({
      links: {
        'rep:a': {
          studyId: 'st000001',
          chapterId: 'ch000001',
          localHash: 'l',
          remoteHash: 'r',
          name: 'A',
          group: 'Repertoires',
          color: 'white',
        },
      },
    });
    useLichess.getState().noteDeleted('rep:a');
    useLichess.getState().noteDeleted('rep:a');
    useLichess.getState().noteDeleted('rep:b');
    expect(useLichess.getState().deleted).toEqual(['rep:a']);
    useLichess.getState().restartSync();
    expect(useLichess.getState().deleted).toEqual([]);
  });

  it('repairs a damaged save field by field', () => {
    const repaired = repairLichess({
      account: { id: 'x', username: 'X', token: '' },
      syncedUser: 5,
      needsReconnect: 'yes',
      options: { puzzles: false, games: 'no' },
      outbox: {
        puzzles: [
          { id: 'AAAAA', win: true, rated: false, at: 1 },
          { id: 'bad id', win: true, rated: false, at: 1 },
          { id: 'BBBBB', win: 'yes', rated: false, at: 1 },
        ],
        games: [{ record: game('g'), at: 2 }, { record: { id: 3 } }, { recordId: 'old' }],
      },
      sent: { AAAAA: 4, 'not-an-id': 5, CCCCC: 'x' },
      cursors: { activity: 10, games: 'x' },
      links: {
        good: {
          studyId: 's',
          chapterId: 'c',
          localHash: 'l',
          remoteHash: 'r',
          name: 'n',
          group: 'g',
        },
        purple: {
          studyId: 's',
          chapterId: 'c',
          localHash: 'l',
          remoteHash: 'r',
          name: 'n',
          group: 'g',
          color: 'purple',
        },
        bad: { studyId: 's' },
      },
      studyStamps: { s: 3, t: 'x' },
      refused: { 'rep:a': 'h', 'rep:b': 4 },
      ratings: { puzzle: { rating: 1500 }, blitz: 'x', at: 'y' },
      lastSyncAt: Infinity,
      backlog: 'done',
    });
    expect(repaired.account).toBeNull();
    expect(repaired.syncedUser).toBeNull();
    expect(repaired.needsReconnect).toBe(false);
    expect(repaired.options).toEqual({ puzzles: false, rating: true, games: true, studies: true });
    expect(repaired.outbox.puzzles).toEqual([{ id: 'AAAAA', win: true, rated: false, at: 1 }]);
    expect(repaired.outbox.games).toEqual([{ record: game('g'), at: 2 }]);
    expect(repaired.sent).toEqual({ AAAAA: 4 });
    expect(repaired.cursors).toEqual({ activity: 10, games: null, studies: null });
    expect(Object.keys(repaired.links)).toEqual(['good']);
    expect(repaired.links.good?.color).toBeNull();
    expect(repaired.studyStamps).toEqual({ s: 3 });
    expect(repaired.refused).toEqual({ 'rep:a': 'h' });
    expect(repaired.ratings?.puzzle).toEqual({ rating: 1500, rd: 350, games: 0, prov: false });
    expect(repaired.ratings?.blitz).toBeNull();
    expect(repaired.lastSyncAt).toBeNull();
    expect(repaired.backlog).toBe('done');
    expect(repairLichess('garbage').options.studies).toBe(true);
  });
});
