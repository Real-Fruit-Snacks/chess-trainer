import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Badge, Button, Card, Kbd, LinkButton } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { dueReviews, nextReview } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { renderInline } from './inline';
import type { LessonStep } from './model';
import { resolveRecallCard } from './recall';
import { useLessonStep } from './useLessonStep';
import './learn.css';

export default function RecallPage() {
  const recall = useProgress((s) => s.lessonRecall);
  const dismiss = useProgress((s) => s.dismissLessonRecall);
  const now = useNow(60_000, recall);
  const due = useMemo(() => dueReviews(recall, now), [recall, now]);
  const [sessionDone, setSessionDone] = useState(0);
  // Keep showing the current card after it is graded, until "Next".
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Recall · ${siteConfig.name}`;
  }, []);

  // Drop cards whose lesson step no longer exists (content changed).
  useEffect(() => {
    for (const card of due) if (!resolveRecallCard(card.id)) dismiss(card.id);
  }, [due, dismiss]);

  const card = useMemo(() => {
    if (currentId && recall[currentId]) return recall[currentId] ?? null;
    return due.find((c) => resolveRecallCard(c.id)) ?? null;
  }, [currentId, recall, due]);
  const resolved = card ? resolveRecallCard(card.id) : null;

  useEffect(() => {
    if (card && card.id !== currentId) setCurrentId(card.id);
  }, [card, currentId]);

  if (!card || !resolved) {
    const upcoming = nextReview(recall);
    const total = Object.keys(recall).length;
    return (
      <div>
        <div className="page-header">
          <h1>Recall</h1>
          <p>Lesson positions come back a few days after you learn them, then further apart.</p>
        </div>
        <Card className="onboarding" data-testid="recall-empty">
          <p className="card__eyebrow">Lesson recall</p>
          <h2>Nothing to recall right now</h2>
          <p className="muted">
            {total === 0
              ? 'Finish a lesson and its task positions will be scheduled here: after 3 days, then 7, 14 and 30.'
              : `${total} position${total === 1 ? '' : 's'} scheduled · next due ${
                  upcoming ? formatDate(upcoming.due, siteConfig.locale) : '—'
                }.`}
            {sessionDone > 0 ? ` You recalled ${sessionDone} this session.` : ''}
          </p>
          <div className="row">
            <LinkButton variant="primary" to="/learn">
              Lessons
            </LinkButton>
            <LinkButton to="/">Home</LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header row row--between">
        <div>
          <h1>Recall</h1>
          <p>
            {due.length} due · from <strong>{resolved.title}</strong>
          </p>
        </div>
        <Badge tone="accent">Step {card.step + 1} of 5</Badge>
      </div>
      <RecallCard
        key={card.id}
        cardId={card.id}
        lessonId={resolved.lessonId}
        stepIndex={resolved.stepIndex}
        step={resolved.step}
        lessonTitle={resolved.title}
        onNext={() => {
          setSessionDone((n) => n + 1);
          setCurrentId(null);
        }}
      />
    </div>
  );
}

function RecallCard({
  cardId,
  lessonId,
  stepIndex,
  step,
  lessonTitle,
  onNext,
}: {
  cardId: string;
  lessonId: string;
  stepIndex: number;
  step: LessonStep;
  lessonTitle: string;
  onNext: () => void;
}) {
  const record = useProgress((s) => s.recordLessonRecall);
  const autoQueen = useSettings((s) => s.autoQueen);
  const [graded, setGraded] = useState<'solved' | 'failed' | null>(null);
  const missedRef = useRef(false);
  const hintRef = useRef(false);
  const state = useLessonStep(step, () => {
    if (graded) return;
    const outcome = missedRef.current ? 'failed' : 'solved';
    record(cardId, outcome, hintRef.current);
    setGraded(outcome);
  });

  // A wrong move (or revealing the answer) counts as a miss for this card.
  useEffect(() => {
    if (state.phase === 'wrong') missedRef.current = true;
    if (state.phase === 'revealed') missedRef.current = true;
  }, [state.phase]);
  useEffect(() => {
    if (state.hintLevel > 0) hintRef.current = true;
  }, [state.hintLevel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'h' && !graded) state.hint();
      if ((e.key === 'n' || e.key === 'ArrowRight') && graded) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, graded, onNext]);

  const task = step.task;
  const orientation = step.orientation ?? 'white';

  return (
    <div className="trainer">
      <div className="trainer__board" style={{ position: 'relative' }}>
        <Board
          fen={state.fen}
          orientation={orientation}
          turnColor={state.turn}
          movableColor={state.phase === 'awaiting' ? state.turn : undefined}
          dests={state.dests}
          lastMove={state.lastMove}
          check={state.check}
          shapes={graded ? state.shapes : []}
          highlights={state.highlights}
          drawable={false}
          onMove={(from, to) => state.playMove(from, to, autoQueen ? 'q' : undefined)}
          ariaLabel={`Recall position from ${lessonTitle}`}
        />
        {state.needsPromotion ? (
          <PromotionPicker color={state.turn} onSelect={state.resolvePromotion} />
        ) : null}
      </div>
      <aside className="trainer__panel stack">
        <Card>
          <p className="card__eyebrow">
            {lessonTitle}
            {step.title ? ` · ${step.title}` : ''}
          </p>
          {task ? (
            <div className="lesson__task" role="note">
              {state.turn === 'white' ? '♙ White' : '♟ Black'} to move — {renderInline(task.prompt)}
            </div>
          ) : null}
          <p
            className={`lesson__feedback ${state.phase === 'wrong' ? 'puzzle-status--failed' : state.phase === 'correct' ? 'puzzle-status--solved' : 'muted'}`}
            role="status"
            style={{ marginTop: 12 }}
          >
            {state.feedback
              ? renderInline(state.feedback)
              : state.phase === 'awaiting'
                ? 'Do you remember the move? Play it on the board.'
                : ''}
          </p>
          {graded ? (
            <p className="small muted" data-testid="recall-result">
              {graded === 'solved'
                ? hintRef.current
                  ? 'Recalled with a hint — this position keeps its current interval.'
                  : 'Recalled! It comes back later, further apart each time.'
                : 'Missed — it comes back tomorrow.'}
            </p>
          ) : null}
          <div className="lesson__actions">
            {!graded ? (
              <>
                <Button onClick={state.hint} disabled={state.phase !== 'awaiting'}>
                  Hint <Kbd>H</Kbd>
                </Button>
                <Button variant="ghost" onClick={state.reveal}>
                  Show answer
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={onNext} autoFocus>
                Next <Kbd>N</Kbd>
              </Button>
            )}
            <Link className="btn btn--ghost" to={`/learn/${lessonId}?step=${stepIndex + 1}`}>
              Reread the lesson
            </Link>
          </div>
        </Card>
      </aside>
    </div>
  );
}
