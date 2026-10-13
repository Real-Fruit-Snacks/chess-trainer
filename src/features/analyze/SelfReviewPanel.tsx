import { San } from '@/chess/San';
import type { TreeNode } from '@/chess/tree';
import { Alert, Button, Icon, Kbd, ProgressBar } from '@/components/ui';
import type { ReviewSummary } from './gameReview';
import type { MarkOutcome, MomentOutcome, SuggestionVerdict } from './selfReview';
import type { UseSelfReview } from './useSelfReview';

const MOMENT_WORDS: Record<MomentOutcome, string> = {
  found: 'you found it',
  late: 'you marked the move after it',
  missed: 'missed',
};

const MARK_WORDS: Record<Exclude<MarkOutcome, 'found' | 'late'>, string> = {
  minor: 'an inaccuracy — not a turning point, but not nothing',
  'false-alarm': 'the engine found nothing wrong with it',
};

const VERDICT_WORDS: Record<SuggestionVerdict, string> = {
  best: 'as good as the engine’s move',
  good: 'a good move',
  ok: 'playable',
  worse: 'weaker than the engine’s move',
};

/**
 * Self-analysis in the game review card: marking (engine out of sight), the
 * engine's check, and the comparison of the learner's marks with its review.
 */
export function SelfReviewPanel({
  self,
  current,
  isMain,
  mainLine,
  review,
  reviewProgress,
  engineReady,
  label,
  onSelectPly,
  shortcutsOn,
}: {
  self: UseSelfReview;
  current: TreeNode;
  isMain: boolean;
  mainLine: TreeNode[];
  review: ReviewSummary | null;
  reviewProgress: number | null;
  engineReady: boolean;
  /** "12." or "12…" for a main-line ply. */
  label: (ply: number) => string;
  onSelectPly: (ply: number) => void;
  shortcutsOn: boolean;
}) {
  if (self.phase === 'marking') {
    const mark = self.marks.find((m) => m.ply === current.ply && isMain);
    const suggestingFor = self.marks.find((m) => m.ply === self.suggesting);
    return (
      <div className="stack-sm self-review" data-testid="self-review">
        <p className="small muted" style={{ margin: 0 }}>
          Go through the game with the engine out of sight. Mark each move where you think the game
          turned — a mistake by either side — and play what you would have played instead. Then
          compare with the engine.
        </p>
        {current.ply > 0 && isMain ? (
          <div className="row">
            <span className="small">
              <strong>
                {label(current.ply)} <San san={current.san} />
              </strong>
            </span>
            <Button size="sm" aria-pressed={!!mark} onClick={() => self.toggleMark(current)}>
              <Icon name="flag" size={14} /> {mark ? 'Marked' : 'Mark as a turning point'}{' '}
              {shortcutsOn ? <Kbd>M</Kbd> : null}
            </Button>
            {mark ? (
              <Button size="sm" onClick={() => self.suggestFor(mark.ply)}>
                {mark.suggestion ? 'Change your move' : 'Your move instead'}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Step to a move of the game to mark it.
          </p>
        )}
        {suggestingFor ? (
          <Alert tone="info">
            Play the move you would choose instead of{' '}
            <strong>
              {label(suggestingFor.ply)} <San san={suggestingFor.san} />
            </strong>{' '}
            on the board.{' '}
            <Button size="sm" variant="ghost" onClick={self.cancelSuggestion}>
              Cancel
            </Button>
          </Alert>
        ) : null}
        {self.notice ? (
          <p className="small" role="status" style={{ margin: 0 }}>
            {self.notice}
          </p>
        ) : null}
        {self.marks.length > 0 ? (
          <ol role="list" className="moments" aria-label="Your turning points">
            {self.marks.map((m) => {
              const node = mainLine[m.ply - 1];
              return (
                <li key={m.ply} className="moments__row">
                  <button
                    type="button"
                    className="moments__item"
                    onClick={() => onSelectPly(m.ply)}
                    aria-current={isMain && current.ply === m.ply ? 'true' : undefined}
                  >
                    <span className="moments__move">
                      {label(m.ply)} <San san={m.san} />
                    </span>
                    <span className="small">
                      {m.suggestion ? (
                        <>
                          instead: <San san={m.suggestion.san} />
                        </>
                      ) : (
                        <span className="muted">no move instead yet</span>
                      )}
                    </span>
                    <span />
                  </button>
                  {m.suggestion ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => self.removeSuggestion(m.ply)}
                      aria-label={`Drop your move instead of ${m.san}`}
                      title="Drop the move instead"
                    >
                      <Icon name="arrow-left" size={14} />
                    </Button>
                  ) : null}
                  {node ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon
                      onClick={() => self.toggleMark(node)}
                      aria-label={`Unmark ${m.san}`}
                      title="Unmark"
                    >
                      <Icon name="close" size={14} />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="row">
          <Button
            size="sm"
            variant="primary"
            onClick={self.check}
            disabled={!engineReady}
            title={engineReady ? undefined : 'Waiting for the engine to load'}
          >
            Check with the engine
          </Button>
          <Button size="sm" variant="ghost" onClick={self.stop}>
            Stop
          </Button>
        </div>
      </div>
    );
  }

  if (self.phase === 'checking') {
    return (
      <div className="stack-sm self-review" data-testid="self-review">
        <ProgressBar value={reviewProgress ?? 1} label="Review progress" />
        <p className="small muted" style={{ margin: 0 }} role="status">
          {reviewProgress === null
            ? 'Judging the moves you would have played…'
            : `The engine is reviewing the game… ${Math.round(reviewProgress * 100)}%`}
        </p>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={self.stop}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (self.phase !== 'done' || !self.score) return null;
  const { score } = self;
  const reviewed = (ply: number) => review?.moves[ply - 1];
  const others = score.marks.filter((m) => m.outcome === 'minor' || m.outcome === 'false-alarm');
  const suggested = self.marks.filter((m) => m.suggestion);
  return (
    <div className="stack-sm self-review" data-testid="self-review-result">
      <p style={{ margin: 0 }}>
        <strong>
          {score.total === 0
            ? 'The engine found no turning point in this game'
            : `You found ${score.found} of ${score.total} turning point${score.total === 1 ? '' : 's'}`}
        </strong>
        {score.late ? ` (${score.late} a move late)` : ''}
        {score.falseAlarms
          ? ` · ${score.falseAlarms} false alarm${score.falseAlarms === 1 ? '' : 's'}`
          : ''}
        .
      </p>
      {score.moments.length > 0 ? (
        <ol role="list" className="moments" aria-label="The engine’s turning points">
          {score.moments.map((m) => (
            <li key={m.ply} className="moments__row">
              <button type="button" className="moments__item" onClick={() => onSelectPly(m.ply)}>
                <span className={`moments__move moments__move--${m.judgement}`}>
                  <span className={`self-review__mark self-review__mark--${m.outcome}`}>
                    <Icon name={m.outcome === 'missed' ? 'close' : 'check'} size={14} />
                  </span>{' '}
                  {label(m.ply)} <San san={m.san} />
                </span>
                <span className="small">
                  a {m.judgement} by {m.mover}
                  {m.best ? (
                    <>
                      {' — better was '}
                      <San san={m.best} />
                    </>
                  ) : null}
                </span>
                <span className="small faint">{MOMENT_WORDS[m.outcome]}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {others.length > 0 ? (
        <ul role="list" className="moments" aria-label="Your other marks">
          {others.map((m) => (
            <li key={m.ply} className="moments__row">
              <button type="button" className="moments__item" onClick={() => onSelectPly(m.ply)}>
                <span className="moments__move">
                  <span className="self-review__mark self-review__mark--other">
                    <Icon name="flag" size={14} />
                  </span>{' '}
                  {label(m.ply)} <San san={m.san} />
                </span>
                <span className="small">{MARK_WORDS[m.outcome as 'minor' | 'false-alarm']}</span>
                <span />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {suggested.length > 0 ? (
        <ul role="list" className="moments" aria-label="Your moves instead">
          {suggested.map((m) => {
            const verdict = self.suggestions.get(m.ply);
            const move = reviewed(m.ply);
            // The engine's choice: its own move, or the game move when it would have played that too.
            const asPlayed = !move?.best && move?.judgement === 'best';
            const best = move?.best ?? (asPlayed ? m.san : null);
            return (
              <li key={m.ply} className="moments__row">
                <button
                  type="button"
                  className="moments__item"
                  onClick={() => onSelectPly(m.ply - 1)}
                >
                  <span className="moments__move">
                    {label(m.ply)} <San san={m.suggestion?.san ?? ''} />
                  </span>
                  <span className="small">
                    instead of <San san={m.san} />:{' '}
                    {verdict ? VERDICT_WORDS[verdict.verdict] : 'could not be checked'}
                    {verdict && verdict.verdict !== 'best' && best ? (
                      <>
                        {' '}
                        (engine: <San san={best} />
                        {asPlayed ? ', as played' : ''})
                      </>
                    ) : null}
                  </span>
                  <span />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="row">
        <Button size="sm" onClick={self.finish}>
          Done
        </Button>
      </div>
    </div>
  );
}
