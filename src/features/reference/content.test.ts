import { describe, expect, it } from 'vitest';
import { getLesson } from '@/features/learn/lessons';
import { FAQ, GLOSSARY, NOTATION, RULES } from './content';

/** The words of a term that should appear in the step it links to ("Back rank" → "back"). */
const keyword = (term: string) => term.toLowerCase().split(/[\s(-]/)[0] ?? '';

describe('reference content', () => {
  it('links every glossary entry to a lesson (and step) that teaches the term', () => {
    for (const entry of GLOSSARY) {
      if (!entry.lesson) {
        expect(entry.step, `${entry.term}: a step needs a lesson`).toBeUndefined();
        continue;
      }
      const lesson = getLesson(entry.lesson);
      expect(lesson, `${entry.term}: lesson ${entry.lesson}`).toBeDefined();
      if (entry.step === undefined) continue;
      const step = lesson?.steps[entry.step - 1];
      expect(step, `${entry.term}: step ${entry.step} of ${entry.lesson}`).toBeDefined();
      const text = `${step?.title ?? ''} ${step?.text ?? ''}`.toLowerCase();
      expect(text, `${entry.term}: step ${entry.step} of ${entry.lesson}`).toContain(
        keyword(entry.term),
      );
    }
  });

  it('links Blockade, Zugzwang and Back rank straight to the lessons about them', () => {
    const lessonOf = (term: string) => GLOSSARY.find((e) => e.term === term)?.lesson;
    expect(lessonOf('Blockade')).toBe('passed-pawns-in-the-middlegame');
    expect(lessonOf('Zugzwang')).toBe('fortresses-and-zugzwang');
    expect(lessonOf('Back rank')).toBe('basic-checkmates');
  });

  it('explains the terms the app prints', () => {
    const terms = GLOSSARY.map((e) => e.term);
    for (const term of ['Glicko-2', 'Rating deviation (RD)', 'DTZ (distance to zeroing)']) {
      expect(terms).toContain(term);
    }
    for (const term of ['DTM (distance to mate)', 'Tablebase', 'Woodpecker method']) {
      expect(terms).toContain(term);
    }
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('keeps its markup balanced, so nothing renders as literal asterisks', () => {
    const texts = [
      ...GLOSSARY.map((e) => e.definition),
      ...FAQ.map((f) => f.answer),
      ...RULES.map((r) => r.body),
      ...NOTATION.map((n) => n.body),
    ];
    for (const text of texts) {
      const stars = text.replace(/\*\*/g, '').match(/\*/g)?.length ?? 0;
      expect(stars % 2, text.slice(0, 60)).toBe(0);
      expect((text.match(/\*\*/g)?.length ?? 0) % 2, text.slice(0, 60)).toBe(0);
    }
  });

  it('answers the FAQ with what the app does today', () => {
    const answer = (q: RegExp) => FAQ.find((f) => q.test(f.question))?.answer ?? '';
    expect(answer(/±/)).toContain('Settings page');
    expect(answer(/±/)).not.toContain('Progress page');
    expect(answer(/backed up/)).toContain('imported games');
    expect(answer(/backed up/)).toContain('Undo import');
    expect(answer(/backed up/)).toContain('for a week');
    expect(answer(/come back/)).toContain('04:00');
    expect(answer(/change my rating/)).toContain('never costs rating points');
    expect(answer(/internet/)).toContain('first set of puzzles');
  });
});
