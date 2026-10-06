import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Board } from '@/components/board/Board';
import { BOARD_PALETTES, boardBackground } from '@/components/board/boardThemes';
import { PIECE_SETS, type PieceSet } from '@/components/board/pieceSets';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Icon,
  ICON_NAMES,
  Input,
  Kbd,
  LinkButton,
  ProgressBar,
  Segmented,
  Select,
  Spinner,
  Stars,
  Stat,
  Switch,
  type Tone,
} from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { EngineDiagnostics } from '@/features/settings/EngineDiagnostics';
import { SoundThemePicker, VolumeSlider } from '@/features/settings/SoundControls';
import { hapticPattern, hapticsSupported, vibrate } from '@/lib/haptics';
import { formatBytes, storageUsage, useStorageHealth } from '@/lib/persistStorage';
import { playSound, SOUND_NAMES, type SoundName } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { type BoardTheme, useSettings } from '@/store/settings';
import { type PlatformCheck, platformChecks, storageEstimate } from './platform';
import { clearLabStorage, fillStorage, hasFiller, probeStorage } from './storageTest';
import './lab.css';

const SECTIONS = [
  ['platform', 'Platform'],
  ['storage', 'Storage'],
  ['sounds', 'Sounds'],
  ['haptics', 'Haptics'],
  ['icons', 'Icons'],
  ['controls', 'Controls'],
  ['feedback', 'Feedback'],
  ['board', 'Board'],
  ['typography', 'Type & colour'],
  ['engine', 'Engine'],
  ['errors', 'Errors'],
] as const;

const TONES: Tone[] = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];

const SOUND_LABEL: Record<SoundName, string> = {
  move: 'Move',
  capture: 'Capture',
  check: 'Check',
  castle: 'Castle',
  promote: 'Promote',
  solved: 'Puzzle solved',
  failed: 'Puzzle failed',
  gameEnd: 'Game over',
  gameLost: 'Game lost',
  lowTime: 'Low time',
  notify: 'Notification',
};

const COLOUR_TOKENS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--border',
  '--text',
  '--text-muted',
  '--text-faint',
  '--accent',
  '--success',
  '--warning',
  '--danger',
] as const;

/** "8ms" or "14·40·14ms": the vibration pattern as text. */
function describePattern(pattern: number | number[]): string {
  return `${Array.isArray(pattern) ? pattern.join('·') : pattern}ms`;
}

/** A tiny component that crashes on demand, to see the error page for real. */
function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error('Test lab: deliberate crash');
  return null;
}

/** A missing capability is red; a preference or circumstance that is simply off is neutral. */
function CheckBadge({ state, kind = 'capability' }: Pick<PlatformCheck, 'state' | 'kind'>) {
  const tone: Tone =
    state === 'yes' ? 'success' : state === 'no' && kind === 'capability' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{state === 'yes' ? 'Yes' : state === 'no' ? 'No' : 'Unknown'}</Badge>;
}

/**
 * The test lab: every sound, icon, control, board style and platform check on
 * one page, so a device can be tried by hand in a few minutes. Reachable from
 * Settings. The palette, piece-set, sound and vibration controls are the real
 * settings; the storage filler is removed when the page closes.
 */
export default function LabPage() {
  const settings = useSettings();
  const health = useStorageHealth();
  const [checks, setChecks] = useState<PlatformCheck[]>([]);
  const [usage, setUsage] = useState(() => storageUsage());
  const [filler, setFiller] = useState(() => hasFiller());
  const [iconSize, setIconSize] = useState<16 | 20 | 24 | 32>(24);
  const [iconsOnDark, setIconsOnDark] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [promotion, setPromotion] = useState(false);
  const [armed, setArmed] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [segment, setSegment] = useState<'one' | 'two' | 'three'>('one');

  useEffect(() => {
    document.title = `Test lab · ${siteConfig.name}`;
  }, []);

  const runChecks = () => {
    setChecks(platformChecks());
    let alive = true;
    void storageEstimate().then((check) => {
      if (alive) setChecks((current) => [...current.filter((c) => c.id !== 'quota'), check]);
    });
    return () => {
      alive = false;
    };
  };

  useEffect(runChecks, []);

  // Checks that change while the page is open (online, viewport, colour scheme) are re-run.
  useEffect(() => {
    const rerun = () => setChecks(platformChecks());
    window.addEventListener('online', rerun);
    window.addEventListener('offline', rerun);
    window.addEventListener('resize', rerun);
    const media = (
      typeof window.matchMedia === 'function'
        ? [
            window.matchMedia('(prefers-color-scheme: dark)'),
            window.matchMedia('(prefers-reduced-motion: reduce)'),
          ]
        : []
    ).filter(
      (m) =>
        typeof m.addEventListener === 'function' && typeof m.removeEventListener === 'function',
    );
    for (const m of media) m.addEventListener('change', rerun);
    return () => {
      window.removeEventListener('online', rerun);
      window.removeEventListener('offline', rerun);
      window.removeEventListener('resize', rerun);
      for (const m of media) m.removeEventListener('change', rerun);
    };
  }, []);

  const refreshUsage = () => {
    setUsage(storageUsage());
    setFiller(hasFiller());
  };

  // The usage meter follows the storage health (a failed or recovered write) live.
  useEffect(refreshUsage, [health.full, health.failedKey]);

  // The filler must not outlive the lab: a learner who filled storage and
  // navigated away would otherwise lose every change from then on.
  useEffect(() => () => void clearLabStorage(), []);

  const fill = () => {
    const result = fillStorage();
    // A growing write through the same adapter the stores use: this is the
    // code path a learner's own changes take when the disk is full.
    probeStorage();
    refreshUsage();
    toast(
      result.refused
        ? `Filled ${formatBytes(result.bytes)} before the browser refused (it allows ${formatBytes(result.limitBytes ?? 0)} in all) — the warning above is what a learner sees. Remove the filler before you leave; it is removed anyway when you do.`
        : `Wrote ${formatBytes(result.bytes)} and the browser never refused; this browser allows more than most.`,
      { tone: 'info', duration: 10000 },
    );
  };

  const unfill = () => {
    clearLabStorage();
    probeStorage();
    refreshUsage();
    toast('Filler removed; storage is back to normal.', { tone: 'success' });
  };

  const palettes = useMemo(() => Object.keys(BOARD_PALETTES) as BoardTheme[], []);

  return (
    <div className="lab">
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/settings">Settings</Link> / Test lab
        </p>
        <h1>Test lab</h1>
        <p>
          Every sound, icon, control, board style and platform check on one page, for trying a
          device by hand. The palette, piece-set, sound and vibration controls here are your real
          settings; everything else is a demonstration and touches no data.
        </p>
      </div>

      <nav className="lab__nav" aria-label="Lab sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#lab-${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="stack">
        <Card id="lab-platform" data-testid="lab-platform">
          <div className="row row--between">
            <h2>Platform</h2>
            <Button size="sm" variant="ghost" onClick={runChecks} data-testid="checks-refresh">
              Refresh
            </Button>
          </div>
          <p className="small muted">
            {siteConfig.name} v{__APP_VERSION__} · built {new Date(__BUILD_DATE__).toLocaleString()}
            . A red “No” marks a capability this browser lacks; a grey one is a preference or
            circumstance that is simply off.
          </p>
          <table className="lab__table">
            <tbody>
              {checks.map((check) => (
                <tr key={check.id} data-testid={`check-${check.id}`}>
                  <th scope="row">{check.label}</th>
                  <td>
                    <CheckBadge state={check.state} kind={check.kind} />
                  </td>
                  <td className="muted small">{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small faint lab__ua">{navigator.userAgent}</p>
        </Card>

        <Card id="lab-storage" data-testid="lab-storage">
          <h2>Storage</h2>
          <p className="small muted">
            The app keeps everything in this browser’s local storage, which most browsers cap at
            about 5 MB
            {usage.measured
              ? ` (this one allowed ${formatBytes(usage.limit)} when it was last measured here)`
              : ''}
            . Filling it shows the warning a learner would see; the filler goes with the second
            button, when you leave this page, and at every app start.
          </p>
          <ProgressBar
            value={usage.bytes}
            max={usage.limit}
            label={`Local data: ${formatBytes(usage.bytes)} of ${usage.measured ? '' : 'about '}${formatBytes(usage.limit)}`}
            valueText={`${formatBytes(usage.bytes)} of ${formatBytes(usage.limit)}`}
          />
          {health.full ? (
            <Alert tone="danger" role="status">
              Storage is full — the last write to <code>{health.failedKey}</code> was refused.
              {filler ? ' The lab’s filler is taking the room: remove it below.' : ''}
            </Alert>
          ) : (
            <p className="small muted" role="status" data-testid="storage-ok">
              Writes are succeeding.
            </p>
          )}
          <table className="lab__table">
            <tbody>
              {usage.keys.slice(0, 12).map((k) => (
                <tr key={k.key}>
                  <th scope="row">
                    <code>{k.key}</code>
                  </th>
                  <td className="num">{formatBytes(k.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <Button variant="danger" onClick={fill} disabled={filler} data-testid="storage-fill">
              Fill storage to test the warning
            </Button>
            <Button onClick={unfill} disabled={!filler} data-testid="storage-clear">
              Remove the filler
            </Button>
            <Button variant="ghost" onClick={refreshUsage}>
              Refresh
            </Button>
          </div>
        </Card>

        <Card id="lab-sounds" data-testid="lab-sounds">
          <h2>Sounds</h2>
          <div className="row row--between">
            <Switch
              checked={settings.sounds}
              onChange={(v) => settings.update({ sounds: v })}
              label="Sound effects"
            />
            <SoundThemePicker />
          </div>
          <VolumeSlider className="lab__slider" />
          <div className="row lab__buttons">
            {SOUND_NAMES.map((name) => (
              <Button key={name} onClick={() => playSound(name)} data-testid={`sound-${name}`}>
                {SOUND_LABEL[name]}
              </Button>
            ))}
          </div>
          <p className="small muted">
            Buttons respect the switch above; on phones the first sound may need a tap on the page
            before the browser allows audio.
          </p>
        </Card>

        <Card id="lab-haptics" data-testid="lab-haptics">
          <h2>Haptics</h2>
          <div className="row row--between">
            <Switch
              checked={settings.haptics}
              onChange={(v) => settings.update({ haptics: v })}
              label="Vibration"
            />
            <Badge tone={hapticsSupported() ? 'success' : 'neutral'}>
              {hapticsSupported() ? 'Supported here' : 'Not supported here'}
            </Badge>
          </div>
          <p className="small muted">
            Patterns follow the sound theme: the Retro set is shorter and buzzier.
          </p>
          <div className="row lab__buttons">
            {SOUND_NAMES.map((name) => (
              <Button key={name} onClick={() => vibrate(name)} data-testid={`haptic-${name}`}>
                {SOUND_LABEL[name]}{' '}
                <span className="small faint">
                  {describePattern(hapticPattern(name, settings.soundTheme))}
                </span>
              </Button>
            ))}
          </div>
        </Card>

        <Card id="lab-icons" data-testid="lab-icons">
          <div className="row row--between">
            <h2>Icons</h2>
            <div className="row">
              <Segmented<16 | 20 | 24 | 32>
                ariaLabel="Icon size"
                value={iconSize}
                onChange={setIconSize}
                options={[
                  { value: 16, label: '16' },
                  { value: 20, label: '20' },
                  { value: 24, label: '24' },
                  { value: 32, label: '32' },
                ]}
              />
              <Switch checked={iconsOnDark} onChange={setIconsOnDark} label="On dark" />
            </div>
          </div>
          <div className={`lab__icons${iconsOnDark ? ' lab__icons--dark' : ''}`}>
            {ICON_NAMES.map((name) => (
              <div key={name} className="lab__icon" data-testid={`icon-${name}`}>
                <Icon name={name} size={iconSize} />
                <span>{name}</span>
              </div>
            ))}
          </div>
          <p className="small muted">
            {ICON_NAMES.length} icons · <Stars count={2} label="Stars: 2 of 3" /> stars
          </p>
        </Card>

        <Card id="lab-controls" data-testid="lab-controls">
          <h2>Controls</h2>
          <h3>Buttons</h3>
          <div className="row lab__buttons">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
            <Button icon aria-label="Icon button">
              <Icon name="plus" size={18} />
            </Button>
            <Button size="sm" icon aria-label="Small icon button">
              <Icon name="close" size={16} />
            </Button>
            <LinkButton to="/settings" variant="ghost">
              Link button
            </LinkButton>
          </div>
          <h3>Inputs</h3>
          <div className="lab__grid">
            <Field label="Text input" hint="With a hint underneath.">
              {(id) => <Input id={id} placeholder="Type here" />}
            </Field>
            <Field label="Select">
              {(id) => (
                <Select id={id} defaultValue="b">
                  <option value="a">Option A</option>
                  <option value="b">Option B</option>
                </Select>
              )}
            </Field>
            <Switch
              checked={switchOn}
              onChange={setSwitchOn}
              label="Switch"
              description="With a description."
            />
            <Segmented
              ariaLabel="Segmented"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'one', label: 'One' },
                { value: 'two', label: 'Two' },
                { value: 'three', label: 'Three' },
              ]}
            />
          </div>
          <h3>Badges</h3>
          <div className="row">
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </div>
          <h3>Stats and progress</h3>
          <div className="row" style={{ gap: 'var(--space-5)' }}>
            <Stat value="1,480" label="Puzzle rating" />
            <Stat value="12" label="Day streak" />
            <Stat value="96%" label="Accuracy" />
          </div>
          <ProgressBar value={7} max={10} label="7 of 10" />
          <div className="row" style={{ gap: 'var(--space-5)', margin: 'var(--space-3) 0' }}>
            {/* Touch screens hide key hints, and with them this line. */}
            <span className="keyboard-only">
              Keyboard: <Kbd>?</Kbd> <Kbd>Esc</Kbd> <Kbd>←</Kbd> <Kbd>→</Kbd>
            </span>
            <Spinner label="Spinner" />
          </div>
          <EmptyState icon={<Icon name="puzzles" size={28} />} title="Empty state">
            Shown when a list has nothing in it yet.
          </EmptyState>
        </Card>

        <Card id="lab-feedback" data-testid="lab-feedback">
          <h2>Feedback</h2>
          <h3>Alerts</h3>
          <div className="stack">
            {TONES.filter((t) => t !== 'accent').map((tone) => (
              <Alert key={tone} tone={tone}>
                An alert with the {tone} tone.
              </Alert>
            ))}
          </div>
          <h3>Toasts</h3>
          <div className="row lab__buttons">
            {TONES.filter((t) => t !== 'accent').map((tone) => (
              <Button
                key={tone}
                onClick={() => toast(`A ${tone} toast.`, { tone })}
                data-testid={`toast-${tone}`}
              >
                {tone}
              </Button>
            ))}
            <Button
              onClick={() =>
                toast('A toast with an action.', {
                  actionLabel: 'Undo',
                  onAction: () => toast('Action taken.', { tone: 'success' }),
                })
              }
            >
              With action
            </Button>
            <Button onClick={() => toast('A toast that stays until dismissed.', { duration: 0 })}>
              Persistent
            </Button>
            <Button
              onClick={() =>
                toast('A new version is ready. It loads when you next change page.', {
                  actionLabel: 'Reload now',
                  onAction: () => toast('This is the lab: no reload.'),
                  duration: 0,
                })
              }
            >
              Update prompt
            </Button>
          </div>
          <h3>Dialog</h3>
          <Button onClick={() => setDialogOpen(true)} data-testid="open-dialog">
            Open a dialog
          </Button>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="A dialog"
            actions={
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  Confirm
                </Button>
              </>
            }
          >
            <p className="muted">Escape and the backdrop close it; focus returns to the button.</p>
          </Dialog>
        </Card>

        <Card id="lab-board" data-testid="lab-board">
          <h2>Board</h2>
          <h3>Board colours</h3>
          <div className="row">
            {palettes.map((theme) => (
              <button
                key={theme}
                type="button"
                className={`lab__palette${settings.boardTheme === theme ? ' is-active' : ''}`}
                onClick={() => settings.update({ boardTheme: theme })}
                aria-pressed={settings.boardTheme === theme}
                data-testid={`palette-${theme}`}
              >
                <span
                  className="lab__palette-swatch"
                  style={{ '--board-bg': boardBackground(theme) } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="small">{BOARD_PALETTES[theme].label}</span>
              </button>
            ))}
          </div>
          <h3>Pieces</h3>
          <div className="row row--between">
            <Segmented<PieceSet>
              ariaLabel="Piece set"
              value={settings.pieceSet}
              onChange={(v) => settings.update({ pieceSet: v })}
              options={(Object.keys(PIECE_SETS) as PieceSet[]).map((set) => ({
                value: set,
                label: PIECE_SETS[set].label,
              }))}
            />
            <Switch
              checked={settings.showCoordinates}
              onChange={(v) => settings.update({ showCoordinates: v })}
              label="Coordinates"
            />
          </div>
          <div
            className="lab__pieces cg-wrap"
            role="img"
            aria-label="Every piece in the current set"
          >
            {(['white', 'black'] as const).map((color) =>
              (['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const).map((role) => (
                <piece
                  key={`${color}-${role}`}
                  className={`${role} ${color}`}
                  title={`${color} ${role}`}
                />
              )),
            )}
          </div>
          <h3>Highlights, arrows and the promotion menu</h3>
          <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
            <Button
              size="sm"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            >
              Flip
            </Button>
            <Button size="sm" onClick={() => setPromotion(true)} data-testid="show-promotion">
              Show the promotion menu
            </Button>
          </div>
          <div className="lab__board">
            <Board
              fen="r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
              orientation={orientation}
              lastMove={['f8', 'c5']}
              check
              viewOnly
              highlights={
                new Map([
                  ['f7', 'hint'],
                  ['d5', 'right'],
                  ['h5', 'wrong'],
                ])
              }
              shapes={[
                { orig: 'c4', dest: 'f7', brush: 'red' },
                { orig: 'f3', dest: 'g5', brush: 'green' },
                { orig: 'e5', brush: 'blue' },
              ]}
              ariaLabel="Test board with highlights and arrows"
              announceMoves={false}
            />
            {promotion ? (
              <PromotionPicker color={orientation} onSelect={() => setPromotion(false)} />
            ) : null}
          </div>
        </Card>

        <Card id="lab-typography" data-testid="lab-typography">
          <h2>Type and colour</h2>
          <div className="lab__swatches">
            {COLOUR_TOKENS.map((token) => (
              <div key={token} className="lab__swatch">
                <span style={{ background: `var(${token})` }} aria-hidden="true" />
                <code>{token}</code>
              </div>
            ))}
          </div>
          <div className="lab__type">
            <p className="lab__type-h1">Heading one</p>
            <p className="lab__type-h2">Heading two</p>
            <p className="lab__type-h3">Heading three</p>
            <p className="lab__type-h4">Heading four</p>
          </div>
          <p>
            Body text with a <a href="#lab-typography">link</a>, <strong>strong</strong>,{' '}
            <em>emphasis</em> and <code>code</code>.
          </p>
          <p className="muted">Muted text for secondary information.</p>
          <p className="small faint">Small, faint text for footnotes.</p>
          <p className="num">Tabular numbers: 1,480 · 0:59 · +0.37</p>
        </Card>

        <Card id="lab-engine" data-testid="lab-engine">
          <h2>Engine</h2>
          <p className="small muted">
            The diagnostics panel from Settings: environment, build and a speed test.
          </p>
          <EngineDiagnostics />
        </Card>

        <Card id="lab-errors" data-testid="lab-errors">
          <h2>Errors</h2>
          <p className="small muted">
            Crashing the page shows the real error screen with its report link and copy button.
            Reload or “Go home” brings the app back; nothing is lost.
          </p>
          <Button variant="danger" onClick={() => setArmed(true)} data-testid="crash">
            Crash this page
          </Button>
          <Bomb armed={armed} />
        </Card>
      </div>
    </div>
  );
}
