import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { InstallBanner } from '@/app/InstallPrompt';
import { Badge, Button, CardLink, LinkButton, ProgressBar, Stat } from '@/components/ui';
import { activeCourse } from '@/features/learn/courseProgress';
import { COURSES } from '@/features/learn/courses';
import { LESSON_META } from '@/features/learn/lessonMeta';
import { trainingStreak } from '@/lib/dates';
import { formatRating, ratingBand } from '@/lib/rating';
import { useNow } from '@/lib/useNow';
import { siteConfig } from '@/site.config';
import { summarizeProgress, useProgress } from '@/store/progress';
import { useRepertoire } from '@/store/repertoire';
import { useSettings } from '@/store/settings';
import { buildDailyPlan } from './dailyPlan';
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
    text: 'Paste any game or position, explore variations, name the opening and let Stockfish grade every move.',
    cta: 'Open the board',
  },
  {
    to: '/drills',
    icon: '🎯',
    title: 'Drills',
    text: 'Coordinates, board vision and the essential checkmates and endgames — played out against a full-strength engine.',
    cta: 'Start a drill',
  },
  {
    to: '/openings',
    icon: '📚',
    title: 'Openings',
    text: 'Six ready-made repertoires (or your own PGN), trained move by move with spaced repetition.',
    cta: 'Learn a repertoire',
  },
  {
    to: '/classics',
    icon: '🏛',
    title: 'Classic games',
    text: 'Guess the moves of Morphy, Anderssen, Rubinstein and Lasker, with notes on every key moment.',
    cta: 'Guess the move',
  },
  {
    to: '/reference',
    icon: '📘',
    title: 'Reference',
    text: 'The rules, how to read notation, a glossary of chess terms and answers to common questions.',
    cta: 'Look something up',
  },
];

export default function HomePage() {
  const progress = useProgress();
  const stats = summarizeProgress(progress);
  const repertoireCards = useRepertoire((s) => s.cards);
  const customRepertoires = useRepertoire((s) => s.custom);
  const tourDismissed = useSettings((s) => s.tourDismissed);
  const updateSettings = useSettings((s) => s.update);
  const now = useNow(60_000, progress.puzzleReviews);
  const course = useMemo(
    () => activeCourse(COURSES, progress, repertoireCards),
    [progress, repertoireCards],
  );
  const plan = useMemo(
    () => buildDailyPlan(progress, { cards: repertoireCards, custom: customRepertoires }, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the plan depends on these slices only
    [
      progress.daily,
      progress.attempts,
      progress.puzzleReviews,
      progress.lessons,
      progress.drills,
      repertoireCards,
      customRepertoires,
      now,
    ],
  );
  const streak = useMemo(() => trainingStreak(progress.trainingDays), [progress.trainingDays]);

  useEffect(() => {
    document.title = `${siteConfig.name} — ${siteConfig.tagline}`;
  }, []);

  const hasActivity =
    progress.attempts.length > 0 ||
    Object.keys(progress.lessons).length > 0 ||
    progress.games.length > 0;
  const nextLesson = LESSON_META.find((l) => !progress.lessons[l.id]?.completedAt);

  return (
    <div>
      <section className="hero">
        <div className="hero__text">
          <Badge tone="accent">Free · Open source · Works offline</Badge>
          <h1 className="hero__title">Learn chess at your own pace — whatever your level.</h1>
          <p className="hero__lead">
            {siteConfig.name} runs entirely in your browser: interactive lessons, rating-aware
            puzzles, drills, an opening trainer, a scalable engine to play against and a full
            analysis board. No account, no ads, nothing to install unless you want to.
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

      {!hasActivity && !tourDismissed ? (
        <section className="home__welcome card" aria-labelledby="welcome-title">
          <div className="row row--between">
            <h2 id="welcome-title" style={{ margin: 0 }}>
              New here? Three steps to get going
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateSettings({ tourDismissed: true })}
            >
              Dismiss
            </Button>
          </div>
          <ol className="home__steps">
            <li>
              <strong>Set your level.</strong> Open <Link to="/puzzles">Puzzles</Link> and pick how
              much chess you have played — this sets a starting rating that adjusts as you solve.
            </li>
            <li>
              <strong>Do the first lesson.</strong>{' '}
              <Link to={`/learn/${LESSON_META[0]?.id ?? 'the-board'}`}>
                {LESSON_META[0]?.title ?? 'The board'}
              </Link>{' '}
              takes a few minutes; every lesson ends with a move to find on the board.
            </li>
            <li>
              <strong>Play a game.</strong> <Link to="/play">Level 1</Link> makes real mistakes, and
              you can take back moves and ask for hints while you learn.
            </li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>
            Everything works offline after the first visit, and your progress stays on this device.
          </p>
        </section>
      ) : null}

      {hasActivity || progress.onboarded ? (
        <section className="home__today card" aria-labelledby="today-title">
          <div className="row row--between">
            <div>
              <h2 id="today-title" style={{ margin: 0 }}>
                Today
              </h2>
              <p className="small muted" style={{ margin: '2px 0 0' }}>
                {plan.done} of {plan.total} done ·{' '}
                {streak.current > 0
                  ? `${streak.current}-day training streak${streak.best > streak.current ? ` (best ${streak.best})` : ''}`
                  : streak.best > 0
                    ? `Start a new streak (best ${streak.best})`
                    : 'Train a little every day to start a streak'}
              </p>
            </div>
            <span className="small muted">
              ~{plan.items.filter((i) => !i.done).reduce((sum, i) => sum + i.minutes, 0)} min left
            </span>
          </div>
          <div style={{ margin: '8px 0 12px' }}>
            <ProgressBar value={plan.done} max={plan.total} label="Today's plan" />
          </div>
          <ul className="home__plan">
            {plan.items.map((item) => (
              <li key={item.id}>
                <Link to={item.to} className={`home__plan-item${item.done ? ' is-done' : ''}`}>
                  <span className="home__plan-check" aria-hidden="true">
                    {item.done ? '✓' : ''}
                  </span>
                  <span className="home__plan-text">
                    <span className="home__plan-title">{item.title}</span>
                    <span className="small muted">{item.detail}</span>
                  </span>
                  <span className="small faint">{item.done ? 'done' : `${item.minutes} min`}</span>
                </Link>
              </li>
            ))}
          </ul>
          {course?.next ? (
            <p className="small home__course" data-testid="home-course">
              <strong>{course.course.title}</strong> · {course.doneItems}/{course.totalItems} steps
              ·{' '}
              <Link to={course.next.to}>
                {course.doneItems ? 'Continue' : 'Start'}: {course.next.title}
              </Link>{' '}
              · <Link to={`/learn/course/${course.course.id}`}>Course overview</Link>
            </p>
          ) : null}
        </section>
      ) : null}

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
            <Stat
              value={`${stats.lessonsCompleted}/${LESSON_META.length}`}
              label="Lessons completed"
            />
            <Stat value={streak.current} label="Training streak" />
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
              Drill <Link to="/puzzles/themes">tactical themes</Link> you miss in games, learn an{' '}
              <Link to="/openings">opening repertoire</Link>, practise the{' '}
              <Link to="/drills">endgames that decide points</Link>, and review your games move by
              move.
            </p>
          </div>
          <div className="card">
            <p className="card__eyebrow">Strong player</p>
            <p className="small">
              Rated puzzles go past 2600, Puzzle Rush tests your speed, the engine plays at full
              strength with a clock, and the analysis board gives you multi-line Stockfish with
              variations anywhere — even offline on a plane.
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
