import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { InstallButton } from '@/app/InstallPrompt';
import { useInstall } from '@/app/pwa';
import { BOARD_PALETTES } from '@/components/board/boardThemes';
import { PIECE_SETS } from '@/components/board/pieceSets';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Segmented,
  Select,
  Stat,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { GameTree } from '@/chess/tree';
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
import { isProvisional, PROVISIONAL_RD } from '@/lib/glicko';
import { CALIBRATION_PUZZLES, formatRating, ratingBand, STARTING_RATINGS } from '@/lib/rating';
import { approximateGameRatings, formatRange } from '@/lib/ratingScales';
import { playSound } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { summarizeProgress, useProgress } from '@/store/progress';
import {
  type BoardTheme,
  type ColorScheme,
  type PieceSet,
  type ReviewDepth,
  useSettings,
} from '@/store/settings';
import { EngineDiagnostics } from './EngineDiagnostics';
import { EngineThreadsSetting } from './EngineThreadsSetting';
import { RatingChart } from './RatingChart';
import { WeeklyCard } from './WeeklyCard';
import { buildThemeReport, THEME_REPORT_MIN_ATTEMPTS } from './themeReport';
import './progress.css';

export default function ProgressPage() {
  const progress = useProgress();
  const settings = useSettings();
  const location = useLocation();
  const stats = summarizeProgress(progress);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const install = useInstall();

  useEffect(() => {
    document.title = `Progress & settings · ${siteConfig.name}`;
  }, []);

  useEffect(() => {
    if (location.hash === '#settings') {
      document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  const exportData = () => {
    const blob = new Blob([progress.exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-trainer-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (progress.importState(parsed)) toast('Progress imported.', { tone: 'success' });
      else toast('That file does not look like a Chess Trainer export.', { tone: 'warning' });
    } catch {
      toast('Could not read that file.', { tone: 'danger' });
    }
  };

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
            GameTree.fromPgn(rep.pgn),
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
  const weakest = themeReport.slice(0, 5);
  const strongest = [...themeReport].reverse().slice(0, 5);

  return (
    <div>
      <div className="page-header">
        <h1>Progress</h1>
        <p>Everything is stored on this device only. Export a backup before switching browsers.</p>
      </div>

      <div className="progress__grid">
        <div className="stack">
          <Card>
            <div className="progress__stats">
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
                    : '–'
                }
                label="Accuracy"
              />
              <Stat
                value={stats.avgSolveMs ? formatDuration(stats.avgSolveMs) : '–'}
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

          <RatingScalesCard rating={progress.puzzleRating} rd={progress.puzzleRd} />

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Training</h2>
            <div className="progress__stats">
              <Stat
                value={Math.max(0, ...progress.rushRuns.map((r) => r.score)) || '–'}
                label="Best Puzzle Rush"
              />
              <Stat
                value={Object.values(progress.drills).filter((d) => d.best > 0).length}
                label="Drills completed"
              />
              <Stat value={reviewDue} label="Puzzles to review" />
              <Stat value={openingStats.due} label="Opening moves due" />
              <Stat value={openingStats.learned} label="Opening moves learned" />
              <Stat
                value={`${Object.keys(progress.guessGames).length}/${CLASSIC_GAMES.length}`}
                label="Classic games played"
              />
            </div>
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              <Link to="/puzzles/review">Review queue</Link> ·{' '}
              <Link to="/puzzles/rush">Puzzle Rush</Link> · <Link to="/drills">Drills</Link> ·{' '}
              <Link to="/openings">Openings</Link> · <Link to="/classics">Classic games</Link>
            </p>
          </Card>

          <WeeklyCard />

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Strengths and weaknesses</h2>
            {themeReport.length === 0 ? (
              <p className="small muted">
                Solve at least {THEME_REPORT_MIN_ATTEMPTS} puzzles of a theme (in any mode) and it
                will be ranked here, with a link to practise it.
              </p>
            ) : (
              <div className="themes-report">
                <div>
                  <h3 className="themes-report__heading">Work on these</h3>
                  <ul className="themes-report__list">
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
                  <ul className="themes-report__list">
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

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Recent puzzles</h2>
            {recent.length === 0 ? (
              <p className="small muted">
                No puzzles yet. <Link to="/puzzles">Start solving</Link>.
              </p>
            ) : (
              <div className="history__scroll">
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
                          <Link to={`/puzzles?id=${a.id}`}>{a.id}</Link>{' '}
                          <span className="faint">({a.puzzleRating})</span>
                        </td>
                        <td>
                          <Badge tone={a.outcome === 'solved' ? 'success' : 'danger'}>
                            {a.outcome === 'solved'
                              ? a.hintUsed
                                ? 'solved (hint)'
                                : 'solved'
                              : 'failed'}
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
                            .filter(
                              (t) =>
                                ![
                                  'short',
                                  'long',
                                  'veryLong',
                                  'oneMove',
                                  'master',
                                  'masterVsMaster',
                                  'superGM',
                                ].includes(t),
                            )
                            .slice(0, 3)
                            .map(themeName)
                            .join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {progress.games.length > 0 ? (
            <Card>
              <h2 style={{ fontSize: '1.15rem' }}>Recent games</h2>
              <div className="history__scroll">
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
                    {progress.games.slice(0, 10).map((g) => {
                      const level = ENGINE_LEVELS.find((l) => l.id === g.level);
                      const won = g.color === 'white' ? g.result === '1-0' : g.result === '0-1';
                      const tone = g.result === '1/2-1/2' ? 'neutral' : won ? 'success' : 'danger';
                      return (
                        <tr key={g.at}>
                          <td>{formatDate(g.at, siteConfig.locale)}</td>
                          <td>
                            Level {g.level} · {level?.name}
                          </td>
                          <td>{g.color}</td>
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
              </div>
            </Card>
          ) : null}
        </div>

        <div className="stack" id="settings">
          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Appearance</h2>
            <div className="settings__group">
              <div className="settings__row">
                <span>Colour scheme</span>
                <Segmented<ColorScheme>
                  ariaLabel="Colour scheme"
                  value={settings.colorScheme}
                  onChange={(v) => settings.update({ colorScheme: v })}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </div>
              <div className="settings__row">
                <span>Board colours</span>
                <div className="swatches" role="group" aria-label="Board colours">
                  {(Object.keys(BOARD_PALETTES) as BoardTheme[]).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      className="swatch"
                      aria-label={BOARD_PALETTES[theme].label}
                      aria-pressed={settings.boardTheme === theme}
                      title={BOARD_PALETTES[theme].hint ?? BOARD_PALETTES[theme].label}
                      style={
                        {
                          '--sw-light': BOARD_PALETTES[theme].light,
                          '--sw-dark': BOARD_PALETTES[theme].dark,
                        } as CSSProperties
                      }
                      onClick={() => settings.update({ boardTheme: theme })}
                    />
                  ))}
                </div>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {BOARD_PALETTES[settings.boardTheme].label}
                {BOARD_PALETTES[settings.boardTheme].hint
                  ? ` — ${BOARD_PALETTES[settings.boardTheme].hint}`
                  : ''}
              </p>
              <div className="settings__row">
                <span>Pieces</span>
                <Segmented
                  ariaLabel="Piece set"
                  value={settings.pieceSet}
                  onChange={(v) => settings.update({ pieceSet: v })}
                  options={(Object.keys(PIECE_SETS) as PieceSet[]).map((set) => ({
                    value: set,
                    label: PIECE_SETS[set].label,
                  }))}
                />
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {PIECE_SETS[settings.pieceSet].hint}
              </p>
              <Switch
                checked={settings.showCoordinates}
                onChange={(v) => settings.update({ showCoordinates: v })}
                label="Show coordinates"
              />
              <Switch
                checked={settings.showLegalMoves}
                onChange={(v) => settings.update({ showLegalMoves: v })}
                label="Show legal move dots"
              />
              <Switch
                checked={settings.animations}
                onChange={(v) => settings.update({ animations: v })}
                label="Animate pieces"
              />
              <Switch
                checked={settings.sounds}
                onChange={(v) => settings.update({ sounds: v })}
                label="Sound effects"
                description="Short synthesized sounds for moves, captures, checks and results."
              />
              {settings.sounds ? (
                <div className="settings__row">
                  <span>Sound theme</span>
                  <Segmented
                    ariaLabel="Sound theme"
                    value={settings.soundTheme}
                    onChange={(v) => {
                      settings.update({ soundTheme: v });
                      playSound('move');
                    }}
                    options={[
                      { value: 'standard', label: 'Standard' },
                      { value: 'soft', label: 'Soft' },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Play & analysis</h2>
            <div className="settings__group">
              <Switch
                checked={settings.autoQueen}
                onChange={(v) => settings.update({ autoQueen: v })}
                label="Always promote to a queen"
                description="Skips the promotion menu."
              />
              <Switch
                checked={settings.puzzleAutoNext}
                onChange={(v) => settings.update({ puzzleAutoNext: v })}
                label="Auto-advance puzzles"
                description="Load the next puzzle automatically after a solve."
              />
              <Switch
                checked={settings.moveInput}
                onChange={(v) => settings.update({ moveInput: v })}
                label="Keyboard move entry"
                description="Show a box under the board to type moves such as Nf3 or e2e4."
              />
              <Switch
                checked={settings.tablebase}
                onChange={(v) => settings.update({ tablebase: v })}
                label="Endgame tablebase lookups"
                description="In analysis, ask the Lichess tablebase for exact results in positions with 7 pieces or fewer. Uses the network; off by default."
              />
              <Field label="Default engine strength">
                {(id) => (
                  <Select
                    id={id}
                    value={settings.playLevel}
                    onChange={(e) => settings.update({ playLevel: Number(e.target.value) })}
                  >
                    {ENGINE_LEVELS.map((l) => (
                      <option key={l.id} value={l.id}>
                        Level {l.id} · {l.name} (~{l.approxElo})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Game review depth" hint="Thorough is about twice as slow as fast.">
                {(id) => (
                  <Select
                    id={id}
                    value={settings.reviewDepth}
                    onChange={(e) =>
                      settings.update({ reviewDepth: e.target.value as ReviewDepth })
                    }
                  >
                    <option value="fast">Fast (depth 10)</option>
                    <option value="balanced">Balanced (depth 13)</option>
                    <option value="thorough">Thorough (depth 16)</option>
                  </Select>
                )}
              </Field>
              <Field label="Analysis depth" hint="Higher is stronger but slower on phones.">
                {(id) => (
                  <Select
                    id={id}
                    value={settings.analysisDepth}
                    onChange={(e) => settings.update({ analysisDepth: Number(e.target.value) })}
                  >
                    {[12, 15, 18, 20, 22, 24].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <EngineThreadsSetting />
              <EngineDiagnostics />
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Puzzle rating</h2>
            <p className="small muted">
              Reset your puzzle rating to a level that matches you better, or let a short run of
              puzzles find it. Your history is kept.
            </p>
            <Field label="Start again from">
              {(id) => (
                <Select
                  id={id}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value === 'calibrate') {
                      progress.completeOnboarding(0, 'calibrate');
                      toast(
                        `Calibration started — the next ${CALIBRATION_PUZZLES} rated puzzles find your level.`,
                      );
                      e.target.value = '';
                      return;
                    }
                    const option = STARTING_RATINGS.find((o) => o.id === e.target.value);
                    if (option) {
                      progress.completeOnboarding(option.rating);
                      toast(`Puzzle rating set to ${option.rating}.`);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="" disabled>
                    Choose a level…
                  </option>
                  <option value="calibrate">
                    Find my level with {CALIBRATION_PUZZLES} puzzles
                  </option>
                  {STARTING_RATINGS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} (~{o.rating})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>App</h2>
            <div className="settings__group">
              {install.isStandalone ? (
                <p className="small muted" style={{ margin: 0 }}>
                  Installed as an app ✓ — works offline.
                </p>
              ) : (
                <div className="settings__row">
                  <span className="small">Install for offline use and a home-screen icon.</span>
                  <InstallButton size="sm" />
                </div>
              )}
              <div className="settings__row">
                <span className="small">Backup or move your progress.</span>
                <div className="row">
                  <Button size="sm" onClick={exportData}>
                    Export
                  </Button>
                  <Button size="sm" onClick={() => fileInput.current?.click()}>
                    Import
                  </Button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importData(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              <div className="settings__row">
                <span className="small">Delete all progress and settings on this device.</span>
                <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
                  Reset everything
                </Button>
              </div>
              <p className="small faint" style={{ margin: 0 }}>
                {siteConfig.name} v{__APP_VERSION__} · built{' '}
                {formatDate(__BUILD_DATE__, siteConfig.locale)} ·{' '}
                <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer">
                  Source code
                </a>
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset everything?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                progress.resetAll();
                settings.reset();
                setConfirmReset(false);
                toast('All local data was cleared.');
              }}
            >
              Yes, reset
            </Button>
          </>
        }
      >
        <p className="muted">
          This deletes your puzzle rating, lesson progress, game history and settings from this
          device. Export a backup first if you want to keep them.
        </p>
      </Dialog>
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
              <td className="mono">
                {row.range ? formatRange(row.range, siteConfig.locale) : 'below 1000'}
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
