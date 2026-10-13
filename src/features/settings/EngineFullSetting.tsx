import { useEffect, useState } from 'react';
import { Button, ProgressBar, Switch } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { detectThreadEnvironment, FULL_ENGINE_MB } from '@/engine/build';
import { isBuildDownloaded, removeFullEngine } from '@/engine/fullEngine';
import { useSettings } from '@/store/settings';
import {
  currentEngineDownload,
  detectDownloadPlatform,
  type EngineDownloadProgress,
  fullEngineTarget,
  startEngineDownload,
  stopEngineDownload,
  subscribeToEngineDownload,
} from './fullEngineDownload';

const MB = 1_000_000;

/**
 * The full engine: Stockfish 19 with its large network instead of the lite
 * one. Switching it on downloads it (about 99 MB, kept offline by the service
 * worker); until the download is complete, or wherever it cannot start, the
 * lite engine runs. Switching it off removes the download.
 */
export function EngineFullSetting() {
  const enabled = useSettings((s) => s.engineFull);
  const wantThreads = useSettings((s) => s.engineThreads);
  const update = useSettings((s) => s.update);
  const [progress, setProgress] = useState<EngineDownloadProgress | null>(currentEngineDownload);
  const [platform, setPlatform] = useState(detectDownloadPlatform);
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  const env = detectThreadEnvironment();
  const target = fullEngineTarget(wantThreads, env, platform);
  const build = target.kind === 'ready' ? target.build : null;

  useEffect(() => subscribeToEngineDownload(() => setProgress(currentEngineDownload())), []);

  // The service worker can take over shortly after the first load.
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    const onChange = () => setPlatform(detectDownloadPlatform());
    sw?.addEventListener('controllerchange', onChange);
    return () => sw?.removeEventListener('controllerchange', onChange);
  }, []);

  // Is the build this device would run already here? Asked again when a download ends.
  const downloading = progress !== null;
  useEffect(() => {
    if (!build || downloading) return;
    let cancelled = false;
    void isBuildDownloaded(build).then((stored) => {
      if (!cancelled) setDownloaded(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [build, downloading, enabled]);

  const download = () => {
    if (build) startEngineDownload(build, (stored) => setDownloaded(stored));
  };

  const toggle = async (next: boolean) => {
    update({ engineFull: next });
    if (next) {
      if (!build) return;
      const stored = await isBuildDownloaded(build);
      setDownloaded(stored);
      if (!stored) download();
      return;
    }
    stopEngineDownload();
    const removed = await removeFullEngine();
    setDownloaded(false);
    toast(
      removed
        ? `The full engine was removed from this device (${FULL_ENGINE_MB} MB freed): every page that starts the engine from now on uses the lite one.`
        : 'Every page that starts the engine from now on uses the lite one.',
      { tone: 'info' },
    );
  };

  const phone = env.mobile
    ? ' On a phone it may not have the memory to start; the lite engine takes over if so.'
    : '';

  let status: string;
  if (!enabled) {
    status = `Off — the lite engine runs, with Stockfish’s small network. Switching this on downloads the large one once (${FULL_ENGINE_MB} MB) and keeps it offline.`;
  } else if (progress) {
    status = `Downloading the full engine: ${Math.round(progress.received / MB)} of ${Math.round((progress.total || FULL_ENGINE_MB * MB) / MB)} MB. The lite engine runs until it is done.`;
  } else if (target.kind === 'unsupported') {
    status =
      'This browser cannot keep files offline for the app, so the full engine cannot be stored; the lite engine runs.';
  } else if (target.kind === 'needs-worker') {
    status =
      'Available once the app is ready to work offline: reload the app, then come back here to download it.';
  } else if (target.kind === 'needs-reload') {
    status =
      'Reload the app first, so the threaded full engine is the one downloaded. If this stays after a reload, the browser cannot run threads: switch them off to download the one-thread build.';
  } else if (downloaded === null) {
    status = 'Checking whether it is downloaded…';
  } else if (downloaded) {
    status = `Downloaded — every page that starts the engine from now on uses it.${phone}`;
  } else {
    status = `Not downloaded yet — the lite engine runs until it is.${phone}`;
  }

  return (
    <div className="settings__threads" data-testid="engine-full">
      <Switch
        checked={enabled}
        onChange={(v) => void toggle(v)}
        label={`Full engine (${FULL_ENGINE_MB} MB download)`}
        description="Stockfish 19 with its large network instead of the lite one: noticeably stronger in deep, sharp positions, which analysis and game review gain most from."
      />
      {progress ? (
        <ProgressBar
          value={progress.received}
          max={progress.total || FULL_ENGINE_MB * MB}
          label="Full engine download"
          valueText={`${Math.round(progress.received / MB)} of ${Math.round((progress.total || FULL_ENGINE_MB * MB) / MB)} MB`}
        />
      ) : null}
      <div className="settings__row" style={{ paddingLeft: 0 }}>
        <span className="small muted" data-testid="engine-full-status">
          {status}
        </span>
        {progress ? (
          <Button size="sm" variant="ghost" onClick={stopEngineDownload}>
            Stop
          </Button>
        ) : enabled && build && downloaded === false ? (
          <Button size="sm" onClick={download} data-testid="engine-full-download">
            Download ({FULL_ENGINE_MB} MB)
          </Button>
        ) : null}
      </div>
    </div>
  );
}
