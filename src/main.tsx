import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@/components/board/pieces-classic.css';
import '@/components/board/pieces-modern.css';
import '@/components/board/pieces-pixel.css';
import '@/components/board/pieces-letters.css';
import '@/styles/global.css';
import { setupInstallListeners } from '@/app/pwa';
import { warmUpAudio } from '@/lib/sound';
import { createAppRouter } from '@/app/routes';
import { applyColorScheme } from '@/app/theme';
import { useSettings } from '@/store/settings';

// Capture the browser's install prompt before React mounts.
setupInstallListeners();
warmUpAudio();
// Avoid a flash of the wrong theme.
applyColorScheme(useSettings.getState().colorScheme);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
