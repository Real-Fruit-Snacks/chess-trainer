import { type Ref, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { San } from '@/chess/San';
import type { LongColor } from '@/chess/types';
import { renderInline } from './inline';
import { LessonText } from './LessonText';
import type { CoachTone, LessonMessage } from './useLessonStep';
import './learn.css';
import './coach.css';

/** The small heading over a coach message, by tone: none for the plain ones. */
const LABELS: Partial<Record<CoachTone, string>> = {
  why: 'Why it works',
  hint: 'Hint',
};

const SIDE: Record<LongColor, string> = { white: 'White', black: 'Black' };

/**
 * A lesson step as a conversation with the coach: what the coach says to open
 * it (`intro`, the step's text), then the questions, the moves played (the
 * learner's and the opponent's) and what the coach says to each. The question
 * waiting for a move (`activePrompt`) stands out, with the side to move; the
 * rest stays to be read again.
 */
export function CoachLog({
  intro,
  messages,
  activePrompt,
  turn,
  promptRef,
}: {
  intro?: string;
  messages: readonly LessonMessage[];
  activePrompt: number | null;
  turn: LongColor;
  promptRef?: Ref<HTMLDivElement>;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  // Where the conversation scrolls in a box (its own on the lesson page on wide screens,
  // the side panel on a phone held sideways), keep in view what has happened since the
  // learner's last move, or since the answer was shown: the newest words never land out
  // of sight below the box.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const own = region.scrollHeight > region.clientHeight + 1;
    // A box that scrolls can be scrolled from the keyboard too.
    if (own) region.tabIndex = 0;
    else region.removeAttribute('tabindex');
    const box = own ? region : scrollingAncestor(region);
    if (!box) return;
    const anchors = region.querySelectorAll<HTMLElement>('[data-anchor]');
    const last = anchors[anchors.length - 1];
    // At the start of a step (no move yet), the box opens at the top.
    const top = last
      ? last.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8
      : 0;
    box.scrollTop = Math.max(0, top);
  }, [messages]);

  // When the newest words run on below the box, a button says so and scrolls down to them.
  const endRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const region = regionRef.current;
    const end = endRef.current;
    if (!region || !end || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setMoreBelow(entry ? !entry.isIntersecting : false),
      { root: region },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, []);
  const showLatest = () => {
    const region = regionRef.current;
    if (!region) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    region.scrollTo({ top: region.scrollHeight, behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <div className="coach" ref={regionRef}>
      {intro ? (
        <div className="coach__intro">
          <CoachAvatar />
          <div className="coach__bubble">
            <span className="sr-only">The coach: </span>
            <LessonText text={intro} />
          </div>
        </div>
      ) : null}
      <div
        className="coach__log"
        role="log"
        aria-live="polite"
        aria-label="The coach and the moves"
        data-testid="coach-log"
      >
        {messages.map((message) =>
          message.kind === 'move' ? (
            <MoveLine key={message.id} message={message} />
          ) : message.tone === 'prompt' && message.id === activePrompt ? (
            <div
              key={message.id}
              ref={promptRef}
              tabIndex={-1}
              className="lesson__task coach__question"
              role="note"
              data-testid="lesson-task"
            >
              <span className={`turn-dot turn-dot--${turn}`} aria-hidden="true" />
              {SIDE[turn]} to move — {renderInline(message.text)}
            </div>
          ) : (
            <div
              key={message.id}
              className={`coach__msg coach__msg--${message.tone}`}
              data-testid={`coach-${message.tone}`}
              data-anchor={message.tone === 'answer' ? '' : undefined}
            >
              {LABELS[message.tone] ? (
                <span className="coach__label">{LABELS[message.tone]}</span>
              ) : null}
              <span>{renderInline(message.text)}</span>
            </div>
          ),
        )}
      </div>
      <div ref={endRef} className="coach__end" aria-hidden="true" />
      {moreBelow ? (
        <button type="button" className="coach__more" onClick={showLatest}>
          More below <Icon name="chevron-down" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/** The nearest element around `from` that scrolls its content (not the page itself), if any. */
function scrollingAncestor(from: HTMLElement): HTMLElement | null {
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    if (
      /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
  }
  return null;
}

function MoveLine({ message }: { message: Extract<LessonMessage, { kind: 'move' }> }) {
  const mine = message.who === 'you';
  return (
    <div
      className={[
        'coach__move',
        mine ? 'coach__move--you' : 'coach__move--them',
        message.wrong && 'coach__move--wrong',
      ]
        .filter(Boolean)
        .join(' ')}
      data-anchor={mine ? '' : undefined}
    >
      {mine ? (
        <Icon name={message.wrong ? 'close' : 'check'} size={14} />
      ) : (
        <span className={`turn-dot turn-dot--${message.color}`} aria-hidden="true" />
      )}
      <span>{mine ? 'You' : SIDE[message.color]}</span>
      <San san={message.san} className="coach__san" />
      {message.wrong ? <span className="sr-only"> (not the move)</span> : null}
    </div>
  );
}

/** The coach's mark beside its opening words. */
export function CoachAvatar() {
  return (
    <span className="coach__avatar" aria-hidden="true">
      <Icon name="knight" size={18} />
    </span>
  );
}

/**
 * What the coach has said since the learner's last move (or since the answer
 * was shown), for phones, where the conversation sits below the board: shown
 * right under it, so the answer to a move is read without scrolling. Nothing
 * before the first move of a step: the step opens with the coach's words in
 * the panel, read in order. A copy for the eye only (the conversation itself
 * is what assistive technology reads), with the take-back as a tap target.
 */
export function CoachLatest({
  messages,
  canTakeBack,
  onTakeBack,
}: {
  messages: readonly LessonMessage[];
  canTakeBack: boolean;
  onTakeBack: () => void;
}) {
  let from = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.kind === 'move' && m.who === 'you') {
      from = i + 1;
      break;
    }
    if (m?.kind === 'coach' && m.tone === 'answer') {
      from = i;
      break;
    }
  }
  if (from < 0) return null;
  const words = messages
    .slice(from)
    .filter((m): m is Extract<LessonMessage, { kind: 'coach' }> => m.kind === 'coach');
  if (words.length === 0 && !canTakeBack) return null;
  return (
    <div className="coach__latest" aria-hidden="true" data-testid="coach-latest">
      {words.map((message) => (
        <div key={message.id} className={`coach__msg coach__msg--${message.tone}`}>
          {LABELS[message.tone] ? (
            <span className="coach__label">{LABELS[message.tone]}</span>
          ) : null}
          <span>{renderInline(message.text)}</span>
        </div>
      ))}
      {canTakeBack ? (
        <Button variant="primary" size="sm" tabIndex={-1} onClick={onTakeBack}>
          Take back
        </Button>
      ) : null}
    </div>
  );
}
