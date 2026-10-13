import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Card } from '@/components/ui';
import { ListNoMatch, ListSearch } from '@/components/list/ListSearch';
import { matchesAllWords } from '@/lib/textMatch';
import { renderInline } from '@/features/learn/inline';
import { LessonText } from '@/features/learn/LessonText';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { prefersReducedMotion } from '@/lib/useReducedMotion';
import { siteConfig } from '@/site.config';
import { faqAnchor, glossaryAnchor } from './anchors';
import { FAQ, GLOSSARY, NOTATION, RULES } from './content';
import './reference.css';

const TABS = [
  { id: 'rules', label: 'Rules' },
  { id: 'notation', label: 'Notation' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'faq', label: 'FAQ' },
] as const;

export default function ReferencePage() {
  const location = useLocation();
  const [query, setQuery] = useState('');
  /** The section being read, for the bar of sections that follows down the page. */
  const [current, setCurrent] = useState<(typeof TABS)[number]['id']>('rules');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const sections = TABS.map((tab) => document.getElementById(tab.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    // A section is current once its top passes the upper third of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = top?.target.id;
        const tab = TABS.find((t) => t.id === id);
        if (tab) setCurrent(tab.id);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.title = `Reference · ${siteConfig.name}`;
  }, []);

  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      // A linked question opens to its answer.
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [location.hash]);

  const glossary = useMemo(
    () =>
      [...GLOSSARY]
        .sort((a, b) => a.term.localeCompare(b.term))
        .filter((e) => matchesAllWords(query, e.term, e.definition)),
    [query],
  );

  return (
    <div className="reference">
      <div className="page-header">
        <h1>Reference</h1>
        <p>
          The rules of chess, how to read and write moves, and a glossary of the words you will
          meet.
        </p>
      </div>

      <nav className="reference__tabs" aria-label="Reference sections">
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            className="reference__tab"
            aria-current={current === tab.id ? 'location' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>

      <section id="rules" className="reference__section">
        <h2>Rules of the game</h2>
        <div className="reference__grid">
          {RULES.map((section) => (
            <Card key={section.id}>
              <h3 id={`rules-${section.id}`}>{section.title}</h3>
              <LessonText text={section.body} />
            </Card>
          ))}
        </div>
      </section>

      <section id="notation" className="reference__section">
        <h2>Notation</h2>
        <div className="reference__grid">
          {NOTATION.map((section) => (
            <Card key={section.id}>
              <h3 id={`notation-${section.id}`}>{section.title}</h3>
              <LessonText text={section.body} />
            </Card>
          ))}
        </div>
      </section>

      <section id="glossary" className="reference__section">
        <h2>Glossary</h2>
        <ListSearch
          value={query}
          onChange={setQuery}
          label="Search the glossary"
          placeholder="Search terms…"
          shown={glossary.length}
          total={GLOSSARY.length}
          noun={['term', 'terms']}
        />
        {glossary.length === 0 ? (
          <ListNoMatch onClear={() => setQuery('')}>No term matches “{query}”.</ListNoMatch>
        ) : (
          <dl className="card reference__glossary" data-testid="glossary">
            {glossary.map((entry) => {
              const lesson = entry.lesson ? getLessonMeta(entry.lesson) : undefined;
              return (
                <div key={entry.term} className="reference__entry" id={glossaryAnchor(entry.term)}>
                  <dt>{entry.term}</dt>
                  <dd>
                    {renderInline(entry.definition)}
                    {lesson ? (
                      <>
                        {' '}
                        <Link
                          to={`/learn/${lesson.id}${entry.step ? `?step=${entry.step}` : ''}`}
                          className="small"
                        >
                          Lesson: {lesson.title}
                        </Link>
                      </>
                    ) : null}
                    {entry.see ? (
                      <>
                        {' '}
                        <Link to={entry.see.to} className="small">
                          {entry.see.label}
                        </Link>
                      </>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>

      <section id="faq" className="reference__section">
        <h2>Frequently asked questions</h2>
        <div className="card reference__faqs">
          {FAQ.map((item) => (
            <details key={item.question} className="reference__faq" id={faqAnchor(item.question)}>
              <summary>{item.question}</summary>
              <p className="muted reference__answer">{renderInline(item.answer)}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
