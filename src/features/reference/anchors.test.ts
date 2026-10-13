import { describe, expect, it } from 'vitest';
import { faqAnchor, glossaryAnchor } from './anchors';
import { FAQ, GLOSSARY } from './content';

describe('reference anchors', () => {
  it('are plain ids, one for each glossary term and each question', () => {
    expect(glossaryAnchor('Zugzwang')).toBe('glossary-zugzwang');
    expect(glossaryAnchor('DTM (distance to mate)')).toBe('glossary-dtm-distance-to-mate');
    expect(glossaryAnchor('Exchange (the)')).toBe('glossary-exchange-the');
    expect(faqAnchor('Is my progress backed up anywhere?')).toBe(
      'faq-is-my-progress-backed-up-anywhere',
    );
    const ids = [
      ...GLOSSARY.map((g) => glossaryAnchor(g.term)),
      ...FAQ.map((f) => faqAnchor(f.question)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(glossary|faq)-[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
