import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@/store/settings';
import { chooseEngineBuild } from './build';
import { EngineClient, type EngineOptions, type EngineStatus } from './EngineClient';

export interface UseEngineOptions extends EngineOptions {
  /** Start loading the engine immediately on mount (default true). */
  autoStart?: boolean;
}

export interface UseEngine {
  /** Returns the engine instance, creating it on first use. */
  engine: () => EngineClient;
  status: EngineStatus;
  error: Error | null;
  /** Loads the engine (no-op if already loading/ready; after a failure, starts a fresh one). */
  start: () => Promise<void>;
}

/** Engine options implied by the learner's settings (build and thread count). */
export function engineOptionsFromSettings(): Pick<EngineOptions, 'build' | 'threads'> {
  const { build, threads } = chooseEngineBuild(useSettings.getState().engineThreads);
  return { build, threads };
}

/**
 * Owns one engine instance for the lifetime of the calling component.
 * The worker is terminated on unmount so pages never leak background searches.
 * The build (single- or multi-threaded) follows the settings at creation time.
 */
export function useEngine(options: UseEngineOptions = {}): UseEngine {
  const { autoStart = true, ...engineOptions } = options;
  const ref = useRef<EngineClient | null>(null);
  const optionsRef = useRef<EngineOptions>({ ...engineOptionsFromSettings(), ...engineOptions });
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const engine = useCallback((): EngineClient => {
    ref.current ??= new EngineClient(optionsRef.current);
    return ref.current;
  }, []);

  const start = useCallback(async () => {
    // A failed engine remembers its failure: trying again needs a fresh worker.
    if (ref.current?.status === 'error') {
      ref.current.terminate();
      ref.current = null;
    }
    const instance = engine();
    if (instance.status === 'ready') {
      setStatus('ready');
      return;
    }
    setError(null);
    setStatus('loading');
    try {
      await instance.init();
      if (ref.current === instance) setStatus('ready');
    } catch (err) {
      if (ref.current === instance) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    }
  }, [engine]);

  useEffect(() => {
    if (autoStart) void start();
    return () => {
      ref.current?.terminate();
      ref.current = null;
    };
  }, [autoStart, start]);

  return { engine, status, error, start };
}
