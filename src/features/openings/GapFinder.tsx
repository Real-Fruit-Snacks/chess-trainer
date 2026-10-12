import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  ProgressBar,
  Segmented,
} from '@/components/ui';
import { San } from '@/chess/San';
import type { Fen, LongColor } from '@/chess/types';
import type { ExplorerDatabase, ExplorerMove } from '@/lib/explorer';
import { formatCount } from '@/lib/format';
import type { ExplorerState } from '@/lib/useExplorer';
import { useTicker } from '@/lib/useTicker';
import { useLichess } from '@/store/lichess';
import { useSettings } from '@/store/settings';
import {
  GAP_DEPTHS,
  GAP_MIN_GAMES,
  GAP_MIN_SHARE,
  type Gap,
  type GapOptions,
  numberMoves,
  oneGameIn,
} from './gaps';
import type { GapScan } from './useGapScan';
import './gaps.css';

const DATABASE_NAME: Record<ExplorerDatabase, string> = {
  lichess: 'Lichess games',
  masters: 'masters’ games',
};

const DATABASE_NOTE: Record<ExplorerDatabase, string> = {
  lichess:
    'Rated blitz, rapid and classical games between players rated 1600 to 2500: the replies club players meet.',
  masters:
    'Over-the-board games between players rated 2200 and above: far fewer games, and replies club players rarely meet.',
};

/** How many gaps show before "Show all". */
const FIRST_GAPS = 8;

/** "18%"; "under 1%" for a share that rounds to nothing. */
function percent(share: number): string {
  const value = Math.round(share * 100);
  return value === 0 && share > 0 ? 'under 1%' : `${value}%`;
}

function colorName(color: LongColor): string {
  return color === 'white' ? 'White' : 'Black';
}

/**
 * Moves in the notation setting, with their numbers ("3... Nf6 4. Ng5"). The
 * spaces are text of their own, outside the moves' elements, so that names
 * read out of them (a button's) keep them.
 */
function Moves({ startFen, sans }: { startFen: Fen; sans: readonly string[] }) {
  return (
    <>
      {numberMoves(startFen, sans).map(({ number, san }, i) => (
        <Fragment key={i}>
          {i > 0 ? ' ' : null}
          {number ? `${number} ` : null}
          <San san={san} />
        </Fragment>
      ))}
    </>
  );
}

/** About how long the positions still to ask about take: a request and a pause each. */
function estimate(positions: number): string {
  const seconds = positions * 1.2;
  if (seconds < 50) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? 'about a minute' : `about ${minutes} min`;
}

/**
 * The gap finder beside the board: what it does and what it sends, the
 * database and the depth, the run with its progress, and the gaps found,
 * most often met first. Picking a gap shows it on the board.
 */
export function GapFinderPanel({
  startFen,
  scan,
  options,
  onOptions,
  selectedId,
  onSelect,
  onAnswer,
  onClose,
}: {
  /** The repertoire's starting position (lines are numbered from it). */
  startFen: Fen;
  scan: GapScan;
  options: GapOptions;
  onOptions: (next: GapOptions) => void;
  selectedId: string | null;
  onSelect: (gap: Gap) => void;
  onAnswer: (gap: Gap) => void;
  onClose: () => void;
}) {
  const explorerOn = useSettings((s) => s.explorer);
  const update = useSettings((s) => s.update);
  const signedIn = useLichess((s) => s.account !== null);
  const [showAll, setShowAll] = useState(false);
  const { report, status } = scan;
  const total = report.positions.length;
  const left = total - report.checked;
  const complete = total > 0 && left === 0;
  const running = status.kind === 'running';
  const waitUntil = status.kind === 'running' ? status.waitUntil : null;
  const now = useTicker(waitUntil !== null);
  const secondsLeft = waitUntil === null ? 0 : Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const { depth, database } = options;
  const gaps = showAll ? report.gaps : report.gaps.slice(0, FIRST_GAPS);

  const announcement =
    status.kind === 'running'
      ? waitUntil !== null
        ? 'Lichess asked for a pause. The search goes on by itself.'
        : 'Finding gaps…'
      : status.kind === 'done' && complete
        ? report.gaps.length
          ? `Done: ${report.gaps.length} gap${report.gaps.length === 1 ? '' : 's'} found.`
          : 'Done: no gaps found.'
        : status.kind === 'stopped'
          ? `Stopped after ${report.checked} of ${total} positions.`
          : '';

  const start = () => {
    if (!explorerOn) update({ explorer: true });
    setShowAll(false);
    scan.start();
  };

  return (
    <>
      <Card data-testid="gap-finder">
        <div className="row row--between">
          <h2 className="gaps__title">Find gaps</h2>
          <Button size="sm" onClick={onClose}>
            Back to training
          </Button>
        </div>
        <p className="small muted gaps__intro">
          The replies your opponents play that this repertoire has no answer to, most often met
          first.
        </p>
        <div className="gaps__options">
          <div className="gaps__option">
            <span className="gaps__label" aria-hidden="true">
              Games
            </span>
            <Segmented<ExplorerDatabase>
              ariaLabel="Games"
              value={database}
              onChange={(value) => onOptions({ ...options, database: value })}
              options={[
                { value: 'lichess', label: 'Lichess players' },
                { value: 'masters', label: 'Masters' },
              ]}
            />
            <p className="small muted gaps__note">{DATABASE_NOTE[database]}</p>
          </div>
          <div className="gaps__option">
            <span className="gaps__label" aria-hidden="true">
              Up to move
            </span>
            <Segmented<number>
              ariaLabel="Up to move"
              value={depth}
              onChange={(value) => onOptions({ ...options, depth: value })}
              options={GAP_DEPTHS.map((d) => ({ value: d, label: String(d) }))}
            />
          </div>
        </div>

        <div className="gaps__run">
          {total === 0 ? (
            <p className="small gaps__note">
              Nothing to check: in its first {depth} moves this repertoire answers none of your
              opponent’s moves.
            </p>
          ) : running ? (
            <div className="gaps__progress">
              <ProgressBar
                value={report.checked}
                max={total}
                label="Positions checked"
                valueText={`${report.checked} of ${total} positions`}
              />
              <div className="row row--between">
                <span className="small gaps__count">
                  {report.checked} of {total} positions
                </span>
                <Button size="sm" onClick={scan.stop}>
                  Stop
                </Button>
              </div>
              {waitUntil !== null ? (
                <p className="small gaps__note">
                  Lichess asked for a pause: going on in {secondsLeft} s.
                </p>
              ) : null}
            </div>
          ) : complete ? null : (
            <>
              {status.kind === 'failed' ? (
                <Alert tone="warning">
                  {status.message}
                  {status.needsAccount ? (
                    <>
                      {' '}
                      <Link to="/settings#lichess">Lichess in Settings</Link>
                    </>
                  ) : null}
                </Alert>
              ) : null}
              {status.kind === 'stopped' ? (
                <p className="small muted gaps__note">
                  Stopped after {report.checked} of {total} positions.
                </p>
              ) : null}
              {explorerOn ? null : (
                <p className="small gaps__note">
                  Finding gaps asks the Lichess opening explorer what is played in each of the{' '}
                  {total} position{total === 1 ? '' : 's'} of this repertoire where your opponent is
                  to move, one at a time.{' '}
                  {signedIn
                    ? 'Only the positions are sent, with your Lichess sign-in, which the explorer asks for.'
                    : 'Only the positions are sent.'}{' '}
                  This turns on the opening explorer setting, which also shows the explorer card in
                  Analyze and the editor.
                </p>
              )}
              {signedIn ? null : (
                <p className="small muted gaps__note">
                  The explorer asks for a Lichess account:{' '}
                  <Link to="/settings#lichess">connect yours in Settings</Link>.
                </p>
              )}
              <div className="row">
                <Button variant="primary" onClick={start}>
                  {!explorerOn
                    ? 'Turn on the explorer and find gaps'
                    : status.kind === 'failed'
                      ? 'Try again'
                      : report.checked === 0
                        ? 'Find gaps'
                        : `Check the other ${left} position${left === 1 ? '' : 's'}`}
                </Button>
                <span className="small muted">
                  {left} position{left === 1 ? '' : 's'}, {estimate(left)}
                </span>
              </div>
            </>
          )}
        </div>
        <p className="sr-only" role="status">
          {announcement}
        </p>
      </Card>

      {report.checked > 0 ? (
        <Card data-testid="gap-results">
          {complete ? (
            <div className="gaps__summary">
              <p style={{ margin: 0 }}>
                <strong>
                  {report.gaps.length === 0
                    ? `No gaps up to move ${depth}`
                    : `${report.gaps.length} gap${report.gaps.length === 1 ? '' : 's'} up to move ${depth}`}
                </strong>
              </p>
              {report.coverage !== null ? (
                <>
                  <p className="small" style={{ margin: '4px 0 0' }}>
                    An answer is ready in {percent(report.coverage)} of games up to move {depth}
                    {report.elsewhere.length ? ', counting your other repertoires' : ''}.
                  </p>
                  <div className="gaps__meter" aria-hidden="true">
                    <span style={{ width: `${report.coverage * 100}%` }} />
                  </div>
                  <details className="small muted">
                    <summary>How this is worked out</summary>
                    <p style={{ margin: '4px 0 0' }}>
                      Each of your opponents’ replies counts as often as it is played in{' '}
                      {DATABASE_NAME[database]}; where the repertoire has several moves in one
                      position, each counts equally. A game counts as answered while every reply in
                      it has an answer, up to move {depth} or the end of its line. Rare replies
                      count too, so few repertoires reach 100%.
                    </p>
                  </details>
                </>
              ) : null}
            </div>
          ) : (
            <p className="small muted gaps__summary">
              {report.gaps.length ? 'Gaps so far' : 'No gaps so far'}, from {report.checked} of{' '}
              {total} positions.
            </p>
          )}
          {report.onlyAfter ? (
            <p className="small muted">
              Only lines after <Moves startFen={startFen} sans={report.onlyAfter} /> are checked:
              this repertoire answers no other first move.
            </p>
          ) : null}

          {report.gaps.length > 0 ? (
            <ol className="gaps__list" aria-label="Gaps, most often met first">
              {gaps.map((gap) => {
                const selected = gap.id === selectedId;
                const one = oneGameIn(gap.frequency);
                return (
                  <li
                    key={gap.id}
                    className={selected ? 'gaps__item gaps__item--selected' : 'gaps__item'}
                  >
                    <button
                      type="button"
                      className="gaps__pick"
                      aria-pressed={selected}
                      onClick={() => onSelect(gap)}
                    >
                      <span className="gaps__reply">
                        <Moves startFen={gap.fen} sans={[gap.reply.san]} />
                      </span>{' '}
                      <span className="small muted gaps__line">
                        {gap.line.length ? (
                          <>
                            after <Moves startFen={startFen} sans={gap.line} />
                          </>
                        ) : (
                          'as the first move'
                        )}
                      </span>
                    </button>
                    <p className="small gaps__stats">
                      Played in {percent(gap.reply.share)} of {formatCount(gap.games)} games
                      {one ? ` · comes up in about 1 game in ${formatCount(one)}` : ''}
                      {gap.inRepertoire ? ' · the line stops there' : ''}
                    </p>
                    <div className="row gaps__item-actions">
                      <Button size="sm" onClick={() => onAnswer(gap)}>
                        Add an answer
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : complete ? (
            <EmptyState
              icon={<Icon name="shield" size={36} />}
              title={`No gaps up to move ${depth}`}
            >
              <p className="small">
                Every reply played in at least {Math.round(GAP_MIN_SHARE * 100)}% of the games, and
                in {formatCount(GAP_MIN_GAMES[database])} games or more, has an answer in this
                repertoire.
              </p>
            </EmptyState>
          ) : null}
          {report.gaps.length > FIRST_GAPS && !showAll ? (
            <Button
              size="sm"
              variant="ghost"
              className="gaps__more"
              onClick={() => setShowAll(true)}
            >
              Show all {report.gaps.length} gaps
            </Button>
          ) : null}

          {report.elsewhere.length > 0 ? (
            <details className="gaps__elsewhere small">
              <summary>
                {report.elsewhere.length}{' '}
                {report.elsewhere.length === 1 ? 'reply is' : 'replies are'} answered in your other
                repertoires
              </summary>
              <ul>
                {report.elsewhere.map((gap) => (
                  <li key={gap.id}>
                    <Moves startFen={gap.fen} sans={[gap.reply.san]} />
                    {gap.line.length ? (
                      <>
                        {' '}
                        after <Moves startFen={startFen} sans={gap.line} />
                      </>
                    ) : null}
                    : {gap.answeredIn}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="small muted gaps__footnote">
            From {DATABASE_NAME[database]}. A reply is a gap when it is played in at least{' '}
            {Math.round(GAP_MIN_SHARE * 100)}% of the games in its position, and in{' '}
            {formatCount(GAP_MIN_GAMES[database])} games or more.
          </p>
        </Card>
      ) : null}
    </>
  );
}

/** A gap being answered: the line to it, the reply, the positions either side of it. */
export interface GapAnswerFix {
  line: string[];
  reply: string;
  fenBefore: Fen;
  fenAfter: Fen;
  share: number | null;
  games: number | null;
}

/**
 * Beside the editor while a gap is answered: the reply, the explorer's most
 * successful answer as one button, and the other answers played, each one tap
 * (the learner may also play their own on the board).
 */
export function GapAnswerCard({
  startFen,
  color,
  fix,
  database,
  explorer,
  suggestion,
  onAnswer,
  onCancel,
}: {
  startFen: Fen;
  color: LongColor;
  fix: GapAnswerFix;
  database: ExplorerDatabase;
  explorer: ExplorerState;
  suggestion: ExplorerMove | null;
  onAnswer: (san: string) => void;
  onCancel: () => void;
}) {
  const side = colorName(color);
  return (
    <Card data-testid="gap-answer">
      <div className="row row--between">
        <h2 className="gaps__title">
          Your answer to <Moves startFen={fix.fenBefore} sans={[fix.reply]} />
        </h2>
        <Button size="sm" onClick={onCancel}>
          Back to gaps
        </Button>
      </div>
      <p className="small muted gaps__intro">
        {fix.line.length ? (
          <>
            After <Moves startFen={startFen} sans={fix.line} />.{' '}
          </>
        ) : null}
        {fix.share !== null && fix.games !== null
          ? `Played in ${percent(fix.share)} of ${formatCount(fix.games)} games. `
          : ''}
        Play your answer on the board, or pick one here.
      </p>
      {explorer.status === 'off' ? (
        <p className="small muted">Turn on the opening explorer to see the answers played here.</p>
      ) : explorer.status === 'loading' ? (
        <p className="small muted" role="status">
          Looking up the answers played here…
        </p>
      ) : explorer.status === 'error' ? (
        <p className="small muted" role="status">
          {explorer.message}
        </p>
      ) : explorer.result.total === 0 ? (
        <p className="small muted">No {DATABASE_NAME[database]} reach this position.</p>
      ) : (
        <>
          {suggestion ? (
            <div className="gaps__suggestion">
              <Button variant="primary" onClick={() => onAnswer(suggestion.san)}>
                Add <Moves startFen={fix.fenBefore} sans={[fix.reply, suggestion.san]} />
              </Button>
              <p className="small muted">
                Best results in {DATABASE_NAME[database]}: {side} scores {percent(suggestion.score)}{' '}
                with it, in {formatCount(suggestion.total)} games.
              </p>
            </div>
          ) : (
            <p className="small muted">
              No answer here has been played in enough games to suggest.
            </p>
          )}
          <ul className="gaps__candidates" aria-label="Answers played here">
            {explorer.result.moves.slice(0, 6).map((move) => (
              <li key={move.san}>
                <button
                  type="button"
                  className="gaps__candidate"
                  onClick={() => onAnswer(move.san)}
                >
                  <span className="sr-only">Add</span>{' '}
                  <span className="gaps__candidate-move">
                    <Moves startFen={fix.fenAfter} sans={[move.san]} />
                  </span>{' '}
                  <span className="gaps__candidate-stats">
                    {percent(move.share)} of games · {side} scores {percent(move.score)}
                  </span>
                  {move === suggestion ? (
                    <>
                      {' '}
                      <Badge tone="success">Best results</Badge>
                    </>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
