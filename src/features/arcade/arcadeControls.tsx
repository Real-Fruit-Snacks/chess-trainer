import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, ConfirmDialog, Field, Select } from '@/components/ui';
import type { LongColor } from '@/chess/types';
import { ENGINE_LEVELS, getLevel } from '@/engine/levels';
import { handOffToAnalysis } from '@/lib/handoff';
import { useSettings } from '@/store/settings';
import { copyPgn } from './arcadeGame';

/*
 * Controls shared by the arcade games played against the engine, so every
 * game names and orders them the same way as the Play page.
 */

/** The engine's strength, labelled "Engine level" as everywhere else in the app. */
export function EngineLevelField({
  value,
  onChange,
  testId,
  describe = false,
}: {
  value: number;
  onChange: (levelId: number) => void;
  testId?: string;
  /** Show the level's description under the field (not in the cards laid over a board). */
  describe?: boolean;
}) {
  return (
    <Field
      label="Engine level"
      hint={
        describe
          ? `${getLevel(value).description} The rating in brackets is a rough guide, not a measured strength.`
          : undefined
      }
    >
      {(id) => (
        <Select
          id={id}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          data-testid={testId}
        >
          {ENGINE_LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              Level {l.id} · {l.name} (~{l.approxElo})
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Focus mode on or off (Settings → Play): no header and navigation while a game is on. */
export function FocusToggle() {
  const playFocus = useSettings((s) => s.playFocus);
  const update = useSettings((s) => s.update);
  return (
    <Button
      size="sm"
      onClick={() => update({ playFocus: !playFocus })}
      aria-pressed={playFocus}
      title="Hide the header and navigation while a game is on"
      data-testid="focus-toggle"
    >
      Focus
    </Button>
  );
}

/** Hands the game to the analysis board, which opens from the learner's side. */
export function AnalyzeGameButton({
  pgn,
  orientation,
  disabled = false,
  size,
}: {
  /** The game so far, with its headers. */
  pgn: () => string;
  orientation: LongColor;
  disabled?: boolean;
  size?: 'sm';
}) {
  const navigate = useNavigate();
  return (
    <Button
      size={size}
      onClick={() => void navigate(handOffToAnalysis(pgn(), { orientation }))}
      disabled={disabled}
    >
      Analyze game
    </Button>
  );
}

/** "Copy PGN" and "Analyze game" for an arcade game, as under the Play page's move list. */
export function GameExportButtons({
  pgn,
  orientation,
  disabled = false,
}: {
  pgn: () => string;
  orientation: LongColor;
  disabled?: boolean;
}) {
  return (
    <>
      <Button size="sm" onClick={() => void copyPgn(pgn())} disabled={disabled}>
        Copy PGN
      </Button>
      <AnalyzeGameButton pgn={pgn} orientation={orientation} disabled={disabled} size="sm" />
    </>
  );
}

/** The one "Resign this game?" question of the arcade (cancel first, resign last). */
export function ResignDialog({
  open,
  onClose,
  onConfirm,
  children = 'The game will be recorded as a loss.',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Resign this game?"
      confirmLabel="Resign"
      cancelLabel="Keep playing"
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p className="muted">{children}</p>
    </ConfirmDialog>
  );
}
