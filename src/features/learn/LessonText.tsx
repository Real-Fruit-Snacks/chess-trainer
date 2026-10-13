import type { ReactNode } from 'react';
import { renderInline } from './inline';
import './lesson-text.css';

/**
 * Renders the tiny markdown subset used in lesson content: paragraphs, "- "
 * bullet lists, "1. " numbered lists, **bold**, *italic* and `code`.
 * No HTML is ever injected — everything is built from React nodes.
 */
export function LessonText({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return <div className="lesson__text">{blocks.map((block, i) => renderBlock(block, i))}</div>;
}

function renderBlock(block: string, key: number): ReactNode {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 0 && lines.every((l) => l.startsWith('- '))) {
    return (
      <ul key={key}>
        {lines.map((l, i) => (
          <li key={i}>{renderInline(l.slice(2))}</li>
        ))}
      </ul>
    );
  }
  if (lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l))) {
    return (
      <ol key={key}>
        {lines.map((l, i) => (
          <li key={i}>{renderInline(l.replace(/^\d+\.\s/, ''))}</li>
        ))}
      </ol>
    );
  }
  return <p key={key}>{renderInline(lines.join(' '))}</p>;
}
