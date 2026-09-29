import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast, useToasts } from '@/components/ui/toastStore';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker and surfaces two moments to the user:
 *  - the app is fully cached and ready to work offline
 *  - a new version is available (with a one-tap reload)
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Periodically look for a newer build while the tab stays open.
      setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast('Ready to work offline — the whole trainer is now cached on this device.', {
      tone: 'success',
      duration: 5000,
    });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast('A new version is available.', {
      tone: 'info',
      duration: 0,
      actionLabel: 'Reload',
      onAction: () => void updateServiceWorker(true),
    });
    return () => {
      useToasts.getState().dismiss(id);
      setNeedRefresh(false);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
