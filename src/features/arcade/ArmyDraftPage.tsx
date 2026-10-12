import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { Alert, Badge, Button, Card, Field, Select, Spinner, LinkButton } from '@/components/ui';
import { usePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { AnalyzeGameButton, EngineLevelField, PlayOnlineLink } from './arcadeControls';
import { useArcadeFocus } from './arcadeGame';
import {
  ARMY_PRESETS,
  type Army,
  armyCost,
  armyProblem,
  BUDGETS,
  DEFAULT_BUDGET,
  describeArmy,
  describeBudget,
  draftFen,
  EMPTY_ARMY,
  randomArmy,
} from './army';
import { ArmyShop } from './ArmyShop';
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
  /** "New game" after a battle (not the first draft): the screen takes the focus then. */
  const [reopened, setReopened] = useState(false);
  /** The last change to the army, read out with the new total (the stepper is silent otherwise). */
  const [budgetNews, setBudgetNews] = useState('');
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Army Draft · ${siteConfig.name}`;
  }, []);

  useArcadeFocus(!drafting && play.started && !play.gameOver);

  const problem = armyProblem(army, budget);
  const opponentArmy = engineArmyMode === 'mirror' ? army : engineArmy;
  const previewFen = useMemo(() => draftFen(army, opponentArmy), [army, opponentArmy]);

  const changeBudget = (next: number) => {
    setBudget(next);
    const cleared = armyCost(army) > next;
    if (cleared) setArmy(EMPTY_ARMY);
    setEngineArmy(randomArmy(next));
    setBudgetNews(
      cleared
        ? `Budget ${next} points: your army no longer fit and was cleared.`
        : `Budget ${next} points. ${describeBudget(army, next)}`,
    );
  };

  /** The same armies and level again; a random engine army is drawn afresh, as before every game. */
  const begin = (engine: Army = opponentArmy) => {
    if (problem) return;
    recordedRef.current = false;
    setDrafting(false);
    play.start({
      color: 'white',
      levelId,
      timeControlId: 'none',
      fen: draftFen(army, engine),
      opponent: 'engine',
      coach: false,
      // A drafted position: kept out of the engine ladder, the courses and the Play results.
      source: 'arcade',
      event: `Army Draft · ${budget} points`,
    });
  };

  const playAgain = () => {
    if (engineArmyMode === 'mirror') {
      begin(army);
      return;
    }
    const fresh = randomArmy(budget);
    setEngineArmy(fresh);
    begin(fresh);
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
    setReopened(true);
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
            <SetupScreen
              intro="Spend the budget on your army; the engine drafts its own. Kings are free, and nobody castles."
              onStart={() => begin()}
              startDisabled={problem !== null || play.engineStatus === 'error'}
              startTestId="army-start"
              focusOnMount={reopened}
            >
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
              <div>
                <ArmyShop
                  army={army}
                  budget={budget}
                  news={budgetNews}
                  onChange={(next, news) => {
                    setArmy(next);
                    setBudgetNews(news);
                  }}
                />
              </div>
              <Field label="The engine’s army">
                {(id) => (
                  <Select
                    id={id}
                    value={engineArmyMode}
                    onChange={(e) => setEngineArmyMode(e.target.value as EngineArmy)}
                  >
                    <option value="random">Random draft, same budget</option>
                    <option value="mirror">Same army as yours</option>
                  </Select>
                )}
              </Field>
              <EngineLevelField
                value={levelId}
                onChange={setLevelId}
                testId="army-level"
                describe
              />
              {best ? <p className="small muted setup__note">Your best: {best.detail}.</p> : null}
              {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
            </SetupScreen>
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
      <div className="row arcade__summary-actions">
        <Button
          variant="primary"
          onClick={playAgain}
          title="The same army, budget and engine level"
          data-testid="army-again"
        >
          Play again
        </Button>
        <Button onClick={backToDraft} title="Back to the draft" data-testid="army-new">
          New game
        </Button>
        <AnalyzeGameButton pgn={play.pgn} orientation={play.playerColor} />
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
          <GameMoves play={play} />
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
      <div className="row row--between">
        <h1>Army Draft</h1>
        <PlayOnlineLink kind="army" />
      </div>
      <p>
        Buy your pieces from a points budget — a queen costs 9, a rook 5, a bishop or knight 3, a
        pawn 1 — and fight the engine’s own draft. Kings are free; nobody castles.
      </p>
    </div>
  );
}
