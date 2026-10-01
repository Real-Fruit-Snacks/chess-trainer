import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { Alert, Badge, Button, Card, Field, Select, Spinner, LinkButton } from '@/components/ui';
import { ENGINE_LEVELS } from '@/engine/levels';
import { usePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import {
  ARMY_PIECES,
  ARMY_PRESETS,
  type Army,
  armyCost,
  armyProblem,
  BUDGETS,
  canAdd,
  DEFAULT_BUDGET,
  describeArmy,
  draftFen,
  EMPTY_ARMY,
  PIECE_COST,
  PIECE_NAME,
  randomArmy,
} from './army';
import { EngineGameBoard, GameMoves } from './EngineGameBoard';
import '@/features/play/play.css';
import './arcade.css';

type EngineArmy = 'random' | 'mirror';

export default function ArmyDraftPage() {
  const play = usePlayVsEngine();
  const settings = useSettings();
  const recordArcade = useProgress((s) => s.recordArcade);
  const best = useProgress((s) => s.arcade['army-draft']);
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET);
  const [army, setArmy] = useState<Army>(
    () => ARMY_PRESETS.find((p) => p.id === 'balanced')?.army ?? EMPTY_ARMY,
  );
  const [engineArmyMode, setEngineArmyMode] = useState<EngineArmy>('random');
  const [engineArmy, setEngineArmy] = useState<Army>(() => randomArmy(DEFAULT_BUDGET));
  const [levelId, setLevelId] = useState(settings.playLevel);
  const [drafting, setDrafting] = useState(true);
  const [confirmResign, setConfirmResign] = useState(false);
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Army Draft · ${siteConfig.name}`;
  }, []);

  const problem = armyProblem(army, budget);
  const opponentArmy = engineArmyMode === 'mirror' ? army : engineArmy;
  const previewFen = useMemo(() => draftFen(army, opponentArmy), [army, opponentArmy]);

  const changeBudget = (next: number) => {
    setBudget(next);
    if (armyCost(army) > next) setArmy(EMPTY_ARMY);
    setEngineArmy(randomArmy(next));
  };

  const add = (piece: (typeof ARMY_PIECES)[number], delta: 1 | -1) => {
    setArmy((current) => {
      const next = { ...current, [piece]: Math.max(0, current[piece] + delta) };
      if (delta > 0 && !canAdd(current, piece, budget)) return current;
      return next;
    });
  };

  const begin = () => {
    if (problem) return;
    recordedRef.current = false;
    setConfirmResign(false);
    setDrafting(false);
    play.start({
      color: 'white',
      levelId,
      timeControlId: 'none',
      fen: draftFen(army, opponentArmy),
      opponent: 'engine',
      coach: false,
    });
  };

  useEffect(() => {
    if (!play.gameOver || recordedRef.current) return;
    recordedRef.current = true;
    const { verdict } = play.gameOver;
    const score = verdict === 'win' ? play.level.id * 10 : verdict === 'draw' ? 5 : 0;
    const result = verdict === 'win' ? 'Won' : verdict === 'draw' ? 'Drew' : 'Lost';
    recordArcade(
      'army-draft',
      score,
      `${result} vs Level ${play.level.id} with ${describeArmy(army)} (${budget} points)`,
    );
  }, [play.gameOver, play.level.id, army, budget, recordArcade]);

  const over = play.gameOver;

  const backToDraft = () => {
    setDrafting(true);
    setEngineArmy(randomArmy(budget));
  };

  if (drafting) {
    return (
      <div>
        <Header />
        <div className="trainer">
          <div className="play__boardcol">
            <div className="trainer__board">
              <Board fen={previewFen} viewOnly ariaLabel="Preview of the drafted armies" />
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              You play White. The engine’s army ({describeArmy(opponentArmy)}) is drawn fresh for
              every game.
            </p>
          </div>
          <aside className="trainer__panel stack">
            <Card>
              <div className="row row--between">
                <strong>Your army</strong>
                <span className="arcade__budget" data-testid="army-budget">
                  {armyCost(army)} / {budget}
                </span>
              </div>
              <div className="arcade__shop" style={{ marginTop: 12 }} data-testid="army-shop">
                {ARMY_PIECES.map((piece) => (
                  <div key={piece} className="arcade__shop-item">
                    <span>
                      <strong>{PIECE_NAME[piece]}</strong>
                      <span className="small muted"> · {PIECE_COST[piece]}</span>
                    </span>
                    <span className="arcade__shop-stepper">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        aria-label={`Remove a ${PIECE_NAME[piece].toLowerCase()}`}
                        onClick={() => add(piece, -1)}
                        disabled={army[piece] === 0}
                      >
                        −
                      </Button>
                      <span className="arcade__shop-count" data-testid={`army-count-${piece}`}>
                        {army[piece]}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        aria-label={`Add a ${PIECE_NAME[piece].toLowerCase()}`}
                        onClick={() => add(piece, 1)}
                        disabled={!canAdd(army, piece, budget)}
                      >
                        +
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {ARMY_PRESETS.filter((p) => p.budget <= budget).map((preset) => (
                  <Button key={preset.id} size="sm" onClick={() => setArmy(preset.army)}>
                    {preset.name}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setArmy(EMPTY_ARMY)}>
                  Clear
                </Button>
              </div>
              {problem ? (
                <p className="small" style={{ color: 'var(--danger)', margin: '12px 0 0' }}>
                  {problem}
                </p>
              ) : null}
            </Card>
            <Card>
              <div className="stack">
                <Field label="Budget">
                  {(id) => (
                    <Select
                      id={id}
                      value={budget}
                      onChange={(e) => changeBudget(Number(e.target.value))}
                      data-testid="army-budget-select"
                    >
                      {BUDGETS.map((b) => (
                        <option key={b} value={b}>
                          {b} points{b === 39 ? ' (a full set)' : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="The engine’s army">
                  {(id) => (
                    <Select
                      id={id}
                      value={engineArmyMode}
                      onChange={(e) => setEngineArmyMode(e.target.value as EngineArmy)}
                    >
                      <option value="random">Random draft with the same budget</option>
                      <option value="mirror">Same army as yours</option>
                    </Select>
                  )}
                </Field>
                <Field label="Strength">
                  {(id) => (
                    <Select
                      id={id}
                      value={levelId}
                      onChange={(e) => setLevelId(Number(e.target.value))}
                      data-testid="army-level"
                    >
                      {ENGINE_LEVELS.map((l) => (
                        <option key={l.id} value={l.id}>
                          Level {l.id} · {l.name} (~{l.approxElo})
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="row">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={begin}
                    disabled={problem !== null || play.engineStatus === 'error'}
                    data-testid="army-start"
                  >
                    Start the battle
                  </Button>
                  {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
                </div>
                {best ? (
                  <p className="small muted" style={{ margin: 0 }}>
                    Best: {best.detail}
                  </p>
                ) : null}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  const overlay = over ? (
    <Card className="arcade__summary" data-testid="army-result">
      <h2>
        {over.verdict === 'win' ? 'You win' : over.verdict === 'draw' ? 'Draw' : 'The engine wins'}
      </h2>
      <p className="muted">
        {over.reason.charAt(0).toUpperCase() + over.reason.slice(1)}. Your {describeArmy(army)}{' '}
        against the engine’s {describeArmy(opponentArmy)}.
      </p>
      <div className="row">
        <Button variant="primary" onClick={backToDraft}>
          Draft again
        </Button>
        <LinkButton to="/arcade">Arcade</LinkButton>
      </div>
    </Card>
  ) : null;

  return (
    <div>
      <Header />
      {play.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {play.engineError?.message}{' '}
          <Button size="sm" onClick={() => void play.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}
      <div className="trainer">
        <EngineGameBoard
          play={play}
          engineName={`Stockfish · ${play.level.name}`}
          ariaLabel={`Army draft board, ${play.game.position.turn} to move`}
          overlay={overlay}
          showMaterial={false}
        />
        <aside className="trainer__panel stack">
          <Card>
            <div className="row row--between">
              <strong>Stockfish · {play.level.name}</strong>
              <Badge>{budget} points</Badge>
            </div>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              You: {describeArmy(army)}. Engine: {describeArmy(opponentArmy)}.
            </p>
          </Card>
          <GameMoves
            play={play}
            onResign={() => setConfirmResign(true)}
            extra={
              confirmResign && play.started && !over ? (
                <>
                  <span className="small muted">Resign?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      play.resign();
                      setConfirmResign(false);
                    }}
                  >
                    Yes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>
                    No
                  </Button>
                </>
              ) : null
            }
          />
        </aside>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="page-header page-header--lean">
      <p className="card__eyebrow arcade__eyebrow">
        <Link to="/arcade">Arcade</Link> / Army Draft
      </p>
      <h1>Army Draft</h1>
      <p>
        Buy your pieces from a points budget — a queen costs 9, a rook 5, a bishop or knight 3, a
        pawn 1 — and fight the engine’s own draft. Kings are free; nobody castles.
      </p>
    </div>
  );
}
