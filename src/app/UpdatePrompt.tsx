import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast, useToasts } from '@/components/ui/toastStore';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Returning to the tab checks for a newer build, but not more often than this. */
const MIN_CHECK_GAP_MS = 60 * 1000;

/** What the "ready offline" toast says: the precache, not every puzzle chunk. */
export const OFFLINE_READY_MESSAGE =
  'Ready to work offline — the app and the first puzzles are now cached on this device.';

/**
 * Registers the service worker and keeps the app current:
 *  - looks for a newer build on load, every hour, and whenever the app is brought
 *    back into view;
 *  - once one is ready, offers a one-tap reload and otherwise applies it at the
 *    next in-app navigation, a moment when nothing on screen is lost;
 *  - reloads this tab, and only this tab, once the new worker has taken over —
 *    other tabs with a game in progress are left alone and pick the update up
 *    at their own next navigation;
 *  - says when the app is cached and ready to work offline.
 */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheck = useRef(0);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  /** This tab asked for the update: the reload on `controllerchange` is ours. */
  const requested = useRef(false);
  const reloaded = useRef(false);

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
      if (interval.current) clearInterval(interval.current);
      interval.current = setInterval(() => check(), CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
    // The plugin would reload every tab whose prompt was shown; the reload is
    // handled below instead, for the tab that asked.
    onNeedReload() {
      // Nothing here: see the `controllerchange` listener.
    },
  });

  useEffect(
    () => () => {
      if (interval.current) clearInterval(interval.current);
    },
    [],
  );

  /** Tells the waiting worker to take over, and marks the reload as this tab's. */
  const applyUpdate = useCallback(() => {
    requested.current = true;
    void updateServiceWorker(true);
  }, [updateServiceWorker]);

  // The new worker is in control (whether or not this page was controlled when
  // it registered, which is what the plugin's own reload depends on): reload
  // once, if this tab asked for it.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onControllerChange = () => {
      if (!requested.current || reloaded.current) return;
      reloaded.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

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
    if (pathWhenReady.current !== location.pathname) applyUpdate();
  }, [needRefresh, location.pathname, applyUpdate]);

  useEffect(() => {
    if (!offlineReady) return;
    toast(OFFLINE_READY_MESSAGE, { tone: 'success', duration: 5000 });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast('A new version is ready. It loads when you next change page.', {
      tone: 'info',
      duration: 0,
      actionLabel: 'Reload now',
      onAction: applyUpdate,
    });
    return () => {
      useToasts.getState().dismiss(id);
      setNeedRefresh(false);
    };
  }, [needRefresh, setNeedRefresh, applyUpdate]);

  return null;
}
