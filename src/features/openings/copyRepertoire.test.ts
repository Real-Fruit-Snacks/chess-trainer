import { beforeEach, describe, expect, it } from 'vitest';
import { newCard } from '@/lib/srs';
import { useRepertoire } from '@/store/repertoire';
import { copyName, findCopy, makeEditableCopy } from './copyRepertoire';
import { getBuiltInRepertoire } from './repertoires';

const italian = getBuiltInRepertoire('italian');
if (!italian) throw new Error('The Italian is built in');

describe('an editable copy of a built-in repertoire', () => {
  beforeEach(() => {
    useRepertoire.setState({ cards: {}, custom: [], sessions: [] });
  });

  it('is one of the learner’s own, with the built-in lines, and takes the progress with it', () => {
    useRepertoire.setState({
      cards: {
        'italian|e2e4': newCard(1),
        'italian|e2e4 e7e5 g1f3': newCard(2),
        'london|d2d4': newCard(3),
      },
    });
    const { copy, moved } = makeEditableCopy(italian);
    expect(moved).toBe(2);
    expect(copy).toMatchObject({
      name: 'Italian Game (my copy)',
      color: 'white',
      pgn: italian.pgn,
    });
    expect(copy.id).toMatch(/^custom-/);
    expect(Object.keys(useRepertoire.getState().cards).sort()).toEqual(
      [`${copy.id}|e2e4`, `${copy.id}|e2e4 e7e5 g1f3`, 'london|d2d4'].sort(),
    );
    expect(useRepertoire.getState().cards[`${copy.id}|e2e4`]?.due).toBe(1);
  });

  it('is made once: the copy made before is used again', () => {
    const first = makeEditableCopy(italian).copy;
    useRepertoire.setState({ cards: { 'italian|e2e4': newCard(1) } });
    const again = makeEditableCopy(italian);
    expect(again).toEqual({ copy: first, moved: 0 });
    expect(useRepertoire.getState().custom).toHaveLength(1);
    // Progress made on the built-in one since stays with it.
    expect(Object.keys(useRepertoire.getState().cards)).toEqual(['italian|e2e4']);
    expect(findCopy(italian, useRepertoire.getState().custom)).toBe(first);
    expect(findCopy({ name: italian.name, color: 'black' }, [first])).toBeUndefined();
    expect(copyName('Slav Defence')).toBe('Slav Defence (my copy)');
  });
});
