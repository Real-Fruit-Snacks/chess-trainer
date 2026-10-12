import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasLearnerActivity,
  isReturningLearner,
  noteFirstVisit,
  readSeenVersion,
  SEEN_VERSION_KEY,
  writeSeenVersion,
} from './seenVersion';

const learner = (overrides: Partial<Parameters<typeof isReturningLearner>[0]> = {}) => ({
  onboarded: false,
  attempts: [],
  lessons: {},
  games: [],
  ...overrides,
});

describe('the version seen', () => {
  beforeEach(() => localStorage.clear());

  it('is kept on the device', () => {
    expect(readSeenVersion()).toBeNull();
    writeSeenVersion('0.29.0');
    expect(localStorage.getItem(SEEN_VERSION_KEY)).toBe('0.29.0');
    expect(readSeenVersion()).toBe('0.29.0');
  });

  it('survives storage that cannot be read or written', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readSeenVersion(broken)).toBeNull();
    expect(() => writeSeenVersion('0.29.0', broken)).not.toThrow();
    expect(readSeenVersion(null)).toBeNull();
  });

  it('is recorded on a newcomer’s first visit, and never over a version already seen', () => {
    noteFirstVisit(false, '0.29.0');
    expect(readSeenVersion()).toBe('0.29.0');
    noteFirstVisit(false, '0.30.0');
    expect(readSeenVersion()).toBe('0.29.0');
  });

  it('is left unrecorded for a learner from before the card, whom Home then tells', () => {
    noteFirstVisit(true, '0.29.0');
    expect(readSeenVersion()).toBeNull();
  });
});

describe('a returning learner', () => {
  it('has trained, or has at least set a level', () => {
    expect(isReturningLearner(learner())).toBe(false);
    expect(hasLearnerActivity(learner({ onboarded: true }))).toBe(false);
    expect(isReturningLearner(learner({ onboarded: true }))).toBe(true);
    expect(hasLearnerActivity(learner({ lessons: { 'the-board': {} as never } }))).toBe(true);
    expect(hasLearnerActivity(learner({ attempts: [{} as never] }))).toBe(true);
    expect(isReturningLearner(learner({ games: [{} as never] }))).toBe(true);
  });
});
