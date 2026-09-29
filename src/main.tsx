import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import '@/styles/global.css';
import { setupInstallListeners } from '@/app/pwa';
import { createAppRouter } from '@/app/routes';
import { applyColorScheme } from '@/app/theme';
import { useSettings } from '@/store/settings';

// Capture the browser's install prompt before React mounts.
setupInstallListeners();
// Avoid a flash of the wrong theme.
applyColorScheme(useSettings.getState().colorScheme);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
