import { describe, expect, it } from 'vitest';
import { describeReport, describeWhen } from './lichessStatus';

describe('Lichess card wording', () => {
  it('says when, briefly', () => {
    const now = Date.UTC(2026, 9, 5, 12);
    expect(describeWhen(now - 20_000, now)).toBe('just now');
    expect(describeWhen(now - 60_000, now)).toBe('1 minute ago');
    expect(describeWhen(now - 59 * 60_000, now)).toBe('59 minutes ago');
    expect(describeWhen(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(describeWhen(now - 3 * 86_400_000, now)).toMatch(/^on /);
  });

  it('sums up a sync, or says nothing when it found nothing to do', () => {
    const empty = {
      at: 0,
      puzzlesSent: 0,
      roundsAdded: 0,
      reviewsAdded: 0,
      gamesSent: 0,
      gamesAdded: 0,
      studies: null,
      problems: [],
    };
    expect(describeReport(empty)).toBeNull();
    expect(describeReport({ ...empty, puzzlesSent: 1, gamesAdded: 2 })).toBe(
      '1 puzzle result sent, 2 games from other devices.',
    );
    expect(
      describeReport({
        ...empty,
        roundsAdded: 1,
        studies: { pulled: 1, pushed: 0, copies: 0, heldBack: [], notPulled: 0, skipped: false },
      }),
    ).toBe('1 puzzle from your Lichess history, 1 repertoire or analysis updated here.');
  });
});
