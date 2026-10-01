import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast, useToasts } from '@/components/ui/toastStore';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Returning to the tab checks for a newer build, but not more often than this. */
const MIN_CHECK_GAP_MS = 60 * 1000;

/**
 * Registers the service worker and keeps the app current:
 *  - looks for a newer build on load, every hour, and whenever the app is brought
 *    back into view;
 *  - once one is ready, offers a one-tap reload and otherwise applies it at the
 *    next in-app navigation, a moment when nothing on screen is lost;
 *  - says when the app is fully cached and ready to work offline.
 */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheck = useRef(0);

  const check = useCallback(() => {
    const registration = registrationRef.current;
    if (!registration || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastCheck.current < MIN_CHECK_GAP_MS) return;
    lastCheck.current = now;
    registration.update().catch(() => undefined);
  }, []);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      // Periodically look for a newer build while the tab stays open.
      setInterval(() => check(), CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });

  // Coming back to the app (tab shown again, window focused) looks for a newer build.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  // A waiting update is applied at the next in-app navigation: a page's own state
  // goes away when it unmounts anyway, and everything else lives in persisted
  // stores, so a reload at that moment loses nothing.
  const location = useLocation();
  const pathWhenReady = useRef<string | null>(null);
  useEffect(() => {
    if (!needRefresh) {
      pathWhenReady.current = null;
      return;
    }
    if (pathWhenReady.current === null) {
      pathWhenReady.current = location.pathname;
      return;
    }
    if (pathWhenReady.current !== location.pathname) void updateServiceWorker(true);
  }, [needRefresh, location.pathname, updateServiceWorker]);

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
    const id = toast('A new version is ready. It loads when you next change page.', {
      tone: 'info',
      duration: 0,
      actionLabel: 'Reload now',
      onAction: () => void updateServiceWorker(true),
    });
    return () => {
      useToasts.getState().dismiss(id);
      setNeedRefresh(false);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
