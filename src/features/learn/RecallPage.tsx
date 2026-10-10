import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { Badge, Button, Card, Kbd, LinkButton } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { NONE } from '@/lib/format';
import { dueReviews, nextReview, PUZZLE_REVIEW_STEPS_DAYS } from '@/lib/puzzleReview';
import { scrollBackTo } from '@/lib/scroll';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { useFocusWhile } from '@/lib/useFocusWhile';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { CoachLatest, CoachLog } from './CoachLog';
import type { LessonStep } from './model';
import { lessonsPromise, loadedLesson } from './lessons/load';
import { gradeRecall, recallCardLesson, resolveRecallCard } from './recall';
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

  // The lessons of the due cards (and of the card on show) are loaded before they are read.
  use(
    lessonsPromise([
      ...due.map((c) => recallCardLesson(c.id)),
      ...(currentId ? [recallCardLesson(currentId)] : []),
    ]),
  );

  // Drop cards whose lesson step no longer exists (content changed).
  useEffect(() => {
    for (const card of due) if (!resolveRecallCard(card.id, loadedLesson)) dismiss(card.id);
  }, [due, dismiss]);

  const card = useMemo(() => {
    if (currentId && recall[currentId]) return recall[currentId] ?? null;
    return due.find((c) => resolveRecallCard(c.id, loadedLesson)) ?? null;
  }, [currentId, recall, due]);
  const resolved = card ? resolveRecallCard(card.id, loadedLesson) : null;

  useEffect(() => {
    if (card && card.id !== currentId) setCurrentId(card.id);
  }, [card, currentId]);

  if (!card || !resolved) {
    const upcoming = nextReview(recall);
    const total = Object.keys(recall).length;
    return (
      <div>
        <div className="page-header">
          <p className="card__eyebrow">
            <Link to="/learn">Learn</Link> / Lesson recall
          </p>
          <h1>Recall</h1>
          <p>Lesson positions come back a few days after you learn them, then further apart.</p>
        </div>
        <Card className="narrow" data-testid="recall-empty">
          <p className="card__eyebrow">Lesson recall</p>
          <h2>Nothing to recall right now</h2>
          <p className="muted">
            {total === 0
              ? 'Finish a lesson and its task positions will be scheduled here: after 3 days, then 7, 14 and 30.'
              : `${total} position${total === 1 ? '' : 's'} scheduled · next due ${
                  upcoming ? formatDate(upcoming.due, siteConfig.locale) : NONE
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
      <div className="page-header page-header--lean row row--between">
        <div>
          <p className="card__eyebrow">
            <Link to="/learn">Learn</Link> / Lesson recall
          </p>
          <h1>Recall</h1>
          <p>
            {due.length} due · from <strong>{resolved.title}</strong>
          </p>
        </div>
        <Badge tone="accent">
          <span data-testid="recall-interval">
            Interval {Math.min(card.step + 1, PUZZLE_REVIEW_STEPS_DAYS.length)} of{' '}
            {PUZZLE_REVIEW_STEPS_DAYS.length}
          </span>
        </Badge>
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
  const [graded, setGraded] = useState<{ outcome: 'solved' | 'failed'; hinted: boolean } | null>(
    null,
  );
  // Graded the moment the task is finished — found, or the answer shown — from
  // what the step reports, not from state that lands a render later.
  const state = useLessonStep(step, (result) => {
    if (graded) return;
    const grade = gradeRecall(result);
    record(cardId, grade.outcome, grade.hinted);
    setGraded(grade);
  });

  // Going on to the reply, or taking a wrong move back, happens on the board: on a phone,
  // scrolled down to the words under it, bring it back into view.
  const boardRef = useRef<HTMLDivElement>(null);
  const { playOn: stepPlayOn, takeBack: stepTakeBack } = state;
  const playOn = useCallback(() => {
    stepPlayOn();
    scrollBackTo(boardRef.current);
  }, [stepPlayOn]);
  const takeBack = useCallback(() => {
    stepTakeBack();
    scrollBackTo(boardRef.current);
  }, [stepTakeBack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = pageShortcutKey(e);
      if (key === 'h' && !graded) state.hint();
      else if (key === 'ArrowRight' && state.canPlayOn) playOn();
      else if ((key === 'n' || key === 'ArrowRight') && graded) onNext();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, graded, onNext, playOn]);

  // The way on has the focus, so Enter takes it — without scrolling the page to it.
  const takeBackRef = useRef<HTMLButtonElement>(null);
  const playOnRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useFocusWhile(takeBackRef, state.canTakeBack);
  useFocusWhile(playOnRef, state.canPlayOn);
  useFocusWhile(nextRef, graded !== null);

  const task = step.task;
  const orientation = step.orientation ?? 'white';

  return (
    <div className="trainer">
      <div className="trainer__board" style={{ position: 'relative' }} ref={boardRef}>
        <Board
          fen={state.fen}
          orientation={orientation}
          turnColor={state.turn}
          movableColor={state.phase === 'awaiting' ? state.turn : undefined}
          dests={state.dests}
          lastMove={state.lastMove}
          check={state.check}
          // The lesson's own arrows would give the answer away: before the grade
          // only the hint marks show.
          shapes={graded ? state.shapes : state.hintShapes}
          highlights={state.highlights}
          drawable={false}
          onMove={(from, to) => state.playMove(from, to, autoQueen ? 'q' : undefined)}
          ariaLabel={`Recall position from ${lessonTitle}`}
        />
        {state.needsPromotion ? (
          <PromotionPicker color={state.turn} onSelect={state.resolvePromotion} />
        ) : null}
      </div>
      <CoachLatest
        messages={state.messages}
        canTakeBack={state.canTakeBack}
        onTakeBack={takeBack}
        canPlayOn={state.canPlayOn}
        onPlayOn={playOn}
      />
      <aside className="trainer__panel stack">
        <Card>
          <p className="card__eyebrow">
            {lessonTitle}
            {step.title ? ` · ${step.title}` : ''}
          </p>
          {task ? (
            <CoachLog
              messages={state.messages}
              activePrompt={state.activePrompt}
              turn={state.turn}
            />
          ) : null}
          {graded ? (
            <p className="small muted" data-testid="recall-result">
              {graded.outcome === 'solved'
                ? graded.hinted
                  ? 'Recalled with a hint — this position keeps its current interval.'
                  : 'Recalled! It comes back later, further apart each time.'
                : 'Missed — it comes back tomorrow.'}
            </p>
          ) : null}
          <div className="lesson__actions">
            {state.canTakeBack ? (
              <Button key="take-back" ref={takeBackRef} variant="primary" onClick={takeBack}>
                Take back
              </Button>
            ) : state.canPlayOn ? (
              <Button
                key="play-on"
                ref={playOnRef}
                variant="primary"
                onClick={playOn}
                data-testid="recall-play-on"
              >
                Continue
              </Button>
            ) : !graded ? (
              <>
                <Button onClick={state.hint} disabled={state.phase !== 'awaiting'}>
                  Hint <Kbd>H</Kbd>
                </Button>
                <Button variant="ghost" onClick={state.reveal} disabled={!state.canReveal}>
                  Show answer
                </Button>
              </>
            ) : (
              <Button key="next" ref={nextRef} variant="primary" onClick={onNext}>
                Next <Kbd>N</Kbd>
              </Button>
            )}
            <LinkButton variant="ghost" to={`/learn/${lessonId}?step=${stepIndex + 1}`}>
              Reread the lesson
            </LinkButton>
          </div>
        </Card>
      </aside>
    </div>
  );
}
