import type { Square } from 'chess.js';
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { ClickBoard, type ClickBoardPiece } from '@/components/board/ClickBoard';
import { Button, Card, Segmented, Stat, Switch, LinkButton } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import { NONE } from '@/lib/format';
import { playSound } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { parseTypedSquare } from './typedSquare';
import '@/features/puzzles/puzzles.css';
import './drills.css';

const DURATION_MS = 30_000;
const FILES = 'abcdefgh';

function randomSquare(exclude: Square | null, random = Math.random): Square {
  let square: Square;
  do {
    square = `${FILES[Math.floor(random() * 8)] ?? 'a'}${Math.floor(random() * 8) + 1}` as Square;
  } while (square === exclude);
  return square;
}

const START_PIECES: ReadonlyMap<Square, ClickBoardPiece> = (() => {
  const map = new Map<Square, ClickBoardPiece>();
  const back: ClickBoardPiece['role'][] = [
    'rook',
    'knight',
    'bishop',
    'queen',
    'king',
    'bishop',
    'knight',
    'rook',
  ];
  back.forEach((role, i) => {
    const file = FILES[i] ?? 'a';
    map.set(`${file}1` as Square, { color: 'white', role });
    map.set(`${file}2` as Square, { color: 'white', role: 'pawn' });
    map.set(`${file}7` as Square, { color: 'black', role: 'pawn' });
    map.set(`${file}8` as Square, { color: 'black', role });
  });
  return map;
})();

type Side = 'white' | 'black' | 'random';

export default function CoordinatesDrill() {
  const recordDrill = useProgress((s) => s.recordDrill);
  const best = useProgress((s) => s.drills.coordinates);
  const [side, setSide] = useState<Side>('white');
  const [withPieces, setWithPieces] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<{ score: number; mistakes: number } | null>(null);
  const [target, setTarget] = useState<Square | null>(null);
  const [orientation, setOrientation] = useState<LongColor>('white');
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [leftMs, setLeftMs] = useState(DURATION_MS);
  const [flash, setFlash] = useState<{ square: Square; kind: 'correct' | 'wrong' } | null>(null);
  const [typed, setTyped] = useState('');
  const startedAtRef = useRef(0);
  const scoreRef = useRef(0);
  const mistakesRef = useRef(0);
  const typedRef = useRef<HTMLInputElement>(null);
  // A run started from the keyboard continues on the keyboard: the typed answer field gets
  // the focus (a tap or click keeps it off, so no on-screen keyboard covers the board).
  const typeAnswersRef = useRef(false);

  useEffect(() => {
    document.title = `Coordinates drill · ${siteConfig.name}`;
  }, []);

  const finish = useCallback(() => {
    setRunning(false);
    setTarget(null);
    setFinished({ score: scoreRef.current, mistakes: mistakesRef.current });
    recordDrill('coordinates', scoreRef.current, `${scoreRef.current} squares in 30 s`);
    playSound('gameEnd');
  }, [recordDrill]);

  const start = (event?: MouseEvent) => {
    // A button activated with Enter or Space reports no pointer clicks (`detail` 0).
    typeAnswersRef.current = event?.detail === 0;
    scoreRef.current = 0;
    mistakesRef.current = 0;
    setScore(0);
    setMistakes(0);
    setFinished(null);
    setFlash(null);
    setTyped('');
    setLeftMs(DURATION_MS);
    startedAtRef.current = Date.now();
    setOrientation(side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : side);
    setTarget(randomSquare(null));
    setRunning(true);
  };

  useEffect(() => {
    if (running && typeAnswersRef.current) typedRef.current?.focus();
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, DURATION_MS - (Date.now() - startedAtRef.current));
      setLeftMs(left);
      if (left === 0) finish();
    }, 100);
    return () => window.clearInterval(id);
  }, [running, finish]);

  const onSquare = (square: Square) => {
    if (!running || !target) return;
    if (square === target) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      setFlash({ square, kind: 'correct' });
      playSound('move');
      if (side === 'random') setOrientation(Math.random() < 0.5 ? 'white' : 'black');
      setTarget(randomSquare(target));
    } else {
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      setFlash({ square, kind: 'wrong' });
      playSound('failed');
    }
    window.setTimeout(() => setFlash((f) => (f?.square === square ? null : f)), 250);
  };

  // Typing a square is the keyboard route: two characters answer at once, Enter answers too.
  const answerTyped = (text: string) => {
    const square = parseTypedSquare(text);
    if (!square) return false;
    setTyped('');
    onSquare(square);
    return true;
  };
  const onTypedChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.trim().length >= 2 && answerTyped(value)) return;
    setTyped(value.slice(0, 2));
  };
  const onTypedSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!answerTyped(typed)) setTyped('');
  };

  const marks = useMemo(() => {
    const map = new Map<Square, string>();
    if (flash) map.set(flash.square, flash.kind);
    return map;
  }, [flash]);

  const timerPct = (leftMs / DURATION_MS) * 100;

  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/drills">Drills</Link> / Coordinates
        </p>
        <h1>Coordinates</h1>
        <p>
          Click the named square as fast as you can — or type it. Coordinates are hidden on the
          board; that is the point.
        </p>
      </div>

      <div className="trainer trainer--lead">
        <div className="trainer__board" style={{ position: 'relative' }}>
          <ClickBoard
            pieces={withPieces ? START_PIECES : undefined}
            orientation={orientation}
            coordinates={false}
            marks={marks}
            onSquare={onSquare}
            disabled={!running}
            ariaLabel={`Coordinates drill board, ${orientation} at the bottom`}
            squareLabel={(square) => square}
          />
          {!running && !finished ? (
            <div className="trainer__overlay">
              <Button variant="primary" size="lg" onClick={(e) => start(e)}>
                Start · 30 seconds
              </Button>
            </div>
          ) : null}
          {finished ? (
            <div className="trainer__overlay">
              <Card className="summary">
                <p className="card__eyebrow">Time!</p>
                <h2 style={{ margin: '4px 0' }}>
                  {finished.score} square{finished.score === 1 ? '' : 's'}
                  {best && finished.score >= best.best && finished.score > 0 ? ' · best!' : ''}
                </h2>
                <p className="muted">
                  {finished.mistakes} mistake{finished.mistakes === 1 ? '' : 's'} ·{' '}
                  {finished.score
                    ? Math.round((finished.score / (finished.score + finished.mistakes)) * 100)
                    : 0}
                  % accuracy
                </p>
                <div className="row">
                  <Button variant="primary" onClick={(e) => start(e)} autoFocus>
                    Again
                  </Button>
                  <LinkButton to="/drills">All drills</LinkButton>
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        <Card className="trainer__lead">
          <div
            className={`drill__prompt${flash ? ` drill__prompt--${flash.kind}` : ''}`}
            aria-live="assertive"
            data-testid="coordinates-prompt"
          >
            {target ?? NONE}
          </div>
          <div
            className={`drill__timer${leftMs < 5000 && running ? ' drill__timer--low' : ''}`}
            aria-hidden="true"
          >
            <span style={{ width: `${timerPct}%` }} />
          </div>
          <div className="drill__hud">
            <Stat value={score} label="Correct" />
            <Stat value={mistakes} label="Mistakes" />
            <Stat value={`${Math.ceil(leftMs / 1000)}s`} label="Left" />
          </div>
          <form className="row drill__typed" onSubmit={onTypedSubmit}>
            <label className="small muted" htmlFor="coordinates-typed">
              Or type the square
            </label>
            <input
              ref={typedRef}
              id="coordinates-typed"
              className="input drill__typed-input"
              value={typed}
              onChange={onTypedChange}
              disabled={!running}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              maxLength={2}
              placeholder="e4"
              aria-describedby="coordinates-typed-help"
            />
            <span id="coordinates-typed-help" className="sr-only">
              Two characters, a file and a rank, answer as soon as they are typed.
            </span>
          </form>
          {/* Always in the page, so the result is announced when the time is up. */}
          <p className="sr-only" role="status" data-testid="coordinates-result">
            {finished
              ? `Time! ${finished.score} square${finished.score === 1 ? '' : 's'}, ${finished.mistakes} mistake${finished.mistakes === 1 ? '' : 's'}.`
              : ''}
          </p>
        </Card>

        <aside className="trainer__panel stack">
          <Card>
            <div className="stack">
              <Segmented
                ariaLabel="Board side"
                value={side}
                onChange={(v) => {
                  if (!running) setSide(v);
                }}
                options={[
                  { value: 'white', label: 'White side' },
                  { value: 'black', label: 'Black side' },
                  { value: 'random', label: 'Mixed' },
                ]}
              />
              <Switch
                checked={withPieces}
                onChange={setWithPieces}
                label="Show the starting position"
                description="Pieces make it easier to orient — try without once you are comfortable."
              />
            </div>
          </Card>

          <Card>
            <div className="puzzle-stats">
              <Stat value={best?.best ?? NONE} label="Best score" />
              <Stat value={best?.attempts ?? 0} label="Runs" />
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Strong players name any square without looking. Aim for 25+ in 30 seconds from both
              sides.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
