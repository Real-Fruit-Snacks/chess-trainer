import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { isPromotionShorthand } from '@/chess/helpers';
import { Button, Input } from '@/components/ui';
import './chess-components.css';

/**
 * Keyboard move entry: type a move in algebraic notation ("Nf3", "nf3", "exd5",
 * "O-O", "e8=Q", "a8=q") or as coordinates ("e2e4", "e7e8q") and press Enter.
 * A promotion typed without a piece ("e8", "e7e8") is completed by the caller
 * when auto-queen is on; otherwise the input asks for the piece.
 */
export function MoveInput({
  onMove,
  disabled = false,
  autoFocus = false,
  keepFocus = false,
  placeholder = 'Type a move, e.g. Nf3 or e2e4',
}: {
  /** Returns whether the move was accepted. */
  onMove: (notation: string) => boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Give the input focus back whenever it is re-enabled, so a player who types
   * moves is not thrown out of the field each time the engine replies.
   */
  keepFocus?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hadFocus = useRef(false);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  // Disabling an input blurs it; remember that it had focus and restore it when enabled again.
  useEffect(() => {
    if (!keepFocus) return;
    if (disabled) {
      hadFocus.current ||= document.activeElement === inputRef.current;
    } else if (hadFocus.current) {
      hadFocus.current = false;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [keepFocus, disabled]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const notation = value.trim();
    if (!notation) return;
    if (onMove(notation)) {
      setValue('');
      setError(null);
    } else if (isPromotionShorthand(notation)) {
      setError(`Name the piece to promote to: ${notation}=Q, =R, =B or =N.`);
    } else {
      setError(`"${notation}" is not a legal move here.`);
    }
  };

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <form className="moveinput" onSubmit={submit}>
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
        onFocus={() => {
          hadFocus.current = true;
        }}
        onBlur={(e) => {
          // A blur caused by disabling the field keeps the "had focus" flag.
          if (!e.currentTarget.disabled) hadFocus.current = false;
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
      />
      <Button type="submit" size="sm" disabled={disabled || !value.trim()}>
        Play
      </Button>
      <span id={hintId} className="sr-only">
        Algebraic notation such as Nf3 or e8=Q, or coordinates such as e2e4. Press Enter to play.
      </span>
      {error ? (
        <span id={errorId} className="moveinput__error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
