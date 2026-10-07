import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Badge, Card, Icon, LinkButton, ScrollRegion, Stat } from '@/components/ui';
import { parsePgnCached } from '@/chess/tree';
import { CLASSIC_GAMES } from '@/features/classics/games';
import { LESSON_META } from '@/features/learn/lessonMeta';
import { repertoireStats } from '@/features/openings/model';
import { BUILT_IN_REPERTOIRES } from '@/features/openings/repertoires';
import { dueReviews } from '@/lib/puzzleReview';
import { useNow } from '@/lib/useNow';
import { cardsFor, useRepertoire } from '@/store/repertoire';
import { ENGINE_LEVELS } from '@/engine/levels';
import { themeName } from '@/features/puzzles/themes';
import { formatDate, formatDuration, trainingStreak } from '@/lib/dates';
import { formatCount, NONE } from '@/lib/format';
import { isProvisional, PROVISIONAL_RD } from '@/lib/glicko';
import { formatRating, ratingBand } from '@/lib/rating';
import { approximateGameRatings, formatRange } from '@/lib/ratingScales';
import { siteConfig } from '@/site.config';
import { summarizeProgress, useProgress } from '@/store/progress';
import { ArcadeCard } from './ArcadeCard';
import { BackupNudge } from './BackupNudge';
import { buildEngineLadder } from '@/features/play/ladder';
import { LevelResults } from './LevelResults';
import { RatingChart } from './RatingChart';
import { ThinkingSkillsCard } from './ThinkingSkillsCard';
import { WeeklyCard } from './WeeklyCard';
import {
  buildThemeReport,
  splitThemeReport,
  THEME_REPORT_MIN_ATTEMPTS,
  themeBaseline,
} from './themeReport';
import './progress.css';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { useLichess } from '@/store/lichess';

/** Puzzle tags that describe length or source rather than a skill. */
const META_TAGS = ['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM'];

function outcomeLabel(outcome: 'solved' | 'failed', hintUsed: boolean): string {
  if (outcome === 'failed') return 'Failed';
  return hintUsed ? 'Solved with a hint' : 'Solved';
}

export default function ProgressPage() {
  const progress = useProgress();
  const lichessConnected = useLichess((s) => s.account !== null);
  const syncedDevices = useDeviceSyncStore((s) => s.secret !== null);
  const stats = summarizeProgress(progress);
  // "Games against the computer" means the ordinary ones — the engine's levels and the human-like
  // opponent; arcade, simul and drill games have their own cards.
  const engineGames = progress.games.filter(
    (g) => g.source !== 'arcade' && g.source !== 'simul' && g.source !== 'drill',
  );
  const engineLadder = buildEngineLadder(engineGames, progress.ladderHeight);

  useEffect(() => {
    document.title = `Progress · ${siteConfig.name}`;
  }, []);

  const recent = progress.attempts.slice(0, 15);
  const repertoireCards = useRepertoire((s) => s.cards);
  const customRepertoires = useRepertoire((s) => s.custom);
  const now = useNow(60_000, progress.puzzleReviews);
  const trainingStreakValue = useMemo(
    () => trainingStreak(progress.trainingDays),
    [progress.trainingDays],
  );
  const reviewDue = useMemo(
    () => dueReviews(progress.puzzleReviews, now).length,
    [progress.puzzleReviews, now],
  );
  const openingStats = useMemo(() => {
    const all = [
      ...BUILT_IN_REPERTOIRES,
      ...customRepertoires.map((c) => ({ id: c.id, color: c.color, pgn: c.pgn })),
    ];
    return all.reduce(
      (acc, rep) => {
        try {
          const stats = repertoireStats(
            parsePgnCached(rep.pgn),
            rep.color,
            cardsFor(repertoireCards, rep.id),
            now,
          );
          return { due: acc.due + stats.due, learned: acc.learned + stats.learned };
        } catch {
          return acc;
        }
      },
      { due: 0, learned: 0 },
    );
  }, [repertoireCards, customRepertoires, now]);
  const themeReport = buildThemeReport(progress.themeStats);
  // Measured against the learner's own accuracy, so a theme is never in both lists.
  const baseline = themeBaseline(progress.themeStats);
  const { weak: weakest, strong: strongest } = splitThemeReport(themeReport, baseline);

  return (
    <div>
      <div className="page-header row row--between">
        <div>
          <h1>Progress</h1>
          <p>
            {syncedDevices
              ? 'Everything here is kept in step across your devices by sync between devices, end-to-end encrypted.'
              : lichessConnected
                ? 'Puzzles, games, repertoires and analyses are kept in step with your Lichess account; the rest is stored on this device only — export a backup before switching browsers.'
                : 'Everything is stored on this device only. Export a backup before switching browsers.'}
          </p>
        </div>
        <LinkButton to="/settings">
          <Icon name="settings" size={16} />
          <span>Settings</span>
        </LinkButton>
      </div>
      <BackupNudge />

      <div className="progress__grid">
        <div className="stack">
          <Card>
            <div className="stats">
              <Stat
                value={formatRating(progress.puzzleRating)}
                label={
                  <span data-testid="progress-rating-label">
                    Puzzle rating ± {Math.round(progress.puzzleRd)} ·{' '}
                    {ratingBand(progress.puzzleRating)}
                  </span>
                }
              />
              <Stat
                value={`${stats.solved}/${stats.solved + stats.failed}`}
                label="Puzzles solved"
              />
              <Stat
                value={
                  stats.solved + stats.failed
                    ? `${Math.round((stats.solved / (stats.solved + stats.failed)) * 100)}%`
                    : NONE
                }
                label="Accuracy"
              />
              <Stat
                value={stats.avgSolveMs ? formatDuration(stats.avgSolveMs) : NONE}
                label="Avg. solve time"
              />
              <Stat
                value={`${trainingStreakValue.current}`}
                label={`Training streak · best ${trainingStreakValue.best}`}
              />
              <Stat
                value={`${stats.lessonsCompleted}/${LESSON_META.length}`}
                label="Lessons completed"
              />
              <Stat value={`${stats.wins}–${stats.losses}–${stats.draws}`} label="Games W–L–D" />
            </div>
            {progress.onboarded && isProvisional({ rd: progress.puzzleRd }) ? (
              <p
                className="small muted"
                style={{ margin: '12px 0 0' }}
                data-testid="provisional-note"
              >
                Your puzzle rating is <strong>provisional</strong>: the ±{' '}
                {Math.round(progress.puzzleRd)} shows how uncertain it still is, so it moves
                quickly. It settles below ± {PROVISIONAL_RD} after a couple of dozen rated puzzles
                {progress.calibration
                  ? ` (calibration: ${progress.calibration.done} of ${progress.calibration.total} done)`
                  : ''}
                .
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Puzzle rating</h2>
            <RatingChart points={progress.ratingHistory} locale={siteConfig.locale} />
          </Card>

          <WeeklyCard />

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Recent puzzles</h2>
            {recent.length === 0 ? (
              <p className="small muted">
                No puzzles yet. <Link to="/puzzles">Start solving</Link>.
              </p>
            ) : (
              <ScrollRegion label="Recent puzzles">
                <table className="history">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Puzzle</th>
                      <th scope="col">Result</th>
                      <th scope="col" className="num">
                        Rating
                      </th>
                      <th scope="col" className="num">
                        Δ
                      </th>
                      <th scope="col">Themes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((a) => (
                      <tr key={`${a.id}-${a.at}`}>
                        <td>{formatDate(a.at, siteConfig.locale)}</td>
                        <td>
                          {/* The rating tells Puzzles which chunk holds the puzzle. */}
                          <Link
                            to={`/puzzles?id=${encodeURIComponent(a.id)}&rating=${Math.round(a.puzzleRating)}`}
                          >
                            {a.id}
                          </Link>{' '}
                          <span className="faint">({a.puzzleRating})</span>
                        </td>
                        <td>
                          <Badge tone={a.outcome === 'solved' ? 'success' : 'danger'}>
                            {outcomeLabel(a.outcome, a.hintUsed)}
                          </Badge>
                        </td>
                        <td className="num">{a.ratingAfter}</td>
                        <td className="num">
                          {a.ratingAfter - a.ratingBefore === 0
                            ? '·'
                            : `${a.ratingAfter - a.ratingBefore > 0 ? '+' : ''}${a.ratingAfter - a.ratingBefore}`}
                        </td>
                        <td className="faint">
                          {a.themes
                            .split(' ')
                            .filter((t) => !META_TAGS.includes(t))
                            .slice(0, 3)
                            .map(themeName)
                            .join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
          </Card>

          {engineGames.length > 0 ? (
            <Card>
              <h2 style={{ fontSize: '1.15rem' }}>Games against the computer</h2>
              <p className="small muted" style={{ margin: '0 0 8px' }} data-testid="ladder-height">
                {/* The height goes first unless the reason already says it. */}
                {engineLadder.height > 0 &&
                !engineLadder.complete &&
                !engineLadder.reason.startsWith(`Level ${engineLadder.height} is beaten`)
                  ? `Engine ladder: Level ${engineLadder.height} beaten · ${engineLadder.reason}`
                  : `Engine ladder: ${engineLadder.reason}`}{' '}
                <Link to="/play">Play</Link>
              </p>
              <LevelResults games={engineGames} />
              <h3 style={{ fontSize: '0.95rem', margin: '16px 0 4px' }}>Recent games</h3>
              <ScrollRegion label="Recent games">
                <table className="history">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Opponent</th>
                      <th scope="col">You</th>
                      <th scope="col">Result</th>
                      <th scope="col" className="num">
                        Moves
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {engineGames.slice(0, 10).map((g) => {
                      const level = ENGINE_LEVELS.find((l) => l.id === g.level);
                      const won = g.color === 'white' ? g.result === '1-0' : g.result === '0-1';
                      const tone = g.result === '1/2-1/2' ? 'neutral' : won ? 'success' : 'danger';
                      return (
                        <tr key={g.id}>
                          <td>
                            {formatDate(g.at, siteConfig.locale)}
                            {g.lichessId ? (
                              <>
                                {' · '}
                                <a
                                  href={`https://lichess.org/${g.lichessId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="small"
                                  aria-label={`This game on Lichess (${formatDate(g.at, siteConfig.locale)})`}
                                >
                                  Lichess
                                </a>
                              </>
                            ) : null}
                          </td>
                          <td>
                            {g.source === 'humanlike'
                              ? `Human-like · ${g.opponentRating ?? ''}`
                              : `Level ${g.level} · ${level?.name ?? ''}`}
                          </td>
                          <td>{g.color === 'white' ? 'White' : 'Black'}</td>
                          <td>
                            <Badge tone={tone}>
                              {g.result} · {g.reason}
                            </Badge>
                          </td>
                          <td className="num">{Math.ceil(g.plies / 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollRegion>
            </Card>
          ) : null}
        </div>
        <div className="stack">
          <RatingScalesCard rating={progress.puzzleRating} rd={progress.puzzleRd} />

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Training</h2>
            <div className="stats">
              <Stat
                value={Math.max(0, ...progress.rushRuns.map((r) => r.score)) || NONE}
                label="Best Puzzle Rush"
              />
              <Stat
                value={Object.values(progress.drills).filter((d) => d.best > 0).length}
                label="Drills completed"
              />
              <Stat value={reviewDue} label="Puzzles due" />
              <Stat value={openingStats.due} label="Opening moves due" />
              <Stat value={openingStats.learned} label="Opening moves learned" />
              <Stat
                value={`${Object.keys(progress.guessGames).length}/${CLASSIC_GAMES.length}`}
                label="Classic games played"
              />
            </div>
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              <Link to="/puzzles/review">Due puzzles</Link> ·{' '}
              <Link to="/puzzles/rush">Puzzle Rush</Link> · <Link to="/drills">Drills</Link> ·{' '}
              <Link to="/openings">Openings</Link> · <Link to="/classics">Classic games</Link>
            </p>
          </Card>

          <ThinkingSkillsCard />

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Strengths and weaknesses</h2>
            {themeReport.length === 0 ? (
              <p className="small muted">
                Solve at least {THEME_REPORT_MIN_ATTEMPTS} puzzles of a theme (in any mode) and it
                will be ranked here, with a link to practise it.
              </p>
            ) : (
              <div className="themes-report" data-testid="themes-report">
                <div>
                  <h3 className="themes-report__heading">Work on these</h3>
                  {weakest.length === 0 ? (
                    <p className="small muted">
                      No theme is below your overall accuracy
                      {baseline !== null ? ` (${baseline}%)` : ''}.
                    </p>
                  ) : null}
                  <ul className="themes-report__list" role="list" data-testid="themes-weak">
                    {weakest.map((row) => (
                      <li key={row.tag}>
                        <Link to={`/puzzles/themes?theme=${encodeURIComponent(row.tag)}`}>
                          {themeName(row.tag)}
                        </Link>
                        <span className="themes-report__bar" aria-hidden="true">
                          <span style={{ width: `${row.accuracy}%` }} />
                        </span>
                        <span className="num small">
                          {row.accuracy}% <span className="faint">({row.attempts})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="themes-report__heading">Going well</h3>
                  {strongest.length === 0 ? (
                    <p className="small muted">Nothing at or above your overall accuracy yet.</p>
                  ) : null}
                  <ul className="themes-report__list" role="list" data-testid="themes-strong">
                    {strongest.map((row) => (
                      <li key={row.tag}>
                        <Link to={`/puzzles/themes?theme=${encodeURIComponent(row.tag)}`}>
                          {themeName(row.tag)}
                        </Link>
                        <span
                          className="themes-report__bar themes-report__bar--good"
                          aria-hidden="true"
                        >
                          <span style={{ width: `${row.accuracy}%` }} />
                        </span>
                        <span className="num small">
                          {row.accuracy}% <span className="faint">({row.attempts})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>

          <ArcadeCard />
        </div>
      </div>
    </div>
  );
}

/** What the puzzle rating roughly corresponds to on the big sites and over the board. */
function RatingScalesCard({ rating, rd }: { rating: number; rd: number }) {
  const estimates = approximateGameRatings(rating);
  const rows = [
    { site: 'Lichess (blitz / rapid)', range: estimates.lichess },
    { site: 'chess.com (rapid)', range: estimates.chesscom },
    { site: 'FIDE (standard)', range: estimates.fide },
  ];
  return (
    <Card>
      <h2 style={{ fontSize: '1.15rem' }}>What the rating means</h2>
      <p className="small muted">
        A puzzle rating measures tactics and the speed of seeing them, not whole games, and every
        site uses its own scale. As a rough guide, a puzzle rating of {formatRating(rating)}
        {isProvisional({ rd }) ? ' (still provisional)' : ''} corresponds to about:
      </p>
      <table className="history" data-testid="rating-scales">
        <tbody>
          {rows.map((row) => (
            <tr key={row.site}>
              <td>{row.site}</td>
              <td className="num">
                {row.range
                  ? formatRange(row.range, siteConfig.locale)
                  : `below ${formatCount(1000, siteConfig.locale)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small faint" style={{ margin: '8px 0 0' }}>
        Treat these as ±150 at best. The mapping follows the published comparisons between Lichess
        puzzle and game ratings, Lichess and chess.com, and online and FIDE ratings for club
        players.
      </p>
    </Card>
  );
}
