import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { InstallButton } from '@/app/InstallPrompt';
import { useInstall } from '@/app/pwa';
import { BOARD_PALETTES } from '@/components/board/boardThemes';
import { PIECE_SETS } from '@/components/board/pieceSets';
import { PieceSetPicker } from '@/components/board/PieceSetPicker';
import { San } from '@/chess/San';
import {
  Button,
  Card,
  Dialog,
  Field,
  LinkButton,
  Segmented,
  Select,
  Switch,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { ENGINE_LEVELS } from '@/engine/levels';
import { formatDate } from '@/lib/dates';
import { CALIBRATION_PUZZLES, STARTING_RATINGS } from '@/lib/rating';
import { hapticsSupported } from '@/lib/haptics';
import { badgingSupported } from '@/app/useAppBadge';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import {
  type BoardTheme,
  type ColorScheme,
  type DragTarget,
  type MaterialDisplay,
  type MoveMethod,
  type Notation,
  type ReviewDepth,
  useSettings,
} from '@/store/settings';
import { ProfilesCard } from './ProfilesCard';
import { useBackupActions } from './useBackupActions';
import { EngineDiagnostics } from './EngineDiagnostics';
import { OfflinePuzzles } from './OfflinePuzzles';
import { EngineThreadsSetting } from './EngineThreadsSetting';
import { SoundThemePicker, VolumeSlider } from './SoundControls';
import { StorageUsage } from './StorageUsage';
import './settings.css';

export default function SettingsPage() {
  const progress = useProgress();
  const settings = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const install = useInstall();
  const backup = useBackupActions();
  const { hash } = useLocation();

  useEffect(() => {
    document.title = `Settings · ${siteConfig.name}`;
  }, []);

  // Links such as the profile badge point at a card on this page (/settings#profiles).
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const importData = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (progress.importState(parsed)) toast('Progress imported.', { tone: 'success' });
      else toast('That file does not look like a Chess Trainer export.', { tone: 'warning' });
    } catch {
      toast('Could not read that file.', { tone: 'danger' });
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>
          Appearance, play, engine and analysis, your puzzle rating, profiles, backups and the app
          itself. Everything is stored on this device only.
        </p>
      </div>

      <div className="settings__grid" data-testid="settings">
        <div className="stack">
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
                    { value: 'black', label: 'Black' },
                  ]}
                />
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {settings.colorScheme === 'black'
                  ? 'The dark scheme on a pure black background, for OLED screens.'
                  : settings.colorScheme === 'system'
                    ? 'Follows the device setting.'
                    : ' '}
              </p>
              <div className="settings__row">
                <span>Move notation</span>
                <Segmented<Notation>
                  ariaLabel="Move notation"
                  value={settings.notation}
                  onChange={(v) => settings.update({ notation: v })}
                  options={[
                    { value: 'figurine', label: 'Figurines' },
                    { value: 'letters', label: 'Letters' },
                  ]}
                />
              </div>
              <p className="small muted" style={{ margin: 0 }} data-testid="notation-sample">
                1. e4 e5 2. <San san="Nf3" /> <San san="Nc6" /> 3. <San san="Bb5" /> a6 4.{' '}
                <San san="Bxc6" /> — moves everywhere are written this way; files, PGN and links
                always use letters.
              </p>
              <Switch
                checked={settings.sounds}
                onChange={(v) => settings.update({ sounds: v })}
                label="Sound effects"
                description="Short synthesized sounds for moves, captures, checks and results."
              />
              {settings.sounds ? (
                <>
                  <div className="settings__row">
                    <span>Sound theme</span>
                    <SoundThemePicker />
                  </div>
                  <div className="settings__row">
                    <VolumeSlider className="settings__slider" />
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          <Card id="board" data-testid="board-settings">
            <h2 style={{ fontSize: '1.15rem' }}>Board</h2>
            <div className="settings__group">
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
              <div className="settings__row settings__row--stack">
                <span>Pieces</span>
                <PieceSetPicker
                  value={settings.pieceSet}
                  onChange={(set) => settings.update({ pieceSet: set })}
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
                checked={settings.boardHighlights}
                onChange={(v) => settings.update({ boardHighlights: v })}
                label="Highlight the last move and check"
              />
              <Switch
                checked={settings.animations}
                onChange={(v) => settings.update({ animations: v })}
                label="Animate pieces"
              />
              <Switch
                checked={settings.magnifyDrag}
                onChange={(v) => settings.update({ magnifyDrag: v })}
                label="Magnify the dragged piece"
                description="The piece grows under your finger so you can see it while dragging."
              />
              <div className="settings__row">
                <span>Drag target</span>
                <Segmented<DragTarget>
                  ariaLabel="Drag target"
                  value={settings.dragTarget}
                  onChange={(v) => settings.update({ dragTarget: v })}
                  options={[
                    { value: 'circle', label: 'Circle' },
                    { value: 'square', label: 'Square' },
                    { value: 'none', label: 'None' },
                  ]}
                />
              </div>
              <div className="settings__row">
                <span>Move pieces by</span>
                <Segmented<MoveMethod>
                  ariaLabel="Move pieces by"
                  value={settings.moveMethod}
                  onChange={(v) => settings.update({ moveMethod: v })}
                  options={[
                    { value: 'either', label: 'Tap or drag' },
                    { value: 'tap', label: 'Tap' },
                    { value: 'drag', label: 'Drag' },
                  ]}
                />
              </div>
              <div className="settings__row">
                <span>Captured material</span>
                <Segmented<MaterialDisplay>
                  ariaLabel="Captured material"
                  value={settings.materialDisplay}
                  onChange={(v) => settings.update({ materialDisplay: v })}
                  options={[
                    { value: 'difference', label: 'Difference' },
                    { value: 'count', label: 'Every capture' },
                    { value: 'off', label: 'Off' },
                  ]}
                />
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {settings.materialDisplay === 'difference'
                  ? 'Beside the player bars: only the pieces one side is up, with the balance in pawns.'
                  : settings.materialDisplay === 'count'
                    ? 'Beside the player bars: every piece each side has captured.'
                    : 'Nothing beside the player bars.'}
              </p>
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Play</h2>
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
                checked={settings.playFocus}
                onChange={(v) => settings.update({ playFocus: v })}
                label="Focus mode"
                description="Hide the header and navigation while a game against the engine is on."
              />
              <Switch
                checked={settings.haptics}
                onChange={(v) => settings.update({ haptics: v })}
                label="Vibration"
                description={
                  hapticsSupported()
                    ? 'A short buzz on moves, solves and mistakes.'
                    : 'A short buzz on moves, solves and mistakes — this device does not support it.'
                }
              />
              <Switch
                checked={settings.playCoach}
                onChange={(v) => settings.update({ playCoach: v })}
                label="Coach mode by default"
                description="New untimed games against the engine start with the coach on: mistakes pause the game with an explanation and a take-back."
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
        </div>
        <div className="stack">
          <ProfilesCard />
          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>Engine & analysis</h2>
            <div className="settings__group">
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
              <Switch
                checked={settings.tablebase}
                onChange={(v) => settings.update({ tablebase: v })}
                label="Endgame tablebase lookups"
                description="In analysis, ask the Lichess tablebase for exact results in positions with 7 pieces or fewer. Uses the network; off by default."
              />
              <Switch
                checked={settings.explorer}
                onChange={(v) => settings.update({ explorer: v })}
                label="Opening explorer lookups"
                description="In Analyze and Openings, show what masters and Lichess players play in the position and how it goes. Uses the network; off by default."
              />
              <EngineThreadsSetting />
              <EngineDiagnostics />
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>App</h2>
            <div className="settings__group">
              {install.isStandalone ? (
                <p className="small muted" style={{ margin: 0 }}>
                  Installed as an app — works offline.
                </p>
              ) : (
                <div className="settings__row">
                  <span className="small">Install for offline use and a home-screen icon.</span>
                  <InstallButton size="sm" />
                </div>
              )}
              <Switch
                checked={settings.appBadge}
                onChange={(v) => settings.update({ appBadge: v })}
                label="Badge on the app icon"
                description={
                  badgingSupported()
                    ? 'Show how many reviews are due on the installed app’s icon.'
                    : 'Show how many reviews are due on the installed app’s icon (needs the installed app).'
                }
              />
              <OfflinePuzzles />
              <div className="settings__row">
                <span className="small">
                  Backup or move your progress
                  {backup.canShare ? ' — share it straight to another device' : ''}.
                  {settings.lastBackupAt
                    ? ` Last backup ${formatDate(settings.lastBackupAt, siteConfig.locale)}.`
                    : ''}
                </span>
                <div className="row">
                  {backup.canShare ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void backup.share()}
                      disabled={backup.busy}
                    >
                      Share
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={backup.download}>
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
              <p className="small muted" style={{ margin: 0 }}>
                No account, no server, no tracking: everything stays in this browser. The{' '}
                <Link to="/reference#faq">FAQ</Link> explains what leaves your device and when.
              </p>
              <StorageUsage />
              <div className="settings__row">
                <span className="small">
                  Try every sound, icon, control and platform check on one page — for checking a
                  device by hand.
                </span>
                <LinkButton size="sm" to="/settings/lab" data-testid="open-lab">
                  Open the test lab
                </LinkButton>
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
