import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Card, Spinner, LinkButton } from '@/components/ui';
import { ChoiceCards, SetupScreen } from '@/components/setup/SetupScreen';
import { useFocusBoardAfterSetup } from '@/components/setup/useFocusBoardAfterSetup';
import { usePlayVsEngine } from '@/features/play/usePlayVsEngine';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { AnalyzeGameButton } from './arcadeControls';
import { useArcadeFocus } from './arcadeGame';
import { EngineGameBoard, GameMoves } from './EngineGameBoard';
import {
  advanceOdds,
  describeRung,
  describeRungResults,
  ODDS_RUNGS,
  oddsFen,
  type OddsStep,
  oddsStep,
} from './odds';
import './arcade.css';

/** Full strength: the top engine level. */
const ENGINE_LEVEL_ID = 8;

/** What the result card says the game did to the ladder. */
function stepText(step: OddsStep | null, rungIndex: number): string {
  switch (step) {
    case 'climbed':
      return `You climb to ${describeRung(rungIndex + 1)}.`;
    case 'reached-top':
      return 'You have climbed the whole ladder: next, a level game with no odds at all.';
    case 'beat-top':
      return 'You beat full-strength Stockfish on level terms — the top of the ladder.';
    case 'replayed':
      return 'A win on a lower rung; the ladder stays where it is.';
    case 'drew':
      return 'A draw is counted on the rung, but only a win climbs.';
    default:
      return 'The ladder stays where it is. Try again.';
  }
}

export default function OddsLadderPage() {
  const play = usePlayVsEngine();
  const ladder = useProgress((s) => s.oddsLadder);
  const setOddsLadder = useProgress((s) => s.setOddsLadder);
  const [rungIndex, setRungIndex] = useState(ladder.rung);
  /** The rung chosen on the setup screen (the current one, or a climbed one to replay). */
  const [chosen, setChosen] = useState(ladder.rung);
  /** "Choose a rung" after a game: the setup screen again. */
  const [settingUp, setSettingUp] = useState(false);
  const setupShown = !play.started || settingUp;
  const boardColRef = useRef<HTMLDivElement>(null);
  useFocusBoardAfterSetup(setupShown, boardColRef);
  /** What the last game did to the ladder (worked out before the ladder moved). */
  const [step, setStep] = useState<OddsStep | null>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = `Odds Ladder · ${siteConfig.name}`;
  }, []);

  useArcadeFocus(play.started && !play.gameOver);

  const begin = (index: number) => {
    const rung = ODDS_RUNGS[index];
    if (!rung) return;
    setRungIndex(index);
    setChosen(index);
    setSettingUp(false);
    setStep(null);
    recordedRef.current = false;
    play.start({
      color: 'white',
      levelId: ENGINE_LEVEL_ID,
      timeControlId: 'none',
      fen: oddsFen(rung),
      opponent: 'engine',
      coach: false,
      // A handicap game: kept out of the engine ladder, the courses and the Play results.
      source: 'arcade',
      event: `Odds Ladder · ${rung.name}`,
    });
  };

  // The ladder moves once per finished game.
  useEffect(() => {
    if (!play.gameOver || recordedRef.current) return;
    recordedRef.current = true;
    const before = useProgress.getState().oddsLadder;
    setStep(oddsStep(before, rungIndex, play.gameOver.verdict));
    setOddsLadder(advanceOdds(before, rungIndex, play.gameOver.verdict));
  }, [play.gameOver, rungIndex, setOddsLadder]);

  const rung = ODDS_RUNGS[rungIndex];
  const chosenRung = ODDS_RUNGS[chosen];
  const over = play.gameOver;
  const climbed = step === 'climbed' || step === 'reached-top';

  const overlay = setupShown ? null : over ? (
    <Card className="arcade__summary" data-testid="odds-result">
      <h2>
        {over.verdict === 'win' ? 'You win' : over.verdict === 'draw' ? 'Draw' : 'The engine wins'}
      </h2>
      <p className="muted">
        {over.reason.charAt(0).toUpperCase() + over.reason.slice(1)}. {stepText(step, rungIndex)}
      </p>
      <div className="row arcade__summary-actions">
        {climbed ? (
          <Button variant="primary" onClick={() => begin(ladder.rung)} data-testid="odds-next">
            Next rung
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => begin(rungIndex)}
            title="The same rung again"
            data-testid="odds-next"
          >
            Play again
          </Button>
        )}
        <Button
          onClick={() => {
            setChosen(ladder.rung);
            setSettingUp(true);
          }}
          data-testid="odds-choose"
        >
          Choose a rung
        </Button>
        <AnalyzeGameButton pgn={play.pgn} orientation={play.playerColor} />
        <LinkButton to="/arcade">Arcade</LinkButton>
      </div>
    </Card>
  ) : null;

  return (
    <div>
      <div className="page-header page-header--lean">
        <p className="card__eyebrow arcade__eyebrow">
          <Link to="/arcade">Arcade</Link> / Odds Ladder
        </p>
        <h1>Odds Ladder</h1>
        <p>
          Full-strength Stockfish gives you a head start. Beat it and the head start shrinks: queen,
          rook, knight, bishop, pawn — then a level game.
        </p>
      </div>

      {play.engineStatus === 'error' ? (
        <Alert tone="danger" role="alert">
          The engine could not start: {play.engineError?.message}{' '}
          <Button size="sm" onClick={() => void play.retryEngine()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className={setupShown ? 'trainer trainer--setup' : 'trainer'}>
        <EngineGameBoard
          play={play}
          engineName="Stockfish (full strength)"
          ariaLabel={`Odds ladder board, ${play.game.position.turn} to move`}
          overlay={overlay}
          showMaterial={false}
          preview={setupShown && chosenRung ? { fen: oddsFen(chosenRung) } : null}
          boardColRef={boardColRef}
        />

        <aside className="trainer__panel stack">
          {setupShown ? (
            <SetupScreen
              intro="You play White against Stockfish at full strength, which starts without some of its pieces. Win to climb: the head start shrinks with each rung. No take-backs, no hints."
              onStart={() => begin(chosen)}
              startDisabled={play.engineStatus === 'error'}
              startTestId="odds-start"
              focusOnMount={settingUp}
              back={
                settingUp
                  ? { label: 'Back to the board', onClick: () => setSettingUp(false) }
                  : null
              }
            >
              <div data-testid="odds-rungs">
                <ChoiceCards
                  name="odds-rung"
                  legend="Rung"
                  value={String(chosen)}
                  onChange={(value) => setChosen(Number(value))}
                  choices={ODDS_RUNGS.map((r, i) => {
                    const results = describeRungResults(ladder.results[i]);
                    const state =
                      i < ladder.rung ? 'climbed' : i === ladder.rung ? 'current' : 'locked';
                    return {
                      value: String(i),
                      title: r.name,
                      description:
                        state === 'climbed'
                          ? `Climbed${results ? ` · ${results}` : ''}`
                          : `${r.handicap}${results ? ` ${results}.` : ''}`,
                      icon:
                        state === 'climbed' ? 'check' : state === 'current' ? 'ladder' : 'circle',
                      unavailable:
                        state === 'locked'
                          ? `Locked: win ${ODDS_RUNGS[i - 1]?.name.toLowerCase() ?? 'the rung before'} first.`
                          : null,
                      badge: state === 'current' ? <Badge tone="accent">Current</Badge> : null,
                      testId: `odds-rung-${i}`,
                    };
                  })}
                />
              </div>
            </SetupScreen>
          ) : (
            <>
              <Card>
                <div className="row row--between">
                  <strong>{rung ? describeRung(rungIndex) : 'Odds Ladder'}</strong>
                  {play.engineStatus === 'loading' ? <Spinner label="Loading engine" /> : null}
                </div>
                {rung ? (
                  <p className="small muted" style={{ margin: '4px 0 0' }}>
                    {rung.handicap} No take-backs, no hints: a win has to be earned.
                  </p>
                ) : null}
              </Card>
              <GameMoves play={play} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
