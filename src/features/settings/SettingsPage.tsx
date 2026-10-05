import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { InstallButton } from '@/app/InstallPrompt';
import {
  describeInstallUnavailable,
  installUnavailableReason,
  type OfferState,
  useInstall,
} from '@/app/pwa';
import { BOARD_PALETTES } from '@/components/board/boardThemes';
import { PIECE_SETS } from '@/components/board/pieceSets';
import { PieceSetPicker } from '@/components/board/PieceSetPicker';
import { San } from '@/chess/San';
import {
  Button,
  Card,
  ConfirmDialog,
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
import { useReducedMotion } from '@/lib/useReducedMotion';
import { badgingSupported } from '@/app/useAppBadge';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useProfiles } from '@/store/profiles';
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
import { useImportBackup } from './useImportBackup';
import { EngineDiagnostics } from './EngineDiagnostics';
import { OfflinePuzzles } from './OfflinePuzzles';
import { HumanOpponentDownload } from '@/features/play/HumanOpponentDownload';
import { EngineFullSetting } from './EngineFullSetting';
import { EngineThreadsSetting } from './EngineThreadsSetting';
import { SoundThemePicker, VolumeSlider } from './SoundControls';
import { StorageUsage } from './StorageUsage';
import './settings.css';

type RatingChoice = 'calibrate' | (typeof STARTING_RATINGS)[number]['id'];

/** What the installed-app row says; the browser menu route when there is no install prompt. */
function describeInstall(state: OfferState): string {
  const reason = installUnavailableReason(state);
  if (reason === null) return 'Install for offline use and a home-screen icon.';
  const base = describeInstallUnavailable(reason);
  return reason === 'no-prompt'
    ? `${base} Some browsers can still add it from their own menu (“Install app” or “Add to Home Screen”).`
    : base;
}

export default function SettingsPage() {
  const progress = useProgress();
  const settings = useSettings();
  const profiles = useProfiles((s) => s.profiles);
  const reducedMotion = useReducedMotion();
  const [confirmReset, setConfirmReset] = useState(false);
  const [ratingChoice, setRatingChoice] = useState<RatingChoice>('calibrate');
  const [confirmRating, setConfirmRating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const install = useInstall();
  const backup = useBackupActions();
  const importer = useImportBackup();
  const { hash } = useLocation();

  useEffect(() => {
    document.title = `Settings · ${siteConfig.name}`;
  }, []);

  // Links such as the profile badge point at a card on this page (/settings#profiles).
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const ratingOption = STARTING_RATINGS.find((o) => o.id === ratingChoice);
  const applyRatingReset = () => {
    if (ratingChoice === 'calibrate') {
      progress.completeOnboarding(0, 'calibrate');
      toast(`Calibration started — the next ${CALIBRATION_PUZZLES} rated puzzles find your level.`);
      return;
    }
    if (ratingOption) {
      progress.completeOnboarding(ratingOption.rating);
      toast(`Puzzle rating set to ${ratingOption.rating}.`);
    }
  };

  const tapOnly = settings.moveMethod === 'tap';
  const otherProfiles = profiles.length - 1;
  const installText = describeInstall(install);

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
              {settings.sounds || (settings.haptics && hapticsSupported()) ? (
                <div className="settings__row">
                  <span>
                    Sound theme
                    {!settings.sounds ? (
                      <>
                        <br />
                        <span className="small muted">
                          Also picks the vibration patterns while sounds are off.
                        </span>
                      </>
                    ) : null}
                  </span>
                  <SoundThemePicker />
                </div>
              ) : null}
              {settings.sounds ? (
                <div className="settings__row">
                  <VolumeSlider className="settings__slider" />
                </div>
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
                description={
                  reducedMotion
                    ? 'Your device asks for less motion, so pieces move without animation whatever this says.'
                    : undefined
                }
              />
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
              <fieldset
                className="settings__fieldset"
                disabled={tapOnly}
                aria-describedby={tapOnly ? 'drag-settings-hint' : undefined}
                data-testid="drag-settings"
              >
                <legend className="sr-only">Dragging</legend>
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
              </fieldset>
              {tapOnly ? (
                <p className="small muted" id="drag-settings-hint" style={{ margin: 0 }}>
                  These two apply to dragging only; choose “Tap or drag” or “Drag” above to use
                  them.
                </p>
              ) : null}
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
                checked={settings.keyboardShortcuts}
                onChange={(v) => settings.update({ keyboardShortcuts: v })}
                label="Single-key shortcuts"
                description="Letters such as H for a hint, N for the next puzzle and ? for the list of keys. Turn them off if you use speech input or a switch device; Enter, Space and the arrow keys keep working."
              />
              <Switch
                checked={settings.playFocus}
                onChange={(v) => settings.update({ playFocus: v })}
                label="Focus mode"
                description="Hide the header and navigation while you play the engine: in Play, the simul and the arcade games."
              />
              <Switch
                checked={settings.haptics}
                onChange={(v) => settings.update({ haptics: v })}
                label="Vibration"
                description={
                  hapticsSupported()
                    ? 'A short buzz on moves, solves and mistakes, on devices with a vibration motor. Available in this browser.'
                    : 'A short buzz on moves, solves and mistakes — not available in this browser.'
                }
              />
              <Switch
                checked={settings.playCoach}
                onChange={(v) => settings.update({ playCoach: v })}
                label="Coach mode by default"
                description="New untimed games against the engine or the human-like opponent start with the coach on: mistakes pause the game with an explanation and a take-back."
              />
              <Switch
                checked={settings.playBlunderCheck}
                onChange={(v) => settings.update({ playBlunderCheck: v })}
                label="Blunder check by default"
                description="New games against the engine or the human-like opponent hold back a move that hangs material or allows mate and ask: checks, captures, threats? You can still play it."
              />
              <Field
                label="Engine level for the next game"
                hint="Every game you start updates this to the level you chose. The rating in brackets is a rough guide, not a measured strength."
              >
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
              <div data-testid="human-opponent-setting">
                <strong className="small">Human-like opponent</strong>
                <p className="small muted" style={{ margin: '2px 0 6px' }}>
                  Maia-3, a model trained on real games, plays like a person of the rating you
                  choose in Play. It runs on this device.
                </p>
                <HumanOpponentDownload removable />
              </div>
            </div>
          </Card>
          <Card data-testid="rating-settings">
            <h2 style={{ fontSize: '1.15rem' }}>Puzzle rating</h2>
            <p className="small muted">
              Reset your puzzle rating to a level that matches you better, or let a short run of
              puzzles find it. Your rating history is kept: the chart shows the change.
            </p>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Start again from">
                {(id) => (
                  <Select
                    id={id}
                    value={ratingChoice}
                    onChange={(e) => setRatingChoice(e.target.value as RatingChoice)}
                  >
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
              <Button onClick={() => setConfirmRating(true)} data-testid="rating-reset">
                Reset rating…
              </Button>
            </div>
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
              <EngineFullSetting />
              <EngineDiagnostics />
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem' }}>App</h2>
            <div className="settings__group">
              {install.isStandalone ? (
                <p className="small muted" style={{ margin: 0 }}>
                  {installText}
                </p>
              ) : (
                <div className="settings__row" data-testid="install-row">
                  <span className="small">{installText}</span>
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
                  Backup or move your progress — puzzles, lessons, repertoires, library and imported
                  games
                  {backup.canShare ? ', shared straight to another device' : ''}.
                  {progress.lastBackupAt
                    ? ` Last backup ${formatDate(progress.lastBackupAt, siteConfig.locale)}.`
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
                    accept=".json,application/json"
                    hidden
                    data-testid="import-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importer.offerFile(file);
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
                <span className="small">
                  Delete this profile’s progress and imported games, and the device settings.
                </span>
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

      {importer.dialog}

      <ConfirmDialog
        open={confirmRating}
        onClose={() => setConfirmRating(false)}
        onConfirm={applyRatingReset}
        title="Reset your puzzle rating?"
        confirmLabel={ratingChoice === 'calibrate' ? 'Start calibration' : 'Reset rating'}
      >
        <p className="muted">
          {ratingChoice === 'calibrate'
            ? `Your rating starts uncertain again and the next ${CALIBRATION_PUZZLES} rated puzzles find your level.`
            : `Your puzzle rating is set to about ${ratingOption?.rating ?? ''} (“${ratingOption?.label ?? ''}”) and adjusts from there.`}{' '}
          Your attempts, statistics and rating history are kept: the chart shows the change.
        </p>
      </ConfirmDialog>

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
              data-testid="reset-confirm"
              onClick={() => {
                progress.resetAll();
                settings.reset();
                setConfirmReset(false);
                toast('This profile’s data and the device settings were cleared.');
              }}
            >
              Yes, reset
            </Button>
          </>
        }
      >
        <p className="muted">
          This deletes the puzzle rating, lesson progress, repertoires, analysis library, game
          history and imported games of this profile, and every device setting: the engine goes back
          to its defaults, and a downloaded full engine is deleted. Export a backup first if you
          want to keep them.
        </p>
        <p className="muted">
          Kept:{' '}
          {otherProfiles > 0
            ? `the profile list and the ${otherProfiles === 1 ? 'other profile' : `${otherProfiles} other profiles`} with their data`
            : 'the profile list'}
          , and any puzzles downloaded for offline use.
        </p>
      </Dialog>
    </div>
  );
}
