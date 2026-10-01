import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Board, type DrawShape } from '@/components/board/Board';
import { ClickBoard, type ClickBoardPiece, type PieceRole } from '@/components/board/ClickBoard';
import { Alert, Button, Card, Segmented, Stat, Switch, LinkButton } from '@/components/ui';
import { Chess } from 'chess.js';
import { playSound } from '@/lib/sound';
import { pickRandom } from '@/lib/random';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { loadBucketChunk, loadPuzzleIndex, type Puzzle } from '@/features/puzzles/puzzleService';
import {
  generateMovesTask,
  generateRecallTask,
  numberedMoves,
  taskFromPuzzle,
  type VisionMode,
  type VisionTask,
} from './vision';
import './drills.css';

const DURATIONS: Record<VisionMode, number> = {
  moves: 60_000,
  captures: 60_000,
  checks: 60_000,
  recall: 90_000,
};
/** Opening sequences for the recall drill: the classic games, from move one. */
const RECALL_LINES = CLASSIC_GAMES.map((g) => g.moves);
const BLINDFOLD_PREVIEW_MS = 2500;
const ROLE: Record<string, PieceRole> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

const MODE_INFO: Record<VisionMode, { title: string; prompt: string; blurb: string }> = {
  moves: {
    title: 'Piece movement',
    prompt: 'Click every square the highlighted piece can move to.',
    blurb: 'Blockers, captures and pins all count — only legal destinations.',
  },
  captures: {
    title: 'Find every capture',
    prompt: 'Play every capture available to the side to move.',
    blurb: 'Positions come from real games. Play a move by clicking the piece and its target.',
  },
  checks: {
    title: 'Find every check',
    prompt: 'Play every checking move for the side to move.',
    blurb: 'Discovered checks count too. Play a move by clicking the piece and its target.',
  },
  recall: {
    title: 'Guess the position',
    prompt: 'Follow the moves in your head, then click where each piece stands now.',
    blurb:
      'The opening of a famous game is shown as text and the board stays empty. Track the pieces in your head — including the ones that were captured.',
  },
};

const ROLE_NAME: Record<string, string> = {
  king: 'king',
  queen: 'queen',
  rook: 'rook',
  bishop: 'bishop',
  knight: 'knight',
  pawn: 'pawn',
};

function piecesFromFen(fen: string): Map<Square, ClickBoardPiece> {
  const map = new Map<Square, ClickBoardPiece>();
  const chess = new Chess(fen);
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      map.set(cell.square, {
        color: cell.color === 'w' ? 'white' : 'black',
        role: ROLE[cell.type] ?? 'pawn',
      });
    }
  }
  return map;
}

export default function VisionDrill() {
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const mode: VisionMode =
    modeParam === 'captures' || modeParam === 'checks' || modeParam === 'recall'
      ? modeParam
      : 'moves';
  const DURATION_MS = DURATIONS[mode];
  const drillId = `vision-${mode}`;
  const recordDrill = useProgress((s) => s.recordDrill);
  const best = useProgress((s) => s.drills[drillId]);

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<{
    score: number;
    mistakes: number;
    positions: number;
  } | null>(null);
  const [task, setTask] = useState<VisionTask | null>(null);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [positions, setPositions] = useState(0);
  const [leftMs, setLeftMs] = useState(DURATION_MS);
  const [error, setError] = useState<string | null>(null);
  const [blindfold, setBlindfold] = useState(false);
  const [preview, setPreview] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answered, setAnswered] = useState<Map<Square, string>>(new Map());
  const startedAtRef = useRef(0);
  const scoreRef = useRef(0);
  const mistakesRef = useRef(0);
  const positionsRef = useRef(0);
  const poolRef = useRef<Puzzle[]>([]);

  useEffect(() => {
    document.title = `${MODE_INFO[mode].title} · ${siteConfig.name}`;
  }, [mode]);

  const finish = useCallback(() => {
    setRunning(false);
    setTask(null);
    const summary = {
      score: scoreRef.current,
      mistakes: mistakesRef.current,
      positions: positionsRef.current,
    };
    setFinished(summary);
    recordDrill(drillId, summary.score, `${summary.score} found in ${DURATION_MS / 1000} s`);
    playSound('gameEnd');
  }, [recordDrill, drillId, DURATION_MS]);

  const nextTask = useCallback(async (): Promise<VisionTask | null> => {
    if (mode === 'moves') return generateMovesTask();
    if (mode === 'recall') return generateRecallTask(RECALL_LINES);
    if (poolRef.current.length === 0) {
      const index = await loadPuzzleIndex();
      const buckets = index.buckets.filter((b) => b.min >= 800 && b.max <= 1999);
      // The first chunk of each bucket (500 puzzles) is plenty for a 60-second drill.
      const pools = await Promise.all(buckets.map((b) => loadBucketChunk(b, 0)));
      poolRef.current = pools.flat();
    }
    for (let i = 0; i < 50; i++) {
      const puzzle = pickRandom(poolRef.current);
      if (!puzzle) break;
      const candidate = taskFromPuzzle(puzzle, mode);
      if (candidate) return candidate;
    }
    return null;
  }, [mode]);

  const advance = useCallback(async () => {
    try {
      const next = await nextTask();
      if (!next) {
        setError('Could not find a suitable position.');
        finish();
        return;
      }
      positionsRef.current += 1;
      setPositions(positionsRef.current);
      setFound(new Set());
      setWrong(null);
      setQuestionIndex(0);
      setAnswered(new Map());
      setTask(next);
      // Blindfold: show the position briefly, then hide the pieces.
      setPreview(true);
      window.setTimeout(() => setPreview(false), BLINDFOLD_PREVIEW_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      finish();
    }
  }, [nextTask, finish]);

  const start = () => {
    scoreRef.current = 0;
    mistakesRef.current = 0;
    positionsRef.current = 0;
    setScore(0);
    setMistakes(0);
    setPositions(0);
    setFinished(null);
    setError(null);
    setLeftMs(DURATION_MS);
    startedAtRef.current = Date.now();
    setRunning(true);
    void advance();
  };

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, DURATION_MS - (Date.now() - startedAtRef.current));
      setLeftMs(left);
      if (left === 0) finish();
    }, 100);
    return () => window.clearInterval(id);
  }, [running, finish, DURATION_MS]);

  /** Recall mode: an answer to the current question — a square, or 'captured'. */
  const answerRecall = (key: string) => {
    if (!task || !running || task.mode !== 'recall') return;
    const question = task.questions?.[questionIndex];
    if (!question) return;
    const expected = question.answer ?? 'captured';
    if (key === expected) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      if (question.answer) {
        setAnswered((a) => new Map(a).set(question.answer as Square, 'correct'));
      }
      const last = questionIndex + 1 >= (task.questions?.length ?? 0);
      if (last) {
        playSound('solved');
        window.setTimeout(() => void advance(), 500);
      } else {
        playSound('move');
        setQuestionIndex(questionIndex + 1);
      }
    } else {
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      playSound('failed');
      if (key !== 'captured') {
        setWrong(key);
        window.setTimeout(() => setWrong((w) => (w === key ? null : w)), 300);
      }
    }
  };

  const registerAttempt = (key: string) => {
    if (!task || !running) return;
    if (task.mode === 'recall') {
      answerRecall(key);
      return;
    }
    if (found.has(key)) return;
    if (task.targets.has(key)) {
      const next = new Set(found);
      next.add(key);
      setFound(next);
      scoreRef.current += 1;
      setScore(scoreRef.current);
      playSound('move');
      if (next.size >= task.targets.size) {
        playSound('solved');
        window.setTimeout(() => void advance(), 350);
      }
    } else {
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      setWrong(key);
      playSound('failed');
      window.setTimeout(() => setWrong((w) => (w === key ? null : w)), 300);
    }
  };

  const hidden = blindfold && !preview;
  const clickPieces = useMemo(() => {
    if (!task || mode !== 'moves') return undefined;
    const pieces = piecesFromFen(task.fen);
    if (!hidden) return pieces;
    // Blindfold: keep only the piece being asked about.
    const only = new Map<Square, ClickBoardPiece>();
    const target = task.piece ? pieces.get(task.piece) : undefined;
    if (task.piece && target) only.set(task.piece, target);
    return only;
  }, [task, mode, hidden]);
  const clickMarks = useMemo(() => {
    const map = new Map<Square, string>();
    if (task && mode === 'recall') {
      for (const [sq, mark] of answered) map.set(sq, mark);
      if (wrong) map.set(wrong as Square, 'wrong');
      return map;
    }
    if (!task || mode !== 'moves') return map;
    if (task.piece) map.set(task.piece, 'target');
    for (const sq of found) map.set(sq as Square, 'correct');
    if (wrong) map.set(wrong as Square, 'wrong');
    return map;
  }, [task, mode, found, wrong, answered]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (!task || mode === 'moves') return [];
    const list: DrawShape[] = [...found].map((key) => ({
      orig: key.slice(0, 2) as Square,
      dest: key.slice(2, 4) as Square,
      brush: 'green',
    }));
    if (wrong) {
      list.push({
        orig: wrong.slice(0, 2) as Square,
        dest: wrong.slice(2, 4) as Square,
        brush: 'red',
      });
    }
    return list;
  }, [task, mode, found, wrong]);

  const info = MODE_INFO[mode];
  const timerPct = (leftMs / DURATION_MS) * 100;
  const remainingTargets = task ? task.targets.size - found.size : 0;
  const question = task?.mode === 'recall' ? task.questions?.[questionIndex] : undefined;
  const questionCount = task?.questions?.length ?? 0;

  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/drills">Drills</Link> / {info.title}
        </p>
        <h1>{info.title}</h1>
        <p>{info.blurb}</p>
      </div>

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          {mode === 'moves' || mode === 'recall' ? (
            <ClickBoard
              pieces={clickPieces ?? new Map()}
              orientation="white"
              marks={clickMarks}
              onSquare={(square) => registerAttempt(square)}
              disabled={!running || !task}
              ariaLabel={
                mode === 'recall' ? 'Guess the position board' : 'Piece movement drill board'
              }
            />
          ) : (
            <Board
              fen={task?.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1'}
              orientation={task?.turn ?? 'white'}
              turnColor={task?.turn ?? 'white'}
              movableColor={running && task ? task.turn : undefined}
              dests={running && task ? task.dests : new Map()}
              shapes={shapes}
              onMove={(from, to) => registerAttempt(`${from}${to}`)}
              ariaLabel={`${info.title} board`}
              className={hidden ? 'board--blindfold' : undefined}
            />
          )}
          {!running && !finished ? (
            <div className="trainer__overlay">
              <Button variant="primary" size="lg" onClick={start}>
                Start · {DURATION_MS / 1000} seconds
              </Button>
            </div>
          ) : null}
          {finished ? (
            <div className="trainer__overlay">
              <Card className="drill__summary">
                <p className="card__eyebrow">Time!</p>
                <h2 style={{ margin: '4px 0' }}>
                  {finished.score} found
                  {best && finished.score >= best.best && finished.score > 0 ? ' · best!' : ''}
                </h2>
                <p className="muted">
                  {finished.positions} position{finished.positions === 1 ? '' : 's'} ·{' '}
                  {finished.mistakes} mistake
                  {finished.mistakes === 1 ? '' : 's'}
                </p>
                <div className="row">
                  <Button variant="primary" onClick={start}>
                    Again
                  </Button>
                  <LinkButton to="/drills">All drills</LinkButton>
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          {error ? <Alert tone="warning">{error}</Alert> : null}
          <Card>
            <p className="puzzle-status" role="status" data-testid="vision-status">
              {running && task && question
                ? `Where is the ${question.color} ${ROLE_NAME[question.role] ?? question.role} that started on ${question.origin}?`
                : running && task
                  ? `${info.prompt} ${remainingTargets} to go.`
                  : running
                    ? 'Loading position…'
                    : info.prompt}
            </p>
            {running && task?.mode === 'recall' && task.moves ? (
              <>
                <p className="mono small drill__moves" data-testid="recall-moves">
                  {numberedMoves(task.moves)}
                </p>
                <div className="row" style={{ marginBottom: 8 }}>
                  <Button size="sm" onClick={() => registerAttempt('captured')}>
                    It was captured
                  </Button>
                  <span className="small muted">
                    Question {Math.min(questionIndex + 1, questionCount)} of {questionCount}
                  </span>
                </div>
              </>
            ) : null}
            <div
              className={`drill__timer${leftMs < 8000 && running ? ' drill__timer--low' : ''}`}
              aria-hidden="true"
            >
              <span style={{ width: `${timerPct}%` }} />
            </div>
            <div className="drill__hud">
              <Stat value={score} label="Found" />
              <Stat value={mistakes} label="Mistakes" />
              <Stat value={`${Math.ceil(leftMs / 1000)}s`} label="Left" />
            </div>
            {running && task ? (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Position {positions}
                {mode !== 'moves'
                  ? ` · ${task.turn === 'white' ? 'White' : 'Black'} to move.`
                  : '.'}
              </p>
            ) : null}
          </Card>

          {mode !== 'recall' ? (
            <Card>
              <div className="stack">
                <Switch
                  checked={blindfold}
                  onChange={setBlindfold}
                  label="Blindfold"
                  description="Each position is shown for a moment, then the pieces disappear. Answer from memory."
                />
              </div>
            </Card>
          ) : null}

          <Card>
            <Segmented
              ariaLabel="Drill mode"
              value={mode}
              onChange={(m) => {
                if (running) return;
                setFinished(null);
                setSearchParams({ mode: m });
              }}
              options={[
                { value: 'moves', label: 'Moves' },
                { value: 'captures', label: 'Captures' },
                { value: 'checks', label: 'Checks' },
                { value: 'recall', label: 'Recall' },
              ]}
            />
          </Card>

          <Card>
            <div className="puzzle-stats">
              <Stat value={best?.best ?? '–'} label="Best score" />
              <Stat value={best?.attempts ?? 0} label="Runs" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
