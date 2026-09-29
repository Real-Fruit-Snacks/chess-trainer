import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { InstallButton } from '@/app/InstallPrompt';
import { useInstall } from '@/app/pwa';
import { BOARD_PALETTES } from '@/components/board/boardThemes';
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
import { lessons } from '@/features/learn/lessons';
import { ENGINE_LEVELS } from '@/engine/levels';
import { themeName } from '@/features/puzzles/themes';
import { formatDate, formatDuration } from '@/lib/dates';
import { formatRating, PROVISIONAL_GAMES, ratingBand, STARTING_RATINGS } from '@/lib/rating';
import { siteConfig } from '@/site.config';
import { summarizeProgress, useProgress } from '@/store/progress';
import { type BoardTheme, type ColorScheme, useSettings } from '@/store/settings';
import { RatingChart } from './RatingChart';
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
                label={`Puzzle rating · ${ratingBand(progress.puzzleRating)}`}
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
                value={`${progress.streak.current}`}
                label={`Day streak · best ${progress.streak.best}`}
              />
              <Stat
                value={`${stats.lessonsCompleted}/${lessons.length}`}
                label="Lessons completed"
              />
              <Stat value={`${stats.wins}–${stats.losses}–${stats.draws}`} label="Games W–L–D" />
            </div>
            {progress.ratedAttempts < PROVISIONAL_GAMES && progress.onboarded ? (
              <p className="small muted" style={{ margin: '12px 0 0' }}>
                Your rating is provisional until you have solved {PROVISIONAL_GAMES} rated puzzles (
                {progress.ratedAttempts} so far), so it moves quickly.
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Puzzle rating</h2>
            <RatingChart points={progress.ratingHistory} locale={siteConfig.locale} />
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
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Puzzle rating</h2>
            <p className="small muted">
              Reset your rating to a level that matches you better. Your history is kept.
            </p>
            <Field label="Start again from">
              {(id) => (
                <Select
                  id={id}
                  defaultValue=""
                  onChange={(e) => {
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
