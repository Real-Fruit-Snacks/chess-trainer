import { useEffect } from 'react';
import { applyPieceSet } from '@/components/board/pieceSets';
import { type ColorScheme, useSettings } from '@/store/settings';
import { siteConfig } from '@/site.config';

/** Applies the chosen colour scheme to <html> and keeps the browser UI colour in sync. */
export function applyColorScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  if (scheme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', scheme);

  const dark =
    scheme === 'dark' ||
    (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = dark ? siteConfig.backgroundColor : siteConfig.themeColor;
}

export function useColorScheme(): void {
  const scheme = useSettings((s) => s.colorScheme);
  useEffect(() => {
    applyColorScheme(scheme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyColorScheme(scheme);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [scheme]);
}

/** Keeps the piece set on <html> in step with the settings. */
export function usePieceSet(): void {
  const pieceSet = useSettings((s) => s.pieceSet);
  useEffect(() => {
    applyPieceSet(pieceSet);
  }, [pieceSet]);
}
