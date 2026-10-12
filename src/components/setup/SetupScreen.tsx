import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Button, Card, Icon, type IconName, Segmented } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import { bringIntoView } from '@/lib/scroll';
import './setup.css';

/*
 * The one way a game is set up, in Play and in the arcade: a card in the page (not a dialog over
 * the board) with a title, a line on what the game is, its choices, and Start at the foot —
 * pinned above the bottom bar on phones. The page puts `trainer--setup` on its `.trainer` while
 * the card is up, so phones show the form alone and wide screens a preview of the board beside it.
 */

export function SetupScreen({
  title = 'New game',
  intro,
  children,
  onStart,
  startLabel = 'Start',
  startDisabled = false,
  startTestId,
  back,
  status,
  focusOnMount = false,
  testId,
}: {
  title?: string;
  /** What the game is, in a sentence or two. */
  intro?: ReactNode;
  children?: ReactNode;
  onStart: () => void;
  startLabel?: string;
  startDisabled?: boolean;
  startTestId?: string;
  /** A way back to the game on the board ("Back to the game"), when there is one. */
  back?: { label: string; onClick: () => void } | null;
  /**
   * What is still getting ready (the engine loading), beside Start. Start stays usable when the
   * game can wait for it; a setup that cannot start without it disables Start as well.
   */
  status?: ReactNode;
  /**
   * Take the focus when the card appears (opened by "New game"), and bring it into view at once.
   * Not on arriving at a page: the focus starts at the top, as on any page.
   */
  focusOnMount?: boolean;
  testId?: string;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Mount only: the card is shown afresh for each new setup.
  const focusRef = useRef(focusOnMount);
  useEffect(() => {
    const title = titleRef.current;
    if (!focusRef.current || !title) return;
    title.focus({ preventScroll: true });
    const card = title.closest<HTMLElement>('.setup');
    // In view at once, and again as the page settles around the card: the preview board takes its
    // size a frame or two later, and a scroll already under way can carry the page on. The title
    // has the focus, so it is where the eye should be.
    const bring = () => bringIntoView(title, card);
    bring();
    const frames: number[] = [];
    frames.push(
      requestAnimationFrame(() => {
        bring();
        frames.push(requestAnimationFrame(bring));
      }),
    );
    const timer = window.setTimeout(bring, 300);
    return () => {
      frames.forEach(cancelAnimationFrame);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <Card as="section" className="setup" aria-labelledby={titleId} data-testid={testId}>
      <form
        className="setup__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!startDisabled) onStart();
        }}
      >
        <h2 className="setup__title" id={titleId} ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        {intro ? <p className="setup__intro">{intro}</p> : null}
        {children}
        <div className="setup__actions">
          {status ? <div className="setup__status">{status}</div> : null}
          {back ? (
            <Button variant="ghost" onClick={back.onClick}>
              {back.label}
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            type="submit"
            disabled={startDisabled}
            data-testid={startTestId}
          >
            {startLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** A labelled group of the setup's choices: its legend, then the controls. */
export function SetupGroup({
  legend,
  hint,
  hintId,
  className,
  children,
}: {
  legend: string;
  hint?: ReactNode;
  /** The hint's id, for a control that should be described by it. */
  hintId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={['setup__group', className].filter(Boolean).join(' ')}
      aria-describedby={hint && hintId ? hintId : undefined}
    >
      <legend className="setup__label">{legend}</legend>
      {children}
      {hint ? (
        <p className="field__hint setup__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface SetupChoice<T extends string> {
  value: T;
  title: string;
  description: string;
  icon: IconName;
  /** Why this choice cannot be made now, said in place of its description. */
  unavailable?: string | null;
  /** A short label at the end of the card ("Current"). */
  badge?: ReactNode;
  testId?: string;
}

/**
 * One choice of a few, as cards that say what each is — native radio buttons, so a group is one
 * tab stop and the arrow keys move between the cards.
 */
export function ChoiceCards<T extends string>({
  name,
  legend,
  hint,
  choices,
  value,
  onChange,
}: {
  /** The radio group's name, unique on the page. */
  name: string;
  legend: string;
  hint?: ReactNode;
  choices: readonly SetupChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <SetupGroup legend={legend} hint={hint} hintId={`${id}-hint`}>
      <div className="choices setup__choices">
        {choices.map((choice) => {
          const selected = value === choice.value;
          const unavailable = !!choice.unavailable;
          const titleId = `${id}-${choice.value}`;
          return (
            <label
              key={choice.value}
              className={[
                'choice',
                'setup__choice',
                selected ? 'is-selected' : null,
                unavailable ? 'is-disabled' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid={choice.testId}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                disabled={unavailable}
                onChange={() => onChange(choice.value)}
                aria-labelledby={titleId}
                aria-describedby={`${titleId}-about`}
              />
              <span className="setup__choice-icon" aria-hidden="true">
                <Icon name={choice.icon} size={20} />
              </span>
              <span className="setup__choice-text">
                <strong id={titleId}>{choice.title}</strong>
                <small id={`${titleId}-about`}>{choice.unavailable ?? choice.description}</small>
              </span>
              {choice.badge ? <span className="setup__choice-badge">{choice.badge}</span> : null}
            </label>
          );
        })}
      </div>
    </SetupGroup>
  );
}

/** Two or three choices side by side, the full width of the card, under a label. */
export function SetupSegmented<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** Shown between the choices and the hint (a drawn position and the way to draw another). */
  children?: ReactNode;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <Segmented ariaLabel={label} value={value} onChange={onChange} options={options} block />
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

const COLOURS: readonly { value: LongColor | 'random'; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'random', label: 'Random' },
  { value: 'black', label: 'Black' },
];

/** White, Random or Black, each with its swatch. */
export function ColourChoice<T extends LongColor | 'random'>({
  label = 'Your colour',
  value,
  onChange,
  random = true,
  hint,
}: {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  /** Offer "Random" (a game where the side is drawn at the start). */
  random?: boolean;
  hint?: ReactNode;
}) {
  const options = COLOURS.filter((c) => random || c.value !== 'random').map((c) => ({
    value: c.value as T,
    label: (
      <span className="setup__colour">
        <span className={`setup__swatch setup__swatch--${c.value}`} aria-hidden="true" />
        {c.label}
      </span>
    ),
  }));
  return (
    <SetupSegmented label={label} hint={hint} value={value} onChange={onChange} options={options} />
  );
}
