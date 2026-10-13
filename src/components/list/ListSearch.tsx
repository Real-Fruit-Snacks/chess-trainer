import { type ReactNode, useId } from 'react';
import { Button, Icon } from '@/components/ui';
import { formatCount } from '@/lib/format';
import { siteConfig } from '@/site.config';
import './list.css';

/*
 * The toolbar of a long list (lessons, classic games, puzzle themes and openings, the endgame
 * drills, the glossary): a search field, the list's own filters beside it, and how many items
 * show — said to screen readers as it changes.
 */

export function ListSearch({
  value,
  onChange,
  label,
  placeholder,
  shown,
  total,
  noun,
  children,
  testId,
  note,
  countTestId,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The field's name ("Find a lesson"). */
  label: string;
  placeholder?: string;
  shown: number;
  total: number;
  /** What is counted, singular and plural ("lesson", "lessons"). */
  noun: [string, string];
  /** Filters beside the field (a level, a status). */
  children?: ReactNode;
  testId?: string;
  /** A word on the filter chosen, after the count ("to 1880"). */
  note?: string | null;
  countTestId?: string;
}) {
  const id = useId();
  const filtered = shown !== total;
  return (
    <div className="list-search" data-testid={testId}>
      <div className="list-search__row">
        <div className="list-search__field">
          <Icon name="search" size={18} className="list-search__icon" />
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <input
            id={id}
            type="search"
            className="input list-search__input"
            value={value}
            placeholder={placeholder ?? `${label}…`}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && value) {
                e.preventDefault();
                onChange('');
              }
            }}
          />
        </div>
        {children ? <div className="list-search__filters">{children}</div> : null}
      </div>
      <p className="list-search__count small muted" role="status" data-testid={countTestId}>
        {filtered
          ? `${formatCount(shown, siteConfig.locale)} of ${formatCount(total, siteConfig.locale)} ${noun[1]}`
          : `${formatCount(total, siteConfig.locale)} ${total === 1 ? noun[0] : noun[1]}`}
        {note ? ` · ${note}` : ''}
      </p>
    </div>
  );
}

/** Nothing matches: say so, with the way back to the whole list. */
export function ListNoMatch({ onClear, children }: { onClear: () => void; children: ReactNode }) {
  return (
    <div className="list-search__none" data-testid="list-no-match">
      <p className="muted">{children}</p>
      <Button size="sm" onClick={onClear}>
        Show everything
      </Button>
    </div>
  );
}
