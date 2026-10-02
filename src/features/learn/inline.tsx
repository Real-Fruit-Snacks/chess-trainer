import { Fragment, type ReactNode } from 'react';
import { Notated } from '@/chess/San';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

/**
 * The lesson text markup: bold, italic and code spans. Moves in the text are
 * shown in the current notation (code spans hold moves most of the time).
 */
export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE).filter((p) => p !== '');
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i}>
          <Notated text={part.slice(2, -2)} />
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i}>
          <Notated text={part.slice(1, -1)} />
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={i}>
          <Notated text={part.slice(1, -1)} />
        </em>
      );
    }
    return (
      <Fragment key={i}>
        <Notated text={part} />
      </Fragment>
    );
  });
}
