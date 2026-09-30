import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import './chess-components.css';

/**
 * Keyboard move entry: type a move in algebraic notation ("Nf3", "exd5",
 * "O-O", "e8=Q") or as coordinates ("e2e4", "e7e8q") and press Enter.
 */
export function MoveInput({
  onMove,
  disabled = false,
  autoFocus = false,
  placeholder = 'Type a move, e.g. Nf3 or e2e4',
}: {
  /** Returns whether the move was accepted. */
  onMove: (notation: string) => boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const notation = value.trim();
    if (!notation) return;
    if (onMove(notation)) {
      setValue('');
      setError(null);
    } else {
      setError(`"${notation}" is not a legal move here.`);
    }
  };

  return (
    <form
      className="moveinput"
      onSubmit={submit}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <label htmlFor={id} className="sr-only">
        Enter a move
      </label>
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
      />
      <Button type="submit" size="sm" disabled={disabled || !value.trim()}>
        Play
      </Button>
      {error ? (
        <span id={`${id}-error`} className="moveinput__error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
