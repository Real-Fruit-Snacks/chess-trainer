import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { MoveList } from '@/components/chess/MoveList';
import { Alert, Badge, Button, Card, Kbd, Stat } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { CLASSIC_GAMES, type ClassicGame, getClassicGame } from './games';
import { useGuessTheMove } from './useGuessTheMove';
import './classics.css';

export default function ClassicsPage() {
  const results = useProgress((s) => s.guessGames);

  useEffect(() => {
    document.title = `Classic games · ${siteConfig.name}`;
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Classic games</h1>
        <p>
          Guess the move: the opening is played for you, then you take over the winner’s side. Three
          points for the move played in the game, two when Stockfish says your idea was just as
          good.
        </p>
      </div>
      <div className="grid grid--cards">
        {CLASSIC_GAMES.map((game) => {
          const result = results[game.id];
          return (
            <Link
              key={game.id}
              to={`/classics/${game.id}`}
              className="card card--interactive classic-card"
            >
              <div className="row row--between">
                <span className="card__title">{game.title}</span>
                {result ? (
                  <Badge tone="success">
                    {result.score}/{result.maxScore}
                  </Badge>
                ) : (
                  <Badge>{'★'.repeat(game.difficulty)}</Badge>
                )}
              </div>
              <span className="classic-card__players">
                {game.white} – {game.black}
              </span>
              <span className="small muted">
                {game.event} {game.year} · {game.result} · you play {game.guessColor}
              </span>
              <p className="small muted" style={{ margin: 0 }}>
                {game.intro}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ClassicGamePage() {
  const { gameId = '' } = useParams<{ gameId: string }>();
  const game = getClassicGame(gameId);

  useEffect(() => {
    document.title = `${game?.title ?? 'Classic game'} · ${siteConfig.name}`;
  }, [game]);

  if (!game) {
    return (
      <div>
        <div className="page-header">
          <h1>Game not found</h1>
          <p>
            <Link to="/classics">Back to classic games</Link>
          </p>
        </div>
      </div>
    );
  }
  return <GuessTrainer key={game.id} game={game} />;
}

function GuessTrainer({ game }: { game: ClassicGame }) {
  const guess = useGuessTheMove(game);
  const best = useProgress((s) => s.guessGames[game.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (
        (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') &&
        guess.phase === 'feedback'
      ) {
        e.preventDefault();
        guess.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guess]);

  const { board, phase } = guess;
  const learnerTurn = phase === 'guess';
  const moveNumber = Math.floor(guess.ply / 2) + 1;

  const status = (() => {
    switch (phase) {
      case 'intro':
        return 'Replaying the opening…';
      case 'guess':
        return `Move ${moveNumber}: what did ${game.guessColor === 'white' ? game.white : game.black} play?`;
      case 'checking':
        return 'Not the game move — asking Stockfish whether it was just as good…';
      case 'auto':
        return 'Opponent replies…';
      case 'feedback':
        return guess.feedback?.verdict === 'exact'
          ? `Yes! ${guess.feedback.actual} — 3 points.`
          : guess.feedback?.verdict === 'good'
            ? `${guess.feedback.played} was also strong (2 points). The game went ${guess.feedback.actual}.`
            : `${guess.feedback?.played} is weaker. The game move was ${guess.feedback?.actual}.`;
      case 'done':
        return `Finished: ${guess.score}/${guess.maxScore} points.`;
      default:
        return '';
    }
  })();

  return (
    <div>
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/classics">Classic games</Link> / {game.event} {game.year}
        </p>
        <h1>{game.title}</h1>
        <p>
          <strong>{game.white}</strong> vs <strong>{game.black}</strong> · {game.result} · you guess
          for {game.guessColor}.
        </p>
      </div>

      <div className="trainer">
        <div className="trainer__board" style={{ position: 'relative' }}>
          <Board
            fen={board.fen}
            orientation={game.guessColor}
            turnColor={board.turn}
            movableColor={learnerTurn ? game.guessColor : undefined}
            dests={learnerTurn ? board.dests : new Map()}
            lastMove={board.lastMove}
            check={board.check}
            onMove={(from, to) => guess.playMove(from, to)}
            ariaLabel={`${game.title}, ${board.turn} to move`}
          />
          {guess.needsPromotion ? (
            <PromotionPicker color={game.guessColor} onSelect={guess.resolvePromotion} />
          ) : null}
          {phase === 'done' ? (
            <div className="trainer__overlay">
              <Card className="drill__summary">
                <p className="card__eyebrow">Game over · {game.result}</p>
                <h2 style={{ margin: '4px 0' }}>
                  {guess.score}/{guess.maxScore} points
                </h2>
                <p className="muted">
                  {best && best.score > guess.score
                    ? `Your best is ${best.score}.`
                    : 'That is your best score for this game.'}
                </p>
                <div className="row">
                  <Button variant="primary" onClick={guess.restart}>
                    Play again
                  </Button>
                  <Link className="btn" to={`/analyze?pgn=${encodeURIComponent(gamePgn(game))}`}>
                    Analyze game
                  </Link>
                  <Link className="btn btn--ghost" to="/classics">
                    All games
                  </Link>
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="trainer__panel stack">
          <Card>
            <p
              className={`puzzle-status${
                guess.feedback?.verdict === 'exact'
                  ? ' puzzle-status--solved'
                  : guess.feedback?.verdict === 'miss'
                    ? ' puzzle-status--failed'
                    : ''
              }`}
              role="status"
            >
              {status}
            </p>
            {guess.feedback?.note ? <Alert tone="info">{guess.feedback.note}</Alert> : null}
            {phase === 'done' ? <Alert tone="info">{game.outro}</Alert> : null}
            {phase === 'intro' && guess.ply === 0 ? (
              <p className="small muted">{game.intro}</p>
            ) : null}
            <div className="puzzle-actions">
              {phase === 'feedback' ? (
                <Button variant="primary" onClick={guess.next} autoFocus>
                  Continue <Kbd>Space</Kbd>
                </Button>
              ) : null}
              {phase === 'intro' ? (
                <Button onClick={guess.skipToGuessing}>Skip the opening</Button>
              ) : null}
              {phase !== 'done' && phase !== 'intro' ? (
                <Button variant="ghost" onClick={guess.restart}>
                  Restart
                </Button>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="puzzle-stats">
              <Stat value={`${guess.score}/${guess.maxScore}`} label="Points" />
              <Stat value={guess.guesses} label="Guesses" />
              <Stat value={best ? `${best.score}/${best.maxScore}` : '–'} label="Best" />
            </div>
            {guess.engineStatus !== 'ready' ? (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Engine {guess.engineStatus === 'error' ? 'unavailable' : 'loading'} — alternative
                moves score 0 until it is ready.
              </p>
            ) : null}
          </Card>

          <Card>
            <MoveList
              moves={guess.history}
              currentPly={guess.history.length}
              onSelectPly={() => undefined}
              startsWithBlack={false}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function gamePgn(game: ClassicGame): string {
  const headers = [
    `[Event "${game.event}"]`,
    `[Date "${game.year}.??.??"]`,
    `[White "${game.white}"]`,
    `[Black "${game.black}"]`,
    `[Result "${game.result}"]`,
  ].join('\n');
  const moves = game.moves
    .split(' ')
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
    .join(' ');
  return `${headers}\n\n${moves} ${game.result}`;
}
