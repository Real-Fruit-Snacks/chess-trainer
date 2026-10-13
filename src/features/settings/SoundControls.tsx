import { useEffect, useRef } from 'react';
import { Segmented, Slider } from '@/components/ui';
import { playSound } from '@/lib/sound';
import { type SoundTheme, useSettings } from '@/store/settings';

const SOUND_THEME_OPTIONS: { value: SoundTheme; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'soft', label: 'Soft' },
  { value: 'retro', label: 'Retro' },
];

/** Standard, Soft or Retro; a move plays in the new theme as a preview. */
export function SoundThemePicker() {
  const theme = useSettings((s) => s.soundTheme);
  const update = useSettings((s) => s.update);
  return (
    <Segmented
      ariaLabel="Sound theme"
      value={theme}
      onChange={(v) => {
        update({ soundTheme: v });
        playSound('move');
      }}
      options={SOUND_THEME_OPTIONS}
    />
  );
}

/**
 * The master volume in steps of 5 %. A move plays at the new level once the
 * slider has settled, so a drag previews the result without a burst of clicks.
 */
export function VolumeSlider({ className }: { className?: string }) {
  const volume = useSettings((s) => s.soundVolume);
  const update = useSettings((s) => s.update);
  const preview = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(preview.current), []);
  return (
    <Slider
      label="Volume"
      value={Math.round(volume * 100)}
      min={0}
      max={100}
      step={5}
      format={(v) => `${v}%`}
      onChange={(v) => {
        update({ soundVolume: v / 100 });
        window.clearTimeout(preview.current);
        preview.current = window.setTimeout(() => playSound('move'), 150);
      }}
      className={className}
      data-testid="volume-slider"
    />
  );
}
