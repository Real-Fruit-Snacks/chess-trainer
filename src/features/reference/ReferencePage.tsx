import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Card, Input } from '@/components/ui';
import { renderInline } from '@/features/learn/inline';
import { LessonText } from '@/features/learn/LessonText';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { prefersReducedMotion } from '@/lib/useReducedMotion';
import { siteConfig } from '@/site.config';
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

  useEffect(() => {
    document.title = `Reference · ${siteConfig.name}`;
  }, []);

  useEffect(() => {
    if (location.hash) {
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [location.hash]);

  const glossary = useMemo(() => {
    const q = query.trim().toLowerCase();
    const entries = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
    if (!q) return entries;
    return entries.filter(
      (e) => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q),
    );
  }, [query]);

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
          <a key={tab.id} href={`#${tab.id}`} className="badge">
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
        <div className="row row--between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Glossary</h2>
          <label className="reference__search">
            <span className="sr-only">Search the glossary</span>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms…"
            />
          </label>
        </div>
        {glossary.length === 0 ? (
          <p className="muted">No terms match “{query}”.</p>
        ) : (
          <dl className="reference__glossary" data-testid="glossary">
            {glossary.map((entry) => {
              const lesson = entry.lesson ? getLessonMeta(entry.lesson) : undefined;
              return (
                <div key={entry.term} className="reference__entry">
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
        <div className="stack reference__faqs">
          {FAQ.map((item) => (
            <details key={item.question} className="card reference__faq">
              <summary>{item.question}</summary>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {renderInline(item.answer)}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
