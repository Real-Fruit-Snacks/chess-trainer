import { Fragment, type ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE).filter((p) => p !== '');
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
