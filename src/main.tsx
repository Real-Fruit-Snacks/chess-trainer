import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
// The default piece set; every other set's stylesheet loads when it is chosen (pieceStyles.ts).
import '@/components/board/pieces/classic.css';
import '@/styles/global.css';
import { setupInstallListeners } from '@/app/pwa';
import { warmUpAudioLater } from '@/lib/audioWarmUp';
import { watchInputModality } from '@/lib/inputModality';
import { createAppRouter } from '@/app/routes';
import { applyColorScheme, applyPieceSet } from '@/app/theme';
import { useSettings } from '@/store/settings';

// Capture the browser's install prompt before React mounts.
setupInstallListeners();
// The sound engine loads on the first tap or key press, not at start-up.
warmUpAudioLater(() => useSettings.getState().sounds);
// Focus rings follow the keyboard, not a script's focus after a click (global.css).
watchInputModality();
// Avoid a flash of the wrong theme.
applyColorScheme(useSettings.getState().colorScheme);
// Start fetching the chosen piece set's stylesheet before the first board renders.
applyPieceSet(useSettings.getState().pieceSet);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
