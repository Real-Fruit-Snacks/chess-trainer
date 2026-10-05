import type { Square } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { moveLabel, parseUci } from '@/chess/helpers';
import { San } from '@/chess/San';
import { ClickBoard } from '@/components/board/ClickBoard';
import { piecesFromFen } from '@/components/board/clickBoardPieces';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveInput } from '@/components/chess/MoveInput';
import {
  Alert,
  Badge,
  Button,
  Card,
  Kbd,
  LinkButton,
  Segmented,
  Spinner,
  Stat,
} from '@/components/ui';
import { pageShortcutKey } from '@/lib/shortcutKey';
import { useStackedLayout } from '@/lib/useStackedLayout';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { BLIND_DEPTH_LABELS, BLIND_DEPTHS, type BlindDepth, blindLevel } from './blind';
import { blindFen, blindLine } from './blindLine';
import { useBlindPuzzle } from './useBlindPuzzle';

const EMPTY_BOARD = '8/8/8/8/8/8/8/8 w - - 0 1';
const COLOR_NAME = { white: 'White', black: 'Black' } as const;

/**
 * Blind puzzles: the board keeps the starting position while the line is
 * played in notation only. Moves go in by clicking their two squares on the
 * (unchanging) board or by typing them.
 */
export function BlindTrainer() {
  const depth = useSettings((s) => s.blindDepth);
  const update = useSettings((s) => s.update);
  const shortcutsOn = useSettings((s) => s.keyboardShortcuts);
  const moveInput = useSettings((s) => s.moveInput);
  // Typing is the natural way in on a computer; on a phone the keyboard would cover the board,
  // so there the field follows the keyboard move entry setting.
  const stacked = useStackedLayout();
  const stats = useProgress((s) => s.blind);
  const puzzleRating = useProgress((s) => s.puzzleRating);
  const blind = useBlindPuzzle(depth);
  const { next, setup, phase } = blind;
  /** Once the puzzle is over, the board shows the final position; this flips back to the start. */
  const [showStart, setShowStart] = useState(false);

  useEffect(() => {
    void next();
  }, [next, depth]);
  useEffect(() => setShowStart(false), [blind.puzzle]);

  const over = phase === 'solved';
  const finished = over || phase === 'failed';
  const current = setup ? blindFen(setup, blind.played) : null;
  const showCurrent = !!setup && ((over && !showStart) || (!over && blind.peeking));
  const shownFen = setup
    ? showCurrent
      ? (current ?? setup.startFen)
      : setup.startFen
    : EMPTY_BOARD;

  // Keyboard: H peeks (the blind puzzle's hint), S shows the line, N moves on once it is over.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = pageShortcutKey(e);
      if (key === 'h') blind.togglePeek();
      else if (key === 's') blind.showSolution();
      else if (key === 'n' && finished) void next();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blind, finished, next]);

  const pieces = useMemo(() => piecesFromFen(shownFen), [shownFen]);
  const marks = useMemo(() => {
    const map = new Map<Square, string>();
    if (setup) {
      const last = showCurrent ? blind.played.at(-1) : undefined;
      const [from, to] = last
        ? [parseUci(last).from, parseUci(last).to]
        : [setup.setup.from, setup.setup.to];
      map.set(from, 'last');
      map.set(to, 'last');
    }
    if (blind.selected) map.set(blind.selected, 'selected');
    return map;
  }, [setup, showCurrent, blind.played, blind.selected]);

  const line = setup ? blindLine(setup, blind.played) : [];
  const lastReply = line.at(-1)?.by === 'opponent' ? line.at(-1) : undefined;
  const opponent = setup ? COLOR_NAME[setup.solverColor === 'white' ? 'black' : 'white'] : '';
  const level = blindLevel(stats.levels, depth, puzzleRating);
  const nextLabel = setup ? moveLabel(blind.played.length, setup.startFen) : '';

  const status = (() => {
    switch (phase) {
      case 'loading':
        return 'Finding a puzzle…';
      case 'solving':
        return lastReply ? (
          <>
            <span aria-hidden="true">
              {opponent} replied <San san={lastReply.san} />. Your move.
            </span>
            <span className="sr-only">{blind.announcement} Your move.</span>
          </>
        ) : (
          'Find the whole line: after your first move, the board stays as it is.'
        );
      case 'replying':
        return 'Good. The reply comes…';
      case 'failed':
        return (
          <>
            <San san={blind.wrong ?? ''} /> is not the move.
          </>
        );
      case 'solved':
        return blind.solutionShown
          ? 'That is the line. The board shows where it ends.'
          : blind.practice
            ? 'Solved, after a miss.'
            : 'Solved! The board shows the final position: was it the one you pictured?';
      default:
        return '';
    }
  })();

  return (
    <div className="trainer trainer--lead">
      <div className="trainer__board" style={{ position: 'relative' }}>
        <ClickBoard
          pieces={pieces}
          orientation={setup?.solverColor ?? 'white'}
          marks={marks}
          onSquare={blind.clickSquare}
          disabled={phase !== 'solving'}
          ariaLabel={
            showCurrent
              ? 'Blind puzzle board, showing the current position'
              : 'Blind puzzle board, showing the starting position. Pick the square of the piece to move, then its destination'
          }
        />
        {blind.needsPromotion && setup ? (
          <PromotionPicker color={setup.solverColor} onSelect={blind.resolvePromotion} />
        ) : null}
        {phase === 'loading' ? (
          <div className="trainer__overlay">
            <Spinner label="Finding a puzzle…" />
          </div>
        ) : null}
      </div>

      <Card className="trainer__lead blind">
        <div className="row row--between">
          <div className="row">
            <span
              className={`playerbar__dot playerbar__dot--${setup?.solverColor ?? 'white'}`}
              aria-hidden="true"
            />
            <strong>{setup ? `${COLOR_NAME[setup.solverColor]} to move` : 'Blind puzzle'}</strong>
          </div>
          {blind.peeked && !over ? <Badge tone="warning">Peeked</Badge> : null}
        </div>

        {setup ? (
          <ol className="blind-line" aria-label="The line so far" data-testid="blind-line">
            <li className="blind-line__move blind-line__move--setup">
              <span className="blind-line__num">{setup.setup.label}</span>
              <San san={setup.setup.san} />
            </li>
            {line.map((move, i) => (
              <li key={i} className={`blind-line__move blind-line__move--${move.by}`}>
                {move.label ? <span className="blind-line__num">{move.label}</span> : null}
                <San san={move.san} />
              </li>
            ))}
            {phase === 'solving' || phase === 'replying' ? (
              <li className="blind-line__move blind-line__move--next" aria-label="Next move">
                {blind.played.length === 0 || !nextLabel.endsWith('...') ? (
                  <span className="blind-line__num">{nextLabel}</span>
                ) : null}
                <span aria-hidden="true">?</span>
              </li>
            ) : null}
          </ol>
        ) : null}

        <p className={`puzzle-status puzzle-status--${phase}`} role="status">
          {status}
        </p>
        {blind.notice ? (
          <p className="small blind__notice" role="alert">
            {blind.notice}
          </p>
        ) : null}

        {(phase === 'solving' || phase === 'replying') && (!stacked || moveInput) ? (
          <MoveInput
            onMove={blind.playNotation}
            disabled={phase !== 'solving'}
            keepFocus
            placeholder="Type your move, e.g. Nf3"
          />
        ) : null}

        <div className="puzzle-actions">
          {phase === 'failed' ? (
            <Button variant="primary" onClick={blind.retry}>
              Try again
            </Button>
          ) : null}
          {phase === 'solving' || phase === 'replying' || phase === 'failed' ? (
            <>
              <Button
                onClick={blind.togglePeek}
                disabled={blind.played.length === 0}
                aria-pressed={blind.peeking}
                title="Show the current position (your level does not rise for this puzzle)"
              >
                {blind.peeking ? 'Hide' : 'Peek'} {shortcutsOn ? <Kbd>H</Kbd> : null}
              </Button>
              <Button variant="ghost" onClick={blind.showSolution}>
                Show the line {shortcutsOn ? <Kbd>S</Kbd> : null}
              </Button>
            </>
          ) : null}
          {finished ? (
            <Button
              variant={over ? 'primary' : 'ghost'}
              onClick={() => void next()}
              autoFocus={over}
            >
              Next puzzle {shortcutsOn ? <Kbd>N</Kbd> : null}
            </Button>
          ) : null}
          {over ? (
            <Button
              variant="ghost"
              aria-pressed={showStart}
              onClick={() => setShowStart((on) => !on)}
            >
              {showStart ? 'Show the final position' : 'Show the starting position'}
            </Button>
          ) : null}
        </div>

        {blind.result ? (
          <p
            className={`small ${blind.result.after >= blind.result.before ? 'puzzle-delta--up' : 'puzzle-delta--down'}`}
            data-testid="blind-level"
          >
            {blind.result.after === blind.result.before
              ? `Level stays at ${blind.result.after}${blind.result.peeked && blind.result.outcome === 'solved' ? ': you peeked' : ''}.`
              : `Level ${blind.result.before} → ${blind.result.after} (${blind.result.after > blind.result.before ? '+' : ''}${blind.result.after - blind.result.before}).`}
          </p>
        ) : null}
      </Card>

      <aside className="trainer__panel stack">
        {blind.error ? (
          <Alert tone="danger" role="alert">
            {blind.error}{' '}
            <Button size="sm" onClick={() => void next()}>
              Retry
            </Button>
          </Alert>
        ) : null}

        <Card>
          <p className="card__eyebrow">Line length</p>
          <Segmented<BlindDepth>
            ariaLabel="Line length"
            value={depth}
            onChange={(value) => update({ blindDepth: value })}
            options={BLIND_DEPTHS.map((value) => ({ value, label: BLIND_DEPTH_LABELS[value] }))}
          />
          <div className="puzzle-stats" style={{ marginTop: 12 }}>
            <Stat value={level} label={`Level · ${BLIND_DEPTH_LABELS[depth]}`} />
            <Stat value={`${stats.solved} / ${stats.solved + stats.failed}`} label="Solved" />
            <Stat value={stats.bestRun} label={`Best run (now ${stats.run})`} />
          </div>
        </Card>

        {setup && blind.puzzle && over ? (
          <Card>
            <p className="small muted" style={{ margin: 0 }}>
              Puzzle <code>{blind.puzzle.id}</code> from the Lichess database (CC0), rated{' '}
              {blind.puzzle.rating}.{' '}
              <Link to={`/analyze?fen=${encodeURIComponent(setup.startFen)}`}>
                Analyze the position
              </Link>
            </p>
          </Card>
        ) : null}

        <p className="small faint">
          Calculation without the board: the pieces stay where they were when the puzzle began, and
          the line exists only in notation. Click the two squares of a move or type it. A peek shows
          the current position but keeps your level from rising for that puzzle. Each length keeps
          its own level, separate from your <Link to="/puzzles">puzzle rating</Link>.
        </p>
        {stats.solved + stats.failed === 0 ? (
          <LinkButton variant="ghost" to="/learn/visualisation">
            How to see moves ahead
          </LinkButton>
        ) : null}
      </aside>
    </div>
  );
}
