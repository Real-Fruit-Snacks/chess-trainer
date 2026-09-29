import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { InstallBanner } from '@/app/InstallPrompt';
import { Badge, CardLink, LinkButton, Stat } from '@/components/ui';
import { lessons } from '@/features/learn/lessons';
import { formatRating, ratingBand } from '@/lib/rating';
import { siteConfig } from '@/site.config';
import { summarizeProgress, useProgress } from '@/store/progress';
import './home.css';

const FEATURES = [
  {
    to: '/learn',
    icon: '📖',
    title: 'Learn',
    text: 'From how the knight moves to the Greek gift sacrifice. Interactive lessons with engine-checked positions.',
    cta: 'Browse lessons',
  },
  {
    to: '/puzzles',
    icon: '🧩',
    title: 'Puzzles',
    text: 'Thousands of tactics from real games, chosen to match your rating. Daily puzzle, themed drills and a rating that tracks you.',
    cta: 'Solve puzzles',
  },
  {
    to: '/play',
    icon: '♞',
    title: 'Play',
    text: 'Eight opponents from “just learned the rules” to master strength. Take back moves, ask for hints, review afterwards.',
    cta: 'Play the engine',
  },
  {
    to: '/analyze',
    icon: '🔍',
    title: 'Analyze',
    text: 'Paste any game or position. Stockfish shows the best lines, finds your blunders and grades every move.',
    cta: 'Open the board',
  },
];

export default function HomePage() {
  const progress = useProgress();
  const stats = summarizeProgress(progress);

  useEffect(() => {
    document.title = `${siteConfig.name} — ${siteConfig.tagline}`;
  }, []);

  const hasActivity =
    progress.attempts.length > 0 ||
    Object.keys(progress.lessons).length > 0 ||
    progress.games.length > 0;
  const nextLesson = lessons.find((l) => !progress.lessons[l.id]?.completedAt);

  return (
    <div>
      <section className="hero">
        <div className="hero__text">
          <Badge tone="accent">Free · Open source · Works offline</Badge>
          <h1 className="hero__title">Learn chess at your own pace — whatever your level.</h1>
          <p className="hero__lead">
            {siteConfig.name} runs entirely in your browser: interactive lessons, rating-aware
            puzzles, a scalable engine to play against and a full analysis board. No account, no
            ads, nothing to install unless you want to.
          </p>
          <div className="row">
            <LinkButton variant="primary" size="lg" to={progress.onboarded ? '/puzzles' : '/learn'}>
              {progress.onboarded ? 'Continue training' : 'Start learning'}
            </LinkButton>
            <LinkButton size="lg" to="/play">
              Play a game
            </LinkButton>
          </div>
        </div>
        <div className="hero__art" aria-hidden="true">
          <MiniBoard />
        </div>
      </section>

      <InstallBanner />

      {hasActivity ? (
        <section className="home__progress card" aria-labelledby="your-progress">
          <div className="row row--between">
            <h2 id="your-progress" style={{ margin: 0 }}>
              Your progress
            </h2>
            <Link to="/progress" className="small">
              Details →
            </Link>
          </div>
          <div className="home__stats">
            <Stat
              value={formatRating(progress.puzzleRating)}
              label={`Puzzle rating · ${ratingBand(progress.puzzleRating)}`}
            />
            <Stat value={stats.solved} label="Puzzles solved" />
            <Stat value={`${stats.lessonsCompleted}/${lessons.length}`} label="Lessons completed" />
            <Stat value={progress.streak.current} label="Day streak" />
          </div>
          {nextLesson ? (
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Next lesson: <Link to={`/learn/${nextLesson.id}`}>{nextLesson.title}</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid--cards home__features" aria-label="Features">
        {FEATURES.map((f) => (
          <CardLink key={f.to} to={f.to} className="feature">
            <div className="feature__icon" aria-hidden="true">
              {f.icon}
            </div>
            <h2 className="card__title">{f.title}</h2>
            <p className="small muted">{f.text}</p>
            <span className="feature__cta">{f.cta} →</span>
          </CardLink>
        ))}
      </section>

      <section className="home__how">
        <h2>Built for every level</h2>
        <div className="grid grid--cards">
          <div className="card">
            <p className="card__eyebrow">New to chess</p>
            <p className="small">
              Start with <Link to="/learn/how-pieces-move">how the pieces move</Link>, then play the
              gentlest engine level. The puzzle trainer starts you around 500 and adapts within a
              dozen puzzles.
            </p>
          </div>
          <div className="card">
            <p className="card__eyebrow">Club player</p>
            <p className="small">
              Drill <Link to="/puzzles/themes">tactical themes</Link> you miss in games, study the{' '}
              <Link to="/learn/rook-endgames">endgames that decide points</Link>, and review your
              games move by move.
            </p>
          </div>
          <div className="card">
            <p className="card__eyebrow">Strong player</p>
            <p className="small">
              Rated puzzles go past 2600, the engine plays at full strength, and the analysis board
              gives you multi-line Stockfish anywhere — even offline on a plane.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Decorative static board for the hero: a plain CSS grid using chessground's piece sprites. */
function MiniBoard() {
  const pieces: Record<string, string> = {
    e1: 'king white',
    d1: 'queen white',
    f3: 'knight white',
    c4: 'bishop white',
    e4: 'pawn white',
    a2: 'pawn white',
    b2: 'pawn white',
    c2: 'pawn white',
    d2: 'pawn white',
    f2: 'pawn white',
    g2: 'pawn white',
    h2: 'pawn white',
    a1: 'rook white',
    h1: 'rook white',
    e8: 'king black',
    d8: 'queen black',
    c6: 'knight black',
    f6: 'knight black',
    c5: 'bishop black',
    e5: 'pawn black',
    a7: 'pawn black',
    b7: 'pawn black',
    c7: 'pawn black',
    d7: 'pawn black',
    f7: 'pawn black',
    g7: 'pawn black',
    h7: 'pawn black',
    a8: 'rook black',
    h8: 'rook black',
  };
  const files = 'abcdefgh';
  const squares = [];
  for (let rank = 8; rank >= 1; rank--) {
    for (let f = 0; f < 8; f++) {
      const key = `${files[f]}${rank}`;
      const dark = (f + rank) % 2 === 0;
      const piece = pieces[key];
      squares.push(
        <div key={key} className={`miniboard__sq${dark ? ' miniboard__sq--dark' : ''}`}>
          {piece ? <piece className={piece} /> : null}
        </div>,
      );
    }
  }
  return <div className="miniboard cg-wrap">{squares}</div>;
}
